@echo off
title ProcureLink Docker
setlocal

echo ========================================
echo  ProcureLink v2 - Docker Local Stack
echo ========================================
echo.

:: ── Check Docker is running ────────────────────────────────────
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

:: ── Parse argument ─────────────────────────────────────────────
set ACTION=%~1
if "%ACTION%"=="" set ACTION=up

if "%ACTION%"=="down" goto :down
if "%ACTION%"=="logs" goto :logs
if "%ACTION%"=="rebuild" goto :rebuild
if "%ACTION%"=="status" goto :status

:: ── Default: bring stack up ────────────────────────────────────
:up
echo [*] Starting containers...
docker compose -f deployment/docker-compose.yml up -d
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to start containers.
    pause
    exit /b 1
)
echo.
echo [*] Waiting for services to be ready...
timeout /t 5 /nobreak > nul
goto :show_status

:: ── Rebuild then up ───────────────────────────────────────────
:rebuild
echo [*] Rebuilding images (no cache)...
docker compose -f deployment/docker-compose.yml build --no-cache
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)
echo.
echo [*] Starting containers...
docker compose -f deployment/docker-compose.yml up -d
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to start containers.
    pause
    exit /b 1
)
echo.
echo [*] Waiting for services to be ready...
timeout /t 5 /nobreak > nul
goto :show_status

:: ── Stop stack ─────────────────────────────────────────────────
:down
echo [*] Stopping containers...
docker compose -f deployment/docker-compose.yml down
echo [OK] Stack stopped.
goto :end

:: ── Stream logs ────────────────────────────────────────────────
:logs
docker compose -f deployment/docker-compose.yml logs -f
goto :end

:: ── Status ─────────────────────────────────────────────────────
:status
:show_status
docker compose -f deployment/docker-compose.yml ps
echo.
echo ========================================
echo  App     : http://localhost:8080
echo  API     : http://localhost:8080/api
echo  Docs    : http://localhost:8080/api/docs
echo ========================================
echo.
echo  Commands:
echo    docker-start.bat           - start stack
echo    docker-start.bat rebuild   - rebuild + start
echo    docker-start.bat logs      - stream logs
echo    docker-start.bat down      - stop stack
echo    docker-start.bat status    - show status
echo ========================================
echo.

:end
endlocal
