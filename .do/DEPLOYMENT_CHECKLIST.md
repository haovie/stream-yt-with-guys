# ✅ Deployment Checklist - DigitalOcean

Sử dụng checklist này để đảm bảo deploy thành công!

---

## 📋 Pre-Deployment Checklist

### ☑️ Chuẩn bị Code

- [X] Code đã được test kỹ locally
- [X] Không có lỗi khi chạy `npm start`
- [X] Docker build thành công: `docker-compose up --build`
- [X] Các environment variables đã được cấu hình
- [X] `.gitignore` đã loại bỏ `node_modules`, `.env`
- [X] `package.json` có đầy đủ dependencies

### ☑️ Chuẩn bị GitHub

- [X] Đã tạo GitHub repository
- [X] Repository là public hoặc đã connect với DigitalOcean
- [ ] File `.do/app.yaml` đã cập nhật đúng repo name
- [ ] Code đã được push lên GitHub

### ☑️ Chuẩn bị DigitalOcean

- [ ] Đã có tài khoản DigitalOcean
- [ ] Đã thêm phương thức thanh toán (hoặc có credit)
- [ ] Đã tạo API token (nếu dùng CLI)

---

## 🚀 Deployment Steps - App Platform

### Bước 1: Push to GitHub

```bash
# Checklist:
□ git add .
□ git commit -m "Ready for deployment"
□ git push origin main
□ Verify trên GitHub: code đã lên chưa?
```

### Bước 2: Create App

#### Via Dashboard:

```
□ Go to: https://cloud.digitalocean.com/apps/new
□ Connect GitHub repository
□ Select repo: <your-username>/stream
□ Select branch: main
□ Enable Autodeploy: ✅
□ Click Next
```

#### Via CLI:

```bash
□ Install doctl: brew install doctl
□ Authenticate: doctl auth init
□ Deploy: doctl apps create --spec .do/app.yaml
□ Get App ID: doctl apps list
```

### Bước 3: Configure App

```
□ Build Command: npm install (hoặc để trống)
□ Run Command: npm start
□ HTTP Port: 3000
□ Environment Variables:
  □ NODE_ENV = production
  □ PORT = 3000
```

### Bước 4: Select Plan

```
□ Plan: Basic
□ Instance Size: $5/month (512MB RAM)
□ Region: Singapore (gần VN nhất)
```

### Bước 5: Deploy

```
□ App Name: youtube-stream-chat (hoặc tên bạn muốn)
□ Click "Create Resources"
□ Đợi deploy (3-5 phút)
```

---

## ✅ Post-Deployment Checklist

### ☑️ Kiểm tra App Running

```bash
# Qua Dashboard:
□ Status hiển thị "Active" (màu xanh)
□ Không có error trong Build Logs
□ Không có error trong Runtime Logs

# Qua CLI:
□ doctl apps list  # Status = ACTIVE
□ doctl apps logs <APP_ID> -f  # Không có error
```

### ☑️ Test Functionality

```
□ Mở URL app: https://your-app.ondigitalocean.app
□ Trang chủ load được
□ Tạo room mới thành công
□ Join room thành công
□ Paste YouTube link và play video
□ Video phát được
□ Chat hoạt động
□ Socket.IO connected (kiểm tra console)
```

### ☑️ Performance Check

```
□ Trang load nhanh (< 3s)
□ Video không lag
□ Chat realtime (< 1s delay)
□ Memory usage OK (xem trong Dashboard)
□ CPU usage OK
```

### ☑️ Security Check

```
□ HTTPS enabled (tự động bởi App Platform)
□ SSL certificate valid
□ Không có warning trong browser
□ Environment variables không bị expose
```

---

## 🔧 Configuration Checklist

### ☑️ Domain Setup (Optional)

```
□ Mua domain (nếu chưa có)
□ Add domain trong App Settings
□ Configure DNS records:
  Type: CNAME
  Name: @
  Value: <your-app>.ondigitalocean.app
□ Đợi DNS propagate (15-60 phút)
□ SSL auto-renewed
```

### ☑️ Monitoring Setup

```
□ Enable alerts trong Settings → Alerts
□ Set alert email
□ Configure thresholds:
  □ CPU > 80%
  □ Memory > 80%
  □ Failed health checks > 3
```

### ☑️ Backup & Recovery

```
□ Code đã backup trên GitHub
□ Có thể rollback về previous deployment
□ Biết cách xem logs: doctl apps logs <APP_ID>
```

---

## 🐛 Troubleshooting Checklist

### ❌ Build Failed

```
□ Kiểm tra Build Logs trong Dashboard
□ Xác nhận package.json có đầy đủ dependencies
□ Kiểm tra Node version compatibility
□ Verify GitHub connection
□ Try rebuild: Apps → Settings → Force Rebuild
```

### ❌ Deploy Failed

```
□ Kiểm tra Runtime Logs
□ Verify environment variables
□ Check health check endpoint (/)
□ Verify port = 3000
□ Ensure app starts trong < 30s
```

### ❌ App Crashes

```
□ Xem Runtime Logs: doctl apps logs <APP_ID> -f
□ Check memory limit
□ Verify database connections (nếu có)
□ Review recent code changes
□ Rollback về previous version nếu cần
```

### ❌ Performance Issues

```
□ Check CPU/Memory usage trong Dashboard
□ Review logs for errors
□ Consider upgrade plan
□ Optimize code (lazy loading, caching)
```

---

## 📊 Monitoring Checklist

### Daily:

```
□ Quick check: App URL loads OK
□ Glance at error logs
```

### Weekly:

```
□ Review performance metrics
□ Check error rate
□ Verify autodeploy working
□ Review resource usage trends
```

### Monthly:

```
□ Full security audit
□ Update dependencies: npm update
□ Review and optimize costs
□ Backup verification
□ Load testing
```

---

## 💰 Cost Checklist

### Monthly Review:

```
□ Verify bill matches expectations
□ Check if need to upgrade/downgrade
□ Review bandwidth usage
□ Optimize if needed
```

### Current Plan:

```
Plan: Basic $5/month
- 512 MB RAM
- 1 vCPU  
- 40 GB Bandwidth
- Enough cho: ~10,000 requests/day
```

---

## 🎯 Success Criteria

✅ App deployed và accessible
✅ Tất cả features hoạt động
✅ Performance tốt (< 3s load time)
✅ Autodeploy setup
✅ Monitoring active
✅ HTTPS working
✅ No errors trong logs
✅ Team có thể access

---

## 📞 Support Resources

- 📖 [Full Deployment Guide](../DEPLOYMENT.md)
- 🚀 [Quick Start](../QUICKSTART_DEPLOY.md)
- 🌐 [DigitalOcean Docs](https://docs.digitalocean.com/products/app-platform/)
- 💬 [Community Forum](https://www.digitalocean.com/community/)
- 🎫 [Support Tickets](https://cloud.digitalocean.com/support)

---

## 🎉 Deployment Complete!

Khi tất cả checkboxes đã được tick, deployment của bạn thành công!

**Next Steps:**

1. Share URL với team
2. Setup custom domain (optional)
3. Configure monitoring alerts
4. Plan for scaling (nếu cần)

**Happy Deploying! 🚀**
