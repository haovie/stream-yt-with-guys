# 🎬 Demo YouTube Stream Chat App

## 🚀 Cách chạy ứng dụng

### Phương pháp 1: Sử dụng npm
```bash
npm start
```

### Phương pháp 2: Sử dụng script
**Linux/Mac:**
```bash
./start.sh
```

**Windows:**
```cmd
start.bat
```

## 🎯 Hướng dẫn demo

### Bước 1: Khởi động ứng dụng
1. Mở terminal/command prompt
2. Chạy `npm start`
3. Mở trình duyệt tại `http://localhost:3000`

### Bước 2: Tạo phòng đầu tiên
1. Nhập tên của bạn (ví dụ: "Admin")
2. Để trống Room ID để tạo phòng mới
3. Nhấn "Tham gia"
4. Ghi nhớ Room ID hiển thị (ví dụ: "room_abc123")

### Bước 3: Thêm video YouTube
1. Tìm một video YouTube (ví dụ: https://www.youtube.com/watch?v=dQw4w9WgXcQ)
2. Copy link và paste vào ô "Dán link YouTube vào đây..."
3. Nhấn "Phát Video"
4. Video sẽ xuất hiện và bắt đầu phát

### Bước 4: Test chat
1. Nhập tin nhắn vào ô chat
2. Nhấn Enter hoặc nút gửi
3. Tin nhắn sẽ hiển thị trong chat box

### Bước 5: Test nhiều người dùng
1. Mở tab/cửa sổ trình duyệt mới
2. Truy cập `http://localhost:3000`
3. Nhập tên khác (ví dụ: "User2")
4. Nhập cùng Room ID từ bước 2
5. Tham gia phòng

### Bước 6: Test đồng bộ
1. Ở tab thứ 2, thử pause/play video
2. Kiểm tra tab đầu tiên - video sẽ tự động đồng bộ
3. Thử chat từ cả 2 tab
4. Kiểm tra số người online

## 🎥 Video demo mẫu để test

### Video ngắn (dễ test):
- **Rickroll**: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- **Baby Shark**: `https://www.youtube.com/watch?v=XqZsoesa55w`
- **Gangnam Style**: `https://www.youtube.com/watch?v=9bZkp7q19f0`

### Video dài (test đồng bộ):
- **Lofi Hip Hop**: `https://www.youtube.com/watch?v=jfKfPfyJRdk`
- **Nature Sounds**: `https://www.youtube.com/watch?v=eKFTSSKCzWA`

## 🧪 Checklist kiểm tra

### ✅ Tính năng cơ bản
- [ ] Tạo phòng mới
- [ ] Tham gia phòng bằng Room ID
- [ ] Hiển thị tên người dùng
- [ ] Đếm số người online

### ✅ Video features
- [ ] Paste link YouTube
- [ ] Phát video thành công
- [ ] Điều khiển play/pause
- [ ] Seek video (tua tới/lui)

### ✅ Chat features
- [ ] Gửi tin nhắn
- [ ] Nhận tin nhắn từ người khác
- [ ] Hiển thị timestamp
- [ ] Phân biệt tin nhắn của mình và người khác

### ✅ Đồng bộ (Multi-user)
- [ ] Video đồng bộ khi có người mới tham gia
- [ ] Play/pause đồng bộ giữa các user
- [ ] Seek đồng bộ giữa các user
- [ ] Chat real-time giữa các user

### ✅ UI/UX
- [ ] Giao diện responsive trên mobile
- [ ] Animations mượt mà
- [ ] Loading states
- [ ] Error handling

## 🐛 Troubleshooting

### Video không phát được
```
Nguyên nhân: Link YouTube không hợp lệ hoặc video bị restricted
Giải pháp: Thử link khác hoặc kiểm tra console để xem lỗi
```

### Chat không hoạt động
```
Nguyên nhân: Lỗi kết nối Socket.IO
Giải pháp: Refresh trang, kiểm tra console
```

### Đồng bộ video bị lag
```
Nguyên nhân: Kết nối mạng chậm
Giải pháp: Đợi vài giây để tự đồng bộ
```

## 📱 Test trên mobile

1. Tìm IP của máy tính (ví dụ: 192.168.1.100)
2. Truy cập từ mobile: `http://192.168.1.100:3000`
3. Test tất cả tính năng trên mobile

## 🎉 Kết quả mong đợi

Sau khi hoàn thành demo, bạn sẽ có:
- ✅ Ứng dụng streaming YouTube hoạt động hoàn chỉnh
- ✅ Chat room real-time
- ✅ Đồng bộ video giữa nhiều người dùng
- ✅ Giao diện đẹp và responsive
- ✅ Trải nghiệm người dùng mượt mà