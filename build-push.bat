@echo off
setlocal

:: ── Config ────────────────────────────────────────────────────────────────────
set REGISTRY=registry.sanvx.online
set BACKEND_IMAGE=%REGISTRY%/procurelink-backend
set FRONTEND_IMAGE=%REGISTRY%/procurelink-frontend
set NGINX_IMAGE=%REGISTRY%/procurelink-nginx

:: Get short git SHA for tagging
for /f "delims=" %%i in ('git rev-parse --short HEAD') do set GIT_SHA=%%i

echo.
echo ============================================================
echo   ProcureLink v2 - Build ^& Push
echo   Registry : %REGISTRY%
echo   Git SHA  : %GIT_SHA%
echo ============================================================
echo.

:: ── Build Backend ─────────────────────────────────────────────────────────────
echo [1/6] Building backend...
docker build --platform linux/amd64 ^
  -t %BACKEND_IMAGE%:latest ^
  -t %BACKEND_IMAGE%:%GIT_SHA% ^
  ./backend
if %ERRORLEVEL% neq 0 ( echo [ERROR] Backend build failed. & exit /b 1 )
echo [OK] Backend built.
echo.

:: ── Build Frontend ────────────────────────────────────────────────────────────
echo [2/6] Building frontend...
docker build --platform linux/amd64 ^
  --build-arg VITE_API_URL=/api ^
  -t %FRONTEND_IMAGE%:latest ^
  -t %FRONTEND_IMAGE%:%GIT_SHA% ^
  ./frontend
if %ERRORLEVEL% neq 0 ( echo [ERROR] Frontend build failed. & exit /b 1 )
echo [OK] Frontend built.
echo.

:: ── Build Nginx proxy ─────────────────────────────────────────────────────────
echo [3/6] Building nginx proxy...
docker build --platform linux/amd64 ^
  -t %NGINX_IMAGE%:latest ^
  -t %NGINX_IMAGE%:%GIT_SHA% ^
  ./deployment/nginx
if %ERRORLEVEL% neq 0 ( echo [ERROR] Nginx build failed. & exit /b 1 )
echo [OK] Nginx built.
echo.

:: ── Push Backend ──────────────────────────────────────────────────────────────
echo [4/6] Pushing backend...
docker push %BACKEND_IMAGE%:latest
docker push %BACKEND_IMAGE%:%GIT_SHA%
if %ERRORLEVEL% neq 0 ( echo [ERROR] Backend push failed. & exit /b 1 )
echo [OK] Backend pushed.
echo.

:: ── Push Frontend ─────────────────────────────────────────────────────────────
echo [5/6] Pushing frontend...
docker push %FRONTEND_IMAGE%:latest
docker push %FRONTEND_IMAGE%:%GIT_SHA%
if %ERRORLEVEL% neq 0 ( echo [ERROR] Frontend push failed. & exit /b 1 )
echo [OK] Frontend pushed.
echo.

:: ── Push Nginx proxy ──────────────────────────────────────────────────────────
echo [6/6] Pushing nginx proxy...
docker push %NGINX_IMAGE%:latest
docker push %NGINX_IMAGE%:%GIT_SHA%
if %ERRORLEVEL% neq 0 ( echo [ERROR] Nginx push failed. & exit /b 1 )
echo [OK] Nginx pushed.
echo.

echo ============================================================
echo   Done! All images pushed to %REGISTRY%
echo   Tags: latest and %GIT_SHA%
echo.
echo   Images:
echo     %BACKEND_IMAGE%
echo     %FRONTEND_IMAGE%
echo     %NGINX_IMAGE%
echo ============================================================
endlocal
