const express = require('express');
const { db, nextId } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const overlap = (s1, e1, s2, e2) => toMin(s1) < toMin(e2) && toMin(e1) > toMin(s2);

function enrichAssignment(a) {
  const room = db.get('rooms').find({ id: a.room_id }).value();
  const user = a.user_id ? db.get('users').find({ id: a.user_id }).value() : null;
  return {
    ...a,
    room_name: room?.name,
    user_name: a.user_id ? user?.name : (a.guest_name || 'אורח'),
    role: user?.role || null,
    is_guest: !a.user_id,
  };
}

router.get('/my', (req, res) => {
  const list = db.get('room_assignments').filter({ user_id: req.user.id, assignment_type: 'permanent' }).value().map(enrichAssignment);
  res.json(list);
});

router.get('/all', requireAdmin, (req, res) => {
  const list = db.get('room_assignments').filter({ assignment_type: 'permanent' }).value().map(enrichAssignment);
  res.json(list);
});

// Create a one-time guest assignment (admin only)
router.post('/guest', requireAdmin, (req, res) => {
  const { guest_name, room_id, specific_date, start_time, end_time } = req.body;
  if (!guest_name?.trim() || !room_id || !specific_date || !start_time || !end_time)
    return res.status(400).json({ error: 'יש למלא שם, חדר, תאריך ושעות' });

  const a = {
    id: nextId('room_assignments'),
    user_id: null,
    guest_name: guest_name.trim(),
    room_id: +room_id,
    day_of_week: new Date(specific_date).getDay(),
    start_time,
    end_time,
    assignment_type: 'one_time',
    specific_date,
    created_at: new Date().toISOString(),
  };
  db.get('room_assignments').push(a).write();
  const room = db.get('rooms').find({ id: +room_id }).value();
  res.json({ id: a.id, message: `${guest_name.trim()} שובץ/ה ל${room?.name} בתאריך ${specific_date}` });
});

// Diagnostic summary for a single user — shows schedule, preferred/current room,
// and explains why the algorithm would or wouldn't keep them in their preferred room.
router.get('/user-debug/:userId', requireAdmin, (req, res) => {
  const userId = +req.params.userId;
  const user = db.get('users').find({ id: userId }).value();
  if (!user) return res.status(404).json({ error: 'עובד לא נמצא' });

  const DAYS_HE = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

  const schedules = db.get('regular_schedules').filter({ user_id: userId }).value().map(s => {
    const room = s.preferred_room_id ? db.get('rooms').find({ id: +s.preferred_room_id }).value() : null;
    return { ...s, preferred_room_name: room?.name || null };
  });

  const assignments = db.get('room_assignments')
    .filter({ user_id: userId, assignment_type: 'permanent' })
    .value().map(a => {
      const room = db.get('rooms').find({ id: a.room_id }).value();
      return { ...a, room_name: room?.name, day_name: DAYS_HE[a.day_of_week] };
    });

  // Compute currentRoomId (same logic as the algorithm)
  const roomCounts = {};
  assignments.forEach(a => { roomCounts[a.room_id] = (roomCounts[a.room_id] || 0) + 1; });
  const currentRoomId = Object.keys(roomCounts).length
    ? +Object.entries(roomCounts).sort((a, b) => b[1] - a[1])[0][0] : null;
  const currentRoom = currentRoomId ? db.get('rooms').find({ id: currentRoomId }).value() : null;

  const rawPreferredId = schedules.find(s => s.preferred_room_id)?.preferred_room_id;
  const preferredRoomId = rawPreferredId ? +rawPreferredId : null;
  const preferredRoom = preferredRoomId ? db.get('rooms').find({ id: preferredRoomId }).value() : null;

  // Who else prefers the same rooms?
  const allSchedules = db.get('regular_schedules').value();
  const othersWantPreferred = preferredRoomId
    ? allSchedules.filter(s => s.user_id !== userId && s.preferred_room_id && +s.preferred_room_id === preferredRoomId)
        .map(s => db.get('users').find({ id: s.user_id }).value()?.name).filter(Boolean)
    : [];
  const othersWantCurrent = currentRoomId && currentRoomId !== preferredRoomId
    ? allSchedules.filter(s => s.user_id !== userId && s.preferred_room_id && +s.preferred_room_id === currentRoomId)
        .map(s => db.get('users').find({ id: s.user_id }).value()?.name).filter(Boolean)
    : [];

  // Pass-1 eligibility: preferred === current AND all slots available
  const pass1Eligible = preferredRoomId && preferredRoomId === currentRoomId;

  // Diagnose
  const issues = [];
  if (!schedules.length) issues.push('אין לוח זמנים מוגדר — האלגוריתם לא יגע בשיבוצים של עובד זה');
  if (schedules.length && !preferredRoomId) issues.push('לא הוגדר חדר מועדף');
  if (preferredRoomId && preferredRoomId !== currentRoomId)
    issues.push(`חדר מועדף (${preferredRoom?.name}) ≠ חדר נוכחי (${currentRoom?.name || '—'}) → Pass 1 לא יפעל, חייב להיות פנוי ב-Pass 2`);
  if (othersWantPreferred.length)
    issues.push(`גם ${othersWantPreferred.join(', ')} מבקש/ת את חדר ${preferredRoom?.name} — תחרות על אותו חדר`);
  if (othersWantCurrent.length)
    issues.push(`${othersWantCurrent.join(', ')} מבקש/ת את חדר ${currentRoom?.name} כמועדף → blocksPreference ימנע מהאלגוריתם לנסות את החדר הנוכחי`);

  res.json({
    user: { id: user.id, name: user.name, role: user.role },
    schedules,
    assignments,
    preferredRoomId, preferredRoomName: preferredRoom?.name || null,
    currentRoomId, currentRoomName: currentRoom?.name || null,
    pass1Eligible,
    othersWantPreferred,
    othersWantCurrent,
    issues,
  });
});

