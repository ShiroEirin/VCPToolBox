@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
npx pm2 restart ecosystem.config.js
pause