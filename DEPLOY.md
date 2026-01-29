# CI / CD — Deploy

## 1. `deploy.sh`

Serverda (`/opt/FACECONTROL`) ishga tushiring:

```bash
chmod +x deploy.sh
./deploy.sh
```

Nima qiladi:
- `git fetch` + `git reset --hard origin/main`
- `docker compose build --no-cache backend` + `docker compose up -d`

Boshqa papka bo‘lsa: `APP_DIR=/path/to/FACECONTROL ./deploy.sh`

---

## 2. GitHub Actions (CI / CD)

**CI:** `main` ga push → `npm ci` → `node -c start-backend-simple.js`

**CD:** CI o‘tsa → SSH orqali serverga ulanadi → `./deploy.sh` ishga tushadi.

### GitHub Secrets

Repo **Settings → Secrets and variables → Actions** da quyidagi secretlar yozing:

| Secret            | Tavsif                    |
|-------------------|---------------------------|
| `SERVER_HOST`     | Server IP yoki host (masalan `kpi.smartforestry.uz`) |
| `SERVER_USER`     | SSH user (masalan `akbarali`) |
| `SSH_PRIVATE_KEY` | SSH kalitining to‘liq matni (yoki `~/.ssh/id_rsa` dan) |

Keyin `main` ga push qilganda avtomatik deploy ishlaydi.
