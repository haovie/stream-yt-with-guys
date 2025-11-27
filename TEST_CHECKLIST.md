# ✅ Test Checklist - Video Sync Logic

## 🎯 Mục Tiêu Test

Đảm bảo logic đồng bộ video hoạt động đúng trong cả 2 chế độ và không có Feedback Loop.

---

## 🧪 Test Setup

### Chuẩn Bị:
1. Mở 3 tabs/browsers:
   - Tab 1: Admin (đăng nhập với admin password)
   - Tab 2: User A (không có password)
   - Tab 3: User B (không có password)
2. Load cùng 1 video YouTube
3. Mở Console để xem logs

---

## 📋 Test Cases

### ✅ Test 1: Live Mode ON - Admin Control

#### 1.1 Admin Play/Pause
- [ ] Admin bật Live Mode
- [ ] Admin bấm Play
- [ ] **Expect**: User A, B play ngay lập tức
- [ ] Admin bấm Pause
- [ ] **Expect**: User A, B pause ngay lập tức
- [ ] **Console**: Không thấy feedback loop messages

#### 1.2 Admin Seek
- [ ] Admin kéo progress bar đến 30s
- [ ] **Expect**: User A, B seek đến 30s (sai lệch < 1s)
- [ ] Admin bấm Forward (+10s)
- [ ] **Expect**: User A, B forward theo
- [ ] Admin bấm Rewind (-10s)
- [ ] **Expect**: User A, B rewind theo

#### 1.3 User Controls Blocked
- [ ] User A click vào video player
- [ ] **Expect**: Hiện thông báo "Chỉ Admin mới có thể điều khiển..."
- [ ] **Expect**: Video không play/pause
- [ ] User A không thấy nút Play/Pause
- [ ] User A không thấy nút Rewind/Forward
- [ ] User A không thấy nút Quality
- [ ] User A không thấy nút Speed
- [ ] User A VẪN thấy nút Caption ✅
- [ ] User A VẪN thấy nút Volume ✅
- [ ] User A VẪN thấy nút Fullscreen ✅

#### 1.4 User Progress Bar Blocked
- [ ] User B click vào progress bar
- [ ] **Expect**: Không seek, video vẫn ở vị trí cũ
- [ ] **Console**: "🚫 User cannot seek via progress bar in Live Mode"

---

### ✅ Test 2: Live Mode OFF - Party Mode

#### 2.1 Admin tắt Live Mode
- [ ] Admin click nút "Tắt Live Mode"
- [ ] **Expect**: User A, B thấy lại tất cả nút điều khiển
- [ ] User A thấy Play/Pause button
- [ ] User A thấy Rewind/Forward buttons
- [ ] User A thấy Quality button
- [ ] User A thấy Speed button

#### 2.2 User A Control
- [ ] User A bấm Pause
- [ ] **Expect**: Admin, User B pause theo (trong vòng 1s)
- [ ] **Console User A**: "📤 Sent: PAUSE at XX.X"
- [ ] **Console Admin**: "📥 Received: PAUSE at XX.X"
- [ ] **Console User B**: "📥 Received: PAUSE at XX.X"
- [ ] **Console**: KHÔNG thấy feedback loop (không spam messages)

#### 2.3 User B Control
- [ ] User B bấm Play
- [ ] **Expect**: Admin, User A play theo
- [ ] User B seek đến 60s
- [ ] **Expect**: Admin, User A seek theo (nếu sai lệch > 2s)

#### 2.4 Rapid Control (Test Debounce)
- [ ] User A bấm Play/Pause nhanh liên tục 5 lần
- [ ] **Expect**: Video không bị giật
- [ ] **Console**: Chỉ thấy 1-2 "📤 Sent" messages (debounced)
- [ ] **Expect**: User B nhận và sync mượt mà

#### 2.5 Multiple Users Control (Test Feedback Loop)
- [ ] User A bấm Play
- [ ] Ngay sau đó User B bấm Pause (trong 500ms)
- [ ] **Expect**: Video không bị giật, không bị stuck
- [ ] **Console**: Thấy "⚡ Ignoring rapid sync" hoặc "🔄 Ignoring state change"
- [ ] **Expect**: Video settle về 1 trạng thái (Play hoặc Pause)

---

### ✅ Test 3: Mode Switching

#### 3.1 Live Mode ON → OFF
- [ ] Admin bật Live Mode (User bị chặn)
- [ ] Admin tắt Live Mode
- [ ] **Expect**: User A, B lập tức thấy lại controls
- [ ] **Expect**: Class "is-live-mode" được remove khỏi body
- [ ] User A bấm Play → Admin, User B play theo

#### 3.2 Live Mode OFF → ON
- [ ] Đang ở Party Mode, User A đang điều khiển
- [ ] Admin bật Live Mode
- [ ] **Expect**: User A, B lập tức mất controls
- [ ] **Expect**: Nút Play/Pause/Rewind/Forward biến mất
- [ ] User A click video → Bị chặn

---

### ✅ Test 4: Edge Cases

#### 4.1 Network Lag
- [ ] Chrome DevTools → Network → Throttling → Slow 3G
- [ ] User A bấm Play
- [ ] **Expect**: User B vẫn sync (có thể delay nhưng không loop)
- [ ] **Console**: Có thể thấy "⏰ Ignoring stale sync" nếu quá delay

