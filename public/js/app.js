// Global variables
let socket;
let player;
let currentRoom = null;
let currentUser = null;
let isPlayerReady = false;
let isSyncing = false;
let usersData = [];
let currentPrivateTarget = null;
let isAdmin = false;
let isLiveMode = false;
let videoQueue = [];
let adminId = null;

// Emoji data
const emojiData = {
    smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐'],
    people: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁️', '👅', '👄', '💋'],
    nature: ['🌸', '💮', '🏵️', '🌹', '🥀', '🌺', '🌻', '🌼', '🌷', '🌱', '🪴', '🌲', '🌳', '🌴', '🌵', '🌶️', '🍄', '🌾', '💐', '🌿', '🍀', '🍃', '🍂', '🍁', '🌊', '🌀', '🌈', '🌂', '☂️', '☔', '⛱️', '⚡', '❄️', '☃️', '⛄', '☄️', '🔥', '💧', '🌟', '⭐', '🌠', '☀️', '🌝', '🌛', '🌜', '🌚', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓', '🌔'],
    food: ['🍕', '🍔', '🍟', '🌭', '🥪', '🌮', '🌯', '🥙', '🧆', '🥚', '🍳', '🥘', '🍲', '🥣', '🥗', '🍿', '🧈', '🧂', '🥯', '🍞', '🥖', '🥨', '🧀', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴', '🌶️', '🥕', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴'],
    activities: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '⛹️', '🤺', '🏇', '🧘', '🏄', '🏊', '🤽', '🚣', '🧗', '🚵', '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️'],
    travel: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🛴', '🛹', '🛼', '🚁', '🛸', '✈️', '🛩️', '🛫', '🛬', '🪂', '💺', '🚀', '🛰️', '🚢', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚂', '🚃', '🚄', '🚅', '🚆', '🚇', '🚈', '🚉', '🚊', '🚝', '🚞', '🚋', '🚌', '🚍', '🎡', '🎢', '🎠'],
    objects: ['💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💵', '💴', '💶', '💷', '💰', '💳', '💎', '⚖️', '🧰', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🔩', '⚙️', '🧱', '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️', '🚬', '⚰️', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳️', '🩹', '🩺', '💊', '💉', '🧬', '🦠', '🧫', '🧪', '🌡️', '🧹', '🧺', '🧻', '🚽', '🚰', '🚿', '🛁', '🛀', '🧼', '🪒', '🧽', '🧴', '🛎️', '🔑', '🗝️'],
    symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']
};

// DOM Elements
const joinModal = document.getElementById('join-modal');
const joinForm = document.getElementById('join-form');
const usernameInput = document.getElementById('username');
const roomIdInput = document.getElementById('room-id');
const adminPasswordInput = document.getElementById('admin-password');
const youtubeUrlInput = document.getElementById('youtube-url');
const loadVideoBtn = document.getElementById('load-video-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const userCountDisplay = document.getElementById('user-count');
const currentUserDisplay = document.getElementById('current-user');
const roomIdDisplay = document.getElementById('room-id-display');
const videoPlaceholder = document.getElementById('video-placeholder');
const loading = document.getElementById('loading');

// New elements for enhanced features
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');
const emojiGrid = document.getElementById('emoji-grid');
const fileBtn = document.getElementById('file-btn');
const fileInput = document.getElementById('file-input');
const usersListBtn = document.getElementById('users-list-btn');
const usersModal = document.getElementById('users-modal');
const usersList = document.getElementById('users-list');
const closeUsersModal = document.getElementById('close-users-modal');
const privateMessageModal = document.getElementById('private-message-modal');
const privateMessages = document.getElementById('private-messages');
const pmInput = document.getElementById('pm-input');
const sendPmBtn = document.getElementById('send-pm-btn');
const closePmModal = document.getElementById('close-pm-modal');
const filePreviewModal = document.getElementById('file-preview-modal');
const filePreview = document.getElementById('file-preview');
const closeFileModal = document.getElementById('close-file-modal');

// Admin elements
const adminControls = document.getElementById('admin-controls');
const toggleLiveModeBtn = document.getElementById('toggle-live-mode');
const showQueueBtn = document.getElementById('show-queue-btn');
const queueModal = document.getElementById('queue-modal');
const queueList = document.getElementById('queue-list');
const closeQueueModal = document.getElementById('close-queue-modal');
const loadVideoText = document.getElementById('load-video-text');
const liveModeText = document.getElementById('live-mode-text');
const queueCount = document.getElementById('queue-count');

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    showJoinModal();
    setupEventListeners();
    initializeEmojiPicker();
    // Ensure emoji picker is hidden initially
    hideEmojiPicker();
});

