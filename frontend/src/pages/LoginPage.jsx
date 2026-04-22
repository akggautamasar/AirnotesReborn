import React, { useState } from 'react';
import { useApp } from '../store/AppContext';
import { api } from '../utils/api';

export default function LoginPage() {
  const { actions } = useApp();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(password);
      localStorage.setItem('airnotes_token', res.token);
      actions.setAuth(true);
    } catch (err) {
      setError(err.message || 'Invalid password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-ink-700/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-ink-600/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm animate-slide-up">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-ink-800 border border-ink-700/50 mb-4 shadow-xl">
            <span className="text-3xl">📚</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-paper-50 mb-1">AirNotes 2.0</h1>
          <p className="text-ink-400 text-sm font-body">Unlimited PDF library via Telegram MTProto</p>
        </div>

        <form onSubmit={handleLogin} className="glass rounded-2xl p-8 shadow-2xl">
          <div className="mb-6">
            <label className="block text-ink-300 text-sm font-medium mb-2">Access Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoFocus
              className="w-full bg-ink-900/80 border border-ink-700/50 rounded-xl px-4 py-3
                         text-ink-100 placeholder-ink-600 focus:outline-none focus:border-ink-500
                         focus:ring-1 focus:ring-ink-500/50 font-body transition-all"
            />
          </div>

          {error && (
            <div className="mb-4 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full btn-primary py-3 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-paper-50/30 border-t-paper-50 rounded-full animate-spin" />
                Signing in…
              </span>
            ) : 'Enter Library'}
          </button>
        </form>
      </div>
    </div>
  );
}
