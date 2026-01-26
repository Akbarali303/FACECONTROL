# GitHub'ga avtomatik yuklash scripti
# PowerShell script

$ErrorActionPreference = "Stop"

Write-Host "GitHub'ga yuklash boshlandi..." -ForegroundColor Green

# Git o'rnatilganligini tekshirish
try {
    $gitVersion = git --version
    Write-Host "Git topildi: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "XATOLIK: Git o'rnatilmagan!" -ForegroundColor Red
    Write-Host "Iltimos, Git'ni o'rnating: https://git-scm.com/download/win" -ForegroundColor Yellow
    exit 1
}

# Repository'ni tekshirish
if (-not (Test-Path .git)) {
    Write-Host "Git repository yaratilmoqda..." -ForegroundColor Yellow
    git init
    git remote add origin https://github.com/Avazbek99/kpi-smartforestry.git
}

# Barcha o'zgarishlarni qo'shish
Write-Host "O'zgarishlar qo'shilmoqda..." -ForegroundColor Yellow
git add .

# Commit qilish
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$commitMessage = "Update: $timestamp"

Write-Host "Commit qilinmoqda..." -ForegroundColor Yellow
git commit -m $commitMessage

# GitHub'ga yuklash
Write-Host "GitHub'ga yuklanmoqda..." -ForegroundColor Yellow
try {
    git push -u origin main
    Write-Host "Muvaffaqiyatli yuklandi!" -ForegroundColor Green
} catch {
    try {
        git push -u origin master
        Write-Host "Muvaffaqiyatli yuklandi!" -ForegroundColor Green
    } catch {
        Write-Host "XATOLIK: Push qilishda muammo!" -ForegroundColor Red
        Write-Host "Iltimos, quyidagilarni tekshiring:" -ForegroundColor Yellow
        Write-Host "1. GitHub'da repository yaratilganligi" -ForegroundColor Yellow
        Write-Host "2. Remote URL to'g'ri: git remote -v" -ForegroundColor Yellow
        Write-Host "3. Authentication to'g'ri sozlangan" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "Barcha o'zgarishlar GitHub'ga yuklandi!" -ForegroundColor Green


