# Virtual Server va Database Yaratish Qo'llanmasi

## Variant 1: Docker orqali PostgreSQL (Eng Oson)

### 1. Docker Desktop o'rnatish

1. Docker Desktop'ni yuklab oling: https://www.docker.com/products/docker-desktop
2. Yuklangan faylni ishga tushiring va default sozlamalarni qabul qiling
3. Kompyuterni qayta ishga tushiring
4. Docker'ni tekshiring:
   ```powershell
   docker --version
   ```

### 2. PostgreSQL Container Yaratish

PowerShell'da project papkasida quyidagi buyruqlarni bajaring:

```powershell
# PostgreSQL container yaratish va ishga tushirish
docker run --name facecontrol-postgres `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgres123 `
  -e POSTGRES_DB=facecontrol `
  -p 5432:5432 `
  -d postgres:15

# Container ishlayotganini tekshirish
docker ps

# Loglarni ko'rish
docker logs facecontrol-postgres
```

### 3. .env Faylini Yangilash

`.env` faylini yarating yoki yangilang:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=facecontrol
DB_USER=postgres
DB_PASS=postgres123
PORT=3002
DAHUA_IP=192.168.0.59
DAHUA_USER=admin
DAHUA_PASS=admin123
SESSION_SECRET=your-secret-key-here
```

### 4. Container'ni Boshqarish

```powershell
# Container'ni to'xtatish
docker stop facecontrol-postgres

# Container'ni qayta ishga tushirish
docker start facecontrol-postgres

# Container'ni o'chirish (ma'lumotlar saqlanadi)
docker rm facecontrol-postgres

# Container va ma'lumotlarni to'liq o'chirish
docker stop facecontrol-postgres
docker rm facecontrol-postgres
```

---

## Variant 2: WSL2 orqali Linux Environment

### 1. WSL2 O'rnatish

PowerShell'ni Administrator sifatida oching va quyidagilarni bajaring:

```powershell
# WSL2'ni o'rnatish
wsl --install

# Kompyuterni qayta ishga tushiring
```

### 2. Ubuntu'ni O'rnatish

1. Microsoft Store'dan "Ubuntu" ni qidiring va o'rnating
2. Ubuntu'ni ishga tushiring va username/password yarating

### 3. PostgreSQL O'rnatish (Ubuntu ichida)

Ubuntu terminalida:

```bash
# Update
sudo apt update

# PostgreSQL o'rnatish
sudo apt install postgresql postgresql-contrib -y

# PostgreSQL'ni ishga tushirish
sudo service postgresql start

# PostgreSQL'ga kirish
sudo -u postgres psql

# Database yaratish
CREATE DATABASE facecontrol;
CREATE USER postgres WITH PASSWORD 'postgres123';
ALTER ROLE postgres SET client_encoding TO 'utf8';
ALTER ROLE postgres SET default_transaction_isolation TO 'read committed';
ALTER ROLE postgres SET timezone TO 'UTC';
GRANT ALL PRIVILEGES ON DATABASE facecontrol TO postgres;
\q

# PostgreSQL'ni Windows'dan ulash uchun sozlash
sudo nano /etc/postgresql/*/main/postgresql.conf
# `listen_addresses = '*'` qatorini topib, comment'ni olib tashlang

sudo nano /etc/postgresql/*/main/pg_hba.conf
# Quyidagi qatorni qo'shing:
# host    all             all             0.0.0.0/0               md5

