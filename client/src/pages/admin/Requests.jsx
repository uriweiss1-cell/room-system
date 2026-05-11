import { useState, useEffect } from 'react';
import api from '../../api';
import { DAYS, ROLES, ROLE_COLORS, STATUS_LABELS, STATUS_COLORS, REQUEST_TYPE_LABELS } from '../../constants';

function PermanentRoomPicker({ req, selectedRoomId, onSelect }) {
  const [rooms, setRooms] = useState(null);
  const [adjStart, setAdjStart] = useState(req.start_time);
  const [adjEnd, setAdjEnd] = useState(req.end_time);

  const fetchRooms = (s, e) => {
    setRooms(null);
    api.get('/requests/available-rooms-permanent', { params: { day_of_week: req.day_of_week, start_time: s, end_time: e, user_id: req.user_id } })
      .then(r => setRooms(r.data))
      .catch(() => setRooms([]));
  };

  useEffect(() => { fetchRooms(adjStart, adjEnd); }, []);

  const isPartial = adjStart !== req.start_time || adjEnd !== req.end_time;

  if (!rooms) return <div className="text-sm text-gray-400">טוען חדרים...</div>;
  const free = rooms.filter(r => r.available);
  const busy = rooms.filter(r => !r.available);
  const withWindows = busy.filter(r => r.free_windows?.length > 0);

  return (
    <div>
      <p className="text-sm font-semibold mb-2">
        חדרים פנויים ביום {DAYS[req.day_of_week]}
        {isPartial && <span className="text-orange-600"> (שיבוץ חלקי — מקורי: {req.start_time}–{req.end_time})</span>}
      </p>
      <div className="flex gap-3 items-end mb-3">
        <div>
          <label className="label text-xs">משעה</label>
          <input type="time" className="input w-28 text-sm" value={adjStart}
            onChange={e => { setAdjStart(e.target.value); fetchRooms(e.target.value, adjEnd); }} />
        </div>
        <div>
          <label className="label text-xs">עד שעה</label>
          <input type="time" className="input w-28 text-sm" value={adjEnd}
            onChange={e => { setAdjEnd(e.target.value); fetchRooms(adjStart, e.target.value); }} />
        </div>
      </div>

      {/* Rooms with partial free windows */}
      {withWindows.length > 0 && (
        <div className="mb-3 space-y-1">
          {withWindows.map(r =>
            r.free_windows.map((w, i) => {
              const isSelected = selectedRoomId == r.id && adjStart === w.from && adjEnd === w.to;
              return (
                <div key={`${r.id}-${i}`} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm flex-wrap border ${isSelected ? 'bg-green-100 border-green-500' : r.user_already_here?.length > 0 ? 'bg-orange-50 border-orange-300' : 'bg-blue-50 border-blue-200'}`}>
                  <span className={`font-semibold ${isSelected ? 'text-green-900' : 'text-blue-800'}`}>{r.name}</span>
                  {r.user_already_here?.length > 0 && (
                    <span className="text-orange-700 font-medium">⚠️ כבר משובץ: {r.user_already_here.join(', ')}</span>
                  )}
                  <span className={isSelected ? 'text-green-700 font-medium' : 'text-blue-700'}>
                    {isSelected ? '✓ נבחר' : `פנוי בין ${w.from}–${w.to}`}
                  </span>
                  <button
                    className={`btn text-xs py-0.5 px-2 ${isSelected ? 'btn-success' : 'btn-ghost border border-blue-300 text-blue-700 hover:bg-blue-100'}`}
                    onClick={() => {
                      setAdjStart(w.from); setAdjEnd(w.to); fetchRooms(w.from, w.to);
                      // Also select this room+window so the admin doesn't need an extra click
                      onSelect({ id: r.id, start_time: w.from, end_time: w.to });
                    }}>
                    {isSelected ? '✓ שובץ' : `שבץ ${w.from}–${w.to}`}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {free.length === 0 && withWindows.length === 0 && (
        <p className="text-red-500 text-sm mb-2">אין חדרים פנויים בשעות אלו</p>
      )}
      {free.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
          {free.map(r => (
            <button key={r.id} onClick={() => onSelect({ id: r.id, start_time: adjStart, end_time: adjEnd })}
              className={`border-2 rounded-xl py-2 px-1 text-sm font-semibold transition-colors ${selectedRoomId == r.id ? 'bg-green-200 border-green-600 text-green-900' : 'bg-green-50 hover:bg-green-100 border-green-300 text-green-800'}`}>
              {r.name}
              {r.user_already_here?.length > 0 && (
                <div className="text-xs font-normal text-orange-600 mt-0.5">⚠️ כבר משובץ: {r.user_already_here.join(', ')}</div>
              )}
            </button>
          ))}
        </div>
      )}
      {busy.length > 0 && (
        <details className="text-xs text-gray-500 mb-2">
          <summary className="cursor-pointer mb-1">חדרים תפוסים ({busy.length})</summary>
          <div className="grid grid-cols-2 gap-1 mt-1">
            {busy.map(r => (
              <div key={r.id} className="bg-gray-50 border border-gray-200 rounded px-2 py-1">
                <span className="font-medium">{r.name}</span>
                {r.free_windows?.length > 0 && <span className="text-blue-600 mr-1"> — פנוי: {r.free_windows.map(w => `${w.from}–${w.to}`).join(', ')}</span>}
                {r.user_already_here?.length > 0 && (
                  <div className="text-orange-600">⚠️ כבר משובץ: {r.user_already_here.join(', ')}</div>
                )}
                {r.occupants.map((o, i) => <div key={i} className="text-gray-400">{o.name} {o.start}–{o.end}</div>)}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function RoomPicker({ req, onAssigned, alreadyAssigned = [] }) {
  const [rooms, setRooms] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [adjStart, setAdjStart] = useState(req.start_time);
  const [adjEnd, setAdjEnd] = useState(req.end_time);
  const [adminMsg, setAdminMsg] = useState('');
  const [assignedSlots, setAssignedSlots] = useState(alreadyAssigned); // list of {roomName, start, end}

  const fetchRooms = (s, e) => {
    setRooms(null);
    api.get('/requests/available-rooms', { params: { date: req.specific_date, start_time: s, end_time: e } })
      .then(r => setRooms(r.data))
      .catch(() => setRooms([]));
  };

  useEffect(() => { fetchRooms(adjStart, adjEnd); }, []);

  const assign = async roomId => {
    setLoading(true);
    try {
      const isFirst = assignedSlots.length === 0;
      const endpoint = isFirst
        ? `/requests/${req.id}/assign-room`
        : `/requests/${req.id}/add-partial`;
      const r = await api.post(endpoint, { room_id: roomId, start_time: adjStart, end_time: adjEnd, admin_response: adminMsg || null });
      const roomName = rooms?.find(x => x.id === roomId)?.name || roomId;
      setAssignedSlots(prev => [...prev, { roomName, start: adjStart, end: adjEnd }]);
      setMsg(r.data.message);
      // Reset times to original for next potential partial assignment
      setAdjStart(req.start_time);
      setAdjEnd(req.end_time);
      fetchRooms(req.start_time, req.end_time);
    } catch (e) { setMsg('שגיאה: ' + (e.response?.data?.error || e.message)); }
    finally { setLoading(false); }
  };

  const isPartial = adjStart !== req.start_time || adjEnd !== req.end_time;

  // Compute remaining uncovered gaps in the original requested time range
  const toMin2 = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
  const minToStr2 = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  const remainingGaps = (() => {
    if (!assignedSlots.length) return [];
    const origS = toMin2(req.start_time), origE = toMin2(req.end_time);
    const parts = assignedSlots.map(s => ({ s: toMin2(s.start), e: toMin2(s.end) })).sort((a,b) => a.s - b.s);
    const gaps = [];
    let cur = origS;
    for (const p of parts) {
      if (p.s > cur) gaps.push({ from: minToStr2(cur), to: minToStr2(p.s) });
      cur = Math.max(cur, p.e);
    }
    if (cur < origE) gaps.push({ from: minToStr2(cur), to: minToStr2(origE) });
    return gaps;
  })();

  return (
    <div className="mt-3 border-t pt-3">
      {/* Already-assigned slots summary */}
      {assignedSlots.length > 0 && (
        <div className="mb-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <div className="font-semibold text-green-800 text-sm mb-1">שיבוצים שנוצרו:</div>
          {assignedSlots.map((s, i) => (
            <div key={i} className="text-sm text-green-700">{s.roomName}: {s.start}–{s.end}</div>
          ))}
          {remainingGaps.length > 0 && (
            <div className="mt-2 border-t border-green-200 pt-2">
              <div className="text-xs text-orange-700 font-medium mb-1">⏱ שעות שנותרו ללא שיבוץ (מהבקשה המקורית {req.start_time}–{req.end_time}):</div>
              <div className="flex flex-wrap gap-2">
                {remainingGaps.map((g, i) => (
                  <button key={i} className="btn btn-ghost text-xs py-0.5 px-2 border border-orange-300 text-orange-700 hover:bg-orange-50"
                    onClick={() => { setAdjStart(g.from); setAdjEnd(g.to); fetchRooms(g.from, g.to); }}>
                    השלם {g.from}–{g.to}
                  </button>
                ))}
              </div>
            </div>
          )}
          {remainingGaps.length === 0 && (
            <div className="text-xs text-green-600 mt-1">✅ הטווח המלא {req.start_time}–{req.end_time} מכוסה</div>
          )}
          <button className="btn btn-success mt-2 text-sm" onClick={onAssigned}>סיים ✓</button>
        </div>
      )}
      {msg && <div className="text-green-700 text-sm mb-2 font-medium">{msg}</div>}
      <p className="text-sm font-semibold mb-2">
        {assignedSlots.length > 0 ? 'הוסף שיבוץ נוסף' : `חדרים פנויים ל-${req.specific_date}`}
        {isPartial && <span className="text-orange-600"> (שיבוץ חלקי)</span>}
      </p>
      <div className="flex gap-3 items-end mb-3 flex-wrap">
        <div>
          <label className="label text-xs">משעה</label>
          <input type="time" className="input w-28 text-sm" value={adjStart}
            onChange={e => { setAdjStart(e.target.value); fetchRooms(e.target.value, adjEnd); }} />
        </div>
        <div>
          <label className="label text-xs">עד שעה</label>
          <input type="time" className="input w-28 text-sm" value={adjEnd}
            onChange={e => { setAdjEnd(e.target.value); fetchRooms(adjStart, e.target.value); }} />
        </div>
        {isPartial && (
          <div className="text-xs text-orange-600 pb-1">בקשה מקורית: {req.start_time}–{req.end_time}</div>
        )}
      </div>
      {!rooms ? (
        <div className="text-sm text-gray-400 mb-3">טוען חדרים...</div>
      ) : (
        <>
          {/* Rooms with partial free windows */}
          {rooms.filter(r => !r.available && r.free_windows?.length > 0).length > 0 && (
            <div className="mb-3 space-y-1">
              {rooms.filter(r => !r.available && r.free_windows?.length > 0).map(r =>
                r.free_windows.map((w, i) => (
                  <div key={`${r.id}-${i}`} className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm flex-wrap">
                    <span className="font-semibold text-blue-800">{r.name}</span>
                    <span className="text-blue-700">פנוי בין {w.from}–{w.to}</span>
                    <button className="btn btn-ghost text-xs py-0.5 px-2 border border-blue-300 text-blue-700 hover:bg-blue-100"
                      onClick={() => { setAdjStart(w.from); setAdjEnd(w.to); fetchRooms(w.from, w.to); }}>
                      שבץ {w.from}–{w.to}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
          {rooms.filter(r => r.available).length === 0 && rooms.filter(r => !r.available && r.free_windows?.length > 0).length === 0 && (
            <p className="text-red-500 text-sm mb-3">אין חדרים פנויים בשעות אלו</p>
          )}
          {rooms.filter(r => r.available).length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
              {rooms.filter(r => r.available).map(r => (
                <button key={r.id} onClick={() => assign(r.id)} disabled={loading}
                  className="bg-green-50 hover:bg-green-100 border-2 border-green-300 rounded-xl py-2 px-1 text-sm font-semibold text-green-800 transition-colors">
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {rooms && rooms.filter(r => !r.available).length > 0 && (
        <details className="text-xs text-gray-500 mb-3">
          <summary className="cursor-pointer mb-1">חדרים תפוסים ({rooms.filter(r => !r.available).length})</summary>
          <div className="grid grid-cols-2 gap-1 mt-1">
            {rooms.filter(r => !r.available).map(r => (
              <div key={r.id} className="bg-gray-50 border border-gray-200 rounded px-2 py-1">
                <span className="font-medium">{r.name}</span>
                {r.free_windows?.length > 0 && <span className="text-blue-600 mr-1"> — פנוי: {r.free_windows.map(w => `${w.from}–${w.to}`).join(', ')}</span>}
                {r.occupants.map((o, i) => <div key={i} className="text-gray-400">{o.name} {o.start}–{o.end}</div>)}
              </div>
            ))}
          </div>
        </details>
      )}
      <div>
        <label className="label text-xs">הודעה לעובד (אופציונלי)</label>
        <input className="input w-full text-sm" value={adminMsg} onChange={e => setAdminMsg(e.target.value)}
          placeholder={isPartial ? `לדוגמה: שובצת לחדר רק בין ${adjStart}–${adjEnd} כיוון שהחדר תפוס בשעות הנותרות` : 'הסבר / הערה...'} />
      </div>
    </div>
  );
}

function WeeklySwapSummary() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { api.get('/requests/swaps-weekly').then(r => setData(r.data)).catch(() => {}); }, []);
  if (!data || data.summary.length === 0) return null;
  const repeated = data.summary.filter(u => u.repeated);
  return (
    <div className={`card border ${repeated.length > 0 ? 'border-orange-300 bg-orange-50' : 'border-blue-200 bg-blue-50'}`}>
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="font-semibold text-sm flex items-center gap-2">
          🔄 חדרים חלופיים השבוע ({data.from} – {data.to})
          {repeated.length > 0 && <span className="badge badge-yellow">{repeated.length} עובד/ת חזרו/ה על הבקשה</span>}
        </div>
        <span className="text-gray-400 text-xs">{open ? '▲ סגור' : '▼ הצג'}</span>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          {data.summary.map((u, i) => (
            <div key={i} className={`rounded-lg border px-3 py-2 ${u.repeated ? 'border-orange-300 bg-white' : 'border-gray-200 bg-white'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium">{u.user_name}</span>
                {u.repeated && <span className="badge badge-yellow">⚠️ {u.count} פעמים השבוע</span>}
              </div>
              {u.swaps.map((s, j) => (
                <div key={j} className="text-xs text-gray-600 mb-0.5">
                  {s.specific_date} {s.start_time}–{s.end_time} | {s.original_room_name} → {s.new_room_name} | סיבה: {s.swap_reason}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminRequests() {
  const [requests, setRequests] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [expandedId, setExpandedId] = useState(null);
  const [responseForm, setResponseForm] = useState({ status: 'approved', admin_response: '', room_id: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); api.get('/rooms').then(r => setRooms(r.data.filter(x => x.is_active))); }, []);
  const load = () => api.get('/requests/all').then(r => setRequests(r.data));

  const openRespond = req => {
    setExpandedId(req.id);
    setResponseForm({ status: 'approved', admin_response: '', room_id: '' });
    setMsg('');
  };

  const submitResponse = async id => {
    await api.put(`/requests/${id}`, responseForm);
    setExpandedId(null); load();
  };

  const deleteRequest = async id => {
    if (!confirm('לדחות בקשה זו?')) return;
    await api.put(`/requests/${id}`, { status: 'rejected', admin_response: 'הבקשה נדחתה על ידי המנהל' });
    load();
  };

  // 'assigned' tab shows both one-time (status='assigned') and permanent (status='approved') approved requests
  const filtered = requests.filter(r => filter === 'all' || r.status === filter || (filter === 'assigned' && r.status === 'approved'));
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-5">
      <WeeklySwapSummary />
      <div className="card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-xl font-bold">בקשות עובדים {pendingCount > 0 && <span className="badge badge-yellow mr-2">{pendingCount} ממתינות</span>}</h2>
          <div className="flex gap-2">
            {[['pending','ממתינות'],['all','הכל'],['assigned','אושרו'],['rejected','נדחו']].map(([v,l]) => (
              <button key={v} className={`btn text-sm ${filter===v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(v)}>{l}</button>
            ))}
          </div>
        </div>

        {msg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm mb-3">{msg}</div>}

        {filtered.length === 0 ? (
          <p className="text-gray-400 text-sm">אין בקשות</p>
        ) : (
          <div className="space-y-3">
            {filtered.map(req => (
              <div key={req.id} className={`border rounded-xl p-4 ${req.status === 'pending' ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200'}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{req.user_name}</span>
                      <span className={`badge ${ROLE_COLORS[req.role]||'badge-gray'}`}>{ROLES[req.role]}</span>
                      <span className="badge badge-blue">{REQUEST_TYPE_LABELS[req.request_type]}</span>
                      <span className={`badge ${STATUS_COLORS[req.status]}`}>{STATUS_LABELS[req.status]}</span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {req.specific_date && <span>{req.specific_date} | </span>}
                      {req.day_of_week != null && <span>יום {DAYS[req.day_of_week]} | </span>}
                      {req.start_time && <span>{req.start_time}–{req.end_time}</span>}
                      {req.room_name && <span> | {req.room_name}</span>}
                      {/* For approved permanent_requests: show actual assigned slot if partial */}
                      {req.status === 'approved' && req.assigned_start_time && (
                        req.assigned_start_time !== req.start_time || req.assigned_end_time !== req.end_time
                          ? <span className="text-orange-600 font-medium"> ← שובץ: {req.assigned_start_time}–{req.assigned_end_time}</span>
                          : null
                      )}
                      {req.status === 'approved' && !req.room_name && (
                        <span className="text-gray-400 italic"> | ללא שיבוץ חדר</span>
                      )}
                    </div>
                    {req.swap_reason && <div className="text-sm text-orange-700 mt-1">🔄 סיבה לחדר חלופי: {req.swap_reason}</div>}
                    {req.notes && <div className="text-sm text-gray-500 mt-1">הערת עובד: {req.notes}</div>}
                    {req.admin_response && <div className="text-sm text-blue-700 mt-1">תגובת מנהל: {req.admin_response}</div>}
                    {req.existing_assignments?.length > 0 && (
                      <div className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1 mt-1">
                        ⚠️ לעובד כבר יש שיבוץ קבוע ביום זה: {req.existing_assignments.map(a => `${a.room_name} ${a.start_time}–${a.end_time}`).join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {(req.status === 'pending' || (req.status === 'assigned' && req.request_type === 'room_request')) && expandedId !== req.id && (
                      <button className="btn btn-primary text-sm" onClick={() => openRespond(req)}>
                        {req.status === 'assigned' ? '+ הוסף שיבוץ' : 'טפל בבקשה'}
                      </button>
                    )}
                    <button className="btn btn-danger text-sm" onClick={() => deleteRequest(req.id)}>מחק</button>
                  </div>
                </div>

                {/* Room request — show room picker */}
                {expandedId === req.id && req.request_type === 'room_request' && (
                  <div>
                    <RoomPicker req={req} onAssigned={() => { setExpandedId(null); load(); }}
                      alreadyAssigned={req.status === 'assigned' && req.room_name
                        // Use assigned_start/end_time (actual partial slot) not start/end_time (original full range)
                        ? [{ roomName: req.room_name, start: req.assigned_start_time || req.start_time, end: req.assigned_end_time || req.end_time },
                           ...(req.partial_siblings || [])]
                        : []} />
                    <div className="flex gap-2 mt-3 border-t pt-3 flex-wrap">
                      <button className="btn btn-danger" onClick={() => { setResponseForm(p=>({...p,status:'rejected'})); submitResponse(req.id); }}>דחה בקשה</button>
                      <button className="btn btn-ghost" onClick={() => setExpandedId(null)}>ביטול</button>
                    </div>
                  </div>
                )}

                {/* Permanent request — room picker + approval */}
                {expandedId === req.id && req.request_type === 'permanent_request' && (
                  <div className="mt-3 border-t pt-3 space-y-3">
                    {responseForm.status === 'approved' && !req.target_room_type && (
                      <PermanentRoomPicker req={req} selectedRoomId={responseForm.room_id}
                        onSelect={({ id, start_time, end_time }) => setResponseForm(p => ({ ...p, room_id: id, assign_start_time: start_time, assign_end_time: end_time }))} />
                    )}
                    {responseForm.status === 'approved' && req.target_room_type && (
                      <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-sm">
                        <span className="font-semibold text-purple-800">
                          {req.target_room_type === 'library' ? '📚 ספריה' : '🤝 חדר ישיבות'}
                        </span>
                        <span className="text-purple-700 mr-2">
                          — {req.day_of_week != null ? `יום ${['ראשון','שני','שלישי','רביעי','חמישי'][req.day_of_week]}` : ''} {req.start_time}–{req.end_time}
                        </span>
                        <div className="text-xs text-purple-600 mt-1">לחיצה על "שמור" תיצור שיבוץ קבוע בחדר זה</div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3 items-end">
                      <div>
                        <label className="label">החלטה</label>
                        <select className="select w-36" value={responseForm.status} onChange={e => setResponseForm(p=>({...p,status:e.target.value,room_id:''}))}>
                          <option value="approved">אישור</option>
                          <option value="rejected">דחייה</option>
                        </select>
                      </div>
                      <div>
                        <label className="label">הודעה לעובד (אופציונלי)</label>
                        <input className="input w-60" value={responseForm.admin_response} onChange={e => setResponseForm(p=>({...p,admin_response:e.target.value}))} placeholder="הסבר / הערה..." />
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <button className="btn btn-success" onClick={() => {
                        if (responseForm.status === 'approved' && !req.target_room_type && !responseForm.room_id) {
                          if (!confirm('לא נבחר חדר לשיבוץ. האם לאשר את הבקשה ללא שיבוץ חדר? (העובד יצטרך להישאר בחדרו הנוכחי)')) return;
                        }
                        submitResponse(req.id);
                      }}>שמור</button>
                      <button className="btn btn-ghost" onClick={() => setExpandedId(null)}>ביטול</button>
                      {responseForm.status === 'approved' && !req.target_room_type && !responseForm.room_id && (
                        <span className="text-orange-600 text-xs">⚠️ לא נבחר חדר</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Other requests (absence etc) — standard form */}
                {expandedId === req.id && req.request_type !== 'room_request' && req.request_type !== 'permanent_request' && (
                  <div className="mt-3 border-t pt-3 flex flex-wrap gap-3 items-end">
                    <div>
                      <label className="label">החלטה</label>
                      <select className="select w-36" value={responseForm.status} onChange={e => setResponseForm(p=>({...p,status:e.target.value}))}>
                        <option value="approved">אישור</option>
                        <option value="rejected">דחייה</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">הודעה לעובד (אופציונלי)</label>
                      <input className="input w-60" value={responseForm.admin_response} onChange={e => setResponseForm(p=>({...p,admin_response:e.target.value}))} placeholder="הסבר / הערה..." />
                    </div>
                    <button className="btn btn-success" onClick={() => submitResponse(req.id)}>שמור</button>
                    <button className="btn btn-ghost" onClick={() => setExpandedId(null)}>ביטול</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
