import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LockKeyhole } from 'lucide-react';
import LoginPage from './components/LoginPage';
import ChatPage from './components/chat/ChatPage';

function SessionExpiredModal({ onClose }) {
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass rounded-2xl p-8 max-w-sm w-full mx-4 text-center space-y-4">
        <LockKeyhole className="mx-auto text-violet-400" size={40} />
        <h2 className="text-xl font-semibold text-zinc-100">Session Expired</h2>
        <p className="text-sm text-muted">
          Your session has expired. Please sign in again to continue.
        </p>
        <button
          className="w-full py-2 rounded-xl bg-gradient-to-r from-violet-600 to-pink-500 text-white font-semibold hover:opacity-90 transition-opacity"
          onClick={() => { onClose(); navigate('/login'); }}
        >
          Sign In
        </button>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/login" />;
}

function AppRoutes() {
  const { user, loading, sessionExpired, clearSessionExpired } = useAuth();

  if (loading) return null;

  return (
    <>
      {sessionExpired && <SessionExpiredModal onClose={clearSessionExpired} />}
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/chatbot" /> : <LoginPage />} />
        <Route
          path="/chatbot"
          element={<ProtectedRoute><ChatPage /></ProtectedRoute>}
        />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
