require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { pool, initDatabase, closePool } = require('./database');
const { loginUser, requireAuth, requireAdmin } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3001;
const DAHUA_IP = process.env.DAHUA_IP || '192.168.0.59';
const DAHUA_USER = process.env.DAHUA_USER || 'admin';
const DAHUA_PASS = process.env.DAHUA_PASS || 'admin123';

// Ring buffer for events (last 200)
const MAX_EVENTS = 200;
const eventBuffer = [];
let eventBufferIndex = 0;

// Memory-based employee storage (fallback when database is not available)
const employeeMemoryStore = new Map(); // key: userId, value: { full_name, position, organization, photo_base64 }

// SSE clients
const sseClients = new Set();

// Database availability (set by checkDatabase)
let dbAvailable = true;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'facecontrol-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files from public directory
app.use(express.static('public'));

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'public', 'uploads', 'users');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'user-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Faqat rasm fayllari qabul qilinadi'));
    }
  }
});

// Dedicated Multer for Webhooks (Memory Storage to access buffer directly)
const webhookUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Dahua Webhook endpoint (POST)
app.post('/api/dahua/event', webhookUpload.any(), (req, res) => {
  handleDahuaWebhook(req, res);
});

app.post('/api/webhook/dahua', webhookUpload.any(), (req, res) => {
  handleDahuaWebhook(req, res);
});

// Dahua Webhook endpoint (GET) - for verification
app.get('/api/dahua/event', (req, res) => {
  res.send("Dahua endpoint is alive (GET) - Use this for /api/dahua/event");
});

app.get('/api/webhook/dahua', (req, res) => {
  res.send("Dahua endpoint is alive (GET) - Use this for /api/webhook/dahua");
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }

  const result = await loginUser(username, password);

  if (result.success) {
    req.session.user = result.user;
    res.json({ success: true, user: result.user });
  } else {
    res.status(401).json(result);
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

// Check session endpoint
app.get('/api/session', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ success: true, user: req.session.user });
  } else {
    res.status(401).json({ success: false, message: 'Not authenticated' });
  }
});

// Organizations API endpoints

