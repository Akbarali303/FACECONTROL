require('dotenv').config();
const { pool, initDatabase } = require('./database');
const bcrypt = require('bcrypt');

async function createAdmin() {
  try {
    console.log('[Admin] Testing database connection...');
    await pool.query('SELECT NOW()');
    console.log('[Admin] Database connection OK');
    
    console.log('[Admin] Initializing database tables...');
    await initDatabase();
    
    // Check if admin exists
    const checkAdmin = await pool.query('SELECT id, username FROM users WHERE username = $1', ['admin']);
    
    if (checkAdmin.rows.length > 0) {
      console.log('[Admin] ✅ Admin user already exists');
      console.log('[Admin] Username: admin');
      console.log('[Admin] Password: admin123');
    } else {
      // Create admin user
      const adminPassword = await bcrypt.hash('admin123', 10);
      await pool.query(
        'INSERT INTO users (username, password, full_name, role) VALUES ($1, $2, $3, $4)',
        ['admin', adminPassword, 'Administrator', 'admin']
      );
      console.log('[Admin] ✅ Admin user created successfully');
      console.log('[Admin] Username: admin');
      console.log('[Admin] Password: admin123');
    }
    
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


