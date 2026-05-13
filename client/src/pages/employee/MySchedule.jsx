import { useState, useEffect } from 'react';
import api from '../../api';
import { DAYS } from '../../constants';
import { useAuth } from '../../context/AuthContext';

const WORK_DAYS = DAYS.slice(0, 5); // ראשון–חמישי
const defaultSlot = { day_of_week: 0, start_time: '08:00', end_time: '17:00', preferred_room_id: '' };

function getWeekDates(offset) {
  const today = new Date();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay() + offset * 7);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function MySchedule() {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [oneTimeItems, setOneTimeItems] = useState([]);
  const [editing, setEditing] = useState(false);
  const [slots, setSlots] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [editAssignForm, setEditAssignForm] = useState({ start_time: '', end_time: '' });
  const [weekOffset, setWeekOffset] = useState(0);

  const load = () => Promise.all([
    api.get('/schedules/my'),
    api.get('/assignments/my'),
    api.get('/rooms'),
    api.get('/requests/my'),
  ]).then(([s, a, r, req]) => {
    setSchedule(s.data);
    setAssignments(a.data);
    setRooms(r.data);
    setOneTimeItems(req.data.filter(x => x.status === 'assigned'));
  }).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const startEdit = () => {
    setSlots(schedule.length ? schedule.map(s => ({ ...s, preferred_room_id: s.preferred_room_id ?? '' })) : [{ ...defaultSlot }]);
    setEditing(true); setMsg('');
  };
  const addSlot = () => setSlots(p => [...p, { ...defaultSlot }]);
  const removeSlot = i => setSlots(p => p.filter((_, j) => j !== i));
  const updateSlot = (i, k, v) => setSlots(p => p.map((s, j) => j === i ? { ...s, [k]: v } : s));

  const deleteAssignment = async (id, label) => {
    if (!confirm(`למחוק לצמיתות את השיבוץ ${label}?\nהשינוי קבוע — השיבוץ לא יחזור גם אחרי הפעלת האלגוריתם.`)) return;
    await api.delete(`/assignments/my/${id}`);
    load();
    setMsg('השיבוץ נמחק');
  };

  const saveAssignmentEdit = async () => {
    try {
      await api.put(`/assignments/my/${editingAssignment.id}`, editAssignForm);
      load();
      setEditingAssignment(null);
      setMsg('השעות עודכנו');
    } catch (e) { setMsg('שגיאה: ' + (e.response?.data?.error || e.message)); }
  };

  // Group permanent assignments by day for "delete day" support
  const byDay = WORK_DAYS.map((_, i) => assignments.filter(a => a.day_of_week === i));

  const deleteDay = async (dayIdx) => {
    const daySlots = byDay[dayIdx];
    if (!daySlots.length) return;
    if (!confirm(`למחוק לצמיתות את כל השיבוצים ביום ${WORK_DAYS[dayIdx]}?\nהשינוי קבוע.`)) return;
    await Promise.all(daySlots.map(a => api.delete(`/assignments/my/${a.id}`)));
    load();
    setMsg(`שיבוצי יום ${WORK_DAYS[dayIdx]} נמחקו`);
  };

  const save = async () => {
    try {
      await api.put('/schedules/my', { schedules: slots.map(s => ({ ...s, preferred_room_id: s.preferred_room_id || null })) });
      load();
      setEditing(false); setMsg('לוח הזמנים עודכן בהצלחה');
    } catch (e) { setMsg('שגיאה: ' + (e.response?.data?.error || e.message)); }
  };

  const weekDates = getWeekDates(weekOffset);
  const today = todayISO();

  // Week label e.g. "12.5 – 16.5"
  const weekLabel = `${fmtDate(weekDates[0])} – ${fmtDate(weekDates[4])}`;

  if (loading) return <div className="text-center py-10 text-gray-500">טוען...</div>;

  return (
    <div className="space-y-5">
      {/* Edit assignment times modal */}
      {editingAssignment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditingAssignment(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg">עריכת שעות שיבוץ</h3>
            <div className="text-sm text-gray-600">
              <div><span className="font-medium">{editingAssignment.room_name}</span> — יום {DAYS[editingAssignment.day_of_week]}</div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="label">משעה</label>
                <input type="time" className="input w-full" value={editAssignForm.start_time}
                  onChange={e => setEditAssignForm(p => ({ ...p, start_time: e.target.value }))} />
              </div>
              <div className="flex-1">
                <label className="label">עד שעה</label>
                <input type="time" className="input w-full" value={editAssignForm.end_time}
                  onChange={e => setEditAssignForm(p => ({ ...p, end_time: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn btn-ghost" onClick={() => setEditingAssignment(null)}>ביטול</button>
              <button className="btn btn-primary" onClick={saveAssignmentEdit}>שמור</button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule section — unchanged */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{user?.name}</h2>
          {!editing && <button className="btn btn-primary" onClick={startEdit}>עריכת לוח הזמנים</button>}
        </div>

        {msg && <div className={`px-4 py-2 rounded-lg text-sm mb-3 ${msg.startsWith('שגיאה') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>}

        {!editing ? (
          <div>
            <h3 className="font-semibold mb-3 text-gray-700">ימים ושעות בהן צריך חדר</h3>
            {schedule.length === 0 ? (
              <p className="text-gray-400 text-sm">לא הוגדר לוח זמנים. לחץ על "עריכת לוח הזמנים" להגדרה.</p>
            ) : (
              <table className="tbl">
                <thead><tr><th>יום</th><th>שעת התחלה</th><th>שעת סיום</th></tr></thead>
                <tbody>
                  {schedule.map(s => (
                    <tr key={s.id}>
                      <td>{DAYS[s.day_of_week]}</td>
                      <td>{s.start_time}</td>
                      <td>{s.end_time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div>
            <h3 className="font-semibold mb-3">עריכת לוח זמנים</h3>
            <div className="space-y-3">
              {slots.map((s, i) => (
                <div key={i} className="flex gap-2 items-end flex-wrap bg-gray-50 p-3 rounded-lg">
                  <div>
                    <label className="label">יום</label>
                    <select className="select w-28" value={s.day_of_week} onChange={e => updateSlot(i, 'day_of_week', +e.target.value)}>
                      {DAYS.map((d, j) => <option key={j} value={j}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">משעה</label>
                    <input type="time" className="input w-28" value={s.start_time} onChange={e => updateSlot(i, 'start_time', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">עד שעה</label>
                    <input type="time" className="input w-28" value={s.end_time} onChange={e => updateSlot(i, 'end_time', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">חדר מועדף (אופציונלי)</label>
                    <select className="select w-32" value={s.preferred_room_id} onChange={e => updateSlot(i, 'preferred_room_id', e.target.value)}>
                      <option value="">ללא העדפה</option>
                      {rooms.map(r => <option key={r.id} value={r.id}>{r.name}{r.has_camera ? ' 🎥' : ''}</option>)}
                    </select>
                  </div>
                  <button className="btn btn-danger px-2 py-2" onClick={() => removeSlot(i)}>✕</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn btn-ghost" onClick={addSlot}>+ הוסף יום</button>
              <button className="btn btn-primary" onClick={save}>שמור</button>
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>ביטול</button>
            </div>
          </div>
        )}
      </div>

      {/* Personal weekly grid */}
      <div className="card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-semibold text-gray-700">לוח שיבוצים שבועי</h3>
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost px-2 py-1 text-sm" onClick={() => setWeekOffset(p => p - 1)}>◀</button>
            <span className="text-sm font-medium text-gray-600 w-28 text-center">{weekLabel}</span>
            <button className="btn btn-ghost px-2 py-1 text-sm" onClick={() => setWeekOffset(p => p + 1)}>▶</button>
            {weekOffset !== 0 && (
              <button className="btn btn-ghost px-2 py-1 text-xs text-blue-600" onClick={() => setWeekOffset(0)}>השבוע</button>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mb-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-200 inline-block" /> שיבוץ קבוע</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-200 inline-block" /> חדר חד-פעמי</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-200 inline-block" /> החלפת חדר</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200 inline-block" /> ספרייה / ישיבות / ממד</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-200 inline-block" /> היעדרות</span>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {weekDates.map((date, i) => {
            const isToday = date === today;
            const isPast = date < today;
            const permSlots = assignments.filter(a => a.day_of_week === i);
            const dayItems = oneTimeItems.filter(x => x.specific_date === date);

            const absences    = dayItems.filter(x => x.request_type === 'absence');
            const isAbsent    = absences.length > 0;
            const swaps       = dayItems.filter(x => x.request_type === 'room_swap');
            const roomReqs    = dayItems.filter(x => x.request_type === 'room_request');
            const specials    = dayItems.filter(x => ['library_request','meeting_request','mamod_request'].includes(x.request_type));

            const swappedRoomIds = new Set(swaps.map(s => s.original_room_id).filter(Boolean));

            const hasAnything = permSlots.length > 0 || dayItems.length > 0;

            return (
              <div key={i}
                className={`rounded-xl p-2 flex flex-col gap-1 min-h-24
                  ${isToday ? 'ring-2 ring-blue-500 bg-blue-50' : isPast ? 'bg-gray-50 opacity-70' : 'bg-gray-50'}
                `}
              >
                {/* Day header */}
                <div className={`text-center mb-1 ${isToday ? 'text-blue-700' : 'text-gray-600'}`}>
                  <div className="text-xs font-bold">{WORK_DAYS[i]}</div>
                  <div className={`text-xs ${isToday ? 'text-blue-500 font-semibold' : 'text-gray-400'}`}>{fmtDate(date)}</div>
                </div>

                {/* Permanent assignments */}
                {permSlots.map(a => {
                  const isSwappedOut = swappedRoomIds.has(a.room_id);
                  return (
                    <div key={a.id}
                      className={`text-xs rounded px-2 py-1
                        ${isAbsent || isSwappedOut
                          ? 'bg-gray-200 text-gray-400 line-through'
                          : 'bg-blue-100 text-blue-800'}
                      `}
                    >
                      <div className="font-medium break-words">{a.room_name}</div>
                      <div>{a.start_time}–{a.end_time}</div>
                      {!isAbsent && !isSwappedOut && !isPast && (
                        <div className="flex gap-1 mt-0.5">
                          <button
                            className="text-blue-400 hover:text-blue-600 text-xs"
                            title="ערוך שעות"
                            onClick={() => { setEditingAssignment(a); setEditAssignForm({ start_time: a.start_time, end_time: a.end_time }); }}>
                            ✎
                          </button>
                          <button
                            className="text-red-300 hover:text-red-500 text-xs"
                            title="מחק שיבוץ זה לצמיתות"
                            onClick={() => deleteAssignment(a.id, `${a.room_name} ${WORK_DAYS[i]} ${a.start_time}–${a.end_time}`)}>
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* "Delete day" button when multiple permanent slots */}
                {permSlots.length > 1 && !isPast && (
                  <button className="text-xs text-red-400 hover:text-red-600 text-right" onClick={() => deleteDay(i)}>
                    מחק יום
                  </button>
                )}

                {/* Absence */}
                {absences.map(a => (
                  <div key={a.id} className="text-xs bg-gray-200 text-gray-600 rounded px-2 py-1">
                    <div className="font-medium">⬜ היעדרות</div>
                    {a.start_time && <div>{a.start_time}–{a.end_time}</div>}
                  </div>
                ))}

                {/* Swaps */}
                {swaps.map(s => {
                  const origRoom = rooms.find(r => r.id === s.original_room_id);
                  return (
                    <div key={s.id} className="text-xs bg-purple-100 text-purple-800 rounded px-2 py-1">
                      <div className="font-medium">🔄 {s.room_name}</div>
                      {origRoom && <div className="text-purple-500 text-xs">במקום {origRoom.name}</div>}
                      <div>{s.start_time}–{s.end_time}</div>
                    </div>
                  );
                })}

                {/* One-time room bookings */}
                {roomReqs.map(r => (
                  <div key={r.id} className="text-xs bg-orange-100 text-orange-800 rounded px-2 py-1">
                    <div className="font-medium">📅 {r.room_name}</div>
                    <div>{r.start_time}–{r.end_time}</div>
                  </div>
                ))}

                {/* Special rooms: library / meeting / mamod */}
                {specials.map(s => {
                  const label = s.request_type === 'library_request' ? '📚 ספרייה'
                    : s.request_type === 'meeting_request' ? '🤝 ישיבות'
                    : '🏥 ממד';
                  return (
                    <div key={s.id} className="text-xs bg-green-100 text-green-800 rounded px-2 py-1">
                      <div className="font-medium">{label}</div>
                      <div>{s.start_time}–{s.end_time}</div>
                    </div>
                  );
                })}

                {/* Empty */}
                {!hasAnything && (
                  <div className="text-gray-300 text-xs text-center mt-2">—</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
