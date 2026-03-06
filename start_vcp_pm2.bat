 @echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

REM 禁用代理以避免TavilySearch的HTTP/HTTPS协议冲突
set HTTP_PROXY=
set HTTPS_PROXY=
set http_proxy=
set https_proxy=

npx pm2 start server.js --name vcp-toolbox-local
pause