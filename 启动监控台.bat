@echo off
title GitHub Radar Startup...

cd /d "%~dp0"

echo ===================================================
echo [START] Preparing to start GitHub Radar...
echo ===================================================

:: 1. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js not found!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b
)

:: 2. Check and install dependencies
if not exist "node_modules\" (
    color 0E
    echo [INIT] First run detected. Installing dependencies...
    echo Please wait 1-2 minutes...
    call npm install
)

:: 3. Port cleanup to prevent conflicts
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 "') do (
    if "%%a" neq "0" (
        echo [CLEANUP] Port 3000 is in use. Killing old process ^(PID: %%a^)...
        taskkill /F /PID %%a >nul 2>nul
    )
)

color 0A
echo [SUCCESS] Environment is ready. Starting background service...

:: 4. Start Node Server in a new window
start "GitHub Radar Server Log" cmd /k "color 0B && title GitHub Radar Server Log && echo [SERVER] Running. Close this window to stop the server. && echo. && npm start"

:: 5. Delay 3 seconds for server boot
timeout /t 3 /nobreak >nul

:: 6. Open Browser
echo [SUCCESS] Service started. Opening dashboard in browser...
start http://localhost:3000

:: 7. Exit launcher
exit
