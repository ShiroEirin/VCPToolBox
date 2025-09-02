@echo off
echo VCP ToolBox - PM2 停止脚本
echo =====================================

REM 切换到脚本所在目录
cd /d "%~dp0"

echo 正在检查服务状态...
npx pm2 describe vcp-toolbox >nul 2>&1

if %errorlevel% == 0 (
    echo 正在停止 VCP ToolBox 服务...
    npx pm2 stop vcp-toolbox
    
    if %errorlevel% == 0 (
        echo.
        echo ✅ VCP ToolBox 已停止运行
        echo.
        echo 如需完全删除服务: npx pm2 delete vcp-toolbox
        echo 重新启动服务: start_vcp_pm2.bat
        echo.
        echo 当前PM2服务列表:
        npx pm2 status
    ) else (
        echo.
        echo ❌ 停止失败！请检查错误信息
    )
) else (
    echo [信息] 服务 vcp-toolbox 当前未运行
    echo.
    echo 当前PM2服务列表:
    npx pm2 status
)

echo.
pause