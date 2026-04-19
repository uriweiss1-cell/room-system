const express = require('express');
const { db, nextId } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const overlap = (s1, e1, s2, e2) => toMin(s1) < toMin(e2) && toMin(e1) > toMin(s2);

function enrichAssignment(a) {
  const room = db.get('rooms').find({ id: a.room_id }).value();
  const user = db.get('users').find({ id: a.user_id }).value();
  return { ...a, room_name: room?.name, user_name: user?.name, role: user?.role };
}

router.get('/my', (req, res) => {
  const list = db.get('room_assignments').filter({ user_id: req.user.id, assignment_type: 'permanent' }).value().map(enrichAssignment);
  res.json(list);
});

router.get('/all', requireAdmin, (req, res) => {
  const list = db.get('room_assignments').filter({ assignment_type: 'permanent' }).value().map(enrichAssignment);
  res.json(list);
});

router.get('/query', (req, res) => {
  const { date, time } = req.query;
  if (!date || !time) return res.status(400).json({ error: 'נדרשים date ו-time' });
  const dayOfWeek = new Date(date).getDay();

  const absences = db.get('one_time_requests')
    .filter(r => r.specific_date === date && r.request_type === 'absence' && r.status === 'assigned')
    .filter(r => !r.start_time || (toMin(r.start_time) <= toMin(time) && toMin(r.end_time) > toMin(time)))
    .map('user_id').value();

  const regular = db.get('room_assignments')
    .filter(a => a.day_of_week === dayOfWeek && a.assignment_type === 'permanent'
      && toMin(a.start_time) <= toMin(time) && toMin(a.end_time) > toMin(time)
      && !absences.includes(a.user_id))
    .value().map(enrichAssignment);

  const oneTime = db.get('one_time_requests')
    .filter(r => r.specific_date === date && r.status === 'assigned' && r.request_type === 'room_request'
      && r.assigned_room_id && r.start_time && toMin(r.start_time) <= toMin(time) && toMin(r.end_time) > toMin(time))
    .value().map(r => {
      const user = db.get('users').find({ id: r.user_id }).value();
      const room = db.get('rooms').find({ id: r.assigned_room_id }).value();
      return { ...r, user_name: user?.name, role: user?.role, room_name: room?.name };
    });

  res.json({ date, time, dayOfWeek, regular, oneTime });
});

router.get('/locate', (req, res) => {
  const { userId, date, time } = req.query;
  if (!date || !time) return res.status(400).json({ error: 'נדרשים date ו-time' });
  const uid = userId ? +userId : req.user.id;
  const dayOfWeek = new Date(date).getDay();

  const oneTime = db.get('one_time_requests')
    .filter(r => r.user_id === uid && r.specific_date === date && r.status === 'assigned')
    .filter(r => !r.start_time || (toMin(r.start_time) <= toMin(time) && toMin(r.end_time) > toMin(time)))
    .first().value();

  if (oneTime) {
    if (oneTime.request_type === 'absence') return res.json({ room: null, message: 'העובד לא נמצא' });
    const room = db.get('rooms').find({ id: oneTime.assigned_room_id }).value();
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
    // Notify the displaced user
    const notifId = db.get('_ids.notifications').value();
    db.set('_ids.notifications', notifId + 1).write();
    db.get('notifications').push({
      id: notifId, user_id: +action.displaceUserId, read: false,
      message: `השיבוץ שלך עודכן: הועברת מ-${action.fromRoomName} ל-${action.toRoomName} (יום ${DAYS_HE[action.day]}, ${action.displaceStart}–${action.displaceEnd})`,
      created_at: new Date().toISOString(),
    }).write();
    return res.json({ message: `${action.displaceUserName} הועבר ל-${action.toRoomName}, ${action.fromRoomName} הוקצה ל-${action.conflictUserName}` });
  }

  res.status(400).json({ error: 'סוג פעולה לא ידוע' });
});

function generateAssignments() {
  const users = db.get('users').filter(u => u.is_active && u.role !== 'admin').value();
  const rooms = db.get('rooms').filter({ is_active: true }).value();
  const schedules = db.get('regular_schedules').value();

  const userSched = {};
  schedules.forEach(s => { (userSched[s.user_id] = userSched[s.user_id] || []).push(s); });

  const grid = {}; // roomId -> [{day, start, end}]
  rooms.forEach(r => (grid[r.id] = []));

  // Pre-fill grid with existing assignments for users NOT processed by this run
  const usersWithSchedules = new Set(schedules.map(s => s.user_id));
  db.get('room_assignments').filter({ assignment_type: 'permanent' }).value().forEach(a => {
    if (!usersWithSchedules.has(a.user_id) && grid[a.room_id]) {
      grid[a.room_id].push({ day: a.day_of_week, start: a.start_time, end: a.end_time });
    }
  });

  const newAssignments = [];
  const conflicts = [];

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

  const PRIORITY = { supervisor: 1, art_therapist: 2, clinical_intern: 3, educational_intern: 4, psychiatrist: 0 };
  const sorted = [...users].sort((a, b) => (PRIORITY[a.role] ?? 9) - (PRIORITY[b.role] ?? 9));
  const regularRooms = rooms.filter(r => r.room_type === 'regular');

  for (const user of sorted) {
    const rawSlots = userSched[user.id] ?? [];
    if (!rawSlots.length) continue;
    const slots = effectiveSlots(user.role, rawSlots);

    const preferredId = rawSlots.find(s => s.preferred_room_id)?.preferred_room_id;
    let chosenRoom = null;

    if (preferredId) {
      const pr = rooms.find(r => r.id === preferredId);
      if (pr && slots.every(s => isAvail(preferredId, s.day_of_week, s.start_time, s.end_time))) chosenRoom = pr;
    }

    if (!chosenRoom) {
      for (const room of regularRooms) {
        if (slots.every(s => isAvail(room.id, s.day_of_week, s.start_time, s.end_time))) { chosenRoom = room; break; }
      }
    }

    if (chosenRoom) {
      slots.forEach(s => reserve(chosenRoom.id, s.day_of_week, s.start_time, s.end_time, user.id, user.role, user.name));
    } else {
      const unassigned = [];
      for (const s of slots) {
        const room = regularRooms.find(r => isAvail(r.id, s.day_of_week, s.start_time, s.end_time));
        if (room) reserve(room.id, s.day_of_week, s.start_time, s.end_time, user.id, user.role, user.name);
        else unassigned.push(s);
      }
      if (unassigned.length) conflicts.push({ userId: user.id, userName: user.name, role: user.role, slots: unassigned });
    }
  }

  // Only clear assignments for users whose schedules were processed — preserve imported assignments
  const toClear = [...usersWithSchedules];
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
    suggestions,
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
