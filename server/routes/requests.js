const express = require('express');
const { db, nextId } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const overlap = (s1, e1, s2, e2) => toMin(s1) < toMin(e2) && toMin(e1) > toMin(s2);

function enrich(r) {
  const user = db.get('users').find({ id: r.user_id }).value();
  const room = r.assigned_room_id ? db.get('rooms').find({ id: r.assigned_room_id }).value() : null;
  return { ...r, user_name: user?.name, role: user?.role, room_name: room?.name || null };
}

router.get('/my', (req, res) => {
  const list = db.get('one_time_requests').filter({ user_id: req.user.id }).value().map(enrich).reverse();
  res.json(list);
});

router.get('/all', requireAdmin, (req, res) => {
  res.json(db.get('one_time_requests').value().map(enrich).reverse());
});

router.post('/', (req, res) => {
  const { request_type, specific_date, day_of_week, start_time, end_time, notes } = req.body;

  const r = {
    id: nextId('one_time_requests'),
    user_id: req.user.id,
    request_type,
    specific_date,
    day_of_week: day_of_week ?? null,
    start_time: start_time || null,
    end_time: end_time || null,
    status: 'pending',
    assigned_room_id: null,
    notes: notes || null,
    admin_response: null,
    created_at: new Date().toISOString(),
  };
  db.get('one_time_requests').push(r).write();

  if (request_type === 'absence') {
    db.get('one_time_requests').find({ id: r.id }).assign({ status: 'assigned' }).write();
    return res.json({ requestId: r.id, message: 'ההיעדרות נרשמה בהצלחה' });
  }

  if (request_type === 'permanent_request') {
    return res.json({ requestId: r.id, message: 'הבקשה הועברה למנהל לאישור' });
  }

  if (request_type === 'library_request') {
    const libraryRoom = db.get('rooms').find({ room_type: 'library', is_active: true }).value();
    if (!libraryRoom) return res.status(400).json({ error: 'לא הוגדרה ספריה במערכת. פנה למנהל.' });
    const dayOfWeek = new Date(specific_date).getDay();
    const permBusy = db.get('room_assignments').filter({ room_id: libraryRoom.id, day_of_week: dayOfWeek }).value();
    const otBusy = db.get('one_time_requests').filter(x => x.specific_date === specific_date && x.status === 'assigned' && x.assigned_room_id === libraryRoom.id).value();
    const conflict = [
      ...permBusy.filter(b => overlap(start_time, end_time, b.start_time, b.end_time)),
      ...otBusy.filter(b => b.start_time && overlap(start_time, end_time, b.start_time, b.end_time)),
    ];
    if (conflict.length > 0) {
      db.get('one_time_requests').remove({ id: r.id }).write();
      const names = conflict.map(b => { const u = db.get('users').find({ id: b.user_id }).value(); return `${u?.name} (${b.start_time}–${b.end_time})`; }).join(', ');
      return res.status(409).json({ error: `הספריה תפוסה בשעות אלו: ${names}` });
    }
    db.get('one_time_requests').find({ id: r.id }).assign({ assigned_room_id: libraryRoom.id, status: 'assigned' }).write();
    return res.json({ requestId: r.id, message: `הספריה שובצה לך לתאריך ${specific_date} בין ${start_time}–${end_time}` });
  }

  // room_request — find available rooms
  const dayOfWeek = new Date(specific_date).getDay();
  const permBusy = db.get('room_assignments').filter({ assignment_type: 'permanent', day_of_week: dayOfWeek }).value();
  const otBusy = db.get('one_time_requests').filter(x => x.specific_date === specific_date && x.status === 'assigned' && x.assigned_room_id).value();

  const available = db.get('rooms').filter({ is_active: true, room_type: 'regular' }).value().filter(room => {
    const busy = [
      ...permBusy.filter(b => b.room_id === room.id),
      ...otBusy.filter(b => b.assigned_room_id === room.id),
    ];
    return !busy.some(b => overlap(start_time, end_time, b.start_time, b.end_time));
  });

  res.json({ requestId: r.id, availableRooms: available });
});

