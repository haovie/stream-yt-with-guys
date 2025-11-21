#!/bin/bash

echo "🚀 Khởi động YouTube Stream Chat App..."
echo "=================================="

# Kiểm tra Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js chưa được cài đặt!"
    echo "Vui lòng cài đặt Node.js từ: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Kiểm tra npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm chưa được cài đặt!"
    exit 1
fi

echo "✅ npm version: $(npm --version)"

# Cài đặt dependencies nếu chưa có
if [ ! -d "node_modules" ]; then
    echo "📦 Cài đặt dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Lỗi khi cài đặt dependencies!"
        exit 1
    fi
    echo "✅ Dependencies đã được cài đặt!"
else
    echo "✅ Dependencies đã tồn tại"
fi

# Khởi động server
echo "🌟 Khởi động server..."
echo "📱 Ứng dụng sẽ chạy tại: http://localhost:3000"
echo "🛑 Nhấn Ctrl+C để dừng server"
echo "=================================="

npm start