@echo off
echo Starting the intermediate server...
:: 清除可能导致 400 错误的系统全局代理环境变量
set http_proxy=
set https_proxy=
node server.js
pause