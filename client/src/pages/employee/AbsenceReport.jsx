import { useState, useEffect } from 'react';
import api from '../../api';
import { STATUS_LABELS, STATUS_COLORS } from '../../constants';
import { useAuth } from '../../context/AuthContext';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function AbsenceReport() {
  const { isAdmin, user } = useAuth();
  const [date, setDate] = useState(todayStr());
  const [dateTo, setDateTo] = useState('');
  const [partial, setPartial] = useState(false);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('success'); // 'success' | 'error'
  const [loading, setLoading] = useState(false);
  const [myAbsences, setMyAbsences] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [impersonateId, setImpersonateId] = useState('');
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    loadAbsences();
    if (isAdmin) api.get('/users').then(r => setAllUsers(r.data.filter(u => u.is_active && u.role !== 'admin'))).catch(() => {});
  }, [isAdmin]);

  const loadAbsences = () =>
    api.get('/requests/my').then(r =>
      setMyAbsences(r.data.filter(x => x.request_type === 'absence'))
    ).catch(() => {});

  const submit = async () => {
    setLoading(true); setMsg('');
    try {
      const body = {
        request_type: 'absence',
        specific_date: date,
        start_time: partial ? startTime : null,
        end_time: partial ? endTime : null,
        notes,
      };
      if (dateTo && dateTo > date) body.date_to = dateTo;
      if (isAdmin && impersonateId) body.impersonate_user_id = impersonateId;
      const r = await api.post('/requests', body);
      setMsg(r.data.message);
      setMsgType('success');
      setDate(todayStr()); setDateTo(''); setPartial(false); setNotes('');
      setImpersonateId(''); setUserSearch('');
      loadAbsences();
    } catch (e) {
      setMsg('שגיאה: ' + (e.response?.data?.error || e.message));
      setMsgType('error');
    } finally { setLoading(false); }
  };

  const cancelAbsence = async (id) => {
    if (!confirm('לבטל את ההיעדרות?')) return;
    try {
      await api.delete(`/requests/my/${id}`);
      loadAbsences();
    } catch (e) { alert('שגיאה: ' + (e.response?.data?.error || e.message)); }
  };

  const filteredUsers = userSearch
    ? allUsers.filter(u => u.name.includes(userSearch))
    : allUsers;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="card space-y-4">
        <h2 className="text-xl font-bold">דיווח היעדרות</h2>

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
              size={userSearch ? Math.min(filteredUsers.length + 1, 6) : 1}
            >
              <option value="">הגש בשמי ({user?.name})</option>
              {filteredUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          <div>
            <label className="label">מתאריך</label>
            <input type="date" className="input w-44" value={date}
              onChange={e => setDate(e.target.value)} min={todayStr()} />
          </div>
          <div>
            <label className="label">עד תאריך (אופציונלי)</label>
            <input type="date" className="input w-44" value={dateTo}
              onChange={e => setDateTo(e.target.value)} min={date || todayStr()} />
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input type="checkbox" checked={partial} onChange={e => setPartial(e.target.checked)} className="w-4 h-4" />
          היעדרות חלקית (רק בשעות מסוימות)
        </label>

        {partial && (
          <div className="flex gap-3">
            <div>
              <label className="label">משעה</label>
              <input type="time" className="input w-36" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className="label">עד שעה</label>
              <input type="time" className="input w-36" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
        )}

        <div>
          <label className="label">הערות (אופציונלי)</label>
          <textarea className="input h-16 resize-none" value={notes}
            onChange={e => setNotes(e.target.value)} placeholder="הוסף הסבר אם רצוי..." />
        </div>

        {msg && (
          <div className={`px-4 py-2 rounded-lg text-sm ${msgType === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {msg}
          </div>
        )}

        <button className="btn btn-primary w-full" onClick={submit} disabled={loading}>
          {loading ? 'שולח...' : 'דווח על היעדרות'}
        </button>
      </div>

      {myAbsences.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-3 text-gray-700">ההיעדרויות שלי</h3>
          <div className="space-y-2">
            {myAbsences.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-3 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{a.specific_date}</div>
                  <div className="text-xs text-gray-500">
                    {a.start_time ? `${a.start_time}–${a.end_time}` : 'כל היום'}
                    {a.notes ? ` · ${a.notes}` : ''}
                  </div>
                </div>
                <span className={`badge ${STATUS_COLORS[a.status]} shrink-0`}>{STATUS_LABELS[a.status]}</span>
                <button
                  className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  onClick={() => cancelAbsence(a.id)}
                  title="בטל היעדרות"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
