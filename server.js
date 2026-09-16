const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const youtubeAudio = require('./youtubeAudio');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  // ⚡ Low latency configuration
  pingInterval: 10000,        // Ping every 10s (reduce traffic)
  pingTimeout: 5000,          // Timeout after 5s
  upgradeTimeout: 3000,       // Faster WebSocket upgrade
  maxHttpBufferSize: 1e6,     // 1MB buffer (reduced from default)
  transports: ['websocket', 'polling'],  // Prefer WebSocket
  allowUpgrades: true,
  perMessageDeflate: false    // ⚡ DISABLE compression for low latency
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Lưu trữ thông tin phòng và người dùng
const rooms = new Map();
const users = new Map(); // socketId -> user info
const privateMessages = new Map(); // userId -> messages

// Admin configuration
const ADMIN_PASSWORD = 'admin123'; // Có thể thay đổi

// ============================================================================
// 🕐 TIMESTAMP UTILITY
// ============================================================================
function getFormattedTime() {
    return new Date().toLocaleTimeString('vi-VN');
}

// ============================================================================
// 🚀 SERVER-SIDE VIDEO SYNC STATE MANAGER (Source of Truth)
// ============================================================================
class ServerVideoStateManager {
    constructor() {
        this.roomStates = new Map();
    }
    
    initializeRoom(roomId) {
        if (!this.roomStates.has(roomId)) {
            this.roomStates.set(roomId, {
                isPlaying: false,
                currentTime: 0,
                lastUpdate: Date.now(),
                playbackRate: 1,
                videoId: null,
                audioTrack: null,
                lastController: null
            });
        }
        return this.roomStates.get(roomId);
    }
    
    updateState(roomId, state, socketId) {
        const roomState = this.roomStates.get(roomId);
        if (!roomState) return null;
        
        const updatedState = {
            ...roomState,
            ...state,
            lastUpdate: Date.now(),
            lastController: socketId
        };
        
        this.roomStates.set(roomId, updatedState);
        return updatedState;
    }
    
    getCurrentState(roomId) {
        const state = this.roomStates.get(roomId);
        if (!state) return null;
        
        // Time prediction for accurate sync
        if (state.isPlaying) {
            const timeSinceUpdate = (Date.now() - state.lastUpdate) / 1000;
            return {
                ...state,
                currentTime: state.currentTime + (timeSinceUpdate * (state.playbackRate || 1)),
                lastUpdate: Date.now()
            };
        }
        
        return state;
    }
    
    deleteRoom(roomId) {
        this.roomStates.delete(roomId);
    }
}

const serverStateManager = new ServerVideoStateManager();

// Route chính
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================================
// 🎵 YOUTUBE AUDIO TRACK API ENDPOINTS
// ============================================================================

// Xử lý Favicon tránh lỗi 404 trên browser
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Lấy danh sách audio tracks của YouTube video
app.get('/api/youtube/audio-tracks', async (req, res) => {
  try {
    const videoParam = req.query.url || req.query.videoId;
    if (!videoParam) {
      return res.status(400).json({
        success: false,
        error: 'Vui lòng cung cấp tham số "url" hoặc "videoId"',
        code: youtubeAudio.ERROR_CODES.ERR_INVALID_YOUTUBE_URL
      });
    }

    const data = await youtubeAudio.extractAudioTracks(videoParam);
    res.json({
      success: true,
      ...data
    });
  } catch (err) {
    console.warn(`[audio-tracks] Không thể trích xuất audio tracks cho "${req.query.videoId || req.query.url}": ${err.message}`);
    // Trả về danh sách rỗng êm dịu thay vì 500 để client tự động dùng audio mặc định
    res.json({
      success: true,
      videoId: req.query.videoId || null,
      tracks: [],
      tracksCount: 0,
      defaultTrackId: 'default',
      message: 'Chỉ có audio mặc định từ video gốc'
    });
  }
});

