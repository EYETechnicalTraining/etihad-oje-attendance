import React, { useState } from 'react';
import { User } from '../types';
import { authService } from '../services/hybridAuthService';
import { isSupabaseConfigured } from '../services/supabase/client';
import { Notification } from '../components/common/Notification';
import { Plane, Lock, User as UserIcon, ShieldAlert, Cloud, Database } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await authService.login(username, password);
      if (res.success && res.user) {
        onLoginSuccess(res.user);
      } else {
        setError(res.error || 'Authentication failed');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <Plane size={32} color="#C5A059" strokeWidth={2.5} />
          </div>
          <h1>OJE TRAINEE MANAGEMENT SYSTEM</h1>
          <p>Etihad Engineering Technical Training</p>
          <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'center' }}>
            {isSupabaseConfigured ? (
              <span className="badge badge-present" style={{ fontSize: '0.75rem', gap: '0.35rem' }}>
                <Cloud size={13} /> CENTRAL CLOUD DATABASE ACTIVE
              </span>
            ) : (
              <span className="badge badge-late" style={{ fontSize: '0.75rem', gap: '0.35rem' }}>
                <Database size={13} /> LOCAL OFFLINE STORAGE
              </span>
            )}
          </div>
        </div>

        {error && <Notification type="error" message={error} onClose={() => setError(null)} />}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">
              Username / Email
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="username"
                type="text"
                className="form-control"
                style={{ paddingLeft: '2.5rem' }}
                placeholder="e.g. selva.master, instructor@etihad.ae, or trainee@etihad.ae"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
              <UserIcon
                size={18}
                color="#64748B"
                style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)' }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type="password"
                className="form-control"
                style={{ paddingLeft: '2.5rem' }}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <Lock
                size={18}
                color="#64748B"
                style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)' }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-gold btn-lg"
            style={{ width: '100%', marginTop: '1.25rem' }}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '2rem', paddingTop: '1.25rem', borderTop: '1px solid #E2E8F0', fontSize: '0.78rem', color: '#64748B', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', marginBottom: '0.25rem' }}>
            <ShieldAlert size={14} color="#C5A059" />
            <strong style={{ color: '#1E293B' }}>Restricted Access System</strong>
          </div>
          Authorized Personnel Only • Etihad Engineering Technical Training Division
        </div>
      </div>

      <div
        style={{
          marginTop: '1.5rem',
          textAlign: 'center',
          fontSize: '0.82rem',
          color: '#94A3B8',
          letterSpacing: '0.2px',
        }}
      >
        <span>Developed By <strong style={{ color: '#C5A059' }}>Shlok Raskar</strong></span>
        <span style={{ margin: '0 0.5rem', color: '#64748B' }}>|</span>
        <span>Copyrights <strong style={{ color: '#C5A059' }}>Shlok Raskar</strong> 2026</span>
      </div>
    </div>
  );
};
