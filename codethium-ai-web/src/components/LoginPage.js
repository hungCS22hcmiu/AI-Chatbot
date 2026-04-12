import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import GlassCard from './ui/GlassCard';

const inputCls =
  'w-full bg-white/5 border border-white/10 text-zinc-100 rounded-lg px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-brand-primary/60 transition-colors';

function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (isLogin) {
      if (!trimmedUsername && !trimmedEmail) return setError('Please provide a username or email');
      if (!trimmedPassword) return setError('Please provide a password');
    } else {
      if (!trimmedUsername || !trimmedEmail || !trimmedPassword) return setError('Please fill all required fields');
      if (trimmedPassword !== trimmedConfirm) return setError('Passwords do not match');
    }

    try {
      if (isLogin) {
        const { data } = await api.post('/api/login', {
          username: trimmedUsername,
          email: trimmedEmail,
          password: trimmedPassword,
        });
        login(data.user);
        navigate('/chatbot');
      } else {
        await api.post('/api/register', {
          username: trimmedUsername,
          email: trimmedEmail,
          password: trimmedPassword,
        });
        const { data } = await api.post('/api/login', {
          email: trimmedEmail,
          password: trimmedPassword,
        });
        login(data.user);
        navigate('/chatbot');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleSocialLogin = (provider) => {
    setError(`Social login with ${provider} is not implemented yet`);
  };

  const handleInputChange = (value) => {
    if (value.includes('@')) {
      setEmail(value);
      setUsername('');
    } else {
      setUsername(value);
      setEmail('');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 relative overflow-hidden px-4">
      {/* Animated gradient blobs */}
      <div
        className="absolute w-96 h-96 rounded-full opacity-20 animate-blob-drift pointer-events-none"
        style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 70%)', top: '-8rem', left: '-8rem' }}
      />
      <div
        className="absolute w-80 h-80 rounded-full opacity-15 animate-pulse-slow pointer-events-none"
        style={{ background: 'radial-gradient(circle, #ec4899 0%, transparent 70%)', bottom: '-6rem', right: '-6rem' }}
      />
      <div
        className="absolute w-64 h-64 rounded-full opacity-10 animate-blob-drift pointer-events-none"
        style={{ background: 'radial-gradient(circle, #06b6d4 0%, transparent 70%)', top: '30%', right: '20%', animationDelay: '4s' }}
      />

      {/* Form card */}
      <GlassCard className="w-full max-w-md p-8 z-10">
        {/* Title */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-brand-from via-brand-via to-brand-to bg-clip-text text-transparent">
            {isLogin ? 'Codethium AI: Code On!' : 'Join Codethium AI'}
          </h2>
          <p className="text-muted text-sm mt-1">
            {isLogin ? 'Unleash your AI coding assistant' : 'Start your coding journey'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {isLogin ? (
            <>
              <input
                type="text"
                value={username || email}
                onChange={(e) => handleInputChange(e.target.value)}
                className={inputCls}
                placeholder="Enter username or email"
                required
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                placeholder="Enter password"
                required
              />
            </>
          ) : (
            <>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputCls}
                placeholder="Enter username"
                required
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="Enter email"
                required
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                placeholder="Enter password"
                required
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputCls}
                placeholder="Confirm password"
                required
              />
            </>
          )}

          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}

          <button
            type="submit"
            className="w-full py-3 rounded-lg bg-gradient-to-r from-brand-from via-brand-via to-brand-to text-white font-semibold text-sm hover:opacity-90 transition-opacity mt-2"
          >
            {isLogin ? 'Launch AI' : 'Sign Up'}
          </button>
        </form>

        {/* Toggle auth mode */}
        <p className="text-center text-xs text-muted mt-4">
          {isLogin ? (
            <>New here?{' '}
              <button onClick={() => setIsLogin(false)} className="text-brand-accent hover:underline">
                Sign Up
              </button>
            </>
          ) : (
            <>Have an account?{' '}
              <button onClick={() => setIsLogin(true)} className="text-brand-accent hover:underline">
                Login
              </button>
            </>
          )}
        </p>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-muted">{isLogin ? 'Or code with' : 'Or join with'}</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Social buttons */}
        <div className="flex justify-center gap-3">
          {['Google', 'Apple', 'Microsoft'].map((provider) => (
            <button
              key={provider}
              onClick={() => handleSocialLogin(provider)}
              title={provider}
              className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <img
                src={`/icons/${provider.toLowerCase()}.svg`}
                alt={`${provider} icon`}
                className="w-5 h-5"
              />
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-6 space-y-1">
          <p className="text-xs text-muted">Built for coders</p>
          <div className="flex justify-center gap-4 text-xs">
            <a href="https://github.com/dangnguyengroup23" target="_blank" rel="noopener noreferrer" className="text-brand-accent hover:underline">GitHub</a>
            <a href="https://discord.gg/codethium" target="_blank" rel="noopener noreferrer" className="text-brand-accent hover:underline">Discord</a>
            <a href="https://www.linkedin.com/in/huong-dang-a19115303/" target="_blank" rel="noopener noreferrer" className="text-brand-accent hover:underline">LinkedIn</a>
          </div>
          <p className="text-xs text-zinc-600">Authorized by Huong Dang</p>
        </div>
      </GlassCard>
    </div>
  );
}

export default LoginPage;