#### 4.2 Multiple Rapid Syncs
- [ ] User A bấm Play/Pause/Play/Pause nhanh 10 lần
- [ ] **Expect**: 
   - Debounce hoạt động (chỉ gửi 1-2 events)
   - User B không bị spam
   - Video không bị stuck

#### 4.3 Admin Leave Room (Live Mode)
- [ ] Admin bật Live Mode
- [ ] Admin đóng tab/thoát phòng
- [ ] **Expect**: User nhận thông báo "Admin đã rời phòng"
- [ ] **Expect**: Chuyển hướng về trang chủ sau 3s

#### 4.4 Page Reload During Sync
- [ ] User A đang xem video (50s)
- [ ] User A reload page
- [ ] **Expect**: Video load lại và sync đến vị trí hiện tại của Admin/Users khác
- [ ] **Expect**: Không có feedback loop khi reconnect

---

### ✅ Test 5: Console Logs Verification

#### 5.1 Normal Operation (Party Mode)
Logs hợp lệ:
```
✅ 📤 Sent: PLAY at 45.3
✅ 📥 Received: PAUSE at 30.2
✅ 🎉 Party Mode: Sending state change
✅ 🔄 Ignoring state change (receiving sync)
```

Logs cảnh báo (OK, đang chống feedback):
```
✅ ⚡ Ignoring rapid sync (< 200ms)
✅ ⏰ Ignoring stale sync: X seconds old
```

#### 5.2 Live Mode Operation
Logs hợp lệ:
```
✅ 👑 Admin sending command in Live Mode
✅ 👥 User syncing to Admin
✅ 🚫 User blocked in Live Mode
```

#### 5.3 Feedback Loop Detection (BAD)
Nếu thấy logs này → Có vấn đề:
```
❌ 📤 Sent: PLAY at 45.3
❌ 📥 Received: PLAY at 45.3
❌ 📤 Sent: PLAY at 45.3
❌ 📥 Received: PLAY at 45.3
❌ ... (lặp lại liên tục)
```

---

## 🎯 Success Criteria

### Must Have (P0):
- ✅ Live Mode: User KHÔNG thể điều khiển (100% blocked)
- ✅ Party Mode: KHÔNG có feedback loop
- ✅ Sync hoạt động chính xác (sai lệch < 2s)
- ✅ UI hiển thị đúng (buttons show/hide)

### Should Have (P1):
- ✅ Debounce giảm socket events (< 5 events/second)
- ✅ No console errors
- ✅ Smooth video playback (không giật)

### Nice to Have (P2):
- ✅ Network lag handling (slow connection vẫn sync)
- ✅ Multiple users concurrent control (không conflict)

---

## 📊 Test Results Template

```markdown
## Test Session: [Date/Time]
**Tester:** [Name]
**Browser:** [Chrome/Firefox/Safari]
**Setup:** [3 tabs, same machine / 3 different machines]

### Test 1: Live Mode ON
- [ ] 1.1 Admin Play/Pause: PASS / FAIL
- [ ] 1.2 Admin Seek: PASS / FAIL
- [ ] 1.3 User Controls Blocked: PASS / FAIL
- [ ] 1.4 User Progress Bar Blocked: PASS / FAIL

### Test 2: Party Mode
- [ ] 2.1 Admin tắt Live Mode: PASS / FAIL
- [ ] 2.2 User A Control: PASS / FAIL
- [ ] 2.3 User B Control: PASS / FAIL
- [ ] 2.4 Rapid Control: PASS / FAIL
- [ ] 2.5 Multiple Users Control: PASS / FAIL

### Test 3: Mode Switching
- [ ] 3.1 Live Mode ON → OFF: PASS / FAIL
- [ ] 3.2 Live Mode OFF → ON: PASS / FAIL

### Test 4: Edge Cases
- [ ] 4.1 Network Lag: PASS / FAIL
- [ ] 4.2 Multiple Rapid Syncs: PASS / FAIL
- [ ] 4.3 Admin Leave Room: PASS / FAIL
- [ ] 4.4 Page Reload During Sync: PASS / FAIL

### Test 5: Console Logs
- [ ] 5.1 Normal Operation: PASS / FAIL
- [ ] 5.2 Live Mode Operation: PASS / FAIL
- [ ] 5.3 No Feedback Loop: PASS / FAIL

### Overall Result: PASS / FAIL

### Notes:
[Any issues, bugs, or observations]
```

---

## 🐛 Known Issues & Workarounds

### Issue: Sync không hoạt động sau reload
**Workaround:** Đợi 1-2s sau khi load video mới thao tác

### Issue: Console spam messages khi network lag
**Workaround:** Bình thường, stale events đang bị ignore đúng cách

### Issue: Video không sync nếu sai lệch < 2s (Party Mode)
**Not a bug:** Đây là feature, để tránh sync quá nhiều gây giật

---

## 📞 Report Bugs

Nếu phát hiện bug, ghi lại:
1. Các bước tái hiện (Steps to reproduce)
2. Expected behavior
3. Actual behavior
4. Console logs (screenshots)
5. Browser/OS version
6. Network conditions

**Template:**
```markdown
## Bug Report: [Title]

**Steps to Reproduce:**
1. ...
2. ...
3. ...

**Expected:** ...
**Actual:** ...
**Console Logs:** [Screenshot/paste logs]
**Environment:** Chrome 120, macOS, Fast 3G

**Priority:** High / Medium / Low
```

---

**Happy Testing! 🎉**
