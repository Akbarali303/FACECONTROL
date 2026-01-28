# PostgreSQL bazasini docker-compose orqali ishga tushirish
# Avval Docker Desktop ishlab turganini tekshiring!

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "`n=== PostgreSQL (Docker) ishga tushirilmoqda ===" -ForegroundColor Cyan

# .env yo'q bo'lsa .env.example dan yaratish
if (-not (Test-Path .env)) {
    if (Test-Path .env.example) {
        Copy-Item .env.example .env
        Write-Host ".env .env.example dan yaratildi" -ForegroundColor Green
    }
}

# Docker ishlayaptimi?
$null = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nXATOLIK: Docker ishlamayapti!" -ForegroundColor Red
    Write-Host "1. Docker Desktop ni oching" -ForegroundColor Yellow
    Write-Host "2. 'Docker Engine running' bo'lishini kuting" -ForegroundColor Yellow
    Write-Host "3. Ushbu skriptni qayta ishga tushiring`n" -ForegroundColor Yellow
    exit 1
}

# docker-compose up -d
Write-Host "`ndocker-compose up -d ..." -ForegroundColor Yellow
docker-compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nXATOLIK: docker-compose muvaffaqiyatsiz!" -ForegroundColor Red
    exit 1
}

Write-Host "`nDatabase tayyor bo'lishi kutilmoqda (10 soniya)..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

$ready = docker exec facecontrol-postgres pg_isready -U postgres 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "`nMUVAFFAQIYAT! PostgreSQL ishlayapti (localhost:5433)" -ForegroundColor Green
    Write-Host "Backend: npm start yoki node start-backend-simple.js`n" -ForegroundColor Cyan
} else {
    Write-Host "`nOgohlantirish: pg_isready hali muvaffaqiyatsiz. Bir oz kuting va backendni ishga tushiring.`n" -ForegroundColor Yellow
}
