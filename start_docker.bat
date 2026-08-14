@echo off
setlocal
cd /d "%~dp0"
title NoCode App - Docker start

if not defined APP_PORT set "APP_PORT=5173"

where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker was not found. Install and start Docker Desktop first.
    pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Desktop is not running.
    pause
    exit /b 1
)

echo Checking Docker configuration...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\initialize-env.ps1" -Mode Docker -AppPort "%APP_PORT%"
if errorlevel 1 (
    echo [ERROR] Could not initialize .env.
    pause
    exit /b 1
)

docker ps -a --filter "label=com.docker.compose.project=antigravity-nocode" --format "{{.ID}}" | findstr . >nul 2>&1
if not errorlevel 1 (
    echo Stopping containers from the previous project name...
    docker compose -p antigravity-nocode down --remove-orphans
    if errorlevel 1 (
        echo [ERROR] Could not stop the previous Docker project.
        pause
        exit /b 1
    )
)

echo Building and starting containers...
docker compose up -d --build
if errorlevel 1 (
    echo [ERROR] Docker startup failed. Run logs_docker.bat for details.
    pause
    exit /b 1
)

echo.
docker compose ps
echo.
echo Open http://localhost:%APP_PORT%
echo.
pause
