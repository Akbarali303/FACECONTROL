require('dotenv').config();
const { pool, initDatabase } = require('./database');
const bcrypt = require('bcryptjs');

async function createAdmin() {
  try {
    console.log('[Admin] Testing database connection...');
    await pool.query('SELECT NOW()');
    console.log('[Admin] Database connection OK');
    
    console.log('[Admin] Initializing database tables...');
    await initDatabase();
    
    const users = [
      { username: 'superadmin', password: 'superadmin123', fullName: 'Super Administrator', role: 'superadmin' },
      { username: 'admin', password: 'admin123', fullName: 'Administrator', role: 'admin' }
    ];

    for (const u of users) {
      const exists = await pool.query('SELECT id FROM users WHERE username = $1', [u.username]);
      if (exists.rows.length > 0) {
        console.log(`[Admin] ✅ ${u.username} allaqachon mavjud`);
      } else {
        const hash = await bcrypt.hash(u.password, 10);
        await pool.query(
          'INSERT INTO users (username, password, full_name, role) VALUES ($1, $2, $3, $4)',
          [u.username, hash, u.fullName, u.role]
        );
        console.log(`[Admin] ✅ ${u.username} yaratildi`);
      }
      console.log(`[Admin]   Login: ${u.username} | Parol: ${u.password}`);
    }

    console.log('\n[Admin] Super Admin: superadmin / superadmin123');
    process.exit(0);
  } catch (err) {
    console.error('[Admin] ❌ Error:', err.message);
    console.error('[Admin] Full error:', err);
    console.log('\n[Admin] Please check:');
    console.log('[Admin]   1. PostgreSQL is running');
    console.log('[Admin]   2. Database "facecontrol" exists');
    console.log('[Admin]   3. .env file has correct DB credentials');
    process.exit(1);
  }
}

createAdmin();


