# Docker orqali PostgreSQL Database Yaratish Skripti
# PowerShell skripti

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PostgreSQL Docker Container Yaratish" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Docker o'rnatilganligini tekshirish
Write-Host "[1/7] Docker'ni tekshiryapman..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Docker topildi: $dockerVersion" -ForegroundColor Green
    } else {
        throw "Docker topilmadi"
    }
} catch {
    Write-Host "  XATOLIK: Docker o'rnatilmagan yoki PATH'da yo'q!" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Yechim:" -ForegroundColor Yellow
    Write-Host "  1. Docker Desktop'ni o'rnating: https://www.docker.com/products/docker-desktop" -ForegroundColor Cyan
    Write-Host "  2. Docker Desktop'ni ishga tushiring" -ForegroundColor Cyan
    Write-Host "  3. Kompyuterni qayta ishga tushiring" -ForegroundColor Cyan
    Write-Host "  4. Skriptni qayta ishga tushiring" -ForegroundColor Cyan
    exit 1
}

# Docker daemon ishlayaptimi?
Write-Host ""
Write-Host "[2/7] Docker daemon ishlayaptimi?" -ForegroundColor Yellow
try {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Docker daemon ishlayapti" -ForegroundColor Green
    } else {
        throw "Docker daemon ishlamayapti"
    }
} catch {
    Write-Host "  XATOLIK: Docker daemon ishlamayapti!" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Yechim:" -ForegroundColor Yellow
    Write-Host "  1. Docker Desktop'ni ishga tushiring" -ForegroundColor Cyan
    Write-Host "  2. Docker Desktop tray'da 'Docker Engine running' ko'rinishini kuting" -ForegroundColor Cyan
    Write-Host "  3. WSL 2 o'rnatilgan bo'lishi kerak (Windows 10/11 uchun)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  WSL 2 tekshirish:" -ForegroundColor Yellow
    Write-Host "    wsl --status" -ForegroundColor White
    Write-Host "    wsl --install (agar o'rnatilmagan bo'lsa)" -ForegroundColor White
    exit 1
}

# docker-compose.yml mavjudmi?
Write-Host ""
Write-Host "[3/7] docker-compose.yml tekshiryapman..." -ForegroundColor Yellow
$useCompose = $false
if (Test-Path "docker-compose.yml") {
    Write-Host "  docker-compose.yml topildi!" -ForegroundColor Green
    $useComposeChoice = Read-Host "  docker-compose.yml orqali ishga tushirishni xohlaysizmi? (y/n)"
    if ($useComposeChoice -eq 'y' -or $useComposeChoice -eq 'Y') {
        $useCompose = $true
    }
}

# Eski container mavjudmi?
Write-Host ""
Write-Host "[4/7] Eski container'ni tekshiryapman..." -ForegroundColor Yellow
$existingContainer = docker ps -a --filter "name=facecontrol-postgres" --format "{{.Names}}" 2>&1
if ($existingContainer -and $existingContainer -ne "") {
    Write-Host "  Eski container topildi: $existingContainer" -ForegroundColor Yellow
    $response = Read-Host "  Eski container'ni o'chirishni xohlaysizmi? (y/n)"
    if ($response -eq 'y' -or $response -eq 'Y') {
        Write-Host "  Container'ni to'xtatmoqdamiz..." -ForegroundColor Yellow
        docker stop facecontrol-postgres 2>$null | Out-Null
        Write-Host "  Container'ni o'chirmoqdamiz..." -ForegroundColor Yellow
        docker rm facecontrol-postgres 2>$null | Out-Null
        Write-Host "  Eski container o'chirildi" -ForegroundColor Green
    } else {
        Write-Host "  Eski container ishlatilmoqda. Skript to'xtatildi." -ForegroundColor Yellow
        exit 0
    }
} else {
    Write-Host "  Eski container topilmadi" -ForegroundColor Green
}

# Port 5432 band emasligini tekshirish
Write-Host ""
Write-Host "[5/7] Port 5432'ni tekshiryapman..." -ForegroundColor Yellow
$portInUse = $null
try {
    $portInUse = Get-NetTCPConnection -LocalPort 5432 -ErrorAction SilentlyContinue
} catch {
    # Port tekshirishda xatolik bo'lishi mumkin
}

