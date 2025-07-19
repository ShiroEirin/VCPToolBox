#!/bin/bash
# VCPToolBox自动更新脚本（含Docker容器更新）
# 作者：VCP项目维护团队
# 最后更新：2025-07-19

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的信息
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 检查是否在VCPToolBox目录
if [[ ! -f "docker-compose.yml" ]] || [[ ! -d "Plugin" ]]; then
    print_error "当前目录不是VCPToolBox项目根目录，请切换到正确目录后执行"
    exit 1
fi

print_info "开始VCPToolBox项目更新（含Docker容器更新）..."

# 1. 备份配置文件和容器状态
backup_all() {
    print_step "1/6 备份配置文件和容器状态..."
    
    # 创建备份目录
    mkdir -p .backup
    
    # 备份配置文件
    find . -name "config.env" -exec cp {} .backup/{}$(date +%Y%m%d_%H%M%S).backup \; 2>/dev/null || true
    find . -name "plugin-manifest.json" -exec cp {} .backup/{}$(date +%Y%m%d_%H%M%S).backup \; 2>/dev/null || true
    
    # 备份重要文件
    cp config.env.example .backup/config.env.example.backup 2>/dev/null || true
    cp docker-compose.yml .backup/docker-compose.yml.backup 2>/dev/null || true
    cp package.json .backup/package.json.backup 2>/dev/null || true
    
    print_info "备份完成，文件保存在.backup目录"
}

# 2. 停止并保存容器
stop_containers() {
    print_step "2/6 停止并保存容器状态..."
    
    # 检查Docker是否运行
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker未运行，请先启动Docker"
        exit 1
    fi
    
    # 备份容器状态
    docker-compose config > .backup/docker-compose-current.yml 2>/dev/null || true
    
    # 停止容器
    print_info "正在停止Docker容器..."
    docker-compose down
    
    # 等待容器完全停止
    sleep 3
    
    # 检查是否还有容器在运行
    if docker-compose ps | grep -q "Up"; then
        print_warn "检测到仍有容器在运行，强制停止..."
        docker-compose down --remove-orphans
    fi
    
    print_info "Docker容器已停止"
}

# 3. 获取并合并代码
update_code() {
    print_step "3/6 获取并合并最新代码..."
    
    # 检查upstream是否存在
    if ! git remote | grep -q "upstream"; then
        print_error "upstream远程仓库未配置，请添加原作者仓库为upstream"
        exit 1
    fi
    
    # 确保在main分支
    current_branch=$(git rev-parse --abbrev-ref HEAD)
    if [[ "$current_branch" != "main" ]]; then
        print_info "切换到main分支..."
        git checkout main
    fi
    
    # 获取远程更新
    print_info "获取原作者最新代码..."
    git fetch upstream
    
    # 执行合并，优先采用原作者代码
    print_info "执行自动合并..."
    if git merge upstream/main --no-edit --strategy-option=theirs; then
        print_info "代码合并成功"
    else
        print_warn "检测到冲突，采用原作者代码解决..."
        git checkout --theirs .
        git add .
        git commit -m "自动合并：采用原作者代码解决冲突 - $(date '+%Y-%m-%d %H:%M:%S')"
        print_info "冲突已解决"
    fi
}

# 4. 重建并启动容器
rebuild_containers() {
    print_step "4/6 重建并启动Docker容器..."
    
    # 检查配置文件变更
    if [[ -f "config.env.example" ]] && [[ -f ".backup/config.env.example.backup" ]]; then
        print_info "检查配置文件更新..."
        if ! diff -q .backup/config.env.example.backup config.env.example >/dev/null 2>&1; then
            print_warn "配置文件模板有更新，请检查config.env是否需要更新"
            print_info "配置文件差异："
            diff .backup/config.env.example.backup config.env.example || true
        fi
    fi
    
    # 重建容器
    print_info "正在重建Docker镜像..."
    docker-compose build --no-cache
    
    print_info "正在启动Docker容器..."
    docker-compose up -d
    
    # 等待服务启动
    print_info "等待服务启动..."
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if docker-compose ps | grep -q "Up"; then
            print_info "Docker容器已成功启动"
            docker-compose ps
            break
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            print_error "容器启动超时，请检查日志"
            docker-compose logs
            exit 1
        fi
        
        print_info "等待服务启动... ($attempt/$max_attempts)"
        sleep 5
        ((attempt++))
    done
}

# 5. 推送到fork
push_changes() {
    print_step "5/6 推送更新到个人fork..."
    
    if git push origin main; then
        print_info "推送成功"
    else
        print_error "推送失败，请检查网络连接和权限"
        exit 1
    fi
}

# 6. 清理和验证
cleanup_and_verify() {
    print_step "6/6 清理和验证..."
    
    # 清理旧备份（保留最近5个）
    if [[ -d ".backup" ]]; then
        find .backup -name "*.backup*" -type f | sort -r | tail -n +6 | xargs rm -f 2>/dev/null || true
    fi
    
    # 验证容器状态
    print_info "验证容器状态..."
    docker-compose ps
    
    # 检查服务端口
    local port=$(grep -E "ports:" docker-compose.yml -A 1 | grep -o "[0-9]*:3000" | cut -d: -f1)
    if [[ -n "$port" ]]; then
        print_info "服务端口：$port"
        print_info "可以访问 http://localhost:$port 验证服务"
    fi
    
    print_info "清理完成"
}

# 回滚函数
rollback() {
    print_error "更新失败，执行回滚..."
    
    # 代码回滚
    git reset --hard HEAD~1 2>/dev/null || true
    
    # 容器回滚
    if [[ -f ".backup/docker-compose.yml.backup" ]]; then
        cp .backup/docker-compose.yml.backup docker-compose.yml
    fi
    
    # 重启容器
    docker-compose down
    docker-compose up -d
    
    print_info "已回滚到更新前状态"
}

# 主执行流程
main() {
    # 检查git仓库状态
    if [[ ! -d ".git" ]]; then
        print_error "当前目录不是Git仓库"
        exit 1
    fi
    
    # 记录开始时间
    start_time=$(date +%s)
    
    # 执行更新步骤
    backup_all
    stop_containers
    update_code
    rebuild_containers
    push_changes
    cleanup_and_verify
    
    # 计算耗时
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    print_info "🎉 VCPToolBox更新完成！"
    print_info "更新耗时：${duration}秒"
}

# 错误处理
trap 'print_error "脚本执行中断"; rollback; exit 1' ERR

# 执行主函数
main

# 记录日志
echo "[$(date '+%Y-%m-%d %H:%M:%S')] VCPToolBox更新完成，耗时：${duration}秒" >> ../update.log