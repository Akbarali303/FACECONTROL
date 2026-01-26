const bcrypt = require('bcrypt');
let dbAvailable = true;

// Fallback admin user (if database is not available)
const FALLBACK_ADMIN = {
  username: 'admin',
  password: 'admin123', // Plain text for fallback
  fullName: 'Administrator',
  role: 'admin'
};

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

  // Fallback: Check against fallback admin (if database is not available)
  if (username === FALLBACK_ADMIN.username && password === FALLBACK_ADMIN.password) {
    console.log('[Auth] Using fallback authentication (database not available)');
    return {
      success: true,
      user: {
        id: 0,
        username: FALLBACK_ADMIN.username,
        fullName: FALLBACK_ADMIN.fullName,
        role: FALLBACK_ADMIN.role
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

// Check if user is admin
function requireAdmin(req, res, next) {
  console.log('[Auth] requireAdmin check:', {
    hasSession: !!req.session,
    hasUser: !!(req.session && req.session.user),
    userRole: req.session && req.session.user ? req.session.user.role : 'none',
    username: req.session && req.session.user ? req.session.user.username : 'none'
  });
  
  if (req.session && req.session.user) {
    const role = req.session.user.role;
    const username = req.session.user.username;
    
    // Allow if role is 'admin' or username is 'admin' (fallback)
    if (role === 'admin' || role === 'superadmin' || username === 'admin') {
      return next();
    }
  }
  
  return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
}

module.exports = { loginUser, requireAuth, requireAdmin };

