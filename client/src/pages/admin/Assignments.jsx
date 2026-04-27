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
  const [showGuest, setShowGuest] = useState(false);
  const [guestForm, setGuestForm] = useState({ guest_name: '', specific_date: new Date().toISOString().slice(0,10), start_time: '08:00', end_time: '17:00' });
  const [guestStep, setGuestStep] = useState('form'); // 'form' | 'pick-room'
  const [guestAvailableRooms, setGuestAvailableRooms] = useState([]);
  const [guestSearching, setGuestSearching] = useState(false);
  const [guests, setGuests] = useState([]);
  const [resolving, setResolving] = useState(null); // `${pcIdx}-notify` or `${pcIdx}-${blockerIdx}`
  const [notifyMsgs, setNotifyMsgs] = useState({}); // pcIdx -> string
  const [schedules, setSchedules] = useState([]);
  // Track room+day+time slots that were applied — used to filter out suggestions that would now conflict
  const [occupiedSlots, setOccupiedSlots] = useState([]);
  const [debugUserId, setDebugUserId] = useState('');
  const [debugResult, setDebugResult] = useState(null);
  const [debugLoading, setDebugLoading] = useState(false);

  useEffect(() => { load(); loadGuests(); }, []);
  const loadGuests = () => api.get('/assignments/guests').then(r => setGuests(r.data)).catch(() => {});
  const load = async () => {
    const [a, u, r] = await Promise.all([
      api.get('/assignments/all'),
      api.get('/users'),
      api.get('/rooms'),
    ]);
    setAssignments(a.data);
    setUsers(u.data.filter(u => u.is_active));
    setRooms(r.data);
    // Schedules are secondary — load separately so a failure doesn't break the main page
    try { const s = await api.get('/schedules/all'); setSchedules(s.data); } catch {}
  };

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
    setGenerating(true); setGenResult(null); setOccupiedSlots([]);
    try {
      const r = await api.post('/assignments/generate');
      setGenResult(r.data);
      localStorage.setItem('lastGenResult', JSON.stringify(r.data));
      load();
    } catch (e) { setGenResult({ message: 'שגיאה: ' + (e.response?.data?.error || e.message) }); }
    finally { setGenerating(false); }
  };

  const applySuggestion = async (action, tipKey, conflictUserName, slotDay, slotTime) => {
    setApplying(tipKey);
    try {
      const r = await api.post('/assignments/apply-suggestion', { action });

      // Determine which room+day+time slots are now occupied by the applied action
      const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
      const ovlp = (s1, e1, s2, e2) => toMin(s1) < toMin(e2) && toMin(e1) > toMin(s2);

      let newOccupied = [];
      if (action.type === 'split' || action.type === 'partial') {
        newOccupied = (action.parts || []).map(p => ({ roomId: p.roomId, day: action.day, start: p.start, end: p.end }));
      } else if (action.type === 'shift') {
        newOccupied = [{ roomId: action.roomId, day: action.day, start: action.start, end: action.end }];
      } else if (action.type === 'displace') {
        newOccupied = [{ roomId: action.fromRoomId, day: action.day, start: action.conflictStart, end: action.conflictEnd }];
      }

      // All occupied slots including previously applied ones (read from closure — correct snapshot)
      const allOccupied = [...occupiedSlots, ...newOccupied];

      // Returns true if a tip's proposed assignment would conflict with any occupied slot
      const tipUsesOccupied = tip => {
        if (!tip.action) return false;
        const a = tip.action;
        if (a.type === 'split' || a.type === 'partial') {
          return (a.parts || []).some(p =>
            allOccupied.some(o => o.roomId === p.roomId && o.day === a.day && ovlp(p.start, p.end, o.start, o.end)));
        }
        if (a.type === 'shift') {
          return allOccupied.some(o => o.roomId === a.roomId && o.day === a.day && ovlp(a.start, a.end, o.start, o.end));
        }
        if (a.type === 'displace') {
          return allOccupied.some(o => o.roomId === a.fromRoomId && o.day === a.day && ovlp(a.conflictStart, a.conflictEnd, o.start, o.end));
        }
        return false;
      };

      // Update suggestions: remove the resolved slot and filter tips that use now-occupied rooms
      setGenResult(prev => {
        if (!prev) return prev;
        const newSuggestions = (prev.suggestions ?? []).map(sg => {
          const isResolved = sg.userName === conflictUserName;
          return {
            ...sg,
            slots: sg.slots
              // Remove the specific slot that was just resolved
              .filter(slot => !(isResolved && slot.day === slotDay && slot.time === slotTime))
              // Remove tips that would now conflict with occupied rooms
              .map(slot => ({ ...slot, tips: slot.tips.filter(tip => !tipUsesOccupied(tip)) }))
              // Remove slots with no remaining actionable tips
              .filter(slot => slot.tips.length > 0),
          };
        }).filter(sg => sg.slots.length > 0); // Remove users with all conflicts resolved

        return { ...prev, suggestions: newSuggestions, applyMsg: r.data.message, applyError: null };
      });

      setOccupiedSlots(allOccupied);
      load();
    } catch (e) {
      setGenResult(prev => ({ ...prev, applyError: 'שגיאה: ' + (e.response?.data?.error || e.message), applyMsg: null }));
    } finally { setApplying(null); }
  };

  const assignTogether = async (userId, roomId, day, start, end, userName, roomName) => {
    if (!confirm(`לשבץ את ${userName} יחד בחדר ${roomName} (יום ${DAYS[day]}, ${start}–${end})?`)) return;
    try {
      await api.post('/assignments', { user_id: userId, room_id: roomId, day_of_week: day, start_time: start, end_time: end });
      setGenResult(prev => ({ ...prev, applyMsg: `${userName} שובץ יחד בחדר ${roomName}` }));
      load();
    } catch (e) {
      setGenResult(prev => ({ ...prev, applyError: 'שגיאה: ' + (e.response?.data?.error || e.message) }));
    }
  };

  const resolvePreference = async (action, payload, key) => {
    setResolving(key);
    try {
      const r = await api.post('/assignments/resolve-preference', { action, ...payload });
      setGenResult(prev => ({ ...prev, applyMsg: r.data.message, applyError: null }));
      if (action === 'displace') load();
    } catch (e) {
      setGenResult(prev => ({ ...prev, applyError: 'שגיאה: ' + (e.response?.data?.error || e.message), applyMsg: null }));
    } finally { setResolving(null); }
  };

  const clearAll = async () => {
    if (!confirm('למחוק את כל השיבוצים הקבועים?')) return;
    await api.delete('/assignments/clear/permanent'); load();
  };

  const clearAutoSchedules = async () => {
    if (!confirm('פעולה זו תמחק את כל לוחות הזמנים שנוצרו אוטומטית ביבוא (עובדים שלא הגדירו חדר מועדף).\nעובדים שהגדירו לוח זמנים ידנית לא יושפעו.\nלהמשיך?')) return;
    try {
      const r = await api.delete('/schedules/clear-auto-imported');
      setMsg(r.data.message);
      load();
    } catch (e) { setMsg('שגיאה: ' + (e.response?.data?.error || e.message)); }
  };

  const dismissConflictSlot = (conflictUserName, slotDay, slotTime) => {
    setGenResult(prev => {
      if (!prev) return prev;
      const newSuggestions = (prev.suggestions ?? []).map(sg => ({
        ...sg,
        slots: sg.slots.filter(slot =>
          !(sg.userName === conflictUserName && slot.day === slotDay && slot.time === slotTime)
        ),
      })).filter(sg => sg.slots.length > 0);
      return { ...prev, suggestions: newSuggestions };
    });
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

  const searchGuestRooms = async () => {
    if (!guestForm.guest_name.trim()) { setMsg('יש להזין שם אורח'); return; }
    setGuestSearching(true);
    try {
      const r = await api.get('/requests/available-rooms', {
        params: { date: guestForm.specific_date, start_time: guestForm.start_time, end_time: guestForm.end_time },
      });
      setGuestAvailableRooms(r.data.filter(room => room.available));
      setGuestStep('pick-room');
    } catch (e) { setMsg('שגיאה: ' + (e.response?.data?.error || e.message)); }
    finally { setGuestSearching(false); }
  };

  const addGuest = async (roomId) => {
    try {
      const r = await api.post('/assignments/guest', { ...guestForm, room_id: roomId });
      setMsg(r.data.message);
      setShowGuest(false);
      setGuestStep('form');
      setGuestForm(p => ({ ...p, guest_name: '' }));
      loadGuests();
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
            <button className="btn btn-ghost" onClick={() => { setShowAdd(true); setAddForm(p => ({ ...p, user_id: '' })); setMsg(''); setShowGuest(false); }}>+ הוסף שיבוץ ידני</button>
            <button className="btn btn-ghost text-teal-700 border-teal-300 hover:bg-teal-50" onClick={() => { setShowGuest(p => !p); setGuestStep('form'); setShowAdd(false); setMsg(''); }}>👤 שיבוץ אורח חד-פעמי</button>
            <button className="btn btn-ghost text-orange-700 border-orange-300 hover:bg-orange-50" onClick={clearAutoSchedules} title="מחק לוחות זמנים שנוצרו אוטומטית ביבוא">🧹 נקה לוחות אוטומטיים</button>
            <button className="btn btn-danger" onClick={clearAll}>מחק הכל</button>
          </div>
        </div>

        {msg && <div className={`px-4 py-2 rounded-lg text-sm mb-3 ${msg.startsWith('שגיאה') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>}

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

        {showGuest && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-4">
            <h3 className="font-semibold mb-3 text-teal-900">שיבוץ אורח חד-פעמי</h3>

            {guestStep === 'form' && (
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="label">שם האורח *</label>
                  <input className="input w-44" placeholder="שם מלא..." value={guestForm.guest_name}
                    onChange={e => setGuestForm(p => ({ ...p, guest_name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">תאריך *</label>
                  <input type="date" className="input w-36" value={guestForm.specific_date}
                    onChange={e => setGuestForm(p => ({ ...p, specific_date: e.target.value }))} />
                </div>
                <div>
                  <label className="label">משעה</label>
                  <input type="time" className="input w-28" value={guestForm.start_time}
                    onChange={e => setGuestForm(p => ({ ...p, start_time: e.target.value }))} />
                </div>
                <div>
                  <label className="label">עד שעה</label>
                  <input type="time" className="input w-28" value={guestForm.end_time}
                    onChange={e => setGuestForm(p => ({ ...p, end_time: e.target.value }))} />
                </div>
                <button className="btn btn-primary" onClick={searchGuestRooms} disabled={guestSearching}>
                  {guestSearching ? 'מחפש...' : 'חפש חדרים פנויים'}
                </button>
                <button className="btn btn-ghost" onClick={() => { setShowGuest(false); setGuestStep('form'); }}>ביטול</button>
              </div>
            )}

            {guestStep === 'pick-room' && (
              <div>
                <p className="text-sm text-teal-800 mb-3 font-medium">
                  בחר חדר לאורח <strong>{guestForm.guest_name}</strong> — {guestForm.specific_date} בין {guestForm.start_time}–{guestForm.end_time}
                </p>
                {guestAvailableRooms.length === 0 ? (
                  <p className="text-red-600 text-sm mb-3">אין חדרים פנויים בשעות אלו.</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
                    {guestAvailableRooms.map(r => (
                      <button key={r.id}
                        className="border-2 border-teal-300 rounded-xl p-3 text-center hover:border-teal-600 hover:bg-teal-100 transition-colors"
                        onClick={() => addGuest(r.id)}>
                        <div className="text-base font-bold text-teal-800">{r.name}</div>
                        {r.notes && <div className="text-xs text-gray-500 mt-0.5">{r.notes}</div>}
                      </button>
                    ))}
                  </div>
                )}
                <button className="btn btn-ghost text-sm" onClick={() => setGuestStep('form')}>← חזור</button>
              </div>
            )}

            {guests.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-teal-800 mb-2">אורחים קרובים:</p>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-teal-100 text-right">
                      <th className="border border-teal-200 px-2 py-1">שם</th>
                      <th className="border border-teal-200 px-2 py-1">חדר</th>
                      <th className="border border-teal-200 px-2 py-1">תאריך</th>
                      <th className="border border-teal-200 px-2 py-1">שעות</th>
                      <th className="border border-teal-200 px-2 py-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {guests.map(g => (
                      <tr key={g.id} className="hover:bg-teal-50">
                        <td className="border border-teal-200 px-2 py-1 font-medium">{g.user_name}</td>
                        <td className="border border-teal-200 px-2 py-1">{g.room_name}</td>
                        <td className="border border-teal-200 px-2 py-1">{g.specific_date}</td>
                        <td className="border border-teal-200 px-2 py-1">{g.start_time}–{g.end_time}</td>
                        <td className="border border-teal-200 px-2 py-1">
                          <button className="text-red-500 hover:text-red-700"
                            onClick={async () => { await deleteAssignment(g.id); loadGuests(); }}>מחק</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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
                    {(() => {
                      const conflict = genResult.conflicts?.find(c => c.userName === s.userName);
                      const stats = conflict && genResult.userStats?.[conflict.userId];
                      if (!stats) return null;
                      return (
                        <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1 mb-2 flex flex-wrap gap-3">
                          <span>שובץ: {stats.assignedSlots}/{stats.totalSlots} ימים</span>
                          {stats.unassignedDays?.length > 0 && <span className="text-red-600">ללא חדר: {stats.unassignedDays.join(', ')}</span>}
                          {stats.assignedRooms?.length > 0 && <span>חדרים: {stats.assignedRooms.join(', ')}</span>}
                        </div>
                      );
                    })()}
                    {s.slots.map((slot, j) => (
                      <div key={j} className="mb-3">
                        <p className="text-xs font-medium text-yellow-700 mb-1">יום {slot.day} | {slot.time}</p>
                        {slot.tips.length === 0 ? (
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-red-500">לא נמצאו חדרים פנויים — יש לשנות את לוח הזמנים</p>
                            <button className="text-xs text-gray-400 hover:text-gray-600 underline shrink-0"
                              onClick={() => dismissConflictSlot(s.userName, slot.day, slot.time)}>סגור</button>
                          </div>
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
                                      onClick={() => applySuggestion(tip.action, `${i}-${j}-${k}`, s.userName, slot.day, slot.time)}>
                                      {applying === `${i}-${j}-${k}` ? '...' : 'אשר ↵'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                            {/* If all tips are info-only (alt_day) with no action, show dismiss */}
                            {slot.tips.every(t => !t.action) && (
                              <button className="text-xs text-gray-400 hover:text-gray-600 underline mt-1"
                                onClick={() => dismissConflictSlot(s.userName, slot.day, slot.time)}>
                                הבנתי — סגור
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {genResult.preferenceConflicts?.some(pc => pc.type === 'contested') && (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-semibold text-red-700">🔴 חדרים שנדרשו על ידי יותר מעובד אחד — יש להכריע ידנית:</p>
                {genResult.preferenceConflicts.filter(pc => pc.type === 'contested').map((pc, i) => {
                  const [resolving2, setResolving2] = [null, () => {}]; // local stub — handled via assignConflict below
                  return (
                    <div key={i} className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm space-y-2">
                      <p className="font-semibold text-red-800">חדר {pc.roomName} — נדרש על ידי {pc.claimants.length} עובדים</p>
                      <p className="text-xs text-red-600">האלגוריתם לא שיבץ אף אחד לחדר זה — הכרע מי יקבל אותו:</p>
                      <div className="space-y-2">
                        {pc.claimants.map((c, j) => (
                          <div key={j} className="bg-white border border-red-100 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
                            <div className="flex-1 text-xs">
                              <span className="font-semibold">{c.userName}</span>
                              {c.assignedRoomName
                                ? <span className="text-gray-500"> — שובץ כעת ל{c.assignedRoomName}</span>
                                : <span className="text-red-500"> — לא שובץ</span>}
                              <span className="text-gray-400 mr-1">
                                ({c.slots.map(s => `${DAYS[s.day_of_week]} ${s.start_time}–${s.end_time}`).join(', ')})
                              </span>
                            </div>
                            <button
                              className="btn text-xs bg-blue-50 border border-blue-300 text-blue-800 hover:bg-blue-100"
                              onClick={async () => {
                                if (!confirm(`לשבץ את ${c.userName} לחדר ${pc.roomName}?`)) return;
                                try {
                                  const r = await api.post('/assignments/assign-contested', {
                                    assignments: [{ userId: c.userId, slots: c.slots }],
                                    roomId: pc.roomId,
                                  });
                                  setGenResult(prev => ({ ...prev, applyMsg: r.data.message, applyError: null }));
                                  load();
                                } catch (e) {
                                  setGenResult(prev => ({ ...prev, applyError: 'שגיאה: ' + (e.response?.data?.error || e.message) }));
                                }
                              }}>
                              שבץ {c.userName} לחדר {pc.roomName}
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        className="btn text-xs bg-purple-50 border border-purple-300 text-purple-800 hover:bg-purple-100 w-full"
                        onClick={async () => {
                          if (!confirm(`לשבץ את כולם יחד בחדר ${pc.roomName}?`)) return;
                          try {
                            const r = await api.post('/assignments/assign-contested', {
                              assignments: pc.claimants.map(c => ({ userId: c.userId, slots: c.slots })),
                              roomId: pc.roomId,
                            });
                            setGenResult(prev => ({ ...prev, applyMsg: r.data.message, applyError: null }));
                            load();
                          } catch (e) {
                            setGenResult(prev => ({ ...prev, applyError: 'שגיאה: ' + (e.response?.data?.error || e.message) }));
                          }
                        }}>
                        שבץ את כולם יחד בחדר {pc.roomName}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {genResult.preferenceConflicts?.some(pc => !pc.type) && (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-semibold text-orange-700">⚠️ חדר מועדף תפוס — עובדים שרצו חדר ספציפי אך שובצו לאחר:</p>
                {genResult.preferenceConflicts.filter(pc => !pc.type).map((pc, i) => {
                  const stats = genResult.userStats?.[pc.userId];
                  const blockers = pc.blockers || (pc.takenByUserId ? [{ userId: pc.takenByUserId, userName: pc.takenByUserName }] : []);
                  const room = rooms.find(r => r.name === pc.wantedRoomName);
                  const notifyKey = `${i}-notify`;
                  return (
                    <div key={i} className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm space-y-2">
                      {/* Header */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{pc.userName}</span>
                        <span className="text-orange-700 text-xs">ביקש חדר {pc.wantedRoomName}</span>
                        {pc.assignedRoomName
                          ? <span className="inline-flex items-center gap-1 bg-green-100 border border-green-300 text-green-800 font-semibold px-2 py-0.5 rounded text-xs">✓ שובץ בפועל: {pc.assignedRoomName}</span>
                          : <span className="inline-flex items-center bg-red-100 border border-red-300 text-red-700 font-semibold px-2 py-0.5 rounded text-xs">✗ לא שובץ כלל</span>}
                      </div>

                      {/* Stats for requested user */}
                      {stats && (
                        <div className="bg-white border border-orange-200 rounded-lg px-3 py-1.5 text-xs inline-block">
                          <div className="font-semibold text-gray-700">{pc.userName}</div>
                          <div>שובץ: {stats.assignedSlots}/{stats.totalSlots} ימים</div>
                          {stats.unassignedDays?.length > 0 && <div className="text-red-600">ללא חדר: {stats.unassignedDays.join(', ')}</div>}
                          {stats.assignedRooms?.length > 0 && <div className="text-gray-500">חדרים: {stats.assignedRooms.join(', ')}</div>}
                        </div>
                      )}

                      {/* Blockers list — each with a displace button */}
                      {blockers.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs text-gray-500 font-medium">תופסי החדר בשעות הרצויות:</p>
                          {blockers.map((bl, bi) => {
                            const blStats = genResult.userStats?.[bl.userId];
                            const displaceKey = `${i}-${bi}`;
                            return (
                              <div key={bi} className="flex flex-wrap items-center gap-2 bg-white border border-orange-100 rounded-lg px-3 py-1.5">
                                <div className="flex-1 text-xs">
                                  <span className="font-semibold">{bl.userName}</span>
                                  {bl.day !== undefined && <span className="text-gray-500"> — יום {DAYS[bl.day]} {bl.start}–{bl.end}</span>}
                                  {blStats && <span className="text-gray-400 mr-1">({blStats.assignedSlots}/{blStats.totalSlots} ימים)</span>}
                                </div>
                                <button
                                  className="btn text-xs bg-red-50 border border-red-300 text-red-700 hover:bg-red-100 shrink-0"
                                  disabled={resolving === displaceKey}
                                  onClick={async () => {
                                    if (!confirm(`להסיר את ${bl.userName} ולשבץ את ${pc.userName} בחדר ${pc.wantedRoomName}?`)) return;
                                    await resolvePreference('displace', {
                                      userId: pc.userId,
                                      blockerUserId: bl.userId,
                                      roomId: room?.id,
                                      day: bl.day,
                                      start: bl.start,
                                      end: bl.end,
                                    }, displaceKey);
                                  }}>
                                  {resolving === displaceKey ? '...' : `הסר ${bl.userName} ושבץ ${pc.userName}`}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Notify employee of rejection */}
                      <div className="border-t border-orange-200 pt-2 space-y-1">
                        <p className="text-xs text-gray-500 font-medium">שלח הודעת דחייה ל{pc.userName}:</p>
                        <div className="flex gap-2 flex-wrap items-start">
                          <textarea
                            rows={2}
                            className="input flex-1 text-xs min-w-[180px]"
                            placeholder={`שיבוצך לחדר ${pc.wantedRoomName} לא אושר — שובצת בחדר ${pc.assignedRoomName || 'אחר'}`}
                            value={notifyMsgs[i] || ''}
                            onChange={e => setNotifyMsgs(prev => ({ ...prev, [i]: e.target.value }))}
                          />
                          <button
                            className="btn text-xs bg-orange-100 border border-orange-300 text-orange-800 hover:bg-orange-200 shrink-0"
                            disabled={resolving === notifyKey}
                            onClick={async () => {
                              await resolvePreference('notify', {
                                userId: pc.userId,
                                roomId: room?.id,
                                message: notifyMsgs[i] || '',
                              }, notifyKey);
                            }}>
                            {resolving === notifyKey ? '...' : '📨 שלח הודעה'}
                          </button>
                        </div>
                      </div>

                      {/* Assign together (fallback) */}
                      {pc.slots?.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {pc.slots.map((s, k) => {
                            if (!room) return null;
                            return (
                              <button key={k} className="btn btn-ghost text-xs border border-orange-300 text-orange-700 hover:bg-orange-100"
                                onClick={() => assignTogether(pc.userId, room.id, s.day_of_week, s.start_time, s.end_time, pc.userName, pc.wantedRoomName)}>
                                שבץ יחד ביום {DAYS[s.day_of_week]} {s.start_time}–{s.end_time}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {genResult.assignmentTrace?.filter(t => t.wanted && t.result !== 'got_wanted').length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">🔍 מעקב שיבוצים — עובדים שלא קיבלו את החדר הרצוי:</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-100 text-right">
                        <th className="border border-gray-200 px-2 py-1">עובד</th>
                        <th className="border border-gray-200 px-2 py-1">רצה</th>
                        <th className="border border-gray-200 px-2 py-1">קיבל</th>
                        <th className="border border-gray-200 px-2 py-1">חסום ע"י</th>
                      </tr>
                    </thead>
                    <tbody>
                      {genResult.assignmentTrace.filter(t => t.wanted && t.result !== 'got_wanted').map((t, i) => (
                        <tr key={i} className={t.result === 'unassigned' ? 'bg-red-50' : 'hover:bg-gray-50'}>
                          <td className="border border-gray-200 px-2 py-1 font-medium">{t.userName}</td>
                          <td className="border border-gray-200 px-2 py-1 text-blue-700">
                            {t.wanted}
                            <span className="text-gray-400 mr-1">({t.wantedType === 'preferred' ? 'מועדף' : 'נוכחי'})</span>
                          </td>
                          <td className="border border-gray-200 px-2 py-1">
                            {t.gotRoom
                              ? <span className="text-green-700">{t.gotRoom}</span>
                              : <span className="text-red-600 font-medium">לא שובץ</span>}
                          </td>
                          <td className="border border-gray-200 px-2 py-1 text-gray-600">
                            {t.blockedReasons?.length > 0
                              ? t.blockedReasons.map((b, j) => <span key={j} className="mr-2">{b.day}: {b.blockedBy}</span>)
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
              {rooms.filter(r => r.is_active !== false).sort((a, b) => {
                  const n = x => parseInt((x.name || '').match(/\d+/)?.[0] ?? '999');
                  return n(a) - n(b);
                })
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
                            <div key={a.id} className={`border rounded px-1.5 py-0.5 mb-0.5 group relative ${highlighted ? 'bg-yellow-100 border-yellow-400' : a.is_guest ? 'bg-teal-50 border-teal-300' : 'bg-blue-50 border-blue-200'}`}>
                              <div className={`font-medium leading-tight ${highlighted ? 'text-yellow-900' : a.is_guest ? 'text-teal-900' : 'text-blue-900'}`}>{a.user_name}{a.is_guest && ' 👤'}</div>
                              <div className="text-gray-500 leading-tight">{a.start_time}–{a.end_time}</div>
                              <button onClick={() => deleteAssignment(a.id)} className="absolute top-0 left-0 hidden group-hover:flex items-center justify-center w-4 h-4 bg-red-500 text-white rounded-full text-xs leading-none">×</button>
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
                  {byDay[selectedDay].filter(a => !search || a.user_name?.includes(search)).sort((a,b) => {
                    const n = x => parseInt((x.room_name || '').match(/\d+/)?.[0] ?? '999');
                    return n(a) - n(b);
                  }).map(a => (
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
                    <div key={a.id} className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs flex gap-2 items-start">
                      <div>
                        <div className="font-medium text-blue-800">{DAYS[a.day_of_week]}</div>
                        <div>{a.room_name}</div>
                        <div className="text-gray-500">{a.start_time}–{a.end_time}</div>
                      </div>
                      <button onClick={() => deleteAssignment(a.id)} className="text-red-400 hover:text-red-600 text-base leading-none mt-0.5">×</button>
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
      {/* Algorithm debugger per employee */}
      <div className="card">
        <h3 className="font-semibold mb-3 text-gray-700">🔍 אבחון אלגוריתם לפי עובד</h3>
        <div className="flex gap-3 items-end mb-4">
          <div className="flex-1">
            <label className="label">בחר עובד</label>
            <select className="select" value={debugUserId} onChange={e => { setDebugUserId(e.target.value); setDebugResult(null); }}>
              <option value="">בחר עובד...</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" disabled={!debugUserId || debugLoading}
            onClick={async () => {
              setDebugLoading(true);
              try { const r = await api.get(`/assignments/user-debug/${debugUserId}`); setDebugResult(r.data); }
              catch (e) { setDebugResult({ error: e.response?.data?.error || e.message }); }
              finally { setDebugLoading(false); }
            }}>
            {debugLoading ? 'טוען...' : 'בדוק'}
          </button>
        </div>

        {debugResult?.error && <div className="text-red-600 text-sm">{debugResult.error}</div>}

        {debugResult && !debugResult.error && (
          <div className="space-y-4 text-sm">
            {/* Issues */}
            {debugResult.issues.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="font-semibold text-yellow-800 mb-1">⚠️ בעיות שזוהו:</p>
                <ul className="space-y-1">
                  {debugResult.issues.map((iss, i) => <li key={i} className="text-yellow-900">• {iss}</li>)}
                </ul>
              </div>
            )}

            {/* Summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'חדר מועדף', value: debugResult.preferredRoomName || '—', color: debugResult.preferredRoomName ? 'text-blue-700' : 'text-gray-400' },
                { label: 'חדר נוכחי (לפי אלגוריתם)', value: debugResult.currentRoomName || '—', color: debugResult.currentRoomName ? 'text-green-700' : 'text-gray-400' },
                { label: 'Pass 1 אפשרי?', value: debugResult.pass1Eligible ? 'כן ✅' : 'לא ❌', color: debugResult.pass1Eligible ? 'text-green-700' : 'text-red-600' },
                { label: 'מתחרים על חדר מועדף', value: debugResult.othersWantPreferred.join(', ') || 'אין', color: debugResult.othersWantPreferred.length ? 'text-orange-600' : 'text-gray-500' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">{label}</div>
                  <div className={`font-semibold ${color}`}>{value}</div>
                </div>
              ))}
            </div>

            {/* Schedule slots */}
            {debugResult.schedules.length > 0 && (
              <div>
                <p className="font-medium text-gray-700 mb-2">לוח זמנים:</p>
                <table className="tbl">
                  <thead><tr><th>יום</th><th>משעה</th><th>עד</th><th>חדר מועדף</th></tr></thead>
                  <tbody>
                    {debugResult.schedules.map((s, i) => (
                      <tr key={i}>
                        <td>{DAYS[s.day_of_week]}</td>
                        <td>{s.start_time}</td>
                        <td>{s.end_time}</td>
                        <td>{s.preferred_room_name || <span className="text-gray-400">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Current assignments */}
            {debugResult.assignments.length > 0 && (
              <div>
                <p className="font-medium text-gray-700 mb-2">שיבוצים קבועים נוכחיים:</p>
                <table className="tbl">
                  <thead><tr><th>יום</th><th>חדר</th><th>משעה</th><th>עד</th></tr></thead>
                  <tbody>
                    {debugResult.assignments.map((a, i) => (
                      <tr key={i}>
                        <td>{a.day_name}</td>
                        <td className="font-medium">{a.room_name}</td>
                        <td>{a.start_time}</td>
                        <td>{a.end_time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Also show from last algo run if available */}
            {genResult?.assignmentTrace && (() => {
              const t = genResult.assignmentTrace.find(t => t.userId === +debugUserId);
              if (!t) return null;
              return (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="font-semibold text-blue-800 mb-1">תוצאת הרצת האלגוריתם האחרונה:</p>
                  <div className="text-blue-900">
                    {t.result === 'got_wanted' && <span>✅ קיבל/ה את החדר הרצוי ({t.wanted})</span>}
                    {t.result === 'got_other' && <span>🔄 רצה/תה <b>{t.wanted}</b>, קיבל/ה <b>{t.gotRoom}</b></span>}
                    {t.result === 'unassigned' && <span className="text-red-600">❌ לא שובץ/ה</span>}
                    {t.result === 'no_preference' && <span>ℹ️ ללא העדפה, שובץ/ה ל-<b>{t.gotRoom}</b></span>}
                    {t.blockedReasons?.length > 0 && (
                      <div className="mt-1 text-xs text-blue-700">
                        חסום ע"י: {t.blockedReasons.map((b, i) => <span key={i} className="mr-2">{b.day}: {b.blockedBy}</span>)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Preferred room summary */}
      <div className="card">
        <h3 className="font-semibold mb-3 text-gray-700">חדר מועדף לפי עובד</h3>
        <p className="text-xs text-gray-500 mb-3">מה כל עובד ביקש כחדר קבוע. ריק = לא הוגדרה העדפה.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 text-right">
                <th className="border border-gray-200 px-3 py-2 font-semibold">שם</th>
                <th className="border border-gray-200 px-3 py-2 font-semibold">תפקיד</th>
                <th className="border border-gray-200 px-3 py-2 font-semibold">חדר מועדף</th>
                <th className="border border-gray-200 px-3 py-2 font-semibold">ימי עבודה</th>
              </tr>
            </thead>
            <tbody>
              {users.filter(u => schedules.some(s => s.user_id === u.id)).map(u => {
                const userSlots = schedules.filter(s => s.user_id === u.id);
                const prefRoom = userSlots.find(s => s.room_name)?.room_name || null;
                const workDays = [...new Set(userSlots.map(s => DAYS[s.day_of_week]))].join(', ');
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="border border-gray-200 px-3 py-1.5 font-medium">{u.name}</td>
                    <td className="border border-gray-200 px-3 py-1.5 text-gray-600">{ROLES[u.role] || u.role}</td>
                    <td className="border border-gray-200 px-3 py-1.5">
                      {prefRoom
                        ? <span className="text-blue-700 font-medium">{prefRoom}</span>
                        : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="border border-gray-200 px-3 py-1.5 text-gray-600 text-xs">{workDays}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
