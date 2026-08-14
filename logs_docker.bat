@echo off
setlocal
cd /d "%~dp0"
title NoCode App - Docker logs

docker compose logs --tail=200 -f
