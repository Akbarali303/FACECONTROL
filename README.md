# Dahua Face Access Control Dashboard

Real-time employee attendance and KPI tracking system for Dahua Face Access Controller.

## Features

- Real-time event streaming from Dahua Face Access Controller
- Employee attendance tracking
- KPI calculation and statistics
- Department-wise analytics
- Active employees monitoring
- Excel export functionality

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your settings
```

3. Start the server:
```bash
npm run dev
```

4. Open browser:
```
http://localhost:3001
```

## GitHub Deployment

### ⚠️ MUHIM: Git O'rnatish

**Git o'rnatilmagan bo'lsa, avval Git'ni o'rnating:**

1. Git'ni yuklab oling: https://git-scm.com/download/win
2. Yuklangan faylni ishga tushiring va default sozlamalarni qabul qiling
3. **Kompyuterni qayta ishga tushiring** (muhim!)
4. Git'ni tekshiring: `git --version`

### Avtomatik Yuklash (PowerShell Skripti)

1. **PowerShell'ni oching** (project papkasida)
2. Quyidagi buyruqni bajaring:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\deploy-to-github.ps1
   ```

### Manual Yuklash (Buyruqlar)

PowerShell yoki Git Bash'da:

```bash
# 1. Repository'ni yaratish (faqat birinchi marta)
git init
git remote add origin https://github.com/Avazbek99/kpi-smartforestry.git

# 2. O'zgarishlarni qo'shish va yuklash
git add .
git commit -m "Update: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
git push -u origin main
```

**Agar `main` ishlamasa, `master` ishlatib ko'ring:**
```bash
git push -u origin master
```

### Keyingi Yuklashlar

Har safar o'zgarishlarni yuklash uchun:
```bash
git add .
git commit -m "Update description"
git push
```

**Batafsil ko'rsatma:** `GIT-INSTALL-INSTRUCTIONS.md` faylini ko'ring.

## Environment Variables

- `PORT` - Server port (default: 3001)
- `DAHUA_IP` - Dahua device IP address
- `DAHUA_USER` - Dahua username
- `DAHUA_PASS` - Dahua password
- `DB_HOST` - PostgreSQL host
- `DB_PORT` - PostgreSQL port
- `DB_NAME` - Database name
- `DB_USER` - Database user
- `DB_PASS` - Database password
- `SESSION_SECRET` - Session secret key

## License

MIT