// Setup event listeners
function setupEventListeners() {
    // Existing listeners
    joinForm.addEventListener('submit', handleJoinRoom);
    loadVideoBtn.addEventListener('click', handleLoadVideo);
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    youtubeUrlInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleLoadVideo();
        }
    });

    // New feature listeners
    emojiBtn.addEventListener('click', toggleEmojiPicker);
    fileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    usersListBtn.addEventListener('click', showUsersModal);
    closeUsersModal.addEventListener('click', hideUsersModal);
    closePmModal.addEventListener('click', hidePrivateMessageModal);
    closeFileModal.addEventListener('click', hideFilePreviewModal);
    sendPmBtn.addEventListener('click', sendPrivateMessage);
    pmInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendPrivateMessage();
        }
    });

    // Click outside to close emoji picker
    document.addEventListener('click', function(e) {
        if (!emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) {
            hideEmojiPicker();
        }
    });

    // Prevent emoji picker from closing when clicking inside it
    emojiPicker.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    // Admin controls
    toggleLiveModeBtn.addEventListener('click', toggleLiveMode);
    showQueueBtn.addEventListener('click', showQueueModal);
    closeQueueModal.addEventListener('click', hideQueueModal);
}

// Show join modal
function showJoinModal() {
    joinModal.style.display = 'flex';
}

// Hide join modal
function hideJoinModal() {
    joinModal.style.display = 'none';
}

// Handle join room
function handleJoinRoom(e) {
    e.preventDefault();
    
    const username = usernameInput.value.trim();
    const roomId = roomIdInput.value.trim() || generateRoomId();
    const adminPassword = adminPasswordInput.value.trim();
    
    if (!username) {
        alert('Vui lòng nhập tên của bạn!');
        return;
    }
    
    currentUser = username;
    currentRoom = roomId;
    
    showLoading();
    connectToServer(username, roomId, adminPassword);
}

// Generate random room ID
function generateRoomId() {
    return 'room_' + Math.random().toString(36).substr(2, 9);
}

// Connect to server
function connectToServer(username, roomId, adminPassword) {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Kết nối thành công!');
        socket.emit('join-room', { username, roomId, adminPassword });
        
        hideLoading();
        hideJoinModal();
    });
    
    socket.on('disconnect', () => {
        console.log('Mất kết nối!');
        showNotification('Mất kết nối với server!', 'error');
    });
    
    setupSocketListeners();
}

// Setup socket listeners
function setupSocketListeners() {
    // Chat messages
    socket.on('chat-message', (data) => {
        displayMessage(data);
    });
    
    // User joined/left
    socket.on('user-joined', (data) => {
        displaySystemMessage(data.message);
    });
    
    socket.on('user-left', (data) => {
        displaySystemMessage(data.message);
    });
    
    // User count and list
    socket.on('user-count', (count) => {
        userCountDisplay.textContent = `${count} người online`;
    });

    socket.on('users-list', (users) => {
        usersData = users;
        updateUsersList();
    });
    
    // Private messages
    socket.on('private-message', (data) => {
        displayPrivateMessage(data);
    });

    // Admin events
    socket.on('room-info', (data) => {
        isAdmin = data.isAdmin;
        adminId = data.adminId;
        isLiveMode = data.isLiveMode;
        videoQueue = data.videoQueue;
        
        updateAdminUI();
        updateQueueDisplay();
        
        const userPrefix = isAdmin ? '👑 Admin' : '';
        currentUserDisplay.textContent = `${userPrefix} ${currentUser}`;
        roomIdDisplay.textContent = `Phòng: ${currentRoom}`;
    });

    socket.on('admin-status', (data) => {
        adminId = data.adminId;
        isLiveMode = data.isLiveMode;
        updateAdminUI();
    });

    socket.on('queue-updated', (queue) => {
        videoQueue = queue;
        updateQueueDisplay();
    });

    // Xử lý khi admin rời khỏi phòng
    socket.on('admin-left-room', (data) => {
        console.log('Admin đã rời khỏi phòng:', data);
        
        // Hiển thị thông báo
        showNotification(data.message, 'warning');
        displaySystemMessage(data.message);
        
        // Dọn dẹp trạng thái hiện tại
        cleanupRoomState();
        
        // Chuyển hướng về trang chủ sau 3 giây
        setTimeout(() => {
            redirectToHomePage();
        }, 3000);
    });
    
    // Video events
    socket.on('video-changed', (data) => {
        loadYouTubeVideo(data.videoId);
    });
    
    socket.on('video-loaded', (data) => {
        loadYouTubeVideo(data.videoId);
        if (data.state && player) {
            setTimeout(() => {
                syncVideoState(data.state);
            }, 1000);
        }
    });
    
    socket.on('video-state-sync', (state) => {
        if (!isSyncing) {
            syncVideoState(state);
        }
    });
}

