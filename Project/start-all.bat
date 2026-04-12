@echo off
title CloudVM Platform - Full Stack Launcher
color 0A

echo ============================================
echo   CloudVM Platform - Docker Compose Launcher
echo ============================================
echo.

:: Check Docker
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not installed or not in PATH.
    echo         Install Docker Desktop from https://docker.com
    pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker daemon is not running. Start Docker Desktop first.
    pause
    exit /b 1
)

:: Ensure .env exists
if not exist ".env" (
    echo [INFO] .env not found, copying from .env.example...
    copy .env.example .env >nul
    echo [INFO] .env created. Edit it with your OpenNebula credentials before starting.
    echo.
)

echo [1/3] Stopping any existing containers...
docker-compose down >nul 2>&1

echo [2/3] Building and starting all services...
docker-compose up -d --build
if errorlevel 1 (
    echo [ERROR] Failed to start services. Check docker-compose logs.
    pause
    exit /b 1
)

echo [3/3] Waiting for services to be ready...
timeout /t 8 /nobreak >nul

echo.
echo ============================================
echo   All services started successfully!
echo ============================================
echo.
echo   Frontend:    http://localhost:3000
echo   API Gateway: http://localhost:3001
echo   Auth:        http://localhost:3002
echo   User:        http://localhost:3003
echo   VM + WS:     http://localhost:3004
echo   AI Service:  http://localhost:3006
echo   NATS Monitor:http://localhost:8222
echo.
echo   Logs:  docker-compose logs -f
echo   Stop:  docker-compose down
echo ============================================
echo.
pause
