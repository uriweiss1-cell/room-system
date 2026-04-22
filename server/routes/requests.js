const express = require('express');
const { db, nextId } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const overlap = (s1, e1, s2, e2) => toMin(s1) < toMin(e2) && toMin(e1) > toMin(s2);

const numSort = (a, b) => {
  const n = x => parseInt((x.name || '').match(/\d+/)?.[0] ?? '999');
  return n(a) - n(b) || (a.name || '').localeCompare(b.name || '', 'he');
};

function enrich(r) {
  const user = db.get('users').find({ id: r.user_id }).value();
  const room = r.assigned_room_id ? db.get('rooms').find({ id: r.assigned_room_id }).value() : null;

  let existing_assignments = [];
  if (r.request_type === 'permanent_request' && r.day_of_week != null && r.start_time) {
    existing_assignments = db.get('room_assignments')
      .filter({ user_id: r.user_id, day_of_week: r.day_of_week, assignment_type: 'permanent' })
      .value()
      .filter(a => overlap(a.start_time, a.end_time, r.start_time, r.end_time))
      .map(a => {
        const rm = db.get('rooms').find({ id: a.room_id }).value();
        return { room_name: rm?.name, start_time: a.start_time, end_time: a.end_time };
      });
  }

  return { ...r, user_name: user?.name, role: user?.role, room_name: room?.name || null, existing_assignments };
}

router.get('/my', (req, res) => {
  const list = db.get('one_time_requests').filter({ user_id: req.user.id }).value().map(enrich).reverse();
  res.json(list);
});

router.get('/all', requireAdmin, (req, res) => {
  res.json(db.get('one_time_requests').value().map(enrich).reverse());
});

