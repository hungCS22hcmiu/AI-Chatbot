import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Button from '../ui/Button';

const MODELS = [
  { value: 'groq', label: 'Llama 3 (Groq)' },
  { value: 'openrouter', label: 'Gemma 3 (OpenRouter)' },
  { value: 'local', label: 'CodeThium Local' },
];

const MODEL_KEY = 'codethium_default_model';

const inputCls =
  'w-full px-3 py-2 bg-surface-2 text-zinc-200 border border-white/10 rounded-lg text-sm outline-none focus:border-brand-primary/50 transition-colors placeholder:text-zinc-500 mb-2';

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
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 8 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-14 left-3 right-3 glass rounded-xl p-4 shadow-xl z-50"
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm font-semibold text-zinc-200">Settings</span>
        <button
          onClick={onClose}
          className="text-muted hover:text-zinc-200 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Default model */}
      <div className="mb-4">
        <label className="text-xs text-muted block mb-1.5">Default Model</label>
        <select
          value={defaultModel}
          onChange={handleModelChange}
          className="w-full bg-surface-2 text-zinc-300 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-primary/50 transition-colors"
        >
          {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      {/* Change password */}
      <form onSubmit={handleChangePassword} className="mb-4">
        <label className="text-xs text-muted block mb-1.5">Change Password</label>
        <input
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          className={inputCls}
        />
        <input
          type="password"
          placeholder="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          className={inputCls}
        />
        {pwStatus && (
          <p className={`text-xs mb-2 ${pwStatus.ok ? 'text-green-400' : 'text-red-400'}`}>
            {pwStatus.msg}
          </p>
        )}
        <Button variant="ghost" type="submit" className="w-full text-sm py-1.5">
          Update Password
        </Button>
      </form>

      {/* Logout */}
      <Button variant="danger" onClick={logout} className="w-full text-sm py-1.5">
        Log out
      </Button>
    </motion.div>
  );
}

export default SettingsPanel;
