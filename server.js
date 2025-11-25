const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  // Tối ưu hóa cho streaming real-time
  pingInterval: 10000, // 10s thay vì 25s mặc định
  pingTimeout: 5000, // 5s thay vì 20s mặc định
  transports: ['websocket', 'polling'], // Ưu tiên websocket
  allowUpgrades: true,
  perMessageDeflate: {
    threshold: 1024 // Nén messages > 1KB
  },
  httpCompression: true,
  // Tăng buffer size
  maxHttpBufferSize: 1e8, // 100MB
  // Giảm latency
  connectTimeout: 45000,
  // Upgrade timeout
  upgradeTimeout: 10000
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

// Route chính
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO xử lý kết nối
io.on('connection', (socket) => {
  console.log('Người dùng kết nối:', socket.id);

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
        state: room.videoState
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

    // Gửi thông tin phòng cho user mới
    socket.emit('room-info', {
      isAdmin: socket.isAdmin,
      adminId: room.adminId,
      isLiveMode: room.isLiveMode,
      videoQueue: room.videoQueue
    });

    // Gửi danh sách người dùng online
    const usersList = Array.from(room.users.values());
    io.to(roomId).emit('users-list', usersList);
    io.to(roomId).emit('user-count', room.users.size);
    io.to(roomId).emit('admin-status', {
      adminId: room.adminId,
      isLiveMode: room.isLiveMode
    });

    console.log(`${socket.isAdmin ? '👑 Admin' : ''} ${username} tham gia phòng ${roomId}`);
  });

  // Xử lý tin nhắn chat
  socket.on('chat-message', (data) => {
    const { message, roomId, messageType = 'text' } = data;
    const chatData = {
      id: Date.now() + Math.random(),
      username: socket.username,
      message: message,
      messageType: messageType,
      timestamp: new Date().toLocaleTimeString('vi-VN'),
      userId: socket.id
    };
    
    io.to(roomId).emit('chat-message', chatData);
    console.log(`Chat trong phòng ${roomId}: ${socket.username}: ${message}`);
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
        timestamp: new Date().toLocaleTimeString('vi-VN'),
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
      
      console.log(`Private message: ${socket.username} -> ${targetSocket.username}: ${message}`);
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
      timestamp: new Date().toLocaleTimeString('vi-VN'),
      userId: socket.id
    };
    
    io.to(roomId).emit('chat-message', fileMessage);
    console.log(`File shared trong phòng ${roomId}: ${socket.username} - ${fileName}`);
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
          timestamp: new Date().toLocaleTimeString('vi-VN'),
          isSystem: true
        });
      } else {
        // User thường thêm vào queue
        const queueItem = {
          id: Date.now() + Math.random(),
          videoId: videoId,
          title: videoTitle || 'Video không có tiêu đề',
          requestedBy: socket.username,
          requestedAt: new Date().toLocaleTimeString('vi-VN')
        };
        
        room.videoQueue.push(queueItem);
        
        // Thông báo queue đã được cập nhật
        io.to(roomId).emit('queue-updated', room.videoQueue);
        
        // Gửi tin nhắn hệ thống
        io.to(roomId).emit('chat-message', {
          username: 'Hệ thống',
          message: `📋 ${socket.username} đã thêm video vào hàng đợi: ${videoTitle || 'Video mới'}`,
          timestamp: new Date().toLocaleTimeString('vi-VN'),
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
          timestamp: new Date().toLocaleTimeString('vi-VN'),
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
          timestamp: new Date().toLocaleTimeString('vi-VN'),
          isSystem: true
        });
      }
    }
  });

  // Throttle map để tránh spam
  const stateChangeThrottle = new Map();
  
  // Đồng bộ trạng thái video (chỉ admin mới có thể điều khiển)
  socket.on('video-state-change', (data) => {
    const { state, roomId } = data;
    const room = rooms.get(roomId);
    
    if (!room) return;
    
    // Throttle để tránh quá nhiều updates
    const throttleKey = `${socket.id}_${roomId}`;
    const lastUpdate = stateChangeThrottle.get(throttleKey) || 0;
    const now = Date.now();
    
    // Cho phép update nếu là play/pause hoặc đã qua 100ms
    const isPlayPauseChange = room.videoState && 
                              room.videoState.isPlaying !== state.isPlaying;
    
    if (!isPlayPauseChange && (now - lastUpdate) < 100) {
      return; // Throttle
    }
    
    stateChangeThrottle.set(throttleKey, now);
    
    if (room.isLiveMode) {
      // Chỉ admin mới có thể điều khiển video trong live mode
      if (socket.isAdmin && room.adminId === socket.id) {
        room.videoState = {
          ...state,
          lastUpdate: now,
          adminId: socket.id
        };
        
        // Gửi trạng thái đến tất cả người dùng khác với force sync
        // Sử dụng volatile để tăng performance (bỏ qua nếu connection chậm)
        socket.volatile.to(roomId).emit('video-state-sync', {
          ...state,
          forceSync: true,
          adminControl: true
        });
      }
    } else {
      // Chế độ bình thường - ai cũng có thể điều khiển
      room.videoState = {
        ...state,
        lastUpdate: now
      };
      
      socket.volatile.to(roomId).emit('video-state-sync', state);
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
  
  // Sync playback rate
  socket.on('playback-rate-change', (data) => {
    const { rate, roomId } = data;
    const room = rooms.get(roomId);
    
    if (room && socket.isAdmin && room.adminId === socket.id && room.isLiveMode) {
      socket.to(roomId).emit('playback-rate-sync', { rate });
    }
  });
  
  // Ping/pong for latency monitoring
  socket.on('ping', () => {
    socket.emit('pong');
  });
  
  // Request sync
  socket.on('request-sync', (data) => {
    const { roomId } = data;
    const room = rooms.get(roomId);
    
    if (room && room.videoState) {
      socket.emit('video-state-sync', {
        ...room.videoState,
        forceSync: true
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
        timestamp: new Date().toLocaleTimeString('vi-VN'),
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
          console.log(`👑 Admin ${socket.username} đã rời khỏi phòng ${socket.roomId} - chuyển hướng tất cả user về trang chủ`);
          
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
          }
        }
      }
      
      // Xóa thông tin user
      users.delete(socket.id);
    }
    
    console.log('Người dùng ngắt kết nối:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server đang chạy trên port ${PORT}`);
  console.log(`Truy cập ứng dụng tại: http://localhost:${PORT}`);
});
