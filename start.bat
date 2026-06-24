@echo off
title ProcureLink Dev
setlocal

echo ========================================
echo  ProcureLink v2 - Local Dev Startup
echo ========================================
echo.

:: ── Check Python is on PATH ────────────────────────────────────────
where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found in PATH.
    echo         Install Python 3.11+ from https://www.python.org/downloads/
    pause
    exit /b 1
)

:: ── Check Node.js is on PATH ───────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found in PATH.
    echo         Install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

:: ── Check venv exists ─────────────────────────────────────────────
cd /d "%~dp0backend"
if not exist "venv\Scripts\activate.bat" (
    echo [SETUP] Python venv not found — creating it now...
    python -m venv venv
    if errorlevel 1 (
        echo [ERROR] Failed to create venv. Check your Python installation.
        pause
        exit /b 1
    )
)
echo [SETUP] Syncing backend dependencies (first run may take a few minutes)...
call venv\Scripts\activate.bat
pip install -q --upgrade -r requirements.txt
if errorlevel 1 (
    echo [ERROR] pip install failed. Check requirements.txt and your network.
    pause
    exit /b 1
)
cd /d "%~dp0"
echo [OK]    Backend dependencies ready.
echo.

:: ── Check node_modules exists ──────────────────────────────────────
if not exist "%~dp0frontend\node_modules" (
    echo [SETUP] Node modules not found — running npm install...
    cd /d "%~dp0frontend"
    npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. Check your Node.js installation and network.
        pause
        exit /b 1
    )
    cd /d "%~dp0"
    echo [OK]    Frontend node_modules ready.
    echo.
)

:: ── Create uploads directory (backend serves files from here) ──────
if not exist "%~dp0backend\uploads" (
    mkdir "%~dp0backend\uploads"
    echo [OK]    Created backend\uploads directory.
)

:: ── Ensure backend .env exists ─────────────────────────────────────
if not exist "%~dp0backend\.env" (
    echo [SETUP] No .env found — creating default local config...
    (
        echo DATABASE_URL=sqlite:///./procurelink.db
        echo SECRET_KEY=local-dev-secret-change-me
        echo ACCESS_TOKEN_EXPIRE_MINUTES=1440
        echo UPLOAD_DIR=./uploads
        echo FRONTEND_URL=http://localhost:5173
        echo ENVIRONMENT=development
        echo DEBUG=true
    ) > "%~dp0backend\.env"
    echo [OK]    Created backend\.env with local defaults.
    echo.
)

:: ── Start Backend ──────────────────────────────────────────────────
echo [1/2] Starting backend API (port 2000)...
start "ProcureLink Backend" cmd /k "cd /d "%~dp0backend" && call venv\Scripts\activate.bat && uvicorn app.main:app --host 0.0.0.0 --port 2000 --reload"

:: Brief pause so the backend socket is open before the frontend starts
timeout /t 3 /nobreak > nul

:: ── Start Frontend ─────────────────────────────────────────────────
echo [2/2] Starting frontend dev server (port 5173)...
start "ProcureLink Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ========================================
echo  Both services starting in new windows:
echo.
echo   App (frontend)   : http://localhost:5173
echo   Backend API      : http://localhost:2000
echo   API Docs         : http://localhost:2000/docs
echo   Uploaded files   : backend\uploads\
echo.
echo  Production URL:
echo   App              : https://quotme.sanvx.online
echo   API Docs         : https://quotme.sanvx.online/api/docs
echo ========================================
echo.
echo  Close the Backend and Frontend windows to stop the services.
echo  Press any key to close this launcher window...
pause > nul
endlocal
