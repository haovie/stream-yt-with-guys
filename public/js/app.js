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

// 🔥 ANTI-FEEDBACK LOOP: Variables to prevent infinite sync loops
let lastSyncTimestamp = 0; // Timestamp of last received sync
let syncDebounceTimeout = null; // Timeout for debouncing outgoing syncs
let isReceivingSync = false; // Flag to indicate we're currently processing incoming sync

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

// 🔥 Chat Overlay Elements
const videoContainer = document.getElementById('video-container');
const chatOverlay = document.getElementById('chat-overlay');
const chatOverlayMessages = document.getElementById('chat-overlay-messages');
const chatOverlayInput = document.getElementById('chat-overlay-input');
const chatOverlaySendBtn = document.getElementById('chat-overlay-send');
const newMessageIndicator = document.getElementById('new-message-indicator');
const chatOverlayToggle = document.getElementById('chat-overlay-toggle');
const chatBadge = document.getElementById('chat-badge');
const chatOverlayEmojiBtn = document.getElementById('chat-overlay-emoji-btn');
const chatOverlayEmojiPicker = document.getElementById('chat-overlay-emoji-picker');
const chatOverlayEmojiGrid = document.getElementById('chat-overlay-emoji-grid');

// 🔥 Chat Overlay State (TikTok Style)
let isUserScrolling = false;
let scrollTimeout = null;
let newMessagesPending = 0;
let isChatCollapsed = false;
let unreadMessages = 0;

// 🎯 Draggable Chat Overlay State
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let chatPosition = { x: null, y: null };

// 🎮 Custom Video Controls Elements
const customControls = document.getElementById('custom-controls');
const videoClickOverlay = document.getElementById('video-click-overlay');
const playPauseBtn = document.getElementById('play-pause-btn');
const rewindBtn = document.getElementById('rewind-btn');
const forwardBtn = document.getElementById('forward-btn');
const volumeBtn = document.getElementById('volume-btn');
const volumeSlider = document.getElementById('volume-slider');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const progressBar = document.getElementById('progress-bar');
const progressFilled = document.getElementById('progress-filled');
const progressHandle = document.getElementById('progress-handle');
const currentTimeDisplay = document.getElementById('current-time');
const durationDisplay = document.getElementById('duration');
const videoTitle = document.getElementById('video-title');
const speedBtn = document.getElementById('speed-btn');
const speedMenu = document.getElementById('speed-menu');
const qualityBtn = document.getElementById('quality-btn');
const qualityMenu = document.getElementById('quality-menu');
const captionBtn = document.getElementById('caption-btn');
const captionMenu = document.getElementById('caption-menu');

