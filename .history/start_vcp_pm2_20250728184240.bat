@echo off
echo VCP ToolBox - PM2 启动脚本
echo =====================================
echo 正在启动PM2服务...

cd /d "%~dp0"

npx pm2 start ecosystem.config.js

if %errorlevel% == 0 (
    echo.
    echo ✅ 启动成功！
    echo 访问地址: http://localhost:6006
    echo 配置文件: config.local.env
) else (
    echo.
    echo ❌ 启动失败
)

pause