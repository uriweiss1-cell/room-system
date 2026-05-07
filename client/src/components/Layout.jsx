import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import api from '../api';

function GlobalNotifications() {
  const [notifs, setNotifs] = useState([]);

  useEffect(() => {
    const load = () => api.get('/notifications').then(r => setNotifs(r.data)).catch(() => {});
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const markRead = async id => {
    await api.put(`/notifications/${id}/read`);
    setNotifs(p => p.filter(n => n.id !== id));
  };
  const markAll = async () => {
    await api.put('/notifications/read-all');
    setNotifs([]);
  };

  if (!notifs.length) return null;

  return (
    <div className="max-w-7xl mx-auto px-3 pt-4">
      <div className="card border-orange-200 bg-orange-50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-orange-800">
            התראות <span className="badge badge-yellow mr-1">{notifs.length} חדשות</span>
          </h3>
          <button className="text-xs text-orange-600 hover:underline" onClick={markAll}>סמן הכל כנקרא</button>
        </div>
        <div className="space-y-2">
          {notifs.map(n => (
            <div key={n.id} className="flex items-start justify-between gap-2 rounded-lg px-3 py-2 text-sm bg-orange-100 text-orange-900 font-medium">
              <span>{n.message}</span>
              <button className="shrink-0 text-xs text-orange-600 hover:underline" onClick={() => markRead(n.id)}>✓ קראתי</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    const fetch = () => api.get('/requests/all').then(r => {
      setPendingCount(r.data.filter(x => x.status === 'pending').length);
    }).catch(() => {});
    fetch();
    const interval = setInterval(fetch, 30000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  const employeeLinks = [
    { to: '/my-schedule',      label: 'הלוח שלי' },
    { to: '/room-query',       label: 'שאילתת חדר' },
    { to: '/one-time-request', label: 'בקשת חדרים' },
    { to: '/library',          label: 'ספריה' },
    { to: '/meeting-room',     label: 'חדר ישיבות' },
    { to: '/mamod',            label: 'ממד' },
  ];
  const adminLinks = [
    { to: '/admin/users',       label: 'עובדים' },
    { to: '/admin/rooms',       label: 'חדרים' },
    { to: '/admin/assignments', label: 'שיבוץ' },
    { to: '/admin/requests',    label: 'בקשות', badge: pendingCount },
  ];

  const linkClass = ({ isActive }) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
      isActive ? 'bg-white text-blue-700' : 'text-white hover:bg-blue-600'
    }`;

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-blue-700 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 overflow-x-auto">
              <span className="text-white font-bold text-sm ml-2 shrink-0">🏠 שיבוץ חדרים</span>
              {employeeLinks.map(l => <NavLink key={l.to} to={l.to} className={linkClass}>{l.label}</NavLink>)}
              {isAdmin && (
                <>
                  <span className="text-blue-300 mx-1">|</span>
                  {adminLinks.map(l => (
                    <NavLink key={l.to} to={l.to} className={linkClass}>
                      <span className="flex items-center gap-1">
                        {l.label}
                        {l.badge > 0 && <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">{l.badge}</span>}
                      </span>
                    </NavLink>
                  ))}
                </>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-blue-200 text-xs hidden md:block">{user?.name}</span>
              <button
                onClick={() => { logout(); navigate('/login'); }}
                className="text-white bg-blue-900 hover:bg-blue-800 px-3 py-1.5 rounded-lg text-sm"
              >
                יציאה
              </button>
            </div>
          </div>
        </div>
      </nav>

      {(!isAdmin || user?.can_admin) && <GlobalNotifications />}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 py-5">
        <Outlet />
      </main>
    </div>
  );
}