// Stream audio track độc lập (hỗ trợ HTTP Range requests)
app.get('/api/youtube/audio-stream', async (req, res) => {
  try {
    const { videoId, url, itag, trackId, quality, language } = req.query;

    if (url) {
      return youtubeAudio.streamAudioTrack(url, req, res);
    }

    if (!videoId) {
      return res.status(400).json({
        error: 'Thiếu tham số videoId hoặc url để stream audio',
        code: youtubeAudio.ERROR_CODES.ERR_INVALID_YOUTUBE_URL
      });
    }

    let streamUrl = null;
    let selectedTrack = null;

    try {
      const tracksData = await youtubeAudio.extractAudioTracks(videoId);
      const selection = youtubeAudio.selectAudioTrack(tracksData.tracks, {
        trackId,
        itag,
        quality,
        language
      });
      selectedTrack = selection.selectedTrack;
      if (selectedTrack && selectedTrack.url && !youtubeAudio.isStreamUrlExpired(selectedTrack.url)) {
        streamUrl = selectedTrack.url;
      }
    } catch (e) {
      // Nếu extract thất bại hoặc không có sẵn URL, tiếp tục resolve bên dưới
    }

    // Nếu chưa có direct URL (như các video đa ngôn ngữ MrBeast), phân giải qua resolveAudioStreamUrl
    if (!streamUrl) {
      streamUrl = await youtubeAudio.resolveAudioStreamUrl(videoId, {
        trackId,
        itag,
        language,
        selectedTrack
      });
    }

    if (!streamUrl) {
      return res.status(404).json({
        error: 'Không tìm thấy URL audio stream phù hợp',
        code: youtubeAudio.ERROR_CODES.ERR_NO_AUDIO_TRACKS
      });
    }

    youtubeAudio.streamAudioTrack(streamUrl, req, res);
  } catch (err) {
    console.error('Lỗi stream audio:', err);
    res.status(500).json({
      error: err.message,
      code: err.code || 'ERR_STREAM_FAILED'
    });
  }
});

// Ghép video và audio stream qua ffmpeg (nếu có yêu cầu kết hợp stream riêng)
app.get('/api/youtube/merged-stream', (req, res) => {
  const { videoUrl, audioUrl } = req.query;
  if (!videoUrl || !audioUrl) {
    return res.status(400).json({ error: 'Thiếu videoUrl hoặc audioUrl' });
  }
  youtubeAudio.mergeAudioVideoStreams(videoUrl, audioUrl, res);
});

