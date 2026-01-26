# Git O'rnatish va GitHub'ga Yuklash Ko'rsatmasi

## 1. Git O'rnatish

### Windows uchun:
1. Git'ni yuklab oling: https://git-scm.com/download/win
2. Yuklangan faylni ishga tushiring va barcha default sozlamalarni qabul qiling
3. O'rnatishdan keyin **kompyuterni qayta ishga tushiring** (muhim!)

## 2. Git'ni Tekshirish

Terminal yoki PowerShell'da quyidagi buyruqni bajaring:
```bash
git --version
```

Agar Git o'rnatilgan bo'lsa, versiya ko'rsatiladi (masalan: `git version 2.42.0`)

## 3. GitHub'ga Yuklash

### Variant 1: PowerShell Skripti (Avtomatik)

1. Git o'rnatilgandan keyin, PowerShell'da quyidagi buyruqni bajaring:
```powershell
powershell -ExecutionPolicy Bypass -File .\deploy-to-github.ps1
```

### Variant 2: Manual Buyruqlar

PowerShell yoki Git Bash'da quyidagi buyruqlarni ketma-ket bajaring:

```bash
# 1. Git repository'ni tekshirish
git status

# Agar .git papka yo'q bo'lsa, repository'ni yaratish:
git init
git remote add origin https://github.com/Avazbek99/kpi-smartforestry.git

# 2. Barcha o'zgarishlarni qo'shish
git add .

# 3. Commit qilish
git commit -m "Update: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

# 4. GitHub'ga yuklash
git push -u origin main
```

Agar `main` branch ishlamasa, `master` ishlatib ko'ring:
```bash
git push -u origin master
```

## 4. GitHub Authentication

Agar authentication muammosi bo'lsa:

1. GitHub'da Personal Access Token yarating:
   - GitHub.com → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - "Generate new token" ni bosing
   - `repo` scope'ni tanlang
   - Token'ni nusxalab oling

2. Push qilganda username va password o'rniga:
   - Username: GitHub username'ingiz
   - Password: Personal Access Token

## 5. Muammo Hal Qilish

### "git command not found"
- Git o'rnatilganligini tekshiring
- Kompyuterni qayta ishga tushiring
- PATH environment variable'ga Git qo'shilganligini tekshiring

### "Authentication failed"
- Personal Access Token yarating
- Token'ni to'g'ri kiriting

### "Repository not found"
- GitHub'da repository yaratilganligini tekshiring
- Remote URL to'g'ri ekanligini tekshiring: `git remote -v`

## 6. Keyingi Yuklashlar

Git o'rnatilgandan keyin, har safar o'zgarishlarni yuklash uchun:

```bash
git add .
git commit -m "Update description"
git push
```

Yoki PowerShell skriptini ishlatish:
```powershell
.\deploy-to-github.ps1
```


