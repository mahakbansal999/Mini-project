@echo off
REM Quick Start Script for Request Throttling Manager (Windows)
REM Automates setup and startup process

setlocal enabledelayedexpansion

set PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%"

echo.
echo ========================================================
echo    Request Throttling Manager - Quick Start
echo ========================================================
echo.

REM Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found. Please install Node.js first.
    pause
    exit /b 1
)

REM Check npm
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm not found. Please install npm first.
    pause
    exit /b 1
)

echo [OK] Prerequisites found
echo.

REM Install dependencies
echo [INFO] Installing Node.js dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
echo [OK] Dependencies installed
echo.

REM Check for MongoDB and Redis
echo [INFO] Checking MongoDB and Redis...

REM Try to ping MongoDB
mongosh --eval "db.adminCommand('ping')" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] MongoDB is running
    set MONGO_RUNNING=1
) else (
    echo [WARN] MongoDB not detected
    set MONGO_RUNNING=0
)

REM Try to ping Redis
redis-cli ping >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Redis is running
    set REDIS_RUNNING=1
) else (
    echo [WARN] Redis not detected
    set REDIS_RUNNING=0
)

REM Start with Docker if services not running
if !MONGO_RUNNING! EQU 0 (
    echo [INFO] Attempting to start services with Docker...
    where docker >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        docker-compose up -d mongo redis
        timeout /t 5 /nobreak >nul
        echo [OK] Services started with Docker
    ) else (
        echo [WARN] Docker not found. Please start MongoDB and Redis manually:
        echo   MongoDB: mongodb://localhost:27017
        echo   Redis: redis://localhost:6379
        echo.
        echo Press any key to continue anyway, or Ctrl+C to exit...
        pause >nul
    )
)

echo.
echo ========================================================
echo              Setup Complete!
echo ========================================================
echo.
echo Application will be available at: http://localhost:3000
echo Health check: http://localhost:3000/health
echo.
echo Press Ctrl+C to stop
echo.

REM Start the application
if "%NODE_ENV%"=="production" (
    npm start
) else (
    npm run dev
)

pause
