@echo off
setlocal
cd /d "%~dp0"
title NoCode App - offline map tiles

if "%~1"=="" (
    echo Downloads background map tiles into storage\tiles so the map works offline.
    echo.
    echo Usage:
    echo   get_tiles.bat --bbox 139.74,35.65,139.80,35.70 --zoom 13-17
    echo   get_tiles.bat --japan --zoom 0-12
    echo.
    echo Options:
    echo   --bbox minLng,minLat,maxLng,maxLat   area to cover
    echo   --japan ^| --mainland                 preset areas
    echo   --zoom 13-17 ^| --zoom 13,15,17       zoom levels ^(required^)
    echo   --style pale ^| std ^| photo           map type ^(default: pale^)
    echo   --dry-run                            count tiles without downloading
    echo.
    echo Run with --dry-run first: one extra zoom level is about 4x the tiles.
    echo Check the provider terms before downloading:
    echo   https://maps.gsi.go.jp/development/ichiran.html
    echo   https://operations.osmfoundation.org/policies/tiles/
    exit /b 1
)

where docker >nul 2>&1
if errorlevel 1 goto local

rem Ask the container directly: parsing "docker compose ps" is brittle because its
rem output uses LF line endings, which findstr does not treat as separate lines.
docker compose exec -T backend node -e "process.exit(0)" >nul 2>&1
if errorlevel 1 goto local

echo Downloading through the running backend container...
docker compose exec backend npm run tiles -- %*
if errorlevel 1 (
    echo [ERROR] Tile download failed.
    exit /b 1
)
goto done

:local
echo Downloading with the local Node.js setup...
if not exist "backend\node_modules" (
    echo [ERROR] Neither the Docker backend nor backend\node_modules is available.
    echo   Start Docker with start_docker.bat, or run setup.bat first.
    exit /b 1
)
pushd backend
call npm run tiles -- %*
set "_rc=%ERRORLEVEL%"
popd
if not "%_rc%"=="0" (
    echo [ERROR] Tile download failed.
    exit /b 1
)

:done
echo %* | findstr /i /c:"--dry-run" >nul
if not errorlevel 1 exit /b 0
echo.
echo Saved under storage\tiles. Pick the style in System settings - Map,
echo or per location field in the app settings.