// List all upcoming guest assignments (admin only)
router.get('/guests', requireAdmin, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const list = db.get('room_assignments')
    .filter(a => a.assignment_type === 'one_time' && !a.user_id && a.specific_date >= today)
    .value()
    .map(enrichAssignment)
    .sort((a, b) => a.specific_date.localeCompare(b.specific_date));
  res.json(list);
});

router.get('/query', (req, res) => {
  const { date, time, roomFilter } = req.query;
  if (!date || !time) return res.status(400).json({ error: 'נדרשים date ו-time' });
  const dayOfWeek = new Date(date).getDay();

  const absences = db.get('one_time_requests')
    .filter(r => r.specific_date === date && r.request_type === 'absence' && r.status === 'assigned')
    .map('user_id').value();

  let regular = db.get('room_assignments')
    .filter(a => a.day_of_week === dayOfWeek && a.assignment_type === 'permanent'
      && toMin(a.start_time) <= toMin(time) && toMin(a.end_time) > toMin(time)
      && !absences.includes(a.user_id))
    .value().map(enrichAssignment);

  let oneTime = db.get('one_time_requests')
    .filter(r => r.specific_date === date && r.status === 'assigned'
      && ['room_request', 'library_request', 'meeting_request', 'mamod_request'].includes(r.request_type)
      && r.assigned_room_id && r.start_time && toMin(r.start_time) <= toMin(time) && toMin(r.end_time) > toMin(time))
    .value().map(r => {
      const user = db.get('users').find({ id: r.user_id }).value();
      const room = db.get('rooms').find({ id: r.assigned_room_id }).value();
      return { ...r, user_name: user?.name, role: user?.role, room_name: room?.name };
    });

  // Guest one-time room assignments for this specific date
  const guests = db.get('room_assignments')
    .filter(a => a.specific_date === date && a.assignment_type === 'one_time' && !a.user_id
      && toMin(a.start_time) <= toMin(time) && toMin(a.end_time) > toMin(time))
    .value().map(enrichAssignment);

  if (roomFilter) {
    const rf = roomFilter.toLowerCase();
    regular = regular.filter(a => a.room_name?.toLowerCase().includes(rf));
    oneTime = oneTime.filter(a => a.room_name?.toLowerCase().includes(rf));
  }

  res.json({ date, time, dayOfWeek, regular, oneTime: [...oneTime, ...guests] });
});

router.get('/locate', (req, res) => {
  const { userId, guestName, date, time } = req.query;
  if (!date || !time) return res.status(400).json({ error: 'נדרשים date ו-time' });
  const dayOfWeek = new Date(date).getDay();

  // Guest lookup — search room_assignments by guest_name
  if (guestName) {
    const guestSlot = db.get('room_assignments')
      .filter(a => a.user_id === null && a.guest_name === guestName && a.specific_date === date && a.assignment_type === 'one_time')
      .filter(a => !a.start_time || (toMin(a.start_time) <= toMin(time) && toMin(a.end_time) > toMin(time)))
      .first().value();
    if (guestSlot) {
      const room = db.get('rooms').find({ id: guestSlot.room_id }).value();
      return res.json({ room: room?.name });
    }
    return res.json({ room: null, message: 'לא נמצא חדר מוקצה בשעה זו' });
  }

  const uid = userId ? +userId : req.user.id;

  // One-time room request (assigned)
  const oneTime = db.get('one_time_requests')
    .filter(r => r.user_id === uid && r.specific_date === date && r.status === 'assigned')
    .filter(r => !r.start_time || (toMin(r.start_time) <= toMin(time) && toMin(r.end_time) > toMin(time)))
    .value();

  // If marked absent, return not found even if there is also a room booking
  if (oneTime.some(r => r.request_type === 'absence')) {
    return res.json({ room: null, message: 'העובד לא נמצא' });
  }
  const roomRequest = oneTime.find(r => r.assigned_room_id);
  if (roomRequest) {
    const room = db.get('rooms').find({ id: roomRequest.assigned_room_id }).value();
    return res.json({ room: room?.name });
  }

  const perm = db.get('room_assignments')
    .filter(a => a.user_id === uid && a.day_of_week === dayOfWeek && a.assignment_type === 'permanent'
      && toMin(a.start_time) <= toMin(time) && toMin(a.end_time) > toMin(time))
    .first().value();

  if (perm) {
    const room = db.get('rooms').find({ id: perm.room_id }).value();
    return res.json({ room: room?.name });
  }
  res.json({ room: null, message: 'לא נמצא חדר מוקצה בשעה זו' });
});

router.post('/', requireAdmin, (req, res) => {
  const { user_id, room_id, day_of_week, start_time, end_time, assignment_type, specific_date } = req.body;
  const aType = assignment_type ?? 'permanent';
  const a = {
    id: nextId('room_assignments'),
    user_id: +user_id, room_id: +room_id, day_of_week: +day_of_week,
    start_time, end_time, assignment_type: aType,
    specific_date: specific_date || null, created_at: new Date().toISOString(),
  };
  db.get('room_assignments').push(a).write();

  // For permanent manual assignments to a real user: also create a matching
  // regular_schedule entry if none exists for that day/time, so the assignment
  // survives the algorithm's cleanup pass and the employee's work-days are updated.
  if (aType === 'permanent' && user_id) {
    const existingSched = db.get('regular_schedules')
      .filter({ user_id: +user_id, day_of_week: +day_of_week })
      .value()
      .some(s => overlap(s.start_time, s.end_time, start_time, end_time));
    if (!existingSched) {
      db.get('regular_schedules').push({
        id: nextId('regular_schedules'),
        user_id: +user_id,
        day_of_week: +day_of_week,
        start_time,
        end_time,
        preferred_room_id: +room_id,
        created_at: new Date().toISOString(),
      }).write();
    }
  }

  res.json({ id: a.id });
});

