@echo off
chcp 65001 >nul
title 浮岛时代 V0.1
echo.
echo ========================================
echo        浮岛时代 V0.1 正在启动
echo ========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js。
  echo 请先安装 Node.js 18 或更高版本，然后重新双击本文件。
  echo.
  pause
  exit /b 1
)
start "" http://localhost:3000
node server\server.js
pause
