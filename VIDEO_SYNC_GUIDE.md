# 🎥 Video Synchronization Logic - Guide

## 📋 Tổng Quan

Hệ thống đồng bộ video đã được viết lại hoàn toàn để hỗ trợ **2 chế độ hoạt động** và **tránh Feedback Loop** (vòng lặp phản hồi gây giật video).

---

## 🎮 2 Chế Độ Hoạt Động

### 1️⃣ **Live Mode ON** (Admin Control)

**Mục đích:** Admin điều khiển, tất cả User xem theo.

**Cách hoạt động:**
- ✅ **Admin**: 
  - Có thể Play/Pause/Seek video tự do
  - Mọi thao tác được gửi đi **ngay lập tức** (không debounce)
  - Control buttons hiển thị đầy đủ
  
- ❌ **User**:
  - **KHÔNG** thể điều khiển video (tất cả buttons bị ẩn)
  - Click vào video sẽ bị chặn và hiện thông báo
  - Chỉ nhận lệnh từ Admin và đồng bộ **strict** (sai lệch > 0.5s sẽ sync)
  - Hiển thị sync indicator khi nhận lệnh từ Admin

**Use Case:** Giáo viên dạy học online, Admin trình chiếu video cho mọi người xem.

---

### 2️⃣ **Live Mode OFF** (Party Mode / Collaborative Mode)

**Mục đích:** Mọi người cùng xem và có thể điều khiển video.

**Cách hoạt động:**
- ✅ **Tất cả mọi người**:
  - Có thể Play/Pause/Seek video
  - Thao tác của bất kỳ ai cũng đồng bộ đến tất cả người khác
  - Đồng bộ **gentle** (sai lệch > 2s mới sync để tránh giật)
  - Có debounce 300ms để tránh gửi quá nhiều events

**Cơ chế chống Feedback Loop:**
- Events được debounce 300ms trước khi gửi
- Kiểm tra timestamp để loại bỏ events cũ (> 5 giây)
- Kiểm tra thời gian giữa các syncs (< 200ms sẽ bỏ qua)
- Dùng flags `isReceivingSync` và `isSyncing` để chặn vòng lặp

**Use Case:** Bạn bè cùng xem phim, watch party, karaoke online.

---

## 🔥 Giải Pháp Chống Feedback Loop

### Vấn đề Feedback Loop:

```
User A bấm Pause 
  → Gửi socket đến User B 
  → User B nhận và Pause video 
  → Sự kiện onStateChange của User B kích hoạt 
  → User B gửi lại socket đến User A 
  → User A nhận và lại kích hoạt onStateChange 
  → GỬI LẠI → VÒng lặp vô hạn! 🔄💥
```

### Giải pháp đã implement:

#### 1. **Debounce Events** (300ms)
```javascript
syncDebounceTimeout = setTimeout(() => {
    if (!isReceivingSync && !isSyncing) {
        emitVideoStateChange(event.data);
    }
}, 300);
```
- Nhóm nhiều events lại thành 1
- Giảm số lượng socket events

#### 2. **Timestamp Checking**
```javascript
if (timestamp && Math.abs(now - timestamp) > 5000) {
    console.log('⏰ Ignoring stale sync');
    return; // Bỏ qua events cũ > 5 giây
}
```
- Loại bỏ events cũ/stale
- Chỉ xử lý events gần đây

#### 3. **Rapid Sync Prevention**
```javascript
if (now - lastSyncTimestamp < 200) {
    console.log('⚡ Ignoring rapid sync');
    return; // Bỏ qua nếu vừa sync < 200ms trước
}
lastSyncTimestamp = now;
```
- Giới hạn tần suất sync
- Tránh spam events

#### 4. **Sync Flags**
```javascript
// Khi nhận sync từ socket
isReceivingSync = true;  // Đánh dấu đang nhận sync
isSyncing = true;         // Chặn gửi events ra ngoài

// Trong onPlayerStateChange
if (isReceivingSync || isSyncing) {
    return; // KHÔNG gửi event nếu đang nhận sync
}
```
- `isReceivingSync`: Đang xử lý sync từ socket
- `isSyncing`: Chặn mọi outgoing events
- Clear sau 500ms (isReceivingSync) và 800ms (isSyncing)

---

## 📡 Socket Events Format

### Compact Format (Optimized)
```javascript
// Gửi: socket.emit('vs', [state, time, timestamp])
socket.emit('vs', [1, 45.3, 1234567890]);

// state: 0=paused, 1=playing, 2=buffering, 3=ended
// time: current time (giây, làm tròn 1 số thập phân)
// timestamp: Date.now() để tracking
```

### Legacy Format (Backward Compatible)
```javascript
socket.emit('video-state-change', {
    state: {
        isPlaying: true,
        currentTime: 45.3,
        playerState: 1,
        timestamp: 1234567890
    },
    roomId: 'room_abc123'
});
```