router.post('/', (req, res) => {
  const { request_type, specific_date, date_to, day_of_week, start_time, end_time, notes, reduce_assignment_id, impersonate_user_id, target_room_type } = req.body;

  // Admin can submit on behalf of another user
  const userId = (req.user.role === 'admin' && impersonate_user_id) ? +impersonate_user_id : req.user.id;

  // Absence with date range — create one record per day
  if (request_type === 'absence' && date_to && date_to > specific_date) {
    const dates = [];
    const cur = new Date(specific_date);
    const end = new Date(date_to);
    while (cur <= end) {
      const d = cur.toISOString().slice(0, 10);
      const dow = cur.getDay();
      if (dow >= 0 && dow <= 4) dates.push(d); // Sun–Thu only
      cur.setDate(cur.getDate() + 1);
    }
    dates.forEach(d => {
      const rid = nextId('one_time_requests');
      db.get('one_time_requests').push({
        id: rid, user_id: userId, request_type: 'absence', specific_date: d,
        day_of_week: null, start_time: null, end_time: null, status: 'assigned',
        assigned_room_id: null, notes: notes || null, admin_response: null,
        reduce_assignment_id: null, created_at: new Date().toISOString(),
      }).write();
    });
    return res.json({ message: `ההיעדרות נרשמה ל-${dates.length} ימים (${specific_date} עד ${date_to})` });
  }

  // room_request is handled at the end of this route (no record created upfront)
  // For all other types, create the record now
  const r = request_type !== 'room_request' ? (() => {
    const rec = {
      id: nextId('one_time_requests'),
      user_id: userId,
      request_type,
      specific_date,
      day_of_week: day_of_week ?? null,
      start_time: start_time || null,
      end_time: end_time || null,
      status: 'pending',
      assigned_room_id: null,
      notes: notes || null,
      admin_response: null,
      reduce_assignment_id: reduce_assignment_id ? +reduce_assignment_id : null,
      target_room_type: target_room_type || null,
      created_at: new Date().toISOString(),
    };
    db.get('one_time_requests').push(rec).write();
    return rec;
  })() : null;

  if (request_type === 'absence') {
    db.get('one_time_requests').find({ id: r.id }).assign({ status: 'assigned' }).write();
    return res.json({ requestId: r.id, message: 'ההיעדרות נרשמה בהצלחה' });
  }

  if (request_type === 'permanent_request') {
    return res.json({ requestId: r.id, message: 'הבקשה הועברה למנהל לאישור' });
  }

  if (request_type === 'library_request' || request_type === 'meeting_request' || request_type === 'mamod_request') {
    const roomType = request_type === 'library_request' ? 'library' : request_type === 'meeting_request' ? 'meeting' : 'mamod';
    const roomLabel = request_type === 'library_request' ? 'הספריה' : request_type === 'meeting_request' ? 'חדר הישיבות' : 'הממד';
    const isLibrary = request_type === 'library_request';
    const specialRoom = db.get('rooms').find({ room_type: roomType, is_active: true }).value();
    if (!specialRoom) return res.status(400).json({ error: `לא הוגדר ${roomLabel} במערכת. פנה למנהל.` });
    const dayOfWeek = new Date(specific_date).getDay();
    const permBusy = db.get('room_assignments').filter({ room_id: specialRoom.id, day_of_week: dayOfWeek }).value();
    const otBusy = db.get('one_time_requests').filter(x => x.specific_date === specific_date && x.status === 'assigned' && x.assigned_room_id === specialRoom.id).value();
    const conflict = [
      ...permBusy.filter(b => overlap(start_time, end_time, b.start_time, b.end_time)),
      ...otBusy.filter(b => b.start_time && overlap(start_time, end_time, b.start_time, b.end_time)),
    ];
    if (conflict.length > 0) {
      db.get('one_time_requests').remove({ id: r.id }).write();
      const names = conflict.map(b => { const u = db.get('users').find({ id: b.user_id }).value(); return `${u?.name} (${b.start_time}–${b.end_time})`; }).join(', ');
      return res.status(409).json({ error: `${roomLabel} תפוס/ה בשעות אלו: ${names}` });
    }
    db.get('one_time_requests').find({ id: r.id }).assign({ assigned_room_id: specialRoom.id, status: 'assigned' }).write();
    return res.json({ requestId: r.id, message: `${roomLabel} שובץ/ה לתאריך ${specific_date} בין ${start_time}–${end_time}` });
  }

  // room_request — find available rooms WITHOUT creating a DB record yet.
  // A record is only created when the user actually confirms a room (POST /requests/book-room),
  // or immediately here when NO rooms are available (so admin can see the pending request).
  const dayOfWeek = new Date(specific_date).getDay();
  // Absent users' permanent rooms are free
  const absentUsers = db.get('one_time_requests')
    .filter(x => x.specific_date === specific_date && x.request_type === 'absence' && x.status === 'assigned')
    .map('user_id').value();
  const permBusy = db.get('room_assignments')
    .filter({ assignment_type: 'permanent', day_of_week: dayOfWeek })
    .value()
    .filter(a => !absentUsers.includes(a.user_id));
  const otBusy = db.get('one_time_requests').filter(x => x.specific_date === specific_date && x.status === 'assigned' && x.assigned_room_id).value();

  // Check if the requesting user already has a room at these times
  const userAlreadyHasRoom = [
    ...permBusy.filter(b => b.user_id === userId && overlap(start_time, end_time, b.start_time, b.end_time)),
    ...otBusy.filter(b => b.user_id === userId && b.start_time && overlap(start_time, end_time, b.start_time, b.end_time)),
  ];
  if (userAlreadyHasRoom.length > 0) {
    const details = userAlreadyHasRoom.map(b => {
      const roomId = b.room_id || b.assigned_room_id;
      const room = db.get('rooms').find({ id: roomId }).value();
      return `${room?.name} (${b.start_time}–${b.end_time})`;
    }).join(', ');
    return res.status(409).json({ error: `כבר יש לך חדר מוקצה בשעות אלו: ${details}` });
  }

  const available = db.get('rooms').filter({ is_active: true, room_type: 'regular' }).value().filter(room => {
    const busy = [
      ...permBusy.filter(b => b.room_id === room.id),
      ...otBusy.filter(b => b.assigned_room_id === room.id),
    ];
    return !busy.some(b => overlap(start_time, end_time, b.start_time, b.end_time));
  });

  if (available.length === 0) {
    // No rooms available — create a pending record so the admin can see and handle it
    const pending = {
      id: nextId('one_time_requests'),
      user_id: userId,
      request_type: 'room_request',
      specific_date,
      day_of_week: null,
      start_time: start_time || null,
      end_time: end_time || null,
      status: 'pending',
      assigned_room_id: null,
      notes: notes || null,
      admin_response: null,
      reduce_assignment_id: null,
      target_room_type: null,
      created_at: new Date().toISOString(),
    };
    db.get('one_time_requests').push(pending).write();
  }

  res.json({ availableRooms: available });
});

