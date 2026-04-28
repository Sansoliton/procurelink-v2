@echo off
title ProcureLink Startup

echo ========================================
echo  ProcureLink v2 - Starting Application
echo ========================================
echo.

:: Start Backend (Docker Compose)
echo [1/2] Starting backend services via Docker Compose...
docker-compose up -d
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [WARN] Docker Compose failed. Attempting direct backend startup...
    echo        Make sure PostgreSQL and Redis are running locally.
    echo.
    start "ProcureLink Backend" cmd /k "cd /d %~dp0backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
) else (
    echo [OK] Backend services started.
)

echo.

:: Start Frontend (Vite dev server)
echo [2/2] Starting frontend dev server...
start "ProcureLink Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ========================================
echo  Services starting:
echo   Backend API  : http://localhost:8000
echo   API Docs     : http://localhost:8000/docs
echo   Frontend     : http://localhost:5173
echo ========================================
echo.
echo Press any key to exit this window (services will keep running)...
pause > nul