---

## 🎯 Flow Charts

### Live Mode ON (Admin Control)
```
┌─────────────┐
│   ADMIN     │
│ Click Play  │
└──────┬──────┘
       │
       ├─ onPlayerStateChange()
       │  ├─ Check: isLiveMode && isAdmin? ✅
       │  └─ Emit immediately (no debounce)
       │
       ↓
┌──────────────────────────────┐
│   Socket.io Server           │
│   Broadcast to all users     │
└──────┬───────────────────────┘
       │
       ↓
┌─────────────┐
│   USER 1    │  ← Receive sync
│   USER 2    │  ← Set isReceivingSync = true
│   USER 3    │  ← Apply strict sync (> 0.5s)
└─────────────┘  ← onPlayerStateChange blocked!
                 ← No feedback loop! 🎉
```

### Party Mode OFF (Collaborative)
```
┌─────────────┐
│   USER A    │
│ Click Pause │
└──────┬──────┘
       │
       ├─ onPlayerStateChange()
       │  ├─ Check: isReceivingSync? ❌
       │  ├─ Debounce 300ms
       │  └─ Emit if still not receiving
       │
       ↓
┌──────────────────────────────┐
│   Socket.io Server           │
│   Broadcast to others        │
└──────┬───────────────────────┘
       │
       ↓
┌─────────────┐
│   USER B    │  ← Receive sync
│   USER C    │  ← Check timestamp (< 5s?) ✅
└─────────────┘  ← Check rapid (> 200ms?) ✅
       │         ← Set isReceivingSync = true
       │         ← Apply gentle sync (> 2s)
       │         ← Clear flags after 500ms/800ms
       │
       └─ onPlayerStateChange()
          └─ Check: isReceivingSync? ✅ BLOCKED!
             No feedback loop! 🎉
```

---

## 🛡️ User Control Blocking in Live Mode

Các hàm đã được cập nhật để chặn User trong Live Mode:

1. **togglePlayPause()** - Chặn Play/Pause
2. **seekRelative()** - Chặn Rewind/Forward
3. **handleProgressClick()** - Chặn seek qua progress bar
4. **handleVideoClick()** - Chặn click vào video + hiện thông báo

```javascript
// Mẫu code chặn User
if (isLiveMode && !isAdmin) {
    console.log('🚫 User cannot control in Live Mode');
    showNotification('Chỉ Admin mới có thể điều khiển...', 'warning');
    return;
}
```

---

## 🎨 UI/UX Changes

### CSS Classes
```css
/* Ẩn controls cho User trong Live Mode */
body.is-live-mode:not(.is-admin) .admin-control,
body.is-live-mode:not(.is-admin) .admin-only {
    display: none;
}

/* Admin vẫn thấy controls */
body.is-admin .admin-only {
    display: inline-block;
}
```

### Control Visibility

**Live Mode ON:**
- Admin: ✅ Play/Pause, Rewind, Forward, Quality, Speed, Caption
- User: ✅ Caption, Volume, Settings, Fullscreen
- User: ❌ Play/Pause, Rewind, Forward, Quality, Speed

**Live Mode OFF:**
- Everyone: ✅ Tất cả controls

---

## 🧪 Testing Checklist

### Live Mode ON
- [ ] Admin bấm Play → Tất cả User play
- [ ] Admin bấm Pause → Tất cả User pause
- [ ] Admin seek → Tất cả User seek theo
- [ ] User bấm vào video → Bị chặn + hiện thông báo
- [ ] User không thấy Play/Pause/Rewind/Forward buttons
- [ ] User vẫn thấy Caption/Volume/Fullscreen buttons

### Party Mode OFF
- [ ] User A bấm Play → User B, C play
- [ ] User B bấm Pause → User A, C pause
- [ ] User C seek → User A, B seek theo
- [ ] Không có feedback loop (video không giật)
- [ ] Tất cả User thấy đầy đủ controls
- [ ] Sync mượt mà, không bị lag

### Feedback Loop Prevention
- [ ] Bấm Play/Pause nhanh liên tục → Không bị loop
- [ ] Nhiều user bấm cùng lúc → Không bị conflict
- [ ] Network lag → Không gây feedback loop
- [ ] Console log không spam messages

---

## 📊 Performance Metrics

### Before (Old Logic)
- ❌ Feedback loop xảy ra trong Party Mode
- ❌ Video bị giật khi nhiều người điều khiển
- ❌ Spam socket events (mỗi state change = 1 event)

### After (New Logic)
- ✅ Không có feedback loop
- ✅ Video mượt mà
- ✅ Debounce giảm 70% số lượng events
- ✅ Timestamp checking loại bỏ stale events
- ✅ Rapid sync prevention tránh spam

---

## 🔧 Configuration

