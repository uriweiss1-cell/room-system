import { useState, useEffect } from 'react';
import api from '../../api';
import { DAYS, ROLES, ROLE_COLORS, STATUS_LABELS, STATUS_COLORS, REQUEST_TYPE_LABELS } from '../../constants';

function RoomPicker({ req, onAssigned }) {
  const [rooms, setRooms] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/requests/available-rooms', { params: { date: req.specific_date, start_time: req.start_time, end_time: req.end_time } })
      .then(r => setRooms(r.data))
      .catch(() => setRooms([]));
  }, []);

  const assign = async roomId => {
    setLoading(true);
    try {
      const r = await api.post(`/requests/${req.id}/assign-room`, { room_id: roomId });
      setMsg(r.data.message);
      setTimeout(onAssigned, 800);
    } catch (e) { setMsg('שגיאה: ' + (e.response?.data?.error || e.message)); }
    finally { setLoading(false); }
  };

  if (!rooms) return <div className="text-sm text-gray-400 mt-3">טוען חדרים...</div>;

  const free = rooms.filter(r => r.available);
  const busy = rooms.filter(r => !r.available);

  return (
    <div className="mt-3 border-t pt-3">
      {msg && <div className="text-green-700 text-sm mb-2 font-medium">{msg}</div>}
      <p className="text-sm font-semibold mb-2">חדרים פנויים ל-{req.specific_date} | {req.start_time}–{req.end_time}</p>
      {free.length === 0 ? (
        <p className="text-red-500 text-sm">אין חדרים פנויים בשעות אלו</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
          {free.map(r => (
            <button key={r.id} onClick={() => assign(r.id)} disabled={loading}
              className="bg-green-50 hover:bg-green-100 border-2 border-green-300 rounded-xl py-2 px-1 text-sm font-semibold text-green-800 transition-colors">
              {r.name}
            </button>
          ))}
        </div>
      )}
      {busy.length > 0 && (
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer mb-1">חדרים תפוסים ({busy.length})</summary>
          <div className="grid grid-cols-2 gap-1 mt-1">
            {busy.map(r => (
              <div key={r.id} className="bg-gray-50 border border-gray-200 rounded px-2 py-1">
                <span className="font-medium">{r.name}</span>
                {r.occupants.map((o, i) => <div key={i} className="text-gray-400">{o.name} {o.start}–{o.end}</div>)}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default function AdminRequests() {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [expandedId, setExpandedId] = useState(null);
  const [responseForm, setResponseForm] = useState({ status: 'approved', admin_response: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); }, []);
  const load = () => api.get('/requests/all').then(r => setRequests(r.data));

  const openRespond = req => {
    setExpandedId(req.id);
    setResponseForm({ status: 'approved', admin_response: '' });
    setMsg('');
  };

  const submitResponse = async id => {
    await api.put(`/requests/${id}`, responseForm);
    setExpandedId(null); load();
  };

  const filtered = requests.filter(r => filter === 'all' || r.status === filter);
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-5">
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
                      {req.room_name && <span> | חדר: {req.room_name}</span>}
                    </div>
                    {req.notes && <div className="text-sm text-gray-500 mt-1">הערת עובד: {req.notes}</div>}
                    {req.admin_response && <div className="text-sm text-blue-700 mt-1">תגובת מנהל: {req.admin_response}</div>}
                  </div>
                  {req.status === 'pending' && expandedId !== req.id && (
                    <button className="btn btn-primary text-sm" onClick={() => openRespond(req)}>טפל בבקשה</button>
                  )}
                </div>

                {/* Room request — show room picker */}
                {expandedId === req.id && req.request_type === 'room_request' && (
                  <div>
                    <RoomPicker req={req} onAssigned={() => { setExpandedId(null); load(); }} />
                    <div className="flex gap-2 mt-3 border-t pt-3 items-end flex-wrap">
                      <div>
                        <label className="label">הודעה לעובד (אופציונלי)</label>
                        <input className="input w-60" value={responseForm.admin_response} onChange={e => setResponseForm(p=>({...p,admin_response:e.target.value}))} placeholder="הסבר / הערה..." />
                      </div>
                      <button className="btn btn-danger" onClick={() => { setResponseForm(p=>({...p,status:'rejected'})); submitResponse(req.id); }}>דחה בקשה</button>
                      <button className="btn btn-ghost" onClick={() => setExpandedId(null)}>ביטול</button>
                    </div>
                  </div>
                )}

                {/* Permanent / other request — show standard form */}
                {expandedId === req.id && req.request_type !== 'room_request' && (
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