// Display message in chat
function displayMessage(data) {
    const messageDiv = document.createElement('div');
    let messageClass = 'message';
    
    if (data.isSystem) {
        messageClass += ' system';
    } else if (data.messageType === 'file') {
        messageClass += ' file';
    }
    
    if (data.username === currentUser && !data.isSystem) {
        messageClass += ' own';
    }
    
    messageDiv.className = messageClass;
    
    let messageContent = '';
    if (data.messageType === 'file') {
        messageContent = createFileMessageContent(data);
    } else {
        messageContent = `
            <div class="message-header">
                <span class="username">${data.username}</span>
                <span class="timestamp">${data.timestamp}</span>
            </div>
            <div class="message-content">${escapeHtml(data.message)}</div>
        `;
    }
    
    messageDiv.innerHTML = messageContent;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Remove welcome message if exists
    const welcomeMessage = chatMessages.querySelector('.welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }
}

// Display system message
function displaySystemMessage(message) {
    displayMessage({
        username: 'Hệ thống',
        message: message,
        timestamp: new Date().toLocaleTimeString('vi-VN'),
        isSystem: true
    });
}

// Send chat message
function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    
    socket.emit('chat-message', {
        message: message,
        roomId: currentRoom
    });
    
    chatInput.value = '';
}

// Handle load video
function handleLoadVideo() {
    const url = youtubeUrlInput.value.trim();
    if (!url) {
        alert('Vui lòng nhập link YouTube!');
        return;
    }
    
    const videoId = extractVideoId(url);
    if (!videoId) {
        alert('Link YouTube không hợp lệ!');
        return;
    }
    
    // Get video title (simplified)
    const videoTitle = getVideoTitleFromUrl(url);
    
    socket.emit('change-video', {
        videoId: videoId,
        videoTitle: videoTitle,
        roomId: currentRoom
    });
    
    youtubeUrlInput.value = '';
}

// Extract video title from URL (simplified)
function getVideoTitleFromUrl(url) {
    // This is a simplified version - in production you'd use YouTube API
    const urlParams = new URLSearchParams(new URL(url).search);
    return urlParams.get('title') || 'Video YouTube';
}

// Extract YouTube video ID from URL
function extractVideoId(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
}

// YouTube API ready callback
function onYouTubeIframeAPIReady() {
    console.log('YouTube API sẵn sàng!');
}

// Load YouTube video
function loadYouTubeVideo(videoId) {
    if (!videoId) return;
    
    videoPlaceholder.style.display = 'none';
    
    // Xác định player controls dựa trên live mode và admin status
    const playerControls = getPlayerControls();
    
    if (player) {
        player.loadVideoById(videoId);
        updatePlayerControls();
    } else {
        player = new YT.Player('youtube-player', {
            height: '100%',
            width: '100%',
            videoId: videoId,
            playerVars: {
                'autoplay': 0,
                'controls': playerControls,
                'rel': 0,
                'showinfo': 0,
                'modestbranding': 1,
                'disablekb': isLiveMode && !isAdmin ? 1 : 0, // Disable keyboard cho user trong live mode
                'fs': isLiveMode && !isAdmin ? 0 : 1, // Disable fullscreen cho user trong live mode
                'iv_load_policy': 3 // Hide annotations
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange
            }
        });
    }
}

// Xác định player controls
function getPlayerControls() {
    if (isLiveMode && !isAdmin) {
        return 0; // Không có controls cho user trong live mode
    }
    return 1; // Có controls bình thường
}

// Cập nhật player controls khi thay đổi live mode
function updatePlayerControls() {
    if (!player) return;
    
    const iframe = document.querySelector('#youtube-player iframe');
    if (iframe) {
        // Thêm overlay để disable clicks cho user trong live mode
        updatePlayerOverlay();
    }
}

