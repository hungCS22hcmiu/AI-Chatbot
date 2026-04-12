import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    api.get('/api/me')
      .then(res => setUser(res.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const forceLogout = () => {
    setSessionExpired(true);
    setUser(null);
  };

  // Auto-refresh access token on 401: try POST /api/refresh, then retry.
  // If refresh also fails, force logout and show session expired modal.
  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      response => response,
      async error => {
        const original = error.config;
        const url = original?.url || '';
        if (
          error.response?.status === 401 &&
          !original._retry &&
          !url.includes('/api/refresh') &&
          !url.includes('/api/login') &&
          !url.includes('/api/logout')
        ) {
          original._retry = true;
          try {
            await api.post('/api/refresh');
            return api(original);
          } catch {
            forceLogout();
          }
        }
        return Promise.reject(error);
      }
    );
    return () => api.interceptors.response.eject(interceptor);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = (userData) => setUser(userData);

  const logout = async () => {
    try { await api.post('/api/logout'); } catch { /* ignore */ }
    setUser(null);
  };

  const clearSessionExpired = () => setSessionExpired(false);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, sessionExpired, clearSessionExpired, forceLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
