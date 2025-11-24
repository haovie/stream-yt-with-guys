# 🚀 Quick Start - Deploy lên DigitalOcean trong 5 phút

## 🎯 Phương pháp nhanh nhất: App Platform

### Bước 1️⃣: Push code lên GitHub (2 phút)

```bash
# Tạo repository mới trên GitHub: https://github.com/new
# Đặt tên: stream

# Trong terminal:
cd /Users/haonguyen/Workspace/stream

# Cập nhật file cấu hình
# Mở .do/app.yaml và thay đổi dòng 6:
# Từ: repo: YOUR_GITHUB_USERNAME/stream
# Thành: repo: <your-github-username>/stream

# Push code
git init
git add .
git commit -m "Initial deployment"
git remote add origin https://github.com/<your-username>/stream.git
git branch -M main
git push -u origin main
```

### Bước 2️⃣: Deploy trên DigitalOcean (3 phút)

#### Option A: Qua Dashboard (Khuyên dùng)

1. **Truy cập**: https://cloud.digitalocean.com/apps/new

2. **Kết nối GitHub**:
   - Chọn "GitHub"
   - Authorize DigitalOcean
   - Chọn repo: `<your-username>/stream`
   - Branch: `main`
   - ✅ Check "Autodeploy"

3. **Next** → DigitalOcean tự động detect Node.js

4. **Environment Variables** (có thể bỏ qua, đã config sẵn)

5. **Chọn Plan**: Basic $5/month

6. **App Name**: `youtube-stream-chat`

7. **Create Resources** 🎉

8. **Đợi 3-5 phút** → Truy cập URL được cung cấp!

#### Option B: Qua Command Line

```bash
# Cài doctl (nếu chưa có)
brew install doctl

# Authenticate
doctl auth init
# Lấy token tại: https://cloud.digitalocean.com/account/api/tokens

# Deploy
doctl apps create --spec .do/app.yaml

# Xem status
doctl apps list
```

### Bước 3️⃣: Hoàn tất! 🎉

Ứng dụng của bạn đã live tại:
```
https://youtube-stream-chat-xxxxx.ondigitalocean.app
```

---

## 🔄 Update ứng dụng

Từ giờ, chỉ cần push code:

```bash
git add .
git commit -m "Update feature"
git push
```

DigitalOcean sẽ **tự động deploy** lại! ⚡

---

## 🛠️ Script tiện ích

Chúng tôi đã tạo sẵn script để bạn deploy dễ dàng:

```bash
# Chạy script
./deploy.sh

# Hoặc
./deploy.sh app-platform  # Deploy với App Platform
./deploy.sh test          # Test Docker locally
./deploy.sh push          # Push to GitHub
```

---

## 📊 So sánh chi phí

| Phương pháp | Chi phí/tháng | Độ dễ | Auto-deploy | SSL |
|-------------|---------------|-------|-------------|-----|
| **App Platform** | $5 | ⭐⭐⭐⭐⭐ | ✅ | ✅ |
| Droplet | $6 | ⭐⭐⭐ | ❌ | Cần cài |

→ **Khuyên dùng App Platform** cho dự án này!

---

## ❓ Troubleshooting

### Deploy failed?

```bash
# Xem logs
doctl apps logs <APP_ID> --type build

# Hoặc xem trong Dashboard → App → Build Logs
```

### Không thấy app?

```bash
doctl apps list
```

### Cần help?

```bash
./deploy.sh help
```

Hoặc xem **DEPLOYMENT.md** cho hướng dẫn chi tiết đầy đủ.

---

## 🎓 Học thêm

- 📖 [Hướng dẫn đầy đủ](DEPLOYMENT.md)
- 🌐 [DigitalOcean Docs](https://docs.digitalocean.com/products/app-platform/)
- 💬 [Community Forums](https://www.digitalocean.com/community/)

---

**Chúc bạn deploy thành công! 🚀**

