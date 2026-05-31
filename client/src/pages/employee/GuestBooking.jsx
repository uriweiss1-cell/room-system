import { useState } from 'react';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function GuestBooking() {
  const { perms } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ guest_name: '', specific_date: todayStr(), start_time: '08:00', end_time: '17:00' });
  const [step, setStep] = useState('form'); // 'form' | 'pick-room'
  const [availableRooms, setAvailableRooms] = useState([]);
  const [searching, setSearching] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  if (!perms.guest) {
    return (
      <div className="max-w-lg mx-auto card text-center text-gray-500 py-10">
        אין הרשאה לדף זה
      </div>
    );
  }

  const searchRooms = async () => {
    if (!form.guest_name.trim()) { setError('יש להזין שם אורח'); return; }
    setError(''); setSearching(true);
    try {
      const r = await api.get('/requests/available-rooms', {
        params: { date: form.specific_date, start_time: form.start_time, end_time: form.end_time },
      });
      setAvailableRooms(r.data.filter(room => room.available));
      setStep('pick-room');
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setSearching(false); }
  };

  const book = async (roomId) => {
    setError('');
    try {
      const r = await api.post('/assignments/guest', { ...form, room_id: roomId });
      setMsg(r.data.message);
      setStep('form');
      setForm(p => ({ ...p, guest_name: '' }));
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="card">
        <h2 className="text-xl font-bold mb-4">👤 שיבוץ אורח חד-פעמי</h2>

        {msg && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm mb-4">
            {msg}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mb-4">
            {error}
          </div>
        )}

        {step === 'form' && (
          <div className="space-y-3">
            <div>
              <label className="label">שם האורח *</label>
              <input className="input w-full" placeholder="שם מלא..." value={form.guest_name}
                onChange={e => setForm(p => ({ ...p, guest_name: e.target.value }))} />
            </div>
            <div>
              <label className="label">תאריך</label>
              <input type="date" className="input w-44" value={form.specific_date} min={todayStr()}
                onChange={e => setForm(p => ({ ...p, specific_date: e.target.value }))} />
            </div>
            <div className="flex gap-3">
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
            <button className="btn btn-primary" onClick={searchRooms} disabled={searching}>
              {searching ? 'מחפש...' : 'בדוק חדרים פנויים'}
            </button>
          </div>
        )}

        {step === 'pick-room' && (
          <div className="space-y-3">
            <div className="text-sm text-gray-600 mb-2">
              בחר חדר לאורח <strong>{form.guest_name}</strong> — {form.specific_date} בין {form.start_time}–{form.end_time}
            </div>
            {availableRooms.length === 0 ? (
              <p className="text-red-600 text-sm">אין חדרים פנויים בשעות אלו</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {availableRooms.map(r => (
                  <button key={r.id} className="btn btn-ghost border border-gray-300 text-sm py-2"
                    onClick={() => book(r.id)}>
                    {r.name}
                  </button>
                ))}
              </div>
            )}
            <button className="btn btn-ghost text-sm" onClick={() => { setStep('form'); setError(''); }}>
              ← חזור
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
