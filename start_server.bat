@echo off
setlocal EnableExtensions EnableDelayedExpansion
title NoCode App

rem --- Locate PostgreSQL: project-local by default; override with NOCODEAPP_PG_HOME ---
set "PG_HOME=%NOCODEAPP_PG_HOME%"
if not defined PG_HOME set "PG_HOME=%~dp0pgsql"
set "PG_BIN=%PG_HOME%\bin"
set "PG_DATA=%PG_HOME%\data"

echo ================================================
echo  NoCode App - start
echo  PG_HOME = %PG_HOME%
echo ================================================
echo.

rem --- Ensure stable secrets and first-run administrator settings ---
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\initialize-env.ps1" -Mode Local
if errorlevel 1 (
    echo [ERROR] Could not initialize backend\.env.
    pause
    exit /b 1
)

if not exist "%PG_BIN%\postgres.exe" (
    echo [ERROR] PostgreSQL not found at "%PG_BIN%".
    echo   Run extract-postgresql.bat first, then setup.bat.
    pause
    exit /b 1
)

echo [1/3] Checking PostgreSQL...
"%PG_BIN%\pg_isready" -h 127.0.0.1 -p 5432 >nul 2>&1
if errorlevel 1 (
    echo     Starting PostgreSQL...
    start "PostgreSQL" /min "%PG_BIN%\postgres.exe" -D "%PG_DATA%"
) else (
    echo     Already running.
)

echo     Waiting for PostgreSQL...
set /a _tries=0
:waitpg
"%PG_BIN%\pg_isready" -h 127.0.0.1 -p 5432 >nul 2>&1
if not errorlevel 1 goto pgok
set /a _tries+=1
if %_tries% GEQ 30 (
    echo.
    echo [ERROR] Could not connect to PostgreSQL.
    echo   - Run setup.bat first if this is the first time.
    echo   - Check that "%PG_DATA%" is initialized.
    echo.
    pause
    exit /b 1
)
timeout /t 1 >nul
goto waitpg
:pgok
echo     OK
echo.

echo [2/3] Starting Backend window  ( http://localhost:3001 )
start "NoCode App Backend" /d "%~dp0backend" cmd /k "set PORT=3001&& npm run start"

echo [3/3] Starting Frontend window ( http://localhost:5173 )
start "NoCode App Frontend" /d "%~dp0frontend" cmd /k npm run dev -- --host 0.0.0.0

echo.
echo ------------------------------------------------
echo  Open http://localhost:5173 in your browser.
echo  From another PC on the LAN: http://THIS-PC-IP:5173
echo  Login with the administrator credentials created by setup.bat.
echo ------------------------------------------------
echo.
echo  If login fails, run setup.bat once, then retry.
echo.
pause
