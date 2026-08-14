@echo off
setlocal
cd /d "%~dp0"
title NoCode App - export DB

rem Run this on the SOURCE PC before copying the folder, to carry your data
rem (apps, records, users) to the offline PC. Output: migration\nocode_db.sql

if not exist "%~dp0migration" mkdir "%~dp0migration"

set "POSTGRES_USER=postgres"
set "POSTGRES_DB=nocode_db"
if exist "%~dp0.env" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%~dp0.env") do (
        if /i "%%A"=="POSTGRES_USER" set "POSTGRES_USER=%%B"
        if /i "%%A"=="POSTGRES_DB" set "POSTGRES_DB=%%B"
    )
)

where docker >nul 2>&1
if not errorlevel 1 (
    docker compose ps --status running --services 2>nul | findstr /x "db" >nul
    if not errorlevel 1 goto dockerexport
)

set "PG_HOME=%NOCODEAPP_PG_HOME%"
if not defined PG_HOME set "PG_HOME=%~dp0pgsql"
set "PG_BIN=%PG_HOME%\bin"
set "PG_DATA=%PG_HOME%\data"
set "PGPASSWORD=postgres"

echo ================================================
echo  NoCode App - export local database
echo  PG_HOME = %PG_HOME%
echo ================================================
echo.

if not exist "%PG_BIN%\pg_dump.exe" (
    echo [ERROR] pg_dump not found at "%PG_BIN%".
    pause
    exit /b 1
)

echo [1/2] Starting PostgreSQL (if needed)...
"%PG_BIN%\pg_isready" -h 127.0.0.1 -p 5432 >nul 2>&1
if errorlevel 1 (
    start "PostgreSQL" /min "%PG_BIN%\postgres.exe" -D "%PG_DATA%"
)
set /a _tries=0
:waitpg
"%PG_BIN%\pg_isready" -h 127.0.0.1 -p 5432 >nul 2>&1
if not errorlevel 1 goto pgok
set /a _tries+=1
if %_tries% GEQ 30 (
    echo [ERROR] Could not connect to PostgreSQL.
    pause
    exit /b 1
)
timeout /t 1 >nul
goto waitpg
:pgok
echo     OK

echo [2/2] Dumping nocode_db to migration\nocode_db.sql ...
"%PG_BIN%\pg_dump" -U postgres -h 127.0.0.1 -p 5432 --no-owner --no-privileges -d nocode_db -f "%~dp0migration\nocode_db.sql"
if errorlevel 1 (
    echo [ERROR] pg_dump failed.
    pause
    exit /b 1
)

goto done

:dockerexport
echo ================================================
echo  NoCode App - export Docker database
echo ================================================
echo.
echo Dumping %POSTGRES_DB% to migration\nocode_db.sql ...
docker compose exec -T db pg_dump -U "%POSTGRES_USER%" --no-owner --no-privileges "%POSTGRES_DB%" > "%~dp0migration\nocode_db.sql"
if errorlevel 1 (
    echo [ERROR] Docker pg_dump failed.
    pause
    exit /b 1
)

:done
echo.
echo ================================================
echo  Done: migration\nocode_db.sql
echo  Copy the WHOLE project folder (including this
echo  file, node_modules, storage\tiles) to the
echo  offline PC.
echo ================================================
pause
