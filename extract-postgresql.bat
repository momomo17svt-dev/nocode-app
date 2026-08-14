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
