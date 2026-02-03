@echo off
echo Checking status of vcp-toolbox-local via npx pm2...
call npx pm2 status vcp-toolbox-local
echo.
echo Showing last 20 lines of logs...
call npx pm2 logs vcp-toolbox-local --lines 20 --no-daemon
pause
