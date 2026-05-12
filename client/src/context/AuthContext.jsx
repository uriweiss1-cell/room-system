import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (localStorage.getItem('token')) {
      api.get('/auth/me')
        .then(r => setUser(r.data))
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', r.data.token);
    setUser(r.data.user);
    return r.data.user;
  };

  const logout = () => { localStorage.removeItem('token'); setUser(null); };

  const PERM_KEYS = ['assignments', 'algorithm', 'requests', 'users', 'rooms'];
  const isFullAdmin = user?.role === 'admin';
  // Legacy: can_admin users who haven't been migrated to new perm flags yet → grant all perms
  const isLegacyAdmin = !!user?.can_admin && !PERM_KEYS.some(p => user?.[`perm_${p}`]);
  const perms = {
    assignments: isFullAdmin || isLegacyAdmin || !!user?.perm_assignments,
    algorithm:   isFullAdmin || isLegacyAdmin || !!user?.perm_algorithm,
    requests:    isFullAdmin || isLegacyAdmin || !!user?.perm_requests,
    users:       isFullAdmin || isLegacyAdmin || !!user?.perm_users,
    rooms:       isFullAdmin || isLegacyAdmin || !!user?.perm_rooms,
  };
  const isAdmin = isFullAdmin || isLegacyAdmin || Object.values(perms).some(Boolean);

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isAdmin, perms }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
