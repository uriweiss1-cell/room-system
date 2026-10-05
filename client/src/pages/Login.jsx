import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';

function PinInput({ value, onChange }) {
  const inputs = [useRef(), useRef(), useRef(), useRef()];
  const digits = value.split('');

  const handleKey = (i, e) => {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        onChange(value.slice(0, i) + value.slice(i + 1));
      } else if (i > 0) {
        inputs[i - 1].current.focus();
        onChange(value.slice(0, i - 1) + value.slice(i));
      }
      return;
    }
    if (!/^\d$/.test(e.key)) return;
    const next = value.slice(0, i) + e.key + value.slice(i + 1);
    onChange(next.slice(0, 4));
    if (i < 3) inputs[i + 1].current.focus();
  };

  return (
    <div className="flex gap-3 justify-center my-4" dir="ltr">
      {[0, 1, 2, 3].map(i => (
        <input
          key={i}
          ref={inputs[i]}
          type="tel"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] || ''}
          onKeyDown={e => handleKey(i, e)}
          onChange={() => {}}
          onClick={() => inputs[i].current.select()}
          className="w-14 h-14 text-center text-2xl font-bold border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
          autoFocus={i === 0}
        />
      ))}
    </div>
  );
}

export default function Login() {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [step, setStep] = useState('select'); // select | pin | setpin | admin
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [setPinStep, setSetPinStep] = useState(1); // 1=enter new, 2=confirm
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/auth/users-list').then(r => setEmployees(r.data)).catch(() => {});
  }, []);

  const selectEmployee = (u) => {
    setSelected(u);
    setPin(''); setPinConfirm(''); setError(''); setSetPinStep(1);
    setStep(u.has_pin ? 'pin' : 'setpin');
  };

  const submitPin = async () => {
    if (pin.length !== 4) return;
    setError(''); setLoading(true);
    try {
      const r = await api.post('/auth/login-simple', { userId: selected.id, pin });
      localStorage.setItem('token', r.data.token);
      navigate('/my-schedule');
      window.location.reload();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה');
      setPin('');
    } finally { setLoading(false); }
  };

  const submitSetPin = async () => {
    if (setPinStep === 1) {
      if (pin.length !== 4) return;
      setSetPinStep(2);
      setPinConfirm('');
      return;
    }
    if (pinConfirm !== pin) { setError('הקודים אינם תואמים'); setPinConfirm(''); return; }
    setError(''); setLoading(true);
    try {
      const r = await api.post('/auth/set-pin-first', { userId: selected.id, pin });
      localStorage.setItem('token', r.data.token);
      navigate('/my-schedule');
      window.location.reload();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (step === 'pin' && pin.length === 4) submitPin();
  }, [pin]);

  useEffect(() => {
    if (step === 'setpin' && setPinStep === 2 && pinConfirm.length === 4) submitSetPin();
  }, [pinConfirm]);

  const loginAdmin = async e => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const user = await login(email, password);
      navigate(user.role === 'admin' || user.can_admin ? '/admin/assignments' : '/my-schedule');
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בהתחברות');
    } finally { setLoading(false); }
  };

  const back = () => { setStep('select'); setSelected(null); setPin(''); setPinConfirm(''); setError(''); setSetPinStep(1); };

  const filtered = employees.filter(u => u.name.includes(search));

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="text-center mb-5">
          <div className="text-4xl mb-2">🏠</div>
          <h1 className="text-2xl font-bold text-gray-800">מערכת שיבוץ חדרים</h1>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
        )}

        {/* Step 1: select name */}
        {step === 'select' && (
          <>
            <p className="text-gray-500 text-sm text-center mb-3">בחר את שמך</p>
            <input
              className="input mb-4 text-lg"
              placeholder="חיפוש שם..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-72 overflow-y-auto mb-4">
              {search.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-6">התחל להקליד שם...</p>
              ) : filtered.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-6">לא נמצאו תוצאות</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {filtered.map(u => (
                    <button key={u.id}
                      className="bg-blue-50 hover:bg-blue-100 active:bg-blue-200 border border-blue-200 rounded-xl py-3 px-2 text-sm font-medium text-blue-900 transition-colors"
                      onClick={() => selectEmployee(u)}>
                      {u.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="text-xs text-gray-400 hover:text-gray-600 w-full text-center mt-1"
              onClick={() => { setStep('admin'); setError(''); }}>
              כניסת מנהל
            </button>
          </>
        )}

        {/* Step 2a: enter PIN */}
        {step === 'pin' && (
          <div className="text-center">
            <p className="font-semibold text-gray-700 text-lg">{selected?.name}</p>
            <p className="text-gray-500 text-sm mt-1 mb-2">הכנס קוד PIN</p>
            <PinInput value={pin} onChange={v => { setPin(v); setError(''); }} />
            {loading && <p className="text-sm text-gray-400">מתחבר...</p>}
            <button className="text-xs text-gray-400 hover:text-gray-600 mt-4" onClick={back}>← חזרה</button>
          </div>
        )}

        {/* Step 2b: set PIN for first time */}
        {step === 'setpin' && (
          <div className="text-center">
            <p className="font-semibold text-gray-700 text-lg">{selected?.name}</p>
            {setPinStep === 1 ? (
              <>
                <p className="text-gray-500 text-sm mt-1 mb-1">ברוך הבא! בחר קוד PIN בן 4 ספרות</p>
                <p className="text-xs text-gray-400 mb-2">קוד זה יידרש בכל כניסה עתידית</p>
                <PinInput value={pin} onChange={v => { setPin(v); setError(''); }} />
                <button className="btn btn-primary mt-2" onClick={submitSetPin} disabled={pin.length !== 4}>המשך</button>
              </>
            ) : (
              <>
                <p className="text-gray-500 text-sm mt-1 mb-2">הכנס שוב לאישור</p>
                <PinInput value={pinConfirm} onChange={v => { setPinConfirm(v); setError(''); }} />
                {loading && <p className="text-sm text-gray-400 mt-2">שומר...</p>}
              </>
            )}
            <button className="text-xs text-gray-400 hover:text-gray-600 mt-4 block mx-auto"
              onClick={() => { back(); }}>← חזרה</button>
          </div>
        )}

        {/* Admin login */}
        {step === 'admin' && (
          <>
            <form onSubmit={loginAdmin} className="space-y-4">
              <div>
                <label className="label">כתובת אימייל</label>
                <input type="email" className="input" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} required placeholder="admin@clinic.local" autoFocus />
              </div>
              <div>
                <label className="label">סיסמה</label>
                <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                {loading ? 'מתחבר...' : 'כניסה'}
              </button>
            </form>
            <button className="text-xs text-gray-400 hover:text-gray-600 w-full text-center mt-3"
              onClick={() => { setStep('select'); setError(''); }}>
              ← חזרה לרשימת עובדים
            </button>
          </>
        )}
      </div>
    </div>
  );
}