// Custom controls state
let controlsTimeout = null;
let isSeeking = false;
let lastVolume = 100;
let currentSpeed = 1;
let currentQuality = 'auto';
let currentCaptionTrack = null;
let currentCaptionLangCode = null; // Store language code to maintain preference across videos
let availableCaptions = [];
let availableQualities = [];

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
    
    // 🔥 Chat overlay event listeners
    if (chatOverlayInput) {
        chatOverlayInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendOverlayMessage();
            }
        });
    }
    
    if (chatOverlaySendBtn) {
        chatOverlaySendBtn.addEventListener('click', sendOverlayMessage);
    }
    
    // 🎯 TikTok Style: Scroll detection for auto-scroll logic
    if (chatOverlayMessages) {
        chatOverlayMessages.addEventListener('scroll', handleOverlayScroll);
    }
    
    // 🎯 New Message Indicator click -> Scroll to bottom
    if (newMessageIndicator) {
        newMessageIndicator.addEventListener('click', function() {
            scrollToBottom(chatOverlayMessages);
            hideNewMessageIndicator();
            isUserScrolling = false;
        });
    }
    
    // 🎯 Chat Overlay Toggle button
    if (chatOverlayToggle) {
        let clickStartX = 0;
        let clickStartY = 0;
        
        chatOverlayToggle.addEventListener('mousedown', (e) => {
            clickStartX = e.clientX;
            clickStartY = e.clientY;
            startDragChatOverlay(e);
        });
        
        chatOverlayToggle.addEventListener('click', (e) => {
            // Only toggle if we didn't drag (moved less than 5px)
            const dx = Math.abs(e.clientX - clickStartX);
            const dy = Math.abs(e.clientY - clickStartY);
            
            if (dx < 5 && dy < 5) {
                toggleChatOverlay();
            }
        });
    }
    
    // 🎯 Chat Overlay Emoji button
    if (chatOverlayEmojiBtn) {
        chatOverlayEmojiBtn.addEventListener('click', toggleOverlayEmojiPicker);
    }
    
    // 🎯 Make chat overlay draggable when clicking on messages area
    if (chatOverlayMessages) {
        chatOverlayMessages.addEventListener('mousedown', startDragChatOverlay);
    }
    
    // 🎯 Global drag handlers
    document.addEventListener('mousemove', dragChatOverlay);
    document.addEventListener('mouseup', stopDragChatOverlay);
    
    // 🔥 Fullscreen change detection
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    function handleFullscreenChange() {
        const inFullscreen = isFullscreen();
        showChatOverlay(inFullscreen);
        
        if (inFullscreen) {
            // ✅ FIX: Initialize scroll state properly when entering fullscreen
            setTimeout(() => {
                if (chatOverlayMessages) {
                    scrollToBottom(chatOverlayMessages);
                    isUserScrolling = false;
                    newMessagesPending = 0;
                    hideNewMessageIndicator();
                    
                    // Set initial state to idle
                    chatOverlayMessages.classList.remove('scrolling');
                    chatOverlayMessages.classList.add('idle');
                }
                
                // Focus overlay input when entering fullscreen
                if (chatOverlayInput) {
                    chatOverlayInput.focus();
                }
            }, 300);
        } else {
            // Reset state when exiting fullscreen
            isUserScrolling = false;
            isChatCollapsed = false;
            unreadMessages = 0;
        }
    }

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
        // Hide main emoji picker
        if (!emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) {
            hideEmojiPicker();
        }
        
        // Hide overlay emoji picker
        if (chatOverlayEmojiPicker && chatOverlayEmojiBtn) {
            if (!chatOverlayEmojiPicker.contains(e.target) && !chatOverlayEmojiBtn.contains(e.target)) {
                hideOverlayEmojiPicker();
            }
        }
    });

    // Prevent emoji picker from closing when clicking inside it
    emojiPicker.addEventListener('click', function(e) {
        e.stopPropagation();
    });
    
    // Prevent overlay emoji picker from closing when clicking inside it
    if (chatOverlayEmojiPicker) {
        chatOverlayEmojiPicker.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }

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
        // 🔥 Also display in overlay if in fullscreen
        displayOverlayMessage(data);
    });
    
    // User joined/left
    socket.on('user-joined', (data) => {
        displaySystemMessage(data.message);
        // 🔥 Also display in overlay
        displayOverlayMessage({
            username: 'Hệ thống',
            message: data.message,
            isSystem: true,
            timestamp: new Date().toLocaleTimeString('vi-VN')
        });
    });
    
    socket.on('user-left', (data) => {
        displaySystemMessage(data.message);
        // 🔥 Also display in overlay
        displayOverlayMessage({
            username: 'Hệ thống',
            message: data.message,
            isSystem: true,
            timestamp: new Date().toLocaleTimeString('vi-VN')
        });
    });
    
    // 🎮 Admin controls sync
    socket.on('playback-speed-change', (data) => {
        if (!isAdmin && data.speed) {
            setPlaybackSpeed(data.speed);
            displaySystemMessage(`Admin đổi tốc độ phát: ${data.speed}x`);
        }
    });
    
    socket.on('video-quality-change', (data) => {
        if (!isAdmin && data.quality) {
            setVideoQuality(data.quality);
            const qualityText = data.quality === 'auto' ? 'Auto' : data.quality;
            displaySystemMessage(`Admin đổi chất lượng: ${qualityText}`);
        }
    });
    
    socket.on('caption-change', (data) => {
        if (!isAdmin) {
            setCaptions(data.track);
            const captionText = data.track === 'off' ? 'Off' : (availableCaptions[data.track]?.displayName || 'On');
            displaySystemMessage(`Admin đổi phụ đề: ${captionText}`);
        }
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
        
        // 🎮 Show/hide admin controls
        if (isAdmin) {
            document.body.classList.add('is-admin');
            console.log('✅ Admin controls enabled');
        } else {
            document.body.classList.remove('is-admin');
        }
        
        // 🎮 Update live mode UI (hide play/pause/rewind/forward for users)
        updateLiveModeUI();
        
        const userPrefix = isAdmin ? '👑 Admin' : '';
        currentUserDisplay.textContent = `${userPrefix} ${currentUser}`;
        roomIdDisplay.textContent = `Phòng: ${currentRoom}`;
    });

    socket.on('admin-status', (data) => {
        adminId = data.adminId;
        isLiveMode = data.isLiveMode;
        updateLiveModeUI(); // Cập nhật class is-live-mode cho body ngay lập tức
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
        syncVideoState(state);
    });

    // ⚡ OPTIMIZED: Compact video sync handler
    // Format: [state, time, timestamp] where state: 0=paused, 1=playing, 2=buffering, 3=ended
    socket.on('vs', (data) => {
        if (player && isPlayerReady) {
            const [state, time, timestamp] = data;
            syncVideoStateCompact(state, time, timestamp);
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

// 🔥 Display message in fullscreen overlay (TikTok/Facebook Live style)
function displayOverlayMessage(data) {
    // Skip if data is invalid or overlay doesn't exist
    if (!data || !chatOverlayMessages) return;
    
    // Skip file messages in overlay (too complex for overlay display)
    if (data.messageType === 'file') return;
    
    const messageDiv = document.createElement('div');
    let messageClass = 'chat-overlay-message';
    
    if (data.isSystem) {
        messageClass += ' system';
    } else if (data.username === currentUser && !data.isSystem) {
        messageClass += ' own';
    }
    
    messageDiv.className = messageClass;
    
    // Create message content
    if (data.isSystem) {
        messageDiv.innerHTML = `
            <span class="chat-overlay-message-content">${escapeHtml(data.message)}</span>
        `;
    } else {
        messageDiv.innerHTML = `
            <span class="chat-overlay-message-username">${escapeHtml(data.username)}:</span>
            <span class="chat-overlay-message-content">${escapeHtml(data.message)}</span>
        `;
    }
    
    // Add to overlay
    chatOverlayMessages.appendChild(messageDiv);
    
    // 🎯 Handle unread messages when chat is collapsed
    if (isChatCollapsed) {
        unreadMessages++;
        updateChatBadge();
    } else {
        // 🎯 TikTok Style: Auto-scroll logic
        if (!isUserScrolling) {
            // User is at bottom or idle -> Auto-scroll to new message
            scrollToBottom(chatOverlayMessages);
        } else {
            // User is scrolling up viewing history -> Show "New Message" indicator
            newMessagesPending++;
            showNewMessageIndicator();
        }
    }
    
    // Keep only last 50 messages (increased from 20 for better history)
    const messages = chatOverlayMessages.querySelectorAll('.chat-overlay-message');
    if (messages.length > 50) {
        messages[0].remove();
    }
    
    // ❌ TikTok Style: NO auto-fade - messages stay until scrolled away
    // Users can scroll up to read history at any time
}

// 🎯 Scroll to bottom smoothly
function scrollToBottom(element) {
    if (!element) return;
    element.scrollTo({
        top: element.scrollHeight,
        behavior: 'smooth'
    });
}

// 🎯 Check if user is at bottom of chat
function isAtBottom(element) {
    if (!element) return true;
    const threshold = 50; // 50px threshold
    return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
}

// 🎯 Show "New Message" indicator (Facebook Live style)
function showNewMessageIndicator() {
    if (!newMessageIndicator) return;
    
    // Update text with count if there are pending messages, otherwise show "Back to latest"
    let countText;
    if (newMessagesPending > 0) {
        countText = newMessagesPending > 1 ? `${newMessagesPending} tin nhắn mới` : 'Tin nhắn mới';
    } else {
        countText = 'Về tin nhắn mới nhất';
    }
    newMessageIndicator.querySelector('span').textContent = countText;
    
    // Show indicator
    newMessageIndicator.classList.add('visible');
}

// 🎯 Hide "New Message" indicator
function hideNewMessageIndicator() {
    if (!newMessageIndicator) return;
    
    newMessageIndicator.classList.remove('visible');
    newMessagesPending = 0;
}

// 🎯 Handle scroll event (detect user scrolling)
function handleOverlayScroll() {
    if (!chatOverlayMessages) return;
    
    // Clear existing timeout
    if (scrollTimeout) {
        clearTimeout(scrollTimeout);
    }
    
    // Check if user is at bottom
    if (isAtBottom(chatOverlayMessages)) {
        // User scrolled to bottom
        isUserScrolling = false;
        chatOverlayMessages.classList.remove('scrolling');
        chatOverlayMessages.classList.add('idle');
        hideNewMessageIndicator();
    } else {
        // User is scrolling up (viewing history)
        isUserScrolling = true;
        chatOverlayMessages.classList.remove('idle');
        chatOverlayMessages.classList.add('scrolling');
        // Always show indicator when user scrolls up
        showNewMessageIndicator();
    }
    
    // Reset to idle after 2 seconds of no scrolling (if at bottom)
    scrollTimeout = setTimeout(() => {
        if (isAtBottom(chatOverlayMessages)) {
            isUserScrolling = false;
            chatOverlayMessages.classList.remove('scrolling');
            chatOverlayMessages.classList.add('idle');
        }
    }, 2000);
}

// 🎯 Toggle chat visibility
function toggleChatOverlay() {
    if (!chatOverlay) return;
    
    isChatCollapsed = !isChatCollapsed;
    
    if (isChatCollapsed) {
        // Collapse chat
        chatOverlay.classList.add('collapsed');
        if (chatOverlayToggle) {
            const icon = chatOverlayToggle.querySelector('i');
            if (icon) icon.className = 'fas fa-comment-slash';
        }
    } else {
        // Expand chat
        chatOverlay.classList.remove('collapsed');
        if (chatOverlayToggle) {
            const icon = chatOverlayToggle.querySelector('i');
            if (icon) icon.className = 'fas fa-comment';
        }
        
        // Clear unread count and scroll to bottom
        unreadMessages = 0;
        updateChatBadge();
        
        // Scroll to bottom after expanding
        setTimeout(() => {
            scrollToBottom(chatOverlayMessages);
            isUserScrolling = false;
        }, 100);
    }
}

// 🎯 Update chat badge (unread count)
function updateChatBadge() {
    if (!chatBadge) return;
    
    if (unreadMessages > 0) {
        chatBadge.style.display = 'flex';
        chatBadge.textContent = unreadMessages > 99 ? '99+' : unreadMessages;
    } else {
        chatBadge.style.display = 'none';
    }
}

// 🔥 Send message from overlay input
function sendOverlayMessage() {
    const message = chatOverlayInput.value.trim();
    if (!message || !socket) return;
    
    socket.emit('chat-message', {
        message: message,
        roomId: currentRoom
    });
    
    chatOverlayInput.value = '';
}

// 🎯 Toggle overlay emoji picker
function toggleOverlayEmojiPicker(e) {
    e.stopPropagation();
    if (chatOverlayEmojiPicker.classList.contains('hidden')) {
        showOverlayEmojiPicker();
    } else {
        hideOverlayEmojiPicker();
    }
}

// 🎯 Show overlay emoji picker
function showOverlayEmojiPicker() {
    if (!chatOverlayEmojiPicker) return;
    chatOverlayEmojiPicker.classList.remove('hidden');
    chatOverlayEmojiBtn.classList.add('active');
    
    // Populate emojis if not already done
    if (chatOverlayEmojiGrid && chatOverlayEmojiGrid.children.length === 0) {
        populateOverlayEmojis('smileys');
        
        // Add category click handlers
        const categories = chatOverlayEmojiPicker.querySelectorAll('.emoji-category');
        categories.forEach(cat => {
            cat.addEventListener('click', function() {
                categories.forEach(c => c.classList.remove('active'));
                this.classList.add('active');
                populateOverlayEmojis(this.dataset.category);
            });
        });
    }
}

// 🎯 Hide overlay emoji picker
function hideOverlayEmojiPicker() {
    if (!chatOverlayEmojiPicker) return;
    chatOverlayEmojiPicker.classList.add('hidden');
    chatOverlayEmojiBtn.classList.remove('active');
}

// 🎯 Populate overlay emoji grid
function populateOverlayEmojis(category) {
    if (!chatOverlayEmojiGrid) return;
    chatOverlayEmojiGrid.innerHTML = '';
    const emojis = emojiData[category] || emojiData.smileys;
    
    emojis.forEach(emoji => {
        const emojiBtn = document.createElement('button');
        emojiBtn.className = 'emoji-item';
        emojiBtn.textContent = emoji;
        emojiBtn.addEventListener('click', () => {
            insertOverlayEmoji(emoji);
        });
        chatOverlayEmojiGrid.appendChild(emojiBtn);
    });
}

// 🎯 Insert emoji into overlay input
function insertOverlayEmoji(emoji) {
    if (!chatOverlayInput) return;
    const cursorPos = chatOverlayInput.selectionStart;
    const textBefore = chatOverlayInput.value.substring(0, cursorPos);
    const textAfter = chatOverlayInput.value.substring(chatOverlayInput.selectionEnd);
    
    chatOverlayInput.value = textBefore + emoji + textAfter;
    chatOverlayInput.focus();
    
    // Set cursor position after emoji
    const newPos = cursorPos + emoji.length;
    chatOverlayInput.setSelectionRange(newPos, newPos);
    
    hideOverlayEmojiPicker();
}

// 🔥 Show/hide chat overlay visibility in fullscreen
function showChatOverlay(show) {
    if (!chatOverlay) return;
    
    if (show) {
        chatOverlay.classList.remove('hidden');
    } else {
        chatOverlay.classList.add('hidden');
    }
}

// 🎯 Start dragging chat overlay
function startDragChatOverlay(e) {
    if (!chatOverlay) return;
    
    // Don't drag when clicking on input or send button
    if (e.target === chatOverlayInput || e.target === chatOverlaySendBtn) return;
    if (e.target.closest('.chat-overlay-input-container')) return;
    
    // Don't drag when clicking inside messages (for scrolling/selecting text)
    // Unless it's the toggle button
    if (e.target !== chatOverlayToggle && !e.target.closest('#chat-overlay-toggle')) {
        if (e.target === chatOverlayMessages || e.target.closest('.chat-overlay-message')) {
            // Only drag messages area if shift key is pressed
            if (!e.shiftKey) return;
        }
    }
    
    isDragging = true;
    
    // Get current position or use computed style
    const rect = chatOverlay.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    
    // Add dragging cursor
    chatOverlay.style.cursor = 'grabbing';
    if (chatOverlayToggle) chatOverlayToggle.style.cursor = 'grabbing';
    
    // Prevent text selection while dragging
    e.preventDefault();
}

// 🎯 Drag chat overlay
function dragChatOverlay(e) {
    if (!isDragging || !chatOverlay) return;
    
    // Calculate new position
    let newX = e.clientX - dragOffsetX;
    let newY = e.clientY - dragOffsetY;
    
    // Get container bounds (video container or window)
    const container = videoContainer || document.body;
    const containerRect = container.getBoundingClientRect();
    const overlayRect = chatOverlay.getBoundingClientRect();
    
    // Constrain to container bounds
    const maxX = containerRect.width - overlayRect.width;
    const maxY = containerRect.height - overlayRect.height;
    
    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));
    
    // Apply position
    chatOverlay.style.left = newX + 'px';
    chatOverlay.style.bottom = 'auto';
    chatOverlay.style.top = newY + 'px';
    
    // Save position
    chatPosition.x = newX;
    chatPosition.y = newY;
}

// 🎯 Stop dragging chat overlay
function stopDragChatOverlay(e) {
    if (!isDragging) return;
    
    isDragging = false;
    
    // Restore cursor
    if (chatOverlay) chatOverlay.style.cursor = '';
    if (chatOverlayToggle) chatOverlayToggle.style.cursor = 'pointer';
    
    // Prevent click event from firing if we dragged
    if (e.target === chatOverlayToggle && (Math.abs(dragOffsetX) > 5 || Math.abs(dragOffsetY) > 5)) {
        e.stopPropagation();
    }
}

// 🔥 Check if video is in fullscreen
function isFullscreen() {
    return !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
    );
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

// 🎮 Initialize Custom Controls
function initializeCustomControls() {
    if (!customControls) return;
    
    // Play/Pause button
    if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlayPause);
    
    // Rewind/Forward buttons
    if (rewindBtn) rewindBtn.addEventListener('click', () => seekRelative(-10));
    if (forwardBtn) forwardBtn.addEventListener('click', () => seekRelative(10));
    
    // Volume controls
    if (volumeBtn) volumeBtn.addEventListener('click', toggleMute);
    if (volumeSlider) volumeSlider.addEventListener('input', handleVolumeChange);
    
    // Fullscreen button
    if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);
    
    // Progress bar seeking
    if (progressBar) {
        progressBar.addEventListener('mousedown', startSeeking);
        progressBar.addEventListener('click', handleProgressClick);
    }
    
    // Video click overlay (click anywhere to play/pause)
    if (videoClickOverlay) videoClickOverlay.addEventListener('click', handleVideoClick);
    
    // Mouse movement detection for auto-hide controls
    if (videoContainer) {
        videoContainer.addEventListener('mousemove', showControlsTemporarily);
        videoContainer.addEventListener('mouseleave', hideControls);
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Update progress bar continuously
    setInterval(updateProgressBar, 100);
    
    // Update fullscreen button on fullscreen change
    document.addEventListener('fullscreenchange', updateFullscreenButton);
    document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
    document.addEventListener('mozfullscreenchange', updateFullscreenButton);
    document.addEventListener('MSFullscreenChange', updateFullscreenButton);
    
    // Speed control
    if (speedBtn) {
        speedBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSpeedMenu();
        });
    }
    
    if (speedMenu) {
        const speedOptions = speedMenu.querySelectorAll('.speed-option');
        speedOptions.forEach(option => {
            option.addEventListener('click', () => {
                const speed = parseFloat(option.dataset.speed);
                setPlaybackSpeed(speed);
                toggleSpeedMenu();
            });
        });
    }
    
    // Quality control
    if (qualityBtn) {
        qualityBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleQualityMenu();
        });
    }
    
    // Quality options will be populated dynamically by loadAvailableQualities()
    
    // Caption control
    if (captionBtn) {
        captionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCaptionMenu();
        });
    }
    
    if (captionMenu) {
        // "Off" option listener
        const offOption = captionMenu.querySelector('[data-track="off"]');
        if (offOption) {
            offOption.addEventListener('click', () => {
                setCaptions('off');
                toggleCaptionMenu();
            });
        }
    }
    
    // Close menus when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.speed-control') && 
            !e.target.closest('.quality-control') && 
            !e.target.closest('.caption-control')) {
            closeAllMenus();
        }
    });
    
    console.log('✅ Custom controls initialized');
}

