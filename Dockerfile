# Sử dụng Node.js 18 Alpine image (nhẹ và bảo mật)
FROM node:18-alpine

# Cài đặt Python3, pip, ffmpeg, curl và yt-dlp cho xử lý stream audio
RUN apk add --no-cache python3 py3-pip ffmpeg curl ca-certificates && \
    (pip install --no-cache-dir -U yt-dlp --break-system-packages || pip install --no-cache-dir -U yt-dlp || apk add --no-cache yt-dlp)

# Đặt thư mục làm việc
WORKDIR /app

# Copy package.json và package-lock.json
COPY package*.json ./

# Cài đặt dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Tạo user nodejs kèm home directory hợp lệ và cấp quyền cho thư mục cache
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -h /home/nodejs -u 1001 -G nodejs nodejs && \
    mkdir -p /home/nodejs/.cache /app && \
    chown -R nodejs:nodejs /home/nodejs /app

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node healthcheck.js

# Chạy ứng dụng
CMD ["npm", "start"]
