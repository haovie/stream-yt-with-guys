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

// ============================================================================
// 🕐 TIMESTAMP UTILITY
// ============================================================================
function getFormattedTime() {
    return new Date().toLocaleTimeString('vi-VN');
}

// ============================================================================
// 🎨 USER COLOR GENERATOR - Generate unique colors for each user
// ============================================================================
function getUserColor(username) {
    // Hash function to generate consistent number from username
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
        hash = hash & hash; // Convert to 32bit integer
    }
    
    // Generate HSL color with good saturation and lightness
    const hue = Math.abs(hash % 360); // 0-359 degrees
    const saturation = 65 + (Math.abs(hash) % 20); // 65-85%
    const lightness = 55 + (Math.abs(hash >> 8) % 15); // 55-70%
    
    return {
        hue: hue,
        primary: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
        background: `hsla(${hue}, ${saturation}%, ${lightness}%, 0.25)`,
        border: `hsla(${hue}, ${saturation}%, ${lightness}%, 0.4)`
    };
}

// 🔥 ANTI-FEEDBACK LOOP: Variables to prevent infinite sync loops
let lastSyncTimestamp = 0; // Timestamp of last received sync
let syncDebounceTimeout = null; // Timeout for debouncing outgoing syncs
let isReceivingSync = false; // Flag to indicate we're currently processing incoming sync

// ============================================================================
// 🚀 VIDEO SYNC STATE MANAGER (Client-side)
// ============================================================================
let videoStateManager = null;
let videoSyncController = null;

class VideoSyncStateManager {
    constructor() {
        this.serverState = {
            isPlaying: false,
            currentTime: 0,
            lastUpdate: Date.now(),
            playbackRate: 1,
            videoId: null
        };
        
        // Configuration (Balanced profile)
        this.DRIFT_TOLERANCE = 2.0;          // Force seek if drift > 2s
        this.SMALL_DRIFT_TOLERANCE = 0.5;    // Ignore drift < 0.5s
        this.SYNC_INTERVAL = 5000;           // Check every 5s
        this.DEBOUNCE_DELAY = 300;           // 300ms debounce
        
        // Flags
        this.isReceivingSync = false;
        this.isSeeking = false;
        this.syncDebounceTimer = null;
        this.lastSyncTime = 0;
    }
    
    getPredictedTime() {
        if (!this.serverState.isPlaying) {
            return this.serverState.currentTime;
        }
        const timeSinceUpdate = (Date.now() - this.serverState.lastUpdate) / 1000;
        return this.serverState.currentTime + (timeSinceUpdate * this.serverState.playbackRate);
    }
    
    calculateDrift(localTime) {
        return Math.abs(localTime - this.getPredictedTime());
    }
    
    shouldSync(localTime) {
        return this.calculateDrift(localTime) > this.DRIFT_TOLERANCE;
    }
    
    updateServerState(state) {
        this.serverState = { ...state, lastUpdate: Date.now() };
        this.lastSyncTime = Date.now();
    }
}

class ClientVideoSyncController {
    constructor(player, socket, roomId, stateManager) {
        this.player = player;
        this.socket = socket;
        this.roomId = roomId;
        this.stateManager = stateManager;
        
        this.eventOrigin = {
            HUMAN: 'human',
            SYSTEM: 'system',
            NETWORK: 'network'
        };
        
        this.currentEventOrigin = this.eventOrigin.SYSTEM;
        this.seekDebounceTimer = null;
        
        this.setupPeriodicSync();
    }
    
    markEventOrigin(origin) {
        this.currentEventOrigin = origin;
        setTimeout(() => {
            if (this.currentEventOrigin !== this.eventOrigin.NETWORK) {
                this.currentEventOrigin = this.eventOrigin.SYSTEM;
            }
        }, 500);  // ✅ Increased from 100ms to 500ms
    }
    
    onPlayerStateChange(event) {
        const state = event.data;
        const currentTime = this.player.getCurrentTime();
        
        // Anti-feedback loop protection
        if (this.currentEventOrigin === this.eventOrigin.NETWORK) {
            this.currentEventOrigin = this.eventOrigin.SYSTEM;
            updatePlayPauseButton(); // ✅ Update UI even for network events
            return;
        }
        
        if (this.stateManager.isReceivingSync) {
            updatePlayPauseButton(); // ✅ Update UI
            return;
        }
        
        // ✅ Handle ENDED state: Don't broadcast ENDED, wait for next state (PLAYING or CUED)
        if (state === YT.PlayerState.ENDED) {
            // User might click play to replay, wait for PLAYING state
            return;
        }
        
        // Human-triggered event - broadcast it
        if (this.currentEventOrigin === this.eventOrigin.HUMAN) {
            this.broadcastStateChange(state, currentTime);
        }
        
        // Update local state
        this.stateManager.serverState.isPlaying = (state === YT.PlayerState.PLAYING);
        this.stateManager.serverState.currentTime = currentTime;
        this.stateManager.serverState.lastUpdate = Date.now();
        
        // ✅ Always update UI after state change
        updatePlayPauseButton();
    }
    
