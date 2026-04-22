import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import api from '../api';

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
    const interval = setInterval(fetch, 60000);
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
    { to: '/admin/requests',    label: <span className="flex items-center gap-1">בקשות{pendingCount > 0 && <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">{pendingCount}</span>}</span> },
  ];

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
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 py-5">
        <Outlet />
      </main>
    </div>
  );
}
