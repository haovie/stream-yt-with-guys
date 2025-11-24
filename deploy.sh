#!/bin/bash

# Script deploy ứng dụng lên DigitalOcean
# Usage: ./deploy.sh [method]
# Methods: app-platform, droplet, docker

set -e

echo "🚀 DigitalOcean Deployment Script"
echo "=================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Method 1: App Platform
deploy_app_platform() {
    print_info "Deploying với DigitalOcean App Platform..."
    echo ""
    
    # Check if doctl is installed
    if ! command_exists doctl; then
        print_warning "doctl chưa được cài đặt"
        echo ""
        echo "Cài đặt doctl:"
        echo "  brew install doctl"
        echo ""
        echo "Hoặc deploy thủ công qua Dashboard:"
        echo "  https://cloud.digitalocean.com/apps/new"
        exit 1
    fi
    
    # Check if authenticated
    if ! doctl auth list >/dev/null 2>&1; then
        print_warning "Chưa authenticate với DigitalOcean"
        echo ""
        echo "Chạy: doctl auth init"
        echo "Lấy API token tại: https://cloud.digitalocean.com/account/api/tokens"
        exit 1
    fi
    
    # Check if .do/app.yaml exists
    if [ ! -f ".do/app.yaml" ]; then
        print_error "Không tìm thấy file .do/app.yaml"
        exit 1
    fi
    
    # Check if GitHub repo is set
    if grep -q "YOUR_GITHUB_USERNAME" .do/app.yaml; then
        print_error "Vui lòng cập nhật GitHub username trong .do/app.yaml"
        echo ""
        echo "Mở file .do/app.yaml và thay đổi:"
        echo "  repo: YOUR_GITHUB_USERNAME/stream"
        echo "thành:"
        echo "  repo: <your-username>/stream"
        exit 1
    fi
    
    print_info "Đang tạo app..."
    doctl apps create --spec .do/app.yaml --format ID,DefaultIngress,ActiveDeployment.Phase
    
    print_success "App đã được tạo!"
    echo ""
    print_info "Xem danh sách apps:"
    doctl apps list
    echo ""
    print_info "Xem logs:"
    echo "  doctl apps logs <APP_ID> -f"
}

# Method 2: Deploy to Droplet
deploy_droplet() {
    print_info "Hướng dẫn deploy lên Droplet..."
    echo ""
    
    # Check if we're on a droplet or local
    if [ -f "/etc/digitalocean" ] || [ "$DEPLOY_TARGET" = "droplet" ]; then
        print_info "Đang deploy trên Droplet..."
        
        # Install Docker if not exists
        if ! command_exists docker; then
            print_info "Cài đặt Docker..."
            curl -fsSL https://get.docker.com -o get-docker.sh
            sh get-docker.sh
            rm get-docker.sh
            print_success "Docker đã được cài đặt"
        fi
        
        # Install Docker Compose if not exists
        if ! command_exists docker-compose; then
            print_info "Cài đặt Docker Compose..."
            apt update
            apt install -y docker-compose
            print_success "Docker Compose đã được cài đặt"
        fi
        
        # Build and run
        print_info "Building và running containers..."
        docker-compose down
        docker-compose up -d --build
        
        print_success "Deploy thành công!"
        echo ""
        print_info "Kiểm tra status:"
        docker-compose ps
        
    else
        print_info "Để deploy lên Droplet, SSH vào droplet và chạy:"
        echo ""
        echo "  ssh root@YOUR_DROPLET_IP"
        echo "  git clone https://github.com/YOUR_USERNAME/stream.git"
        echo "  cd stream"
        echo "  DEPLOY_TARGET=droplet ./deploy.sh droplet"
        echo ""
        print_info "Hoặc xem hướng dẫn chi tiết trong DEPLOYMENT.md"
    fi
}

