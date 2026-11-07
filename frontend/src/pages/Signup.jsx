import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthShell from '../components/auth/AuthShell';
import { useAuth } from '../auth/AuthContext';
import { getSafeRedirect } from '../utils/safeRedirect';

export default function Signup() {
  const { register, loginWithGoogle, loginWithGoogleRedirect } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const nextPath = getSafeRedirect(searchParams.get('next'), '/account');
  const intent = searchParams.get('intent');
  const redirectTarget = intent && !nextPath.includes('intent=') 
    ? `${nextPath}${nextPath.includes('?') ? '&' : '?'}intent=${encodeURIComponent(intent)}`
    : nextPath;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Please provide an email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      await register(email, password);
      navigate(redirectTarget, { replace: true });
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      navigate(redirectTarget, { replace: true });
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user' || err.message?.includes('popup-closed-by-user')) {
        setError('Google sign-in popup was closed before completion. If your browser blocks popups, use redirect below.');
      } else if (err.code === 'auth/popup-blocked' || err.message?.includes('popup-blocked')) {
        setError('Popup was blocked by your browser. Please allow popups or use redirect below.');
      } else {
        setError(err.message || 'Google sign-in failed.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleRedirect = async () => {
    setError('');
    try {
      await loginWithGoogleRedirect();
    } catch (err) {
      setError(err.message || 'Could not initiate Google redirect.');
    }
  };

  const loginLink = `/login?next=${encodeURIComponent(searchParams.get('next') || '')}${intent ? `&intent=${encodeURIComponent(intent)}` : ''}`;

  return (
    <AuthShell
      title="Create an account"
      subtitle="Get started with free disposable addresses or upgrade anytime."
      footerLink={
        <span>
          Already have an account?{' '}
          <Link to={loginLink} className="text-[#0F766E] dark:text-teal-400 font-semibold hover:underline">
            Sign in
          </Link>
        </span>
      }
    >
      {error && (
        <div className="mb-5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 font-medium">
          {error}
        </div>
      )}

      {/* Google Sign-up */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={googleLoading || loading}
        className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-750 transition-all shadow-xs disabled:opacity-50"
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>{googleLoading ? 'Connecting to Google...' : 'Sign up with Google'}</span>
      </button>

      {/* Redirect fallback */}
      <div className="mt-2 text-center">
        <button
          type="button"
          onClick={handleGoogleRedirect}
          className="text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline"
        >
          Popup blocked? Sign in with redirect instead
        </button>
      </div>

      <div className="my-5 flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
        <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">or email</span>
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="signup-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Email address
          </label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@domain.com"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:border-[#0F766E] focus:outline-none transition-colors"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="signup-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Password
            </label>
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="text-xs text-[#0F766E] dark:text-teal-400 hover:underline"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <input
            id="signup-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:border-[#0F766E] focus:outline-none transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={loading || googleLoading}
          className="w-full mt-2 py-2.5 px-4 rounded-xl bg-[#0F766E] hover:bg-teal-800 text-white font-semibold text-sm transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Creating account...</span>
            </>
          ) : (
            'Create account'
          )}
        </button>
      </form>
    </AuthShell>
  );
}
