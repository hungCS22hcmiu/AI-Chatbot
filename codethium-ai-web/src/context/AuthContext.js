import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/me')
      .then(res => setUser(res.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // Auto-refresh access token on 401: try POST /api/refresh, then retry.
  // If refresh also fails, force logout.
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
            setUser(null); // force logout on failed refresh
          }
        }
        return Promise.reject(error);
      }
    );
    return () => api.interceptors.response.eject(interceptor);
  }, []);

  const login = (userData) => setUser(userData);

  const logout = async () => {
    try { await api.post('/api/logout'); } catch { /* ignore */ }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
