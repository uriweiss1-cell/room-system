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
    <div className="sticky top-12 z-40 bg-orange-500 shadow-lg">
      <div className="max-w-7xl mx-auto px-3 py-2 flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1.5">
          <div className="text-white font-bold text-sm">🔔 {notifs.length} הודעות חדשות</div>
          {notifs.map(n => (
            <div key={n.id} className="flex items-start justify-between gap-2 bg-orange-600 rounded-lg px-3 py-2 text-sm text-white">
              <span>{n.message}</span>
              <button className="shrink-0 text-orange-200 hover:text-white font-medium" onClick={() => markRead(n.id)}>✓ קראתי</button>
            </div>
          ))}
        </div>
        <button className="text-orange-100 hover:text-white text-xs underline shrink-0 mt-6" onClick={markAll}>סמן הכל כנקרא</button>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout, isAdmin, isSecretary, perms } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!perms?.requests) return;
    const fetch = () => api.get('/requests/all').then(r => {
      setPendingCount(r.data.filter(x => x.status === 'pending').length);
    }).catch(() => {});
    fetch();
    const interval = setInterval(fetch, 30000);
    return () => clearInterval(interval);
  }, [perms?.requests]);

  const employeeLinks = isSecretary ? [
    { to: '/',                 label: '🏠' },
    { to: '/secretary/grid',   label: '📋 גריד שבועי' },
    { to: '/room-query',       label: '🔍 שאילתת חדר' },
    { to: '/library',          label: 'ספריה' },
    { to: '/meeting-room',     label: 'חדר ישיבות' },
    { to: '/mamod',            label: 'ממד' },
  ] : [
    { to: '/',                 label: '🏠' },
    { to: '/my-schedule',      label: 'הלוח שלי' },
    { to: '/absence',          label: '⬜ היעדרות' },
    { to: '/room-query',       label: 'שאילתת חדר' },
    { to: '/one-time-request', label: 'בקשת חדר' },
    { to: '/library',          label: 'ספריה' },
    { to: '/meeting-room',     label: 'חדר ישיבות' },
    { to: '/mamod',            label: 'ממד' },
  ];
  const adminLinks = [
    perms?.users       && { to: '/admin/users',       label: 'עובדים' },
    perms?.rooms       && { to: '/admin/rooms',       label: 'חדרים' },
    perms?.assignments && { to: '/admin/assignments', label: 'שיבוץ' },
    perms?.requests    && { to: '/admin/requests',    label: <span className="flex items-center gap-1">בקשות{pendingCount > 0 && <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">{pendingCount}</span>}</span> },
  ].filter(Boolean);

  const linkClass = ({ isActive }) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
      isActive ? 'bg-white text-blue-700' : 'text-white hover:bg-blue-600'
    }`;

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-blue-700 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 py-2">
          <div className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 flex-wrap">
              <span className="text-white font-bold text-sm ml-2 hidden sm:block">🏠 שיבוץ חדרים</span>
              {employeeLinks.map(l => <NavLink key={l.to} to={l.to} className={linkClass}>{l.label}</NavLink>)}
              {isAdmin && (
                <>
                  <span className="text-blue-300 mx-1 hidden sm:block">|</span>
                  {adminLinks.map(l => <NavLink key={l.to} to={l.to} className={linkClass}>{l.label}</NavLink>)}
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
      {(!isAdmin || user?.can_admin || isSecretary) && <GlobalNotifications />}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 py-5">
        <Outlet />
      </main>
    </div>
  );
}
