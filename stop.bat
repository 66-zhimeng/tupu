@echo off
chcp 65001 >nul
title 研发流程管理系统 - 一键停止

echo ========================================
echo   研发流程管理系统 - 一键停止
echo ========================================
echo.

:: 停止 Docker 容器
echo 停止 Docker 容器...
cd /d e:\ceshi_python\tupu
docker compose -f docker-compose.dev.yml down
echo ✓ 容器已停止
echo.

echo 请手动关闭后端和前端的终端窗口。
pause
