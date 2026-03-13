@echo off
chcp 65001 >nul 2>&1
title TUPU - Start

echo ========================================
echo   TUPU - One Click Start
echo ========================================
echo.

echo [1/3] Starting PostgreSQL + MinIO ...
cd /d e:\ceshi_python\tupu
docker compose -f docker-compose.dev.yml up -d
if %errorlevel% neq 0 (
    echo [ERROR] Docker failed. Make sure Docker Desktop is running!
    pause
    exit /b 1
)
echo [1/3] OK - Database containers started
echo.

echo Waiting for PostgreSQL to be ready...
timeout /t 3 /nobreak >nul

echo [2/3] Starting backend FastAPI ...
start "TUPU-Backend" cmd /k "cd /d e:\ceshi_python\tupu\backend && python -m uvicorn app.main:app --reload --port 8000"
echo [2/3] OK - Backend started at http://localhost:8000
echo.

timeout /t 2 /nobreak >nul

echo [3/3] Starting frontend React ...
start "TUPU-Frontend" cmd /k "cd /d e:\ceshi_python\tupu\frontend && npm run dev"
echo [3/3] OK - Frontend started at http://localhost:5173
echo.

echo ========================================
echo   All services started!
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:8000/docs
echo   MinIO:    http://localhost:9001
echo ========================================
echo.
echo Press any key to open browser...
pause >nul
start http://localhost:5173