// 🎮 Toggle Play/Pause
function togglePlayPause() {
    if (!player || !isPlayerReady) return;
    
    // 🔥 Block User interaction in Live Mode
    if (isLiveMode && !isAdmin) {
        console.log('🚫 User cannot control play/pause in Live Mode');
        return;
    }
    
    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
        player.pauseVideo();
    } else {
        player.playVideo();
    }
    
    updatePlayPauseButton();
}

// 🎮 Update Play/Pause button icon
function updatePlayPauseButton() {
    if (!player || !isPlayerReady || !playPauseBtn) return;
    
    const state = player.getPlayerState();
    const icon = playPauseBtn.querySelector('i');
    
    if (icon) {
        if (state === YT.PlayerState.PLAYING) {
            icon.className = 'fas fa-pause';
        } else {
            icon.className = 'fas fa-play';
        }
    }
}

// 🎮 Seek relative (forward/backward)
function seekRelative(seconds) {
    if (!player || !isPlayerReady) return;
    
    // 🔥 Block User interaction in Live Mode
    if (isLiveMode && !isAdmin) {
        console.log('🚫 User cannot seek in Live Mode');
        return;
    }
    
    const currentTime = player.getCurrentTime();
    const duration = player.getDuration();
    const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
    
    player.seekTo(newTime, true);
}

