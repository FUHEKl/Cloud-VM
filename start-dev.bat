@echo off
setlocal enabledelayedexpansion
title CloudVM Platform - Local Dev Launcher
color 0B

echo ================================================
echo   CloudVM Platform - Local Development Launcher
echo ================================================
echo.
echo   This starts infrastructure in Docker and
echo   runs all services locally for development.
echo.

:: Check Docker
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not installed or not in PATH.
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
)

:: Load .env variables into the current process so child windows inherit them
echo [INFO] Loading environment variables from .env...
for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do (
    if not "%%A"=="" set "%%A=%%B"
)

if "!AI_PROVIDER!"=="" set "AI_PROVIDER=ollama"
if "!OLLAMA_MODEL!"=="" set "OLLAMA_MODEL=mistral"


echo [1/8] Starting infrastructure (Postgres, Redis, NATS)...
docker-compose -f docker-compose.infra.yml up -d
if errorlevel 1 (
    echo [ERROR] Failed to start infrastructure.
    pause
    exit /b 1
)

echo [2/8] Waiting for Postgres to be ready...
timeout /t 6 /nobreak >nul

echo [3/8] Checking AI provider prerequisites...
if /I "!AI_PROVIDER!"=="ollama" (
    where ollama >nul 2>&1
    if errorlevel 1 (
        echo [WARN] Ollama CLI not found in PATH.
        echo        Install Ollama or switch AI_PROVIDER in .env.
    ) else (
        ollama list >nul 2>&1
        if errorlevel 1 (
            echo [WARN] Ollama server is not reachable on localhost:11434.
            echo        Start the Ollama app before using AI chat.
        ) else (
            echo [INFO] Ollama reachable. Verifying model !OLLAMA_MODEL! ...
            ollama list | findstr /I /C:"!OLLAMA_MODEL!" >nul
            if errorlevel 1 (
                echo [INFO] Pulling missing model !OLLAMA_MODEL! ...
                ollama pull !OLLAMA_MODEL!
            ) else (
                echo [OK] Model !OLLAMA_MODEL! is available.
            )
        )
    )
) else (
    echo [INFO] AI_PROVIDER=!AI_PROVIDER!, skipping Ollama checks.
)

echo [4/8] Starting Auth Service (port 3002)...
start "Auth Service" cmd /k "cd /d %~dp0services\auth && npm install && npx prisma generate && npx prisma migrate deploy && rd /s /q dist 2>nul & del /q *.tsbuildinfo 2>nul & npm run start:dev"
timeout /t 5 /nobreak >nul

echo [5/8] Starting User Service (port 3003) + VM Service (port 3004)...
start "User Service" cmd /k "cd /d %~dp0services\user && npm install && npx prisma generate && rd /s /q dist 2>nul & del /q *.tsbuildinfo 2>nul & npm run start:dev"
start "VM Service" cmd /k "cd /d %~dp0services\vm && npm install && npx prisma generate && rd /s /q dist 2>nul & del /q *.tsbuildinfo 2>nul & npm run start:dev"
timeout /t 2 /nobreak >nul

echo [6/8] Starting AI Service (port 3006)...
start "AI Service" cmd /k "cd /d %~dp0services\ai && npm install && npx prisma generate && npx prisma migrate deploy && rd /s /q dist 2>nul & del /q *.tsbuildinfo 2>nul & npm run start:dev"
timeout /t 2 /nobreak >nul

echo [7/8] Starting Gateway (port 3001) + Worker...
start "API Gateway" cmd /k "cd /d %~dp0services\gateway && npm install && rd /s /q dist 2>nul & del /q *.tsbuildinfo 2>nul & npm run start:dev"
start "Python Worker" cmd /k "cd /d %~dp0worker && pip install -r requirements.txt && python main.py"
timeout /t 2 /nobreak >nul

echo [8/8] Starting Frontend (port 3000)...
start "Frontend" cmd /k "cd /d %~dp0frontend && npm install && npm run dev"

echo.
echo ================================================
echo   All services launching in separate windows!
echo ================================================
echo.
echo   Frontend:    http://localhost:3000
echo   API Gateway: http://localhost:3001
echo   Auth:        http://localhost:3002
echo   User:        http://localhost:3003
echo   VM + WS:     http://localhost:3004
echo   AI Service:  http://localhost:3006
echo   Ollama:      http://localhost:11434  (model: !OLLAMA_MODEL!)
echo   NATS Monitor:http://localhost:8222
echo.
echo   Infrastructure DB port: 5434 (mapped from infra)
echo   Stop infra: docker-compose -f docker-compose.infra.yml down
echo   Close each service window to stop it.
echo ================================================
echo.
pause
