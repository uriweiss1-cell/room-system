import { useState, useEffect, useRef } from 'react';
import api from '../../api';

const ROOM_TYPES = { regular: 'טיפול רגיל', staff: 'חדר צוות', committee: 'חדר ועדה', art_therapy: 'טיפול באמנות' };
const TYPE_COLORS = { regular: 'badge-blue', staff: 'badge-green', committee: 'badge-yellow', art_therapy: 'badge-red' };
const emptyRoom = { name: '', capacity: 1, room_type: 'regular', notes: '' };

export default function AdminRooms() {
  const [rooms, setRooms] = useState([]);
  const [files, setFiles] = useState([]);
  const [form, setForm] = useState(emptyRoom);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState('');
  const [fileNotes, setFileNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  useEffect(() => { load(); loadFiles(); }, []);
  const load = () => api.get('/rooms').then(r => setRooms(r.data));
  const loadFiles = () => api.get('/rooms/files').then(r => setFiles(r.data)).catch(() => {});

  const openAdd = () => { setForm(emptyRoom); setEditing(null); setShowForm(true); setMsg(''); };
  const openEdit = r => { setForm({ ...r }); setEditing(r.id); setShowForm(true); setMsg(''); };

  const save = async () => {
    try {
      if (editing) await api.put(`/rooms/${editing}`, form);
      else await api.post('/rooms', form);
      load(); setShowForm(false);
    } catch (e) { setMsg('שגיאה: ' + (e.response?.data?.error || e.message)); }
  };

  const deactivate = async id => {
    if (!confirm('להסיר חדר זה?')) return;
    await api.delete(`/rooms/${id}`); load();
  };

  const uploadFile = async () => {
    const file = fileRef.current?.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('notes', fileNotes);
      await api.post('/rooms/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      loadFiles(); fileRef.current.value = ''; setFileNotes('');
      setMsg('הקובץ הועלה בהצלחה');
    } catch (e) { setMsg('שגיאה בהעלאה: ' + (e.response?.data?.error || e.message)); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-5">
      <div className="card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-xl font-bold">ניהול חדרים ({rooms.length})</h2>
          <button className="btn btn-primary" onClick={openAdd}>+ חדר חדש</button>
        </div>

        {msg && <div className={`px-4 py-2 rounded-lg text-sm mb-3 ${msg.startsWith('שגיאה') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>}

        {showForm && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-5">
            <h3 className="font-semibold mb-3">{editing ? 'עריכת חדר' : 'חדר חדש'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">שם החדר *</label><input className="input" value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} /></div>
              <div><label className="label">קיבולת</label><input type="number" className="input" min="1" value={form.capacity} onChange={e => setForm(p=>({...p,capacity:+e.target.value}))} /></div>
              <div><label className="label">סוג</label>
                <select className="select" value={form.room_type} onChange={e => setForm(p=>({...p,room_type:e.target.value}))}>
                  {Object.entries(ROOM_TYPES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><label className="label">הערות</label><input className="input" value={form.notes||''} onChange={e => setForm(p=>({...p,notes:e.target.value}))} /></div>
              {editing && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="ra" checked={!!form.is_active} onChange={e => setForm(p=>({...p,is_active:e.target.checked}))} />
                  <label htmlFor="ra" className="text-sm">חדר פעיל</label>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn btn-primary" onClick={save}>שמור</button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>ביטול</button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>שם</th><th>סוג</th><th>קיבולת</th><th>הערות</th><th>פעולות</th></tr></thead>
            <tbody>
              {rooms.map(r => (
                <tr key={r.id}>
                  <td className="font-medium">{r.name}</td>
                  <td><span className={`badge ${TYPE_COLORS[r.room_type]||'badge-gray'}`}>{ROOM_TYPES[r.room_type]}</span></td>
                  <td>{r.capacity}</td>
                  <td className="text-gray-500 text-xs">{r.notes||'—'}</td>
                  <td>
                    <div className="flex gap-1">
                      <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => openEdit(r)}>עריכה</button>
                      {r.room_type === 'regular' && <button className="btn btn-danger px-2 py-1 text-xs" onClick={() => deactivate(r.id)}>הסר</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* File upload */}
      <div className="card">
        <h3 className="font-semibold mb-3">העלאת קבצי התייחסות (שיבוץ קיים וכו')</h3>
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <div>
            <label className="label">קובץ</label>
            <input type="file" ref={fileRef} className="input w-auto" accept=".xlsx,.xls,.csv,.pdf,.doc,.docx,.jpg,.png" />
          </div>
          <div>
            <label className="label">הערה</label>
            <input className="input w-44" placeholder="תיאור הקובץ" value={fileNotes} onChange={e => setFileNotes(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={uploadFile} disabled={uploading}>{uploading ? 'מעלה...' : 'העלה'}</button>
        </div>
        {files.length > 0 && (
          <table className="tbl">
            <thead><tr><th>שם קובץ</th><th>הועלה ע"י</th><th>הערה</th><th>תאריך</th><th>הורדה</th></tr></thead>
            <tbody>
              {files.map(f => (
                <tr key={f.id}>
                  <td>{f.original_name}</td>
                  <td>{f.uploaded_by_name||'—'}</td>
                  <td>{f.notes||'—'}</td>
                  <td className="text-xs">{f.created_at?.slice(0,10)}</td>
                  <td><a href={`/uploads/${f.filename}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs">הורד</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
