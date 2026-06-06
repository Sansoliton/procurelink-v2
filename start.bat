@echo off
title ProcureLink Dev
setlocal

echo ========================================
echo  ProcureLink v2 - Local Dev Startup
echo ========================================
echo.

:: ── Check venv exists ─────────────────────────────────────────
if not exist "%~dp0backend\venv\Scripts\activate.bat" (
    echo [ERROR] Python venv not found.
    echo         Run:  cd backend ^&^& python -m venv venv ^&^& venv\Scripts\activate ^&^& pip install -r requirements.txt
    pause
    exit /b 1
)

:: ── Check node_modules exists ─────────────────────────────────
if not exist "%~dp0frontend\node_modules" (
    echo [ERROR] Node modules not found.
    echo         Run:  cd frontend ^&^& npm install
    pause
    exit /b 1
)

:: ── Start Backend ─────────────────────────────────────────────
echo [1/2] Starting backend API (port 2000)...
start "ProcureLink Backend" cmd /k "cd /d %~dp0backend && venv\Scripts\activate && uvicorn app.main:app --host 0.0.0.0 --port 2000 --reload"

:: Small pause so backend is up before frontend tries to connect
timeout /t 2 /nobreak > nul

:: ── Start Frontend ────────────────────────────────────────────
echo [2/2] Starting frontend dev server (port 5173)...
start "ProcureLink Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ========================================
echo  Services starting in separate windows:
echo.
echo   Frontend     : http://localhost:5173
echo   Backend API  : http://localhost:2000
echo   API Docs     : http://localhost:2000/docs
echo.
echo  Production URL (after deploy):
echo   App          : https://quotme.sanvx.online
echo   API Docs     : https://quotme.sanvx.online/api/docs
echo ========================================
echo.
echo  Close the Backend and Frontend windows to stop the services.
echo  Press any key to close this window...
pause > nul
endlocal
