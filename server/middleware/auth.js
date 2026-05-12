const jwt = require('jsonwebtoken');
const { db } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'room-system-secret-2024';

function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'נדרשת התחברות' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.get('users').find({ id: payload.userId, is_active: true }).value();
    if (!user) return res.status(401).json({ error: 'משתמש לא נמצא' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'טוקן לא תקין' });
  }
}

const PERM_KEYS = ['assignments', 'algorithm', 'requests', 'users', 'rooms'];

// Returns true for legacy can_admin users who haven't been migrated to the new perm flags yet.
// Once any perm flag is explicitly set on the user, legacy mode is off.
function isLegacyAdmin(u) {
  return !!u?.can_admin && !PERM_KEYS.some(p => u[`perm_${p}`]);
}

// Full admin only (role === 'admin') OR legacy can_admin. Use for destructive / system operations.
function requireAdmin(req, res, next) {
  const u = req.user;
  if (u?.role === 'admin' || isLegacyAdmin(u)) return next();
  return res.status(403).json({ error: 'הרשאת מנהל ראשי נדרשת' });
}

// Granular permission check. Full admin and legacy can_admin always pass.
// Valid perms: 'assignments' | 'algorithm' | 'requests' | 'users' | 'rooms'
function requirePerm(perm) {
  return (req, res, next) => {
    const u = req.user;
    if (!u) return res.status(401).json({ error: 'נדרשת התחברות' });
    if (u.role === 'admin') return next();
    if (isLegacyAdmin(u)) return next();   // backward compat
    if (u[`perm_${perm}`]) return next();
    return res.status(403).json({ error: 'אין הרשאה לפעולה זו' });
  };
}

module.exports = { authenticate, requireAdmin, requirePerm, JWT_SECRET };