    getStateName(state) {
        const stateNames = {
            '-1': 'UNSTARTED',
            '0': 'ENDED',
            '1': 'PLAYING',
            '2': 'PAUSED',
            '3': 'BUFFERING',
            '5': 'CUED'
        };
        return stateNames[state] || 'UNKNOWN';
    }
    
    broadcastStateChange(state, currentTime) {
        if (this.stateManager.syncDebounceTimer) {
            clearTimeout(this.stateManager.syncDebounceTimer);
        }
        
        this.stateManager.syncDebounceTimer = setTimeout(() => {
            const syncData = {
                isPlaying: state === YT.PlayerState.PLAYING,
                currentTime: currentTime,
                playerState: state,
                timestamp: Date.now(),
                playbackRate: this.player.getPlaybackRate()
                // quality: Removed - deprecated API method
            };
            
            this.socket.emit('video-state-change', {
                state: syncData,
                roomId: this.roomId
            });
        }, this.stateManager.DEBOUNCE_DELAY);
    }
    
    receiveSync(state) {
        this.stateManager.updateServerState(state);
        
        const currentTime = this.player.getCurrentTime();
        const currentState = this.player.getPlayerState();
        const isCurrentlyPlaying = (currentState === YT.PlayerState.PLAYING);
        
        // ✅ Sync play/pause state even with minimal drift
        if (state.isPlaying !== isCurrentlyPlaying) {
            this.markEventOrigin(this.eventOrigin.NETWORK);
            if (state.isPlaying) {
                this.player.playVideo();
            } else {
                this.player.pauseVideo();
            }
            updatePlayPauseButton();
        }
        
        // Quality sync removed - deprecated API methods
        // YouTube now automatically manages quality
        
        const drift = this.stateManager.calculateDrift(currentTime);
        
        // Small drift - ignore seek but keep play/pause synced
        if (drift <= this.stateManager.SMALL_DRIFT_TOLERANCE) {
            return;
        }
        
        // Moderate drift - adjust playback rate
        if (drift <= this.stateManager.DRIFT_TOLERANCE) {
            this.adjustPlaybackRate(drift, currentTime, state.currentTime);
            return;
        }
        
        // Large drift - force seek
        this.performSeek(state.currentTime, state.isPlaying);
    }
    
    adjustPlaybackRate(drift, currentTime, targetTime) {
        const needsCatchUp = currentTime < targetTime;
        const tempRate = needsCatchUp ? 1.15 : 0.85;
        
        this.markEventOrigin(this.eventOrigin.NETWORK);
        this.player.setPlaybackRate(tempRate);
        
        setTimeout(() => {
            this.markEventOrigin(this.eventOrigin.NETWORK);
            this.player.setPlaybackRate(1.0);
        }, 3000);
    }
    
    performSeek(targetTime, shouldPlay) {
        this.stateManager.isReceivingSync = true;
        this.markEventOrigin(this.eventOrigin.NETWORK);
        
        this.player.seekTo(targetTime, true);
        
        setTimeout(() => {
            this.markEventOrigin(this.eventOrigin.NETWORK);
            if (shouldPlay && this.player.getPlayerState() !== YT.PlayerState.PLAYING) {
                this.player.playVideo();
            } else if (!shouldPlay && this.player.getPlayerState() === YT.PlayerState.PLAYING) {
                this.player.pauseVideo();
            }
            
            // ✅ Update UI after sync
            setTimeout(() => {
                updatePlayPauseButton();
            }, 100);
            
            setTimeout(() => {
                this.stateManager.isReceivingSync = false;
            }, 500);
        }, 100);
    }
    
    setupPeriodicSync() {
        setInterval(() => {
            if (this.stateManager.isSeeking) return;
            
            const timeSinceLastSync = Date.now() - this.stateManager.lastSyncTime;
            if (timeSinceLastSync < 2000) return;
            
            const currentTime = this.player.getCurrentTime();
            if (this.stateManager.shouldSync(currentTime)) {
                this.socket.emit('request-sync', { roomId: this.roomId });
            }
        }, this.stateManager.SYNC_INTERVAL);
    }
    
    handleUserPlay() {
        this.markEventOrigin(this.eventOrigin.HUMAN);
        
        // ✅ Broadcast IMMEDIATELY before playing (don't wait for onStateChange)
        const currentTime = this.player.getCurrentTime();
        const syncData = {
            isPlaying: true,
            currentTime: currentTime,
            playerState: YT.PlayerState.PLAYING,
            timestamp: Date.now(),
            playbackRate: this.player.getPlaybackRate()
            // quality: Removed - deprecated API method
        };
        
        this.socket.emit('video-state-change', {
            state: syncData,
            roomId: this.roomId
        });
        
        // ✅ If video has ended, seek to beginning before playing
        const state = this.player.getPlayerState();
        if (state === YT.PlayerState.ENDED || state === 0) {
            this.player.seekTo(0, true);
            setTimeout(() => {
                this.markEventOrigin(this.eventOrigin.NETWORK); // Prevent re-broadcast
                this.player.playVideo();
            }, 100);
        } else {
            this.markEventOrigin(this.eventOrigin.NETWORK); // Prevent re-broadcast
            this.player.playVideo();
        }
    }
    
