const express = require('express');
const bcrypt = require('bcryptjs');
const { db, nextId } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const safe = u => { const { password_hash, pin_hash, ...rest } = u; return rest; };

router.get('/', requireAdmin, (req, res) => {
  res.json(db.get('users').value().map(safe));
});

router.get('/list/active', (req, res) => {
  res.json(db.get('users').filter(u => u.is_active && u.role !== 'admin').map(u => ({ id: u.id, name: u.name, role: u.role })).value());
});

router.get('/:id', requireAdmin, (req, res) => {
  const u = db.get('users').find({ id: +req.params.id }).value();
  if (!u) return res.status(404).json({ error: 'משתמש לא נמצא' });
  res.json(safe(u));
});

router.post('/', requireAdmin, (req, res) => {
  const { name, email, password, role, work_percentage, phone, notes, can_admin } = req.body;
  const resolvedEmail = email || `${name.replace(/[\s'.\/]/g, '_')}_${Date.now()}@clinic.local`;
  if (db.get('users').find({ email: resolvedEmail }).value()) {
    return res.status(400).json({ error: 'כתובת האימייל כבר קיימת' });
  }
  const tempPw = password || 'changeme123';
  const user = {
    id: nextId('users'), name, email: resolvedEmail,
    password_hash: bcrypt.hashSync(tempPw, 10),
    role, work_percentage: work_percentage ?? 100,
    phone: phone || null, notes: notes || null,
    is_active: true, can_admin: !!can_admin,
    created_at: new Date().toISOString(),
  };
  db.get('users').push(user).write();
  res.json({ id: user.id, tempPassword: password ? undefined : tempPw });
});

router.put('/:id', requireAdmin, (req, res) => {
  const { name, email, role, work_percentage, phone, notes, is_active, can_admin, password } = req.body;
  const update = { name, email, role, work_percentage, phone: phone || null, notes: notes || null, is_active: !!is_active, can_admin: !!can_admin };
  if (password) update.password_hash = bcrypt.hashSync(password, 10);
  db.get('users').find({ id: +req.params.id }).assign(update).write();
  res.json({ message: 'עודכן בהצלחה' });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const uid = +req.params.id;
  db.get('room_assignments').remove({ user_id: uid }).write();
  db.get('regular_schedules').remove({ user_id: uid }).write();
  db.get('one_time_requests').remove({ user_id: uid }).write();
  db.get('notifications').remove({ user_id: uid }).write();
  db.get('users').remove({ id: uid }).write();
  res.json({ message: 'העובד נמחק מהמערכת' });
});

// Admin: set or clear employee PIN
router.post('/:id/reset-pin', requireAdmin, (req, res) => {
  const { pin } = req.body;
  if (pin !== undefined && pin !== '' && !/^\d{4}$/.test(String(pin))) {
    return res.status(400).json({ error: 'PIN חייב להיות 4 ספרות' });
  }
  const update = (pin && pin !== '') ? { pin_hash: bcrypt.hashSync(String(pin), 10) } : { pin_hash: null };
  db.get('users').find({ id: +req.params.id }).assign(update).write();
  res.json({ ok: true });
});

module.exports = router;
