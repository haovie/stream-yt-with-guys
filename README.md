# YouTube Stream Chat App

Ứng dụng streaming YouTube với chat thời gian thực, cho phép nhiều người xem video cùng nhau và trò chuyện.

## Tính năng

### 🎥 Video Streaming
- **Paste link YouTube**: Dán link YouTube để phát video cho tất cả mọi người trong phòng
- **Đồng bộ video**: Video được đồng bộ tự động giữa tất cả người dùng
- **Điều khiển video**: Play, pause, seek được đồng bộ thời gian thực

### 💬 Chat Thời Gian Thực
- **Chat room**: Trò chuyện với tất cả người dùng trong phòng
- **Thông báo hệ thống**: Thông báo khi có người tham gia/rời khỏi phòng
- **Hiển thị thời gian**: Mỗi tin nhắn có timestamp
- **Phân biệt tin nhắn**: Tin nhắn của bạn và người khác được hiển thị khác nhau

### 🏠 Quản Lý Phòng
- **Tạo phòng mới**: Tự động tạo phòng với ID ngẫu nhiên
- **Tham gia phòng**: Tham gia phòng bằng Room ID
- **Đếm người dùng**: Hiển thị số người online trong phòng
- **Tên hiển thị**: Mỗi người dùng có tên hiển thị riêng

## Công nghệ sử dụng

### Backend
- **Node.js**: Runtime JavaScript
- **Express.js**: Web framework
- **Socket.IO**: WebSocket cho real-time communication
- **CORS**: Cross-Origin Resource Sharing

### Frontend
- **HTML5**: Cấu trúc trang web
- **CSS3**: Styling với animations và responsive design
- **JavaScript (ES6+)**: Logic frontend
- **YouTube IFrame API**: Tích hợp video YouTube
- **Socket.IO Client**: Real-time communication
- **Font Awesome**: Icons

## Cài đặt và chạy

### 1. Cài đặt dependencies
```bash
npm install
```

### 2. Chạy ứng dụng
```bash
# Development mode với nodemon
npm run dev

# Production mode
npm start
```

### 3. Truy cập ứng dụng
Mở trình duyệt và truy cập: `http://localhost:3000`

## Hướng dẫn sử dụng

### Bước 1: Tham gia phòng
1. Nhập tên hiển thị của bạn
2. Nhập Room ID (hoặc để trống để tạo phòng mới)
3. Nhấn "Tham gia"

### Bước 2: Phát video YouTube
1. Copy link YouTube video bạn muốn xem
2. Paste vào ô "Dán link YouTube vào đây..."
3. Nhấn "Phát Video"
4. Video sẽ được phát cho tất cả người trong phòng

### Bước 3: Chat với mọi người
1. Nhập tin nhắn vào ô chat
2. Nhấn Enter hoặc nút gửi
3. Tin nhắn sẽ hiển thị cho tất cả người trong phòng

## Cấu trúc dự án

```
youtube-stream-chat-app/
├── server.js              # Server chính
├── package.json           # Dependencies và scripts
├── README.md             # Tài liệu hướng dẫn
└── public/               # Static files
    ├── index.html        # Trang chính
    ├── css/
    │   └── style.css     # Styles
    └── js/
        └── app.js        # JavaScript frontend
```

## API và Events

### Socket.IO Events

#### Client → Server
- `join-room`: Tham gia phòng
- `chat-message`: Gửi tin nhắn chat
- `change-video`: Thay đổi video YouTube
- `video-state-change`: Đồng bộ trạng thái video

#### Server → Client
- `chat-message`: Nhận tin nhắn chat
- `user-joined`: Thông báo người dùng tham gia
- `user-left`: Thông báo người dùng rời khỏi
- `user-count`: Cập nhật số người online
- `video-changed`: Video được thay đổi
- `video-loaded`: Tải video cho người dùng mới
- `video-state-sync`: Đồng bộ trạng thái video

## Tính năng nâng cao

### Đồng bộ Video
- Tự động đồng bộ thời gian video giữa các người dùng
- Đồng bộ trạng thái play/pause
- Xử lý lag và độ trễ mạng

### Responsive Design
- Tương thích với desktop, tablet, mobile
- Giao diện thích ứng theo kích thước màn hình
- Touch-friendly trên thiết bị di động

### Real-time Features
- Chat thời gian thực không delay
- Cập nhật số người online ngay lập tức
- Thông báo join/leave real-time

## Customization

### Thay đổi giao diện
Chỉnh sửa file `public/css/style.css` để thay đổi:
- Màu sắc chủ đạo
- Font chữ
- Layout và spacing
- Animations

### Thêm tính năng
Có thể mở rộng với:
- Emoji trong chat
- Private messages
- File sharing
- Video quality selection
- Room passwords

## Troubleshooting

### Video không phát được
- Kiểm tra link YouTube có hợp lệ
- Đảm bảo video không bị restricted
- Thử refresh trang

### Chat không hoạt động
- Kiểm tra kết nối internet
- Refresh trang và tham gia lại phòng
- Kiểm tra console để xem lỗi

### Đồng bộ video bị lỗi
- Có thể do lag mạng
- Refresh trang để sync lại
- Kiểm tra tốc độ internet

## License

MIT License - Tự do sử dụng và chỉnh sửa.

## Đóng góp

Mọi đóng góp và cải thiện đều được chào đón! Hãy tạo issue hoặc pull request.