// Thêm/xóa overlay để disable player interaction
function updatePlayerOverlay() {
    const videoContainer = document.querySelector('.video-container');
    let overlay = videoContainer.querySelector('.player-overlay');
    
    if (isLiveMode && !isAdmin) {
        // Tạo invisible overlay để disable interaction nhưng không che video
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'player-overlay';
            overlay.innerHTML = `
                <div class="overlay-controls-blocker"></div>
                <div class="live-mode-indicator">
                    <i class="fas fa-eye"></i>
                    <span>Live Mode</span>
                </div>
            `;
            videoContainer.appendChild(overlay);
        }
    } else {
        // Xóa overlay để cho phép interaction
        if (overlay) {
            overlay.remove();
        }
    }
}

// Player ready callback
function onPlayerReady(event) {
    isPlayerReady = true;
    console.log('YouTube player sẵn sàng!');
}

// Player state change callback
function onPlayerStateChange(event) {
    if (!isPlayerReady || isSyncing) return;
    
    // Chỉ admin mới được emit state change trong live mode
    if (isLiveMode && !isAdmin) {
        return; // User thường không được điều khiển
    }
    
    const state = {
        isPlaying: event.data === YT.PlayerState.PLAYING,
        currentTime: player.getCurrentTime(),
        playerState: event.data
    };
    
    // Emit state change to other users
    socket.emit('video-state-change', {
        state: state,
        roomId: currentRoom
    });
}

// Sync video state
function syncVideoState(state) {
    if (!player || !isPlayerReady) return;
    
    // Trong live mode, user không được điều khiển
    if (isLiveMode && !isAdmin) {
        isSyncing = true;
        
        try {
            const currentTime = player.getCurrentTime();
            const timeDiff = Math.abs(currentTime - state.currentTime);
            
            // Force sync nếu là admin control hoặc time diff > 1 giây
            if (state.forceSync || state.adminControl || timeDiff > 1) {
                player.seekTo(state.currentTime, true);
            }
            
            // Sync play/pause state ngay lập tức
            if (state.isPlaying && player.getPlayerState() !== YT.PlayerState.PLAYING) {
                player.playVideo();
            } else if (!state.isPlaying && player.getPlayerState() === YT.PlayerState.PLAYING) {
                player.pauseVideo();
            }
            
            // Hiển thị sync indicator
            showSyncIndicator();
            
        } catch (error) {
            console.error('Lỗi đồng bộ video:', error);
        }
        
        setTimeout(() => {
            isSyncing = false;
        }, 500); // Giảm thời gian sync
        
    } else {
        // Chế độ bình thường
        isSyncing = true;
        
        try {
            const currentTime = player.getCurrentTime();
            const timeDiff = Math.abs(currentTime - state.currentTime);
            
            // Sync time if difference is more than 2 seconds
            if (timeDiff > 2) {
                player.seekTo(state.currentTime, true);
            }
            
            // Sync play/pause state
            if (state.isPlaying && player.getPlayerState() !== YT.PlayerState.PLAYING) {
                player.playVideo();
            } else if (!state.isPlaying && player.getPlayerState() === YT.PlayerState.PLAYING) {
                player.pauseVideo();
            }
        } catch (error) {
            console.error('Lỗi đồng bộ video:', error);
        }
        
        setTimeout(() => {
            isSyncing = false;
        }, 1000);
    }
}

