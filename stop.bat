@echo off
chcp 65001 >nul 2>&1
title TUPU - Stop

echo ========================================
echo   TUPU - Stop All Services
echo ========================================
echo.

echo Stopping Docker containers...
cd /d e:\ceshi_python\tupu
docker compose -f docker-compose.dev.yml down
echo OK - Containers stopped
echo.
echo Please manually close the Backend and Frontend terminal windows.
pause
