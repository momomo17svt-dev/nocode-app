@echo off
setlocal
cd /d "%~dp0"
title NoCode App - Docker stop

docker compose down
if errorlevel 1 (
    echo [ERROR] Docker shutdown failed.
    pause
    exit /b 1
)

echo Docker services stopped. Database data was preserved.
pause
