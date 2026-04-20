import { useState, useEffect } from 'react';
import api from '../../api';
import { DAYS } from '../../constants';
import { useAuth } from '../../context/AuthContext';

function todayStr() { return new Date().toISOString().slice(0, 10); }

function weekDates(offset = 0) {
  const today = new Date();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay() + offset * 7);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export default function MeetingRoom() {
  const { isAdmin } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [schedule, setSchedule] = useState({});
  const [loading, setLoading] = useState(false);
  const [permanent, setPermanent] = useState(false);
  const [form, setForm] = useState({ date: todayStr(), start_time: '08:00', end_time: '17:00', day_of_week: 0, notes: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const dates = weekDates(weekOffset);

  useEffect(() => { loadSchedule(); }, [weekOffset]);

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const r = await api.get('/requests/meeting-schedule', { params: { from: dates[0], to: dates[4] } });
      setSchedule(r.data);
    } catch (e) {}
    finally { setLoading(false); }
  };

  const book = async () => {
    setMsg(''); setError(''); setSubmitting(true);
    try {
      const r = await api.post('/requests', {
        request_type: permanent ? 'permanent_request' : 'meeting_request',
        target_room_type: permanent ? 'meeting' : undefined,
        specific_date: permanent ? null : form.date,
        day_of_week: permanent ? form.day_of_week : null,
        start_time: form.start_time,
        end_time: form.end_time,
        notes: form.notes || '',
      });
      setMsg(r.data.message);
      if (!permanent) loadSchedule();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setSubmitting(false); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Weekly schedule */}
      <div className="card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-xl font-bold">לוח חדר ישיבות</h2>
          <div className="flex gap-1">
            <button className="btn btn-ghost text-sm" onClick={() => setWeekOffset(w => w - 1)}>→ קודם</button>
            <button className="btn btn-ghost text-sm" onClick={() => setWeekOffset(0)}>השבוע</button>
            <button className="btn btn-ghost text-sm" onClick={() => setWeekOffset(w => w + 1)}>הבא ←</button>
          </div>
        </div>

        {loading ? <p className="text-gray-400 text-sm">טוען...</p> : (
          <div className="space-y-2">
            {dates.map(date => {
              const dayName = DAYS[new Date(date).getDay()];
              const bookings = schedule[date] || [];
              const isToday = date === todayStr();
              return (
                <div key={date} className={`border rounded-xl p-3 ${isToday ? 'border-purple-300 bg-purple-50' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{dayName} {date}</span>
                    {isToday && <span className="badge badge-blue text-xs">היום</span>}
                  </div>
                  {bookings.length === 0 ? (
                    <span className="text-green-600 text-sm">חדר ישיבות פנוי</span>
                  ) : (
                    <div className="space-y-1">
                      {bookings.map((b, i) => (
                        <div key={i} className="flex gap-3 text-sm items-center">
                          <span className="text-gray-500 tabular-nums">{b.start_time}–{b.end_time}</span>
                          <span className="font-medium">{b.user_name}</span>
                          {b.type === 'permanent' && <span className="text-xs text-purple-600">קבוע</span>}
                          {isAdmin && b.type === 'one_time' && b.id && (
                            <button onClick={async () => { if (confirm('למחוק שיבוץ זה?')) { await api.delete(`/requests/${b.id}`); loadSchedule(); } }}
                              className="text-red-400 hover:text-red-600 text-xs">מחק</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Booking form */}
      <div className="card">
        <h3 className="font-semibold mb-3">הזמנת חדר ישיבות</h3>

        <div className="flex gap-2 mb-4">
          <button className={`btn text-sm ${!permanent ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setPermanent(false); setMsg(''); setError(''); }}>חד-פעמי</button>
          <button className={`btn text-sm ${permanent ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setPermanent(true); setMsg(''); setError(''); }}>קבוע (לאישור מנהל)</button>
        </div>

        {permanent ? (
          <div className="mb-3">
            <label className="label">יום קבוע</label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <button key={i} className={`btn text-sm ${form.day_of_week === i ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setForm(p => ({ ...p, day_of_week: i }))}>{d}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-3">
            <label className="label">תאריך</label>
            <input type="date" className="input w-44" value={form.date} min={todayStr()}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
          </div>
        )}

        <div className="flex gap-3 mb-3">
          <div>
            <label className="label">משעה</label>
            <input type="time" className="input w-28" value={form.start_time}
              onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))} />
          </div>
          <div>
            <label className="label">עד שעה</label>
            <input type="time" className="input w-28" value={form.end_time}
              onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))} />
          </div>
        </div>

        <div className="mb-3">
          <label className="label">הערות (אופציונלי)</label>
          <input className="input w-full" value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="נושא הישיבה / הסבר..." />
        </div>

        {msg && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm mb-3">{msg}</div>}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mb-3">{error}</div>}

        <button className="btn btn-primary" onClick={book} disabled={submitting}>
          {submitting ? 'שולח...' : permanent ? 'שלח לאישור מנהל' : 'הזמן חדר ישיבות'}
        </button>
      </div>
    </div>
  );
}