// Called when the user picks a room from the available-rooms list.
// Creates the record AND assigns the room in one atomic step.
router.post('/book-room', (req, res) => {
  const { specific_date, start_time, end_time, notes, room_id, impersonate_user_id } = req.body;
  if (!specific_date || !start_time || !end_time || !room_id) {
    return res.status(400).json({ error: 'חסרים פרמטרים' });
  }
  const userId = (req.user.role === 'admin' && impersonate_user_id) ? +impersonate_user_id : req.user.id;

  // Verify the room is still free (race-condition guard)
  const dayOfWeek = new Date(specific_date).getDay();
  const absentUsers = db.get('one_time_requests')
    .filter(x => x.specific_date === specific_date && x.request_type === 'absence' && x.status === 'assigned')
    .map('user_id').value();
  const permBusy = db.get('room_assignments')
    .filter({ assignment_type: 'permanent', day_of_week: dayOfWeek, room_id: +room_id })
    .value()
    .filter(a => !absentUsers.includes(a.user_id));
  const otBusy = db.get('one_time_requests')
    .filter(x => x.specific_date === specific_date && x.status === 'assigned' && x.assigned_room_id === +room_id)
    .value();
  const isRoomBusy = [
    ...permBusy.filter(b => overlap(start_time, end_time, b.start_time, b.end_time)),
    ...otBusy.filter(b => b.start_time && overlap(start_time, end_time, b.start_time, b.end_time)),
  ].length > 0;
  if (isRoomBusy) {
    return res.status(409).json({ error: 'החדר שנבחר כבר תפוס בינתיים — חפש שוב' });
  }

  const rec = {
    id: nextId('one_time_requests'),
    user_id: userId,
    request_type: 'room_request',
    specific_date,
    day_of_week: null,
    start_time: start_time || null,
    end_time: end_time || null,
    status: 'assigned',
    assigned_room_id: +room_id,
    notes: notes || null,
    admin_response: null,
    reduce_assignment_id: null,
    target_room_type: null,
    created_at: new Date().toISOString(),
  };
  db.get('one_time_requests').push(rec).write();

  const room = db.get('rooms').find({ id: +room_id }).value();
  res.json({ message: `הוקצה לך ${room?.name ?? 'חדר'}` });
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
        return { id: x.id, user_name: u?.name, start_time: x.start_time, end_time: x.end_time, type: 'one_time', notes: x.notes };
      });
    const permBookings = db.get('room_assignments')
      .filter(x => x.day_of_week === dayOfWeek && libraryIds.includes(x.room_id))
      .value().map(x => {
        const u = db.get('users').find({ id: x.user_id }).value();
        return { user_name: u?.name, start_time: x.start_time, end_time: x.end_time, type: 'permanent', notes: x.notes || null };
      });
    const all = [...otBookings, ...permBookings].sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
    result[date] = all;
  });
  res.json(result);
});

router.get('/meeting-schedule', (req, res) => {
  const { from, to } = req.query;
  const meetingRooms = db.get('rooms').filter({ room_type: 'meeting', is_active: true }).value();
  if (meetingRooms.length === 0) return res.json({});
  const meetingIds = meetingRooms.map(r => r.id);
  const dates = [];
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) { dates.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
  const result = {};
  dates.forEach(date => {
    const dayOfWeek = new Date(date).getDay();
    const otBookings = db.get('one_time_requests')
      .filter(x => x.specific_date === date && x.status === 'assigned' && meetingIds.includes(x.assigned_room_id))
      .value().map(x => {
        const u = db.get('users').find({ id: x.user_id }).value();
        return { id: x.id, user_name: u?.name, start_time: x.start_time, end_time: x.end_time, type: 'one_time', notes: x.notes };
      });
    const permBookings = db.get('room_assignments')
      .filter(x => x.day_of_week === dayOfWeek && meetingIds.includes(x.room_id))
      .value().map(x => {
        const u = db.get('users').find({ id: x.user_id }).value();
        return { user_name: u?.name, start_time: x.start_time, end_time: x.end_time, type: 'permanent', notes: x.notes || null };
      });
    const all = [...otBookings, ...permBookings].sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
    result[date] = all;
  });
  res.json(result);
});

router.get('/mamod-schedule', (req, res) => {
  const { from, to } = req.query;
  const mamodRooms = db.get('rooms').filter({ room_type: 'mamod', is_active: true }).value();
  if (mamodRooms.length === 0) return res.json({});
  const mamodIds = mamodRooms.map(r => r.id);
  const dates = [];
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) { dates.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
  const result = {};
  dates.forEach(date => {
    const dayOfWeek = new Date(date).getDay();
    const otBookings = db.get('one_time_requests')
      .filter(x => x.specific_date === date && x.status === 'assigned' && mamodIds.includes(x.assigned_room_id))
      .value().map(x => {
        const u = db.get('users').find({ id: x.user_id }).value();
        return { id: x.id, user_name: u?.name, start_time: x.start_time, end_time: x.end_time, type: 'one_time', notes: x.notes };
      });
    const permBookings = db.get('room_assignments')
      .filter(x => x.day_of_week === dayOfWeek && mamodIds.includes(x.room_id))
      .value().map(x => {
        const u = db.get('users').find({ id: x.user_id }).value();
        return { user_name: u?.name, start_time: x.start_time, end_time: x.end_time, type: 'permanent', notes: x.notes || null };
      });
    const all = [...otBookings, ...permBookings].sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
    result[date] = all;
  });
  res.json(result);
});