// 🎮 Toggle Mute
function toggleMute() {
    if (!player || !isPlayerReady) return;
    
    if (player.isMuted()) {
        player.unMute();
        player.setVolume(lastVolume);
        updateVolumeIcon(lastVolume);
        if (volumeSlider) volumeSlider.value = lastVolume;
    } else {
        lastVolume = player.getVolume();
        player.mute();
        updateVolumeIcon(0);
        if (volumeSlider) volumeSlider.value = 0;
    }
}

// 🎮 Handle volume change
function handleVolumeChange(e) {
    if (!player || !isPlayerReady) return;
    
    const volume = parseInt(e.target.value);
    player.setVolume(volume);
    
    if (volume === 0) {
        player.mute();
    } else {
        player.unMute();
        lastVolume = volume;
    }
    
    updateVolumeIcon(volume);
}

// 🎮 Update volume icon
function updateVolumeIcon(volume) {
    if (!volumeBtn) return;
    
    const icon = volumeBtn.querySelector('i');
    
    if (icon) {
        if (volume === 0) {
            icon.className = 'fas fa-volume-mute';
        } else if (volume < 50) {
            icon.className = 'fas fa-volume-down';
        } else {
            icon.className = 'fas fa-volume-up';
        }
    }
}

// 🎮 Toggle Fullscreen (KEY FIX: Request fullscreen on WRAPPER, not iframe)
function toggleFullscreen() {
    if (!videoContainer) return;
    
    if (!isFullscreen()) {
        // Request fullscreen on WRAPPER div (contains video + overlay + controls)
        if (videoContainer.requestFullscreen) {
            videoContainer.requestFullscreen();
        } else if (videoContainer.webkitRequestFullscreen) {
            videoContainer.webkitRequestFullscreen();
        } else if (videoContainer.mozRequestFullScreen) {
            videoContainer.mozRequestFullScreen();
        } else if (videoContainer.msRequestFullscreen) {
            videoContainer.msRequestFullscreen();
        }
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
}

// 🎮 Update fullscreen button icon
function updateFullscreenButton() {
    if (!fullscreenBtn) return;
    
    const icon = fullscreenBtn.querySelector('i');
    
    if (icon) {
        if (isFullscreen()) {
            icon.className = 'fas fa-compress';
        } else {
            icon.className = 'fas fa-expand';
        }
    }
}

// 🎮 Start seeking (mousedown on progress bar)
function startSeeking(e) {
    isSeeking = true;
    handleProgressClick(e);
    
    document.addEventListener('mousemove', handleSeeking);
    document.addEventListener('mouseup', stopSeeking);
}

// 🎮 Handle seeking (mousemove)
function handleSeeking(e) {
    if (!isSeeking) return;
    handleProgressClick(e);
}

// 🎮 Stop seeking (mouseup)
function stopSeeking() {
    isSeeking = false;
    document.removeEventListener('mousemove', handleSeeking);
    document.removeEventListener('mouseup', stopSeeking);
}

// 🎮 Handle progress bar click
function handleProgressClick(e) {
    if (!player || !isPlayerReady || !progressBar) return;
    
    // 🔥 Block User interaction in Live Mode
    if (isLiveMode && !isAdmin) {
        console.log('🚫 User cannot seek via progress bar in Live Mode');
        return;
    }
    
    const rect = progressBar.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const duration = player.getDuration();
    const newTime = pos * duration;
    
    player.seekTo(newTime, true);
    updateProgressBar();
}

// 🎮 Update progress bar
function updateProgressBar() {
    if (!player || !isPlayerReady || !progressFilled || !progressHandle) return;
    
    try {
        const currentTime = player.getCurrentTime();
        const duration = player.getDuration();
        
        if (duration > 0) {
            const percentage = (currentTime / duration) * 100;
            progressFilled.style.width = percentage + '%';
            progressHandle.style.left = percentage + '%';
            
            // Update time displays
            if (currentTimeDisplay) currentTimeDisplay.textContent = formatTime(currentTime);
            if (durationDisplay) durationDisplay.textContent = formatTime(duration);
        }
    } catch (error) {
        // Ignore errors when player is not ready
    }
    
    // Update play/pause button
    updatePlayPauseButton();
}

// 🎮 Format time (seconds to MM:SS)
function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// 🎮 Handle video click (click anywhere on video to play/pause)
function handleVideoClick(e) {
    e.stopPropagation();
    
    // 🔥 Block User interaction in Live Mode
    if (isLiveMode && !isAdmin) {
        console.log('🚫 User cannot click video in Live Mode');
        showNotification('Chỉ Admin mới có thể điều khiển video trong Live Mode', 'warning');
        return;
    }
    
    togglePlayPause();
    
    // Show click animation
    if (videoClickOverlay) {
        videoClickOverlay.classList.add('clicked');
        setTimeout(() => {
            videoClickOverlay.classList.remove('clicked');
        }, 300);
    }
}

// 🎮 Show controls temporarily (on mouse move)
function showControlsTemporarily() {
    if (!customControls) return;
    
    customControls.classList.add('visible');
    if (videoContainer) {
        videoContainer.classList.add('controls-visible');
        videoContainer.classList.remove('controls-hidden');
    }
    
    // Clear existing timeout
    if (controlsTimeout) {
        clearTimeout(controlsTimeout);
    }
    
    // Auto-hide after 3 seconds of inactivity (only in fullscreen)
    controlsTimeout = setTimeout(() => {
        if (!isFullscreen()) return;
        hideControls();
    }, 3000);
}

// 🎮 Hide controls
function hideControls() {
    if (!customControls) return;
    
    customControls.classList.remove('visible');
    if (videoContainer) {
        videoContainer.classList.add('controls-hidden');
        videoContainer.classList.remove('controls-visible');
    }
}

// 🎮 Keyboard shortcuts
function handleKeyboardShortcuts(e) {
    // Don't trigger if typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    if (!player || !isPlayerReady) return;
    
    switch(e.key.toLowerCase()) {
        case ' ':
        case 'k':
            e.preventDefault();
            togglePlayPause();
            break;
        case 'arrowleft':
            e.preventDefault();
            seekRelative(-10);
            break;
        case 'arrowright':
            e.preventDefault();
            seekRelative(10);
            break;
        case 'm':
            e.preventDefault();
            toggleMute();
            break;
        case 'f':
            e.preventDefault();
            toggleFullscreen();
            break;
        case 'arrowup':
            e.preventDefault();
            adjustVolume(10);
            break;
        case 'arrowdown':
            e.preventDefault();
            adjustVolume(-10);
            break;
    }
}

// 🎮 Adjust volume by amount
function adjustVolume(amount) {
    if (!player || !isPlayerReady) return;
    
    const currentVolume = player.getVolume();
    const newVolume = Math.max(0, Math.min(100, currentVolume + amount));
    
    player.setVolume(newVolume);
    if (volumeSlider) volumeSlider.value = newVolume;
    updateVolumeIcon(newVolume);
    
    if (newVolume > 0) {
        player.unMute();
        lastVolume = newVolume;
    }
}

// 🎮 Set Playback Speed
function setPlaybackSpeed(speed) {
    if (!player || !isPlayerReady) return;
    
    try {
        player.setPlaybackRate(speed);
        currentSpeed = speed;
        
        // Update button text
        if (speedBtn) {
            const speedText = speedBtn.querySelector('.speed-text');
            if (speedText) {
                speedText.textContent = speed === 1 ? '1x' : speed + 'x';
            }
        }
        
        // Update active state
        if (speedMenu) {
            const options = speedMenu.querySelectorAll('.speed-option');
            options.forEach(opt => {
                if (parseFloat(opt.dataset.speed) === speed) {
                    opt.classList.add('active');
                } else {
                    opt.classList.remove('active');
                }
            });
        }
        
        // Emit to other users if admin
        if (isAdmin && socket) {
            socket.emit('playback-speed-change', {
                speed: speed,
                roomId: currentRoom
            });
        }
        
        console.log('Playback speed set to:', speed);
    } catch (error) {
        console.error('Failed to set playback speed:', error);
    }
}

// 🎮 Toggle Quality Menu
function toggleQualityMenu() {
    if (!qualityMenu) return;
    
    const isVisible = qualityMenu.classList.contains('visible');
    
    // Close speed and caption menus if open
    if (speedMenu) speedMenu.classList.remove('visible');
    if (captionMenu) captionMenu.classList.remove('visible');
    
    if (isVisible) {
        qualityMenu.classList.remove('visible');
    } else {
        qualityMenu.classList.add('visible');
    }
}

// 🎮 Load Available Quality Levels
function loadAvailableQualities() {
    if (!player || !isPlayerReady || !qualityMenu) return;
    
    // Only show loading if menu is currently empty or has loading state
    const currentContent = qualityMenu.innerHTML;
    if (!currentContent || currentContent.includes('quality-loading')) {
        showQualityLoading();
    }
    
    try {
        // Get available quality levels from YouTube API
        const qualityLevels = player.getAvailableQualityLevels();
        
        // Filter out empty strings and 'auto'/'default' from the list
        const validQualities = qualityLevels.filter(q => q && q !== 'auto' && q !== 'default');
        
        if (validQualities && validQualities.length > 0) {
            // Found actual quality levels (not just auto)
            availableQualities = validQualities;
            buildQualityMenu(validQualities);
        } else {
            // No quality levels available yet or only auto
            // Don't overwrite if we already have qualities loaded
            if (availableQualities.length === 0) {
                buildAutoQualityMenu();
            }
        }
    } catch (error) {
        if (availableQualities.length === 0) {
            buildAutoQualityMenu();
        }
    }
}

// Show loading state in quality menu
function showQualityLoading() {
    if (!qualityMenu) return;
    
    qualityMenu.innerHTML = '';
    const loadingOption = document.createElement('div');
    loadingOption.className = 'quality-option quality-loading';
    loadingOption.style.cssText = 'opacity: 0.7; cursor: wait; pointer-events: none;';
    loadingOption.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải...';
    qualityMenu.appendChild(loadingOption);
}

// Build quality menu with all available levels
function buildQualityMenu(qualityLevels) {
    if (!qualityMenu) return;
    
    qualityMenu.innerHTML = '';
    
    // Quality name mapping
    const qualityNames = {
        'highres': '4K/8K',
        'hd2160': '4K (2160p)',
        'hd1440': '1440p',
        'hd1080': '1080p',
        'hd720': '720p',
        'large': '480p',
        'medium': '360p',
        'small': '240p',
        'tiny': '144p',
        'auto': 'Auto',
        'default': 'Auto'
    };
    
    // Add "Auto" option first (default active)
    const autoOption = document.createElement('div');
    autoOption.className = 'quality-option active';
    autoOption.dataset.quality = 'auto';
    autoOption.innerHTML = '<i class="fas fa-magic"></i> Auto';
    autoOption.addEventListener('click', () => {
        setVideoQuality('auto');
        toggleQualityMenu();
    });
    qualityMenu.appendChild(autoOption);
    
    // Add separator
    const separator = document.createElement('div');
    separator.className = 'quality-separator';
    separator.style.cssText = 'height: 1px; background: rgba(255,255,255,0.1); margin: 4px 0;';
    qualityMenu.appendChild(separator);
    
    // Add available quality levels
    qualityLevels.forEach((quality) => {
        // Skip 'auto' or 'default' as we already added it
        if (quality === 'auto' || quality === 'default') return;
        
        const option = document.createElement('div');
        option.className = 'quality-option';
        option.dataset.quality = quality;
        
        const displayName = qualityNames[quality] || quality.toUpperCase();
        
        // Add HD icon for HD qualities
        if (quality.startsWith('hd') || quality === 'highres') {
            option.innerHTML = `<i class="fas fa-film"></i> ${displayName}`;
        } else {
            option.innerHTML = `<i class="fas fa-video"></i> ${displayName}`;
        }
        
        option.addEventListener('click', () => {
            setVideoQuality(quality);
            toggleQualityMenu();
        });
        
        qualityMenu.appendChild(option);
    });
}

// Build auto-only quality menu (fallback)
function buildAutoQualityMenu() {
    if (!qualityMenu) return;
    
    qualityMenu.innerHTML = '';
    
    const autoOption = document.createElement('div');
    autoOption.className = 'quality-option active';
    autoOption.dataset.quality = 'auto';
    autoOption.innerHTML = '<i class="fas fa-magic"></i> Auto';
    autoOption.addEventListener('click', () => {
        setVideoQuality('auto');
        toggleQualityMenu();
    });
    qualityMenu.appendChild(autoOption);
}

// 🎮 Set Video Quality
function setVideoQuality(quality) {
    if (!player || !isPlayerReady) return;
    
    try {
        if (quality === 'auto' || quality === 'default') {
            // Reset to auto quality by setting to highest available
            const availableLevels = player.getAvailableQualityLevels();
            if (availableLevels && availableLevels.length > 0) {
                // Set to first available (usually highest)
                player.setPlaybackQuality(availableLevels[0]);
            }
            currentQuality = 'auto';
        } else {
            // Set specific quality
            player.setPlaybackQuality(quality);
            currentQuality = quality;
        }
        
        // Update active state in menu
        if (qualityMenu) {
            const options = qualityMenu.querySelectorAll('.quality-option');
            options.forEach(opt => {
                if (opt.dataset.quality === quality) {
                    opt.classList.add('active');
                } else {
                    opt.classList.remove('active');
                }
            });
        }
        
        // Update quality button display
        updateQualityButtonDisplay(quality);
        
        // Emit to other users if admin
        if (isAdmin && socket) {
            socket.emit('video-quality-change', {
                quality: quality,
                roomId: currentRoom
            });
        }
        
        // Show system message
        const qualityNames = {
            'highres': '4K/8K',
            'hd2160': '4K',
            'hd1440': '1440p',
            'hd1080': '1080p',
            'hd720': '720p',
            'large': '480p',
            'medium': '360p',
            'small': '240p',
            'tiny': '144p',
            'auto': 'Auto',
            'default': 'Auto'
        };
        const displayName = qualityNames[quality] || quality.toUpperCase();
        displaySystemMessage(`Chất lượng: ${displayName}`);
        
    } catch (error) {
        displaySystemMessage('⚠️ Không thể thay đổi chất lượng video');
    }
}

// Update quality button display text
function updateQualityButtonDisplay(quality) {
    if (!qualityBtn) return;
    
    const qualityIcon = qualityBtn.querySelector('.quality-icon');
    if (!qualityIcon) return;
    
    const qualityDisplay = {
        'highres': '4K',
        'hd2160': '4K',
        'hd1440': '2K',
        'hd1080': 'FHD',
        'hd720': 'HD',
        'large': '480',
        'medium': '360',
        'small': '240',
        'tiny': '144',
        'auto': 'HD',
        'default': 'HD'
    };
    
    qualityIcon.textContent = qualityDisplay[quality] || 'HD';
}

// 🎮 Toggle Caption Menu
function toggleCaptionMenu() {
    if (!captionMenu) return;
    
    const isVisible = captionMenu.classList.contains('visible');
    
    // Close other menus
    if (speedMenu) speedMenu.classList.remove('visible');
    if (qualityMenu) qualityMenu.classList.remove('visible');
    
    if (isVisible) {
        captionMenu.classList.remove('visible');
    } else {
        captionMenu.classList.add('visible');
    }
}

// 🎮 Toggle Speed Menu
function toggleSpeedMenu() {
    if (!speedMenu) return;
    
    const isVisible = speedMenu.classList.contains('visible');
    
    // Close other menus
    if (qualityMenu) qualityMenu.classList.remove('visible');
    if (captionMenu) captionMenu.classList.remove('visible');
    
    if (isVisible) {
        speedMenu.classList.remove('visible');
    } else {
        speedMenu.classList.add('visible');
    }
}

// 🎮 Load Available Captions
function loadAvailableCaptions() {
    if (!player || !isPlayerReady || !captionMenu) return;
    
    // Only show loading if menu is currently empty or has loading state
    const currentContent = captionMenu.innerHTML;
    if (!currentContent || currentContent.includes('caption-loading')) {
        showCaptionLoading();
    }
    
    try {
        const options = player.getOptions();
        
        if (options && options.includes('captions')) {
            // Load captions module first to ensure it's available
            try {
                player.loadModule('captions');
            } catch (e) {
                // Module already loaded or not needed
            }
            
            // Wait for module to load
            setTimeout(() => {
                try {
                    const trackInfo = player.getOption('captions', 'tracklist');
                    
                    if (trackInfo && Array.isArray(trackInfo) && trackInfo.length > 0) {
                        availableCaptions = trackInfo;
                        buildCaptionMenu(trackInfo);
                        return;
                    }
                } catch (err) {
                    // Failed to get tracklist
                }
                
                // No captions available
                // Don't overwrite if we already have captions loaded
                if (availableCaptions.length === 0) {
                    buildNoCaptionsMenu();
                }
            }, 500);
            
        } else {
            // Captions option not available
            if (availableCaptions.length === 0) {
                buildNoCaptionsMenu();
            }
        }
        
    } catch (error) {
        if (availableCaptions.length === 0) {
            buildNoCaptionsMenu();
        }
    }
}

// Show loading state in caption menu
function showCaptionLoading() {
    if (!captionMenu) return;
    
    captionMenu.innerHTML = '';
    const loadingOption = document.createElement('div');
    loadingOption.className = 'caption-option caption-loading';
    loadingOption.style.cssText = 'opacity: 0.7; cursor: wait; pointer-events: none;';
    loadingOption.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải phụ đề...';
    captionMenu.appendChild(loadingOption);
}

// Build full caption menu with all tracks
function buildCaptionMenu(trackInfo) {
    if (!captionMenu) return;
    
    captionMenu.innerHTML = '';
    
    // Check if we need to apply the previous caption preference
    let foundPreviousTrack = false;
    
    // Add "Off" option
    const offOption = document.createElement('div');
    offOption.className = 'caption-option';
    offOption.dataset.track = 'off';
    offOption.innerHTML = '<i class="fas fa-times"></i> Tắt phụ đề';
    offOption.addEventListener('click', () => {
        setCaptions('off');
        toggleCaptionMenu();
    });
    
    // Set "Off" as active if no caption language is saved
    if (!currentCaptionLangCode) {
        offOption.classList.add('active');
    }
    
    captionMenu.appendChild(offOption);
    
    // Add separator
    const separator = document.createElement('div');
    separator.className = 'caption-separator';
    separator.style.cssText = 'height: 1px; background: rgba(255,255,255,0.1); margin: 4px 0;';
    captionMenu.appendChild(separator);
    
    // Add available caption tracks
    trackInfo.forEach((track, index) => {
        const option = document.createElement('div');
        option.className = 'caption-option';
        option.dataset.track = index.toString();
        option.dataset.langCode = track.languageCode || '';
        option.dataset.langName = track.languageName || '';
        
        // Display format: "English" or "English (auto-generated)"
        let displayText = track.displayName || track.name || track.languageName || track.languageCode || `Track ${index + 1}`;
        
        // Check if this track matches the saved language preference
        if (currentCaptionLangCode && track.languageCode === currentCaptionLangCode && !foundPreviousTrack) {
            option.classList.add('active');
            foundPreviousTrack = true;
            // Apply this caption to the new video
            setTimeout(() => {
                setCaptions(index);
            }, 500);
        }
        
        // Add icon for auto-generated captions
        if (track.kind === 'asr' || displayText.toLowerCase().includes('auto')) {
            option.innerHTML = `<i class="fas fa-robot"></i> ${displayText}`;
        } else {
            option.innerHTML = `<i class="fas fa-closed-captioning"></i> ${displayText}`;
        }
        
        option.addEventListener('click', () => {
            setCaptions(index);
            toggleCaptionMenu();
        });
        
        captionMenu.appendChild(option);
    });
    
    // If previous language not found in new video, turn off captions
    if (currentCaptionLangCode && !foundPreviousTrack) {
        offOption.classList.add('active');
        currentCaptionTrack = null;
        setTimeout(() => {
            try {
                player.unloadModule('captions');
                if (captionBtn) captionBtn.classList.remove('active');
                displaySystemMessage('Phụ đề: Tắt (video không có phụ đề đã chọn)');
            } catch (e) {
                // Ignore
            }
        }, 500);
    }
}

// Build "no captions available" menu
function buildNoCaptionsMenu() {
    if (!captionMenu) return;
    
    captionMenu.innerHTML = '';
    
    const noCaption = document.createElement('div');
    noCaption.className = 'caption-option caption-unavailable';
    noCaption.style.cssText = 'opacity: 0.6; cursor: not-allowed; pointer-events: none;';
    noCaption.innerHTML = '<i class="fas fa-info-circle"></i> Không có phụ đề';
    captionMenu.appendChild(noCaption);
}

// 🎮 Set Captions
function setCaptions(trackIndex) {
    if (!player || !isPlayerReady) return;
    
    try {
        if (trackIndex === 'off' || trackIndex === null) {
            // Turn off captions
            try {
                player.unloadModule('captions');
            } catch (e) {
                try {
                    player.setOption('captions', 'track', {});
                } catch (e2) {
                    // Could not turn off captions
                }
            }
            currentCaptionTrack = null;
            currentCaptionLangCode = null;
            
        } else if (trackIndex === 'on') {
            // Simple toggle on - enable first available track
            try {
                player.loadModule('captions');
                const options = player.getOptions();
                if (options && options.includes('captions')) {
                    const tracks = player.getOption('captions', 'tracklist');
                    if (tracks && tracks.length > 0) {
                        const firstTrack = tracks[0];
                        player.setOption('captions', 'track', {
                            'languageCode': firstTrack.languageCode,
                            'name': firstTrack.name || ''
                        });
                        currentCaptionLangCode = firstTrack.languageCode;
                    }
                }
            } catch (e) {
                // Could not enable captions
            }
            currentCaptionTrack = 'on';
            
        } else {
            // Turn on specific caption track by index
            const index = parseInt(trackIndex);
            
            if (!isNaN(index) && availableCaptions[index]) {
                const track = availableCaptions[index];
                
                try {
                    player.loadModule('captions');
                    
                    const trackOptions = {
                        'languageCode': track.languageCode
                    };
                    
                    if (track.name) trackOptions.name = track.name;
                    if (track.languageName) trackOptions.languageName = track.languageName;
                    
                    player.setOption('captions', 'track', trackOptions);
                    currentCaptionTrack = index;
                    currentCaptionLangCode = track.languageCode; // Save language code for next video
                } catch (e) {
                    displaySystemMessage('⚠️ Không thể bật phụ đề này');
                    return;
                }
            } else {
                return;
            }
        }
        
        // Update active state in menu
        if (captionMenu) {
            const options = captionMenu.querySelectorAll('.caption-option');
            options.forEach(opt => {
                if (opt.dataset.track == trackIndex) {
                    opt.classList.add('active');
                } else {
                    opt.classList.remove('active');
                }
            });
        }
        
        // Update caption button icon state
        if (captionBtn) {
            if (trackIndex === 'off' || trackIndex === null) {
                captionBtn.classList.remove('active');
            } else {
                captionBtn.classList.add('active');
            }
        }
        
        // Emit to other users if admin
        if (isAdmin && socket) {
            socket.emit('caption-change', {
                track: trackIndex,
                roomId: currentRoom
            });
        }
        
        // Show system message
        let captionText;
        if (trackIndex === 'off') {
            captionText = 'Tắt';
        } else if (trackIndex === 'on') {
            captionText = 'Bật';
        } else {
            const index = parseInt(trackIndex);
            if (!isNaN(index) && availableCaptions[index]) {
                captionText = availableCaptions[index].displayName || 
                              availableCaptions[index].languageName || 
                              availableCaptions[index].languageCode || 
                              'Bật';
            } else {
                captionText = 'Bật';
            }
        }
        displaySystemMessage(`Phụ đề: ${captionText}`);
        
    } catch (error) {
        displaySystemMessage('⚠️ Không thể thay đổi phụ đề cho video này');
    }
}

// 🎮 Close all menus when clicking outside
function closeAllMenus() {
    if (speedMenu) speedMenu.classList.remove('visible');
    if (qualityMenu) qualityMenu.classList.remove('visible');
    if (captionMenu) captionMenu.classList.remove('visible');
}

// 🎮 Update Live Mode UI
function updateLiveModeUI() {
    if (isLiveMode) {
        document.body.classList.add('is-live-mode');
    } else {
        document.body.classList.remove('is-live-mode');
    }
}

// Load YouTube video
function loadYouTubeVideo(videoId) {
    if (!videoId) return;
    
    videoPlaceholder.style.display = 'none';
    
    // Reset states for new video (but keep currentCaptionTrack to remember user preference)
    availableCaptions = [];
    // Don't reset currentCaptionTrack - we want to keep the user's caption preference
    availableQualities = [];
    currentQuality = 'auto';
    
    // Reset video title while loading
    if (videoTitle) {
        videoTitle.textContent = 'Đang tải...';
    }
    
    // Xác định player controls dựa trên live mode và admin status
    const playerControls = getPlayerControls();
    
    if (player) {
        player.loadVideoById(videoId);
        updatePlayerControls();
        
        // Update video title for new video
        setTimeout(() => {
            updateVideoTitle();
        }, 1000);
        
        // Reload quality levels for new video
        setTimeout(() => {
            loadAvailableQualities();
        }, 2000);
        
        setTimeout(() => {
            if (availableQualities.length === 0) {
                loadAvailableQualities();
            }
        }, 4000);
        
        setTimeout(() => {
            if (availableQualities.length === 0) {
                loadAvailableQualities();
            }
        }, 6000);
        
        // Reload captions for new video
        setTimeout(() => {
            loadAvailableCaptions();
        }, 2500);
        
        setTimeout(() => {
            if (availableCaptions.length === 0) {
                loadAvailableCaptions();
            }
        }, 5000);
        
        setTimeout(() => {
            if (availableCaptions.length === 0) {
                loadAvailableCaptions();
            }
        }, 7000);
    } else {
        player = new YT.Player('youtube-player', {
            height: '100%',
            width: '100%',
            videoId: videoId,
            playerVars: {
                'autoplay': 0,
                'controls': 0, // 🎮 Disable YouTube controls (use custom controls)
                'rel': 0,
                'showinfo': 0,
                'modestbranding': 1,
                'disablekb': 1, // 🎮 Disable YouTube keyboard (use custom shortcuts)
                'fs': 0, // 🎮 Disable YouTube fullscreen (use custom fullscreen)
                'iv_load_policy': 3, // Hide annotations
                'cc_load_policy': 0 // Don't auto-load captions, but make them available
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
    
    // Hide placeholder and loading
    if (videoPlaceholder) videoPlaceholder.style.display = 'none';
    if (loading) loading.style.display = 'none';
    
    // 🎮 Show custom controls and click overlay
    if (customControls) {
        customControls.classList.remove('hidden');
        customControls.classList.add('visible');
    }
    
    if (videoClickOverlay) {
        videoClickOverlay.classList.remove('hidden');
    }
    
    // 🎮 Initialize custom controls (only once)
    if (!window.customControlsInitialized) {
        initializeCustomControls();
        window.customControlsInitialized = true;
    }
    
    // 🎮 Set video title
    updateVideoTitle();
    
    // 🎮 Load available quality levels
    // Wait longer for YouTube to load video metadata
    setTimeout(() => {
        loadAvailableQualities();
    }, 2000);
    
    // 🎮 Retry loading quality levels if still only auto
    setTimeout(() => {
        if (availableQualities.length === 0) {
            loadAvailableQualities();
        }
    }, 4000);
    
    // 🎮 Final retry for quality levels
    setTimeout(() => {
        if (availableQualities.length === 0) {
            loadAvailableQualities();
        }
    }, 6000);
    
    // 🎮 Load available captions/subtitles
    // YouTube needs time to load caption tracks
    setTimeout(() => {
        loadAvailableCaptions();
    }, 2500);
    
    // 🎮 Retry loading captions for videos that load captions late
    setTimeout(() => {
        if (availableCaptions.length === 0) {
            loadAvailableCaptions();
        }
    }, 5000);
    
    // 🎮 Final retry for captions
    setTimeout(() => {
        if (availableCaptions.length === 0) {
            loadAvailableCaptions();
        }
    }, 7000);
}

// 🎮 Update Video Title
function updateVideoTitle() {
    if (!videoTitle || !player || !isPlayerReady) return;
    
    try {
        const videoData = player.getVideoData();
        if (videoData && videoData.title) {
            videoTitle.textContent = videoData.title;
        } else {
            videoTitle.textContent = 'Video YouTube';
        }
    } catch (error) {
        videoTitle.textContent = 'Video YouTube';
    }
}

// Player state change callback
function onPlayerStateChange(event) {
    if (!isPlayerReady) return;
    
    // 🔥 ANTI-FEEDBACK LOOP: Ignore events triggered by incoming syncs
    if (isReceivingSync || isSyncing) {
        console.log('🔄 Ignoring state change (receiving sync)');
        return;
    }
    
    // 🎮 Update video title and load quality/captions when video starts playing
    if (event.data === YT.PlayerState.PLAYING) {
        if (videoTitle && videoTitle.textContent === 'Đang tải...') {
            updateVideoTitle();
        }
        if (availableQualities.length === 0) {
            setTimeout(() => loadAvailableQualities(), 500);
        }
        if (availableCaptions.length === 0) {
            setTimeout(() => loadAvailableCaptions(), 1000);
        }
    }
    
    // 🔥 MODE 1: Live Mode ON - Only Admin can send commands
    if (isLiveMode) {
        if (!isAdmin) {
            // User cannot control in Live Mode - ignore all local interactions
            console.log('🚫 User blocked in Live Mode');
            return;
        }
        // Admin can send commands immediately (no debounce in Live Mode)
        console.log('👑 Admin sending command in Live Mode');
        emitVideoStateChange(event.data);
        return;
    }
    
    // 🔥 MODE 2: Live Mode OFF (Party Mode) - Everyone can control, but with debounce
    // Debounce to prevent rapid-fire events causing feedback loops
    if (syncDebounceTimeout) {
        clearTimeout(syncDebounceTimeout);
    }
    
    syncDebounceTimeout = setTimeout(() => {
        // Check again if we're not receiving sync (could have changed during debounce)
        if (!isReceivingSync && !isSyncing) {
            console.log('🎉 Party Mode: Sending state change');
            emitVideoStateChange(event.data);
        }
    }, 300); // 300ms debounce
}

// 🔥 Helper function to emit video state change
function emitVideoStateChange(playerState) {
    if (!player || !isPlayerReady) return;
    
    const state = {
        isPlaying: playerState === YT.PlayerState.PLAYING,
        currentTime: player.getCurrentTime(),
        playerState: playerState,
        timestamp: Date.now() // Add timestamp for tracking
    };
    
    // Emit legacy format
    socket.emit('video-state-change', {
        state: state,
        roomId: currentRoom
    });

    // ⚡ Emit compact format
    const stateMap = {
        [YT.PlayerState.ENDED]: 3,
        [YT.PlayerState.PLAYING]: 1,
        [YT.PlayerState.PAUSED]: 0,
        [YT.PlayerState.BUFFERING]: 2,
        [YT.PlayerState.CUED]: 0
    };
    const compactState = stateMap[playerState] !== undefined ? stateMap[playerState] : 0;
    const currentTime = Math.floor(player.getCurrentTime() * 10) / 10;
    
    socket.emit('vs', [compactState, currentTime, Date.now()]);
    
    console.log('📤 Sent:', compactState === 1 ? 'PLAY' : 'PAUSE', 'at', currentTime);
}

// ⚡ OPTIMIZED: Sync video state from compact format
// Format: [state, time, timestamp] where state: 0=paused, 1=playing, 2=buffering, 3=ended
function syncVideoStateCompact(state, time, timestamp) {
    if (!player || !isPlayerReady) return;
    
    // 🔥 ANTI-FEEDBACK LOOP: Check if this sync is too recent (ignore duplicates)
    const now = Date.now();
    if (timestamp && Math.abs(now - timestamp) > 5000) {
        // Ignore syncs older than 5 seconds (stale data)
        console.log('⏰ Ignoring stale sync:', (now - timestamp) / 1000, 'seconds old');
        return;
    }
    
    // 🔥 ANTI-FEEDBACK LOOP: Prevent rapid successive syncs
    if (now - lastSyncTimestamp < 200) {
        console.log('⚡ Ignoring rapid sync (< 200ms)');
        return;
    }
    lastSyncTimestamp = now;
    
    // 🔥 Set flags to prevent feedback loop
    isReceivingSync = true;
    isSyncing = true;
    
    console.log('📥 Received:', state === 1 ? 'PLAY' : 'PAUSE', 'at', time);
    
    try {
        const currentTime = player.getCurrentTime();
        const currentState = player.getPlayerState();
        const timeDiff = Math.abs(currentTime - time);
        
        // 🔥 MODE 1: Live Mode - Users must follow Admin strictly
        if (isLiveMode && !isAdmin) {
            console.log('👥 User syncing to Admin');
            
            // Sync time if difference > 0.5 second (strict sync in Live Mode)
            if (timeDiff > 0.5) {
                player.seekTo(time, true);
            }
            
            // Sync play state
            if (state === 1 && currentState !== YT.PlayerState.PLAYING) {
                player.playVideo();
            } else if (state === 0 && currentState === YT.PlayerState.PLAYING) {
                player.pauseVideo();
            }
            
            showSyncIndicator();
        }
        
        // 🔥 MODE 2: Party Mode - Gentle sync (only if significantly different)
        else if (!isLiveMode) {
            console.log('🎉 Party Mode: Gentle sync');
            
            // Sync time only if difference > 2 seconds (more tolerant in Party Mode)
            if (timeDiff > 2) {
                player.seekTo(time, true);
            }
            
            // Sync play state
            if (state === 1 && currentState !== YT.PlayerState.PLAYING) {
                player.playVideo();
            } else if (state === 0 && currentState === YT.PlayerState.PLAYING) {
                player.pauseVideo();
            }
        }
        
    } catch (error) {
        console.error('❌ Sync error:', error);
    } finally {
        // 🔥 CRITICAL: Clear flags after a delay to allow player state to settle
        setTimeout(() => {
            isReceivingSync = false;
        }, 500);
        
        setTimeout(() => {
            isSyncing = false;
        }, 800);
    }
}

// Sync video state (Legacy format - for backward compatibility)
function syncVideoState(state) {
    if (!player || !isPlayerReady) return;
    
    // 🔥 ANTI-FEEDBACK LOOP: Check timestamp if available
    const now = Date.now();
    if (state.timestamp) {
        if (Math.abs(now - state.timestamp) > 5000) {
            console.log('⏰ Ignoring stale legacy sync');
            return;
        }
        if (now - lastSyncTimestamp < 200) {
            console.log('⚡ Ignoring rapid legacy sync');
            return;
        }
        lastSyncTimestamp = now;
    }
    
    // 🔥 Set flags to prevent feedback loop
    isReceivingSync = true;
    isSyncing = true;
    
    console.log('📥 Received (legacy):', state.isPlaying ? 'PLAY' : 'PAUSE', 'at', state.currentTime);
    
    try {
        const currentTime = player.getCurrentTime();
        const currentState = player.getPlayerState();
        const timeDiff = Math.abs(currentTime - state.currentTime);
        
        // 🔥 MODE 1: Live Mode - Users must follow Admin strictly
        if (isLiveMode && !isAdmin) {
            console.log('👥 User syncing to Admin (legacy)');
            
            // Strict sync in Live Mode
            if (state.forceSync || state.adminControl || timeDiff > 0.5) {
                player.seekTo(state.currentTime, true);
            }
            
            // Sync play/pause state
            if (state.isPlaying && currentState !== YT.PlayerState.PLAYING) {
                player.playVideo();
            } else if (!state.isPlaying && currentState === YT.PlayerState.PLAYING) {
                player.pauseVideo();
            }
            
            showSyncIndicator();
        }
        
        // 🔥 MODE 2: Party Mode - Gentle sync
        else if (!isLiveMode) {
            console.log('🎉 Party Mode: Gentle sync (legacy)');
            
            // Gentle sync - only if difference > 2 seconds
            if (timeDiff > 2) {
                player.seekTo(state.currentTime, true);
            }
            
            // Sync play/pause state
            if (state.isPlaying && currentState !== YT.PlayerState.PLAYING) {
                player.playVideo();
            } else if (!state.isPlaying && currentState === YT.PlayerState.PLAYING) {
                player.pauseVideo();
            }
        }
        
    } catch (error) {
        console.error('❌ Sync error (legacy):', error);
    } finally {
        // 🔥 CRITICAL: Clear flags after a delay
        setTimeout(() => {
            isReceivingSync = false;
        }, 500);
        
        setTimeout(() => {
            isSyncing = false;
        }, 800);
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
    
    // ⚡ OPTIMIZED: Faster sync with compact format and volatile
    adminSyncInterval = setInterval(() => {
        if (isAdmin && isLiveMode && player && isPlayerReady && !isSyncing) {
            const ps = player.getPlayerState();
            
            // Only sync when playing to reduce traffic
            if (ps === YT.PlayerState.PLAYING) {
                // Map YT states to compact: 0=paused, 1=playing, 2=buffering, 3=ended
                const stateMap = {
                    [YT.PlayerState.ENDED]: 3,
                    [YT.PlayerState.PLAYING]: 1,
                    [YT.PlayerState.PAUSED]: 0,
                    [YT.PlayerState.BUFFERING]: 2,
                    [YT.PlayerState.CUED]: 0
                };
                const compactState = stateMap[ps] !== undefined ? stateMap[ps] : 1;
                const currentTime = Math.floor(player.getCurrentTime() * 10) / 10;
                
                // ⚡ Send compact format [state, time]
                // Server will handle volatile emission
                socket.emit('vs', [compactState, currentTime]);
            }
        }
    }, 200); // ⚡ 200ms instead of 1000ms = 5x faster sync
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