// Hiển thị sync indicator
function showSyncIndicator() {
    const videoContainer = document.querySelector('.video-container');
    let syncIndicator = videoContainer.querySelector('.sync-indicator');
    
    if (!syncIndicator) {
        syncIndicator = document.createElement('div');
        syncIndicator.className = 'sync-indicator';
        syncIndicator.innerHTML = '<i class="fas fa-sync-alt"></i>';
        syncIndicator.style.opacity = '0';
        videoContainer.appendChild(syncIndicator);
    }
    
    // Show with fade in effect
    syncIndicator.style.opacity = '1';
    
    setTimeout(() => {
        if (syncIndicator) {
            syncIndicator.style.opacity = '0';
        }
    }, 1000);
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading() {
    loading.classList.remove('hidden');
}

function hideLoading() {
    loading.classList.add('hidden');
}

function showNotification(message, type = 'info') {
    // Tạo thông báo toast đẹp hơn thay vì alert
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Thêm styles nếu chưa có
    if (!document.querySelector('#notification-styles')) {
        const styles = document.createElement('style');
        styles.id = 'notification-styles';
        styles.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                max-width: 400px;
                padding: 15px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                font-size: 14px;
                animation: slideInRight 0.3s ease-out;
            }
            .notification-info { background: #3498db; color: white; }
            .notification-success { background: #2ecc71; color: white; }
            .notification-warning { background: #f39c12; color: white; }
            .notification-error { background: #e74c3c; color: white; }
            .notification-content { display: flex; align-items: center; gap: 10px; flex: 1; }
            .notification-close { 
                background: none; border: none; color: inherit; 
                cursor: pointer; padding: 5px; border-radius: 4px;
                opacity: 0.8;
            }
            .notification-close:hover { opacity: 1; background: rgba(255,255,255,0.1); }
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(styles);
    }
    
    document.body.appendChild(notification);
    
    // Tự động xóa sau 5 giây
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideInRight 0.3s ease-out reverse';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

function getNotificationIcon(type) {
    switch(type) {
        case 'success': return 'check-circle';
        case 'warning': return 'exclamation-triangle';
        case 'error': return 'exclamation-circle';
        default: return 'info-circle';
    }
}

// Handle page visibility change for better sync
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && player && isPlayerReady) {
        // Request current state when page becomes visible
        setTimeout(() => {
            socket.emit('request-sync', { roomId: currentRoom });
        }, 500);
    }
});

// Emoji Picker Functions
function initializeEmojiPicker() {
    // Setup emoji categories
    const categories = document.querySelectorAll('.emoji-category');
    categories.forEach(category => {
        category.addEventListener('click', () => {
            categories.forEach(c => c.classList.remove('active'));
            category.classList.add('active');
            loadEmojiCategory(category.dataset.category);
        });
    });
    
    // Load default category
    loadEmojiCategory('smileys');
}

function loadEmojiCategory(category) {
    const emojis = emojiData[category] || [];
    emojiGrid.innerHTML = '';
    
    emojis.forEach(emoji => {
        const emojiBtn = document.createElement('button');
        emojiBtn.className = 'emoji-item';
        emojiBtn.textContent = emoji;
        emojiBtn.addEventListener('click', () => {
            insertEmoji(emoji);
        });
        emojiGrid.appendChild(emojiBtn);
    });
}

function toggleEmojiPicker(e) {
    e.stopPropagation(); // Prevent event bubbling
    if (emojiPicker.classList.contains('hidden')) {
        showEmojiPicker();
    } else {
        hideEmojiPicker();
    }
}

function showEmojiPicker() {
    emojiPicker.classList.remove('hidden');
    emojiBtn.classList.add('active');
}

function hideEmojiPicker() {
    emojiPicker.classList.add('hidden');
    emojiBtn.classList.remove('active');
}

function insertEmoji(emoji) {
    const cursorPos = chatInput.selectionStart;
    const textBefore = chatInput.value.substring(0, cursorPos);
    const textAfter = chatInput.value.substring(cursorPos);
    
    chatInput.value = textBefore + emoji + textAfter;
    chatInput.focus();
    chatInput.setSelectionRange(cursorPos + emoji.length, cursorPos + emoji.length);
    
    hideEmojiPicker();
}

// File Sharing Functions
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('File quá lớn! Vui lòng chọn file nhỏ hơn 10MB.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const fileData = e.target.result;
        
        socket.emit('file-share', {
            fileData: fileData,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            roomId: currentRoom
        });
    };
    
    reader.readAsDataURL(file);
    fileInput.value = ''; // Reset input
}

function createFileMessageContent(data) {
    const fileData = data.fileData;
    const fileIcon = getFileIcon(fileData.type);
    const fileSize = formatFileSize(fileData.size);
    
    let preview = '';
    if (fileData.type.startsWith('image/')) {
        preview = `<img src="${fileData.data}" class="file-preview-thumb" alt="${fileData.name}" />`;
    }
    
    return `
        <div class="message-header">
            <span class="username">${data.username}</span>
            <span class="timestamp">${data.timestamp}</span>
        </div>
        <div class="file-info" onclick="showFilePreview('${fileData.data}', '${fileData.name}', '${fileData.type}')">
            ${preview}
            <div class="file-icon">${fileIcon}</div>
            <div class="file-details">
                <div class="file-name">${fileData.name}</div>
                <div class="file-size">${fileSize}</div>
            </div>
        </div>
    `;
}

function getFileIcon(fileType) {
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType.startsWith('video/')) return '🎥';
    if (fileType.startsWith('audio/')) return '🎵';
    if (fileType.includes('pdf')) return '📄';
    if (fileType.includes('word')) return '📝';
    if (fileType.includes('excel')) return '📊';
    return '📎';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showFilePreview(fileData, fileName, fileType) {
    const preview = document.getElementById('file-preview');
    
    if (fileType.startsWith('image/')) {
        preview.innerHTML = `
            <img src="${fileData}" alt="${fileName}" />
            <h4>${fileName}</h4>
            <button class="file-download-btn" onclick="downloadFile('${fileData}', '${fileName}')">
                <i class="fas fa-download"></i> Tải xuống
            </button>
        `;
    } else if (fileType.startsWith('video/')) {
        preview.innerHTML = `
            <video controls src="${fileData}"></video>
            <h4>${fileName}</h4>
            <button class="file-download-btn" onclick="downloadFile('${fileData}', '${fileName}')">
                <i class="fas fa-download"></i> Tải xuống
            </button>
        `;
    } else if (fileType.startsWith('audio/')) {
        preview.innerHTML = `
            <audio controls src="${fileData}"></audio>
            <h4>${fileName}</h4>
            <button class="file-download-btn" onclick="downloadFile('${fileData}', '${fileName}')">
                <i class="fas fa-download"></i> Tải xuống
            </button>
        `;
    } else {
        preview.innerHTML = `
            <div class="file-icon" style="font-size: 4rem;">${getFileIcon(fileType)}</div>
            <h4>${fileName}</h4>
            <p>Không thể xem trước file này</p>
            <button class="file-download-btn" onclick="downloadFile('${fileData}', '${fileName}')">
                <i class="fas fa-download"></i> Tải xuống
            </button>
        `;
    }
    
    showFilePreviewModal();
}

function downloadFile(fileData, fileName) {
    const link = document.createElement('a');
    link.href = fileData;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Users List Functions
function showUsersModal() {
    socket.emit('get-users-list');
    usersModal.classList.remove('hidden');
}

function hideUsersModal() {
    usersModal.classList.add('hidden');
}

function updateUsersList() {
    const usersListElement = document.getElementById('users-list');
    usersListElement.innerHTML = '';
    
    usersData.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-item';
        userDiv.innerHTML = `
            <div>
                <div class="user-name">${user.username}</div>
                <div class="user-status">Online</div>
            </div>
            ${user.id !== socket.id ? `<button class="pm-btn" onclick="openPrivateMessage('${user.id}', '${user.username}')">Nhắn tin</button>` : ''}
        `;
        usersListElement.appendChild(userDiv);
    });
}