// Get all organizations
app.get('/api/organizations', requireAuth, async (req, res) => {
  try {
    let organizations = [];

    if (dbAvailable) {
      try {
        const { pool } = require('./database');
        const result = await pool.query(
          `SELECT o.id, o.name, o.description, o.phone, o.email, o.employee_count, o.created_at, o.updated_at,
                  COALESCE(COUNT(e.id), 0) as actual_employee_count
           FROM organizations o
           LEFT JOIN employees e ON e.organization = o.name
           GROUP BY o.id
           ORDER BY o.name ASC`
        );
        // Use actual_employee_count if employee_count is 0
        organizations = result.rows.map(org => ({
          ...org,
          employee_count: org.employee_count > 0 ? org.employee_count : parseInt(org.actual_employee_count) || 0
        }));
      } catch (err) {
        console.error('[API] Database error fetching organizations:', err.message);
        // Fallback to simple query
        try {
          const { pool } = require('./database');
          const result = await pool.query(
            'SELECT id, name, description, phone, email, employee_count, created_at, updated_at FROM organizations ORDER BY name ASC'
          );
          organizations = result.rows;
        } catch (fallbackErr) {
          console.error('[API] Fallback query error:', fallbackErr.message);
        }
      }
    }

    res.json({ success: true, organizations });
  } catch (err) {
    console.error('[API] Error fetching organizations:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create organization
app.post('/api/organizations', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, description, phone, email, employee_count } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Tashkilot nomi kiritilishi shart' });
    }

    if (!dbAvailable) {
      const ok = await checkDatabase();
      if (!ok) {
        return res.status(503).json({ success: false, message: 'Database not available' });
      }
    }

    try {
      const { pool } = require('./database');
      const n = employee_count != null && String(employee_count).trim() !== '' ? parseInt(employee_count, 10) : 0;
      const count = (typeof n === 'number' && !Number.isNaN(n) && n >= 0) ? n : 0;
      const result = await pool.query(
        'INSERT INTO organizations (name, description, phone, email, employee_count) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, description, phone, email, employee_count, created_at, updated_at',
        [name.trim(), description ? description.trim() : null, phone ? phone.trim() : null, email ? email.trim() : null, count]
      );
      return res.json({ success: true, organization: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(400).json({ success: false, message: 'Bu nomli tashkilot allaqachon mavjud' });
      }
      console.error('[API] Database error creating organization:', err.message);
      dbAvailable = false;
      return res.status(500).json({ success: false, message: 'Database error' });
    }
  } catch (err) {
    console.error('[API] Error creating organization:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update organization
app.put('/api/organizations/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, phone, email, employee_count } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Tashkilot nomi kiritilishi shart' });
    }

    if (!dbAvailable) {
      const ok = await checkDatabase();
      if (!ok) {
        return res.status(503).json({ success: false, message: 'Database not available' });
      }
    }

    try {
      const { pool } = require('./database');
      const n = employee_count != null && String(employee_count).trim() !== '' ? parseInt(employee_count, 10) : 0;
      const count = (typeof n === 'number' && !Number.isNaN(n) && n >= 0) ? n : 0;
      const result = await pool.query(
        'UPDATE organizations SET name = $1, description = $2, phone = $3, email = $4, employee_count = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6 RETURNING id, name, description, phone, email, employee_count, created_at, updated_at',
        [name.trim(), description ? description.trim() : null, phone ? phone.trim() : null, email ? email.trim() : null, count, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Tashkilot topilmadi' });
      }

      return res.json({ success: true, organization: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(400).json({ success: false, message: 'Bu nomli tashkilot allaqachon mavjud' });
      }
      console.error('[API] Database error updating organization:', err.message);
      dbAvailable = false;
      return res.status(500).json({ success: false, message: 'Database error' });
    }
  } catch (err) {
    console.error('[API] Error updating organization:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete organization
app.delete('/api/organizations/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!dbAvailable) {
      const ok = await checkDatabase();
      if (!ok) {
        return res.status(503).json({ success: false, message: 'Database not available' });
      }
    }

    try {
      const { pool } = require('./database');
      const result = await pool.query('DELETE FROM organizations WHERE id = $1 RETURNING id', [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Tashkilot topilmadi' });
      }

      return res.json({ success: true, message: 'Tashkilot muvaffaqiyatli o\'chirildi' });
    } catch (err) {
      console.error('[API] Database error deleting organization:', err.message);
      dbAvailable = false;
      return res.status(500).json({ success: false, message: 'Database error' });
    }
  } catch (err) {
    console.error('[API] Error deleting organization:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Departments API endpoints

// Get all departments
app.get('/api/departments', requireAuth, async (req, res) => {
  try {
    let departments = [];

    if (dbAvailable) {
      try {
        const { pool } = require('./database');
        const result = await pool.query(`
          SELECT d.id, d.organization_id, d.name, d.description, d.created_at, d.updated_at,
                 o.name as organization_name
          FROM departments d
          LEFT JOIN organizations o ON d.organization_id = o.id
          ORDER BY o.name ASC, d.name ASC
        `);
        departments = result.rows;
      } catch (err) {
        console.error('[API] Database error fetching departments:', err.message);
      }
    }

    res.json({ success: true, departments });
  } catch (err) {
    console.error('[API] Error fetching departments:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create department
app.post('/api/departments', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { organization_id, name, description } = req.body;

    if (!organization_id) {
      return res.status(400).json({ success: false, message: 'Tashkilot tanlanishi shart' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Bo\'lim nomi kiritilishi shart' });
    }

    if (dbAvailable) {
      try {
        const { pool } = require('./database');
        const result = await pool.query(
          'INSERT INTO departments (organization_id, name, description) VALUES ($1, $2, $3) RETURNING id, organization_id, name, description, created_at, updated_at',
          [organization_id, name.trim(), description ? description.trim() : null]
        );
        return res.json({ success: true, department: result.rows[0] });
      } catch (err) {
        if (err.code === '23503') { // Foreign key violation
          return res.status(400).json({ success: false, message: 'Tashkilot topilmadi' });
        }
        console.error('[API] Database error creating department:', err.message);
        return res.status(500).json({ success: false, message: 'Database error' });
      }
    }

    res.status(503).json({ success: false, message: 'Database not available' });
  } catch (err) {
    console.error('[API] Error creating department:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update department
app.put('/api/departments/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { organization_id, name, description } = req.body;

    if (!organization_id) {
      return res.status(400).json({ success: false, message: 'Tashkilot tanlanishi shart' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Bo\'lim nomi kiritilishi shart' });
    }

    if (dbAvailable) {
      try {
        const { pool } = require('./database');
        const result = await pool.query(
          'UPDATE departments SET organization_id = $1, name = $2, description = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING id, organization_id, name, description, created_at, updated_at',
          [organization_id, name.trim(), description ? description.trim() : null, id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Bo\'lim topilmadi' });
        }

        return res.json({ success: true, department: result.rows[0] });
      } catch (err) {
        if (err.code === '23503') { // Foreign key violation
          return res.status(400).json({ success: false, message: 'Tashkilot topilmadi' });
        }
        console.error('[API] Database error updating department:', err.message);
        return res.status(500).json({ success: false, message: 'Database error' });
      }
    }

    res.status(503).json({ success: false, message: 'Database not available' });
  } catch (err) {
    console.error('[API] Error updating department:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete department
app.delete('/api/departments/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (dbAvailable) {
      try {
        const { pool } = require('./database');
        const result = await pool.query('DELETE FROM departments WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Bo\'lim topilmadi' });
        }

        return res.json({ success: true, message: 'Bo\'lim muvaffaqiyatli o\'chirildi' });
      } catch (err) {
        console.error('[API] Database error deleting department:', err.message);
        return res.status(500).json({ success: false, message: 'Database error' });
      }
    }

    res.status(503).json({ success: false, message: 'Database not available' });
  } catch (err) {
    console.error('[API] Error deleting department:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Positions API endpoints

// Get all positions
app.get('/api/positions', requireAuth, async (req, res) => {
  try {
    let positions = [];

    if (dbAvailable) {
      try {
        const { pool } = require('./database');
        const result = await pool.query('SELECT * FROM positions ORDER BY name ASC');
        positions = result.rows;
      } catch (err) {
        console.error('[API] Database error fetching positions:', err.message);
      }
    }

    res.json({ success: true, positions });
  } catch (err) {
    console.error('[API] Error fetching positions:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create position
app.post('/api/positions', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Lavozim nomi kiritilishi shart' });
    }

    if (dbAvailable) {
      try {
        const { pool } = require('./database');
        const result = await pool.query(
          'INSERT INTO positions (name, description) VALUES ($1, $2) RETURNING id, name, description, created_at, updated_at',
          [name.trim(), description ? description.trim() : null]
        );
        return res.json({ success: true, position: result.rows[0] });
      } catch (err) {
        if (err.code === '23505') { // Unique violation
          return res.status(400).json({ success: false, message: 'Bu lavozim allaqachon mavjud' });
        }
        console.error('[API] Database error creating position:', err.message);
        return res.status(500).json({ success: false, message: 'Database error' });
      }
    }

    res.status(503).json({ success: false, message: 'Database not available' });
  } catch (err) {
    console.error('[API] Error creating position:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update position
app.put('/api/positions/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Lavozim nomi kiritilishi shart' });
    }

    if (dbAvailable) {
      try {
        const { pool } = require('./database');
        const result = await pool.query(
          'UPDATE positions SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING id, name, description, created_at, updated_at',
          [name.trim(), description ? description.trim() : null, id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Lavozim topilmadi' });
        }

        return res.json({ success: true, position: result.rows[0] });
      } catch (err) {
        if (err.code === '23505') { // Unique violation
          return res.status(400).json({ success: false, message: 'Bu lavozim allaqachon mavjud' });
        }
        console.error('[API] Database error updating position:', err.message);
        return res.status(500).json({ success: false, message: 'Database error' });
      }
    }

    res.status(503).json({ success: false, message: 'Database not available' });
  } catch (err) {
    console.error('[API] Error updating position:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete position
app.delete('/api/positions/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (dbAvailable) {
      try {
        const { pool } = require('./database');
        const result = await pool.query('DELETE FROM positions WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Lavozim topilmadi' });
        }

        return res.json({ success: true, message: 'Lavozim muvaffaqiyatli o\'chirildi' });
      } catch (err) {
        console.error('[API] Database error deleting position:', err.message);
        return res.status(500).json({ success: false, message: 'Database error' });
      }
    }

    res.status(503).json({ success: false, message: 'Database not available' });
  } catch (err) {
    console.error('[API] Error deleting position:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Users API endpoints

// Get all users (admin only)
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!dbAvailable) {
      return res.status(503).json({ success: false, message: 'Database not available' });
    }

    const { pool } = require('./database');
    const result = await pool.query(`
      SELECT u.id, u.username, u.full_name, u.role, u.created_at, o.name as organization_name
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      ORDER BY u.created_at DESC
    `);

    res.json({ success: true, users: result.rows });
  } catch (err) {
    console.error('[API] Error fetching users:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get current user info
app.get('/api/users/me', requireAuth, async (req, res) => {
  try {
    if (!dbAvailable) {
      return res.status(503).json({ success: false, message: 'Database not available' });
    }

    const userId = req.session.user.id;
    const { pool } = require('./database');

    const result = await pool.query(`
      SELECT id, username, full_name, first_name, last_name, email, phone, address, birth_date, photo, role, organization_id, created_at
      FROM users
      WHERE id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Foydalanuvchi topilmadi' });
    }

    const user = result.rows[0];
    // Convert photo path to URL if exists
    if (user.photo && !user.photo.startsWith('http')) {
      user.photo = `/uploads/users/${path.basename(user.photo)}`;
    }

    res.json({ success: true, user: user });
  } catch (err) {
    console.error('[API] Error fetching current user:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update current user info
app.put('/api/users/me', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    if (!dbAvailable) {
      return res.status(503).json({ success: false, message: 'Database not available' });
    }

    const userId = req.session.user.id;
    const { pool } = require('./database');
    const bcrypt = require('bcrypt');

    // Get form data
    const { first_name, last_name, username, password, email, phone, address, birth_date } = req.body;

    // Build update query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (first_name !== undefined) {
      updates.push(`first_name = $${paramIndex++}`);
      values.push(first_name || null);
    }
    if (last_name !== undefined) {
      updates.push(`last_name = $${paramIndex++}`);
      values.push(last_name || null);
    }
    if (username !== undefined) {
      // Check if username is already taken by another user
      const existingUser = await pool.query('SELECT id FROM users WHERE username = $1 AND id != $2', [username, userId]);
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Bu username allaqachon mavjud' });
      }
      updates.push(`username = $${paramIndex++}`);
      values.push(username);
    }
    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push(`password = $${paramIndex++}`);
      values.push(hashedPassword);
    }
    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(email || null);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(phone || null);
    }
    if (address !== undefined) {
      updates.push(`address = $${paramIndex++}`);
      values.push(address || null);
    }
    if (birth_date !== undefined) {
      updates.push(`birth_date = $${paramIndex++}`);
      values.push(birth_date || null);
    }

    // Handle photo upload
    if (req.file) {
      const photoPath = `/uploads/users/${req.file.filename}`;
      updates.push(`photo = $${paramIndex++}`);
      values.push(photoPath);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'Yangilash uchun ma\'lumotlar kiritilmagan' });
    }

    // Update full_name from first_name and last_name
    if (first_name !== undefined || last_name !== undefined) {
      const currentUser = await pool.query('SELECT first_name, last_name FROM users WHERE id = $1', [userId]);
      const newFirstName = first_name !== undefined ? first_name : currentUser.rows[0]?.first_name;
      const newLastName = last_name !== undefined ? last_name : currentUser.rows[0]?.last_name;
      const fullName = [newFirstName, newLastName].filter(Boolean).join(' ') || null;
      updates.push(`full_name = $${paramIndex++}`);
      values.push(fullName);
    }

    values.push(userId);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, username, full_name, first_name, last_name, email, phone, address, birth_date, photo, role, organization_id, created_at`;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Foydalanuvchi topilmadi' });
    }

    const user = result.rows[0];
    // Convert photo path to URL if exists
    if (user.photo && !user.photo.startsWith('http')) {
      user.photo = `/uploads/users/${path.basename(user.photo)}`;
    }

    // Update session
    req.session.user = { ...req.session.user, ...user };

    res.json({ success: true, user: user });
  } catch (err) {
    console.error('[API] Error updating current user:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create new user (admin only)
app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, full_name, role, organization_id } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username va password majburiy' });
    }

    if (!dbAvailable) {
      return res.status(503).json({ success: false, message: 'Database not available' });
    }

    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 10);

    const { pool } = require('./database');

    // Check if username already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Bu username allaqachon mavjud' });
    }

    const result = await pool.query(
      `INSERT INTO users (username, password, full_name, role, organization_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, full_name, role, organization_id, created_at`,
      [username, hashedPassword, full_name || null, role || 'user', organization_id || null]
    );

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') { // Unique violation
      return res.status(400).json({ success: false, message: 'Bu username allaqachon mavjud' });
    }
    console.error('[API] Error creating user:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete user endpoint
app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const currentUserId = req.session.user.id;

    if (!dbAvailable) {
      return res.status(503).json({ success: false, message: 'Database not available' });
    }

    // Prevent deleting yourself
    if (userId === currentUserId) {
      return res.status(400).json({ success: false, message: 'O\'zingizni o\'chira olmaysiz' });
    }

    const { pool } = require('./database');
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Foydalanuvchi topilmadi' });
    }

    res.json({ success: true, message: 'Foydalanuvchi muvaffaqiyatli o\'chirildi' });
  } catch (err) {
    console.error('[API] Error deleting user:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete employee endpoint
app.delete('/api/employees/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    if (dbAvailable) {
      try {
        const { pool } = require('./database');
        const result = await pool.query('DELETE FROM employees WHERE user_id = $1 RETURNING user_id', [userId]);

        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Xodim topilmadi' });
        }

        // Also remove from memory store
        employeeMemoryStore.delete(userId);

        return res.json({ success: true, message: 'Xodim muvaffaqiyatli o\'chirildi' });
      } catch (err) {
        console.error('[API] Database error deleting employee:', err.message);
        return res.status(500).json({ success: false, message: 'Database error' });
      }
    }

    // If database not available, just remove from memory
    employeeMemoryStore.delete(userId);
    return res.json({ success: true, message: 'Xodim muvaffaqiyatli o\'chirildi' });
  } catch (err) {
    console.error('[API] Error deleting employee:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get employees endpoint (protected)
app.get('/api/employees', requireAuth, async (req, res) => {
  try {
    let employees = [];

    // Try database first
    if (dbAvailable) {
      try {
        const { getAllEmployees } = require('./employees');
        employees = await getAllEmployees();
      } catch (err) {
        console.error('[API] Database error fetching employees:', err.message);
      }
    }

    // Add memory employees
    const memoryEmployees = Array.from(employeeMemoryStore.values());
    employees = [...employees, ...memoryEmployees];

    res.json({ success: true, employees });
  } catch (err) {
    console.error('[API] Error fetching employees:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create demo employees endpoint (protected, admin only) - MUST be before /:userId route
app.post('/api/employees/demo', requireAuth, requireAdmin, async (req, res) => {
  console.log('[API] POST /api/employees/demo - Request received');
  try {
    // Check database connection
    let dbConnected = false;
    let dbError = null;
    try {
      const { pool } = require('./database');
      await pool.query('SELECT NOW()');
      dbConnected = true;
      console.log('[API] Database connection successful');
    } catch (dbErr) {
      console.log('[API] Database connection check failed:', dbErr.message);
      dbError = dbErr.message;
      dbConnected = false;
    }

    if (!dbConnected) {
      console.log('[API] Database not available');
      return res.status(503).json({
        success: false,
        message: 'Database not available. Please check PostgreSQL connection.',
        error: dbError || 'Database connection failed',
        details: 'Make sure:\n1. PostgreSQL is running\n2. Database "facecontrol" exists\n3. .env file has correct DB credentials:\n   DB_HOST=localhost\n   DB_PORT=5432\n   DB_NAME=facecontrol\n   DB_USER=postgres\n   DB_PASS=your_password'
      });
    }

    console.log('[API] Creating demo employees...');
    const { createDemoEmployees } = require('./employees');
    const result = await createDemoEmployees();

    console.log('[API] Demo employees result:', result);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    console.error('[API] Error creating demo employees:', err);
    res.status(500).json({ success: false, message: `Server error: ${err.message}` });
  }
});

// Create new employee endpoint (protected, admin only)
app.post('/api/employees', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { card_name, full_name, position, organization, photo_base64 } = req.body;

    if (!full_name) {
      return res.status(400).json({ success: false, message: 'Full Name majburiy maydon' });
    }

    // Normalize name for matching (remove extra spaces, convert to lowercase)
    const normalizedName = full_name.trim().toLowerCase().replace(/\s+/g, ' ');

    // Check database connection
    let dbConnected = false;
    try {
      const { pool } = require('./database');
      await pool.query('SELECT NOW()');
      dbConnected = true;
    } catch (dbErr) {
      console.log('[API] Database connection check failed:', dbErr.message);
      dbConnected = false;
    }

    if (dbConnected) {
      try {
        const { pool } = require('./database');

        // Check if employee with same name already exists
        const existingByName = await pool.query(
          `SELECT user_id, full_name FROM employees WHERE LOWER(TRIM(full_name)) = $1`,
          [normalizedName]
        );

        if (existingByName.rows.length > 0) {
          // Update existing employee with new data
          const existingUserId = existingByName.rows[0].user_id;
          const result = await pool.query(
            `UPDATE employees 
             SET card_name = COALESCE($1, card_name),
                 position = COALESCE($2, position),
                 organization = COALESCE($3, organization),
                 photo_base64 = COALESCE($4, photo_base64),
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $5
             RETURNING id, user_id, card_name, full_name, position, organization, photo_base64`,
            [card_name || null, position || null, organization || null, photo_base64 || null, existingUserId]
          );

          console.log(`[API] Employee with name "${full_name}" updated (user_id: ${existingUserId})`);
          return res.json({ success: true, employee: result.rows[0], message: 'Employee updated (matched by name)' });
        }

        // Generate temporary user_id (will be updated when API event arrives)
        // Use a placeholder ID that starts with "TEMP_" + timestamp
        const tempUserId = `TEMP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Insert new employee
        const now = new Date();
        const result = await pool.query(
          `INSERT INTO employees (user_id, card_name, full_name, position, organization, photo_base64, first_seen_at, last_seen_at, total_visits) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, 0) RETURNING id, user_id, card_name, full_name, position, organization, photo_base64`,
          [tempUserId, card_name || null, full_name, position || null, organization || null, photo_base64 || null, now]
        );

        console.log(`[API] Employee "${full_name}" created with temp ID: ${tempUserId}`);
        res.json({ success: true, employee: result.rows[0], message: 'Employee created. Will be matched with API ID when event arrives.' });
        return;
      } catch (dbErr) {
        console.error('[API] Database error creating employee:', dbErr.message);
        dbAvailable = false;
        // Fall through to memory storage
      }
    }

    // Fallback: Store in memory if database is not available
    const tempUserId = `TEMP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`[API] Storing employee "${full_name}" in memory with temp ID: ${tempUserId}`);
    const employeeData = {
      user_id: tempUserId,
      card_name: card_name || null,
      full_name: full_name,
      position: position || null,
      organization: organization || null,
      photo_base64: photo_base64 || null,
      created_at: new Date().toISOString()
    };

    employeeMemoryStore.set(tempUserId, employeeData);

    res.json({
      success: true,
      employee: employeeData,
      message: 'Employee saved in memory (database not available)'
    });
  } catch (err) {
    console.error('[API] Error creating employee:', err);
    res.status(500).json({ success: false, message: `Server error: ${err.message}` });
  }
});


// Get employee by user_id endpoint (protected)
app.get('/api/employees/:userId', requireAuth, async (req, res) => {
  try {
    const userId = req.params.userId;

    // Try database first
    if (dbAvailable) {
      try {
        const { getEmployeeByUserId } = require('./employees');
        const employee = await getEmployeeByUserId(userId);
        if (employee) {
          return res.json({ success: true, employee });
        }
      } catch (err) {
        console.error('[API] Database error fetching employee:', err.message);
      }
    }

    // Fallback to memory
    const memoryEmployee = employeeMemoryStore.get(userId);
    if (memoryEmployee) {
      return res.json({ success: true, employee: memoryEmployee });
    }

    // Return success: false instead of 404 (employee not found yet is OK)
    res.json({ success: false, message: 'Employee not found' });
  } catch (err) {
    console.error('[API] Error fetching employee:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update employee endpoint (protected)
app.put('/api/employees/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { full_name, position, organization, photo_url, photo_base64, department_id, email, phone } = req.body;

    console.log(`[API] Update employee request: userId=${userId}, data=`, { full_name, position, organization, hasPhoto: !!photo_base64 });

    // Try database first, fallback to memory if not available
    if (dbAvailable) {
      try {
        const { pool } = require('./database');
        const { getEmployeeByUserId } = require('./employees');

        // Check if employee exists, if not create it
        let employee = await getEmployeeByUserId(userId);
        if (!employee) {
          console.log(`[API] Employee ${userId} not found, creating new employee in database`);
          // Create employee first
          await pool.query(
            `INSERT INTO employees (user_id, card_name, full_name, position, organization, photo_base64, department_id, email, phone, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
             ON CONFLICT (user_id) DO NOTHING`,
            [userId, full_name || null, full_name || null, position || null, organization || null, photo_base64 || null, department_id || null, email || null, phone || null]
          );
          employee = await getEmployeeByUserId(userId);
        }

        if (employee) {
          // Update employee in database
          const { updateEmployee } = require('./employees');
          const result = await updateEmployee(userId, {
            full_name,
            position,
            organization,
            photo_url,
            photo_base64,
            department_id,
            email,
            phone
          });

          if (result.success) {
            console.log(`[API] Employee ${userId} updated successfully in database`);
            res.json(result);
            return;
          }
        }
        // If employee not found or update failed, fall through to memory storage
      } catch (dbErr) {
        console.error('[API] Database error updating employee:', dbErr.message);
        dbAvailable = false;
        // Fall through to memory storage
      }
    }

    // Fallback: Store in memory if database is not available
    console.log(`[API] Storing employee ${userId} in memory (database not available)`);
    const employeeData = {
      user_id: userId,
      full_name: full_name || null,
      position: position || null,
      organization: organization || null,
      photo_url: photo_url || null,
      photo_base64: photo_base64 || null,
      email: email || null,
      phone: phone || null,
      updated_at: new Date().toISOString()
    };

    employeeMemoryStore.set(userId, employeeData);

    res.json({
      success: true,
      employee: employeeData,
      message: 'Employee saved in memory (database not available)'
    });
  } catch (err) {
    console.error('[API] Error updating employee:', err);
    res.status(500).json({ success: false, message: `Server error: ${err.message}` });
  }
});

// Upload photo endpoint (protected) - accepts base64 image
app.post('/api/employees/:userId/photo', requireAuth, async (req, res) => {
  try {
    if (!dbAvailable) {
      return res.status(503).json({ success: false, message: 'Database not available' });
    }

    const { userId } = req.params;
    const { photo_base64, photo_url } = req.body;

    if (!photo_base64 && !photo_url) {
      return res.status(400).json({ success: false, message: 'Photo data required' });
    }

    const { updateEmployee } = require('./employees');
    const result = await updateEmployee(userId, {
      photo_base64: photo_base64 || null,
      photo_url: photo_url || null
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    console.error('[API] Error uploading photo:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete employee endpoint (protected, admin only)
app.delete('/api/employees/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!dbAvailable) {
      // Delete from memory store
      if (employeeMemoryStore.has(userId)) {
        employeeMemoryStore.delete(userId);
        return res.json({ success: true, message: 'Employee deleted from memory' });
      }
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const { deleteEmployee } = require('./employees');
    const result = await deleteEmployee(userId);

    // Also delete from memory store if exists
    if (employeeMemoryStore.has(userId)) {
      employeeMemoryStore.delete(userId);
    }

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    console.error('[API] Error deleting employee:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Time Settings API endpoints

// Get time settings
app.get('/api/time-settings', requireAuth, async (req, res) => {
  try {
    if (dbAvailable) {
      try {
        const { pool } = require('./database');
        const result = await pool.query('SELECT * FROM time_settings ORDER BY id DESC LIMIT 1');
        
        if (result.rows.length > 0) {
          const settings = result.rows[0];
          return res.json({
            success: true,
            settings: {
              onTimeThreshold: settings.on_time_threshold,
              lateThreshold: settings.late_threshold,
              absentThreshold: settings.absent_threshold,
              departureStartTime: settings.departure_start_time
            }
          });
        } else {
          // Return default values if no settings exist
          return res.json({
            success: true,
            settings: {
              onTimeThreshold: '09:10:00',
              lateThreshold: '12:00:00',
              absentThreshold: '13:00:00',
              departureStartTime: '18:00:00'
            }
          });
        }
      } catch (err) {
        console.error('[API] Database error getting time settings:', err.message);
        return res.status(500).json({ success: false, message: 'Database error' });
      }
    }

    res.status(503).json({ success: false, message: 'Database not available' });
  } catch (err) {
    console.error('[API] Error getting time settings:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Normalize time to HH:MM:SS
function normalizeTime(s) {
  if (!s || typeof s !== 'string') return '';
  const t = s.trim();
  if (!t) return '';
  const parts = t.split(':').map(p => p.padStart(2, '0'));
  if (parts.length === 2) return parts[0] + ':' + parts[1] + ':00';
  if (parts.length >= 3) return parts[0] + ':' + parts[1] + ':' + parts[2];
  return t;
}

// Update time settings
app.put('/api/time-settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const onTimeThreshold = normalizeTime(req.body.onTimeThreshold);
    const lateThreshold = normalizeTime(req.body.lateThreshold);
    const absentThreshold = normalizeTime(req.body.absentThreshold);
    const departureStartTime = normalizeTime(req.body.departureStartTime);

    if (!onTimeThreshold || !lateThreshold || !absentThreshold || !departureStartTime) {
      return res.status(400).json({ success: false, message: 'Barcha maydonlar to\'ldirilishi kerak' });
    }

    if (dbAvailable) {
      try {
        const { pool } = require('./database');
        
        // Check if settings exist
        const existing = await pool.query('SELECT id FROM time_settings ORDER BY id DESC LIMIT 1');
        
        if (existing.rows.length > 0) {
          // Update existing settings
          await pool.query(`
            UPDATE time_settings 
            SET on_time_threshold = $1,
                late_threshold = $2,
                absent_threshold = $3,
                departure_start_time = $4,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
          `, [onTimeThreshold, lateThreshold, absentThreshold, departureStartTime, existing.rows[0].id]);
        } else {
          // Insert new settings
          await pool.query(`
            INSERT INTO time_settings (on_time_threshold, late_threshold, absent_threshold, departure_start_time)
            VALUES ($1, $2, $3, $4)
          `, [onTimeThreshold, lateThreshold, absentThreshold, departureStartTime]);
        }

        return res.json({ success: true, message: 'Vaqt sozlamalari muvaffaqiyatli yangilandi' });
      } catch (err) {
        console.error('[API] Database error updating time settings:', err.message);
        return res.status(500).json({ success: false, message: 'Database error' });
      }
    }

    res.status(503).json({ success: false, message: 'Database not available' });
  } catch (err) {
    console.error('[API] Error updating time settings:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get attendance records endpoint
app.get('/api/attendance', requireAuth, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const limit = Math.min(parseInt(req.query.limit || '1000', 10), 5000);

    if (!dbAvailable) {
      const ok = await checkDatabase();
      if (!ok) {
        return res.status(503).json({ success: false, message: 'Database not available' });
      }
    }

    try {
      const { pool } = require('./database');
      const result = await pool.query(`
          SELECT 
            a.id,
            a.user_id,
            a.card_name,
            a.arrival_time,
            a.departure_time,
            a.minutes_late,
            a.status,
            a.is_excused,
            a.excuse_type,
            a.date,
            e.full_name,
            e.position,
            e.organization,
            e.photo_url,
            e.photo_base64
          FROM attendance a
          LEFT JOIN employees e ON a.user_id = e.user_id
          WHERE a.date = $1
          ORDER BY 
            CASE 
              WHEN a.departure_time IS NOT NULL THEN a.departure_time
              WHEN a.arrival_time IS NOT NULL THEN a.arrival_time
              ELSE a.date
            END DESC
          LIMIT $2
        `, [date, limit]);

      return res.json({
        success: true,
        count: result.rows.length,
        date: date,
        records: result.rows
      });
    } catch (err) {
      console.error('[API] Database error getting attendance:', err.message);
      dbAvailable = false;
      return res.status(500).json({ success: false, message: 'Database error' });
    }
  } catch (err) {
    console.error('[API] Error getting attendance:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get monthly average KPI for employees
app.get('/api/employees/monthly-kpi', requireAuth, async (req, res) => {
  try {
    const month = req.query.month || new Date().getMonth() + 1; // 1-12
    const year = req.query.year || new Date().getFullYear();

    if (dbAvailable) {
      try {
        const { pool } = require('./database');
        
        // Get time settings
        const timeSettingsResult = await pool.query('SELECT * FROM time_settings ORDER BY id DESC LIMIT 1');
        let timeSettings = {
          onTimeThreshold: '09:10:00',
          lateThreshold: '12:00:00',
          absentThreshold: '13:00:00',
          departureStartTime: '18:00:00'
        };
        
        if (timeSettingsResult.rows.length > 0) {
          const settings = timeSettingsResult.rows[0];
          timeSettings = {
            onTimeThreshold: settings.on_time_threshold,
            lateThreshold: settings.late_threshold,
            absentThreshold: settings.absent_threshold,
            departureStartTime: settings.departure_start_time
          };
        }

        // Get all attendance records for the month
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // Last day of month
        
        const result = await pool.query(`
          SELECT 
            a.user_id,
            a.arrival_time,
            a.departure_time,
            a.minutes_late,
            a.status,
            a.is_excused,
            a.excuse_type,
            a.date
          FROM attendance a
          WHERE a.date >= $1 AND a.date <= $2
          ORDER BY a.user_id, a.date
        `, [startDate, endDate]);

        // Group by user_id and calculate monthly average KPI
        const userKPIMap = new Map();
        
        result.rows.forEach(record => {
          const userId = record.user_id;
          if (!userKPIMap.has(userId)) {
            userKPIMap.set(userId, {
              userId: userId,
              totalKPI: 0,
              daysCount: 0
            });
          }
          
          const userData = userKPIMap.get(userId);
          
          // Calculate KPI for this day
          let dayKPI = 0;
          const et = record.excuse_type;

          if (et === 'excused' || et === 'on_duty') {
            dayKPI = 100; // Sababli yoki Safarda = 100%
          } else if (et === 'not_excused') {
            dayKPI = 0; // Sababsiz = 0%
          } else if (record.is_excused === true) {
            dayKPI = 100; // Sababli (eski)
          } else if (record.is_excused === false) {
            dayKPI = 0; // Sababsiz (eski)
          } else {
            // Normal KPI calculation
            let arrivalKPI = 0;
            let departureKPI = 0;
            
            // Arrival KPI (9:00-18:00 = 100%)
            if (record.arrival_time) {
              const arrivalTime = new Date(record.arrival_time);
              const today = new Date(arrivalTime);
              today.setHours(0, 0, 0, 0);
              
              const [onHours, onMinutes] = timeSettings.onTimeThreshold.split(':').map(Number);
              const [depHours, depMinutes] = timeSettings.departureStartTime.split(':').map(Number);
              
              const workStart = new Date(today);
              workStart.setHours(9, 0, 0, 0);
              const workEnd = new Date(today);
              workEnd.setHours(18, 0, 0, 0);
              
              if (arrivalTime >= workStart && arrivalTime <= workEnd) {
                arrivalKPI = 100;
              } else if (arrivalTime < workStart) {
                arrivalKPI = 100;
              }
            }
            
            // Departure KPI (18:00-23:59 = 30%)
            if (record.departure_time) {
              const departureTime = new Date(record.departure_time);
              const today = new Date(departureTime);
              today.setHours(0, 0, 0, 0);
              
              const departureStart = new Date(today);
              departureStart.setHours(18, 0, 0, 0);
              const departureEnd = new Date(today);
              departureEnd.setHours(23, 59, 59, 999);
              
              if (departureTime >= departureStart && departureTime <= departureEnd) {
                departureKPI = 30;
              }
            }
            
            dayKPI = arrivalKPI + departureKPI;
            if (dayKPI > 130) dayKPI = 130;
          }
          
          userData.totalKPI += dayKPI;
          userData.daysCount += 1;
        });
        
        // Calculate average KPI for each user
        const monthlyKPIs = [];
        userKPIMap.forEach((userData, userId) => {
          const avgKPI = userData.daysCount > 0 ? Math.round(userData.totalKPI / userData.daysCount) : 0;
          monthlyKPIs.push({
            userId: userId,
            averageKPI: avgKPI,
            daysCount: userData.daysCount
          });
        });
        
        return res.json({
          success: true,
          month: month,
          year: year,
          kpis: monthlyKPIs
        });
      } catch (err) {
        console.error('[API] Database error getting monthly KPI:', err.message);
        return res.status(500).json({ success: false, message: 'Database error' });
      }
    }

    res.status(503).json({ success: false, message: 'Database not available' });
  } catch (err) {
    console.error('[API] Error getting monthly KPI:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update attendance excuse status (sababli/sababsiz)
app.put('/api/attendance/:id/excuse', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
        const { is_excused, excuse_type } = req.body; // excuse_type: 'excused'|'not_excused'|'on_duty'

    if (dbAvailable) {
      try {
        const { pool } = require('./database');
        
        // Check if attendance record exists
        const existing = await pool.query('SELECT id FROM attendance WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Attendance record not found' });
        }

        const validTypes = ['excused', 'not_excused', 'on_duty'];
        const excType = validTypes.includes(excuse_type) ? excuse_type : null;
        const isExc = excType === 'excused' || excType === 'on_duty' ? true : (excType === 'not_excused' ? false : (is_excused === null ? null : Boolean(is_excused)));

        await pool.query(
          `UPDATE attendance 
           SET is_excused = $1,
               excuse_type = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [isExc, excType, id]
        );

        return res.json({ success: true, message: 'Status yangilandi' });
      } catch (err) {
        console.error('[API] Database error updating attendance excuse:', err.message);
        return res.status(500).json({ success: false, message: 'Database error' });
      }
    }

    res.status(503).json({ success: false, message: 'Database not available' });
  } catch (err) {
    console.error('[API] Error updating attendance excuse:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get events endpoint
app.get('/api/public/events', async (req, res) => {
  try {
    if (!dbAvailable) {
      return res.status(503).json({ success: false, message: 'Database not available' });
    }
    const limit = Math.min(parseInt(req.query.limit || '500', 10), 2000);

    // Optional filters
    const from = req.query.from; // YYYY-MM-DD
    const to = req.query.to;     // YYYY-MM-DD

    let where = [];
    let params = [];
    let idx = 1;

    if (from) {
      where.push(`received_at >= $${idx++}::date`);
      params.push(from);
    }
    if (to) {
      // include whole day
      where.push(`received_at < ($${idx++}::date + interval '1 day')`);
      params.push(to);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const q = `
      SELECT *
      FROM events
      ${whereSql}
      ORDER BY received_at DESC
      LIMIT ${limit}
    `;

    const result = await pool.query(q, params);

    res.json({
      success: true,
      count: result.rows.length,
      rows: result.rows
    });
  } catch (err) {
    console.error('[Public Events] Error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Manual event logging endpoint (protected)
app.post('/api/access-events', requireAuth, async (req, res) => {
  try {
    const event = req.body;
    if (!event.code || !event.data) {
      return res.status(400).json({ success: false, message: 'Invalid event data' });
    }
    await addEvent(event);
    res.json({ success: true, message: 'Event logged' });
  } catch (err) {
    console.error('[API] Error logging manual event:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Retention policy: Cleanup events older than 7 days
setInterval(async () => {
  try {
    if (dbAvailable) {
      const { pool } = require('./database');
      const result = await pool.query(
        "DELETE FROM events WHERE received_at < NOW() - INTERVAL '7 days'"
      );
      if (result.rowCount > 0) {
        console.log(`[DB] Cleanup: Removed ${result.rowCount} old events.`);
      }
    }
  } catch (err) {
    console.error('[DB] Cleanup error:', err.message);
  }
}, 24 * 60 * 60 * 1000); // Once a day


// SSE realtime endpoint (protected)
app.get('/api/realtime', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  sseClients.add(res);

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Send heartbeat ping every 5 seconds to keep connection alive
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'ping', t: Date.now() })}\n\n`);
    } catch (err) {
      // Client disconnected
      clearInterval(heartbeatInterval);
      sseClients.delete(res);
    }
  }, 5000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    sseClients.delete(res);
    res.end();
  });
});

// Check if database is available
async function checkDatabase() {
  try {
    const { pool } = require('./database');
    await pool.query('SELECT NOW()');
    dbAvailable = true;
    return true;
  } catch (err) {
    dbAvailable = false;
    return false;
  }
}

// Initialize database check
checkDatabase().catch(() => {
  dbAvailable = false;
});

// Periodic DB recheck (har 60 soniyada) — DB qaytasa dbAvailable true bo‘ladi
setInterval(() => {
  checkDatabase().catch(() => {});
}, 60000);

// Add event to ring buffer, database, and broadcast to SSE clients
async function addEvent(event) {
  const eventWithTimestamp = {
    ...event,
    receivedAt: new Date().toISOString()
  };

  // Add to ring buffer (always works)
  eventBuffer[eventBufferIndex] = eventWithTimestamp;
  eventBufferIndex = (eventBufferIndex + 1) % MAX_EVENTS;

  // AUTOMATIC EMPLOYEE CREATION: AccessControl event kelganda employee yaratish
  // Bu database'ga bog'liq emas, har doim ishlaydi
  if (event.code === 'AccessControl' && event.data?.UserID) {
    const apiUserId = event.data.UserID;
    const apiCardName = event.data.CardName || null;

    // Employee Memory Store'ga avtomatik yaratish/yangilash
    if (!employeeMemoryStore.has(apiUserId)) {
      // Yangi employee yaratish
      const now = new Date();
      employeeMemoryStore.set(apiUserId, {
        user_id: apiUserId,
        card_name: apiCardName,
        full_name: apiCardName || `User ${apiUserId}`,
        position: null,
        organization: null,
        photo_url: null,
        photo_base64: null,
        first_seen_at: now.toISOString(),
        last_seen_at: now.toISOString(),
        total_visits: 1,
        created_at: now.toISOString()
      });
      console.log(`[Auto-Employee] ✅ Created employee in memory: ${apiUserId} (${apiCardName || 'Unknown'})`);
    } else {
      // Mavjud employee'ni yangilash
      const existingEmployee = employeeMemoryStore.get(apiUserId);
      existingEmployee.last_seen_at = new Date().toISOString();
      existingEmployee.total_visits = (existingEmployee.total_visits || 0) + 1;
      if (apiCardName && !existingEmployee.card_name) {
        existingEmployee.card_name = apiCardName;
        existingEmployee.full_name = apiCardName;
      }
      employeeMemoryStore.set(apiUserId, existingEmployee);
      console.log(`[Auto-Employee] ✅ Updated employee in memory: ${apiUserId} (visits: ${existingEmployee.total_visits})`);
    }
  }

  // Save to database (only if available)
  if (dbAvailable) {
    try {
      const { pool } = require('./database');
      const { saveEmployee, saveAttendance } = require('./employees');

      // Save event
      await pool.query(
        `INSERT INTO events (code, action, index_value, user_id, card_name, similarity, status, door_status, event_data, received_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          event.code,
          event.action,
          event.index || null,
          event.data?.UserID || null,
          event.data?.CardName || null,
          event.data?.Similarity || null,
          event.data?.Status || null,
          event.data?.DoorStatus || null,
          JSON.stringify(event.data),
          new Date(eventWithTimestamp.receivedAt)
        ]
      );

      // Save employee to database (if AccessControl event and database available)
      if (event.code === 'AccessControl' && event.data?.UserID) {
        const apiUserId = event.data.UserID;
        const apiCardName = event.data.CardName || null;

        // Try to match by name (CardName from API) - for database
        if (apiCardName) {
          try {
            const normalizedCardName = apiCardName.trim().toLowerCase();

            // Check if employee with matching name exists (but different user_id)
            const matchingEmployee = await pool.query(
              `SELECT user_id, full_name FROM employees 
               WHERE (LOWER(TRIM(card_name)) = $1 OR LOWER(TRIM(full_name)) = $1)
               AND user_id != $2
               LIMIT 1`,
              [normalizedCardName, apiUserId]
            );

            if (matchingEmployee.rows.length > 0) {
              // Found matching employee by name - update user_id to match API
              const matchedUserId = matchingEmployee.rows[0].user_id;
              const matchedFullName = matchingEmployee.rows[0].full_name;

              console.log(`[API] Matching employee "${matchedFullName}" (${matchedUserId}) with API ID ${apiUserId}`);

              // Update user_id to match API
              await pool.query(
                `UPDATE employees SET user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2`,
                [apiUserId, matchedUserId]
              );

              // Update attendance records
              await pool.query(
                `UPDATE attendance SET user_id = $1 WHERE user_id = $2`,
                [apiUserId, matchedUserId]
              );

              // Update events
              await pool.query(
                `UPDATE events SET user_id = $1 WHERE user_id = $2`,
                [apiUserId, matchedUserId]
              );

              console.log(`[API] ✅ Successfully matched and updated employee ID from ${matchedUserId} to ${apiUserId}`);
            }
          } catch (matchErr) {
            console.error('[API] Error matching employee by name:', matchErr.message);
          }
        }

        // Save to database
        try {
          await saveEmployee(event.data);
        } catch (dbErr) {
          console.error('[DB] Error saving employee to database:', dbErr.message);
        }

        // Calculate lateness based on new rules:
        // Get time settings from database
        let timeSettings = {
          onTimeThreshold: '09:10:00',
          lateThreshold: '12:00:00',
          absentThreshold: '13:00:00',
          departureStartTime: '18:00:00'
        };

        try {
          const settingsResult = await pool.query('SELECT * FROM time_settings ORDER BY id DESC LIMIT 1');
          if (settingsResult.rows.length > 0) {
            const settings = settingsResult.rows[0];
            timeSettings = {
              onTimeThreshold: settings.on_time_threshold,
              lateThreshold: settings.late_threshold,
              absentThreshold: settings.absent_threshold,
              departureStartTime: settings.departure_start_time
            };
          }
        } catch (settingsErr) {
          console.error('[DB] Error loading time settings, using defaults:', settingsErr.message);
        }

        // Parse time thresholds
        const parseTime = (timeStr) => {
          const [hours, minutes] = timeStr.split(':').map(Number);
          return { hours, minutes };
        };

        const onTimeThreshold = parseTime(timeSettings.onTimeThreshold);
        const lateThreshold = parseTime(timeSettings.lateThreshold);
        const absentThreshold = parseTime(timeSettings.absentThreshold);
        const workStartTime = parseTime(timeSettings.onTimeThreshold);
        const departureThreshold = parseTime(timeSettings.departureStartTime || '18:00:00');

        const arrivalTime = new Date(eventWithTimestamp.receivedAt);
        const arrivalDate = new Date(arrivalTime);
        arrivalDate.setHours(0, 0, 0, 0);

        const onTimeDeadline = new Date(arrivalDate);
        onTimeDeadline.setHours(onTimeThreshold.hours, onTimeThreshold.minutes, 0, 0);

        const lateDeadline = new Date(arrivalDate);
        lateDeadline.setHours(lateThreshold.hours, lateThreshold.minutes, 59, 999);

        const absentDeadline = new Date(arrivalDate);
        absentDeadline.setHours(absentThreshold.hours, absentThreshold.minutes, 0, 0);

        const workStart = new Date(arrivalDate);
        workStart.setHours(workStartTime.hours, workStartTime.minutes, 0, 0);

        const departureDeadline = new Date(arrivalDate);
        departureDeadline.setHours(departureThreshold.hours, departureThreshold.minutes, 0, 0);
        const isDeparture = arrivalTime >= departureDeadline;

        let minutesLate = 0;
        let isAbsent = false;

        if (isDeparture) {
          // 18:00 dan keyin kelgan = ketgan, faqat departure_time ni saqlash
          try {
            await saveAttendance(event.data, arrivalTime, 0, false, true);
          } catch (attErr) {
            console.error('[DB] Error saving departure:', attErr.message);
          }
        } else {
          // 00:00 dan 18:00 gacha kelgan = kelgan, arrival_time va status ni saqlash
          if (arrivalTime >= absentDeadline) {
            // Absent threshold dan keyin = kelmaganlar
            isAbsent = true;
            minutesLate = 0;
          } else if (arrivalTime > onTimeDeadline) {
            // OnTime threshold dan keyin, late threshold gacha = kech qolganlar
            minutesLate = Math.floor((arrivalTime - workStart) / (1000 * 60));
            if (minutesLate < 0) minutesLate = 0;
          } else {
            // OnTime threshold gacha = vaqtida kelganlar
            minutesLate = 0;
          }

          // Save attendance record
          try {
            await saveAttendance(event.data, arrivalTime, minutesLate, isAbsent, false);
          } catch (attErr) {
            console.error('[DB] Error saving attendance:', attErr.message);
          }
        }
      }
    } catch (err) {
      console.error('[DB] Error saving event to database:', err.message);
      dbAvailable = false; // Mark as unavailable
    }
  }

  // Broadcast to all SSE clients immediately (synchronous, no delay)
  const message = `data: ${JSON.stringify(eventWithTimestamp)}\n\n`;
  let sentCount = 0;
  sseClients.forEach(client => {
    try {
      // Write immediately without buffering
      client.write(message);
      sentCount++;
    } catch (err) {
      // Client disconnected, remove from set
      sseClients.delete(client);
    }
  });

  if (sentCount > 0) {
    console.log(`[Broadcast] ✅ Event sent to ${sentCount} client(s) - UserID: ${event.data?.UserID || 'N/A'}`);
  }
}

// Parse Dahua event stream - handles multi-line JSON in data field
function parseDahuaEvent(lines) {
  if (!lines || lines.length === 0) {
    return null;
  }

  // Join all lines - preserve spaces but normalize newlines
  const fullText = Array.isArray(lines) ? lines.join('\n') : String(lines);

  if (!fullText.trim()) {
    return null;
  }

  // Parse format: Code=AccessControl;action=Pulse;index=0;data={...json...}
  const event = {};

  // Find where data= starts
  const dataIndex = fullText.indexOf('data={');
  if (dataIndex === -1) {
    return null; // No data field found
  }

  // Parse fields before data=
  const beforeData = fullText.substring(0, dataIndex);
  const parts = beforeData.split(';');

  for (const part of parts) {
    const trimmedPart = part.trim();
    if (!trimmedPart) continue;

    const equalIndex = trimmedPart.indexOf('=');
    if (equalIndex === -1) continue;

    const key = trimmedPart.substring(0, equalIndex).trim();
    const value = trimmedPart.substring(equalIndex + 1).trim();

    if (key && value) {
      event[key.toLowerCase()] = value;
    }
  }

  // Extract JSON data part - everything after "data="
  const dataPrefix = 'data=';
  const jsonStart = dataIndex + dataPrefix.length; // Keep the opening "{"
  let jsonText = fullText.substring(jsonStart).trim();

  // Find the matching closing brace for the JSON object
  let braceCount = 0;
  let jsonEnd = -1;

  for (let i = 0; i < jsonText.length; i++) {
    const char = jsonText[i];
    if (char === '{') {
      braceCount++;
    } else if (char === '}') {
      braceCount--;
    }

    if (braceCount === 0 && jsonEnd === -1) {
      jsonEnd = i;
      break;
    }
  }

  if (jsonEnd === -1) {
    // Incomplete JSON - try to parse what we have
    console.warn(`[Parse Warning] Incomplete JSON in event: ${event.code || 'Unknown'}`);
    // Try to parse anyway if we have at least some JSON
    if (jsonText.length > 0 && jsonText.includes('{')) {
      try {
        // Try to find last closing brace
        const lastBrace = jsonText.lastIndexOf('}');
        if (lastBrace > 0) {
          const jsonString = jsonText.substring(0, lastBrace + 1);
          const parsed = JSON.parse(jsonString);
          event.data = parsed;
          if (event.code && event.data) {
            return event;
          }
        }
      } catch (e) {
        // Ignore parse errors for incomplete JSON
      }
    }
    return null;
  }

  // Extract the JSON string (including the closing brace)
  const jsonString = jsonText.substring(0, jsonEnd + 1);

  // Try to parse JSON
  try {
    const parsed = JSON.parse(jsonString);
    event.data = parsed;
  } catch (e) {
    // If JSON parsing fails, log and return null
    console.error(`[Parse Error] Failed to parse JSON for ${event.code || 'Unknown'}: ${e.message}`);
    console.error(`[Parse Error] JSON string (first 300 chars): ${jsonString.substring(0, 300)}`);
    return null;
  }

  // Only return if we have at least code and data
  if (!event.code || !event.data) {
    return null;
  }

  return event;
}

// Start Dahua stream connection
let curlProcess = null;
let reconnectTimeout = null;

function startDahuaStream() {
  // Clear any existing reconnect timeout
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  // Kill existing process if any
  if (curlProcess) {
    curlProcess.kill();
    curlProcess = null;
  }

  const url = `http://${DAHUA_IP}/cgi-bin/eventManager.cgi?action=attach&codes=%5BAll%5D`;
  const args = [
    '--digest',
    '-u',
    `${DAHUA_USER}:${DAHUA_PASS}`,
    '-N',  // No buffering - output immediately
    '-s',  // Silent mode - disable progress meter
    '-S',  // Show errors only
    url
  ];

  console.log(`[Dahua] Connecting to ${DAHUA_IP}...`);
  curlProcess = spawn('curl', args, {
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    // Force unbuffered output
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });

  // Set stdout to unbuffered mode
  if (curlProcess.stdout && curlProcess.stdout.setEncoding) {
    curlProcess.stdout.setEncoding('utf8');
  }

  // Force immediate flush on Windows
  if (curlProcess.stdout && curlProcess.stdout._handle) {
    curlProcess.stdout._handle.setBlocking(false);
  }

  let rawBuffer = '';
  let currentEvent = [];
  let inEvent = false;
  let jsonBraceCount = 0;

  curlProcess.stdout.on('data', (chunk) => {
    const chunkStr = chunk.toString();
    rawBuffer += chunkStr;

    // Process immediately - don't wait for complete chunks
    // Process complete lines (handle both \n and \r\n)
    let newlineIndex = rawBuffer.indexOf('\n');

    while (newlineIndex !== -1) {
      const line = rawBuffer.substring(0, newlineIndex).replace(/\r$/, '');
      rawBuffer = rawBuffer.substring(newlineIndex + 1);

      const trimmed = line.trim();

      // Skip boundary, headers, and empty lines
      if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('Content-Type') || trimmed.startsWith('Content-Length')) {
        // If we were collecting an event, try to parse it immediately
        if (inEvent && currentEvent.length > 0) {
          const event = parseDahuaEvent(currentEvent);
          if (event && event.code === 'AccessControl') {
            console.log(`[Event] ✅ ${event.code}: ${event.action || 'Unknown'} - UserID: ${event.data?.UserID || 'N/A'}`);
            addEvent(event);
          }
          currentEvent = [];
          inEvent = false;
          jsonBraceCount = 0;
        }
        newlineIndex = rawBuffer.indexOf('\n');
        continue;
      }

      // Check if this line starts a new event
      if (trimmed.includes('Code=') && trimmed.includes('data={')) {
        // Finalize previous event if exists
        if (inEvent && currentEvent.length > 0) {
          const event = parseDahuaEvent(currentEvent);
          if (event && event.code === 'AccessControl') {
            console.log(`[Event] ✅ ${event.code}: ${event.action || 'Unknown'} - UserID: ${event.data?.UserID || 'N/A'}`);
            addEvent(event);
          }
        }
        // Start new event
        currentEvent = [line];
        inEvent = true;
        // Count braces: we have one opening brace from data={
        jsonBraceCount = 1;
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        jsonBraceCount += (openBraces - 1) - closeBraces; // -1 because we already counted data={

        // If event is complete on single line, parse immediately
        if (jsonBraceCount <= 0) {
          const event = parseDahuaEvent(currentEvent);
          if (event && event.code === 'AccessControl') {
            console.log(`[Event] ✅ ${event.code}: ${event.action || 'Unknown'} - UserID: ${event.data?.UserID || 'N/A'}`);
            addEvent(event);
          }
          currentEvent = [];
          inEvent = false;
          jsonBraceCount = 0;
        }
      } else if (inEvent) {
        // Continue collecting event lines
        currentEvent.push(line);
        // Update brace count
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        jsonBraceCount += (openBraces - closeBraces);

        // If braces are balanced, event is complete - parse immediately
        if (jsonBraceCount <= 0) {
          const event = parseDahuaEvent(currentEvent);
          if (event && event.code === 'AccessControl') {
            console.log(`[Event] ✅ ${event.code}: ${event.action || 'Unknown'} - UserID: ${event.data?.UserID || 'N/A'}`);
            addEvent(event);
          }
          currentEvent = [];
          inEvent = false;
          jsonBraceCount = 0;
        }
      }

      newlineIndex = rawBuffer.indexOf('\n');
    }

    // If buffer is getting too large, try to process incomplete events
    if (rawBuffer.length > 10000 && inEvent && currentEvent.length > 0) {
      console.log(`[Stream] Warning: Large buffer (${rawBuffer.length} bytes), attempting to parse incomplete event`);
      const event = parseDahuaEvent(currentEvent);
      if (event && event.code === 'AccessControl') {
        console.log(`[Event] ✅ ${event.code}: ${event.action || 'Unknown'} - UserID: ${event.data?.UserID || 'N/A'}`);
        addEvent(event);
        currentEvent = [];
        inEvent = false;
        jsonBraceCount = 0;
        rawBuffer = ''; // Clear buffer after parsing
      }
    }
  });

  curlProcess.stderr.on('data', (data) => {
    const message = data.toString();
    // With -s and -S flags, stderr should only contain real errors
    // Log only if it's not empty and doesn't look like progress output
    const trimmed = message.trim();
    if (trimmed && !trimmed.match(/^\d+\s+\d+[km]?\s+\.\.\.\s+\d+/)) {
      console.error(`[Dahua Error] ${trimmed}`);
    }
  });

  curlProcess.on('error', (error) => {
    console.error(`[Dahua] Process error: ${error.message}`);
    if (error.code === 'ENOENT') {
      console.error('[Dahua] curl not found. Add "RUN apk add --no-cache curl" to Dockerfile, then rebuild.');
    }
    scheduleReconnect();
  });

  curlProcess.on('exit', (code, signal) => {
    console.log(`[Dahua] Process exited with code ${code}, signal ${signal}`);
    curlProcess = null;
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimeout) {
    return; // Already scheduled
  }

  console.log('[Dahua] Scheduling reconnect in 5 seconds...');
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    startDahuaStream();
  }, 5000);
}

// Handle Dahua Webhook Logic
function handleDahuaWebhook(req, res) {
  console.log(`📥 WEBHOOK HIT: ${req.method} ${req.path} from ${req.ip}`);
  // Log headers for debugging
  // console.log(`[Headers] Content-Type: ${req.headers['content-type']}`);

  // data can be in req.body (JSON) or partially in req.body and req.files (Multipart)
  let data = req.body;

  // If multipart, sometimes the JSON is in a field named 'info' or similar
  if (req.body.info && typeof req.body.info === 'string') {
    try {
      data = JSON.parse(req.body.info);
    } catch (e) { }
  } else if (req.body.event && typeof req.body.event === 'string') {
    try {
      data = JSON.parse(req.body.event);
    } catch (e) { }
  }

  // Log files received
  if (req.files && req.files.length > 0) {
    console.log(`[Webhook] Received ${req.files.length} files`);
  }

  const event = {
    code: data.Code || data.code || 'AccessControl',
    action: data.Action || data.action || 'Pulse',
    index: data.Index !== undefined ? data.Index : (data.index !== undefined ? data.index : 0),
    receivedAt: new Date().toISOString(),
    data: data.Data || data.data || data
  };

  // If we have a file and it's an image, attach it as base64 if not already present
  if (req.files && req.files.length > 0) {
    const photoFile = req.files.find(f => f.mimetype.startsWith('image/'));
    if (photoFile && !event.data.photo_base64 && !event.data.FaceImageUrl) {
      event.data.photo_base64 = photoFile.buffer.toString('base64');
    }
  }

  // Ensure critical fields are accessible at top level of event.data for addEvent
  if (!event.data.UserID && (data.UserID || data.userid || data.userId)) {
    event.data.UserID = data.UserID || data.userid || data.userId;
  }
  if (!event.data.CardName && (data.CardName || data.cardname || data.cardName)) {
    event.data.CardName = data.CardName || data.cardname || data.cardName;
  }

  console.log(`[Webhook] Processing event: ${event.code} for User: ${event.data?.UserID || 'Unknown'}`);
  addEvent(event);

  res.status(200).json({ success: true, message: "Event received" });
}

// Start the server
async function startServer() {
  try {
    // Initialize database (don't crash if DB is not available)
    try {
      // Test database connection first
      await pool.query('SELECT NOW()');
      console.log('[DB] Database connection successful');

      await initDatabase();
      console.log('[DB] Database initialized');
    } catch (dbErr) {
      console.error('[DB] Database initialization failed:', dbErr.message);
      console.error('[DB] Full error:', dbErr);
      console.log('[DB] ⚠️  Server will continue, but login will not work without database.');
      console.log('[DB] Please check:');
      console.log('[DB]   1. PostgreSQL is running');
      console.log('[DB]   2. Database "facecontrol" exists');
      console.log('[DB]   3. .env file has correct DB credentials');
    }

    // Start server
    const server = app.listen(PORT, () => {
      console.log(`[Server] Listening on http://localhost:${PORT}`);
      console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
      console.log(`[Server] Login: http://localhost:${PORT}/login.html`);
      console.log(`[Server] Dashboard: http://localhost:${PORT}`);
      console.log(`[Server] Events API: http://localhost:${PORT}/api/events (protected)`);
      console.log(`[Server] Realtime SSE: http://localhost:${PORT}/api/realtime (protected)`);

      // Start Dahua stream connection
      startDahuaStream();
    });
    
    // Store server reference for graceful shutdown
    global.server = server;
  } catch (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);
  
  // Stop accepting new requests
  const server = global.server;
  if (server) {
    server.close(() => {
      console.log('[Server] HTTP server closed');
    });
  }
  
  // Stop Dahua stream
  if (curlProcess) {
    curlProcess.kill();
    curlProcess = null;
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  
  // Close SSE connections
  sseClients.forEach(client => {
    try {
      client.end();
    } catch (err) {
      // Ignore errors
    }
  });
  sseClients.clear();
  
  // Close database pool
  try {
    await closePool();
  } catch (err) {
    console.error('[Server] Error closing database pool:', err.message);
  }
  
  // Exit process
  setTimeout(() => {
    console.log('[Server] Shutdown complete');
    process.exit(0);
  }, 1000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit on unhandled rejection, just log it
});

