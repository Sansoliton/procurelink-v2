@echo off
title ProcureLink Startup

echo ========================================
echo  ProcureLink v2 - Starting Application
echo ========================================
echo.

:: Start Backend (SQLite, no Docker needed)
echo [1/2] Starting backend API...
start "ProcureLink Backend" cmd /k "cd /d %~dp0backend && venv\Scripts\activate && uvicorn app.main:app --host 0.0.0.0 --port 2000 --reload"

:: Small pause so backend starts before frontend
timeout /t 2 /nobreak > nul

:: Start Frontend (Vite dev server)
echo [2/2] Starting frontend dev server...
start "ProcureLink Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ========================================
echo  Services starting:
echo   Backend API  : http://localhost:2000
echo   API Docs     : http://localhost:2000/docs
echo   Frontend     : http://localhost:5173
echo ========================================
echo.
echo Press any key to exit this window (services keep running in their own windows)...
pause > nul