if ($portInUse) {
    Write-Host "  Port 5432 allaqachon ishlatilmoqda!" -ForegroundColor Yellow
    $processInfo = Get-Process -Id $portInUse.OwningProcess -ErrorAction SilentlyContinue
    if ($processInfo) {
        Write-Host "  Portni band qilgan dastur: $($processInfo.ProcessName) (PID: $($processInfo.Id))" -ForegroundColor Yellow
    }
    Write-Host ""
    $useDifferentPort = Read-Host "  Boshqa port ishlatishni xohlaysizmi? (y/n)"
    if ($useDifferentPort -eq 'y' -or $useDifferentPort -eq 'Y') {
        $newPort = Read-Host "  Yangi port raqamini kiriting (masalan: 5433)"
        $DB_PORT = $newPort
    } else {
        Write-Host "  Skript to'xtatildi." -ForegroundColor Yellow
        Write-Host "  Yechim: Portni band qilgan dasturni to'xtating yoki boshqa port tanlang." -ForegroundColor Cyan
        exit 1
    }
} else {
    $DB_PORT = 5432
    Write-Host "  Port 5432 bo'sh" -ForegroundColor Green
}

# Database parametrlari
$DB_NAME = "facecontrol"
$DB_USER = "postgres"
$DB_PASS = "postgres123"

Write-Host ""
Write-Host "[6/7] Database parametrlari:" -ForegroundColor Cyan
Write-Host "  Database: $DB_NAME" -ForegroundColor White
Write-Host "  User: $DB_USER" -ForegroundColor White
Write-Host "  Password: $DB_PASS" -ForegroundColor White
Write-Host "  Port: $DB_PORT" -ForegroundColor White
Write-Host "  Connection String: postgresql://$DB_USER`:$DB_PASS@localhost`:$DB_PORT/$DB_NAME" -ForegroundColor Gray
Write-Host ""

$confirm = Read-Host "Container yaratishni davom ettirishni xohlaysizmi? (y/n)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Host "Skript to'xtatildi." -ForegroundColor Yellow
    exit 0
}

# Container yaratish
Write-Host ""
Write-Host "[7/7] PostgreSQL container yaratilmoqda..." -ForegroundColor Yellow

