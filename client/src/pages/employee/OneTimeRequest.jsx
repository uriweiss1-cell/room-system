import { useState, useEffect } from 'react';
import api from '../../api';
import { DAYS, STATUS_LABELS, STATUS_COLORS, REQUEST_TYPE_LABELS } from '../../constants';
import { useAuth } from '../../context/AuthContext';

function todayStr() { return new Date().toISOString().slice(0,10); }

export default function OneTimeRequest() {
  const { isAdmin, user } = useAuth();
  const [type, setType] = useState('absence');
  const [date, setDate] = useState(todayStr());
  const [dateTo, setDateTo] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState('form'); // form | pick-room | done
  const [availableRooms, setAvailableRooms] = useState([]);
  const [msg, setMsg] = useState('');
  const [myRequests, setMyRequests] = useState([]);
  const [myAssignments, setMyAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reduceAssignmentId, setReduceAssignmentId] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [impersonateId, setImpersonateId] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [isSwap, setIsSwap] = useState(false);
  const [swapOriginalRoom, setSwapOriginalRoom] = useState(null);
  const [swapReason, setSwapReason] = useState('');

  useEffect(() => {
    loadRequests();
    api.get('/assignments/my').then(r => setMyAssignments(r.data)).catch(() => {});
    if (isAdmin) api.get('/users').then(r => setAllUsers(r.data.filter(u => u.is_active && u.role !== 'admin'))).catch(() => {});
  }, [isAdmin]);

  const loadRequests = () => api.get('/requests/my').then(r => setMyRequests(r.data));

  const submit = async () => {
    setLoading(true); setMsg('');
    try {
      const body = { request_type: type, specific_date: type === 'permanent_request' || type === 'permanent_reduce' ? null : date, day_of_week: type === 'permanent_request' ? dayOfWeek : null, start_time: startTime, end_time: endTime, notes };
      if (type === 'permanent_reduce') body.reduce_assignment_id = reduceAssignmentId;
      if (type === 'absence' && dateTo && dateTo > date) body.date_to = dateTo;
      if (isAdmin && impersonateId) body.impersonate_user_id = impersonateId;
      const r = await api.post('/requests', body);
      if (type === 'room_request' && r.data.availableRooms) {
        setAvailableRooms(r.data.availableRooms);
        if (r.data.isSwap) {
          setIsSwap(true);
          setSwapOriginalRoom(r.data.originalRoom);
        } else {
          setIsSwap(false);
          setSwapOriginalRoom(null);
        }
        setStep('pick-room');
      } else {
        setMsg(r.data.message);
        setStep('done');
        loadRequests();
      }
    } catch (e) { setMsg('שגיאה: ' + (e.response?.data?.error || e.message)); }
    finally { setLoading(false); }
  };

  const confirmRoom = async (roomId) => {
    if (isSwap && !swapReason.trim()) {
      setMsg('יש להזין סיבה לבקשת החדר החלופי');
      return;
    }
    setLoading(true);
    try {
      const r = await api.post('/requests/book-room', {
        specific_date: date,
        start_time: startTime,
        end_time: endTime,
        notes,
        room_id: roomId,
        ...(isAdmin && impersonateId ? { impersonate_user_id: impersonateId } : {}),
        ...(isSwap ? { is_swap: true, swap_reason: swapReason.trim(), original_room_id: swapOriginalRoom.room_id } : {}),
      });
      setMsg(r.data.message);
      setStep('done');
      loadRequests();
    } catch (e) { setMsg('שגיאה: ' + (e.response?.data?.error || e.message)); }
    finally { setLoading(false); }
  };

  const reset = () => { setStep('form'); setMsg(''); setNotes(''); setDate(todayStr()); setDateTo(''); setDayOfWeek(0); setReduceAssignmentId(''); setIsSwap(false); setSwapOriginalRoom(null); setSwapReason(''); };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="card">
        <h2 className="text-xl font-bold mb-4">בקשה חד-פעמית</h2>

        {step === 'form' && (
          <div className="space-y-4">
            {isAdmin && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 space-y-2">
                <label className="label text-purple-800">🎭 הגשה בשם עובד (אופציונלי)</label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="חיפוש לפי שם..."
                  value={userSearch}
                  onChange={e => { setUserSearch(e.target.value); setImpersonateId(''); }}
                />
                <select
                  className="select w-full"
                  value={impersonateId}
                  onChange={e => { setImpersonateId(e.target.value); setUserSearch(''); }}
                  size={userSearch ? Math.min(allUsers.filter(u => u.name.includes(userSearch)).length + 1, 6) : 1}
                >
                  <option value="">הגש בשמי ({user?.name})</option>
                  {allUsers
                    .filter(u => !userSearch || u.name.includes(userSearch))
                    .map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label">סוג הבקשה</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { v: 'absence', l: 'היעדרות — לא צריך חדר' },
                  { v: 'room_request', l: 'בקשת חדר חד-פעמית' },
                  { v: 'permanent_request', l: 'בקשת שינוי קבוע (לאישור מנהל)' },
                  { v: 'permanent_reduce', l: 'הפחתת שעות קבועות' },
                ].map(o => (
                  <button key={o.v} onClick={() => setType(o.v)}
                    className={`btn text-sm ${type === o.v ? 'btn-primary' : 'btn-ghost'}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
            {type !== 'permanent_request' && type !== 'permanent_reduce' && (
              <div className="flex gap-3 flex-wrap items-end">
                <div>
                  <label className="label">{type === 'absence' ? 'מתאריך' : 'תאריך'}</label>
                  <input type="date" className="input w-44" value={date} onChange={e => setDate(e.target.value)} min={todayStr()} />
                </div>
                {type === 'absence' && (
                  <div>
                    <label className="label">עד תאריך (אופציונלי)</label>
                    <input type="date" className="input w-44" value={dateTo} onChange={e => setDateTo(e.target.value)} min={date || todayStr()} />
                  </div>
                )}
              </div>
            )}
            {type === 'permanent_request' && (
              <div>
                <label className="label">יום מבוקש</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d, i) => (
                    <button key={i} type="button"
                      className={`btn text-sm ${dayOfWeek === i ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setDayOfWeek(i)}>{d}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {type === 'permanent_reduce' && (
              <div>
                <label className="label">בחר שיבוץ להפחתה</label>
                <select className="select w-full" value={reduceAssignmentId} onChange={e => setReduceAssignmentId(e.target.value)}>
                  <option value="">בחר שיבוץ...</option>
                  {myAssignments.map(a => (
                    <option key={a.id} value={a.id}>
                      חדר {a.room_name} — יום {DAYS[a.day_of_week]} — {a.start_time}–{a.end_time}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {type !== 'absence' && (
              <div className="flex gap-3">
                <div>
                  <label className="label">{type === 'permanent_reduce' ? 'שעת התחלה חדשה' : 'משעה'}</label>
                  <input type="time" className="input w-28" value={startTime} onChange={e => setStartTime(e.target.value)} />
                </div>
                <div>
                  <label className="label">{type === 'permanent_reduce' ? 'שעת סיום חדשה' : 'עד שעה'}</label>
                  <input type="time" className="input w-28" value={endTime} onChange={e => setEndTime(e.target.value)} />
                </div>
              </div>
            )}
            {type === 'permanent_request' && (() => {
              const toMin = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
              const conflicts = myAssignments.filter(a =>
                a.day_of_week === dayOfWeek &&
                toMin(a.start_time) < toMin(endTime) &&
                toMin(a.end_time) > toMin(startTime)
              );
              return conflicts.length > 0 ? (
                <div className="bg-orange-50 border border-orange-200 text-orange-800 px-3 py-2 rounded text-sm">
                  ⚠️ כבר יש לך שיבוץ קבוע ביום זה: {conflicts.map(a => `${a.room_name} ${a.start_time}–${a.end_time}`).join(', ')}
                </div>
              ) : null;
            })()}
            <div>
              <label className="label">הערות (אופציונלי)</label>
              <textarea className="input h-20 resize-none" value={notes} onChange={e => setNotes(e.target.value)} placeholder="הוסף הסבר אם רצוי..." />
            </div>
            {msg && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{msg}</div>}
            <button className="btn btn-primary" onClick={submit} disabled={loading}>{loading ? 'שולח...' : 'שלח בקשה'}</button>
          </div>
        )}

        {step === 'pick-room' && (
          <div>
            {isSwap && (
              <div className="bg-orange-50 border border-orange-300 rounded-xl px-4 py-3 mb-4">
                <div className="font-semibold text-orange-800 mb-1">⚠️ כבר יש לך חדר בשעות אלו</div>
                <div className="text-sm text-orange-700 mb-1">
                  {swapOriginalRoom?.room_name} ({swapOriginalRoom?.start_time}–{swapOriginalRoom?.end_time})
                </div>
                <div className="text-sm text-orange-600 mb-3">
                  בחירת חדר חלופי תשחרר את החדר הנוכחי לתאריך זה בלבד. השיבוץ הקבוע שלך לא ישתנה.
                </div>
                <label className="label">סיבה <span className="text-red-500">*</span></label>
                <textarea
                  className="input w-full h-16 resize-none"
                  value={swapReason}
                  onChange={e => setSwapReason(e.target.value)}
                  placeholder="למשל: מחשב לא עובד, פגישה פרטית, שיתוף עם עובד אחר..."
                />
              </div>
            )}
            <h3 className="font-semibold mb-3">בחר חדר {isSwap ? 'חלופי' : 'זמין'} ל-{date} בין {startTime}–{endTime}</h3>
            {msg && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm mb-3">{msg}</div>}
            {availableRooms.length === 0 ? (
              <div className="text-red-600 text-sm">אין חדרים פנויים בשעות הללו. הבקשה הועברה למנהל.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {availableRooms.map(r => (
                  <button key={r.id} className="border-2 border-blue-200 rounded-xl p-4 text-center hover:border-blue-500 hover:bg-blue-50 transition-colors"
                    onClick={() => confirmRoom(r.id)} disabled={loading}>
                    <div className="text-lg font-bold text-blue-700">{r.name}</div>
                    {r.has_camera && <div className="text-sm mt-1" title="יש מצלמה בחדר">🎥 מצלמה</div>}
                    {r.notes && <div className="text-xs text-gray-500 mt-1">{r.notes}</div>}
                  </button>
                ))}
              </div>
            )}
            <button className="btn btn-ghost mt-4" onClick={() => setStep('form')}>חזור</button>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center py-6">
            <div className="text-5xl mb-3">✅</div>
            <div className="text-lg font-semibold text-green-700">{msg}</div>
            <button className="btn btn-primary mt-4" onClick={reset}>בקשה חדשה</button>
          </div>
        )}
      </div>

      {/* My requests history */}
      <div className="card">
        <h3 className="font-semibold mb-3 text-gray-700">הבקשות שלי</h3>
        {myRequests.length === 0 ? <p className="text-gray-400 text-sm">אין בקשות</p> : (
          <table className="tbl">
            <thead><tr><th>תאריך</th><th>סוג</th><th>שעות</th><th>חדר</th><th>סטטוס</th></tr></thead>
            <tbody>
              {myRequests.map(r => (
                <tr key={r.id}>
                  <td>{r.specific_date || '—'}</td>
                  <td>{REQUEST_TYPE_LABELS[r.request_type]}</td>
                  <td>{r.start_time ? `${r.start_time}–${r.end_time}` : '—'}</td>
                  <td>{r.room_name || '—'}</td>
                  <td><span className={`badge ${STATUS_COLORS[r.status]}`}>{STATUS_LABELS[r.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
