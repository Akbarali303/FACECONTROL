@echo off
chcp 65001 >nul
echo.
echo === FACECONTROL — barcha xizmatlarni ishga tushirish ===
echo.

:: 1) Docker ishlayaptimi?
docker info >nul 2>&1
if errorlevel 1 (
    echo [1] Docker ishlamayapti.
    echo     Docker Desktop ni oching, "Docker Engine running" bo'lishini kuting.
    echo     Keyin ushbu faylni qayta ishga tushiring: ISHGA_TUSHIRISH.bat
    echo.
    pause
    exit /b 1
)
echo [1] Docker ishlayapti.

:: 2) PostgreSQL (baza) ni ishga tushirish
echo [2] PostgreSQL ishga tushirilmoqda...
powershell -ExecutionPolicy Bypass -File "%~dp0start-db.ps1"
if errorlevel 1 (
    echo     Xatolik: PostgreSQL ishga tushmadi.
    pause
    exit /b 1
)

:: 3) Bir oz kutamiz
echo [3] Baza tayyor bo'lishi kutilmoqda (5 soniya)...
timeout /t 5 /nobreak >nul

:: 4) Backend (server) ni ishga tushirish
echo [4] Backend ishga tushirilmoqda...
echo     Brauzerda: http://localhost:3002
echo     To'xtatish: Ctrl+C
echo.
cd /d "%~dp0"
node start-backend-simple.js

pause
