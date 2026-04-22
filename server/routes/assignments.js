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
  const a = { id: nextId('room_assignments'), user_id: +user_id, room_id: +room_id, day_of_week: +day_of_week, start_time, end_time, assignment_type: assignment_type ?? 'permanent', specific_date: specific_date || null, created_at: new Date().toISOString() };
  db.get('room_assignments').push(a).write();
  res.json({ id: a.id });
});

router.delete('/clear/permanent', requireAdmin, (req, res) => {
  db.get('room_assignments').remove({ assignment_type: 'permanent' }).write();
  res.json({ message: 'כל השיבוצים הקבועים נמחקו' });
});

router.delete('/:id', requireAdmin, (req, res) => {
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

  try {

  if (action.type === 'split' || action.type === 'partial') {
    action.parts.forEach(p => push({ user_id: action.conflictUserId, room_id: p.roomId, day_of_week: action.day, start_time: p.start, end_time: p.end }));
    return res.json({ message: 'שיבוץ חלקי הוחל בהצלחה' });
  }

  if (action.type === 'shift') {
    push({ user_id: action.conflictUserId, room_id: action.roomId, day_of_week: action.day, start_time: action.start, end_time: action.end });
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
    // Assign conflict user to freed room
    push({ user_id: +action.conflictUserId, room_id: +action.fromRoomId, day_of_week: +action.day, start_time: action.conflictStart, end_time: action.conflictEnd });
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

  const userSched = {};
  schedules.forEach(s => { (userSched[s.user_id] = userSched[s.user_id] || []).push(s); });

  const grid = {}; // roomId -> [{day, start, end, userId, role, userName}]
  rooms.forEach(r => (grid[r.id] = []));

  const usersWithSchedules = new Set(schedules.map(s => s.user_id));

  // processableUserIds: active users who have schedules — these are the only users
  // whose assignments will be cleared and re-created by the algorithm.
  // Inactive or schedule-less users keep their existing assignments and
  // their rooms are protected in the grid so the algorithm doesn't overwrite them.
  const processableUserIds = new Set(users.map(u => u.id).filter(id => usersWithSchedules.has(id)));

  // Record each processable user's most-used current room before clearing.
  // All other users' rooms go into the grid so they're treated as occupied.
  const roomCounts = {};
  db.get('room_assignments').filter({ assignment_type: 'permanent' }).value().forEach(a => {
    if (processableUserIds.has(a.user_id)) {
      if (!roomCounts[a.user_id]) roomCounts[a.user_id] = {};
      roomCounts[a.user_id][a.room_id] = (roomCounts[a.user_id][a.room_id] || 0) + 1;
    } else if (grid[a.room_id]) {
      // Inactive users / users without schedules — protect their rooms in the grid
      grid[a.room_id].push({ day: a.day_of_week, start: a.start_time, end: a.end_time });
    }
  });

  const currentRooms = {}; // userId -> roomId (their primary current room)
  Object.entries(roomCounts).forEach(([uid, counts]) => {
    currentRooms[+uid] = +Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  });

  const newAssignments = [];
  const conflicts = [];
  const preferenceConflicts = [];
  const assignmentTrace = []; // per-user: what they wanted, what blocked them, what they got

  const isAvail = (roomId, day, start, end) =>
    !grid[roomId]?.some(a => a.day === day && overlap(start, end, a.start, a.end));

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

  const PRIORITY = { admin: -1, psychiatrist: 0, supervisor: 1, art_therapist: 2, clinical_intern: 3, educational_intern: 4 };
  const sorted = [...users].sort((a, b) => (PRIORITY[a.role] ?? 9) - (PRIORITY[b.role] ?? 9));
  // Include both regular and committee rooms — committee rooms are used as
  // regular offices on non-meeting days; Wednesday meeting times are protected
  // by effectiveSlots() which removes those hours from employee schedules.
  const regularRooms = rooms.filter(r => r.room_type === 'regular' || r.room_type === 'committee');

  // Helper: get preferredId for a user's rawSlots
  const getPreferredId = rawSlots => {
    const val = rawSlots.find(s => s.preferred_room_id)?.preferred_room_id;
    return val ? +val : null;
  };

  // Build index of which rooms are explicitly preferred by someone —
  // "current room" continuity must yield to another user's explicit preference.
  const roomPreferredBy = new Map(); // roomId -> Set of userIds who prefer it
  for (const user of sorted) {
    const rawSlots = userSched[user.id] ?? [];
    const pid = getPreferredId(rawSlots);
    if (pid) {
      if (!roomPreferredBy.has(pid)) roomPreferredBy.set(pid, new Set());
      roomPreferredBy.get(pid).add(user.id);
    }
  }
  // Returns true if using roomId as "current room" would block someone else's explicit preference
  const blocksPreference = (roomId, userId) => {
    const preferrers = roomPreferredBy.get(roomId);
    return preferrers && [...preferrers].some(uid => uid !== userId);
  };

  // ─── Pass 1: Pre-reservation ────────────────────────────────────────────────
  // Users whose preferred room matches their current room get it guaranteed,
  // before role-priority even applies. This implements: "if you're already in
  // room X and request room X, you keep it regardless of who else wants it."
  const preReserved = new Set(); // user IDs handled in this pass
  for (const user of sorted) {
    const rawSlots = userSched[user.id] ?? [];
    if (!rawSlots.length) continue;
    const preferredId = getPreferredId(rawSlots);
    const currentRoomId = currentRooms[user.id];
    // Both preferred AND current must point to the same room
    if (!preferredId || preferredId !== currentRoomId) continue;
    const pr = regularRooms.find(r => r.id === preferredId);
    if (!pr) continue;
    const slots = effectiveSlots(user.role, rawSlots);
    if (slots.every(s => isAvail(preferredId, s.day_of_week, s.start_time, s.end_time))) {
      slots.forEach(s => reserve(preferredId, s.day_of_week, s.start_time, s.end_time, user.id, user.role, user.name));
      preReserved.add(user.id);
      assignmentTrace.push({ userId: user.id, userName: user.name, role: user.role, wanted: pr.name, wantedType: 'preferred+current', result: 'got_wanted' });
    }
    // If room unavailable even for pre-reserved candidate, fall through to pass 2
  }

  // ─── Pass 2: Main assignment ─────────────────────────────────────────────────
  for (const user of sorted) {
    if (preReserved.has(user.id)) continue; // already handled
    const rawSlots = userSched[user.id] ?? [];
    if (!rawSlots.length) continue;
    const slots = effectiveSlots(user.role, rawSlots);

    const preferredId = getPreferredId(rawSlots);
    const currentRoomId = currentRooms[user.id];
    let chosenRoom = null;

    // 1. Try preferred room (explicit preference takes priority)
    let preferredBlocked = null;
    if (preferredId) {
      const pr = regularRooms.find(r => r.id === preferredId);
      if (pr && slots.every(s => isAvail(preferredId, s.day_of_week, s.start_time, s.end_time))) {
        chosenRoom = pr;
      } else if (pr) {
        // Record what's blocking the preferred room
        const blockedSlots = slots.filter(s => !isAvail(preferredId, s.day_of_week, s.start_time, s.end_time));
        preferredBlocked = blockedSlots.map(s => {
          const blocker = (grid[preferredId] || []).find(a => a.day === s.day_of_week && overlap(s.start_time, s.end_time, a.start, a.end));
          return { day: DAYS_HE[s.day_of_week], blockedBy: blocker?.userName || '?' };
        });
      }
    }

    // 2. Try current room (maintain continuity) — but not if someone else explicitly prefers it
    let currentBlocked = null;
    if (!chosenRoom && currentRoomId && !blocksPreference(currentRoomId, user.id)) {
      const cr = regularRooms.find(r => r.id === currentRoomId);
      if (cr && slots.every(s => isAvail(currentRoomId, s.day_of_week, s.start_time, s.end_time))) {
        chosenRoom = cr;
      } else if (cr) {
        const blockedSlots = slots.filter(s => !isAvail(currentRoomId, s.day_of_week, s.start_time, s.end_time));
        currentBlocked = blockedSlots.map(s => {
          const blocker = (grid[currentRoomId] || []).find(a => a.day === s.day_of_week && overlap(s.start_time, s.end_time, a.start, a.end));
          return { day: DAYS_HE[s.day_of_week], blockedBy: blocker?.userName || '?' };
        });
      }
    }

    // 3. Find any free room
    if (!chosenRoom) {
      for (const room of regularRooms) {
        if (slots.every(s => isAvail(room.id, s.day_of_week, s.start_time, s.end_time))) { chosenRoom = room; break; }
      }
    }

    // Record trace for this user
    const wantedRoom = preferredId ? rooms.find(r => r.id === preferredId) : (currentRoomId ? rooms.find(r => r.id === currentRoomId) : null);
    if (wantedRoom || chosenRoom) {
      const traceEntry = { userId: user.id, userName: user.name, role: user.role };
      if (wantedRoom) {
        traceEntry.wanted = wantedRoom.name;
        traceEntry.wantedType = preferredId ? 'preferred' : 'current';
        if (chosenRoom && chosenRoom.id === (preferredId || currentRoomId)) {
          traceEntry.result = 'got_wanted';
        } else {
          traceEntry.result = chosenRoom ? 'got_other' : 'unassigned';
          traceEntry.gotRoom = chosenRoom?.name || null;
          traceEntry.blockedReasons = preferredBlocked || currentBlocked || [];
        }
      } else {
        traceEntry.wanted = null;
        traceEntry.result = chosenRoom ? 'no_preference' : 'unassigned';
        traceEntry.gotRoom = chosenRoom?.name || null;
      }
      assignmentTrace.push(traceEntry);
    }

    // Detect preference conflict: user wanted a specific room but didn't get it.
    // Collect ALL blockers (not just first) so admin can choose whom to displace.
    const wantedRoomId = preferredId || currentRoomId;
    if (wantedRoomId && (!chosenRoom || chosenRoom.id !== wantedRoomId)) {
      const wantedRoomObj = rooms.find(r => r.id === wantedRoomId);
      const blockersMap = new Map();
      slots.forEach(s => {
        (grid[wantedRoomId] || [])
          .filter(a => a.day === s.day_of_week && overlap(s.start_time, s.end_time, a.start, a.end))
          .forEach(b => {
            const key = `${b.userId}-${b.day}`;
            if (!blockersMap.has(key))
              blockersMap.set(key, { userId: b.userId, userName: b.userName, day: b.day, start: b.start, end: b.end });
          });
      });
      const allBlockers = [...blockersMap.values()];
      if (allBlockers.length > 0) {
        preferenceConflicts.push({
          userId: user.id,
          userName: user.name,
          role: user.role,
          wantedRoomId,
          wantedRoomName: wantedRoomObj?.name,
          takenByUserId: allBlockers[0].userId,
          takenByUserName: allBlockers[0].userName,
          assignedRoomName: chosenRoom?.name || null,
          blockers: allBlockers,
          slots: slots.map(s => ({ day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time })),
        });
      }
    }

    if (chosenRoom) {
      slots.forEach(s => reserve(chosenRoom.id, s.day_of_week, s.start_time, s.end_time, user.id, user.role, user.name));
    } else {
      // No single room fits all days — assign per slot, preferring preferred→current→any
      const unassigned = [];
      for (const s of slots) {
        let slotRoom = null;
        if (preferredId && isAvail(preferredId, s.day_of_week, s.start_time, s.end_time))
          slotRoom = regularRooms.find(r => r.id === preferredId) || null;
        if (!slotRoom && currentRoomId && !blocksPreference(currentRoomId, user.id) && isAvail(currentRoomId, s.day_of_week, s.start_time, s.end_time))
          slotRoom = regularRooms.find(r => r.id === currentRoomId) || null;
        if (!slotRoom)
          slotRoom = regularRooms.find(r => isAvail(r.id, s.day_of_week, s.start_time, s.end_time)) || null;
        if (slotRoom) reserve(slotRoom.id, s.day_of_week, s.start_time, s.end_time, user.id, user.role, user.name);
        else unassigned.push(s);
      }
      if (unassigned.length) conflicts.push({ userId: user.id, userName: user.name, role: user.role, slots: unassigned });
    }
  }

  // Build userStats for conflict resolution UI
  const userStats = {};
  for (const user of sorted) {
    const rawSlots = userSched[user.id] ?? [];
    if (!rawSlots.length) continue;
    const assigned = newAssignments.filter(a => a.user_id === user.id);
    const assignedRooms = [...new Set(assigned.map(a => a.room_id))]
      .map(rid => rooms.find(r => r.id === rid)?.name).filter(Boolean);
    const unassignedDays = rawSlots.filter(s => !assigned.some(a => a.day_of_week === s.day_of_week)).map(s => DAYS_HE[s.day_of_week]);
    userStats[user.id] = { name: user.name, totalSlots: rawSlots.length, assignedSlots: assigned.length, assignedRooms, unassignedDays };
  }

  // Only clear assignments for processable users (non-admin active users with schedules).
  // Admin and users without schedules keep their existing assignments unchanged.
  const toClear = [...processableUserIds];
  db.get('room_assignments')
    .remove(a => a.assignment_type === 'permanent' && toClear.includes(a.user_id))
    .write();
  newAssignments.forEach(a => {
    db.get('room_assignments').push({ id: nextId('room_assignments'), ...a, assignment_type: 'permanent', specific_date: null, created_at: new Date().toISOString() }).write();
  });

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
      : `השיבוץ הושלם בהצלחה! שובצו ${newAssignments.length} משבצות`,
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

      // 3. Alternative days (info only — schedule change required)
      const altDays = [];
      for (let d = 0; d <= 4; d++) {
        if (d === day) continue;
        const room = regularRooms.find(r => gridAvail(grid, r.id, d, start, end));
        if (room) altDays.push(`יום ${DAYS_HE[d]} — ${room.name}`);
      }
      if (altDays.length) tips.push({ type: 'alt_day', label: 'ימים חלופיים עם חדר פנוי', items: altDays.slice(0, 3) });

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

      return { day: DAYS_HE[day], time: `${start}–${end}`, tips };
    });

    return { userName: conflict.userName, slots: slotSuggestions };
  });
}

module.exports = router;
