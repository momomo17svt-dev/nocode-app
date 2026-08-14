@echo off
setlocal
title NoCode App - setup

rem --- Locate PostgreSQL: project-local by default; override with NOCODEAPP_PG_HOME ---
set "PG_HOME=%NOCODEAPP_PG_HOME%"
if not defined PG_HOME set "PG_HOME=%~dp0pgsql"
set "PG_BIN=%PG_HOME%\bin"
set "PG_DATA=%PG_HOME%\data"
set "PGPASSWORD=postgres"

echo ================================================
echo  NoCode App - first time setup
echo  PG_HOME = %PG_HOME%
echo ================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\initialize-env.ps1" -Mode Local
if errorlevel 1 (
    echo [ERROR] Could not initialize backend\.env.
    pause
    exit /b 1
)

if not exist "%PG_BIN%\postgres.exe" (
    echo [ERROR] PostgreSQL not found at "%PG_BIN%".
    echo   Run extract-postgresql.bat first ^(unpacks postgresql.zip into .\pgsql^).
    pause
    exit /b 1
)

echo [1/8] Checking data directory...
if not exist "%PG_DATA%\PG_VERSION" (
    echo     Initializing PostgreSQL data dir...
    "%PG_BIN%\initdb" -D "%PG_DATA%" -U postgres --encoding=UTF8 --no-locale
)

echo [2/8] Starting PostgreSQL...
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

echo [3/8] Ensuring database nocode_db...
set "_dbexists="
"%PG_BIN%\psql" -U postgres -h 127.0.0.1 -tAc "SELECT 1 FROM pg_database WHERE datname='nocode_db'" | findstr "1" >nul
if not errorlevel 1 set "_dbexists=1"
if not defined _dbexists (
    echo     Creating database...
    "%PG_BIN%\psql" -U postgres -h 127.0.0.1 -c "CREATE DATABASE nocode_db"
) else (
    echo     Already exists.
)

echo [4/8] Restore decision...
set "_dump=%~dp0migration\nocode_db.sql"
set "_restore="
if exist "%_dump%" if not defined _dbexists set "_restore=1"

if defined _restore (
    echo [5/8] Restoring data from migration\nocode_db.sql ...
    "%PG_BIN%\psql" -U postgres -h 127.0.0.1 -d nocode_db -f "%_dump%"
) else (
    echo [5/8] No restore ^(fresh install, or database already present^).
)

echo [6/8] Backend dependencies...
pushd "%~dp0backend"
if not exist node_modules ( call npm install )

echo [7/8] Prisma generate / migrate / build...
call npx prisma generate
call npx prisma migrate deploy
call npm run build
echo     Ensuring the initial administrator exists...
call npm run seed
if errorlevel 1 exit /b 1
popd

echo [8/8] Frontend dependencies...
pushd "%~dp0frontend"
if not exist node_modules ( call npm install )
popd

echo.
echo ================================================
echo  Setup complete. Now run start_server.bat
echo.
echo  Use the administrator credentials shown when the environment was created.
echo ================================================
pause
