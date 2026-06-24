@echo off
title ProcureLink Docker
setlocal

echo ========================================
echo  ProcureLink v2 - Docker Startup
echo ========================================
echo.

:: ── Check Docker is running ─────────────────────────────────────────
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running or not installed.
    echo         Start Docker Desktop and try again.
    pause
    exit /b 1
)

:: ── Handle arguments ────────────────────────────────────────────────
set ACTION=%1
if "%ACTION%"=="" set ACTION=up

if /i "%ACTION%"=="down" goto :down
if /i "%ACTION%"=="stop" goto :down
if /i "%ACTION%"=="logs" goto :logs
if /i "%ACTION%"=="restart" goto :restart
if /i "%ACTION%"=="up"   goto :up

echo Usage: start-docker.bat [up^|down^|logs^|restart]
pause
exit /b 0

:: ── Up (build + start) ───────────────────────────────────────────────
:up
echo [1/1] Building images and starting containers...
echo       This may take a few minutes on first run.
echo.
docker compose -f deployment/docker-compose.yml up --build -d
if errorlevel 1 (
    echo.
    echo [ERROR] docker compose failed. Run "start-docker.bat logs" to see details.
    pause
    exit /b 1
)
echo.
echo ========================================
echo  Containers are starting up...
echo.
echo   App (nginx)  : http://localhost:40
echo   API Docs     : http://localhost:40/api/docs
echo.
echo  Run "start-docker.bat logs"    to follow logs
echo  Run "start-docker.bat down"    to stop everything
echo ========================================
echo.
goto :end

:: ── Down (stop + remove containers) ──────────────────────────────────
:down
echo Stopping containers...
docker compose -f deployment/docker-compose.yml down
echo Done.
goto :end

:: ── Logs ─────────────────────────────────────────────────────────────
:logs
docker compose -f deployment/docker-compose.yml logs -f
goto :end

:: ── Restart ──────────────────────────────────────────────────────────
:restart
echo Restarting containers (no rebuild)...
docker compose -f deployment/docker-compose.yml restart
echo Done.
goto :end

:end
pause > nul
endlocal
