@echo off
chcp 65001 >nul
echo VCP ToolBox - PM2 本地开发启动脚本
echo =====================================

REM 切换到脚本所在目录
cd /d "%~dp0"

echo 正在检查本地开发服务状态...
npx pm2 describe vcp-toolbox-local >nul 2>&1

if %errorlevel% == 0 (
    echo [警告] 本地开发服务 vcp-toolbox-local 已经在运行中
    echo 如需重启服务，请使用 restart_vcp_pm2_local.bat
    echo 如需停止服务，请使用 stop_vcp_pm2_local.bat
    echo.
    echo 当前服务状态:
    npx pm2 status vcp-toolbox-local
    echo.
    echo 按任意键退出...
    pause >nul
    exit /b 0
) else (
    echo 正在启动 VCP ToolBox 本地开发服务...
    echo 使用配置文件: config.local.env
    echo 服务端口: 6006 (避免与Docker版本冲突)
    
    set CONFIG_PATH=config.local.env
    npx pm2 start server.js --name vcp-toolbox-local
    
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
        echo 停止服务: stop_vcp_pm2_local.bat
        echo 重启服务: restart_vcp_pm2_local.bat
        echo.
        echo [提示] Docker版本仍可正常使用端口6005
        echo.
        echo 按任意键退出...
        pause >nul
    ) else (
        echo.
        echo ❌ 启动失败！请检查错误信息
        echo 请确保 config.local.env 文件存在
        echo.
        echo 按任意键退出...
        pause >nul
        exit /b 1
    )
)