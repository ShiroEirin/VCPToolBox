# VCPToolBox自动更新脚本 (PowerShell版本，含Docker容器更新)
# 作者：VCP项目维护团队
# 最后更新：2025-07-19

# 设置错误处理
$ErrorActionPreference = "Stop"

# 颜色定义
$Green = "`e[32m"
$Yellow = "`e[33m"
$Red = "`e[31m"
$Blue = "`e[34m"
$Purple = "`e[35m"
$NC = "`e[0m"

# 打印带颜色的信息
function Write-Info {
