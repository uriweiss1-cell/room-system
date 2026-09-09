const express = require('express');
const bcrypt = require('bcryptjs');
const { Document, Paragraph, TextRun, AlignmentType, HeadingLevel, Packer } = require('docx');
const { db, nextId } = require('../database');
const { authenticate, requireAdmin, requirePerm, requirePermOrRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const safe = u => { const { password_hash, pin_hash, ...rest } = u; return rest; };

router.get('/', requirePermOrRole('users', 'secretary'), (req, res) => {
  res.json(db.get('users').value().map(safe));
});

router.get('/list/active', (req, res) => {
  res.json(db.get('users').filter(u => u.is_active && u.role !== 'admin').map(u => ({ id: u.id, name: u.name, role: u.role })).value());
});

router.get('/:id', requirePerm('users'), (req, res) => {
  const u = db.get('users').find({ id: +req.params.id }).value();
  if (!u) return res.status(404).json({ error: 'משתמש לא נמצא' });
  res.json(safe(u));
});

router.post('/', requirePerm('users'), (req, res) => {
  const { name, email, password, role, work_percentage, phone, notes,
          perm_assignments, perm_algorithm, perm_requests, perm_users, perm_rooms,
          perm_guest } = req.body;
  const resolvedEmail = email || `${name.replace(/[\s'.\/]/g, '_')}_${Date.now()}@clinic.local`;
  if (db.get('users').find({ email: resolvedEmail }).value()) {
    return res.status(400).json({ error: 'כתובת האימייל כבר קיימת' });
  }
  const tempPw = password || 'changeme123';
  // Admin perms (determine can_admin)
  const adminPerms = { perm_assignments: !!perm_assignments, perm_algorithm: !!perm_algorithm, perm_requests: !!perm_requests, perm_users: !!perm_users, perm_rooms: !!perm_rooms };
  const can_admin = Object.values(adminPerms).some(Boolean);
  // Employee-level perms (do NOT affect can_admin)
  const perms = { ...adminPerms, perm_guest: !!perm_guest };
  const user = {
    id: nextId('users'), name, email: resolvedEmail,
    password_hash: bcrypt.hashSync(tempPw, 10),
    role, work_percentage: work_percentage ?? 100,
    phone: phone || null, notes: notes || null,
    is_active: true, can_admin,
    ...perms,
    created_at: new Date().toISOString(),
  };
  db.get('users').push(user).write();
  res.json({ id: user.id, tempPassword: password ? undefined : tempPw });
});

router.put('/:id', requirePerm('users'), (req, res) => {
  const { name, email, role, work_percentage, phone, notes, is_active, password,
          perm_assignments, perm_algorithm, perm_requests, perm_users, perm_rooms,
          perm_guest } = req.body;
  const adminPerms = { perm_assignments: !!perm_assignments, perm_algorithm: !!perm_algorithm, perm_requests: !!perm_requests, perm_users: !!perm_users, perm_rooms: !!perm_rooms };
  const can_admin = Object.values(adminPerms).some(Boolean);
  const perms = { ...adminPerms, perm_guest: !!perm_guest };
  const update = { name, email, role, work_percentage, phone: phone || null, notes: notes || null, is_active: !!is_active, can_admin, ...perms };
  if (password) update.password_hash = bcrypt.hashSync(password, 10);
  db.get('users').find({ id: +req.params.id }).assign(update).write();
  res.json({ message: 'עודכן בהצלחה' });
});

router.delete('/:id', requirePerm('users'), (req, res) => {
  const uid = +req.params.id;
  db.get('room_assignments').remove({ user_id: uid }).write();
  db.get('regular_schedules').remove({ user_id: uid }).write();
  db.get('one_time_requests').remove({ user_id: uid }).write();
  db.get('notifications').remove({ user_id: uid }).write();
  db.get('users').remove({ id: uid }).write();
  res.json({ message: 'העובד נמחק מהמערכת' });
});

// Admin: set or clear employee PIN
router.post('/:id/reset-pin', requirePerm('users'), (req, res) => {
  const { pin } = req.body;
  if (pin !== undefined && pin !== '' && !/^\d{4}$/.test(String(pin))) {
    return res.status(400).json({ error: 'PIN חייב להיות 4 ספרות' });
  }
  const update = (pin && pin !== '') ? { pin_hash: bcrypt.hashSync(String(pin), 10) } : { pin_hash: null };
  db.get('users').find({ id: +req.params.id }).assign(update).write();
  res.json({ ok: true });
});

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];

router.get('/work-days-report', requirePerm('users'), async (req, res) => {
  const users = db.get('users').filter(u => u.is_active !== false && u.role !== 'art_therapist').value();
  const schedules = db.get('regular_schedules').value();

  const rows = users
    .map(u => {
      const days = [...new Set(
        schedules.filter(s => s.user_id === u.id).map(s => s.day_of_week)
      )].sort((a, b) => a - b);
      return { name: u.name, days };
    })
    .filter(r => r.days.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));

  const today = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: 'ימי עבודה — עובדים פעילים',
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
        }),
        new Paragraph({
          children: [new TextRun({ text: `עודכן: ${today}`, color: '888888', size: 20 })],
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
        }),
        new Paragraph({ text: '' }),
        ...rows.map(r => new Paragraph({
          children: [
            new TextRun({ text: `${r.name}: `, bold: true, rightToLeft: true }),
            new TextRun({ text: r.days.map(d => DAYS_HE[d]).join(', '), rightToLeft: true }),
          ],
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
        })),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', 'attachment; filename="work-days.docx"');
  res.send(buffer);
});

module.exports = router;
