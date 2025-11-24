# 🚀 Hướng dẫn Deploy lên DigitalOcean

## 📋 Mục lục
1. [App Platform (Khuyên dùng - Dễ nhất)](#phương-pháp-1-digitalocean-app-platform)
2. [Droplet với Docker](#phương-pháp-2-digitalocean-droplet-với-docker)
3. [Container Registry + Docker](#phương-pháp-3-container-registry)

---

## Phương pháp 1: DigitalOcean App Platform

### ✅ Ưu điểm
- ⚡ Đơn giản nhất, không cần quản lý server
- 🔄 Auto-deploy khi push code lên GitHub
- 📈 Auto-scaling
- 🔒 HTTPS miễn phí
- 💰 Giá: $5/tháng (Basic plan)

### 📝 Bước 1: Chuẩn bị GitHub Repository

```bash
# 1. Tạo repository mới trên GitHub: https://github.com/new
# Đặt tên: stream hoặc youtube-stream-chat

# 2. Push code lên GitHub
cd /Users/haonguyen/Workspace/stream

git init
git add .
git commit -m "Initial commit for deployment"
git remote add origin https://github.com/YOUR_USERNAME/stream.git
git branch -M main
git push -u origin main
```

### 📝 Bước 2: Cập nhật file .do/app.yaml

Mở file `.do/app.yaml` và thay đổi:

```yaml
github:
  repo: YOUR_GITHUB_USERNAME/stream  # ← Thay YOUR_GITHUB_USERNAME bằng username GitHub của bạn
  branch: main
```

Commit và push thay đổi:

```bash
git add .do/app.yaml
git commit -m "Update GitHub repo in app.yaml"
git push
```

### 📝 Bước 3: Tạo App trên DigitalOcean

#### Cách 1: Deploy từ Dashboard (UI)

1. **Đăng nhập DigitalOcean**: https://cloud.digitalocean.com

2. **Tạo App mới**:
   - Click nút **"Create"** → Chọn **"Apps"**
   - Hoặc truy cập: https://cloud.digitalocean.com/apps/new

3. **Kết nối GitHub**:
   - Chọn **"GitHub"**
   - Click **"Authorize DigitalOcean"**
   - Chọn repository: `YOUR_USERNAME/stream`
   - Chọn branch: `main`
   - Check ✅ **"Autodeploy"** (tự động deploy khi push code)
   - Click **"Next"**

4. **Configure Resources**:
   - DigitalOcean sẽ tự động phát hiện đây là Node.js app
   - **Build Command**: `npm install` (hoặc để trống, sẽ tự detect)
   - **Run Command**: `npm start`
   - **HTTP Port**: `3000`
   - Click **"Next"**

5. **Environment Variables**:
   - `NODE_ENV` = `production`
   - `PORT` = `3000`
   - Click **"Next"**

6. **Chọn Plan**:
   - Chọn **"Basic"** plan
   - **Instance Size**: `Basic ($5/month)` - 512 MB RAM, 1 vCPU
   - Click **"Next"**

7. **App Info**:
   - **App Name**: `youtube-stream-chat` (hoặc tên bạn muốn)
   - **Region**: Chọn gần bạn nhất (Singapore cho VN)
   - Click **"Next"**

8. **Review và Launch**:
   - Xem lại cấu hình
   - Click **"Create Resources"**

9. **Đợi Deploy**:
   - Quá trình deploy mất 3-5 phút
   - Xem logs trong tab **"Build Logs"**
   - Khi thấy ✅ **"Deployed"** là thành công!

10. **Truy cập App**:
    - URL sẽ có dạng: `https://youtube-stream-chat-xxxxx.ondigitalocean.app`
    - Click vào URL để mở ứng dụng

#### Cách 2: Deploy từ Command Line (doctl)

```bash
# 1. Cài đặt doctl
brew install doctl

# 2. Authenticate
doctl auth init
# Nhập API token từ: https://cloud.digitalocean.com/account/api/tokens

# 3. Deploy app
doctl apps create --spec .do/app.yaml

# 4. Xem danh sách apps
doctl apps list

# 5. Xem logs
doctl apps logs <APP_ID> --type build
doctl apps logs <APP_ID> --type run
```

### 📝 Bước 4: Cấu hình Domain (Tùy chọn)

Nếu bạn có domain riêng:

1. Vào **App → Settings → Domains**
2. Click **"Add Domain"**
3. Nhập domain: `yourdomain.com`
4. Thêm DNS records theo hướng dẫn:
   ```
   Type: CNAME
   Name: @
   Value: <your-app>.ondigitalocean.app
   ```
5. SSL certificate sẽ tự động được cấp

### 📝 Bước 5: Auto-Deploy khi push code

Từ giờ, mỗi khi bạn push code lên GitHub:

```bash
git add .
git commit -m "Update features"
git push
```

DigitalOcean sẽ **tự động deploy** lại ứng dụng! 🎉

### 🔧 Monitoring và Logs

1. **Xem Logs**:
   - Dashboard → App → **Runtime Logs**
   - Hoặc: `doctl apps logs <APP_ID> -f`

2. **Metrics**:
   - CPU, Memory, Bandwidth usage
   - Response time

3. **Alerts**:
   - Settings → Alerts
   - Cài đặt email alert khi app down

### 💰 Chi phí

| Plan | Price | RAM | vCPU | Bandwidth |
|------|-------|-----|------|-----------|
| Basic | $5/mo | 512MB | 1 | 40GB |
| Professional | $12/mo | 1GB | 1 | 100GB |

---

## Phương pháp 2: DigitalOcean Droplet với Docker

### ✅ Ưu điểm
- 💪 Kiểm soát hoàn toàn server
- 🐳 Sử dụng Docker
- 🔧 Flexible configuration
- 💰 Giá: $6/tháng (1GB RAM droplet)

### 📝 Bước 1: Tạo Droplet

1. **Tạo Droplet mới**:
   - Dashboard → **Create** → **Droplets**
   - **Image**: Ubuntu 22.04 LTS x64
   - **Plan**: Basic - $6/month (1GB RAM, 1 vCPU, 25GB SSD)
   - **Datacenter**: Singapore
   - **Authentication**: SSH Key (hoặc Password)
   - **Hostname**: `stream-app`
   - Click **"Create Droplet"**

2. **Đợi 1-2 phút** cho droplet khởi tạo

### 📝 Bước 2: Cài đặt Docker trên Droplet

```bash
# 1. SSH vào droplet
ssh root@YOUR_DROPLET_IP

# 2. Update system
apt update && apt upgrade -y

# 3. Cài Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# 4. Cài Docker Compose
apt install docker-compose -y

# 5. Kiểm tra
docker --version
docker-compose --version
```

### 📝 Bước 3: Deploy ứng dụng

```bash
# 1. Clone repository
git clone https://github.com/YOUR_USERNAME/stream.git
cd stream

# 2. Build và chạy với Docker Compose
docker-compose up -d --build

# 3. Kiểm tra container
docker ps

# 4. Xem logs
docker-compose logs -f
```

### 📝 Bước 4: Cấu hình Firewall

```bash
# Cho phép HTTP, HTTPS, SSH
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp
ufw enable
ufw status
```

### 📝 Bước 5: Cài đặt Nginx Reverse Proxy (Khuyên dùng)

```bash
# 1. Cài Nginx
apt install nginx -y

# 2. Tạo config
cat > /etc/nginx/sites-available/stream << 'EOF'
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF

# 3. Enable site
ln -s /etc/nginx/sites-available/stream /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

### 📝 Bước 6: Cài SSL với Let's Encrypt (Nếu có domain)

```bash
# 1. Cài Certbot
apt install certbot python3-certbot-nginx -y

# 2. Lấy SSL certificate
certbot --nginx -d yourdomain.com

# 3. Auto-renew
certbot renew --dry-run
```

### 📝 Bước 7: Auto-start khi reboot

```bash
# Docker Compose sẽ tự động restart containers
# Đã cấu hình trong docker-compose.yml: restart: unless-stopped
```

### 🔄 Update ứng dụng

```bash
cd /root/stream
git pull
docker-compose down
docker-compose up -d --build
```

### 🔧 Monitoring

```bash
# Xem logs
docker-compose logs -f app

# Xem resource usage
docker stats

# Restart container
docker-compose restart

# Stop all
docker-compose down
```

---

## Phương pháp 3: Container Registry

### 📝 Bước 1: Tạo Container Registry

1. Dashboard → **Create** → **Container Registry**
2. **Name**: `stream-registry`
3. **Plan**: Basic ($5/month)
4. Click **"Create Registry"**

### 📝 Bước 2: Build và Push Image

```bash
# 1. Login to registry
doctl registry login

# 2. Build image với tag
docker build -t registry.digitalocean.com/stream-registry/stream-app:latest .

# 3. Push image
docker push registry.digitalocean.com/stream-registry/stream-app:latest
```

### 📝 Bước 3: Deploy từ Registry

Trong droplet:

```bash
# 1. Login registry từ droplet
doctl registry login

# 2. Pull và run
docker pull registry.digitalocean.com/stream-registry/stream-app:latest
docker run -d -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  --restart unless-stopped \
  --name stream-app \
  registry.digitalocean.com/stream-registry/stream-app:latest
```

---

## 🎯 So sánh các phương pháp

| Tiêu chí | App Platform | Droplet + Docker | Container Registry |
|----------|--------------|------------------|-------------------|
| **Độ dễ** | ⭐⭐⭐⭐⭐ Rất dễ | ⭐⭐⭐ Trung bình | ⭐⭐ Khó |
| **Giá** | $5/tháng | $6/tháng | $11/tháng (droplet + registry) |
| **Auto-deploy** | ✅ Có | ❌ Không | ❌ Không |
| **Quản lý** | Tự động | Thủ công | Thủ công |
| **Scaling** | Tự động | Thủ công | Thủ công |
| **SSL** | Miễn phí | Cần cài | Cần cài |
| **Khuyên dùng cho** | Beginners | Developers | DevOps/Teams |

---

## 🛠️ Troubleshooting

### App không start được

**App Platform**:
```bash
# Xem logs
doctl apps logs <APP_ID> --type build
doctl apps logs <APP_ID> --type run

# Kiểm tra env variables
# Dashboard → App → Settings → Environment Variables
```

**Droplet**:
```bash
# Xem logs container
docker-compose logs -f

# Kiểm tra container status
docker ps -a

# Restart
docker-compose restart

# Rebuild
docker-compose down
docker-compose up -d --build
```

### Port không accessible

```bash
# Kiểm tra firewall
ufw status

# Mở port
ufw allow 3000/tcp

# Kiểm tra process listening
netstat -tlnp | grep 3000
```

### Out of memory

```bash
# Kiểm tra memory
free -h

# Upgrade droplet hoặc app plan
```

### SSL certificate issues

```bash
# Renew certificate
certbot renew

# Kiểm tra nginx config
nginx -t

# Restart nginx
systemctl restart nginx
```

---

## 📚 Resources

- [DigitalOcean App Platform Docs](https://docs.digitalocean.com/products/app-platform/)
- [Docker Documentation](https://docs.docker.com/)
- [Nginx Configuration](https://nginx.org/en/docs/)
- [Let's Encrypt](https://letsencrypt.org/)

---

## 💡 Tips

1. **Backup trước khi update**: `docker-compose down && docker-compose up -d`
2. **Monitor logs thường xuyên**: Phát hiện lỗi sớm
3. **Sử dụng environment variables**: Không hardcode sensitive data
4. **Cài auto-renew SSL**: Tránh expire
5. **Setup monitoring**: Uptime Robot, Datadog, etc.

---

## 🎉 Chúc bạn deploy thành công!

Nếu cần hỗ trợ thêm, hãy tạo issue trên GitHub repository.

