@echo off
echo VCP ToolBox - PM2 启动脚本
echo =====================================

REM 切换到脚本所在目录
cd /d "%~dp0"

echo 正在检查服务状态...
npx pm2 describe vcp-toolbox >nul 2>&1

if %errorlevel% == 0 (
    echo [警告] 服务 vcp-toolbox 已经在运行中
    echo 如需重启服务，请使用 restart_vcp_pm2.bat
    echo 如需停止服务，请使用 stop_vcp_pm2.bat
    echo.
    echo 当前服务状态:
    npx pm2 status vcp-toolbox
) else (
    echo 正在启动 VCP ToolBox 服务...
    npx pm2 start server.js --name vcp-toolbox
    
    if %errorlevel% == 0 (
        echo.
        echo ✅ VCP ToolBox 启动成功！
        echo.
        echo 服务状态:
        npx pm2 status vcp-toolbox
        echo.
        echo 查看日志: npx pm2 logs vcp-toolbox
        echo 停止服务: stop_vcp_pm2.bat
        echo 重启服务: restart_vcp_pm2.bat
    ) else (
        echo.
        echo ❌ 启动失败！请检查错误信息
    )
)

echo.
pause