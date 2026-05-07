const express = require('express');
const { db, nextId } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function getSchedule(userId) {
  return db.get('regular_schedules').filter({ user_id: userId }).value().map(s => {
    const room = s.preferred_room_id ? db.get('rooms').find({ id: +s.preferred_room_id }).value() : null;
    return { ...s, room_name: room?.name || null };
  });
}

function saveSchedule(userId, schedules) {
  db.get('regular_schedules').remove({ user_id: userId }).write();
  schedules.forEach(s => {
    db.get('regular_schedules').push({
      id: nextId('regular_schedules'),
      user_id: userId,
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      preferred_room_id: s.preferred_room_id || null,
    }).write();
  });

  // Auto-sync permanent room_assignments to match the new schedule
  const assignments = db.get('room_assignments')
    .filter({ user_id: userId, assignment_type: 'permanent' })
    .value();

  const newDays = new Set(schedules.map(s => s.day_of_week));

  // Remove assignments for days no longer in schedule
  assignments.forEach(a => {
    if (!newDays.has(a.day_of_week)) {
      db.get('room_assignments').remove({ id: a.id }).write();
    }
  });

  // Update hours for days still in schedule
  schedules.forEach(slot => {
    const dayAssignments = assignments.filter(a => a.day_of_week === slot.day_of_week);
    dayAssignments.forEach(a => {
      db.get('room_assignments').find({ id: a.id }).assign({
        start_time: slot.start_time,
        end_time: slot.end_time,
      }).write();
    });
  });
}

router.get('/my', (req, res) => res.json(getSchedule(req.user.id)));

router.put('/my', (req, res) => {
  saveSchedule(req.user.id, req.body.schedules ?? []);
  res.json({ message: 'לוח הזמנים עודכן' });
});

router.get('/user/:userId', requireAdmin, (req, res) => res.json(getSchedule(+req.params.userId)));

router.put('/user/:userId', requireAdmin, (req, res) => {
  saveSchedule(+req.params.userId, req.body.schedules ?? []);
  res.json({ message: 'לוח הזמנים עודכן' });
});

// Delete all auto-imported schedules (those with no preferred_room_id set).
// Used to clean up after a bad import run that auto-created empty schedules.
router.delete('/clear-auto-imported', requireAdmin, (req, res) => {
  const removed = db.get('regular_schedules')
    .remove(s => s.preferred_room_id === null || s.preferred_room_id === undefined || s.preferred_room_id === '')
    .write();
  res.json({ message: `נמחקו ${removed.length} לוחות זמנים שנוצרו אוטומטית` });
});

router.get('/all', requireAdmin, (req, res) => {
  const schedules = db.get('regular_schedules').value().map(s => {
    const user = db.get('users').find({ id: s.user_id }).value();
    const room = s.preferred_room_id ? db.get('rooms').find({ id: +s.preferred_room_id }).value() : null;
    return { ...s, user_name: user?.name, role: user?.role, room_name: room?.name || null };
  }).filter(s => s.user_name);
  res.json(schedules);
});

module.exports = router;
