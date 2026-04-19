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
const emptyUser = { name: '', email: '', password: '', role: 'clinical_intern', phone: '', notes: '', can_admin: false };

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyUser);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);
  const load = () => api.get('/users').then(r => setUsers(r.data));

  const openAdd = () => { setForm(emptyUser); setEditing(null); setShowForm(true); setMsg(''); };
  const openEdit = u => { setForm({ ...u, password: '' }); setEditing(u.id); setShowForm(true); setMsg(''); };
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
              {(form.can_admin || editing && users.find(u=>u.id===editing)?.can_admin) && (
                <div><label className="label">אימייל (נדרש למנהל)</label><input type="email" className="input" dir="ltr" value={form.email||''} onChange={e => setForm(p=>({...p,email:e.target.value}))} /></div>
              )}
              <div><label className="label">{editing ? 'סיסמה חדשה (ריק = ללא שינוי)' : 'סיסמה (ריק = changeme123)'}</label><input type="password" className="input" value={form.password} onChange={e => setForm(p=>({...p,password:e.target.value}))} /></div>
              <div><label className="label">תפקיד *</label>
                <select className="select" value={form.role} onChange={e => setForm(p=>({...p,role:e.target.value}))}>
                  {ROLE_OPTIONS.map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><label className="label">טלפון</label><input type="tel" className="input" dir="ltr" value={form.phone||''} onChange={e => setForm(p=>({...p,phone:e.target.value}))} /></div>
              <div className="sm:col-span-2"><label className="label">הערות</label><textarea className="input h-16 resize-none" value={form.notes||''} onChange={e => setForm(p=>({...p,notes:e.target.value}))} /></div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="can_admin" checked={!!form.can_admin} onChange={e => setForm(p=>({...p,can_admin:e.target.checked}))} />
                <label htmlFor="can_admin" className="text-sm">הרשאת מנהל (גישה לפאנל ניהול)</label>
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
            <thead><tr><th>שם</th><th>תפקיד</th><th>טלפון</th><th>מנהל</th><th>פעולות</th></tr></thead>
            <tbody>
              {filtered.filter(u => u.is_active).map(u => (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}</td>
                  <td><span className={`badge ${ROLE_COLORS[u.role]||'badge-gray'}`}>{ROLES[u.role]}</span></td>
                  <td dir="ltr">{u.phone||'—'}</td>
                  <td>{u.can_admin ? '✓' : ''}</td>
                  <td>
                    <div className="flex gap-1 flex-wrap">
                      <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => openEdit(u)}>עריכה</button>
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
    </div>
  );
}
