@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

CALL npx pm2 delete vcp-toolbox-local 2>nul
CALL npx pm2 delete vcp-main 2>nul
CALL npx pm2 delete vcp-admin 2>nul
CALL npx pm2 start ecosystem.config.js
CALL npx pm2 list
pause
