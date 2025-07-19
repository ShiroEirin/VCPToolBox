# VCPChat自动更新脚本 (PowerShell版本)
# 作者：VCP项目维护团队
# 最后更新：2025-07-19

# 设置错误处理
$ErrorActionPreference = "Stop"

# 颜色定义
$Green = "`e[32m"
$Yellow = "`e[33m"
$Red = "`e[31m"
$Blue = "`e[34m"
$NC = "`e[0m"

# 打印带颜色的信息
function Write-Info {
    param($Message)
    Write-Host "${Green}[INFO]${NC} $Message"
}

function Write-Warn {
    param($Message)
    Write-Host "${Yellow}[WARN]${NC} $Message"
}

function Write-Error {
    param($Message)
    Write-Host "${Red}[ERROR]${NC} $Message"
}

# 检查是否在VCPChat目录
if (-not (Test-Path "package.json") -or -not (Test-Path "modules")) {
    Write-Error "当前目录不是VCPChat项目根目录，请切换到正确目录后执行"
    exit 1
}

Write-Info "开始VCPChat项目更新..."

# 记录开始时间
$startTime = Get-Date

try {
    # 1. 备份关键文件
    Write-Info "1/5 备份关键配置文件..."
    
    # 创建备份目录
    if (-not (Test-Path ".backup")) {
        New-Item -ItemType Directory -Path ".backup" -Force | Out-Null
    }
    
    # 备份配置文件
    Get-ChildItem -Path . -Recurse -File -Filter "config.env" | ForEach-Object {
        $backupPath = ".backup\$($_.Name)_$(Get-Date -Format 'yyyyMMdd_HHmmss').backup"
        Copy-Item $_.FullName $backupPath -Force
        Write-Info "已备份: $($_.FullName) -> $backupPath"
    }
    
    Get-ChildItem -Path . -Recurse -File -Filter "plugin-manifest.json" | ForEach-Object {
        $backupPath = ".backup\$($_.Name)_$(Get-Date -Format 'yyyyMMdd_HHmmss').backup"
        Copy-Item $_.FullName $backupPath -Force
        Write-Info "已备份: $($_.FullName) -> $backupPath"
    }
    
    # 备份package.json
    if (Test-Path "package.json") {
        Copy-Item "package.json" ".backup\package.json_$(Get-Date -Format 'yyyyMMdd_HHmmss').backup" -Force
    }

    # 2. 获取远程更新
    Write-Info "2/5 获取原作者最新代码..."
    
    # 检查upstream是否存在
    $remotes = git remote
    if ($remotes -notcontains "upstream") {
        Write-Error "upstream远程仓库未配置，请添加原作者仓库为upstream"
        exit 1
    }
    
    git fetch upstream
    Write-Info "远程更新获取完成"

    # 3. 自动合并
    Write-Info "3/5 执行自动合并..."
    
    # 确保在main分支
    $currentBranch = git rev-parse --abbrev-ref HEAD
    if ($currentBranch -ne "main") {
        git checkout main
    }
    
    # 执行合并，优先采用原作者代码
    try {
        git merge upstream/main --no-edit --strategy-option=theirs
        Write-Info "自动合并成功"
    } catch {
        Write-Warn "检测到冲突，采用原作者代码解决..."
        git checkout --theirs .
        git add .
        git commit -m "自动合并：采用原作者代码解决冲突 - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        Write-Info "冲突已解决"
    }

    # 4. 更新依赖（如果有）
    if (Test-Path "package.json") {
        Write-Info "检查依赖更新..."
        if (Test-Path "package-lock.json") {
            npm ci
            Write-Info "依赖已更新"
        }
    }

    # 5. 推送到fork
    Write-Info "4/5 推送更新到个人fork..."
    git push origin main
    Write-Info "推送成功"

    # 6. 清理备份
    Write-Info "5/5 清理备份文件..."
    # 保留最近5个备份
    Get-ChildItem -Path ".backup" -File | Sort-Object LastWriteTime -Descending | Select-Object -Skip 5 | Remove-Item -Force -ErrorAction SilentlyContinue

    # 计算耗时
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalSeconds
    
    Write-Info "🎉 VCPChat更新完成！"
    Write-Info "更新耗时：$([math]::Round($duration, 2))秒"

    # 记录日志
    $logEntry = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] VCPChat更新完成，耗时：$([math]::Round($duration, 2))秒"
    Add-Content -Path "../update.log" -Value $logEntry -ErrorAction SilentlyContinue

} catch {
    Write-Error "更新失败：$($_.Exception.Message)"
    
    # 回滚机制
    Write-Info "执行回滚..."
    git reset --hard HEAD~1 2>$null
    git checkout main 2>$null
    git reset --hard origin/main 2>$null
    
    Write-Error "已回滚到更新前状态"
    exit 1
}