// Private Message Functions
function openPrivateMessage(userId, username) {
    currentPrivateTarget = { id: userId, username: username };
    hideUsersModal();
    showPrivateMessageModal();
    
    // Update modal title
    const modalTitle = privateMessageModal.querySelector('h3');
    modalTitle.innerHTML = `<i class="fas fa-envelope"></i> Tin nhắn với ${username}`;
}

function showPrivateMessageModal() {
    privateMessageModal.classList.remove('hidden');
}

function hidePrivateMessageModal() {
    privateMessageModal.classList.add('hidden');
    currentPrivateTarget = null;
}

function sendPrivateMessage() {
    const message = pmInput.value.trim();
    if (!message || !currentPrivateTarget) return;
    
    socket.emit('private-message', {
        message: message,
        targetUserId: currentPrivateTarget.id,
        roomId: currentRoom
    });
    
    pmInput.value = '';
}

function displayPrivateMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message private';
    
    const isFromMe = data.fromId === socket.id;
    const displayName = isFromMe ? `Bạn → ${data.to || data.from}` : `${data.from} → Bạn`;
    
    messageDiv.innerHTML = `
        <div class="private-message-indicator">Tin nhắn riêng</div>
        <div class="message-header">
            <span class="username">${displayName}</span>
            <span class="timestamp">${data.timestamp}</span>
        </div>
        <div class="message-content">${escapeHtml(data.message)}</div>
    `;
    
    // Add to private messages modal if open
    if (!privateMessageModal.classList.contains('hidden')) {
        privateMessages.appendChild(messageDiv.cloneNode(true));
        privateMessages.scrollTop = privateMessages.scrollHeight;
    }
    
    // Also add to main chat
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Admin Functions
function updateAdminUI() {
    const videoContainer = document.querySelector('.video-container');
    const videoSection = document.querySelector('.video-section');
    
    if (isAdmin) {
        adminControls.classList.remove('hidden');
        loadVideoText.textContent = 'Phát ngay';
        
        // Update live mode button
        if (isLiveMode) {
            toggleLiveModeBtn.classList.add('active');
            liveModeText.textContent = 'Tắt Live Mode';
            videoSection.classList.add('live-mode-active');
            videoContainer.classList.add('live-mode');
            
            // Thêm admin control indicator
            addAdminControlIndicator();
            
            // Bắt đầu auto sync cho admin
            startAdminAutoSync();
        } else {
            toggleLiveModeBtn.classList.remove('active');
            liveModeText.textContent = 'Bật Live Mode';
            videoSection.classList.remove('live-mode-active');
            videoContainer.classList.remove('live-mode');
            
            // Xóa admin control indicator
            removeAdminControlIndicator();
            
            // Dừng auto sync
            stopAdminAutoSync();
        }
    } else {
        adminControls.classList.add('hidden');
        loadVideoText.textContent = isLiveMode ? 'Thêm vào hàng đợi' : 'Phát Video';
        videoSection.classList.remove('live-mode-active');
        
        if (isLiveMode) {
            videoContainer.classList.add('live-mode', 'disabled-interaction');
            addLiveStatusBar();
            addLiveModeMessage();
        } else {
            videoContainer.classList.remove('live-mode', 'disabled-interaction');
            removeLiveStatusBar();
            removeLiveModeMessage();
        }
    }
    
    // Cập nhật player overlay
    updatePlayerOverlay();
    
    // Reload player với settings mới nếu cần
    if (player && isPlayerReady) {
        updatePlayerControls();
    }
}

