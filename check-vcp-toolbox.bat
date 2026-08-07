@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo Checking status of vcp-main via npx pm2...
call npx pm2 status vcp-main
echo.
echo Showing last 20 lines of logs...
call npx pm2 logs vcp-main --lines 20 --no-daemon
pause
