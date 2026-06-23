@echo off
echo VCP ToolBox - PM2 重启脚本
echo =====================================

REM 切换到脚本所在目录
cd /d "%~dp0"

echo 正在检查服务状态...
npx pm2 describe vcp-toolbox >nul 2>&1

if %errorlevel% == 0 (
    echo 正在重启 VCP ToolBox 服务...
    npx pm2 restart vcp-toolbox
    
    if %errorlevel% == 0 (
        echo.
        echo ✅ VCP ToolBox 重启成功！
        echo.
        echo 服务状态:
        npx pm2 status vcp-toolbox
        echo.
        echo 查看日志: npx pm2 logs vcp-toolbox
        echo 停止服务: stop_vcp_pm2.bat
    ) else (
        echo.
        echo ❌ 重启失败！请检查错误信息
    )
) else (
    echo [警告] 服务 vcp-toolbox 未运行
    echo 正在尝试启动服务...
    npx pm2 start server.js --name vcp-toolbox
    
    if %errorlevel% == 0 (
        echo.
        echo ✅ VCP ToolBox 启动成功！
        echo.
        echo 服务状态:
        npx pm2 status vcp-toolbox
    ) else (
        echo.
        echo ❌ 启动失败！请检查错误信息
    )
)

echo.
pause