// Auto sync mechanism cho admin
let adminSyncInterval = null;

function startAdminAutoSync() {
    if (adminSyncInterval) return;
    
    adminSyncInterval = setInterval(() => {
        if (isAdmin && isLiveMode && player && isPlayerReady && !isSyncing) {
            const state = {
                isPlaying: player.getPlayerState() === YT.PlayerState.PLAYING,
                currentTime: player.getCurrentTime(),
                playerState: player.getPlayerState()
            };
            
            socket.emit('video-state-change', {
                state: state,
                roomId: currentRoom
            });
        }
    }, 1000); // Sync mỗi giây
}

function stopAdminAutoSync() {
    if (adminSyncInterval) {
        clearInterval(adminSyncInterval);
        adminSyncInterval = null;
    }
}

// Thêm live mode message
function addLiveModeMessage() {
    const videoContainer = document.querySelector('.video-container');
    if (!videoContainer.querySelector('.live-mode-message')) {
        const message = document.createElement('div');
        message.className = 'live-mode-message';
        message.innerHTML = `
            <i class="fas fa-lock"></i>
            <p>Chế độ Live</p>
            <small>Admin đang điều khiển video</small>
        `;
        videoContainer.appendChild(message);
    }
}

// Xóa live mode message
function removeLiveModeMessage() {
    const message = document.querySelector('.live-mode-message');
    if (message) {
        message.remove();
    }
}

// Thêm live status bar cho user
function addLiveStatusBar() {
    const videoContainer = document.querySelector('.video-container');
    if (!videoContainer.querySelector('.live-status-bar')) {
        const statusBar = document.createElement('div');
        statusBar.className = 'live-status-bar';
        statusBar.innerHTML = '<i class="fas fa-circle"></i> LIVE - Đang xem theo Admin';
        videoContainer.appendChild(statusBar);
    }
}

// Xóa live status bar
function removeLiveStatusBar() {
    const statusBar = document.querySelector('.live-status-bar');
    if (statusBar) {
        statusBar.remove();
    }
}

// Thêm admin control indicator
function addAdminControlIndicator() {
    const videoContainer = document.querySelector('.video-container');
    if (!videoContainer.querySelector('.admin-control-indicator')) {
        const indicator = document.createElement('div');
        indicator.className = 'admin-control-indicator';
        indicator.innerHTML = '👑 Bạn đang điều khiển';
        videoContainer.appendChild(indicator);
    }
}

// Xóa admin control indicator
function removeAdminControlIndicator() {
    const indicator = document.querySelector('.admin-control-indicator');
    if (indicator) {
        indicator.remove();
    }
}

function toggleLiveMode() {
    if (isAdmin) {
        socket.emit('toggle-live-mode', { roomId: currentRoom });
    }
}

function showQueueModal() {
    queueModal.classList.remove('hidden');
}

function hideQueueModal() {
    queueModal.classList.add('hidden');
}