    handleUserPause() {
        this.markEventOrigin(this.eventOrigin.HUMAN);
        
        // ✅ Broadcast IMMEDIATELY before pausing (don't wait for onStateChange)
        const currentTime = this.player.getCurrentTime();
        const syncData = {
            isPlaying: false,
            currentTime: currentTime,
            playerState: YT.PlayerState.PAUSED,
            timestamp: Date.now(),
            playbackRate: this.player.getPlaybackRate()
            // quality: Removed - deprecated API method
        };
        
        this.socket.emit('video-state-change', {
            state: syncData,
            roomId: this.roomId
        });
        
        this.markEventOrigin(this.eventOrigin.NETWORK); // Prevent re-broadcast
        this.player.pauseVideo();
    }
    
    handleSeekStart() {
        this.stateManager.isSeeking = true;
    }
    
    handleSeekEnd(targetTime) {
        // ✅ Use handleUserSeekTo for immediate broadcast approach
        this.handleUserSeekTo(targetTime);
        
        // ✅ Reset seeking state after a short delay
        setTimeout(() => {
            this.stateManager.isSeeking = false;
        }, 100);
    }
    
    // 🎮 Handle User Seek (Rewind/Forward) - Approach tương tự Play/Pause
    handleUserSeek(seconds) {
        this.markEventOrigin(this.eventOrigin.HUMAN);
        
        // ✅ Calculate new time
        const currentTime = this.player.getCurrentTime();
        const duration = this.player.getDuration();
        const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
        
        // ✅ Broadcast IMMEDIATELY before seeking (don't wait for onStateChange)
        const currentState = this.player.getPlayerState();
        const syncData = {
            isPlaying: currentState === YT.PlayerState.PLAYING,
            currentTime: newTime,
            playerState: currentState,
            timestamp: Date.now(),
            playbackRate: this.player.getPlaybackRate()
            // quality: Removed - deprecated API method
        };
        
        this.socket.emit('video-state-change', {
            state: syncData,
            roomId: this.roomId
        });
        
        // ✅ Mark as network action to prevent re-broadcast
        this.markEventOrigin(this.eventOrigin.NETWORK);
        this.player.seekTo(newTime, true);
    }
    
    // 🎮 Handle User Seek To (Progress Bar Click) - Approach tương tự Play/Pause
    handleUserSeekTo(targetTime) {
        this.markEventOrigin(this.eventOrigin.HUMAN);
        
        // ✅ Clamp target time to valid range
        const duration = this.player.getDuration();
        const newTime = Math.max(0, Math.min(duration, targetTime));
        
        // ✅ Broadcast IMMEDIATELY before seeking (don't wait for onStateChange)
        const currentState = this.player.getPlayerState();
        const syncData = {
            isPlaying: currentState === YT.PlayerState.PLAYING,
            currentTime: newTime,
            playerState: currentState,
            timestamp: Date.now(),
            playbackRate: this.player.getPlaybackRate()
            // quality: Removed - deprecated API method
        };
        
        this.socket.emit('video-state-change', {
            state: syncData,
            roomId: this.roomId
        });
        
        // ✅ Mark as network action to prevent re-broadcast
        this.markEventOrigin(this.eventOrigin.NETWORK);
        this.player.seekTo(newTime, true);
    }
    