router.put('/:id', requireAdmin, (req, res) => {
  const { start_time, end_time } = req.body;
  if (!start_time || !end_time) return res.status(400).json({ error: 'נדרשות שעת התחלה וסיום' });
  const a = db.get('room_assignments').find({ id: +req.params.id }).value();
  if (!a) return res.status(404).json({ error: 'שיבוץ לא נמצא' });
  db.get('room_assignments').find({ id: +req.params.id }).assign({ start_time, end_time }).write();
  res.json({ message: 'שיבוץ עודכן' });
});

// Admin dismisses an unresolvable conflict — remove that schedule slot so the algorithm won't regenerate it
router.delete('/dismiss-slot', requireAdmin, (req, res) => {
  const { user_id, day_of_week, start_time, end_time } = req.body;
  if (!user_id || day_of_week == null || !start_time || !end_time)
    return res.status(400).json({ error: 'חסרים פרמטרים' });
  db.get('regular_schedules')
    .remove(s => s.user_id === +user_id && s.day_of_week === +day_of_week &&
      s.start_time === start_time && s.end_time === end_time)
    .write();
  res.json({ message: 'slot הוסר מלוח הזמנים' });
});

router.delete('/clear/permanent', requireAdmin, (req, res) => {
  db.get('room_assignments').remove({ assignment_type: 'permanent' }).write();
  res.json({ message: 'כל השיבוצים הקבועים נמחקו' });
});

router.delete('/:id', requireAdmin, (req, res) => {
  // Admin delete: removes only the room_assignment, keeps regular_schedule intact.
  // The employee stays in the "needs assignment" pool — the algorithm will reassign
  // them on the next run.
  // (Employee self-delete via DELETE /my/:id removes both assignment AND schedule.)
  db.get('room_assignments').remove({ id: +req.params.id }).write();
  res.json({ message: 'השיבוץ נמחק' });
});

// Resolve a preference conflict: notify the employee OR displace a blocker and assign the employee
router.post('/resolve-preference', requireAdmin, (req, res) => {
  const { action, userId, blockerUserId, roomId, day, start, end, message } = req.body;
  try {
    const sendNotif = (toUserId, msg) => {
      const notifId = db.get('_ids.notifications').value() || 0;
      db.set('_ids.notifications', notifId + 1).write();
      db.get('notifications').push({ id: notifId, user_id: +toUserId, read: false, message: msg, created_at: new Date().toISOString() }).write();
    };

    if (action === 'notify') {
      const room = db.get('rooms').find({ id: +roomId }).value();
      const dayName = DAYS_HE[+day];
      const defaultMsg = `שיבוצך לחדר ${room?.name} ביום ${dayName} (${start}–${end}) לא אושר. לפרטים פנה/י למנהל.`;
      sendNotif(userId, message || defaultMsg);
      return res.json({ message: 'הודעה נשלחה לעובד' });
    }

    if (action === 'displace') {
      // Remove the blocker's assignment for this room/day slot
      const allForBlocker = db.get('room_assignments')
        .filter(a => a.user_id === +blockerUserId && a.room_id === +roomId && a.day_of_week === +day && a.assignment_type === 'permanent')
        .value();
      const toRemove = allForBlocker.find(a => overlap(a.start_time, a.end_time, start, end));
      if (toRemove) db.get('room_assignments').remove({ id: toRemove.id }).write();

      // Also remove any existing assignment of the target user for the same day (avoid duplicates)
      db.get('room_assignments')
        .remove(a => a.user_id === +userId && a.day_of_week === +day && a.assignment_type === 'permanent'
          && overlap(a.start_time, a.end_time, start, end))
        .write();

      // Assign the preferred user to the room
      db.get('room_assignments').push({
        id: nextId('room_assignments'),
        user_id: +userId, room_id: +roomId, day_of_week: +day,
        start_time: start, end_time: end,
        assignment_type: 'permanent', specific_date: null, created_at: new Date().toISOString(),
      }).write();

      const blocker = db.get('users').find({ id: +blockerUserId }).value();
      const targetUser = db.get('users').find({ id: +userId }).value();
      const room = db.get('rooms').find({ id: +roomId }).value();

      // Notify displaced user
      sendNotif(blockerUserId, `השיבוץ שלך לחדר ${room?.name} ביום ${DAYS_HE[+day]} (${start}–${end}) בוטל על ידי המנהל.`);

      return res.json({ message: `${targetUser?.name} שובץ לחדר ${room?.name}, ${blocker?.name} הוסר` });
    }

    res.status(400).json({ error: 'פעולה לא ידועה' });
  } catch (e) {
    console.error('resolve-preference error:', e);
    res.status(500).json({ error: e.message || 'שגיאת שרת' });
  }
});

// Assign one or more users to a contested room (admin resolves conflict manually).
// Removes any existing permanent assignment for those users on those slots, then
// creates new assignments in the chosen room.
router.post('/assign-contested', requireAdmin, (req, res) => {
  const { assignments, roomId } = req.body;
  if (!assignments?.length || !roomId) return res.status(400).json({ error: 'חסרים פרמטרים' });
  for (const { userId, slots } of assignments) {
    for (const slot of slots) {
      db.get('room_assignments').remove(a =>
        a.user_id === +userId && a.day_of_week === slot.day_of_week &&
        a.assignment_type === 'permanent' &&
        overlap(a.start_time, a.end_time, slot.start_time, slot.end_time)
      ).write();
      db.get('room_assignments').push({
        id: nextId('room_assignments'),
        user_id: +userId, room_id: +roomId,
        day_of_week: slot.day_of_week,
        start_time: slot.start_time, end_time: slot.end_time,
        assignment_type: 'permanent', specific_date: null,
        created_at: new Date().toISOString(),
      }).write();
    }
  }
  const room = db.get('rooms').find({ id: +roomId }).value();
  const names = assignments.map(({ userId }) => db.get('users').find({ id: +userId }).value()?.name).filter(Boolean).join(', ');
  res.json({ message: `${names} שובץ/ו ל${room?.name}` });
});