router.post('/:id/confirm', (req, res) => {
  const { room_id } = req.body;
  const r = db.get('one_time_requests').find({ id: +req.params.id, user_id: req.user.id }).value();
  if (!r) return res.status(404).json({ error: 'בקשה לא נמצאה' });
  db.get('one_time_requests').find({ id: +req.params.id }).assign({ assigned_room_id: +room_id, status: 'assigned' }).write();
  const room = db.get('rooms').find({ id: +room_id }).value();
  res.json({ message: `הוקצה לך ${room?.name ?? 'חדר'}` });
});

router.get('/library-schedule', (req, res) => {
  const { from, to } = req.query;
  const libraryRooms = db.get('rooms').filter({ room_type: 'library', is_active: true }).value();
  if (libraryRooms.length === 0) return res.json({});

  const libraryIds = libraryRooms.map(r => r.id);

  // Build date range
  const dates = [];
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) { dates.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }

  const result = {};
  dates.forEach(date => {
    const dayOfWeek = new Date(date).getDay();
    const otBookings = db.get('one_time_requests')
      .filter(x => x.specific_date === date && x.status === 'assigned' && libraryIds.includes(x.assigned_room_id))
      .value().map(x => {
        const u = db.get('users').find({ id: x.user_id }).value();
        return { id: x.id, user_name: u?.name, start_time: x.start_time, end_time: x.end_time, type: 'one_time' };
      });
    const permBookings = db.get('room_assignments')
      .filter(x => x.day_of_week === dayOfWeek && libraryIds.includes(x.room_id))
      .value().map(x => {
        const u = db.get('users').find({ id: x.user_id }).value();
        return { user_name: u?.name, start_time: x.start_time, end_time: x.end_time, type: 'permanent' };
      });
    const all = [...otBookings, ...permBookings].sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
    result[date] = all;
  });
  res.json(result);
});

router.get('/available-rooms', requireAdmin, (req, res) => {
  const { date, start_time, end_time } = req.query;
  if (!date || !start_time || !end_time) return res.status(400).json({ error: 'חסרים פרמטרים' });
  const dayOfWeek = new Date(date).getDay();
  const permBusy = db.get('room_assignments').filter({ assignment_type: 'permanent', day_of_week: dayOfWeek }).value();
  const otBusy = db.get('one_time_requests').filter(x => x.specific_date === date && x.status === 'assigned' && x.assigned_room_id).value();

  const allRooms = db.get('rooms').filter({ is_active: true, room_type: 'regular' }).value().map(room => {
    const occupants = [
      ...permBusy.filter(b => b.room_id === room.id && overlap(start_time, end_time, b.start_time, b.end_time)).map(b => {
        const u = db.get('users').find({ id: b.user_id }).value();
        return { name: u?.name, start: b.start_time, end: b.end_time };
      }),
      ...otBusy.filter(b => b.assigned_room_id === room.id && b.start_time && overlap(start_time, end_time, b.start_time, b.end_time)).map(b => {
        const u = db.get('users').find({ id: b.user_id }).value();
        return { name: u?.name, start: b.start_time, end: b.end_time };
      }),
    ];
    return { ...room, available: occupants.length === 0, occupants };
  }).sort((a, b) => a.name.localeCompare(b.name, 'he'));

  res.json(allRooms);
});

router.post('/:id/assign-room', requireAdmin, (req, res) => {
  const { room_id } = req.body;
  db.get('one_time_requests').find({ id: +req.params.id }).assign({ assigned_room_id: +room_id, status: 'assigned' }).write();
  const room = db.get('rooms').find({ id: +room_id }).value();
  res.json({ message: `הוקצה ${room?.name}` });
});

router.delete('/:id', requireAdmin, (req, res) => {
  db.get('one_time_requests').remove({ id: +req.params.id }).write();
  res.json({ message: 'הבקשה נמחקה' });
});

router.put('/:id', requireAdmin, (req, res) => {
  const { status, admin_response, assigned_room_id } = req.body;
  db.get('one_time_requests').find({ id: +req.params.id }).assign({
    status,
    admin_response: admin_response || null,
    assigned_room_id: assigned_room_id ? +assigned_room_id : null,
  }).write();
  res.json({ message: 'הבקשה עודכנה' });
});

module.exports = router;
