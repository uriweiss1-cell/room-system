import { useState, useEffect } from 'react';
import api from '../../api';
import { DAYS } from '../../constants';
import { useAuth } from '../../context/AuthContext';

function Notifications() {
  const [notifs, setNotifs] = useState([]);
  useEffect(() => {
    api.get('/notifications').then(r => setNotifs(r.data)).catch(() => {});
  }, []);

  const markRead = async id => {
    await api.put(`/notifications/${id}/read`);
    setNotifs(p => p.map(n => n.id === id ? { ...n, read: true } : n));
  };
  const markAll = async () => {
    await api.put('/notifications/read-all');
    setNotifs(p => p.map(n => ({ ...n, read: true })));
  };

  const unread = notifs.filter(n => !n.read);
  if (!notifs.length) return null;

  return (
    <div className="card border-orange-200 bg-orange-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-orange-800">
          התראות {unread.length > 0 && <span className="badge badge-yellow mr-1">{unread.length} חדשות</span>}
        </h3>
        {unread.length > 0 && <button className="text-xs text-orange-600 hover:underline" onClick={markAll}>סמן הכל כנקרא</button>}
      </div>
      <div className="space-y-2">
        {notifs.map(n => (
          <div key={n.id} className={`flex items-start justify-between gap-2 rounded-lg px-3 py-2 text-sm ${n.read ? 'bg-white text-gray-500' : 'bg-orange-100 text-orange-900 font-medium'}`}>
            <span>{n.message}</span>
            {!n.read && <button className="shrink-0 text-xs text-orange-600 hover:underline" onClick={() => markRead(n.id)}>✓ קראתי</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

const defaultSlot = { day_of_week: 0, start_time: '08:00', end_time: '17:00', preferred_room_id: '' };

export default function MySchedule() {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [editing, setEditing] = useState(false);
  const [slots, setSlots] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingAssignment, setEditingAssignment] = useState(null); // { id, room_name, day_of_week, start_time, end_time }
  const [editAssignForm, setEditAssignForm] = useState({ start_time: '', end_time: '' });

  useEffect(() => {
    Promise.all([
      api.get('/schedules/my'),
      api.get('/assignments/my'),
      api.get('/rooms'),
    ]).then(([s, a, r]) => {
      setSchedule(s.data);
      setAssignments(a.data);
      setRooms(r.data);
    }).finally(() => setLoading(false));
  }, []);

  const startEdit = () => { setSlots(schedule.length ? schedule.map(s => ({ ...s, preferred_room_id: s.preferred_room_id ?? '' })) : [{ ...defaultSlot }]); setEditing(true); setMsg(''); };
  const addSlot = () => setSlots(p => [...p, { ...defaultSlot }]);
  const removeSlot = i => setSlots(p => p.filter((_, j) => j !== i));
  const updateSlot = (i, k, v) => setSlots(p => p.map((s, j) => j === i ? { ...s, [k]: v } : s));

  const deleteAssignment = async (id, label) => {
    if (!confirm(`למחוק לצמיתות את השיבוץ ${label}?\nהשינוי קבוע — השיבוץ לא יחזור גם אחרי הפעלת האלגוריתם.`)) return;
    await api.delete(`/assignments/my/${id}`);
    const [s, a] = await Promise.all([api.get('/schedules/my'), api.get('/assignments/my')]);
    setSchedule(s.data); setAssignments(a.data);
    setMsg('השיבוץ נמחק');
  };

  const saveAssignmentEdit = async () => {
    try {
      await api.put(`/assignments/my/${editingAssignment.id}`, editAssignForm);
      const [s, a] = await Promise.all([api.get('/schedules/my'), api.get('/assignments/my')]);
      setSchedule(s.data); setAssignments(a.data);
      setEditingAssignment(null);
      setMsg('השעות עודכנו');
    } catch (e) { setMsg('שגיאה: ' + (e.response?.data?.error || e.message)); }
  };

  const deleteDay = async (dayIdx) => {
    const daySlots = byDay[dayIdx];
    if (!daySlots.length) return;
    if (!confirm(`למחוק לצמיתות את כל השיבוצים ביום ${DAYS[dayIdx]}?\nהשינוי קבוע.`)) return;
    await Promise.all(daySlots.map(a => api.delete(`/assignments/my/${a.id}`)));
    const [s, a] = await Promise.all([api.get('/schedules/my'), api.get('/assignments/my')]);
    setSchedule(s.data); setAssignments(a.data);
    setMsg(`שיבוצי יום ${DAYS[dayIdx]} נמחקו`);
  };

  const save = async () => {
    try {
      await api.put('/schedules/my', { schedules: slots.map(s => ({ ...s, preferred_room_id: s.preferred_room_id || null })) });
      const [s, a] = await Promise.all([api.get('/schedules/my'), api.get('/assignments/my')]);
      setSchedule(s.data); setAssignments(a.data);
      setEditing(false); setMsg('לוח הזמנים עודכן בהצלחה');
    } catch (e) { setMsg('שגיאה: ' + (e.response?.data?.error || e.message)); }
  };

  // Group assignments by day
  const byDay = DAYS.map((_, i) => assignments.filter(a => a.day_of_week === i));

  if (loading) return <div className="text-center py-10 text-gray-500">טוען...</div>;

  return (
    <div className="space-y-5">
      {/* Edit assignment modal */}
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
      <Notifications />
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">{user?.name}</h2>
          </div>
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
                      {rooms.map(r => <option key={r.id} value={r.id}>{r.name}{r.has_camera ? ' 📷' : ''}</option>)}
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

      {/* Assigned rooms this week */}
      <div className="card">
        <h3 className="font-semibold mb-3 text-gray-700">חדרים מוקצים (לוח שבועי)</h3>
        {assignments.length === 0 ? (
          <p className="text-gray-400 text-sm">לא הוקצו חדרים עדיין. המנהל יפעיל את אלגוריתם השיבוץ.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {DAYS.map((day, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold text-blue-700 text-sm">{day}</div>
                  {byDay[i].length > 1 && (
                    <button className="text-xs text-red-400 hover:text-red-600" title="מחק את כל היום"
                      onClick={() => deleteDay(i)}>מחק יום</button>
                  )}
                </div>
                {byDay[i].length === 0 ? (
                  <div className="text-gray-400 text-xs">לא מוקצה</div>
                ) : (
                  byDay[i].map(a => (
                    <div key={a.id} className="text-xs bg-blue-100 text-blue-800 rounded px-2 py-1 mb-1 flex items-start justify-between gap-1">
                      <div>
                        <div className="font-medium">{a.room_name}</div>
                        <div>{a.start_time}–{a.end_time}</div>
                      </div>
                      <div className="flex gap-1 shrink-0 mt-0.5">
                        <button
                          className="text-blue-500 hover:text-blue-700"
                          title="ערוך שעות"
                          onClick={() => { setEditingAssignment(a); setEditAssignForm({ start_time: a.start_time, end_time: a.end_time }); }}>
                          ✎
                        </button>
                        <button
                          className="text-red-400 hover:text-red-600"
                          title="מחק שיבוץ זה לצמיתות"
                          onClick={() => deleteAssignment(a.id, `${a.room_name} ${DAYS[i]} ${a.start_time}–${a.end_time}`)}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
