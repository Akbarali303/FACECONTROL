/**
 * FACECONTROL — bazaning avtomatik backup qilishi.
 * Backaplar doimiy saqlanadi, scheduler server ichida ishlaydi (ochib-yopilmaydi).
 */

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, 'backups'));
const RETENTION_DAYS = Math.max(1, parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10));
const INTERVAL_HOURS = Math.max(1, Math.min(168, parseInt(process.env.BACKUP_INTERVAL_HOURS || '24', 10)));
const PREFIX = 'facecontrol';

/**
 * Backup papkasini yaratadi (yo'q bo'lsa).
 */
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log('[Backup] Papka yaratildi:', BACKUP_DIR);
  }
}

/**
 * Bugungi backup fayl nomi: facecontrol_2026-01-28_14-30-00.sql
 */
function backupFilename() {
  const now = new Date();
  const d = now.toISOString().slice(0, 10);
  const t = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join('-');
  return `${PREFIX}_${d}_${t}.sql`;
}

/**
 * Bitta backup ishlatadi: pg_dump orqali, faylga yozadi.
 * @returns {Promise<{ success: boolean; path?: string; error?: string }>}
 */
function runBackup() {
  return new Promise((resolve) => {
    ensureBackupDir();
    const filename = backupFilename();
    const filepath = path.join(BACKUP_DIR, filename);

    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || '5432';
    const db = process.env.DB_NAME || 'facecontrol';
    const user = process.env.DB_USER || 'postgres';
    const password = process.env.DB_PASSWORD || process.env.DB_PASS || '';

    const env = { ...process.env, PGPASSWORD: password };
    const args = ['-h', host, '-p', String(port), '-U', user, '-d', db, '-f', filepath];

    let stderr = '';
    let cp;
    try {
      cp = spawn('pg_dump', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      console.error('[Backup] pg_dump ishga tushirib bo\'lmadi:', e.message);
      resolve({ success: false, error: e.message });
      return;
    }

    cp.stderr.on('data', (ch) => { stderr += (ch && ch.toString()) || ''; });
    cp.on('error', (err) => {
      console.error('[Backup] pg_dump xato:', err.message);
      resolve({ success: false, error: err.message });
    });
    cp.on('close', (code) => {
      if (code === 0) {
        console.log('[Backup] Saqlandi:', filepath);
        resolve({ success: true, path: filepath });
      } else {
        console.error('[Backup] pg_dump xato (code %s): %s', code, stderr.trim() || 'noma\'lum');
        try {
          if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        } catch (_) {}
        resolve({ success: false, error: stderr.trim() || `exit ${code}` });
      }
    });
  });
}

/**
 * Retention kunidan eski backaplarni o'chiradi.
 */
function cleanupOldBackups() {
  try {
    ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const maxAge = RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const re = new RegExp(`^${PREFIX}_(\\d{4})-(\\d{2})-(\\d{2})_(\\d{2})-(\\d{2})-(\\d{2})\\.sql$`);
    let deleted = 0;

    for (const f of files) {
      const m = f.match(re);
      if (!m) continue;
      const fp = path.join(BACKUP_DIR, f);
      let stat;
      try {
        stat = fs.statSync(fp);
      } catch (_) {
        continue;
      }
      const age = now - stat.mtimeMs;
      if (age > maxAge) {
        try {
          fs.unlinkSync(fp);
          deleted++;
        } catch (e) {
          console.warn('[Backup] O\'chirib bo\'lmadi:', fp, e.message);
        }
      }
    }
    if (deleted > 0) console.log('[Backup] Eski backaplar o\'chirildi:', deleted);
  } catch (e) {
    console.warn('[Backup] cleanup xato:', e.message);
  }
}

/**
 * Bir marta backup, keyin eskilarni tozalash.
 */
async function runBackupAndCleanup() {
  await runBackup();
  cleanupOldBackups();
}

let schedulerTimer = null;

/**
 * Backap scheduler ni ishga tushiradi. Server ichida doimiy ishlaydi.
 * Birinchi backup 60 s dan keyin, keyin har INTERVAL_HOURS soatda.
 */
function startBackupScheduler() {
  if (schedulerTimer) return;
  console.log('[Backup] Scheduler yoqildi. Papka: %s, har %s soatda, %s kun saqlanadi.', BACKUP_DIR, INTERVAL_HOURS, RETENTION_DAYS);

  const run = () => {
    runBackupAndCleanup().catch((e) => console.error('[Backup] Xato:', e));
  };

  const intervalMs = INTERVAL_HOURS * 60 * 60 * 1000;
  setTimeout(run, 60 * 1000);
  schedulerTimer = setInterval(run, intervalMs);
}

/**
 * Scheduler ni to'xtatadi (graceful shutdown uchun).
 */
function stopBackupScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log('[Backup] Scheduler to\'xtatildi.');
  }
}

module.exports = {
  runBackup,
  runBackupAndCleanup,
  cleanupOldBackups,
  startBackupScheduler,
  stopBackupScheduler,
  BACKUP_DIR,
  RETENTION_DAYS,
  INTERVAL_HOURS,
};
