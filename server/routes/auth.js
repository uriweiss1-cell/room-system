const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const os = require('os');
const { db } = require('../database');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// Admin login (password required)
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.get('users').find({ email, is_active: true }).value();
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
  const { password_hash, ...safe } = user;
  res.json({ token, user: safe });
});

// Employee login — name + PIN
router.post('/login-simple', (req, res) => {
  const { userId, pin } = req.body;
  const user = db.get('users').find({ id: +userId, is_active: true }).value();
  if (!user) return res.status(404).json({ error: 'משתמש לא נמצא' });
  if (user.role === 'admin' || user.can_admin) {
    return res.status(403).json({ error: 'מנהלים מתחברים עם סיסמה' });
  }
  if (!user.pin_hash) {
    return res.status(401).json({ error: 'אין PIN מוגדר', needsSetPin: true });
  }
  if (!pin) {
    return res.status(401).json({ error: 'נדרש קוד PIN', needsPin: true });
  }
  if (!bcrypt.compareSync(String(pin), user.pin_hash)) {
    return res.status(401).json({ error: 'קוד PIN שגוי' });
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
  const { password_hash, pin_hash, ...safe } = user;
  res.json({ token, user: safe });
});

// First-time PIN setup (public — only works if user has no PIN yet)
router.post('/set-pin-first', (req, res) => {
  const { userId, pin } = req.body;
  if (!/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: 'PIN חייב להיות 4 ספרות' });
  const user = db.get('users').find({ id: +userId, is_active: true }).value();
  if (!user) return res.status(404).json({ error: 'משתמש לא נמצא' });
  if (user.pin_hash) return res.status(400).json({ error: 'PIN כבר מוגדר' });
  db.get('users').find({ id: +userId }).assign({ pin_hash: bcrypt.hashSync(String(pin), 10) }).write();
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
  const { password_hash, pin_hash, ...safe } = { ...user };
  res.json({ token, user: safe });
});

// Public list of employees for login page
router.get('/users-list', (req, res) => {
  const users = db.get('users')
    .filter(u => u.is_active && u.role !== 'admin')
    .map(u => ({ id: u.id, name: u.name, has_pin: !!u.pin_hash }))
    .sortBy('name')
    .value();
  res.json(users);
});

// Network IP for sharing the link
router.get('/network-info', (req, res) => {
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter(i => i.family === 'IPv4' && !i.internal)
    .map(i => i.address);
  res.json({ ips });
});

router.get('/me', authenticate, (req, res) => {
  const { password_hash, ...safe } = req.user;
  res.json(safe);
});

module.exports = router;
