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

// Full admin only (role === 'admin'). Use for destructive / system operations.
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'הרשאת מנהל ראשי נדרשת' });
  }
  next();
}

// Granular permission check. Full admin always passes; otherwise checks perm_<perm> flag.
// Valid perms: 'assignments' | 'algorithm' | 'requests' | 'users' | 'rooms'
function requirePerm(perm) {
  return (req, res, next) => {
    const u = req.user;
    if (!u) return res.status(401).json({ error: 'נדרשת התחברות' });
    if (u.role === 'admin') return next();
    if (u[`perm_${perm}`]) return next();
    return res.status(403).json({ error: 'אין הרשאה לפעולה זו' });
  };
}

module.exports = { authenticate, requireAdmin, requirePerm, JWT_SECRET };
