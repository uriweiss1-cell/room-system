import { useState, useEffect } from 'react';
import api from '../../api';
import { ROLES, ROLE_COLORS } from '../../constants';

function ShareLinkBanner() {
  const [ips, setIps] = useState([]);
  const [copied, setCopied] = useState('');
  useEffect(() => {
    api.get('/auth/network-info').then(r => setIps(r.data.ips)).catch(() => {});
  }, []);
  const copy = url => {
    navigator.clipboard.writeText(url).then(() => { setCopied(url); setTimeout(() => setCopied(''), 2000); });
  };
  if (!ips.length) return null;
  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5">
      <p className="text-sm font-semibold text-green-800 mb-2">קישור לעובדים (רשת מקומית)</p>
      <div className="flex flex-wrap gap-2">
        {ips.map(ip => {
          const url = `http://${ip}:5173`;
          return (
            <button key={ip} onClick={() => copy(url)}
              className="bg-white border border-green-300 rounded-lg px-3 py-1.5 text-sm font-mono text-green-900 hover:bg-green-100 transition-colors">
              {copied === url ? '✓ הועתק!' : url}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-green-600 mt-2">שתף קישור זה עם העובדים כדי שיוכלו להיכנס מהנייד</p>
    </div>
  );
}

const ROLE_OPTIONS = Object.entries(ROLES).filter(([k]) => k !== 'admin');
const emptyPerms = { perm_assignments: false, perm_algorithm: false, perm_requests: false, perm_users: false, perm_rooms: false };
const emptyUser = { name: '', email: '', password: '', role: 'clinical_intern', phone: '', notes: '', ...emptyPerms };

const PERM_LABELS = [
  { key: 'perm_assignments', label: 'ניהול שיבוץ', desc: 'רשת שבועית, הוספה ידנית, אורחים' },
  { key: 'perm_algorithm',   label: 'הפעלת אלגוריתם', desc: 'הרצה ופתרון קונפליקטים' },
  { key: 'perm_requests',    label: 'ניהול בקשות', desc: 'אישור/דחיית בקשות עובדים' },
  { key: 'perm_users',       label: 'ניהול עובדים', desc: 'הוספה, עריכה, לוח זמנים' },
  { key: 'perm_rooms',       label: 'ניהול חדרים', desc: 'הוספה, עריכה, קבצים' },
];

const COORDINATOR_PRESET = { perm_assignments: true, perm_algorithm: false, perm_requests: true, perm_users: false, perm_rooms: false };
const FULL_ADMIN_PRESET  = { perm_assignments: true, perm_algorithm: true,  perm_requests: true, perm_users: true,  perm_rooms: true  };
const allPermsOn = form => Object.keys(emptyPerms).every(k => !!form[k]);
const emptySlot = { day_of_week: 0, start_time: '08:00', end_time: '17:00' };
const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'];

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [form, setForm] = useState(emptyUser);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState('');
  const [search, setSearch] = useState('');

  // Schedule panel state
  const [schedulePanel, setSchedulePanel] = useState(null); // { userId, userName }
  const [scheduleSlots, setScheduleSlots] = useState([]);
  const [preferredRoom, setPreferredRoom] = useState('');
  const [scheduleMsg, setScheduleMsg] = useState('');

  useEffect(() => { load(); }, []);

  const load = () => Promise.all([
    api.get('/users').then(r => setUsers(r.data)),
    api.get('/rooms').then(r => setRooms(r.data)).catch(() => {}),
  ]);

  const openAdd = () => { setForm(emptyUser); setEditing(null); setShowForm(true); setMsg(''); setSchedulePanel(null); };
  const openEdit = u => {
    setForm({ ...emptyPerms, ...u, password: '' });
    setEditing(u.id); setShowForm(true); setMsg(''); setSchedulePanel(null);
  };
  const cancel = () => { setShowForm(false); setMsg(''); };

  const save = async () => {
    try {
      if (editing) await api.put(`/users/${editing}`, form);
      else {
        const r = await api.post('/users', form);
        if (r.data.tempPassword) setMsg(`נוצר! סיסמה זמנית: ${r.data.tempPassword}`);
      }
      load();
      if (!msg) setShowForm(false);
    } catch (e) { setMsg('שגיאה: ' + (e.response?.data?.error || e.message)); }
  };

  const deactivate = async id => {
    if (!confirm('להשבית עובד זה?')) return;
    await api.delete(`/users/${id}`);
    load();
  };

  const resetPin = async (u) => {
    const newPin = prompt(`אפס PIN עבור ${u.name}\nהכנס קוד PIN חדש בן 4 ספרות (ריק = מחק PIN):`);
    if (newPin === null) return;
    try {
      await api.post(`/users/${u.id}/reset-pin`, { pin: newPin });
      setMsg(`PIN עודכן עבור ${u.name}`);
    } catch (e) { setMsg('שגיאה: ' + (e.response?.data?.error || e.message)); }
  };

  const openSchedule = async (u) => {
    if (schedulePanel?.userId === u.id) { setSchedulePanel(null); return; }
    setSchedulePanel({ userId: u.id, userName: u.name });
    setScheduleMsg('');
    setShowForm(false);
    try {
      const r = await api.get(`/schedules/user/${u.id}`);
      const data = r.data;
      if (data.length > 0) {
        const pid = data.find(s => s.preferred_room_id)?.preferred_room_id;
        setPreferredRoom(pid != null ? String(pid) : '');
        setScheduleSlots(data.map(s => ({ day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time })));
      } else {
        setPreferredRoom('');
        setScheduleSlots([{ ...emptySlot }]);
      }
    } catch (e) { setScheduleMsg('שגיאה בטעינת לוח הזמנים'); }
  };

  const saveSchedule = async () => {
    if (!schedulePanel) return;
    try {
      const schedules = scheduleSlots.map(s => ({
        ...s,
        preferred_room_id: preferredRoom ? +preferredRoom : null,
      }));
      await api.put(`/schedules/user/${schedulePanel.userId}`, { schedules });
      setScheduleMsg('✓ לוח הזמנים עודכן בהצלחה');
    } catch (e) { setScheduleMsg('שגיאה: ' + (e.response?.data?.error || e.message)); }
  };

  const addSlot = () => setScheduleSlots(p => [...p, { ...emptySlot }]);
  const removeSlot = i => setScheduleSlots(p => p.filter((_, j) => j !== i));
  const updateSlot = (i, k, v) => setScheduleSlots(p => p.map((s, j) => j === i ? { ...s, [k]: v } : s));

  const filtered = users.filter(u => u.name.includes(search) || ROLES[u.role]?.includes(search));

  return (
    <div className="space-y-5">
      <ShareLinkBanner />
      <div className="card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-xl font-bold">ניהול עובדים</h2>
          <div className="flex gap-2">
            <input className="input w-44" placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} />
            <button className="btn btn-primary" onClick={openAdd}>+ עובד חדש</button>
          </div>
        </div>

        {msg && <div className={`px-4 py-2 rounded-lg text-sm mb-3 ${msg.startsWith('שגיאה') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>}

        {showForm && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-5">
            <h3 className="font-semibold mb-4">{editing ? 'עריכת עובד' : 'הוספת עובד חדש'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">שם מלא *</label><input className="input" value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} /></div>
              {Object.keys(emptyPerms).some(k => form[k]) && (
                <div><label className="label">אימייל (לכניסה עם סיסמה)</label><input type="email" className="input" dir="ltr" value={form.email||''} onChange={e => setForm(p=>({...p,email:e.target.value}))} /></div>
              )}
              <div><label className="label">{editing ? 'סיסמה חדשה (ריק = ללא שינוי)' : 'סיסמה (ריק = changeme123)'}</label><input type="password" className="input" value={form.password} onChange={e => setForm(p=>({...p,password:e.target.value}))} /></div>
              <div><label className="label">תפקיד *</label>
                <select className="select" value={form.role} onChange={e => setForm(p=>({...p,role:e.target.value}))}>
                  {ROLE_OPTIONS.map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><label className="label">טלפון</label><input type="tel" className="input" dir="ltr" value={form.phone||''} onChange={e => setForm(p=>({...p,phone:e.target.value}))} /></div>
              <div className="sm:col-span-2"><label className="label">הערות</label><textarea className="input h-16 resize-none" value={form.notes||''} onChange={e => setForm(p=>({...p,notes:e.target.value}))} /></div>
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <label className="label font-semibold">הרשאות ניהול</label>
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-ghost text-xs px-2 py-1"
                      onClick={() => setForm(p => ({ ...p, ...COORDINATOR_PRESET }))}>
                      🗂 מרכז/ת
                    </button>
                    <button type="button" className="btn btn-ghost text-xs px-2 py-1 text-blue-700 border-blue-300"
                      onClick={() => setForm(p => ({ ...p, ...FULL_ADMIN_PRESET }))}>
                      ⭐ גישה מלאה
                    </button>
                    <button type="button" className="btn btn-ghost text-xs px-2 py-1 text-gray-500"
                      onClick={() => setForm(p => ({ ...p, ...emptyPerms }))}>
                      ✕ נקה הכל
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PERM_LABELS.map(({ key, label, desc }) => (
                    <label key={key} className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${form[key] ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input type="checkbox" className="mt-0.5" checked={!!form[key]}
                        onChange={e => setForm(p => ({ ...p, [key]: e.target.checked }))} />
                      <span>
                        <span className="text-sm font-medium block">{label}</span>
                        <span className="text-xs text-gray-500">{desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              {editing && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="is_active" checked={!!form.is_active} onChange={e => setForm(p=>({...p,is_active:e.target.checked}))} />
                  <label htmlFor="is_active" className="text-sm">עובד פעיל</label>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn btn-primary" onClick={save}>שמור</button>
              <button className="btn btn-ghost" onClick={cancel}>ביטול</button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>שם</th><th>תפקיד</th><th>טלפון</th><th>הרשאות</th><th>פעולות</th></tr></thead>
            <tbody>
              {filtered.filter(u => u.is_active).map(u => (
                <tr key={u.id} className={schedulePanel?.userId === u.id ? 'bg-blue-50' : ''}>
                  <td className="font-medium">{u.name}</td>
                  <td><span className={`badge ${ROLE_COLORS[u.role]||'badge-gray'}`}>{ROLES[u.role]}</span></td>
                  <td dir="ltr">{u.phone||'—'}</td>
                  <td className="text-xs text-gray-600">
                    {(() => {
                      const hasNewPerms = ['perm_assignments','perm_algorithm','perm_requests','perm_users','perm_rooms'].some(k => u[k]);
                      if (!hasNewPerms && u.can_admin) return <span className="text-blue-700 font-medium">⭐ גישה מלאה</span>;
                      const list = [u.perm_assignments && 'שיבוץ', u.perm_algorithm && 'אלגוריתם', u.perm_requests && 'בקשות', u.perm_users && 'עובדים', u.perm_rooms && 'חדרים'].filter(Boolean);
                      return list.length === 5 ? <span className="text-blue-700 font-medium">⭐ גישה מלאה</span>
                           : list.length ? list.join(', ')
                           : '—';
                    })()}
                  </td>
                  <td>
                    <div className="flex gap-1 flex-wrap">
                      <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => openEdit(u)}>עריכה</button>
                      <button
                        className={`btn px-2 py-1 text-xs ${schedulePanel?.userId === u.id ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => openSchedule(u)}
                      >לוח זמנים</button>
                      <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => resetPin(u)}>PIN</button>
                      <button className="btn btn-danger px-2 py-1 text-xs" onClick={() => deactivate(u.id)}>השבת</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">{filtered.filter(u=>u.is_active).length} עובדים פעילים</p>
      </div>

      {/* Schedule editing panel — appears below the table when a user is selected */}
      {schedulePanel && (
        <div className="card border-blue-300 bg-blue-50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-blue-900">לוח זמנים: {schedulePanel.userName}</h3>
            <button className="text-sm text-gray-500 hover:text-gray-700" onClick={() => setSchedulePanel(null)}>✕ סגור</button>
          </div>

          {scheduleMsg && (
            <div className={`px-4 py-2 rounded-lg text-sm mb-4 ${scheduleMsg.startsWith('שגיאה') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
              {scheduleMsg}
            </div>
          )}

          {/* Preferred room — single selection applies to all slots */}
          <div className="mb-5">
            <label className="label font-semibold">חדר מועדף (ישמש כעדיפות באלגוריתם השיבוץ)</label>
            <select className="select w-52" value={preferredRoom} onChange={e => setPreferredRoom(e.target.value)}>
              <option value="">ללא העדפה</option>
              {rooms.map(r => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
            </select>
          </div>

          {/* Time slots */}
          <div className="mb-4">
            <label className="label font-semibold mb-2 block">ימי ושעות נוכחות</label>
            <div className="space-y-2">
              {scheduleSlots.map((s, i) => (
                <div key={i} className="flex gap-2 items-end flex-wrap bg-white border border-blue-200 rounded-lg p-3">
                  <div>
                    <label className="label">יום</label>
                    <select className="select w-24" value={s.day_of_week} onChange={e => updateSlot(i, 'day_of_week', +e.target.value)}>
                      {DAYS_HE.map((d, j) => <option key={j} value={j}>{d}</option>)}
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
                  <button className="btn btn-danger px-2 py-1.5 text-sm mt-1" onClick={() => removeSlot(i)}>✕</button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={addSlot}>+ הוסף יום</button>
            <button className="btn btn-primary" onClick={saveSchedule}>שמור לוח זמנים</button>
          </div>
        </div>
      )}
    </div>
  );
}
