import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ShieldCheck, Mail, Lock, ArrowRight, AlertCircle, Activity, Sparkles, Users, CreditCard } from 'lucide-react';
import { supabase, ADMIN_UID } from './supabaseClient';
import { ToastProvider } from './components/Toast';
import AdminLayout from './components/AdminLayout';
import Dashboard from './pages/Dashboard';
import UserManagement from './pages/UserManagement';
import Settings from './pages/Settings';
import Logs from './pages/Logs';

function LoginScreen({ onReady }: { onReady: (loading: boolean) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    onReady(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message);
      setBusy(false);
      onReady(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="auth-brand">
          <div className="auth-brand-mark">
            <ShieldCheck size={20} color="white" />
          </div>
          <div>
            <div className="auth-brand-name">VANBA Admin</div>
            <div className="auth-brand-sub">Control Center v2.0</div>
          </div>
        </div>

        <div className="stack-lg" style={{ maxWidth: 540 }}>
          <div className="auth-headline">
            Run your <span>job-hunting</span> platform with confidence.
          </div>
          <div className="auth-sub">
            Approve payments, manage users, monitor security, and keep the
            VANBA Job Hunter engine healthy — all from one calm dashboard.
          </div>
          <div className="auth-stats">
            <div className="auth-stat">
              <div className="auth-stat-val"><Activity size={18} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--accent-400)' }} />Live</div>
              <div className="auth-stat-lbl">Real-time metrics</div>
            </div>
            <div className="auth-stat">
              <div className="auth-stat-val"><Users size={18} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--accent-400)' }} />All</div>
              <div className="auth-stat-lbl">Users &amp; plans</div>
            </div>
            <div className="auth-stat">
              <div className="auth-stat-val"><CreditCard size={18} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--accent-400)' }} />Rzp</div>
              <div className="auth-stat-lbl">Payment approvals</div>
            </div>
          </div>
        </div>

        <div className="muted" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>
          © {new Date().getFullYear()} VANBA · Secured admin console
        </div>
      </div>

      <div className="auth-form-side">
        <form className="auth-card" onSubmit={handleLogin}>
          <div className="row">
            <div className="auth-card-icon">
              <Sparkles size={26} color="white" />
            </div>
          </div>
          <div>
            <div className="auth-title">Welcome back</div>
            <div className="auth-sub2">Sign in with your admin credentials to continue.</div>
          </div>

          {error && (
            <div className="auth-error" role="alert">
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <div className="field">
            <label className="label" htmlFor="email">Admin email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-soft)', pointerEvents: 'none' }} />
              <input
                id="email"
                type="email"
                className="input"
                style={{ paddingLeft: 36 }}
                placeholder="you@vanba.app"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="password">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-soft)', pointerEvents: 'none' }} />
              <input
                id="password"
                type="password"
                className="input"
                style={{ paddingLeft: 36 }}
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? 'Signing in…' : (<>Sign in to dashboard <ArrowRight size={16} /></>)}
          </button>

          <div className="auth-hint">Restricted to authorized administrators only.</div>
        </form>
      </div>
    </div>
  );
}

function Gate({ onReady }: { onReady: (loading: boolean) => void }) {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    onReady(true);
    const evaluate = async (s: any | null) => {
      if (s && s.user?.id === ADMIN_UID) {
        setIsAdmin(true);
        setSession(s);
      } else {
        setIsAdmin(false);
        setSession(null);
      }
      setChecking(false);
      onReady(false);
    };

    supabase.auth.getSession().then(({ data: { session: s } }) => evaluate(s));
    const { data: authListener } = supabase.auth.onAuthStateChange((_evt, s) => evaluate(s));
    return () => authListener.subscription.unsubscribe();
  }, []);

  if (checking) {
    return (
      <div className="auth-page" style={{ gridTemplateColumns: '1fr' }}>
        <div className="auth-form-side" style={{ background: 'var(--bg-grad)' }}>
          <div className="auth-card" style={{ alignItems: 'center' }}>
            <div className="spinner spinner-lg" />
            <div className="muted">Verifying session…</div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) return <LoginScreen onReady={onReady} />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AdminLayout user={session.user} />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard session={session} />} />
          <Route path="users" element={<UserManagement session={session} />} />
          <Route path="settings" element={<Settings session={session} />} />
          <Route path="logs" element={<Logs session={session} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Gate onReady={() => {}} />
    </ToastProvider>
  );
}