    // 🎮 Handle User Seek To with Known State (Progress Bar Drag)
    // Used when we know the original state before seeking started
    handleUserSeekToWithState(targetTime, originalState) {
        this.markEventOrigin(this.eventOrigin.HUMAN);
        
        // ✅ Clamp target time to valid range
        const duration = this.player.getDuration();
        const newTime = Math.max(0, Math.min(duration, targetTime));
        
        // ✅ Broadcast IMMEDIATELY with ORIGINAL state (before drag started)
        // This ensures other users maintain the correct play/pause state
        const wasPlaying = originalState === YT.PlayerState.PLAYING;
        const syncData = {
            isPlaying: wasPlaying,
            currentTime: newTime,
            playerState: originalState,
            timestamp: Date.now(),
            playbackRate: this.player.getPlaybackRate()
            // quality: Removed - deprecated API method
        };
        
        this.socket.emit('video-state-change', {
            state: syncData,
            roomId: this.roomId
        });
        
        // ✅ Mark as network action to prevent re-broadcast
        this.markEventOrigin(this.eventOrigin.NETWORK);
        this.player.seekTo(newTime, true);
        
        // ✅ Restore original play/pause state after seeking
        setTimeout(() => {
            this.markEventOrigin(this.eventOrigin.NETWORK);
            if (wasPlaying && this.player.getPlayerState() !== YT.PlayerState.PLAYING) {
                this.player.playVideo();
            }
            
            // ✅ Reset seeking state after restoring play state
            setTimeout(() => {
                this.stateManager.isSeeking = false;
            }, 50);
        }, 100);
    }
}

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
let stateBeforeSeeking = null; // Store player state before drag to restore after
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
            
            // 📱 Also clean up iOS fullscreen if exiting via native API
            if (videoContainer && videoContainer.classList.contains('is-ios-fullscreen')) {
                exitIOSFullscreen();
            }
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
        socket.emit('join-room', { username, roomId, adminPassword });
        
        hideLoading();
        hideJoinModal();
    });
    
    socket.on('disconnect', () => {
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
    
    // Quality change socket listener - DISABLED (deprecated API)
    // Quality is now auto-managed by YouTube
    socket.on('video-quality-change', (data) => {
        // No longer supported - quality control is deprecated
        displaySystemMessage('⚠️ Chất lượng video tự động bởi YouTube');
    });
    
    socket.on('caption-change', (data) => {
        if (!isAdmin) {
            if (data.track === 'off') {
                setCaptions('off', false);
                displaySystemMessage('Admin: Đã tắt phụ đề');
            } else {
                let targetIndex = data.track;
                if (data.langCode && availableCaptions && availableCaptions.length > 0) {
                    const found = availableCaptions.findIndex(t => t.languageCode === data.langCode);
                    if (found !== -1) {
                        targetIndex = found;
                    }
                }
                setCaptions(targetIndex, false);
                const captionText = (availableCaptions && availableCaptions[targetIndex]?.displayName) || 
                                    (availableCaptions && availableCaptions[targetIndex]?.languageName) || 'Bật';
                displaySystemMessage(`Admin đổi phụ đề: ${captionText}`);
            }
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
        if (videoSyncController) {
            videoSyncController.receiveSync(state);
        } else {
            syncVideoState(state);
        }
    });
    
    // ✅ NEW: Handle sync response
    socket.on('sync-response', (state) => {
        if (videoSyncController) {
            videoSyncController.receiveSync(state);
        }
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
        timestamp: getFormattedTime(),
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
    
    // Get timestamp - use data.timestamp if available, otherwise generate new one
    const timestamp = data.timestamp || getFormattedTime();
    
    // 🎨 Generate unique color for each user (not for own messages or system)
    if (!data.isSystem && data.username !== currentUser) {
        const userColor = getUserColor(data.username);
        messageDiv.style.background = userColor.background;
        messageDiv.style.borderColor = userColor.border;
        messageDiv.style.border = `1px solid ${userColor.border}`;
    }
    
    // Create message content with timestamp
    if (data.isSystem) {
        messageDiv.innerHTML = `
            <span class="chat-overlay-message-content">${escapeHtml(data.message)}</span>
            <span class="chat-overlay-message-timestamp">${timestamp}</span>
        `;
    } else {
        // 🎨 Apply username color
        const userColor = !data.isSystem && data.username !== currentUser ? getUserColor(data.username) : null;
        const usernameColor = userColor ? userColor.primary : '';
        const usernameStyle = usernameColor ? `style="color: ${usernameColor};"` : '';
        
        messageDiv.innerHTML = `
            <span class="chat-overlay-message-username" ${usernameStyle}>${escapeHtml(data.username)}:</span>
            <span class="chat-overlay-message-content">${escapeHtml(data.message)}</span>
            <span class="chat-overlay-message-timestamp">${timestamp}</span>
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
    // Check for native Fullscreen API
    const nativeFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
    );
    
    // Also check for iOS/Mobile CSS fallback mode
    const iOSFullscreen = videoContainer && videoContainer.classList.contains('is-ios-fullscreen');
    
    return nativeFullscreen || iOSFullscreen;
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
    
    // Quality control - DISABLED (deprecated API)
    // Quality is now auto-managed by YouTube
    if (qualityBtn) {
        // Remove click interaction - quality button is now read-only display
        qualityBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Show message that quality is auto-managed
            displaySystemMessage('⚠️ Chất lượng video tự động bởi YouTube (không thể điều chỉnh thủ công)');
        });
        
        // Update button style to indicate it's read-only
        qualityBtn.style.opacity = '0.7';
        qualityBtn.style.cursor = 'not-allowed';
        qualityBtn.title = 'Chất lượng tự động (không thể thay đổi)';
    }
    
    // Hide quality menu since we can't change quality manually
    if (qualityMenu) {
        qualityMenu.style.display = 'none';
    }
    
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
    
}

// 🎮 Toggle Play/Pause
function togglePlayPause() {
    if (!player || !isPlayerReady) return;
    
    // 🔥 Block User interaction in Live Mode
    if (isLiveMode && !isAdmin) {
        return;
    }
    
    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
        if (videoSyncController) {
            videoSyncController.handleUserPause();
        } else {
            player.pauseVideo();
        }
    } else {
        if (videoSyncController) {
            videoSyncController.handleUserPlay();
        } else {
            player.playVideo();
        }
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
        return;
    }
    
    // ✅ Use videoSyncController with immediate broadcast approach
    if (videoSyncController) {
        videoSyncController.handleUserSeek(seconds);
    } else {
        const currentTime = player.getCurrentTime();
        const duration = player.getDuration();
        const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
        player.seekTo(newTime, true);
    }
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
// 📱 iOS Safari & Mobile Fallback: Use CSS-based fullscreen for unsupported browsers
function toggleFullscreen() {
    if (!videoContainer) return;
    
    // 📱 Detect iOS Safari and mobile browsers that don't support Fullscreen API on divs
    const isIOSSafari = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isMobileSafari = /Safari/.test(navigator.userAgent) && /Mobile/.test(navigator.userAgent);
    const isMobileChrome = /Chrome/.test(navigator.userAgent) && /Mobile/.test(navigator.userAgent);
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // 📱 Check if Fullscreen API is supported for divs (not just video elements)
    const supportsFullscreenAPI = !!(
        videoContainer.requestFullscreen ||
        videoContainer.webkitRequestFullscreen ||
        videoContainer.mozRequestFullScreen ||
        videoContainer.msRequestFullscreen
    );
    
    // 📱 iOS Safari and some mobile browsers: Use CSS fallback
    if ((isIOSSafari || isMobileSafari || (isMobile && !supportsFullscreenAPI))) {
        if (!videoContainer.classList.contains('is-ios-fullscreen')) {
            // Enter iOS fullscreen mode
            enterIOSFullscreen();
        } else {
            // Exit iOS fullscreen mode
            exitIOSFullscreen();
        }
        return;
    }
    
    // 🖥️ Desktop and Android/Mobile browsers with Fullscreen API support
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
        } else {
            // Fallback to CSS-based fullscreen if API fails
            enterIOSFullscreen();
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
        } else {
            // Fallback
            exitIOSFullscreen();
        }
    }
}

// 📱 Enter iOS/Mobile CSS-based Fullscreen Mode
function enterIOSFullscreen() {
    if (!videoContainer) return;
    
    // Add CSS class for iOS fullscreen
    videoContainer.classList.add('is-ios-fullscreen');
    document.body.classList.add('ios-fullscreen-active');
    
    // Show chat overlay (simulate fullscreen behavior)
    showChatOverlay(true);
    
    // Initialize chat overlay state
    setTimeout(() => {
        if (chatOverlayMessages) {
            scrollToBottom(chatOverlayMessages);
            isUserScrolling = false;
            newMessagesPending = 0;
            hideNewMessageIndicator();
            
            chatOverlayMessages.classList.remove('scrolling');
            chatOverlayMessages.classList.add('idle');
        }
        
        // Focus overlay input
        if (chatOverlayInput) {
            chatOverlayInput.focus();
        }
    }, 300);
    
    // Update fullscreen button icon
    updateFullscreenButton();
    
    // Prevent body scrolling
    document.body.style.overflow = 'hidden';
    
}

// 📱 Exit iOS/Mobile CSS-based Fullscreen Mode
function exitIOSFullscreen() {
    if (!videoContainer) return;
    
    // Remove CSS class for iOS fullscreen
    videoContainer.classList.remove('is-ios-fullscreen');
    document.body.classList.remove('ios-fullscreen-active');
    
    // Hide chat overlay
    showChatOverlay(false);
    
    // Reset state
    isUserScrolling = false;
    isChatCollapsed = false;
    unreadMessages = 0;
    
    // Update fullscreen button icon
    updateFullscreenButton();
    
    // Restore body scrolling
    document.body.style.overflow = '';
    
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
    
    // ✅ Save current player state before seeking
    // This ensures we restore the correct play/pause state after drag
    if (player && isPlayerReady) {
        stateBeforeSeeking = player.getPlayerState();
    }
    
    // ✅ Notify sync controller
    if (videoSyncController) {
        videoSyncController.handleSeekStart();
    }
    
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
function stopSeeking(e) {
    if (!isSeeking) return;
    
    // ✅ Get final seek position and broadcast with original state
    if (player && isPlayerReady && progressBar && videoSyncController) {
        const rect = progressBar.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        const duration = player.getDuration();
        const targetTime = pos * duration;
        
        // ✅ Use the state saved BEFORE drag started to maintain play/pause consistency
        if (stateBeforeSeeking !== null) {
            videoSyncController.handleUserSeekToWithState(targetTime, stateBeforeSeeking);
        } else {
            // Fallback if state wasn't saved
            videoSyncController.handleSeekEnd(targetTime);
        }
    }
    
    isSeeking = false;
    stateBeforeSeeking = null; // Reset saved state
    document.removeEventListener('mousemove', handleSeeking);
    document.removeEventListener('mouseup', stopSeeking);
    
    // ✅ Update progress bar immediately after seeking completes
    setTimeout(() => {
        updateProgressBar();
    }, 150);
}

// 🎮 Handle progress bar click
function handleProgressClick(e) {
    if (!player || !isPlayerReady || !progressBar) return;
    
    // 🔥 Block User interaction in Live Mode
    if (isLiveMode && !isAdmin) {
        return;
    }
    
    const rect = progressBar.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const duration = player.getDuration();
    const newTime = pos * duration;
    
    // ✅ If NOT in seeking mode (single click), broadcast immediately and seek
    if (!isSeeking && videoSyncController) {
        // Single click - use immediate broadcast approach
        videoSyncController.handleUserSeekTo(newTime);
    } else if (!isSeeking) {
        // Fallback if no videoSyncController
        player.seekTo(newTime, true);
    } else {
        // ✅ During drag - ONLY update visual (progress bar)
        // Do NOT seek video yet to avoid triggering multiple onStateChange events
        // The actual seek will happen once on mouseup via stopSeeking()
        updateProgressBarVisual(newTime, duration);
    }
}

// 🎮 Update progress bar
function updateProgressBar() {
    if (!player || !isPlayerReady || !progressFilled || !progressHandle) return;
    
    // ✅ Don't update progress bar while user is dragging
    if (isSeeking) return;
    
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

// 🎮 Update progress bar visual only (without querying player state)
// Used during drag to show seek position without actually seeking
function updateProgressBarVisual(currentTime, duration) {
    if (!progressFilled || !progressHandle) return;
    
    if (duration > 0) {
        const percentage = (currentTime / duration) * 100;
        progressFilled.style.width = percentage + '%';
        progressHandle.style.left = percentage + '%';
        
        // Update time displays
        if (currentTimeDisplay) currentTimeDisplay.textContent = formatTime(currentTime);
        if (durationDisplay) durationDisplay.textContent = formatTime(duration);
    }
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
        showNotification('Chỉ Admin mới có thể điều khiển video trong Live Mode', 'warning');
        return;
    }
    
    // ✅ Mark as human action before toggling
    if (videoSyncController) {
        const state = player.getPlayerState();
        if (state === YT.PlayerState.PLAYING) {
            videoSyncController.handleUserPause();
        } else {
            videoSyncController.handleUserPlay();
        }
        updatePlayPauseButton();
    } else {
        togglePlayPause();
    }
    
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
        case 'c':
            e.preventDefault();
            toggleCaptionShortcut();
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
        
    } catch (error) {
        console.error(`[${getFormattedTime()}] Failed to set playback speed:`, error);
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

// 🎮 Set Video Quality - DEPRECATED API (No-op function)
// YouTube IFrame API has deprecated quality control methods
// Quality is now automatically managed by YouTube
function setVideoQuality(quality) {
    if (!player || !isPlayerReady) return;
    
    // Display notification that quality is auto-managed
    displaySystemMessage('⚠️ Chất lượng video tự động bởi YouTube (không thể điều chỉnh thủ công)');
    
    // Always use auto quality
    currentQuality = 'auto';
    
    // Update UI to show auto
    updateQualityButtonDisplay('auto');
    
    // Note: No longer calling deprecated methods:
    // - player.setPlaybackQuality() - DEPRECATED
    // - player.getAvailableQualityLevels() - DEPRECATED
}

// 🎮 Helper function to format quality display names
function getQualityDisplayName(quality) {
    const names = {
        'small': '144p',
        'tiny': '144p',
        'medium': '360p',
        'large': '480p',
        'hd720': '720p',
        'hd1080': '1080p',
        'hd1440': '1440p',
        'hd2160': '4K',
        'highres': '4K+',
        'unknown': 'Auto',
        'default': 'Auto',
        'auto': 'Auto'
    };
    return names[quality] || quality;
}

// 🎮 Helper function for button display (shortened versions)
function getQualityButtonDisplay(quality) {
    const display = {
        'highres': '4K',
        'hd2160': '4K',
        'hd1440': '2K',
        'hd1080': 'FHD',
        'hd720': 'HD',
        'large': '480',
        'medium': '360',
        'small': '240',
        'tiny': '144',
        'auto': 'Auto',
        'default': 'Auto',
        'unknown': 'Auto'
    };
    return display[quality] || 'Auto';
}

// Update quality button display text
function updateQualityButtonDisplay(quality) {
    if (!qualityBtn) return;
    
    const qualityIcon = qualityBtn.querySelector('.quality-icon');
    if (!qualityIcon) return;
    
    qualityIcon.textContent = getQualityButtonDisplay(quality);
    
    // Update tooltip to indicate auto-quality
    qualityBtn.title = 'Chất lượng tự động (không thể thay đổi)';
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
        // If captions haven't been loaded yet and player is ready, attempt to load them
        if (availableCaptions.length === 0 && isPlayerReady) {
            loadAvailableCaptions();
        }
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
    
    // Ensure captions module is requested in the player
    try {
        if (typeof player.loadModule === 'function') {
            player.loadModule('captions');
            player.loadModule('cc');
        }
    } catch (e) {
        // Module might already be loaded or not supported
    }
    
    // Try to get tracklist from YouTube player
    let trackInfo = null;
    try {
        if (typeof player.getOption === 'function') {
            trackInfo = player.getOption('captions', 'tracklist') || player.getOption('cc', 'tracklist');
        }
    } catch (err) {
        // Track list not ready yet
    }
    
    if (trackInfo && Array.isArray(trackInfo) && trackInfo.length > 0) {
        availableCaptions = trackInfo;
        buildCaptionMenu(trackInfo);
    } else {
        // If tracks not available yet and availableCaptions is empty, show empty state
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
    
    // Restore caption button normal state
    if (captionBtn) {
        captionBtn.classList.remove('disabled');
        captionBtn.title = 'Phụ đề / Phụ đề chi tiết (Phím C)';
    }
    
    captionMenu.innerHTML = '';
    
    let activeTrackFound = false;
    
    // Add "Off" option
    const offOption = document.createElement('div');
    offOption.className = 'caption-option';
    offOption.dataset.track = 'off';
    offOption.innerHTML = '<i class="fas fa-times"></i> Tắt phụ đề';
    offOption.addEventListener('click', () => {
        setCaptions('off');
        toggleCaptionMenu();
    });
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
        
        // Display format: "English" or "Tiếng Việt (tự động)"
        let displayText = track.displayName || track.name || track.languageName || track.languageCode || `Phụ đề ${index + 1}`;
        
        // Check if this track matches the saved language preference or current active track
        if (currentCaptionLangCode && track.languageCode === currentCaptionLangCode && !activeTrackFound) {
            option.classList.add('active');
            activeTrackFound = true;
            // Apply this caption to the video
            setTimeout(() => {
                setCaptions(index, false);
            }, 300);
        } else if (currentCaptionTrack === index) {
            option.classList.add('active');
            activeTrackFound = true;
        }
        
        // Add icon for auto-generated vs manual captions
        const isAuto = track.kind === 'asr' || displayText.toLowerCase().includes('tự động') || displayText.toLowerCase().includes('auto');
        if (isAuto) {
            option.innerHTML = `<i class="fas fa-robot"></i> <span>${displayText}</span>`;
        } else {
            option.innerHTML = `<i class="fas fa-closed-captioning"></i> <span>${displayText}</span>`;
        }
        
        option.addEventListener('click', () => {
            setCaptions(index);
            toggleCaptionMenu();
        });
        
        captionMenu.appendChild(option);
    });
    
    // If no active track, mark "Off" as active
    if (!activeTrackFound) {
        offOption.classList.add('active');
        if (captionBtn) captionBtn.classList.remove('active');
    } else {
        if (captionBtn) captionBtn.classList.add('active');
    }
}

// Build "no captions available" menu
function buildNoCaptionsMenu() {
    if (!captionMenu) return;
    
    captionMenu.innerHTML = '';
    
    const noCaption = document.createElement('div');
    noCaption.className = 'caption-option caption-unavailable';
    noCaption.style.cssText = 'opacity: 0.75; cursor: default;';
    noCaption.innerHTML = '<i class="fas fa-info-circle"></i> Video không có phụ đề';
    captionMenu.appendChild(noCaption);
    
    if (captionBtn) {
        captionBtn.classList.remove('active');
        captionBtn.classList.add('disabled');
        captionBtn.title = 'Phụ đề: Video không có phụ đề';
    }
}

// 🎮 Set Captions
function setCaptions(trackIndex, shouldEmit = true) {
    if (!player || !isPlayerReady) return;
    
    try {
        if (trackIndex === 'off' || trackIndex === null) {
            // Turn off captions safely via player options without unloading module
            try {
                if (typeof player.setOption === 'function') {
                    player.setOption('captions', 'track', {});
                    player.setOption('cc', 'track', {});
                }
            } catch (e) {
                console.warn('Could not turn off captions:', e);
            }
            currentCaptionTrack = 'off';
            currentCaptionLangCode = null;
            
            if (captionBtn) {
                captionBtn.classList.remove('active');
            }
            
        } else {
            // Turn on specific caption track by index
            const index = parseInt(trackIndex);
            
            if (!isNaN(index) && availableCaptions[index]) {
                const track = availableCaptions[index];
                
                try {
                    if (typeof player.loadModule === 'function') {
                        player.loadModule('captions');
                        player.loadModule('cc');
                    }
                    
                    const trackOptions = {
                        'languageCode': track.languageCode
                    };
                    if (track.name) trackOptions.name = track.name;
                    if (track.languageName) trackOptions.languageName = track.languageName;
                    
                    if (typeof player.setOption === 'function') {
                        player.setOption('captions', 'track', trackOptions);
                        player.setOption('cc', 'track', trackOptions);
                    }
                    
                    currentCaptionTrack = index;
                    currentCaptionLangCode = track.languageCode; // Save language code for next video
                    
                    if (captionBtn) {
                        captionBtn.classList.add('active');
                    }
                } catch (e) {
                    console.warn('Error setting caption track:', e);
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
        
        // Emit to other users if admin
        if (shouldEmit && isAdmin && socket) {
            socket.emit('caption-change', {
                track: trackIndex,
                langCode: currentCaptionLangCode,
                roomId: currentRoom
            });
        }
        
        // Show system message
        if (shouldEmit) {
            let captionText;
            if (trackIndex === 'off' || trackIndex === null) {
                captionText = 'Tắt';
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
        }
        
    } catch (error) {
        console.warn('Error in setCaptions:', error);
        displaySystemMessage('⚠️ Không thể thay đổi phụ đề cho video này');
    }
}

// 🎮 Toggle caption shortcut (Key C)
function toggleCaptionShortcut() {
    if (!player || !isPlayerReady) return;
    if (availableCaptions.length === 0) {
        displaySystemMessage('ℹ️ Video này không có phụ đề');
        return;
    }
    if (currentCaptionTrack === 'off' || currentCaptionTrack === null) {
        setCaptions(0);
    } else {
        setCaptions('off');
    }
}

// 🎮 onPlayerApiChange callback
function onPlayerApiChange(event) {
    loadAvailableCaptions();
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
        
        // Reset caption states for new video
        availableCaptions = [];
        currentCaptionTrack = null;
        if (captionBtn) {
            captionBtn.classList.remove('active', 'disabled');
            captionBtn.title = 'Phụ đề / Phụ đề chi tiết (Phím C)';
        }
        showCaptionLoading();
        
        // Update video title for new video
        setTimeout(() => {
            updateVideoTitle();
        }, 1000);
        
        // Reload captions for new video
        setTimeout(() => {
            loadAvailableCaptions();
        }, 1200);
        
        setTimeout(() => {
            if (availableCaptions.length === 0) {
                loadAvailableCaptions();
            }
        }, 3000);
        
        setTimeout(() => {
            if (availableCaptions.length === 0) {
                loadAvailableCaptions();
            }
        }, 5500);
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
                'cc_load_policy': 0, // Don't auto-load captions, but make them available
                'vq': 'auto' // Auto quality (recommended, though quality control is deprecated)
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange,
                'onApiChange': onPlayerApiChange
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
    
    // ✅ Initialize sync system
    videoStateManager = new VideoSyncStateManager();
    videoSyncController = new ClientVideoSyncController(
        player,
        socket,
        currentRoom,
        videoStateManager
    );
    
    // 🎮 Add event listener for auto-quality changes (monitoring only)
    // This allows us to display current quality when YouTube changes it automatically
    player.addEventListener('onPlaybackQualityChange', function(event) {
        const newQuality = event.data; // e.g., 'hd1080', 'medium'
        currentQuality = newQuality; // Update local state
        updateQualityButtonDisplay(newQuality); // Display on UI (read-only)
        displaySystemMessage(`📊 Chất lượng tự động: ${getQualityDisplayName(newQuality)}`);
    });
    
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
    
    // 🎮 Load available quality levels - DEPRECATED API
    // Quality control methods are deprecated by YouTube IFrame API
    // setTimeout(() => {
    //     loadAvailableQualities();
    // }, 2000);
    
    // // 🎮 Retry loading quality levels if still only auto
    // setTimeout(() => {
    //     if (availableQualities.length === 0) {
    //         loadAvailableQualities();
    //     }
    // }, 4000);
    
    // // 🎮 Final retry for quality levels
    // setTimeout(() => {
    //     if (availableQualities.length === 0) {
    //         loadAvailableQualities();
    //     }
    // }, 6000);
    
    // Ensure onApiChange is listened to
    try {
        player.addEventListener('onApiChange', onPlayerApiChange);
    } catch (e) {}

    // 🎮 Load available captions/subtitles
    // YouTube needs time to load caption tracks
    setTimeout(() => {
        loadAvailableCaptions();
    }, 1200);
    
    // 🎮 Retry loading captions for videos that load captions late
    setTimeout(() => {
        if (availableCaptions.length === 0) {
            loadAvailableCaptions();
        }
    }, 3000);
    
    // 🎮 Final retry for captions
    setTimeout(() => {
        if (availableCaptions.length === 0) {
            loadAvailableCaptions();
        }
    }, 5500);
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
    
    // ✅ Use new sync controller if available
    if (videoSyncController) {
        videoSyncController.onPlayerStateChange(event);
        
        // Keep UI updates
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
        return;
    }
    
    // 🔥 FALLBACK: Old behavior for backward compatibility
    if (isReceivingSync || isSyncing) {
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
            return;
        }
        emitVideoStateChange(event.data);
        return;
    }
    
    // 🔥 MODE 2: Live Mode OFF (Party Mode) - Everyone can control, but with debounce
    if (syncDebounceTimeout) {
        clearTimeout(syncDebounceTimeout);
    }
    
    syncDebounceTimeout = setTimeout(() => {
        if (!isReceivingSync && !isSyncing) {
            emitVideoStateChange(event.data);
        }
    }, 300);
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
}

// ⚡ OPTIMIZED: Sync video state from compact format
// Format: [state, time, timestamp] where state: 0=paused, 1=playing, 2=buffering, 3=ended
function syncVideoStateCompact(state, time, timestamp) {
    if (!player || !isPlayerReady) return;
    
    // 🔥 ANTI-FEEDBACK LOOP: Check if this sync is too recent (ignore duplicates)
    const now = Date.now();
    if (timestamp && Math.abs(now - timestamp) > 5000) {
        // Ignore syncs older than 5 seconds (stale data)
        return;
    }
    
    // 🔥 ANTI-FEEDBACK LOOP: Prevent rapid successive syncs
    if (now - lastSyncTimestamp < 200) {
        return;
    }
    lastSyncTimestamp = now;
    
    // 🔥 Set flags to prevent feedback loop
    isReceivingSync = true;
    isSyncing = true;
    
    try {
        const currentTime = player.getCurrentTime();
        const currentState = player.getPlayerState();
        const timeDiff = Math.abs(currentTime - time);
        
        // 🔥 MODE 1: Live Mode - Users must follow Admin strictly
        if (isLiveMode && !isAdmin) {
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
        console.error(`[${getFormattedTime()}] ❌ Sync error:`, error);
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
            return;
        }
        if (now - lastSyncTimestamp < 200) {
            return;
        }
        lastSyncTimestamp = now;
    }
    
    // 🔥 Set flags to prevent feedback loop
    isReceivingSync = true;
    isSyncing = true;
    
    try {
        const currentTime = player.getCurrentTime();
        const currentState = player.getPlayerState();
        const timeDiff = Math.abs(currentTime - state.currentTime);
        
        // 🔥 MODE 1: Live Mode - Users must follow Admin strictly
        if (isLiveMode && !isAdmin) {
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
        console.error(`[${getFormattedTime()}] ❌ Sync error (legacy):`, error);
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
    
}

// Handle window beforeunload
window.addEventListener('beforeunload', function() {
    if (socket) {
        socket.disconnect();
    }
});