# PostgreSQL'ni qayta ishga tushirish
sudo service postgresql restart
```

### 4. Windows'dan Ulash

Windows'dan WSL2'dagi PostgreSQL'ga ulash uchun WSL2 IP manzilini toping:

```powershell
wsl hostname -I
```

`.env` faylida:
```env
DB_HOST=<WSL2_IP_ADDRESS>
DB_PORT=5432
DB_NAME=facecontrol
DB_USER=postgres
DB_PASS=postgres123
```

---

## Variant 3: Cloud Server (DigitalOcean, AWS, Azure)

### DigitalOcean (Tavsiya etiladi)

1. DigitalOcean'ga ro'yxatdan o'ting: https://www.digitalocean.com
2. "Create Droplet" tugmasini bosing
3. Quyidagilarni tanlang:
   - **Image**: Ubuntu 22.04
   - **Plan**: Basic ($6/oy - 1GB RAM)
   - **Region**: Eng yaqin region
   - **Authentication**: SSH key yoki password

4. Droplet yaratilgandan keyin, SSH orqali ulaning:

```bash
ssh root@<your-droplet-ip>
```

5. PostgreSQL o'rnatish:

```bash
# Update
apt update

# PostgreSQL o'rnatish
apt install postgresql postgresql-contrib -y

# PostgreSQL'ga kirish
sudo -u postgres psql

# Database yaratish
CREATE DATABASE facecontrol;
CREATE USER postgres WITH PASSWORD 'your-strong-password';
ALTER ROLE postgres SET client_encoding TO 'utf8';
ALTER ROLE postgres SET default_transaction_isolation TO 'read committed';
ALTER ROLE postgres SET timezone TO 'UTC';
GRANT ALL PRIVILEGES ON DATABASE facecontrol TO postgres;
\q

# PostgreSQL'ni tashqi ulanish uchun sozlash
nano /etc/postgresql/*/main/postgresql.conf
# `listen_addresses = '*'` qatorini topib, comment'ni olib tashlang

nano /etc/postgresql/*/main/pg_hba.conf
# Quyidagi qatorni qo'shing:
# host    all             all             0.0.0.0/0               md5

# PostgreSQL'ni qayta ishga tushirish
systemctl restart postgresql

# Firewall sozlash
ufw allow 5432/tcp
```

6. `.env` faylida:
```env
DB_HOST=<your-droplet-ip>
DB_PORT=5432
DB_NAME=facecontrol
DB_USER=postgres
DB_PASS=your-strong-password
```

---

## Database Muammosini Tekshirish

### 1. PostgreSQL Ishlamoqdamimi?

```powershell
# Docker uchun
docker ps | findstr postgres

# Yoki
docker logs facecontrol-postgres
```

### 2. Ulanishni Test Qilish

Node.js script yarating `test-db.js`:

```javascript
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'facecontrol',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'postgres',
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database ulanish xatosi:', err.message);
    process.exit(1);
  } else {
    console.log('✅ Database muvaffaqiyatli ulandi!');
    console.log('Vaqt:', res.rows[0].now);
    pool.end();
  }
});
```

Ishga tushiring:
```powershell
node test-db.js
```

### 3. Database Yaratish Muammosi

Agar database yaratib bo'lmasa, quyidagilarni tekshiring:

1. **PostgreSQL ishlayaptimi?**
   ```powershell
   # Docker uchun
   docker ps
   ```

2. **User va Database mavjudmi?**
   ```powershell
   # Docker ichida
   docker exec -it facecontrol-postgres psql -U postgres -c "\l"
   ```

3. **Ma'lumotlar bazasini qo'lda yaratish:**
   ```powershell
   # Docker ichida
   docker exec -it facecontrol-postgres psql -U postgres
   ```
   
   Keyin:
   ```sql
   CREATE DATABASE facecontrol;
   \q
   ```

---

## Eng Oson Yechim (Tavsiya)

**Docker Desktop o'rnating va PostgreSQL container yarating** - bu eng oson va tez yechim.

1. Docker Desktop o'rnating
2. Quyidagi buyruqni bajaring:
   ```powershell
   docker run --name facecontrol-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres123 -e POSTGRES_DB=facecontrol -p 5432:5432 -d postgres:15
   ```
3. `.env` faylini yangilang
4. Backend'ni qayta ishga tushiring

---

## Yordam

Agar muammo bo'lsa, quyidagilarni tekshiring:

1. PostgreSQL ishlayaptimi?
2. Port 5432 band emasmi?
3. `.env` fayli to'g'ri sozlanganmi?
4. Firewall PostgreSQL portini bloklamayaptimi?


