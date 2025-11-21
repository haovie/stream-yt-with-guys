@echo off
echo 🚀 Khoi dong YouTube Stream Chat App...
echo ==================================

REM Kiem tra Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js chua duoc cai dat!
    echo Vui long cai dat Node.js tu: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js version:
node --version

REM Kiem tra npm
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm chua duoc cai dat!
    pause
    exit /b 1
)

echo ✅ npm version:
npm --version

REM Cai dat dependencies neu chua co
if not exist "node_modules" (
    echo 📦 Cai dat dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ Loi khi cai dat dependencies!
        pause
        exit /b 1
    )
    echo ✅ Dependencies da duoc cai dat!
) else (
    echo ✅ Dependencies da ton tai
)

REM Khoi dong server
echo 🌟 Khoi dong server...
echo 📱 Ung dung se chay tai: http://localhost:3000
echo 🛑 Nhan Ctrl+C de dung server
echo ==================================

npm start
pause