// Employee deletes one of their own permanent assignments (and matching schedule slot).
// Employee edits their own assignment times
router.put('/my/:id', (req, res) => {
  const aId = +req.params.id;
  const { start_time, end_time } = req.body;
  if (!start_time || !end_time) return res.status(400).json({ error: 'נדרשות שעת התחלה וסיום' });
  const a = db.get('room_assignments').find({ id: aId, user_id: req.user.id, assignment_type: 'permanent' }).value();
  if (!a) return res.status(404).json({ error: 'שיבוץ לא נמצא' });
  // Update regular_schedule to match new times
  db.get('regular_schedules').find({ user_id: req.user.id, day_of_week: a.day_of_week, start_time: a.start_time, end_time: a.end_time })
    .assign({ start_time, end_time }).write();
  db.get('room_assignments').find({ id: aId }).assign({ start_time, end_time }).write();
  res.json({ message: 'שיבוץ עודכן' });
});

router.delete('/my/:id', (req, res) => {
  const aId = +req.params.id;
  const a = db.get('room_assignments').find({ id: aId, user_id: req.user.id, assignment_type: 'permanent' }).value();
  if (!a) return res.status(404).json({ error: 'שיבוץ לא נמצא' });
  db.get('room_assignments').remove({ id: aId }).write();
  // Also remove the matching regular_schedule entry so the algorithm won't recreate it
  db.get('regular_schedules').remove(s =>
    s.user_id === req.user.id && s.day_of_week === a.day_of_week &&
    s.start_time === a.start_time && s.end_time === a.end_time
  ).write();
  res.json({ message: 'השיבוץ נמחק' });
});

