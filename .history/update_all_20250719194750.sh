#!/bin/bash
# VCP项目统一更新脚本
# 一键更新VCPChat和VCPToolBox两个项目
# 作者：VCP项目维护团队
# 最后更新：2025-07-19

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
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

print_header() {
    echo -e "${PURPLE}$1${NC}"
}

# 设置工作目录
WORK_DIR="$(dirname "$0")"
cd "$WORK_DIR"

print_header "========================================"
print_header "    VCP项目统一更新脚本 v1.0"
print_header "========================================"
print_header "开始时间：$(date '+%Y-%m-%d %H:%M:%S')"
print_header "========================================"

# 记录开始时间
start_time=$(date +%s)

# 检查git是否安装
if ! command -v git &> /dev/null; then
    print_error "Git未安装，请先安装Git"
    exit 1
fi

# 检查Docker是否安装（用于VCPToolBox）
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_warn "Docker未安装，VCPToolBox更新可能失败"
        return 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_warn "Docker Compose未安装，VCPToolBox更新可能失败"
        return 1
    fi
    
    return 0
}

# 更新单个项目
update_project() {
    local project_name=$1
    local project_dir=$2
    
    print_header ""
    print_header "=== 更新 $project_name ==="
    print_header ""
    
    # 检查项目目录是否存在
    if [[ ! -d "$project_dir" ]]; then
        print_error "项目目录 $project_dir 不存在，跳过更新"
        return 1
    fi
    
    cd "$project_dir"
    
    # 检查是否为Git仓库
    if [[ ! -d ".git" ]]; then
        print_warn "$project_name 不是Git仓库，跳过更新"
        cd ..
        return 1
    fi
    
    # 检查更新脚本是否存在
    local update_script=""
    if [[ "$project_name" == "VCPChat" ]]; then
        update_script="./update_vcpchat.sh"
    elif [[ "$project_name" == "VCPToolBox" ]]; then
        update_script="./update_vcptoolbox.sh"
    fi
    
    if [[ -f "$update_script" ]]; then
        print_info "使用项目专用更新脚本：$update_script"
        
        # 确保脚本有执行权限
        chmod +x "$update_script"
        
        # 执行更新
        if "./$update_script"; then
            print_info "✅ $project_name 更新成功"
        else
            print_error "❌ $project_name 更新失败"
            cd ..
            return 1
        fi
    else
        print_warn "未找到专用更新脚本，使用通用更新流程"
        
        # 通用更新流程
        if [[ -f "package.json" ]] || [[ -f "docker-compose.yml" ]]; then
            # 备份
            find . -name "config.env" -exec cp {} {}.backup \; 2>/dev/null || true
            find . -name "plugin-manifest.json" -exec cp {} {}.backup \; 2>/dev/null || true
            
            # 获取并合并
            git fetch upstream
            git checkout main 2>/dev/null || git checkout master
            git merge upstream/main --no-edit --strategy-option=theirs || git merge upstream/master --no-edit --strategy-option=theirs
            
            # 推送
            git push origin main 2>/dev/null || git push origin master
            
            print_info "✅ $project_name 通用更新完成"
        else
            print_warn "无法确定项目类型，跳过更新"
            cd ..
            return 1
        fi
    fi
    
    cd ..
}

# 显示系统信息
show_system_info() {
    print_step "系统信息检查"
    
    # Git版本
    git_version=$(git --version)
    print_info "Git版本：$git_version"
    
    # Docker版本（如果存在）
    if command -v docker &> /dev/null; then
        docker_version=$(docker --version)
        print_info "Docker版本：$docker_version"
    fi
    
    # Node.js版本（如果存在）
    if command -v node &> /dev/null; then
        node_version=$(node --version)
        print_info "Node.js版本：$node_version"
    fi
}

# 检查更新状态
check_update_status() {
    print_step "检查更新状态"
    
    for project in VCPChat VCPToolBox; do
        if [[ -d "$project/.git" ]]; then
            cd "$project"
            
            # 获取远程更新
            git fetch upstream 2>/dev/null || true
            
            # 检查状态
            local=$(git rev-parse @ 2>/dev/null || echo "unknown")
            remote=$(git rev-parse @{u} 2>/dev/null || echo "unknown")
            
            if [[ "$local" == "$remote" ]]; then
                print_info "✅ $project 已是最新版本"
            elif [[ "$local" != "$remote" ]] && [[ "$remote" != "unknown" ]]; then
                print_info "🔔 $project 有可用更新"
            else
                print_warn "⚠️ $project 状态未知"
            fi
            
            cd ..
        fi
    done
}

# 执行更新
perform_update() {
    local success_count=0
    local total_count=0
    
    # 更新VCPChat
    ((total_count++))
    if update_project "VCPChat" "VCPChat"; then
        ((success_count++))
    fi
    
    # 更新VCPToolBox
    ((total_count++))
    if update_project "VCPToolBox" "VCPToolBox"; then
        ((success_count++))
    fi
    
    return $((total_count - success_count))
}

# 显示更新总结
show_summary() {
    local error_count=$1
    
    print_header ""
    print_header "========================================"
    print_header "更新总结"
    print_header "========================================"
    print_header "结束时间：$(date '+%Y-%m-%d %H:%M:%S')"
    
    # 计算总耗时
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    local minutes=$((duration / 60))
    local seconds=$((duration % 60))
    
    print_header "总耗时：${minutes}分${seconds}秒"
    
    if [[ $error_count -eq 0 ]]; then
        print_header "状态：✅ 所有项目更新成功"
    else
        print_header "状态：❌ $error_count 个项目更新失败"
    fi
    
    print_header "========================================"
    
    # 记录到日志
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] VCP项目统一更新完成，耗时：${minutes}分${seconds}秒，失败：$error_count" >> update.log
}

# 主函数
main() {
    # 显示系统信息
    show_system_info
    
    # 检查更新状态
    check_update_status
    
    # 询问确认
    print_warn ""
    print_warn "即将开始更新所有VCP项目"
    print_warn "请确保已保存所有重要更改"
    print_warn ""
    
    # 执行更新
    perform_update
    local error_code=$?
    
    # 显示总结
    show_summary $error_code
    
    return $error_code
}

# 执行主函数
main