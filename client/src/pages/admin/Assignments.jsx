import { useState, useEffect } from 'react';
import api from '../../api';
import { DAYS, ROLES, ROLE_COLORS } from '../../constants';

export default function AdminAssignments() {
  const [assignments, setAssignments] = useState([]);
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [importing, setImporting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(null);
  const [genResult, setGenResult] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lastGenResult')) || null; } catch { return null; }
  });
  const [viewMode, setViewMode] = useState('grid'); // grid | day | employee
  const [selectedDay, setSelectedDay] = useState(0);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ user_id: '', room_id: '', day_of_week: 0, start_time: '08:00', end_time: '17:00' });
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); }, []);
  const load = () => Promise.all([
    api.get('/assignments/all'),
    api.get('/users'),
    api.get('/rooms'),
  ]).then(([a, u, r]) => { setAssignments(a.data); setUsers(u.data.filter(u=>u.is_active)); setRooms(r.data); });

  const importFromDoc = async () => {
    if (!confirm('פעולה זו תייבא את שיבוץ החדרים מקובץ תשפ"ו, תשנה שמות חדרים ותיצור עובדים חדשים. להמשיך?')) return;
    setImporting(true); setGenResult(null);
    try {
      const r = await api.post('/import');
      setGenResult({ message: r.data.message + ' — ' + r.data.details });
      load();
    } catch (e) { setGenResult({ message: 'שגיאה: ' + (e.response?.data?.error || e.message) }); }
    finally { setImporting(false); }
  };

  const generate = async () => {
    if (!confirm('פעולה זו תמחק את כל השיבוצים הקבועים הקיימים ותיצור חדשים. להמשיך?')) return;
    setGenerating(true); setGenResult(null);
    try {
      const r = await api.post('/assignments/generate');
      setGenResult(r.data);
      localStorage.setItem('lastGenResult', JSON.stringify(r.data));
      load();
    } catch (e) { setGenResult({ message: 'שגיאה: ' + (e.response?.data?.error || e.message) }); }
    finally { setGenerating(false); }
  };

  const applySuggestion = async (action, tipKey) => {
    setApplying(tipKey);
    try {
      const r = await api.post('/assignments/apply-suggestion', { action });
      setGenResult(prev => ({ ...prev, applyMsg: r.data.message, applyError: null }));
      load();
    } catch (e) {
      setGenResult(prev => ({ ...prev, applyError: 'שגיאה: ' + (e.response?.data?.error || e.message), applyMsg: null }));
    } finally { setApplying(null); }
  };

  const clearAll = async () => {
    if (!confirm('למחוק את כל השיבוצים הקבועים?')) return;
    await api.delete('/assignments/clear/permanent'); load();
  };

  const deleteAssignment = async id => {
    await api.delete(`/assignments/${id}`); load();
  };

  const addAssignment = async () => {
    try {
      await api.post('/assignments', addForm);
      setShowAdd(false); load(); setMsg('שיבוץ נוסף');
    } catch (e) { setMsg('שגיאה: ' + (e.response?.data?.error || e.message)); }
  };

  // Group by day
  const byDay = DAYS.map((_, i) => assignments.filter(a => a.day_of_week === i));
  // Group by employee
  const byEmployee = users.reduce((acc, u) => {
    acc[u.id] = { user: u, slots: assignments.filter(a => a.user_id === u.id) };
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-3 justify-between mb-3">
          <h2 className="text-xl font-bold">שיבוץ חדרים</h2>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-success" onClick={importFromDoc} disabled={importing}>
              {importing ? 'מייבא...' : '📥 ייבוא שיבוץ תשפ"ו'}
            </button>
            <button className="btn btn-primary" onClick={generate} disabled={generating}>
              {generating ? 'מחשב שיבוץ...' : '⚡ הפעל אלגוריתם שיבוץ'}
            </button>
            <button className="btn btn-ghost" onClick={() => { setShowAdd(true); setMsg(''); }}>+ הוסף שיבוץ ידני</button>
            <button className="btn btn-danger" onClick={clearAll}>מחק הכל</button>
          </div>
        </div>

        {msg && <div className={`px-4 py-2 rounded-lg text-sm mb-3 ${msg.startsWith('שגיאה') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>}

        {genResult && (
          <div className={`rounded-xl p-4 mb-4 ${genResult.conflicts?.length ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
            <p className="font-semibold">{genResult.message}</p>
            {genResult.applyMsg && <p className="text-green-700 text-sm mt-1 font-medium">✅ {genResult.applyMsg}</p>}
            {genResult.applyError && <p className="text-red-700 text-sm mt-1 font-medium">{genResult.applyError}</p>}
            {genResult.suggestions?.length > 0 && (
              <div className="mt-4 space-y-4">
                <p className="text-sm font-semibold text-yellow-800">הצעות לפתרון התנגשויות:</p>
                {genResult.suggestions.map((s, i) => (
                  <div key={i} className="bg-white border border-yellow-200 rounded-xl p-3">
                    <p className="font-semibold text-gray-800 mb-2">{s.userName}</p>
                    {s.slots.map((slot, j) => (
                      <div key={j} className="mb-3">
                        <p className="text-xs font-medium text-yellow-700 mb-1">יום {slot.day} | {slot.time}</p>
                        {slot.tips.length === 0 ? (
                          <p className="text-xs text-red-500">לא נמצאו חדרים פנויים — יש לשנות את לוח הזמנים</p>
                        ) : (
                          <div className="space-y-1.5">
                            {slot.tips.map((tip, k) => (
                              <div key={k} className={`rounded-lg px-3 py-2 text-xs ${
                                tip.type === 'split' ? 'bg-green-50 border border-green-200' :
                                tip.type === 'partial' ? 'bg-blue-50 border border-blue-200' :
                                tip.type === 'shift' ? 'bg-purple-50 border border-purple-200' :
                                tip.type === 'displace' ? 'bg-orange-50 border border-orange-200' :
                                'bg-gray-50 border border-gray-200'
                              }`}>
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium mb-1">{
                                      tip.type === 'split' ? '✅' :
                                      tip.type === 'partial' ? '🔵' :
                                      tip.type === 'shift' ? '🕐' :
                                      tip.type === 'displace' ? '🔄' : '📅'
                                    } {tip.label}</p>
                                    <ul className="space-y-0.5 pr-3">
                                      {tip.items.map((item, l) => <li key={l} className="text-gray-600">• {item}</li>)}
                                    </ul>
                                  </div>
                                  {tip.action && (
                                    <button
                                      className="shrink-0 bg-white border border-gray-300 hover:bg-green-50 hover:border-green-400 rounded-lg px-2 py-1 text-xs font-medium transition-colors"
                                      disabled={applying === `${i}-${j}-${k}`}
                                      onClick={() => applySuggestion(tip.action, `${i}-${j}-${k}`)}>
                                      {applying === `${i}-${j}-${k}` ? '...' : 'אשר ↵'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showAdd && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
            <h3 className="font-semibold mb-3">הוספת שיבוץ ידני</h3>
            <div className="flex flex-wrap gap-3 items-end">
              <div><label className="label">עובד</label>
                <select className="select w-44" value={addForm.user_id} onChange={e => setAddForm(p=>({...p,user_id:e.target.value}))}>
                  <option value="">בחר...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div><label className="label">חדר</label>
                <select className="select w-32" value={addForm.room_id} onChange={e => setAddForm(p=>({...p,room_id:e.target.value}))}>
                  <option value="">בחר...</option>
                  {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div><label className="label">יום</label>
                <select className="select w-24" value={addForm.day_of_week} onChange={e => setAddForm(p=>({...p,day_of_week:+e.target.value}))}>
                  {DAYS.map((d,i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div><label className="label">משעה</label><input type="time" className="input w-28" value={addForm.start_time} onChange={e => setAddForm(p=>({...p,start_time:e.target.value}))} /></div>
              <div><label className="label">עד שעה</label><input type="time" className="input w-28" value={addForm.end_time} onChange={e => setAddForm(p=>({...p,end_time:e.target.value}))} /></div>
              <button className="btn btn-primary" onClick={addAssignment}>הוסף</button>
              <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>ביטול</button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <button className={`btn text-sm ${viewMode==='grid' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewMode('grid')}>רשת שבועית</button>
          <button className={`btn text-sm ${viewMode==='day' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewMode('day')}>לפי יום</button>
          <button className={`btn text-sm ${viewMode==='employee' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewMode('employee')}>לפי עובד</button>
          <input
            className="input w-44 text-sm mr-auto"
            placeholder="חיפוש עובד..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Grid view — rooms × days */}
      {viewMode === 'grid' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-2 py-2 text-right font-semibold min-w-[70px]">חדר</th>
                {DAYS.map((d, i) => (
                  <th key={i} className="border border-gray-300 px-2 py-2 text-center font-semibold min-w-[110px]">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rooms.filter(r => r.is_active !== false).sort((a, b) => a.name.localeCompare(b.name, 'he'))
                .filter(room => !search || assignments.some(a => a.room_id === room.id && a.user_name?.includes(search)))
                .map(room => (
                <tr key={room.id} className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-2 py-1 font-semibold text-gray-700 whitespace-nowrap">{room.name}</td>
                  {DAYS.map((_, dayIdx) => {
                    const slots = assignments
                      .filter(a => a.room_id === room.id && a.day_of_week === dayIdx)
                      .sort((a, b) => a.start_time.localeCompare(b.start_time));
                    return (
                      <td key={dayIdx} className="border border-gray-300 px-1 py-1 align-top">
                        {slots.map(a => {
                          const highlighted = search && a.user_name?.includes(search);
                          return (
                            <div key={a.id} className={`border rounded px-1.5 py-0.5 mb-0.5 ${highlighted ? 'bg-yellow-100 border-yellow-400' : 'bg-blue-50 border-blue-200'}`}>
                              <div className={`font-medium leading-tight ${highlighted ? 'text-yellow-900' : 'text-blue-900'}`}>{a.user_name}</div>
                              <div className="text-gray-500 leading-tight">{a.start_time}–{a.end_time}</div>
                            </div>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Day view */}
      {viewMode === 'day' && (
        <div className="card">
          <div className="flex gap-2 mb-4 flex-wrap">
            {DAYS.map((d, i) => (
              <button key={i} onClick={() => setSelectedDay(i)}
                className={`btn text-sm ${selectedDay === i ? 'btn-primary' : 'btn-ghost'}`}>
                {d} <span className="mr-1 text-xs opacity-70">({byDay[i].length})</span>
              </button>
            ))}
          </div>
          <h3 className="font-semibold mb-3 text-gray-700">יום {DAYS[selectedDay]} — {byDay[selectedDay].length} שיבוצים</h3>
          {byDay[selectedDay].length === 0 ? (
            <p className="text-gray-400 text-sm">אין שיבוצים ביום זה</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>חדר</th><th>עובד</th><th>תפקיד</th><th>משעה</th><th>עד שעה</th><th></th></tr></thead>
                <tbody>
                  {byDay[selectedDay].filter(a => !search || a.user_name?.includes(search)).sort((a,b) => a.room_name.localeCompare(b.room_name, 'he')).map(a => (
                    <tr key={a.id} className={search && a.user_name?.includes(search) ? 'bg-yellow-50' : ''}>
                      <td className="font-medium">{a.room_name}</td>
                      <td>{a.user_name}</td>
                      <td><span className={`badge ${ROLE_COLORS[a.role]||'badge-gray'}`}>{ROLES[a.role]}</span></td>
                      <td>{a.start_time}</td>
                      <td>{a.end_time}</td>
                      <td><button className="text-red-500 hover:text-red-700 text-xs" onClick={() => deleteAssignment(a.id)}>מחק</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Employee view */}
      {viewMode === 'employee' && (
        <div className="card">
          <h3 className="font-semibold mb-3 text-gray-700">שיבוץ לפי עובד</h3>
          <div className="space-y-3">
            {users.filter(u => byEmployee[u.id]?.slots.length > 0 && (!search || u.name.includes(search))).map(u => (
              <div key={u.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium">{u.name}</span>
                  <span className={`badge ${ROLE_COLORS[u.role]||'badge-gray'}`}>{ROLES[u.role]}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {byEmployee[u.id].slots.sort((a,b)=>a.day_of_week-b.day_of_week).map(a => (
                    <div key={a.id} className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs">
                      <div className="font-medium text-blue-800">{DAYS[a.day_of_week]}</div>
                      <div>{a.room_name}</div>
                      <div className="text-gray-500">{a.start_time}–{a.end_time}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {users.filter(u => !byEmployee[u.id]?.slots.length).length > 0 && (
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <p className="text-sm text-gray-500 font-medium mb-2">ללא שיבוץ:</p>
                <div className="flex flex-wrap gap-2">
                  {users.filter(u => !byEmployee[u.id]?.slots.length).map(u => (
                    <span key={u.id} className="badge badge-gray">{u.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
