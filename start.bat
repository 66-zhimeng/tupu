@echo off
chcp 65001 >nul
title 研发流程管理系统 - 一键启动

echo ========================================
echo   研发流程管理系统 - 一键启动
echo ========================================
echo.

:: 1. 启动 Docker 容器
echo [1/3] 启动 PostgreSQL + MinIO 容器...
cd /d e:\ceshi_python\tupu
docker compose -f docker-compose.dev.yml up -d
if %errorlevel% neq 0 (
    echo [错误] Docker 启动失败，请确认 Docker Desktop 已运行！
    pause
    exit /b 1
)
echo [1/3] ✓ 数据库容器已启动
echo.

:: 等待 PostgreSQL 就绪
echo 等待 PostgreSQL 就绪...
timeout /t 3 /nobreak >nul

:: 2. 启动后端（新窗口）
echo [2/3] 启动后端 FastAPI...
start "后端-FastAPI" cmd /k "cd /d e:\ceshi_python\tupu\backend && python -m uvicorn app.main:app --reload --port 8000"
echo [2/3] ✓ 后端已在新窗口启动 (http://localhost:8000)
echo.

:: 等待后端初始化
timeout /t 2 /nobreak >nul

:: 3. 启动前端（新窗口）
echo [3/3] 启动前端 React...
start "前端-React" cmd /k "cd /d e:\ceshi_python\tupu\frontend && npm run dev"
echo [3/3] ✓ 前端已在新窗口启动 (http://localhost:5173)
echo.

echo ========================================
echo   全部启动完成！
echo   前端: http://localhost:5173
echo   后端: http://localhost:8000/docs
echo   MinIO: http://localhost:9001
echo ========================================
echo.
echo 按任意键打开浏览器访问前端...
pause >nul
start http://localhost:5173