router.get('/available-rooms-permanent', requireAdmin, (req, res) => {
  const { day_of_week, start_time, end_time, user_id } = req.query;
  if (day_of_week == null || !start_time || !end_time) return res.status(400).json({ error: 'חסרים פרמטרים' });
  const dow = +day_of_week;

  const allRooms = db.get('rooms').filter({ is_active: true, room_type: 'regular' }).value().map(room => {
    const allInRoom = db.get('room_assignments')
      .filter({ room_id: room.id, day_of_week: dow, assignment_type: 'permanent' })
      .value();
    const busy = allInRoom.filter(b => overlap(start_time, end_time, b.start_time, b.end_time));
    const occupants = busy.map(b => {
      const u = db.get('users').find({ id: b.user_id }).value();
      return { name: u?.name, start: b.start_time, end: b.end_time };
    });
    const userAlreadyHere = user_id
      ? allInRoom.filter(b => b.user_id === +user_id && !overlap(start_time, end_time, b.start_time, b.end_time))
          .map(b => `${b.start_time}–${b.end_time}`)
      : [];
    // Compute free windows within requested range
    const startMin = toMin(start_time);
    const endMin = toMin(end_time);
    const minToStr = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const sortedBusy = occupants.slice().sort((a, b) => toMin(a.start) - toMin(b.start));
    const free_windows = [];
    let cursor = startMin;
    for (const slot of sortedBusy) {
      const slotStart = Math.max(toMin(slot.start), startMin);
      const slotEnd = Math.min(toMin(slot.end), endMin);
      if (cursor < slotStart) free_windows.push({ from: minToStr(cursor), to: minToStr(slotStart) });
      cursor = Math.max(cursor, slotEnd);
    }
    if (cursor < endMin) free_windows.push({ from: minToStr(cursor), to: minToStr(endMin) });
    return { ...room, available: occupants.length === 0, occupants, user_already_here: userAlreadyHere, free_windows };
  }).sort(numSort);

  res.json(allRooms);
});

router.get('/available-rooms', requireAdmin, (req, res) => {
  const { date, start_time, end_time } = req.query;
  if (!date || !start_time || !end_time) return res.status(400).json({ error: 'חסרים פרמטרים' });
  const dayOfWeek = new Date(date).getDay();
  // Absent users' permanent rooms are free
  const absentUsersForDate = db.get('one_time_requests')
    .filter(x => x.specific_date === date && x.request_type === 'absence' && x.status === 'assigned')
    .map('user_id').value();
  const permBusy = db.get('room_assignments')
    .filter({ assignment_type: 'permanent', day_of_week: dayOfWeek })
    .value()
    .filter(a => !absentUsersForDate.includes(a.user_id));
  const otBusy = db.get('one_time_requests').filter(x => x.specific_date === date && x.status === 'assigned' && x.assigned_room_id).value();

  const minToStr = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

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
    // Compute free windows within the requested time range
    const startMin = toMin(start_time);
    const endMin = toMin(end_time);
    const sortedBusy = occupants.slice().sort((a, b) => toMin(a.start) - toMin(b.start));
    const free_windows = [];
    let cursor = startMin;
    for (const slot of sortedBusy) {
      const slotStart = Math.max(toMin(slot.start), startMin);
      const slotEnd = Math.min(toMin(slot.end), endMin);
      if (cursor < slotStart) free_windows.push({ from: minToStr(cursor), to: minToStr(slotStart) });
      cursor = Math.max(cursor, slotEnd);
    }
    if (cursor < endMin) free_windows.push({ from: minToStr(cursor), to: minToStr(endMin) });
    return { ...room, available: occupants.length === 0, occupants, free_windows };
  }).sort(numSort);

  res.json(allRooms);
});

