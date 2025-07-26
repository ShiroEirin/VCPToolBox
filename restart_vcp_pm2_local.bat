@echo off
echo VCP ToolBox - PM2 本地开发重启脚本
echo =====================================

REM 切换到脚本所在目录
cd /d "%~dp0"

echo 正在重启 VCP ToolBox 本地开发服务...
npx pm2 restart vcp-toolbox-local

if %errorlevel% == 0 (
    echo ✅ 本地开发服务重启成功！
    echo.
    echo 服务状态:
    npx pm2 status vcp-toolbox-local
    echo.
    echo 查看日志: npx pm2 logs vcp-toolbox-local
) else (
    echo ❌ 重启失败！
    echo 尝试重新启动服务...
    call start_vcp_pm2_local.bat
)

echo.
pause