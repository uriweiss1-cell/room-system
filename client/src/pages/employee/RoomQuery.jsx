import { useState, useEffect } from 'react';
import api from '../../api';
import { DAYS, ROLES, ROLE_COLORS } from '../../constants';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function nowStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export default function RoomQuery() {
  const [tab, setTab] = useState('room');
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState(nowStr());
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null); // { id, name }
  const [roomSearch, setRoomSearch] = useState('');

  useEffect(() => { api.get('/users/list/active').then(r => setEmployees(r.data)); }, []);

  const queryRoom = async () => {
    setLoading(true); setResult(null);
    try {
      const params = { date, time };
      if (roomSearch.trim()) params.roomFilter = roomSearch.trim();
      const r = await api.get('/assignments/query', { params });
      setResult(r.data);
    } finally { setLoading(false); }
  };

  const queryEmployee = async () => {
    if (!selectedUser) return;
    setLoading(true); setResult(null);
    try {
      const r = await api.get('/assignments/locate', { params: { date, time, userId: selectedUser.id } });
      setResult(r.data);
    } finally { setLoading(false); }
  };

  const dayName = date ? DAYS[new Date(date).getDay()] : '';
  const filteredEmployees = employees.filter(u => u.name.includes(employeeSearch));

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="card">
        <h2 className="text-xl font-bold mb-4">שאילתת חדר ועובדים</h2>

        <div className="flex gap-2 mb-4">
          <button className={`btn ${tab === 'room' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setTab('room'); setResult(null); }}>מי נמצא בחדר?</button>
          <button className={`btn ${tab === 'employee' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setTab('employee'); setResult(null); }}>איפה העובד?</button>
        </div>

        <div className="flex gap-3 flex-wrap mb-4">
          <div>
            <label className="label">תאריך</label>
            <input type="date" className="input w-40" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">שעה</label>
            <input type="time" className="input w-28" value={time} onChange={e => setTime(e.target.value)} />
          </div>
          {tab === 'room' && (
            <div>
              <label className="label">סינון לפי חדר (אופציונלי)</label>
              <input className="input w-36" placeholder="חדר 22..." value={roomSearch}
                onChange={e => setRoomSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && queryRoom()} />
            </div>
          )}
          <div className="flex items-end">
            <button className="btn btn-primary" onClick={tab === 'room' ? queryRoom : queryEmployee}
              disabled={loading || (tab === 'employee' && !selectedUser)}>
              {loading ? 'מחפש...' : 'חפש'}
            </button>
          </div>
        </div>

        {tab === 'employee' && (
          <div className="mb-4">
            <label className="label">חפש עובד</label>
            <input className="input w-full mb-2" placeholder="שם עובד..." value={employeeSearch}
              onChange={e => { setEmployeeSearch(e.target.value); setSelectedUser(null); setResult(null); }} />
            {employeeSearch && !selectedUser && (
              <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                {filteredEmployees.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-400">לא נמצאו עובדים</div>
                ) : filteredEmployees.map(u => (
                  <button key={u.id} className="w-full text-right px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-0"
                    onClick={() => { setSelectedUser(u); setEmployeeSearch(u.name); }}>
                    {u.name}
                  </button>
                ))}
              </div>
            )}
            {selectedUser && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded px-3 py-1.5 text-sm">
                <span className="font-medium text-blue-800">{selectedUser.name}</span>
                <button className="text-gray-400 hover:text-gray-600 text-xs" onClick={() => { setSelectedUser(null); setEmployeeSearch(''); setResult(null); }}>✕</button>
              </div>
            )}
          </div>
        )}

        {date && <p className="text-sm text-gray-500">יום {dayName}, {date} בשעה {time}</p>}
      </div>

      {result && tab === 'room' && (
        <div className="card">
          <h3 className="font-semibold mb-3">
            {roomSearch ? `חדר ${roomSearch}` : 'כל החדרים'} — {date} {time}
          </h3>
          {(result.regular.length + result.oneTime.length) === 0 ? (
            <p className="text-gray-400 text-sm">לא נמצאו עובדים בשעה זו{roomSearch ? ` בחדר ${roomSearch}` : ''}</p>
          ) : (
            <table className="tbl">
              <thead><tr><th>חדר</th><th>עובד</th><th>שעות</th><th>סוג</th></tr></thead>
              <tbody>
                {result.regular.map(a => (
                  <tr key={`r-${a.id}`}>
                    <td className="font-medium">{a.room_name}</td>
                    <td>{a.user_name}</td>
                    <td>{a.start_time}–{a.end_time}</td>
                    <td><span className="badge badge-blue">קבוע</span></td>
                  </tr>
                ))}
                {result.oneTime.map(a => (
                  <tr key={`ot-${a.id}`}>
                    <td className="font-medium">{a.room_name}</td>
                    <td>{a.user_name}</td>
                    <td>{a.start_time}–{a.end_time}</td>
                    <td><span className="badge badge-yellow">חד-פעמי</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {result && tab === 'employee' && (
        <div className="card text-center py-6">
          {result.room ? (
            <>
              <div className="text-5xl mb-3">🚪</div>
              <div className="text-2xl font-bold text-blue-700">{result.room}</div>
              <div className="text-gray-500 mt-1">{date} בשעה {time}</div>
            </>
          ) : (
            <>
              <div className="text-5xl mb-3">❌</div>
              <div className="text-gray-600">{result.message}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
