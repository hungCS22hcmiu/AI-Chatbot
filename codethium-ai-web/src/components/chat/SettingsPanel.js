import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Moon, Sun, Bot, ShieldCheck, LogOut, ChevronDown, ChevronUp, Check } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import Button from '../ui/Button';

const MODELS = [
  { value: 'groq',       label: 'Llama 3',          sub: 'Groq · Fast' },
  { value: 'openrouter', label: 'Gemma 3',           sub: 'OpenRouter · Free' },
  { value: 'gemini',     label: 'Gemini 2.5 Flash',  sub: 'Google · Multimodal' },
  { value: 'gemma',      label: 'Gemma 4 31B',       sub: 'Google · Reasoning' },
  { value: 'local',      label: 'CodeThium Local',   sub: 'Local · Python' },
];

const MODEL_KEY = 'codethium_default_model';

const inputCls =
  'w-full px-3 py-2.5 bg-surface-2 text-zinc-200 border border-white/10 rounded-xl text-sm outline-none focus:border-violet-500/60 transition-colors placeholder:text-zinc-500';

function SectionHeader({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={14} className="text-violet-400 flex-shrink-0" />
      <span className="text-xs font-semibold text-muted uppercase tracking-widest">{label}</span>
    </div>
  );
}

function SettingsPanel({ onClose }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [defaultModel, setDefaultModel] = useState(
    () => localStorage.getItem(MODEL_KEY) || 'groq'
  );
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwStatus, setPwStatus] = useState(null);
  const [pwLoading, setPwLoading] = useState(false);

  const initial = (user?.username || user?.email || '?')[0].toUpperCase();

  const handleModelChange = (value) => {
    setDefaultModel(value);
    localStorage.setItem(MODEL_KEY, value);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwStatus(null);
    if (newPassword !== confirmPassword) {
      setPwStatus({ ok: false, msg: 'New passwords do not match' });
      return;
    }
    setPwLoading(true);
    try {
      await api.post('/api/change-password', { currentPassword, newPassword });
      setPwStatus({ ok: true, msg: 'Password changed successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to change password';
      setPwStatus({ ok: false, msg });
    } finally {
      setPwLoading(false);
    }
  };

  return (
    /* Backdrop — click outside to close */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="glass rounded-2xl w-full max-w-md mx-4 overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-base font-bold bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-zinc-200 hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto max-h-[75vh] divide-y divide-white/[0.07]">

          {/* ── Profile ── */}
          <div className="px-6 py-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-600 to-pink-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0 shadow-lg shadow-violet-900/40">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="text-zinc-100 font-semibold truncate">{user?.username}</p>
                <p className="text-xs text-muted truncate">{user?.email}</p>
              </div>
            </div>
          </div>

          {/* ── Appearance ── */}
          <div className="px-6 py-5">
            <SectionHeader icon={theme === 'dark' ? Moon : Sun} label="Appearance" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-300">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</p>
                <p className="text-xs text-muted mt-0.5">
                  {theme === 'dark' ? 'Easy on the eyes at night' : 'Better for bright environments'}
                </p>
              </div>
              {/* Pill toggle */}
              <button
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ml-4 ${
                  theme === 'dark' ? 'bg-violet-600' : 'bg-zinc-400'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 flex items-center justify-center ${
                    theme === 'dark' ? 'translate-x-5' : 'translate-x-0'
                  }`}
                >
                  {theme === 'dark'
                    ? <Moon size={9} className="text-violet-600" />
                    : <Sun size={9} className="text-amber-500" />}
                </span>
              </button>
            </div>
          </div>

          {/* ── Default Model ── */}
          <div className="px-6 py-5">
            <SectionHeader icon={Bot} label="Default Model" />
            <div className="space-y-2">
              {MODELS.map(m => (
                <button
                  key={m.value}
                  onClick={() => handleModelChange(m.value)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition-all duration-150 ${
                    defaultModel === m.value
                      ? 'border-violet-500/60 bg-violet-600/10 text-zinc-100'
                      : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-zinc-300 hover:bg-white/5'
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium leading-tight">{m.label}</p>
                    <p className="text-xs text-muted mt-0.5">{m.sub}</p>
                  </div>
                  {defaultModel === m.value && (
                    <Check size={15} className="text-violet-400 flex-shrink-0 ml-2" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Security ── */}
          <div className="px-6 py-5">
            <SectionHeader icon={ShieldCheck} label="Security" />
            <button
              onClick={() => { setShowPasswordForm(s => !s); setPwStatus(null); }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/5 hover:border-white/20 transition-all duration-150 text-zinc-300 text-sm"
            >
              <span>Change password</span>
              {showPasswordForm
                ? <ChevronUp size={15} className="text-muted" />
                : <ChevronDown size={15} className="text-muted" />}
            </button>

            <AnimatePresence>
              {showPasswordForm && (
                <motion.form
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handleChangePassword}
                  className="overflow-hidden"
                >
                  <div className="pt-3 space-y-2.5">
                    <input
                      type="password"
                      placeholder="Current password"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      required
                      className={inputCls}
                    />
                    <input
                      type="password"
                      placeholder="New password (12+ chars)"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      required
                      className={inputCls}
                    />
                    <input
                      type="password"
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      required
                      className={inputCls}
                    />
                    {pwStatus && (
                      <p className={`text-xs px-1 ${pwStatus.ok ? 'text-green-400' : 'text-red-400'}`}>
                        {pwStatus.msg}
                      </p>
                    )}
                    <Button
                      variant="ghost"
                      type="submit"
                      disabled={pwLoading}
                      className="w-full py-2 text-sm"
                    >
                      {pwLoading ? 'Updating…' : 'Update Password'}
                    </Button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </div>

          {/* ── Account / Logout ── */}
          <div className="px-6 py-5">
            <SectionHeader icon={LogOut} label="Account" />
            <Button
              variant="danger"
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm"
            >
              <LogOut size={15} />
              Sign out
            </Button>
          </div>

        </div>
      </motion.div>
    </div>
  );
}

export default SettingsPanel;
