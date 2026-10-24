@echo off
cd /d "%~dp0frontend"
call npm run qa
start "" "qa-screenshots\index.html"