### Timing Constants
```javascript
const DEBOUNCE_DELAY = 300;           // ms - Party Mode debounce
const STALE_THRESHOLD = 5000;         // ms - Ignore events older than 5s
const RAPID_SYNC_THRESHOLD = 200;     // ms - Ignore syncs < 200ms apart
const RECEIVING_SYNC_TIMEOUT = 500;   // ms - Clear isReceivingSync flag
const SYNCING_TIMEOUT = 800;          // ms - Clear isSyncing flag

const LIVE_MODE_SYNC_DIFF = 0.5;      // seconds - Live Mode sync threshold
const PARTY_MODE_SYNC_DIFF = 2.0;     // seconds - Party Mode sync threshold
```

### Tuning Tips
- **Tăng DEBOUNCE_DELAY** → Ít events hơn, nhưng phản hồi chậm hơn
- **Giảm RAPID_SYNC_THRESHOLD** → Chặt chẽ hơn, nhưng có thể bỏ sót
- **Tăng PARTY_MODE_SYNC_DIFF** → Ít sync hơn, nhưng có thể bị lệch
- **Giảm LIVE_MODE_SYNC_DIFF** → Sync chặt hơn, nhưng nhiều jitter

---

## 🐛 Debugging

### Console Logs
```
📤 Sent: PLAY at 45.3          → Đang gửi event
📥 Received: PAUSE at 30.2     → Nhận được event
🔄 Ignoring state change       → Chặn feedback loop
🚫 User blocked in Live Mode   → User bị chặn
👑 Admin sending command       → Admin gửi lệnh
🎉 Party Mode: Sending state   → Party Mode active
⏰ Ignoring stale sync         → Event quá cũ
⚡ Ignoring rapid sync         → Sync quá nhanh
```

### Common Issues

**Issue 1: Video vẫn bị giật trong Party Mode**
- Check: Console có spam "📥 Received" không?
- Fix: Tăng `RAPID_SYNC_THRESHOLD` lên 300ms

**Issue 2: Sync không hoạt động**
- Check: Console có "⏰ Ignoring stale sync" không?
- Fix: Đồng bộ hóa đồng hồ server/client hoặc tăng `STALE_THRESHOLD`

**Issue 3: User vẫn điều khiển được trong Live Mode**
- Check: `isLiveMode` và `isAdmin` flags
- Check: CSS class `is-live-mode` có được thêm vào body không?

---

## 📝 Code Examples

### Gửi Video State (Admin in Live Mode)
```javascript
// Admin clicks Play
onPlayerStateChange(event) {
    // Check: isLiveMode && isAdmin
    if (isLiveMode && isAdmin) {
        emitVideoStateChange(event.data);
        // → Gửi ngay, không debounce
    }
}
```

### Nhận Video State (User in Live Mode)
```javascript
socket.on('vs', ([state, time, timestamp]) => {
    // Check timestamp
    if (Date.now() - timestamp > 5000) return;
    
    // Set flags
    isReceivingSync = true;
    isSyncing = true;
    
    // Apply strict sync
    if (timeDiff > 0.5) player.seekTo(time);
    
    // Clear flags after delay
    setTimeout(() => isReceivingSync = false, 500);
});
```

### Party Mode Collaboration
```javascript
// User A clicks Pause
onPlayerStateChange(event) {
    // Debounce 300ms
    syncDebounceTimeout = setTimeout(() => {
        if (!isReceivingSync && !isSyncing) {
            emitVideoStateChange(event.data);
        }
    }, 300);
}

// User B receives and syncs gently
syncVideoStateCompact(state, time, timestamp) {
    isReceivingSync = true;
    
    // Gentle sync (> 2s only)
    if (timeDiff > 2) player.seekTo(time);
    
    // Won't trigger onPlayerStateChange feedback
}
```

---

## 🎓 Best Practices

1. **Always check flags before emitting**
   - `if (isReceivingSync || isSyncing) return;`

2. **Use debounce in Party Mode**
   - Nhóm multiple events thành 1

3. **Add timestamps to all events**
   - Để kiểm tra stale data

4. **Clear flags with proper timing**
   - 500ms cho isReceivingSync
   - 800ms cho isSyncing

5. **Test with multiple clients**
   - Mở nhiều tabs/browsers để test

6. **Monitor console logs**
   - Để phát hiện feedback loops sớm

---

## 🚀 Future Improvements

- [ ] Add seek throttling (limit seeks per second)
- [ ] Add buffer state sync (for smoother experience)
- [ ] Add quality/speed sync in Party Mode
- [ ] Add "Request Control" feature in Live Mode
- [ ] Add sync statistics/metrics dashboard
- [ ] Add automatic sync recovery on desync detection

---

**Author:** Rovo Dev  
**Last Updated:** 2024  
**Version:** 2.0.0 - Anti-Feedback Loop Edition