if ($useCompose) {
    Write-Host "  docker-compose.yml orqali ishga tushiryapman..." -ForegroundColor Cyan
    try {
        # docker-compose.yml portini yangilash kerak bo'lsa
        if ($DB_PORT -ne 5432) {
            Write-Host "  Eslatma: docker-compose.yml'da port 5432. Agar boshqa port kerak bo'lsa, qo'lda o'zgartiring." -ForegroundColor Yellow
        }
        
        docker-compose up -d 2>&1 | Out-String | ForEach-Object {
            if ($_ -match "error" -or $_ -match "Error" -or $LASTEXITCODE -ne 0) {
                Write-Host "  $_" -ForegroundColor Red
            } else {
                Write-Host "  $_" -ForegroundColor Green
            }
        }
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Container muvaffaqiyatli yaratildi!" -ForegroundColor Green
        } else {
            throw "docker-compose xatolik"
        }
    } catch {
        Write-Host "  XATOLIK: docker-compose orqali container yaratib bo'lmadi!" -ForegroundColor Red
        Write-Host "  Xatolik: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "  Yechim:" -ForegroundColor Yellow
        Write-Host "  1. docker-compose o'rnatilganligini tekshiring: docker-compose --version" -ForegroundColor Cyan
        Write-Host "  2. docker-compose.yml faylini tekshiring" -ForegroundColor Cyan
        Write-Host "  3. Yoki oddiy docker run buyrug'ini ishlatishga ruxsat bering" -ForegroundColor Cyan
        exit 1
    }
} else {
    Write-Host "  docker run orqali yaratilmoqda..." -ForegroundColor Cyan
    try {
        $result = docker run --name facecontrol-postgres `
            -e POSTGRES_USER=$DB_USER `
            -e POSTGRES_PASSWORD=$DB_PASS `
            -e POSTGRES_DB=$DB_NAME `
            -p "${DB_PORT}:5432" `
            -d postgres:15 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Container muvaffaqiyatli yaratildi!" -ForegroundColor Green
            Write-Host "  Container ID: $result" -ForegroundColor Gray
        } else {
            if ($result -match "port is already allocated") {
                Write-Host "  XATOLIK: Port allaqachon band!" -ForegroundColor Red
                Write-Host "  Yechim: Boshqa port tanlang yoki portni band qilgan container'ni to'xtating" -ForegroundColor Yellow
            } elseif ($result -match "permission denied") {
                Write-Host "  XATOLIK: Ruxsat muammosi!" -ForegroundColor Red
                Write-Host "  Yechim: Administrator sifatida ishga tushiring yoki Docker Desktop'da ruxsatlarni tekshiring" -ForegroundColor Yellow
            } else {
                Write-Host "  XATOLIK: Container yaratib bo'lmadi!" -ForegroundColor Red
                Write-Host "  Xatolik: $result" -ForegroundColor Red
            }
            exit 1
        }
    } catch {
        Write-Host "  XATOLIK: Container yaratib bo'lmadi!" -ForegroundColor Red
        Write-Host "  Xatolik: $_" -ForegroundColor Red
        exit 1
    }
}

# Container ishlayotganini tekshirish
Write-Host ""
Write-Host "Container ishlayotganini tekshiryapman..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

$containerStatus = docker ps --filter "name=facecontrol-postgres" --format "{{.Status}}" 2>&1
if ($containerStatus -and $containerStatus -ne "") {
    Write-Host "  Container ishlayapti: $containerStatus" -ForegroundColor Green
} else {
    Write-Host "  Container ishlamayapti!" -ForegroundColor Red
    Write-Host "  Loglarni ko'ring:" -ForegroundColor Yellow
    Write-Host "    docker logs facecontrol-postgres" -ForegroundColor Cyan
    exit 1
}

# Database tayyor bo'lishini kutish
Write-Host ""
Write-Host "Database tayyor bo'lishini kutmoqdaman (30 soniya)..." -ForegroundColor Yellow
$maxAttempts = 30
$attempt = 0
$dbReady = $false

while ($attempt -lt $maxAttempts -and -not $dbReady) {
    Start-Sleep -Seconds 1
    $attempt++
    $testResult = docker exec facecontrol-postgres pg_isready -U postgres 2>&1
    if ($LASTEXITCODE -eq 0) {
        $dbReady = $true
        Write-Host "  Database tayyor! ($attempt soniya)" -ForegroundColor Green
    } else {
        Write-Host "  Kutmoqdaman... ($attempt/$maxAttempts)" -ForegroundColor Gray
    }
}

if (-not $dbReady) {
    Write-Host "  Ogohlantirish: Database hali tayyor bo'lmagan bo'lishi mumkin" -ForegroundColor Yellow
}

# .env faylini yaratish/yangilash
Write-Host ""
Write-Host ".env faylini yaratish/yangilash..." -ForegroundColor Yellow

$envContent = "DB_HOST=localhost`nDB_PORT=$DB_PORT`nDB_NAME=$DB_NAME`nDB_USER=$DB_USER`nDB_PASS=$DB_PASS`nPORT=3001`nDAHUA_IP=192.168.0.59`nDAHUA_USER=admin`nDAHUA_PASS=admin123`nSESSION_SECRET=facecontrol-secret-key-change-in-production"

if (Test-Path .env) {
    Write-Host "  .env fayli mavjud. Yangilashni xohlaysizmi? (y/n)" -ForegroundColor Yellow
    $updateEnv = Read-Host
    if ($updateEnv -eq 'y' -or $updateEnv -eq 'Y') {
        $envContent | Out-File -FilePath .env -Encoding utf8 -NoNewline
        Write-Host "  .env fayli yangilandi" -ForegroundColor Green
    } else {
        Write-Host "  .env fayli o'zgartirilmadi" -ForegroundColor Cyan
    }
} else {
    $envContent | Out-File -FilePath .env -Encoding utf8 -NoNewline
    Write-Host "  .env fayli yaratildi" -ForegroundColor Green
}

# Natijalar
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MUVAFFAQIYATLI!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "PostgreSQL container yaratildi va ishlayapti!" -ForegroundColor Green
Write-Host ""
Write-Host "Database ma'lumotlari:" -ForegroundColor Cyan
Write-Host "  Host: localhost" -ForegroundColor White
Write-Host "  Port: $DB_PORT" -ForegroundColor White
Write-Host "  Database: $DB_NAME" -ForegroundColor White
Write-Host "  User: $DB_USER" -ForegroundColor White
Write-Host "  Password: $DB_PASS" -ForegroundColor White
Write-Host "  Connection String: postgresql://$DB_USER`:$DB_PASS@localhost`:$DB_PORT/$DB_NAME" -ForegroundColor Gray
Write-Host ""
Write-Host "Foydali buyruqlar:" -ForegroundColor Cyan
Write-Host "  Container holatini ko'rish:  docker ps" -ForegroundColor White
Write-Host "  Container'ni to'xtatish:  docker stop facecontrol-postgres" -ForegroundColor White
Write-Host "  Container'ni ishga tushirish:  docker start facecontrol-postgres" -ForegroundColor White
Write-Host "  Loglarni ko'rish:  docker logs facecontrol-postgres" -ForegroundColor White
Write-Host "  Container'ga kirish:  docker exec -it facecontrol-postgres psql -U postgres" -ForegroundColor White
Write-Host "  Database tekshirish:  docker exec facecontrol-postgres pg_isready -U postgres" -ForegroundColor White
Write-Host ""
if ($useCompose) {
    Write-Host "  docker-compose orqali to'xtatish:  docker-compose down" -ForegroundColor White
    Write-Host "  docker-compose orqali ishga tushirish:  docker-compose up -d" -ForegroundColor White
    Write-Host ""
}
Write-Host "Endi backend serverni ishga tushirishingiz mumkin:" -ForegroundColor Yellow
Write-Host "  node start-backend-simple.js" -ForegroundColor Cyan
Write-Host ""
