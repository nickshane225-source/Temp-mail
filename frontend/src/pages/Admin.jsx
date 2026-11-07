import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { signInWithGoogle } from '../firebase';
import AdminLayout from '../components/admin/AdminLayout';
import OverviewTab from '../components/admin/OverviewTab';
import AnalyticsTab from '../components/admin/AnalyticsTab';
import UsersTab from '../components/admin/UsersTab';
import PaymentsTab from '../components/admin/PaymentsTab';
import MessagesTab from '../components/admin/MessagesTab';
import DomainsTab from '../components/admin/DomainsTab';
import AbuseTab from '../components/admin/AbuseTab';
import AdminsTab from '../components/admin/AdminsTab';
import AuditTab from '../components/admin/AuditTab';
import MonitoringTab from '../components/admin/MonitoringTab';
import SettingsTab from '../components/admin/SettingsTab';
import BlogTab from '../components/admin/BlogTab';

const TABS = [
  'Overview',
  'Analytics',
  'Users',
  'Payments',
  'Messages',
  'Domains',
  'Abuse',
  'Admins',
  'Audit',
  'Monitoring',
  'Settings',
  'Blog',
];

export default function Admin() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('tm_admin'));
  const [activeTab, setActiveTab] = useState('Overview');
  const [admin, setAdmin] = useState(null);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('tm_admin');
    setAuthed(false);
    setAdmin(null);
  }, []);

  useEffect(() => {
    if (!authed) return;
    api('/admin/me')
      .then(setAdmin)
      .catch((err) => {
        // If 401 or invalid session, log out immediately
        if (err.status === 401 || err.message?.includes('Please sign in again')) {
          handleLogout();
        }
      });
  }, [authed, handleLogout]);

  if (!authed) {
    return <Login onDone={() => setAuthed(true)} />;
  }

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'Overview':
        return <OverviewTab />;
      case 'Analytics':
        return <AnalyticsTab />;
      case 'Users':
        return <UsersTab />;
      case 'Payments':
        return <PaymentsTab />;
      case 'Messages':
        return <MessagesTab />;
      case 'Domains':
        return <DomainsTab />;
      case 'Abuse':
        return <AbuseTab />;
      case 'Admins':
        return <AdminsTab currentAdmin={admin} />;
      case 'Audit':
        return <AuditTab />;
      case 'Monitoring':
        return <MonitoringTab />;
      case 'Settings':
        return <SettingsTab />;
      case 'Blog':
        return <BlogTab />;
      default:
        return <OverviewTab />;
    }
  };

  return (
    <AdminLayout
      tabs={TABS}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      admin={admin}
      onLogout={handleLogout}
    >
      {renderActiveTab()}
    </AdminLayout>
  );
}

function Login({ onDone }) {
  const [f, setF] = useState({ email: '', password: '', totpCode: '' });
  const [require2fa, setRequire2fa] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const res = await api('/admin/login', { method: 'POST', body: f });
      if (res.require2fa) {
        setRequire2fa(true);
        setLoading(false);
        return;
      }
      localStorage.setItem('tm_admin', res.token);
      onDone();
    } catch (x) {
      setErr(x.message || 'Login failed.');
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErr('');
    setGoogleLoading(true);
    try {
      const { idToken } = await signInWithGoogle();
      const res = await api('/admin/firebase', {
        method: 'POST',
        body: { idToken },
      });
      localStorage.setItem('tm_admin', res.token);
      onDone();
    } catch (x) {
      if (x.code === 'auth/popup-closed-by-user' || x.message?.includes('popup-closed-by-user')) {
        setErr('Google sign-in popup was closed before completion. If the popup was blank, ensure this domain is added to Authorized Domains in Firebase Console -> Authentication -> Settings.');
      } else {
        setErr(x.message || 'Google sign-in failed.');
      }
      setGoogleLoading(false);
    }
  };

  return (
    <div className="login min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <form
        className="panel max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl"
        onSubmit={submit}
      >
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '2.4rem', marginBottom: '4px' }}>⚡</div>
          <h1 style={{ fontSize: '1.6rem', margin: 0, fontWeight: 800 }}>TempMail Admin</h1>
          <p className="muted text-slate-500 text-xs mt-1">
            Sign in to manage domains, analytics, monetization, and system settings.
          </p>
        </div>

        {!require2fa && (
          <>
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleLoading || loading}
              className="btn secondary w-full flex items-center justify-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm cursor-pointer mb-3"
            >
              <svg style={{ width: '18px', height: '18px' }} viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>{googleLoading ? 'Signing in with Google…' : 'Sign in with Google'}</span>
            </button>

            <div className="flex items-center my-4 opacity-60">
              <div className="flex-1 border-t border-slate-200 dark:border-slate-800"></div>
              <span className="px-3 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                or email & password
              </span>
              <div className="flex-1 border-t border-slate-200 dark:border-slate-800"></div>
            </div>
          </>
        )}

        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-500 uppercase">
            Admin Email
            <input
              type="email"
              required
              autoFocus
              disabled={require2fa}
              placeholder="admin@tempmail.com"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
              className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-500 uppercase">
            Password
            <input
              type="password"
              required
              disabled={require2fa}
              placeholder="••••••••••••"
              value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
              className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </label>

          {require2fa && (
            <label className="block text-xs font-semibold text-slate-500 uppercase">
              6-Digit 2FA Code or Backup Code
              <input
                type="text"
                required
                autoFocus
                placeholder="123456"
                value={f.totpCode}
                onChange={(e) => setF({ ...f, totpCode: e.target.value })}
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono tracking-widest text-center focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </label>
          )}

          {err && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-600 text-xs font-semibold">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Signing in…' : require2fa ? 'Verify & Sign In' : 'Sign In to Dashboard'}
          </button>

          {require2fa && (
            <button
              type="button"
              className="w-full text-center text-xs text-slate-400 hover:text-slate-600 underline pt-2"
              onClick={() => setRequire2fa(false)}
            >
              ← Back to Password
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
