import { useState, useEffect } from 'react';
import api from '../../api';
import { DAYS, STATUS_LABELS, STATUS_COLORS, REQUEST_TYPE_LABELS } from '../../constants';

function todayStr() { return new Date().toISOString().slice(0,10); }

export default function OneTimeRequest() {
  const [type, setType] = useState('absence');
  const [date, setDate] = useState(todayStr());
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState('form'); // form | pick-room | done
  const [availableRooms, setAvailableRooms] = useState([]);
  const [requestId, setRequestId] = useState(null);
  const [msg, setMsg] = useState('');
  const [myRequests, setMyRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadRequests(); }, []);

  const loadRequests = () => api.get('/requests/my').then(r => setMyRequests(r.data));

  const submit = async () => {
    setLoading(true); setMsg('');
    try {
      const r = await api.post('/requests', { request_type: type, specific_date: type === 'permanent_request' ? null : date, day_of_week: type === 'permanent_request' ? dayOfWeek : null, start_time: startTime, end_time: endTime, notes });
      if (type === 'room_request' && r.data.availableRooms) {
        setRequestId(r.data.requestId);
        setAvailableRooms(r.data.availableRooms);
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
    setLoading(true);
    try {
      const r = await api.post(`/requests/${requestId}/confirm`, { room_id: roomId });
      setMsg(r.data.message);
      setStep('done');
      loadRequests();
    } catch (e) { setMsg('שגיאה: ' + (e.response?.data?.error || e.message)); }
    finally { setLoading(false); }
  };

  const reset = () => { setStep('form'); setMsg(''); setNotes(''); setDate(todayStr()); setDayOfWeek(0); };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="card">
        <h2 className="text-xl font-bold mb-4">בקשה חד-פעמית</h2>

        {step === 'form' && (
          <div className="space-y-4">
            <div>
              <label className="label">סוג הבקשה</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { v: 'absence', l: 'היעדרות — לא צריך חדר' },
                  { v: 'room_request', l: 'בקשת חדר חד-פעמית' },
                  { v: 'permanent_request', l: 'בקשת שינוי קבוע (לאישור מנהל)' },
                ].map(o => (
                  <button key={o.v} onClick={() => setType(o.v)}
                    className={`btn text-sm ${type === o.v ? 'btn-primary' : 'btn-ghost'}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
            {type !== 'permanent_request' && (
              <div>
                <label className="label">תאריך</label>
                <input type="date" className="input w-44" value={date} onChange={e => setDate(e.target.value)} min={todayStr()} />
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
            {type !== 'absence' && (
              <div className="flex gap-3">
                <div>
                  <label className="label">משעה</label>
                  <input type="time" className="input w-28" value={startTime} onChange={e => setStartTime(e.target.value)} />
                </div>
                <div>
                  <label className="label">עד שעה</label>
                  <input type="time" className="input w-28" value={endTime} onChange={e => setEndTime(e.target.value)} />
                </div>
              </div>
            )}
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
            <h3 className="font-semibold mb-3">בחר חדר זמין ל-{date} בין {startTime}–{endTime}</h3>
            {availableRooms.length === 0 ? (
              <div className="text-red-600 text-sm">אין חדרים פנויים בשעות הללו. הבקשה הועברה למנהל.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {availableRooms.map(r => (
                  <button key={r.id} className="border-2 border-blue-200 rounded-xl p-4 text-center hover:border-blue-500 hover:bg-blue-50 transition-colors"
                    onClick={() => confirmRoom(r.id)} disabled={loading}>
                    <div className="text-lg font-bold text-blue-700">{r.name}</div>
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
