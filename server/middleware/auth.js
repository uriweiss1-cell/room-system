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

function requireAdmin(req, res, next) {
  if (!req.user?.can_admin && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'הרשאת מנהל נדרשת' });
  }
  next();
}

module.exports = { authenticate, requireAdmin, JWT_SECRET };
