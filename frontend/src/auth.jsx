import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import api, { session } from './api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => session.get()?.user || null);
  const [expired, setExpired] = useState(false); // true bila sesi berakhir otomatis (ditampilkan di halaman login)

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setExpired(true);
    };
    window.addEventListener('alpaka:session-expired', onExpired);
    return () => window.removeEventListener('alpaka:session-expired', onExpired);
  }, []);

  const signIn = useCallback((token, nextUser) => {
    session.set({ token, user: nextUser });
    setUser(nextUser);
    setExpired(false);
  }, []);

  const signOut = useCallback((byTimeout = false) => {
    session.clear();
    setUser(null);
    setExpired(byTimeout === true);
  }, []);

  const replaceToken = useCallback((token) => {
    const s = session.get();
    if (s) session.set({ ...s, token });
  }, []);

  const updateUser = useCallback((nextUser) => {
    const s = session.get();
    if (s) session.set({ ...s, user: nextUser });
    setUser(nextUser);
  }, []);

  const login = useCallback(
    async (path, payload) => {
      const { data } = await api.post(path, payload);
      signIn(data.token, data.user);
      return data.user;
    },
    [signIn]
  );

  const value = useMemo(
    () => ({ user, expired, login, signIn, signOut, updateUser, replaceToken }),
    [user, expired, login, signIn, signOut, updateUser, replaceToken]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Penjaga rute di sisi UI; otorisasi sebenarnya ditegakkan server (NFR-03). */
export function RequireRole({ role, children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to={role === 'admin' ? '/admin/login' : '/masuk'} replace state={{ from: location.pathname + location.search }} />;
  }
  if (user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace />;
  return children;
}