router.post('/generate', requireAdmin, (req, res) => {
  try { res.json(generateAssignments()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/apply-suggestion', requireAdmin, (req, res) => {
  const { action } = req.body;
  if (!action) return res.status(400).json({ error: 'חסר action' });

  const push = a => db.get('room_assignments').push({
    id: nextId('room_assignments'), ...a,
    assignment_type: 'permanent', specific_date: null, created_at: new Date().toISOString(),
  }).write();

  // After applying a suggestion, sync the regular_schedule so the algorithm
  // won't re-flag the resolved slot as a conflict or a wantToMove on the next run.
  // Sets preferred_room_id = assigned room, and trims schedule hours to match.
  const syncSchedule = (userId, day, roomId, start, end) => {
    const uid = +userId; const rid = +roomId; const d = +day;
    // Update hours + preferred_room_id for the resolved day
    db.get('regular_schedules').filter(s => s.user_id === uid && s.day_of_week === d).value()
      .forEach(s => {
        db.get('regular_schedules').find({ id: s.id }).assign({
          preferred_room_id: rid,
          start_time: start,
          end_time: end,
        }).write();
      });
    // Also update preferred_room_id on ALL other days for this user so that
    // getPreferredId() returns the resolved room consistently.
    // Without this, a stale preferred_room on another day causes wantToMove to fire again.
    db.get('regular_schedules').filter(s => s.user_id === uid && s.day_of_week !== d).value()
      .forEach(s => {
        db.get('regular_schedules').find({ id: s.id }).assign({ preferred_room_id: rid }).write();
      });
    // If no schedule entry exists yet for this day, create one
    const hasSched = db.get('regular_schedules').find({ user_id: uid, day_of_week: d }).value();
    if (!hasSched) {
      db.get('regular_schedules').push({
        id: nextId('regular_schedules'), user_id: uid, day_of_week: d,
        start_time: start, end_time: end, preferred_room_id: rid,
        created_at: new Date().toISOString(),
      }).write();
    }
  };

  try {

  if (action.type === 'split' || action.type === 'partial') {
    action.parts.forEach(p => push({ user_id: action.conflictUserId, room_id: p.roomId, day_of_week: action.day, start_time: p.start, end_time: p.end }));
    // For split: sync preferred to the room with the most hours; trim schedule to what was assigned
    const longest = action.parts.reduce((a, b) => (toMin(b.end) - toMin(b.start) > toMin(a.end) - toMin(a.start) ? b : a));
    const splitStart = action.parts[0].start;
    const splitEnd = action.parts[action.parts.length - 1].end;
    syncSchedule(action.conflictUserId, action.day, longest.roomId, splitStart, splitEnd);
    return res.json({ message: 'שיבוץ חלקי הוחל בהצלחה' });
  }

  if (action.type === 'shift') {
    push({ user_id: action.conflictUserId, room_id: action.roomId, day_of_week: action.day, start_time: action.start, end_time: action.end });
    syncSchedule(action.conflictUserId, action.day, action.roomId, action.start, action.end);
    return res.json({ message: 'שיבוץ עם שעות מותאמות הוחל' });
  }

  if (action.type === 'displace') {
    const tMin = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
    const ovlp = (s1,e1,s2,e2) => tMin(s1) < tMin(e2) && tMin(e1) > tMin(s2);
    // Find and remove the blocker's existing assignment
    const allForUser = db.get('room_assignments').filter(a =>
      a.user_id === +action.displaceUserId && a.room_id === +action.fromRoomId &&
      a.day_of_week === +action.day && a.assignment_type === 'permanent'
    ).value();
    const existing = allForUser.find(a => ovlp(a.start_time, a.end_time, action.displaceStart, action.displaceEnd));
    if (existing) db.get('room_assignments').remove({ id: existing.id }).write();
    // Move blocker to alt room
    push({ user_id: +action.displaceUserId, room_id: +action.toRoomId, day_of_week: +action.day, start_time: action.displaceStart, end_time: action.displaceEnd });
    syncSchedule(action.displaceUserId, action.day, action.toRoomId, action.displaceStart, action.displaceEnd);
    // Assign conflict user to freed room
    push({ user_id: +action.conflictUserId, room_id: +action.fromRoomId, day_of_week: +action.day, start_time: action.conflictStart, end_time: action.conflictEnd });
    syncSchedule(action.conflictUserId, action.day, action.fromRoomId, action.conflictStart, action.conflictEnd);
    // Notify the displaced user (safely, in case notifications collection isn't initialized)
    try {
      if (!db.get('notifications').value()) db.set('notifications', []).write();
      const notifId = db.get('_ids.notifications').value() || 0;
      db.set('_ids.notifications', notifId + 1).write();
      db.get('notifications').push({
        id: notifId, user_id: +action.displaceUserId, read: false,
        message: `השיבוץ שלך עודכן: הועברת מ-${action.fromRoomName} ל-${action.toRoomName} (יום ${DAYS_HE[action.day]}, ${action.displaceStart}–${action.displaceEnd})`,
        created_at: new Date().toISOString(),
      }).write();
    } catch (e) { /* notifications are non-critical */ }
    return res.json({ message: `${action.displaceUserName} הועבר ל-${action.toRoomName}, ${action.fromRoomName} הוקצה ל-${action.conflictUserName}` });
  }

  res.status(400).json({ error: 'סוג פעולה לא ידוע' });

  } catch (e) {
    console.error('apply-suggestion error:', e);
    res.status(500).json({ error: e.message || 'שגיאת שרת' });
  }
});

function generateAssignments() {
  const users = db.get('users').filter(u => u.is_active).value();
  const rooms = db.get('rooms').filter({ is_active: true }).value();
  const schedules = db.get('regular_schedules').value();
  const regularRooms = rooms.filter(r => r.room_type === 'regular' || r.room_type === 'committee');

  // Remove stale assignments for inactive/deleted users so they don't block rooms
  const activeIds = new Set(users.map(u => u.id));
  db.get('room_assignments')
    .remove(a => a.assignment_type === 'permanent' && a.user_id && !activeIds.has(a.user_id))
    .write();

  const userSched = {};
  schedules.forEach(s => { (userSched[s.user_id] = userSched[s.user_id] || []).push(s); });
  const usersWithSchedules = new Set(schedules.map(s => s.user_id));
  const processableUserIds = new Set(users.map(u => u.id).filter(id => usersWithSchedules.has(id)));

  const PRIORITY = { admin: -1, psychiatrist: 0, supervisor: 1, art_therapist: 2, clinical_intern: 3, educational_intern: 4 };
  const sorted = [...users].sort((a, b) => (PRIORITY[a.role] ?? 9) - (PRIORITY[b.role] ?? 9));

  const getPreferredId = rawSlots => {
    const val = rawSlots.find(s => s.preferred_room_id)?.preferred_room_id;
    return val ? +val : null;
  };

  // ── Snapshot existing permanent assignments ───────────────────────────────
  const allExisting = db.get('room_assignments').filter({ assignment_type: 'permanent' }).value();

  const existingByUser = {}; // userId -> [assignment]
  allExisting.forEach(a => {
    if (!a.user_id || !processableUserIds.has(a.user_id)) return;
    (existingByUser[a.user_id] = existingByUser[a.user_id] || []).push(a);
  });

  // Current room = most-used room per processable user
  const currentRooms = {};
  Object.entries(existingByUser).forEach(([uid, list]) => {
    const counts = {};
    list.forEach(a => { counts[a.room_id] = (counts[a.room_id] || 0) + 1; });
    currentRooms[+uid] = +Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  });

  // ── Categorise users ──────────────────────────────────────────────────────
  // wantToMove  — preferred_room_id set to a DIFFERENT room than current.
  //               Their full schedule is re-assigned to the preferred room.
  //               Conflict shown to admin if target room is already occupied.
  // stay / extend / new — preferred = current (or unset).
  //               Existing assignments are kept as-is.
  //               Only schedule slots with NO existing assignment are processed
  //               (these are "extend" for existing users, or all slots for new ones).
  const wantToMoveIds = new Set();
  for (const user of sorted) {
    const rawSlots = userSched[user.id] ?? [];
    if (!rawSlots.length) continue;
    const pid = getPreferredId(rawSlots);
    const cur = currentRooms[user.id];
    if (pid && cur && pid !== cur) wantToMoveIds.add(user.id);
  }

  // Returns sub-slots of [start,end] on [day] NOT yet covered by any existing assignment.
  // e.g. schedule=14:00-17:00, existing=15:00-17:00 → returns [{14:00-15:00}]
  const uncoveredSubSlots = (userId, day, start, end, template) => {
    const startM = toMin(start), endM = toMin(end);
    const covered = (existingByUser[userId] || [])
      .filter(a => a.day_of_week === day && overlap(a.start_time, a.end_time, start, end))
      .map(a => ({ s: Math.max(toMin(a.start_time), startM), e: Math.min(toMin(a.end_time), endM) }))
      .sort((a, b) => a.s - b.s);
    const gaps = [];
    let cur = startM;
    for (const c of covered) {
      if (c.s > cur) gaps.push({ start_time: minToTime(cur), end_time: minToTime(c.s) });
      cur = Math.max(cur, c.e);
    }
    if (cur < endM) gaps.push({ start_time: minToTime(cur), end_time: minToTime(endM) });
    return gaps.map(g => ({ ...template, start_time: g.start_time, end_time: g.end_time }));
  };

  // ── Build room grid ───────────────────────────────────────────────────────
  // Seed the grid with ALL existing permanent assignments EXCEPT wantToMove users
  // (their slots will be cleared and re-written at the end).
  const grid = {};
  rooms.forEach(r => (grid[r.id] = []));
  allExisting.forEach(a => {
    if (!grid[a.room_id]) return;
    if (a.user_id && wantToMoveIds.has(a.user_id)) return; // will be cleared
    const u = a.user_id ? db.get('users').find({ id: a.user_id }).value() : null;
    grid[a.room_id].push({ day: a.day_of_week, start: a.start_time, end: a.end_time, userId: a.user_id || null, userName: u?.name || null, role: u?.role || null });
  });

  const isAvail = (roomId, day, start, end) =>
    !grid[roomId]?.some(a => a.day === day && overlap(start, end, a.start, a.end));

  const newAssignments = [];
  const conflicts = [];
  const preferenceConflicts = [];
  const assignmentTrace = [];

  const reserve = (roomId, day, start, end, userId, role, userName) => {
    grid[roomId].push({ day, start, end, userId, role, userName });
    newAssignments.push({ user_id: userId, room_id: roomId, day_of_week: day, start_time: start, end_time: end });
  };

  function effectiveSlots(role, slots) {
    return slots.flatMap(s => {
      if (s.day_of_week !== 3) return [s];
      const psychRoles = ['supervisor', 'clinical_intern', 'educational_intern'];
      let freeStart = null, freeEnd = null;
      if (psychRoles.includes(role)) { freeStart = '09:00'; freeEnd = '13:00'; }
      if (role === 'art_therapist') { freeStart = '11:00'; freeEnd = '13:00'; }
      if (!freeStart) return [s];
      const result = [];
      if (toMin(s.start_time) < toMin(freeStart)) result.push({ ...s, end_time: freeStart });
      if (toMin(s.end_time) > toMin(freeEnd)) result.push({ ...s, start_time: freeEnd });
      return result;
    });
  }

  // ── Process users by priority ─────────────────────────────────────────────
  for (const user of sorted) {
    const rawSlots = userSched[user.id] ?? [];
    if (!rawSlots.length) continue;
    const slots = effectiveSlots(user.role, rawSlots);
    const preferredId = getPreferredId(rawSlots);
    const currentRoomId = currentRooms[user.id];
    const isMoving = wantToMoveIds.has(user.id);

    if (isMoving) {
      // ── wantToMove: try to get preferred room for ALL slots ───────────────
      let chosenRoom = null;
      const pr = regularRooms.find(r => r.id === preferredId);

      if (pr && slots.every(s => isAvail(preferredId, s.day_of_week, s.start_time, s.end_time))) {
        chosenRoom = pr;
      }

      // Preferred partially available → per-slot (assign to preferred where free)
      const preferredPartiallyAvail = pr &&
        slots.some(s => isAvail(preferredId, s.day_of_week, s.start_time, s.end_time));

      if (!chosenRoom && !preferredPartiallyAvail) {
        for (const room of regularRooms) {
          if (slots.every(s => isAvail(room.id, s.day_of_week, s.start_time, s.end_time))) { chosenRoom = room; break; }
        }
      }

      // Move conflict: target room occupied (at least partially)
      if (pr && (!chosenRoom || chosenRoom.id !== preferredId)) {
        const blockersMap = new Map();
        slots.forEach(s => {
          (grid[preferredId] || [])
            .filter(a => a.day === s.day_of_week && overlap(s.start_time, s.end_time, a.start, a.end) && a.userId)
            .forEach(b => {
              const key = `${b.userId}-${b.day}`;
              if (!blockersMap.has(key))
                blockersMap.set(key, { userId: b.userId, userName: b.userName, day: b.day, start: b.start, end: b.end });
            });
        });
        const allBlockers = [...blockersMap.values()];
        if (allBlockers.length) {
          preferenceConflicts.push({
            userId: user.id, userName: user.name, role: user.role,
            wantedRoomId: preferredId, wantedRoomName: pr?.name,
            takenByUserId: allBlockers[0].userId, takenByUserName: allBlockers[0].userName,
            assignedRoomName: chosenRoom?.name || null,
            blockers: allBlockers,
            slots: slots.map(s => ({ day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time })),
          });
        }
      }

      if (chosenRoom) {
        slots.forEach(s => reserve(chosenRoom.id, s.day_of_week, s.start_time, s.end_time, user.id, user.role, user.name));
      } else {
        // Per-slot: preferred where free → any
        const unassigned = [];
        for (const s of slots) {
          let slotRoom = null;
          if (preferredId && isAvail(preferredId, s.day_of_week, s.start_time, s.end_time))
            slotRoom = regularRooms.find(r => r.id === preferredId) || null;
          if (!slotRoom)
            slotRoom = regularRooms.find(r => isAvail(r.id, s.day_of_week, s.start_time, s.end_time)) || null;
          if (slotRoom) reserve(slotRoom.id, s.day_of_week, s.start_time, s.end_time, user.id, user.role, user.name);
          else unassigned.push(s);
        }
        if (unassigned.length) conflicts.push({ userId: user.id, userName: user.name, role: user.role, slots: unassigned });
      }

      const gotRooms = newAssignments.filter(a => a.user_id === user.id).map(a => a.room_id);
      assignmentTrace.push({
        userId: user.id, userName: user.name, role: user.role,
        wanted: pr?.name, wantedType: 'move_request',
        result: gotRooms.includes(preferredId) ? 'got_wanted' : (gotRooms.length ? 'got_other' : 'unassigned'),
        gotRoom: rooms.find(r => r.id === gotRooms[0])?.name || null,
      });

    } else {
      // ── Stay / extend / new: process sub-slots not yet covered ────────────
      // Compute actual gaps: schedule says 14:00-17:00, existing covers 15:00-17:00
      // → only 14:00-15:00 needs to be assigned (and will show as conflict if blocked).
      const toProcess = [];
      for (const s of slots) {
        toProcess.push(...uncoveredSubSlots(user.id, s.day_of_week, s.start_time, s.end_time, s));
      }
      if (!toProcess.length) continue; // fully covered — keep as-is

      const targetRoomId = preferredId || currentRoomId;
      for (const s of toProcess) {
        // Is this an extension of an existing day, or a brand-new day for this user?
        const hasExistingOnDay = (existingByUser[user.id] || []).some(a => a.day_of_week === s.day_of_week);
        let slotRoom = null;
        // Always try preferred/current room first
        if (targetRoomId && isAvail(targetRoomId, s.day_of_week, s.start_time, s.end_time))
          slotRoom = regularRooms.find(r => r.id === targetRoomId) || null;
        // For new days (no existing assignment on this day): fall back to any free room
        // For hour extensions (user already has a room on this day): don't move to a different room —
        // show a conflict instead so the admin is aware and can decide.
        if (!slotRoom && !hasExistingOnDay)
          slotRoom = regularRooms.find(r => isAvail(r.id, s.day_of_week, s.start_time, s.end_time)) || null;
        if (slotRoom) reserve(slotRoom.id, s.day_of_week, s.start_time, s.end_time, user.id, user.role, user.name);
        else conflicts.push({ userId: user.id, userName: user.name, role: user.role, slots: [s] });
      }
    }
  }

  // ── Cleanup: remove assignments that no longer have a schedule slot ───────
  // If an employee removed a day (or hours) from their regular_schedule,
  // any existing assignment that no longer overlaps with ANY schedule slot
  // on that day should be released automatically.
  // Applies only to stay/extend users — wantToMove users are handled below.
  const staleIds = [];
  for (const [uidStr, existing] of Object.entries(existingByUser)) {
    const uid = +uidStr;
    if (wantToMoveIds.has(uid)) continue;
    for (const a of existing) {
      const stillNeeded = (userSched[uid] || []).some(s =>
        s.day_of_week === a.day_of_week && overlap(s.start_time, s.end_time, a.start_time, a.end_time)
      );
      if (!stillNeeded) staleIds.push(a.id);
    }
  }
  if (staleIds.length) {
    db.get('room_assignments').remove(a => staleIds.includes(a.id)).write();
  }

  // ── Write changes ─────────────────────────────────────────────────────────
  // Only clear and rewrite assignments for wantToMove users.
  // All other users' assignments are untouched in the DB.
  if (wantToMoveIds.size) {
    db.get('room_assignments')
      .remove(a => a.assignment_type === 'permanent' && wantToMoveIds.has(a.user_id))
      .write();
  }
  newAssignments.forEach(a => {
    db.get('room_assignments').push({
      id: nextId('room_assignments'), ...a,
      assignment_type: 'permanent', specific_date: null,
      created_at: new Date().toISOString(),
    }).write();
  });

  // ── userStats ─────────────────────────────────────────────────────────────
  const userStats = {};
  for (const user of sorted) {
    const rawSlots = userSched[user.id] ?? [];
    if (!rawSlots.length) continue;
    const allAssigned = [
      ...(wantToMoveIds.has(user.id) ? [] : (existingByUser[user.id] || [])),
      ...newAssignments.filter(a => a.user_id === user.id),
    ];
    const assignedRooms = [...new Set(allAssigned.map(a => a.room_id))]
      .map(rid => rooms.find(r => r.id === rid)?.name).filter(Boolean);
    const effSlots = effectiveSlots(user.role, rawSlots);
    const unassignedDays = effSlots
      .filter(s => !allAssigned.some(a => a.day_of_week === s.day_of_week && overlap(a.start_time, a.end_time, s.start_time, s.end_time)))
      .map(s => DAYS_HE[s.day_of_week]);
    userStats[user.id] = { name: user.name, totalSlots: rawSlots.length, assignedSlots: allAssigned.length, assignedRooms, unassignedDays };
  }

  const suggestions = conflicts.length ? suggestResolutions(conflicts, grid, regularRooms) : [];

  return {
    assigned: newAssignments.length,
    conflicts,
    preferenceConflicts,
    assignmentTrace,
    suggestions,
    userStats,
    message: conflicts.length
      ? `השיבוץ הושלם עם ${conflicts.length} התנגשויות`
      : newAssignments.length
        ? `השיבוץ עודכן — ${newAssignments.length} שיבוצים חדשים`
        : 'הכל תקין — אין שינויים נדרשים',
  };
}

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'];

function minToTime(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function freeBlocksInRange(startMin, endMin, occupied) {
  // occupied: [{start, end}] strings for this room+day
  const busy = occupied
    .map(o => ({ s: toMin(o.start), e: toMin(o.end) }))
    .filter(o => o.s < endMin && o.e > startMin)
    .sort((a, b) => a.s - b.s);

  const blocks = [];
  let cur = startMin;
  for (const b of busy) {
    if (b.s > cur) blocks.push({ start: minToTime(cur), end: minToTime(b.s), dur: b.s - cur });
    cur = Math.max(cur, b.e);
  }
  if (cur < endMin) blocks.push({ start: minToTime(cur), end: minToTime(endMin), dur: endMin - cur });
  return blocks;
}

function gridAvail(grid, roomId, day, start, end) {
  return !grid[roomId]?.some(a => a.day === day && overlap(start, end, a.start, a.end));
}

function suggestResolutions(conflicts, grid, regularRooms) {
  return conflicts.map(conflict => {
    const slotSuggestions = conflict.slots.map(slot => {
      const { day_of_week: day, start_time: start, end_time: end } = slot;
      const startMin = toMin(start), endMin = toMin(end);
      const tips = [];

      // 1. Partial coverage — find free blocks per room, build a cover
      const roomBlocks = regularRooms.flatMap(room => {
        const occ = (grid[room.id] || []).filter(a => a.day === day).map(a => ({ start: a.start, end: a.end }));
        return freeBlocksInRange(startMin, endMin, occ)
          .filter(b => b.dur >= 60)
          .map(b => ({ roomId: room.id, room: room.name, ...b }));
      }).sort((a, b) => b.dur - a.dur);

      if (roomBlocks.length > 0) {
        let remaining = [{ s: startMin, e: endMin }];
        const used = [];
        for (const blk of roomBlocks) {
          if (!remaining.length) break;
          const bs = toMin(blk.start), be = toMin(blk.end);
          const newRemaining = [];
          let usedThis = false;
          for (const gap of remaining) {
            if (bs <= gap.s && be >= gap.e) { usedThis = true; }
            else if (bs > gap.s && be < gap.e) { newRemaining.push({ s: gap.s, e: bs }); newRemaining.push({ s: be, e: gap.e }); usedThis = true; }
            else if (bs <= gap.s && be > gap.s && be < gap.e) { newRemaining.push({ s: be, e: gap.e }); usedThis = true; }
            else if (bs > gap.s && bs < gap.e && be >= gap.e) { newRemaining.push({ s: gap.s, e: bs }); usedThis = true; }
            else newRemaining.push(gap);
          }
          if (usedThis) { used.push(blk); remaining = newRemaining; }
        }
        if (used.length > 0 && used.length <= 3) {
          const uncovered = remaining.reduce((t, g) => t + g.e - g.s, 0);
          const tipType = uncovered === 0 ? 'split' : 'partial';
          const coveredMin = (endMin - startMin) - uncovered;
          const label = uncovered === 0
            ? 'פיצול בין חדרים (מכסה את כל השעות)'
            : `כיסוי חלקי (${Math.round(coveredMin/60*10)/10} שעות מתוך ${Math.round((endMin-startMin)/60*10)/10})`;
          tips.push({
            type: tipType, label,
            items: used.map(b => `${b.room}: ${b.start}–${b.end}`),
            action: { type: tipType, conflictUserId: conflict.userId, day, parts: used.map(b => ({ roomId: b.roomId, roomName: b.room, start: b.start, end: b.end })) }
          });
        }
      }

      // 2. Time shift — try ±30 and ±60 min on start or end
      const shifts = [
        { ns: startMin + 30, ne: endMin, label: 'התחלה 30 דקות מאוחר יותר' },
        { ns: startMin + 60, ne: endMin, label: 'התחלה שעה מאוחר יותר' },
        { ns: startMin, ne: endMin - 30, label: 'סיום 30 דקות מוקדם יותר' },
        { ns: startMin, ne: endMin - 60, label: 'סיום שעה מוקדם יותר' },
        { ns: startMin - 30, ne: endMin, label: 'התחלה 30 דקות מוקדם יותר' },
        { ns: startMin - 60, ne: endMin, label: 'התחלה שעה מוקדם יותר' },
      ];
      for (const sh of shifts) {
        if (sh.ne - sh.ns < 60 || sh.ns < 0) continue;
        const ns = minToTime(sh.ns), ne = minToTime(sh.ne);
        const room = regularRooms.find(r => gridAvail(grid, r.id, day, ns, ne));
        if (room) {
          tips.push({
            type: 'shift', label: sh.label,
            items: [`${room.name}: ${ns}–${ne}`],
            action: { type: 'shift', conflictUserId: conflict.userId, day, roomId: room.id, roomName: room.name, start: ns, end: ne }
          });
          break;
        }
      }

      // (alt_day suggestions removed — changing schedule days is not relevant here)

      // 4. Displacement — move a lower-priority user to free up space
      const PRIORITY = { psychiatrist: 0, supervisor: 1, art_therapist: 2, clinical_intern: 3, educational_intern: 4 };
      const conflictPriority = PRIORITY[conflict.role] ?? 9;

      for (const room of regularRooms) {
        const blockers = (grid[room.id] || []).filter(a =>
          a.day === day && overlap(start, end, a.start, a.end) &&
          a.userName && (PRIORITY[a.role] ?? 9) > conflictPriority
        );
        for (const blocker of blockers) {
          const altRoom = regularRooms.find(r => r.id !== room.id && gridAvail(grid, r.id, day, blocker.start, blocker.end));
          if (altRoom) {
            tips.push({
              type: 'displace',
              label: 'העברת עובד בעדיפות נמוכה יותר',
              items: [`העבר ${blocker.userName} מ-${room.name} ל-${altRoom.name} (${blocker.start}–${blocker.end})`],
              action: {
                type: 'displace',
                conflictUserId: conflict.userId, conflictUserName: conflict.userName,
                conflictStart: start, conflictEnd: end,
                displaceUserId: blocker.userId, displaceUserName: blocker.userName,
                fromRoomId: room.id, fromRoomName: room.name,
                toRoomId: altRoom.id, toRoomName: altRoom.name,
                displaceStart: blocker.start, displaceEnd: blocker.end, day,
              }
            });
            if (tips.filter(t => t.type === 'displace').length >= 2) break;
          }
        }
        if (tips.filter(t => t.type === 'displace').length >= 2) break;
      }

      return { day: DAYS_HE[day], time: `${start}–${end}`, start_time: start, end_time: end, day_of_week: day, tips };
    });

    return { userId: conflict.userId, userName: conflict.userName, slots: slotSuggestions };
  });
}

module.exports = router;