function updateQueueDisplay() {
    queueCount.textContent = videoQueue.length;
    
    if (videoQueue.length === 0) {
        queueList.innerHTML = '<div class="queue-empty"><p>Hàng đợi trống</p></div>';
        return;
    }
    
    queueList.innerHTML = '';
    videoQueue.forEach(item => {
        const queueItem = document.createElement('div');
        queueItem.className = 'queue-item';
        queueItem.innerHTML = `
            <div class="queue-item-info">
                <div class="queue-item-title">${item.title}</div>
                <div class="queue-item-meta">
                    Yêu cầu bởi: ${item.requestedBy} • ${item.requestedAt}
                </div>
            </div>
            ${isAdmin ? `
                <div class="queue-item-actions">
                    <button class="queue-btn play" data-queue-id="${item.id}">
                        <i class="fas fa-play"></i> Phát
                    </button>
                    <button class="queue-btn remove" data-queue-id="${item.id}">
                        <i class="fas fa-trash"></i> Xóa
                    </button>
                </div>
            ` : ''}
        `;
        
        // Add event listeners for the buttons
        if (isAdmin) {
            const playBtn = queueItem.querySelector('.queue-btn.play');
            const removeBtn = queueItem.querySelector('.queue-btn.remove');
            
            if (playBtn) {
                playBtn.addEventListener('click', () => {
                    playFromQueue(item.id);
                });
            }
            
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    removeFromQueue(item.id);
                });
            }
        }
        
        queueList.appendChild(queueItem);
    });
}

function playFromQueue(queueItemId) {
    if (isAdmin) {
        socket.emit('admin-play-from-queue', {
            queueItemId: queueItemId,
            roomId: currentRoom
        });
    }
}

function removeFromQueue(queueItemId) {
    if (isAdmin) {
        socket.emit('admin-remove-from-queue', {
            queueItemId: queueItemId,
            roomId: currentRoom
        });
    }
}

// Modal Functions
function showFilePreviewModal() {
    filePreviewModal.classList.remove('hidden');
}

function hideFilePreviewModal() {
    filePreviewModal.classList.add('hidden');
}

// Dọn dẹp trạng thái phòng khi admin rời khỏi
function cleanupRoomState() {
    // Dừng video nếu đang phát
    if (player && isPlayerReady) {
        try {
            player.pauseVideo();
        } catch (error) {
            console.log('Không thể dừng video:', error);
        }
    }
    
    // Reset các biến trạng thái
    isAdmin = false;
    adminId = null;
    isLiveMode = false;
    videoQueue = [];
    currentPrivateTarget = null;
    
    // Ẩn các modal nếu đang mở
    hideUsersModal();
    hidePrivateMessageModal();
    hideFilePreviewModal();
    hideQueueModal();
    hideEmojiPicker();
    
    // Ẩn admin controls
    adminControls.classList.add('hidden');
    
    // Dọn dẹp UI
    updateAdminUI();
    updateQueueDisplay();
    
    // Dừng auto sync nếu đang chạy
    stopAdminAutoSync();
}

// Chuyển hướng về trang chủ
function redirectToHomePage() {
    // Ngắt kết nối socket
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    
    // Reset player
    if (player) {
        try {
            player.destroy();
        } catch (error) {
            console.log('Không thể hủy player:', error);
        }
        player = null;
    }
    
    // Reset các biến global
    currentRoom = null;
    currentUser = null;
    isPlayerReady = false;
    isSyncing = false;
    usersData = [];
    
    // Hiển thị video placeholder
    videoPlaceholder.style.display = 'flex';
    
    // Reset các input
    usernameInput.value = '';
    roomIdInput.value = '';
    adminPasswordInput.value = '';
    youtubeUrlInput.value = '';
    chatInput.value = '';
    
    // Xóa tất cả tin nhắn chat
    chatMessages.innerHTML = `
        <div class="message welcome-message">
            <div class="welcome-content">
                <h3>🎬 Chào mừng đến với Stream Together!</h3>
                <p>Tham gia phòng để bắt đầu xem video cùng nhau</p>
            </div>
        </div>
    `;
    
    // Reset displays
    userCountDisplay.textContent = '0 người online';
    currentUserDisplay.textContent = '';
    roomIdDisplay.textContent = '';
    
    // Hiển thị modal tham gia phòng
    showJoinModal();
    
    console.log('Đã chuyển hướng về trang chủ');
}

// Handle window beforeunload
window.addEventListener('beforeunload', function() {
    if (socket) {
        socket.disconnect();
    }
});
