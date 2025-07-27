@echo off
chcp 65001 >nul
echo VCP ToolBox - PM2 本地开发停止脚本
echo =====================================

REM 切换到脚本所在目录
cd /d "%~dp0"

echo 正在停止 VCP ToolBox 本地开发服务...
npx pm2 stop vcp-toolbox-local

if %errorlevel% == 0 (
    echo ✅ 本地开发服务已停止
    
    echo 正在删除 PM2 进程...
    npx pm2 delete vcp-toolbox-local
    
    if %errorlevel% == 0 (
        echo ✅ 本地开发服务已完全清理
    ) else (
        echo ❌ 删除进程时出现错误
    )
) else (
    echo ❌ 停止服务时出现错误，或服务未运行
)

echo.
echo 当前 PM2 状态:
npx pm2 status

echo.
echo 按任意键退出...
pause >nul