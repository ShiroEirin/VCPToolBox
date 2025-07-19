#!/bin/bash
# VCPChat自动更新脚本
# 作者：VCP项目维护团队
# 最后更新：2025-07-19

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# 检查是否在VCPChat目录
if [[ ! -f "package.json" ]] || [[ ! -d "modules" ]]; then
    print_error "当前目录不是VCPChat项目根目录，请切换到正确目录后执行"
    exit 1
fi

print_info "开始VCPChat项目更新..."

# 1. 备份关键文件
backup_files() {
    print_info "备份关键配置文件..."
    
    # 备份配置文件
    find . -name "config.env" -exec cp {} {}.backup \;
    find . -name "plugin-manifest.json" -exec cp {} {}.backup \;
    
    # 备份package.json
    cp package.json package.json.backup
    
    print_info "备份完成"
}

# 2. 获取远程更新
fetch_updates() {
    print_info "获取原作者最新代码..."
    
    # 检查upstream是否存在
    if ! git remote | grep -q "upstream"; then
        print_error "upstream远程仓库未配置，请添加原作者仓库为upstream"
        exit 1
    fi
    
    git fetch upstream
    print_info "远程更新获取完成"
}

# 3. 自动合并
auto_merge() {
    print_info "执行自动合并..."
    
    # 确保在main分支
    current_branch=$(git rev-parse --abbrev-ref HEAD)
    if [[ "$current_branch" != "main" ]]; then
        git checkout main
    fi
    
    # 执行合并，优先采用原作者代码
    if git merge upstream/main --no-edit --strategy-option=theirs; then
        print_info "自动合并成功"
    else
        print_warn "检测到冲突，采用原作者代码解决..."
        git checkout --theirs .
        git add .
        git commit -m "自动合并：采用原作者代码解决冲突"
        print_info "冲突已解决"
    fi
}

# 4. 推送到fork
push_to_fork() {
    print_info "推送到个人fork..."
    
    if git push origin main; then
        print_info "推送成功"
    else
        print_error "推送失败，请检查网络连接和权限"
        exit 1
    fi
}

# 5. 清理备份
cleanup() {
    print_info "更新完成，清理备份文件..."
    find . -name "*.backup" -type f -delete 2>/dev/null || true
}

# 6. 更新依赖（如果有）
update_dependencies() {
    if [[ -f "package.json" ]]; then
        print_info "检查依赖更新..."
        if [[ -f "package-lock.json" ]]; then
            npm ci
            print_info "依赖已更新"
        fi
    fi
}

# 主执行流程
main() {
    # 检查git仓库状态
    if [[ ! -d ".git" ]]; then
        print_error "当前目录不是Git仓库"
        exit 1
    fi
    
    # 执行更新步骤
    backup_files
    fetch_updates
    auto_merge
    update_dependencies
    push_to_fork
    cleanup
    
    print_info "🎉 VCPChat更新完成！"
}

# 执行主函数
main

# 记录日志
echo "[$(date '+%Y-%m-%d %H:%M:%S')] VCPChat更新完成" >> ../update.log