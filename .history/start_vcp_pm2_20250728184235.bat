@echo off
echo VCP ToolBox - PM2 启动脚本
echo =====================================
echo 正在启动PM2服务...

cd /d "%~dp0"

npx pm2 start ecosystem.config.js

if %errorlevel% == 0 (
    echo.
    echo ✅ 启动成功！
    echo 如需重启服务，请使用 restart_vcp_pm2.bat
    echo 如需停止服务，请使用 stop_vcp_pm2.bat
    echo.
    echo 当前服务状态:
    npx pm2 status vcp-toolbox-local
) else (
    echo 正在启动 VCP ToolBox 本地开发服务...
    echo 使用配置文件: config.local.env
    echo 服务端口: 6006
    npx pm2 start ecosystem.config.js
    
    if %errorlevel% == 0 (
        echo.
        echo ✅ VCP ToolBox 本地开发版启动成功！
        echo.
        echo 服务地址: http://localhost:6006
        echo 配置文件: config.local.env
        echo.
        echo 服务状态:
        npx pm2 status vcp-toolbox-local
        echo.
        echo 查看日志: npx pm2 logs vcp-toolbox-local
        echo 停止服务: stop_vcp_pm2.bat
        echo 重启服务: restart_vcp_pm2.bat
    ) else (
        echo.
        echo ❌ 启动失败！请检查错误信息
    )
)

echo.
pause