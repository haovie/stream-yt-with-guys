# Sử dụng Node.js 18 Alpine image (nhẹ và bảo mật)
FROM node:18-alpine

# Cài đặt Python3, pip, ffmpeg và yt-dlp cho xử lý stream audio
RUN apk add --no-cache python3 py3-pip ffmpeg && \
    pip install --no-cache-dir yt-dlp --break-system-packages

# Đặt thư mục làm việc
WORKDIR /app

# Copy package.json và package-lock.json
COPY package*.json ./

# Cài đặt dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Tạo user không có quyền root để chạy ứng dụng (bảo mật)
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Chuyển quyền sở hữu thư mục cho user nodejs
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node healthcheck.js

# Chạy ứng dụng
CMD ["npm", "start"]
