@echo off
setlocal
title NoCode App - extract PostgreSQL

rem Run this ONCE on the TARGET (offline) PC. It unpacks the bundled
rem postgresql.zip into .\pgsql so the app can run without any install.

if exist "%~dp0pgsql\bin\postgres.exe" (
    echo PostgreSQL already extracted at .\pgsql - nothing to do.
    pause
    exit /b 0
)
if not exist "%~dp0postgresql.zip" (
    echo [ERROR] postgresql.zip not found next to this script.
    echo.
    echo   This script is only for offline distributions that ship postgresql.zip.
    echo   A git clone does NOT include it - PostgreSQL is not part of this repository.
    echo.
    echo   To run without Docker, do ONE of the following instead:
    echo     1. Install PostgreSQL 16 or later normally, or
    echo     2. Download the portable Windows x86-64 binaries zip from
    echo        https://www.enterprisedb.com/download-postgresql-binaries
    echo        and extract it here so that .\pgsql\bin\postgres.exe exists.
    echo.
    echo   PostgreSQL elsewhere on disk: set NOCODEAPP_PG_HOME to its root folder.
    echo   See docs\setup-guide.md for details.
    pause
    exit /b 1
)

echo Extracting postgresql.zip into .\pgsql ... (this can take a minute)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%~dp0postgresql.zip' -DestinationPath '%~dp0' -Force"

if not exist "%~dp0pgsql\bin\postgres.exe" (
    echo [ERROR] Extraction did not produce pgsql\bin\postgres.exe
    pause
    exit /b 1
)

rem App-local VC++ runtime so PostgreSQL runs even without the system redistributable.
if exist "%~dp0pg-runtime\msvcp140.dll" (
    echo Installing app-local VC++ runtime into pgsql\bin ...
    copy /Y "%~dp0pg-runtime\*.dll" "%~dp0pgsql\bin\" >nul
)

echo Done. Next: run setup.bat
pause
