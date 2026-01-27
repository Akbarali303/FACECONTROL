require('dotenv').config();
const { Pool } = require('pg');

// Normalize Render's postgres:// to postgresql:// if needed
let connectionString = process.env.DATABASE_URL;
if (connectionString && connectionString.startsWith('postgres://')) {
  connectionString = connectionString.replace('postgres://', 'postgresql://');
}

const poolConfig = connectionString
  ? {
    connectionString: connectionString,
    ssl: process.env.DB_SSL === 'true' || connectionString.includes('render.com')
      ? { rejectUnauthorized: false }
      : false
  }
  : {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'facecontrol',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  };

const pool = new Pool({
  ...poolConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test connection
pool.on('connect', () => {
  console.log('[DB] Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err);
  // Don't exit process, just log the error
});

// Initialize database tables
async function initDatabase() {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        full_name VARCHAR(100),
        role VARCHAR(20) DEFAULT 'user',
        organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add organization_id column if it doesn't exist (for existing databases)
    try {
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL');
    } catch (err) {
      // Column might already exist, ignore error
    }

    // Add additional user profile columns
    try {
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(200)');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS photo TEXT');
    } catch (err) {
      // Columns might already exist, ignore error
      console.log('[DB] User profile columns check:', err.message);
    }

    // Create default admin user if not exists
    const bcrypt = require('bcrypt');
    const adminPassword = await bcrypt.hash('admin123', 10);

    const checkAdmin = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
    if (checkAdmin.rows.length === 0) {
      await pool.query(
        'INSERT INTO users (username, password, full_name, role) VALUES ($1, $2, $3, $4)',
        ['admin', adminPassword, 'Administrator', 'admin']
      );
      console.log('[DB] Default admin user created (username: admin, password: admin123)');
    }

    // Create employees table for storing people from face control
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50) UNIQUE NOT NULL,
        card_name VARCHAR(100),
        full_name VARCHAR(200),
        position VARCHAR(100),
        organization VARCHAR(200),
        photo_url TEXT,
        photo_base64 TEXT,
        first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total_visits INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add new columns if they don't exist (for existing databases)
    try {
      await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS organization VARCHAR(200)');
      await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_base64 TEXT');
      await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS email VARCHAR(200)');
      await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone VARCHAR(50)');
    } catch (err) {
      // Columns might already exist, ignore error
    }

    // Create events table for storing Dahua events
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50),
        action VARCHAR(50),
        index_value INTEGER,
        user_id VARCHAR(50),
        card_name VARCHAR(100),
        similarity INTEGER,
        status INTEGER,
        door_status VARCHAR(50),
        event_data JSONB,
        received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create attendance table for storing daily attendance records
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        card_name VARCHAR(100),
        arrival_time TIMESTAMP,
        departure_time TIMESTAMP,
        minutes_late INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'ontime',
        is_excused BOOLEAN DEFAULT NULL,
        date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, date)
      )
    `);

    // Add is_excused column if it doesn't exist (for existing databases)
    try {
      await pool.query('ALTER TABLE attendance ADD COLUMN IF NOT EXISTS is_excused BOOLEAN DEFAULT NULL');
      await pool.query('ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    } catch (err) {
      // Columns might already exist, ignore error
    }

    // Create organizations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        phone VARCHAR(50),
        email VARCHAR(200),
        employee_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create time_settings table for time calculation rules
    await pool.query(`
      CREATE TABLE IF NOT EXISTS time_settings (
        id SERIAL PRIMARY KEY,
        on_time_threshold TIME DEFAULT '09:10:00',
        late_threshold TIME DEFAULT '12:00:00',
        absent_threshold TIME DEFAULT '13:00:00',
        departure_start_time TIME DEFAULT '18:00:00',
        departure_end_time TIME DEFAULT '23:59:59',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default time settings if not exists
    const existingSettings = await pool.query('SELECT id FROM time_settings LIMIT 1');
    if (existingSettings.rows.length === 0) {
      await pool.query(`
        INSERT INTO time_settings (on_time_threshold, late_threshold, absent_threshold, departure_start_time, departure_end_time)
        VALUES ('09:10:00', '12:00:00', '13:00:00', '18:00:00', '23:59:59')
      `);
    } else {
      // Update existing settings to new defaults if they are old values
      const currentSettings = await pool.query('SELECT on_time_threshold FROM time_settings ORDER BY id DESC LIMIT 1');
      if (currentSettings.rows.length > 0 && currentSettings.rows[0].on_time_threshold === '09:05:00') {
        await pool.query(`
          UPDATE time_settings 
          SET on_time_threshold = '09:10:00',
              late_threshold = '12:00:00',
              absent_threshold = '13:00:00',
              departure_start_time = '18:00:00',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = (SELECT id FROM time_settings ORDER BY id DESC LIMIT 1)
        `);
      }
    }

    // Add phone, email, and employee_count columns if they don't exist (for existing databases)
    try {
      await pool.query('ALTER TABLE organizations ADD COLUMN IF NOT EXISTS phone VARCHAR(50)');
      await pool.query('ALTER TABLE organizations ADD COLUMN IF NOT EXISTS email VARCHAR(200)');
      await pool.query('ALTER TABLE organizations ADD COLUMN IF NOT EXISTS employee_count INTEGER DEFAULT 0');
    } catch (err) {
      // Columns might already exist, ignore error
    }

    // Create departments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index for departments
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_departments_organization_id ON departments(organization_id)
    `);

    // Create positions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS positions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add department_id to employees table if it doesn't exist
    try {
      await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL');
    } catch (err) {
      // Column might already exist, ignore error
    }

    // Create index for faster queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_events_received_at ON events(received_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON attendance(user_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date DESC)
    `);

    console.log('[DB] Database tables initialized successfully');
  } catch (err) {
    console.error('[DB] Error initializing database:', err.message);
    throw err;
  }
}

module.exports = { pool, initDatabase };