// Socket.IO xử lý kết nối
io.on('connection', (socket) => {

  // Tham gia phòng
  socket.on('join-room', (data) => {
    const { roomId, username, adminPassword } = data;
    socket.join(roomId);
    socket.username = username;
    socket.roomId = roomId;
    
    // Kiểm tra quyền admin
    socket.isAdmin = adminPassword === ADMIN_PASSWORD;

    // Lưu thông tin user
    users.set(socket.id, {
      id: socket.id,
      username: username,
      roomId: roomId,
      joinTime: Date.now()
    });

    // Khởi tạo phòng nếu chưa tồn tại
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: new Map(),
        currentVideo: null,
        currentAudioTrack: null,
        videoState: {
          isPlaying: false,
          currentTime: 0,
          lastUpdate: Date.now()
        },
        videoQueue: [], // Hàng đợi video
        adminId: null, // ID của admin hiện tại
        isLiveMode: false // Chế độ phát trực tiếp
      });
    }

    const room = rooms.get(roomId);
    room.users.set(socket.id, {
      id: socket.id,
      username: username,
      joinTime: Date.now(),
      isAdmin: socket.isAdmin
    });

    // Đặt admin đầu tiên
    if (socket.isAdmin && !room.adminId) {
      room.adminId = socket.id;
      room.isLiveMode = true;
    }

    // Gửi thông tin video hiện tại cho người dùng mới
    if (room.currentVideo) {
      socket.emit('video-loaded', {
        videoId: room.currentVideo,
        state: room.videoState,
        audioTrack: room.currentAudioTrack
      });
    }

    // Thông báo người dùng tham gia
    const joinMessage = socket.isAdmin ? 
      `👑 Admin ${username} đã tham gia phòng` : 
      `${username} đã tham gia phòng`;
    
    socket.to(roomId).emit('user-joined', {
      username: socket.isAdmin ? `👑 ${username}` : username,
      message: joinMessage
    });

    // ✅ Initialize server state manager
    serverStateManager.initializeRoom(roomId);
    const currentState = serverStateManager.getCurrentState(roomId);
    if (currentState && currentState.videoId) {
      socket.emit('video-loaded', {
        videoId: currentState.videoId,
        state: currentState,
        audioTrack: room.currentAudioTrack || currentState.audioTrack
      });
    }
    
    // Gửi thông tin phòng cho user mới
    socket.emit('room-info', {
      isAdmin: socket.isAdmin,
      adminId: room.adminId,
      isLiveMode: room.isLiveMode,
      videoQueue: room.videoQueue,
      currentAudioTrack: room.currentAudioTrack
    });

    // Gửi danh sách người dùng online
    const usersList = Array.from(room.users.values());
    io.to(roomId).emit('users-list', usersList);
    io.to(roomId).emit('user-count', room.users.size);
    io.to(roomId).emit('admin-status', {
      adminId: room.adminId,
      isLiveMode: room.isLiveMode
    });

  });

  // Xử lý tin nhắn chat
  socket.on('chat-message', (data) => {
    const { message, roomId, messageType = 'text' } = data;
    const chatData = {
      id: Date.now() + Math.random(),
      username: socket.username,
      message: message,
      messageType: messageType,
      timestamp: getFormattedTime(),
      userId: socket.id
    };
    
    io.to(roomId).emit('chat-message', chatData);
  });

  // ⚡ OPTIMIZED: Compact chat message (cm = chat-message)
  // Format: [username, message, type, timestamp]
  // type: 0=text, 1=file, 2=system
  socket.on('cm', (data) => {
    const [message, type = 0] = data;
    const chatData = {
      id: Date.now(),
      username: socket.username,
      message: message,
      messageType: type === 0 ? 'text' : (type === 1 ? 'file' : 'system'),
      timestamp: getFormattedTime(),
      userId: socket.id
    };
    
    io.to(socket.roomId).emit('chat-message', chatData);
  });

  // Xử lý tin nhắn riêng
  socket.on('private-message', (data) => {
    const { message, targetUserId, roomId } = data;
    const targetSocket = io.sockets.sockets.get(targetUserId);
    
    if (targetSocket) {
      const pmData = {
        id: Date.now() + Math.random(),
        from: socket.username,
        fromId: socket.id,
        message: message,
        timestamp: getFormattedTime(),
        isPrivate: true
      };
      
      // Gửi cho người nhận
      targetSocket.emit('private-message', pmData);
      // Gửi lại cho người gửi để hiển thị
      socket.emit('private-message', {
        ...pmData,
        to: targetSocket.username,
        toId: targetUserId
      });
    }
  });

  // Xử lý file sharing
  socket.on('file-share', (data) => {
    const { fileData, fileName, fileSize, fileType, roomId } = data;
    
    const fileMessage = {
      id: Date.now() + Math.random(),
      username: socket.username,
      messageType: 'file',
      fileData: {
        name: fileName,
        size: fileSize,
        type: fileType,
        data: fileData
      },
      timestamp: getFormattedTime(),
      userId: socket.id
    };
    
    io.to(roomId).emit('chat-message', fileMessage);
  });

  // Lấy danh sách người dùng
  socket.on('get-users-list', () => {
    const room = rooms.get(socket.roomId);
    if (room) {
      const usersList = Array.from(room.users.values());
      socket.emit('users-list', usersList);
    }
  });

  // Xử lý thay đổi video YouTube
  socket.on('change-video', (data) => {
    const { videoId, roomId, videoTitle } = data;
    const room = rooms.get(roomId);
    
    if (room) {
      if (socket.isAdmin && room.adminId === socket.id) {
        // Admin có thể phát ngay lập tức
        room.currentVideo = videoId;
        room.currentAudioTrack = null;
        room.videoState = {
          isPlaying: false,
          currentTime: 0,
          lastUpdate: Date.now()
        };
        
        // Thông báo tất cả người dùng trong phòng
        io.to(roomId).emit('video-changed', { videoId });
        
        // Gửi tin nhắn hệ thống
        io.to(roomId).emit('chat-message', {
          username: 'Hệ thống',
          message: `👑 Admin ${socket.username} đã phát video: ${videoTitle || 'Video mới'}`,
          timestamp: getFormattedTime(),
          isSystem: true
        });
      } else {
        // User thường thêm vào queue
        const queueItem = {
          id: Date.now() + Math.random(),
          videoId: videoId,
          title: videoTitle || 'Video không có tiêu đề',
          requestedBy: socket.username,
          requestedAt: getFormattedTime()
        };
        
        room.videoQueue.push(queueItem);
        
        // Thông báo queue đã được cập nhật
        io.to(roomId).emit('queue-updated', room.videoQueue);
        
        // Gửi tin nhắn hệ thống
        io.to(roomId).emit('chat-message', {
          username: 'Hệ thống',
          message: `📋 ${socket.username} đã thêm video vào hàng đợi: ${videoTitle || 'Video mới'}`,
          timestamp: getFormattedTime(),
          isSystem: true
        });
      }
    }
  });

  // Admin điều khiển queue
  socket.on('admin-play-from-queue', (data) => {
    const { queueItemId, roomId } = data;
    const room = rooms.get(roomId);
    
    if (room && socket.isAdmin && room.adminId === socket.id) {
      const queueIndex = room.videoQueue.findIndex(item => item.id === queueItemId);
      if (queueIndex !== -1) {
        const queueItem = room.videoQueue[queueIndex];
        
        // Phát video từ queue
        room.currentVideo = queueItem.videoId;
        room.currentAudioTrack = null;
        room.videoState = {
          isPlaying: false,
          currentTime: 0,
          lastUpdate: Date.now()
        };
        
        // Xóa khỏi queue
        room.videoQueue.splice(queueIndex, 1);
        
        // Thông báo
        io.to(roomId).emit('video-changed', { videoId: queueItem.videoId });
        io.to(roomId).emit('queue-updated', room.videoQueue);
        
        io.to(roomId).emit('chat-message', {
          username: 'Hệ thống',
          message: `👑 Admin đã phát video từ hàng đợi: ${queueItem.title} (yêu cầu bởi ${queueItem.requestedBy})`,
          timestamp: getFormattedTime(),
          isSystem: true
        });
      }
    }
  });

  // Admin xóa video khỏi queue
  socket.on('admin-remove-from-queue', (data) => {
    const { queueItemId, roomId } = data;
    const room = rooms.get(roomId);
    
    if (room && socket.isAdmin && room.adminId === socket.id) {
      const queueIndex = room.videoQueue.findIndex(item => item.id === queueItemId);
      if (queueIndex !== -1) {
        const removedItem = room.videoQueue.splice(queueIndex, 1)[0];
        
        io.to(roomId).emit('queue-updated', room.videoQueue);
        io.to(roomId).emit('chat-message', {
          username: 'Hệ thống',
          message: `👑 Admin đã xóa video khỏi hàng đợi: ${removedItem.title}`,
          timestamp: getFormattedTime(),
          isSystem: true
        });
      }
    }
  });

  // Đồng bộ trạng thái video (chỉ admin mới có thể điều khiển)
  socket.on('video-state-change', (data) => {
    const { state, roomId } = data;
    const room = rooms.get(roomId);
    
    if (!room) return;
    
    if (room.isLiveMode) {
      // Chỉ admin mới có thể điều khiển video trong live mode
      if (socket.isAdmin && room.adminId === socket.id) {
        room.videoState = {
          ...state,
          lastUpdate: Date.now(),
          adminId: socket.id
        };
        
        // ✅ Update server state manager
        const updatedState = serverStateManager.updateState(roomId, state, socket.id);
        
        // Gửi trạng thái đến tất cả người dùng khác với force sync
        if (updatedState) {
          socket.to(roomId).emit('video-state-sync', {
            ...updatedState,
            forceSync: true,
            adminControl: true
          });
        }
      }
    } else {
      // Chế độ bình thường - ai cũng có thể điều khiển
      room.videoState = {
        ...state,
        lastUpdate: Date.now()
      };
      
      // ✅ Update server state manager
      const updatedState = serverStateManager.updateState(roomId, state, socket.id);
      
      if (updatedState) {
        socket.to(roomId).emit('video-state-sync', updatedState);
      }
    }
  });
  
  // ✅ NEW: Handle sync requests from clients (drift correction)
  socket.on('request-sync', (data) => {
    const { roomId } = data;
    const currentState = serverStateManager.getCurrentState(roomId);
    
    if (currentState) {
      socket.emit('sync-response', currentState);
    }
  });

  // ⚡ OPTIMIZED: Compact video sync (vs = video-sync)
  // Format: [state, time] where state: 0=paused, 1=playing, 2=buffering, 3=ended
  socket.on('vs', (data) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    
    // Parse compact format: [state, time]
    const [state, time] = data;
    
    if (room.isLiveMode) {
      // Only admin can control in live mode
      if (socket.isAdmin && room.adminId === socket.id) {
        // Update room state
        room.videoState = {
          isPlaying: state === 1,
          currentTime: time,
          playerState: state,
          lastUpdate: Date.now()
        };
        
        // ⚡ VOLATILE: Skip old packets if network is lagging
        socket.to(socket.roomId).volatile.emit('vs', data);
      }
    } else {
      // Normal mode - anyone can control
      room.videoState = {
        isPlaying: state === 1,
        currentTime: time,
        playerState: state,
        lastUpdate: Date.now()
      };
      
      // ⚡ VOLATILE for smooth sync
      socket.to(socket.roomId).volatile.emit('vs', data);
    }
  });

  // Admin yêu cầu force sync tất cả users
  socket.on('admin-force-sync', (data) => {
    const { roomId } = data;
    const room = rooms.get(roomId);
    
    if (room && socket.isAdmin && room.adminId === socket.id && room.isLiveMode) {
      // Gửi trạng thái hiện tại đến tất cả users
      socket.to(roomId).emit('video-state-sync', {
        ...room.videoState,
        forceSync: true,
        adminControl: true
      });
    }
  });

  // Admin bật/tắt live mode
  socket.on('toggle-live-mode', (data) => {
    const { roomId } = data;
    const room = rooms.get(roomId);
    
    if (room && socket.isAdmin && room.adminId === socket.id) {
      room.isLiveMode = !room.isLiveMode;
      
      io.to(roomId).emit('admin-status', {
        adminId: room.adminId,
        isLiveMode: room.isLiveMode
      });
      
      const modeText = room.isLiveMode ? 'BẬT' : 'TẮT';
      io.to(roomId).emit('chat-message', {
        username: 'Hệ thống',
        message: `👑 Admin đã ${modeText} chế độ phát trực tiếp`,
        timestamp: getFormattedTime(),
        isSystem: true
      });
    }
  });

  // Đồng bộ thay đổi phụ đề (captions)
  socket.on('caption-change', (data) => {
    const { roomId } = data;
    if (roomId) {
      socket.to(roomId).emit('caption-change', data);
    }
  });

  // Đồng bộ tốc độ phát video (playback speed)
  socket.on('playback-speed-change', (data) => {
    const { roomId } = data;
    if (roomId) {
      socket.to(roomId).emit('playback-speed-change', data);
    }
  });

  // Đồng bộ thay đổi audio track
  socket.on('audio-track-change', (data) => {
    const { roomId, trackId, itag, language, displayName, codec, bitrateKbps } = data;
    const room = rooms.get(roomId);
    if (!room) return;

    // Trong live mode, chỉ admin mới đổi được cho cả phòng
    const canControl = !room.isLiveMode || (socket.isAdmin && room.adminId === socket.id);
    
    if (canControl) {
      const audioTrackData = {
        trackId: trackId || 'default',
        itag: itag || null,
        language: language || null,
        displayName: displayName || 'Mặc định',
        codec: codec || null,
        bitrateKbps: bitrateKbps || null,
        selectedBy: socket.username,
        timestamp: getFormattedTime()
      };

      room.currentAudioTrack = audioTrackData;
      serverStateManager.updateState(roomId, { audioTrack: audioTrackData }, socket.id);

      // Thông báo cho tất cả users trong phòng
      io.to(roomId).emit('audio-track-changed', audioTrackData);

      io.to(roomId).emit('chat-message', {
        username: 'Hệ thống',
        message: `🎵 ${socket.isAdmin ? '👑 Admin ' : ''}${socket.username} đã chọn audio track: ${audioTrackData.displayName}`,
        timestamp: getFormattedTime(),
        isSystem: true
      });
    }
  });

  // Xử lý ngắt kết nối
  socket.on('disconnect', () => {
    if (socket.roomId && socket.username) {
      const room = rooms.get(socket.roomId);
      if (room) {
        // Kiểm tra nếu admin rời khỏi phòng
        const isAdminLeaving = socket.isAdmin && room.adminId === socket.id;
        
        room.users.delete(socket.id);
        
        if (isAdminLeaving) {
          // Admin đã rời khỏi phòng - đưa tất cả user về trang chủ
          
          // Gửi thông báo đến tất cả user còn lại trong phòng
          socket.to(socket.roomId).emit('admin-left-room', {
            message: `👑 Admin ${socket.username} đã rời khỏi phòng. Bạn sẽ được chuyển về trang chủ.`,
            adminUsername: socket.username
          });
          
          // Reset room state
          room.adminId = null;
          room.isLiveMode = false;
          room.currentVideo = null;
          room.videoQueue = [];
          
          // Xóa phòng sau khi gửi thông báo
          setTimeout(() => {
            rooms.delete(socket.roomId);
          }, 1000);
          
        } else {
          // User thường rời khỏi phòng
          socket.to(socket.roomId).emit('user-left', {
            username: socket.username,
            message: `${socket.username} đã rời khỏi phòng`
          });

          // Cập nhật danh sách và số lượng người dùng
          const usersList = Array.from(room.users.values());
          io.to(socket.roomId).emit('users-list', usersList);
          io.to(socket.roomId).emit('user-count', room.users.size);

          // Xóa phòng nếu không còn ai
          if (room.users.size === 0) {
            rooms.delete(socket.roomId);
            serverStateManager.deleteRoom(socket.roomId); // ✅ Cleanup server state
          }
        }
      }
      
      // Xóa thông tin user
      users.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server đang chạy trên port ${PORT}`);
  console.log(`Truy cập ứng dụng tại: http://localhost:${PORT}`);
});