# Method 3: Docker local build and test
test_docker() {
    print_info "Testing Docker build locally..."
    echo ""
    
    if ! command_exists docker; then
        print_error "Docker chưa được cài đặt"
        echo "Cài đặt Docker Desktop: https://www.docker.com/products/docker-desktop"
        exit 1
    fi
    
    print_info "Building image..."
    docker build -t stream-app:test .
    
    print_success "Build thành công!"
    echo ""
    
    print_info "Running container..."
    docker run -d \
        -p 3000:3000 \
        -e NODE_ENV=production \
        -e PORT=3000 \
        --name stream-app-test \
        stream-app:test
    
    print_success "Container đang chạy!"
    echo ""
    print_info "Truy cập: http://localhost:3000"
    echo ""
    print_info "Dừng container:"
    echo "  docker stop stream-app-test"
    echo "  docker rm stream-app-test"
}

# Push to GitHub
push_to_github() {
    print_info "Pushing code to GitHub..."
    echo ""
    
    if ! command_exists git; then
        print_error "Git chưa được cài đặt"
        exit 1
    fi
    
    # Check if git repo
    if [ ! -d ".git" ]; then
        print_warning "Chưa khởi tạo git repository"
        echo ""
        read -p "Khởi tạo git repo? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git init
            print_success "Git repo đã được khởi tạo"
        else
            exit 1
        fi
    fi
    
    # Check if remote exists
    if ! git remote get-url origin >/dev/null 2>&1; then
        print_warning "Chưa có remote origin"
        echo ""
        read -p "Nhập GitHub repository URL: " repo_url
        git remote add origin "$repo_url"
        print_success "Remote origin đã được thêm"
    fi
    
    # Add and commit
    git add .
    
    # Check if there are changes
    if git diff-index --quiet HEAD --; then
        print_info "Không có thay đổi để commit"
    else
        read -p "Nhập commit message: " commit_msg
        git commit -m "$commit_msg"
        print_success "Changes committed"
    fi
    
    # Push
    print_info "Pushing to GitHub..."
    git push -u origin main || git push -u origin master
    
    print_success "Code đã được push lên GitHub!"
}

# Show menu
show_menu() {
    echo "Chọn phương pháp deploy:"
    echo ""
    echo "1) App Platform (Khuyên dùng - Dễ nhất)"
    echo "2) Droplet với Docker"
    echo "3) Test Docker locally"
    echo "4) Push to GitHub"
    echo "5) Xem hướng dẫn đầy đủ"
    echo "0) Thoát"
    echo ""
    read -p "Nhập lựa chọn (0-5): " choice
    
    case $choice in
        1)
            deploy_app_platform
            ;;
        2)
            deploy_droplet
            ;;
        3)
            test_docker
            ;;
        4)
            push_to_github
            ;;
        5)
            print_info "Xem file DEPLOYMENT.md để biết hướng dẫn chi tiết"
            if command_exists open; then
                open DEPLOYMENT.md
            elif command_exists xdg-open; then
                xdg-open DEPLOYMENT.md
            else
                cat DEPLOYMENT.md
            fi
            ;;
        0)
            print_info "Thoát..."
            exit 0
            ;;
        *)
            print_error "Lựa chọn không hợp lệ"
            exit 1
            ;;
    esac
}

# Main
if [ $# -eq 0 ]; then
    show_menu
else
    case $1 in
        app-platform)
            deploy_app_platform
            ;;
        droplet)
            deploy_droplet
            ;;
        test)
            test_docker
            ;;
        push)
            push_to_github
            ;;
        help)
            echo "Usage: ./deploy.sh [method]"
            echo ""
            echo "Methods:"
            echo "  app-platform  Deploy với DigitalOcean App Platform"
            echo "  droplet       Deploy lên Droplet với Docker"
            echo "  test          Test Docker build locally"
            echo "  push          Push code to GitHub"
            echo "  help          Hiển thị help"
            echo ""
            echo "Hoặc chạy không tham số để xem menu"
            ;;
        *)
            print_error "Method không hợp lệ: $1"
            echo "Chạy './deploy.sh help' để xem hướng dẫn"
            exit 1
            ;;
    esac
fi

