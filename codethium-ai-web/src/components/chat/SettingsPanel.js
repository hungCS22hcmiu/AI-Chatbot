import React, { useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const MODELS = [
  { value: 'groq', label: 'Llama 3 (Groq)' },
  { value: 'openrouter', label: 'Gemma 3 (OpenRouter)' },
  { value: 'local', label: 'CodeThium Local' },
];

const MODEL_KEY = 'codethium_default_model';

function SettingsPanel({ onClose }) {
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwStatus, setPwStatus] = useState(null);
  const [defaultModel, setDefaultModel] = useState(
    () => localStorage.getItem(MODEL_KEY) || 'groq'
  );

  const handleModelChange = (e) => {
    const val = e.target.value;
    setDefaultModel(val);
    localStorage.setItem(MODEL_KEY, val);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwStatus(null);
    try {
      await api.post('/api/change-password', { currentPassword, newPassword });
      setPwStatus({ ok: true, msg: 'Password changed successfully' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to change password';
      setPwStatus({ ok: false, msg });
    }
  };

  return (
    <div style={{
      position: 'absolute',
      bottom: '56px',
      left: 0,
      right: 0,
      background: '#0d0d1a',
      border: '1px solid #1e1e2e',
      borderRadius: '8px 8px 0 0',
      padding: '16px',
      zIndex: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <span style={{ color: '#ccc', fontSize: '14px', fontWeight: 600 }}>Settings</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
      </div>

      {/* Default model */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Default Model</label>
        <select
          value={defaultModel}
          onChange={handleModelChange}
          style={{
            width: '100%',
            padding: '6px 8px',
            background: '#1e1e2e',
            color: '#ccc',
            border: '1px solid #2a2a3e',
            borderRadius: '6px',
            fontSize: '13px',
          }}
        >
          {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      {/* Change password */}
      <form onSubmit={handleChangePassword}>
        <label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Change Password</label>
        <input
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          style={{ ...inputStyle, marginBottom: '8px' }}
        />
        {pwStatus && (
          <div style={{ fontSize: '12px', color: pwStatus.ok ? '#4ade80' : '#f87171', marginBottom: '6px' }}>
            {pwStatus.msg}
          </div>
        )}
        <button type="submit" style={{
          width: '100%',
          padding: '6px',
          background: '#1e1e2e',
          color: '#ccc',
          border: '1px solid #2a2a3e',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '13px',
          marginBottom: '10px',
        }}>
          Update Password
        </button>
      </form>

      {/* Logout */}
      <button
        onClick={logout}
        style={{
          width: '100%',
          padding: '6px',
          background: 'transparent',
          color: '#f87171',
          border: '1px solid #3a1a1a',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        Log out
      </button>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '6px 8px',
  background: '#1e1e2e',
  color: '#ccc',
  border: '1px solid #2a2a3e',
  borderRadius: '6px',
  fontSize: '13px',
  marginBottom: '6px',
  outline: 'none',
  boxSizing: 'border-box',
};

export default SettingsPanel;
