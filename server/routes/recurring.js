const express = require('express');
const { db, nextId } = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Compute occurrences of a recurring pattern within [from, to] date range,
// applying exceptions. Returns array of { date, exception } objects.
function occurrencesInRange(pattern, exceptions, from, to) {
  const results = [];
  const fromDate = new Date(from);
  const toDate = new Date(to);

  // Find first occurrence on or after from
  let cur = new Date(pattern.active_from);
  // Advance to the right day_of_week
  while (cur.getDay() !== pattern.day_of_week) {
    cur.setDate(cur.getDate() + 1);
  }

  const activeUntil = pattern.active_until ? new Date(pattern.active_until) : null;

  const step = (pattern.interval_weeks || 1) * 7;
  while (cur <= toDate) {
    if (activeUntil && cur > activeUntil) break;
    if (cur >= fromDate) {
      const dateStr = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
      const ex = exceptions.find(e => e.recurring_id === pattern.id && e.exception_date === dateStr);
      if (!ex || ex.type !== 'skip') {
        results.push({ date: dateStr, exception: ex || null });
      }
      // If moved, also include the moved_to_date if it falls in range
      if (ex && ex.type === 'moved' && ex.moved_to_date >= from && ex.moved_to_date <= to) {
        results.push({ date: ex.moved_to_date, exception: ex, isMoved: true });
      }
    }
    cur.setDate(cur.getDate() + step);
  }

  return results;
}

// GET /api/recurring-absences — current user's patterns
router.get('/', (req, res) => {
  const patterns = db.get('recurring_absences').filter({ user_id: req.user.id }).value();
  const exceptions = db.get('recurring_absence_exceptions').value();
  res.json(patterns.map(p => ({ ...p, exceptions: exceptions.filter(e => e.recurring_id === p.id) })));
});

// GET /api/recurring-absences/upcoming?weeks=4 — next N weeks of occurrences for all patterns
// Includes skipped occurrences (isSkipped:true), moved-away (exception.type==='moved', !isMoved),
// and moved-here (isMoved:true) so the UI can render restore/skip/move controls for all states.
router.get('/upcoming', (req, res) => {
  const weeks = Math.min(parseInt(req.query.weeks) || 4, 12);
  const patterns = db.get('recurring_absences').filter({ user_id: req.user.id }).value();
  const allExceptions = db.get('recurring_absence_exceptions').value();

  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dateStr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  const from = dateStr(today);
  const toDate = new Date(today);
  toDate.setDate(toDate.getDate() + weeks * 7);
  const to = dateStr(toDate);
  const fromDate = new Date(from);

  const result = patterns.map(p => {
    const patExceptions = allExceptions.filter(e => e.recurring_id === p.id);
    const occurrences = occurrencesInRange(p, patExceptions, from, to);

    // Add skipped occurrences (excluded from occurrencesInRange) so user can restore them
    let cur = new Date(p.active_from);
    while (cur.getDay() !== p.day_of_week) cur.setDate(cur.getDate() + 1);
    const activeUntil = p.active_until ? new Date(p.active_until) : null;
    const step = (p.interval_weeks || 1) * 7;
    while (cur <= toDate) {
      if (activeUntil && cur > activeUntil) break;
      if (cur >= fromDate) {
        const ds = dateStr(cur);
        const ex = patExceptions.find(e => e.exception_date === ds && e.type === 'skip');
        if (ex) occurrences.push({ date: ds, exception: ex, isSkipped: true });
      }
      cur.setDate(cur.getDate() + step);
    }

    occurrences.sort((a, b) => a.date.localeCompare(b.date));
    return { pattern: p, occurrences };
  });
  res.json(result);
});

// POST /api/recurring-absences — create pattern
router.post('/', (req, res) => {
  const { day_of_week, interval_weeks, start_time, end_time, active_from, active_until, notes } = req.body;
  if (day_of_week == null || !active_from) return res.status(400).json({ error: 'נדרשים day_of_week ו-active_from' });
  if (start_time && !end_time) return res.status(400).json({ error: 'נדרשת שעת סיום' });

  const pattern = {
    id: nextId('recurring_absences'),
    user_id: req.user.id,
    day_of_week: +day_of_week,
    interval_weeks: interval_weeks ? +interval_weeks : 1,
    start_time: start_time || null,
    end_time: end_time || null,
    active_from,
    active_until: active_until || null,
    notes: notes || null,
    created_at: new Date().toISOString(),
  };
  db.get('recurring_absences').push(pattern).write();
  res.json(pattern);
});

// DELETE /api/recurring-absences/:id — delete pattern and its exceptions
router.delete('/:id', (req, res) => {
  const id = +req.params.id;
  const pattern = db.get('recurring_absences').find(p => p.id === id && +p.user_id === +req.user.id).value();
  if (!pattern) return res.status(404).json({ error: 'לא נמצא' });
  db.get('recurring_absences').remove({ id }).write();
  db.get('recurring_absence_exceptions').remove({ recurring_id: id }).write();
  res.json({ ok: true });
});

// POST /api/recurring-absences/:id/exceptions — add skip or move exception
router.post('/:id/exceptions', (req, res) => {
  const recurring_id = +req.params.id;
  const pattern = db.get('recurring_absences').find(p => p.id === recurring_id && +p.user_id === +req.user.id).value();
  if (!pattern) return res.status(404).json({ error: 'לא נמצא' });

  const { exception_date, type, moved_to_date } = req.body;
  if (!exception_date || !['skip', 'moved'].includes(type)) return res.status(400).json({ error: 'פרמטרים שגויים' });
  if (type === 'moved' && !moved_to_date) return res.status(400).json({ error: 'נדרש תאריך חדש' });

  // Remove any existing exception for this date
  db.get('recurring_absence_exceptions').remove({ recurring_id, exception_date }).write();

  const ex = {
    id: nextId('recurring_absence_exceptions'),
    recurring_id,
    exception_date,
    type,
    moved_to_date: type === 'moved' ? moved_to_date : null,
  };
  db.get('recurring_absence_exceptions').push(ex).write();
  res.json(ex);
});

// DELETE /api/recurring-absences/:id/exceptions/:exId — restore a skipped/moved week
router.delete('/:id/exceptions/:exId', (req, res) => {
  const recurring_id = +req.params.id;
  const exId = +req.params.exId;
  const pattern = db.get('recurring_absences').find(p => p.id === recurring_id && +p.user_id === +req.user.id).value();
  if (!pattern) return res.status(404).json({ error: 'לא נמצא' });
  db.get('recurring_absence_exceptions').remove({ id: exId, recurring_id }).write();
  res.json({ ok: true });
});

module.exports = { router, occurrencesInRange };
