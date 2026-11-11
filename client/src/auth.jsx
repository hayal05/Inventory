import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { api, onUnauthorized } from './api.js';

const AuthContext = createContext(null);

// Holds the logged-in user. status: 'loading' (asking /auth/me), 'authed', or 'anon'.
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, org: null });

  useEffect(() => {
    let cancelled = false;
    api
      .get('/auth/me')
      .then((data) => !cancelled && setState({ status: 'authed', user: data.user, org: data.org }))
      .catch(() => !cancelled && setState({ status: 'anon', user: null, org: null }));
    return () => {
      cancelled = true;
    };
  }, []);

  // Any 401 later on (expired session) sends the user back to the login page.
  useEffect(() => onUnauthorized(() => setState({ status: 'anon', user: null, org: null })), []);

  const login = useCallback(async (email, password) => {
    await api.post('/auth/login', { email, password });
    // /auth/login does not return the org name, so ask /auth/me for the full picture.
    const data = await api.get('/auth/me');
    setState({ status: 'authed', user: data.user, org: data.org });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setState({ status: 'anon', user: null, org: null });
    }
  }, []);

  const value = useMemo(() => ({ ...state, login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

// Route guard: renders the nested routes for a logged-in user, otherwise redirects to /login
// and remembers where the user was heading.
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <div className="auth-loading">Loading&hellip;</div>;
  if (status === 'anon') return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