router.post('/:id/assign-room', requireAdmin, (req, res) => {
  const { room_id, start_time, end_time, admin_response } = req.body;
  const update = { assigned_room_id: +room_id, status: 'assigned' };
  if (start_time) update.start_time = start_time;
  if (end_time) update.end_time = end_time;
  if (admin_response) update.admin_response = admin_response;
  db.get('one_time_requests').find({ id: +req.params.id }).assign(update).write();
  const room = db.get('rooms').find({ id: +room_id }).value();
  res.json({ message: `הוקצה ${room?.name}` });
});

// Add an additional partial assignment for a request (keeps original, creates sibling record)
router.post('/:id/add-partial', requireAdmin, (req, res) => {
  const { room_id, start_time, end_time, admin_response } = req.body;
  const original = db.get('one_time_requests').find({ id: +req.params.id }).value();
  if (!original) return res.status(404).json({ error: 'בקשה לא נמצאה' });
  const newReq = {
    id: nextId('one_time_requests'),
    user_id: original.user_id,
    request_type: original.request_type,
    specific_date: original.specific_date,
    day_of_week: original.day_of_week,
    start_time,
    end_time,
    status: 'assigned',
    assigned_room_id: +room_id,
    notes: original.notes,
    admin_response: admin_response || null,
    reduce_assignment_id: null,
    target_room_type: null,
    created_at: new Date().toISOString(),
  };
  db.get('one_time_requests').push(newReq).write();
  const room = db.get('rooms').find({ id: +room_id }).value();
  res.json({ message: `נוסף שיבוץ: ${room?.name} ${start_time}–${end_time}` });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const request = db.get('one_time_requests').find({ id: +req.params.id }).value();
  // If an approved permanent special-room request is deleted, also remove its room_assignment
  if (request?.request_type === 'permanent_request' && request?.status === 'approved' && request?.target_room_type) {
    const specialRoom = db.get('rooms').find({ room_type: request.target_room_type, is_active: true }).value();
    if (specialRoom) {
      db.get('room_assignments').remove(a =>
        a.user_id === request.user_id && a.room_id === specialRoom.id &&
        a.day_of_week === request.day_of_week && a.assignment_type === 'permanent' &&
        overlap(a.start_time, a.end_time, request.start_time, request.end_time)
      ).write();
    }
  }
  db.get('one_time_requests').remove({ id: +req.params.id }).write();
  res.json({ message: 'הבקשה נמחקה' });
});

router.put('/:id', requireAdmin, (req, res) => {
  const { status, admin_response, assigned_room_id, room_id, assign_start_time, assign_end_time } = req.body;
  const request = db.get('one_time_requests').find({ id: +req.params.id }).value();

  db.get('one_time_requests').find({ id: +req.params.id }).assign({
    status,
    admin_response: admin_response || null,
    assigned_room_id: assigned_room_id ? +assigned_room_id : null,
  }).write();

  // If rejecting an already-approved permanent special-room request — remove its room_assignment
  if (status === 'rejected' && request?.request_type === 'permanent_request' && request?.status === 'approved' && request?.target_room_type) {
    const specialRoom = db.get('rooms').find({ room_type: request.target_room_type, is_active: true }).value();
    if (specialRoom) {
      db.get('room_assignments').remove(a =>
        a.user_id === request.user_id && a.room_id === specialRoom.id &&
        a.day_of_week === request.day_of_week && a.assignment_type === 'permanent' &&
        overlap(a.start_time, a.end_time, request.start_time, request.end_time)
      ).write();
    }
  }

  // If approving a permanent_request — create a room_assignment
  if (status === 'approved' && request?.request_type === 'permanent_request') {
    // For library/meeting requests, find the special room automatically
    let finalRoomId = room_id ? +room_id : null;
    if (!finalRoomId && request.target_room_type) {
      const specialRoom = db.get('rooms').find({ room_type: request.target_room_type, is_active: true }).value();
      if (specialRoom) finalRoomId = specialRoom.id;
    }
    if (finalRoomId) {
      db.get('room_assignments').push({
        id: nextId('room_assignments'),
        user_id: request.user_id,
        room_id: finalRoomId,
        day_of_week: request.day_of_week,
        start_time: assign_start_time || request.start_time,
        end_time: assign_end_time || request.end_time,
        assignment_type: 'permanent',
        notes: request.notes || null,
        created_at: new Date().toISOString(),
      }).write();
    }
  }

  if (status === 'approved' && request?.request_type === 'permanent_reduce' && request.reduce_assignment_id) {
    db.get('room_assignments').find({ id: request.reduce_assignment_id }).assign({
      start_time: request.start_time,
      end_time: request.end_time,
    }).write();
  }

  res.json({ message: 'הבקשה עודכנה' });
});

module.exports = router;
