@echo off
echo Starting Ripple AI development servers...

start "Ripple backend" cmd /k npm run dev:backend
start "Ripple frontend" cmd /k npm run dev:frontend

echo Waiting for servers to initialize...
timeout /t 8 /nobreak >nul 2>nul || ping -n 9 127.0.0.1 >nul

start http://localhost:3000

echo Backend: http://localhost:4000
echo Frontend: http://localhost:3000
echo Close the two server windows to stop.
