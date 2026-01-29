const bcrypt = require('bcryptjs');
let dbAvailable = true;

// Fallback users (if database is not available)
const FALLBACK_USERS = [
  { username: 'superadmin', password: 'superadmin123', fullName: 'Super Administrator', role: 'superadmin' },
  { username: 'admin', password: 'admin123', fullName: 'Administrator', role: 'admin' }
];

// Test database connection
async function testDatabase() {
  try {
    const { pool } = require('./database');
    await pool.query('SELECT NOW()');
    dbAvailable = true;
    return true;
  } catch (err) {
    dbAvailable = false;
    console.log('[Auth] Database not available, using fallback authentication');
    return false;
  }
}

// Login user
async function loginUser(username, password) {
  // Test database first
  if (dbAvailable) {
    try {
      const { pool } = require('./database');
      const result = await pool.query(
        'SELECT id, username, password, full_name, role FROM users WHERE username = $1',
        [username]
      );

      if (result.rows.length > 0) {
        const user = result.rows[0];
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (isValidPassword) {
          return {
            success: true,
            user: {
              id: user.id,
              username: user.username,
              fullName: user.full_name,
              role: user.role
            }
          };
        }
      }
    } catch (err) {
      console.error('[Auth] Database login error:', err.message);
      // Fall through to fallback
      dbAvailable = false;
    }
  }

  // Fallback: check against fallback users (if database is not available)
  const fallback = FALLBACK_USERS.find(u => u.username === username && u.password === password);
  if (fallback) {
    console.log('[Auth] Using fallback authentication (database not available)');
    return {
      success: true,
      user: {
        id: 0,
        username: fallback.username,
        fullName: fallback.fullName,
        role: fallback.role
      }
    };
  }

  return { success: false, message: 'Invalid username or password' };
}

// Initialize: test database on load
testDatabase().catch(() => {
  dbAvailable = false;
});

// Check if user is authenticated (middleware helper)
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Unauthorized' });
}

// Check if user is admin (or superadmin)
function requireAdmin(req, res, next) {
  if (req.session && req.session.user) {
    const role = (req.session.user.role || '').toString().toLowerCase();
    const username = (req.session.user.username || '').toString().toLowerCase();
    if (role === 'admin' || role === 'superadmin' || username === 'admin' || username === 'superadmin') {
      return next();
    }
  }
  return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
}

module.exports = { loginUser, requireAuth, requireAdmin };

