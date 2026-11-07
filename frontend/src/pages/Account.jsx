import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../auth/AuthContext';
import { useConfirm } from '../components/ui/ConfirmDialog';

export default function Account() {
  const { user, token, loading, isPremium, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [newKeyName, setNewKeyName] = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [revokingId, setRevokingId] = useState(null);
  const [actionError, setActionError] = useState('');

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user && !token) {
      navigate('/login?next=/account', { replace: true });
    }
  }, [loading, user, token, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F7F4] dark:bg-slate-950 flex items-center justify-center font-sans">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <span className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
          <span>Loading your account profile...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const handleGenerateKey = async (e) => {
    e.preventDefault();
    setActionError('');
    setGeneratingKey(true);
    setCopiedKey(false);
    try {
      const res = await fetch('/api/user/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newKeyName || 'Default Key' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate API key');

      setNewlyCreatedKey(data.apiKey);
      setNewKeyName('');
      await refreshUser();
      toast.success('New API key generated successfully!');
    } catch (err) {
      setActionError(err.message || 'Error generating key');
      toast.error(err.message || 'Error generating key');
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleRevokeKey = async (keyId) => {
    const ok = await confirm({
      title: 'Revoke API Key',
      description: 'Are you sure you want to revoke this API key? Applications using it will immediately lose access.',
      confirmText: 'Revoke Key',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;

    setActionError('');
    setRevokingId(keyId);
    try {
      const res = await fetch(`/api/user/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to revoke key');
      }
      await refreshUser();
      toast.success('API key revoked successfully.');
    } catch (err) {
      setActionError(err.message || 'Error revoking key');
      toast.error(err.message || 'Error revoking key');
    } finally {
      setRevokingId(null);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    toast.success('API key copied to clipboard!');
    setTimeout(() => setCopiedKey(false), 3000);
  };

  const calculateDaysRemaining = (expireDate) => {
    if (!expireDate) return 0;
    const diff = new Date(expireDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  return (
    <div className="min-h-screen bg-[#F6F7F4] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors pb-16">
      {/* Header */}
      <header className="border-b border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-40">
        <div className="max-w-[1140px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <svg width="34" height="34" viewBox="0 0 36 36" role="img" aria-label="TempMail logo" className="flex-none">
              <rect width="36" height="36" rx="10" fill="#0F766E"></rect>
              <path d="M9 13l9 6 9-6M9 13v10h18V13H9z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round"></path>
            </svg>
            <span className="font-display font-bold text-xl tracking-tight text-[#0F172A] dark:text-white">TempMail</span>
          </Link>

          <div className="flex items-center gap-4 text-sm font-medium">
            <Link to="/" className="text-slate-600 dark:text-slate-300 hover:text-[#0F766E] transition-colors">
              Inbox
            </Link>
            <Link to="/premium" className="text-slate-600 dark:text-slate-300 hover:text-[#0F766E] transition-colors">
              Pricing
            </Link>
            <button
              onClick={() => {
                logout();
                navigate('/');
              }}
              className="text-rose-600 dark:text-rose-400 hover:underline text-sm font-medium"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-[1000px] mx-auto px-4 sm:px-6 pt-8 sm:pt-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 dark:text-white m-0">
              Account Overview
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Manage your subscription, authentication, and developer API credentials.
            </p>
          </div>
          <button
            onClick={() => {
              logout();
              navigate('/');
            }}
            className="self-start sm:self-auto px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors shadow-xs"
          >
            Sign out
          </button>
        </div>

        {actionError && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-sm text-rose-700 dark:text-rose-300 font-medium">
            {actionError}
          </div>
        )}

        {/* Subscription & Profile Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Profile Card */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                User Profile
              </div>
              <div className="text-base font-semibold text-slate-900 dark:text-white break-all">
                {user.email}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Member ID: <span className="font-mono text-[11px]">{user._id || 'User'}</span>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500">Account status</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                Active
              </span>
            </div>
          </div>

          {/* Premium Status Card */}
          <div className="md:col-span-2 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Plan & Subscription
                </span>
                {isPremium ? (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#0F766E] text-white flex items-center gap-1.5 shadow-xs">
                    <span>★</span> Premium Active
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    Free Tier
                  </span>
                )}
              </div>

              {isPremium ? (
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white m-0">
                    Premium Pro (30-Day Inboxes)
                  </h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Your account has ad-free browsing, 30-day extended mailbox lifetimes, and full access to the Developer API.
                  </p>
                  <div className="mt-4 p-3 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900/60 flex items-center justify-between">
                    <span className="text-xs font-medium text-teal-800 dark:text-teal-200">
                      Active until {new Date(user.premiumUntil).toLocaleDateString(undefined, { dateStyle: 'long' })}
                    </span>
                    <span className="text-xs font-bold text-teal-700 dark:text-teal-300">
                      {calculateDaysRemaining(user.premiumUntil)} days remaining
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white m-0">
                    Free Disposable Inboxes
                  </h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Standard inboxes expire automatically. Upgrade to Premium Pro for $4.99/mo to unlock 30-day lifetimes, custom aliases, and the developer API.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {isPremium ? 'Extend or renew your subscription anytime' : 'Zero card commitment, pay with crypto'}
              </span>
              <Link
                to="/premium?intent=upgrade"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-teal-800 rounded-xl transition-colors shadow-xs"
              >
                {isPremium ? 'Extend Subscription ($4.99)' : 'Upgrade to Pro ($4.99)'}
              </Link>
            </div>
          </div>
        </div>

        {/* Developer API Keys Section */}
        <div className="p-6 sm:p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white m-0 flex items-center gap-2">
                <span>Developer API Keys</span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 font-semibold">
                  v1 API
                </span>
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Use your API key to automate disposable inboxes, run automated QA tests, and retrieve OTP verification codes.
              </p>
            </div>
            <Link
              to="/api/docs"
              className="text-xs font-semibold text-[#0F766E] dark:text-teal-400 hover:underline flex items-center gap-1 self-start sm:self-auto"
            >
              <span>View API Documentation</span>
              <span>→</span>
            </Link>
          </div>

          {!isPremium ? (
            <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-center">
              <div className="text-2xl mb-2">🔑</div>
              <h4 className="text-base font-semibold text-slate-900 dark:text-white m-0">
                API Key Generation Requires Premium Pro
              </h4>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Upgrade your subscription to generate unlimited API keys with 60 requests/minute rate limit.
              </p>
              <div className="mt-4">
                <Link
                  to="/premium?intent=upgrade"
                  className="inline-block px-5 py-2.5 rounded-xl bg-[#0F766E] hover:bg-teal-800 text-white font-medium text-sm transition-all shadow-xs"
                >
                  Upgrade to Pro ($4.99)
                </Link>
              </div>
            </div>
          ) : (
            <div>
              {/* Generate New Key Form */}
              <form onSubmit={handleGenerateKey} className="flex flex-wrap gap-3 mb-6">
                <input
                  type="text"
                  placeholder="Key label (e.g. CI/CD Pipeline, Staging Tests)"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="flex-1 min-w-[260px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:border-[#0F766E] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={generatingKey}
                  className="px-5 py-2.5 rounded-xl bg-[#0F766E] hover:bg-teal-800 text-white font-semibold text-sm transition-all shadow-xs flex items-center gap-2 disabled:opacity-50"
                >
                  {generatingKey ? 'Generating...' : '+ Generate New Key'}
                </button>
              </form>

              {/* Newly Created Key Alert */}
              {newlyCreatedKey && (
                <div className="mb-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900/60">
                  <div className="text-xs font-bold text-amber-800 dark:text-amber-200 uppercase tracking-wider mb-1">
                    ⚠️ Copy Your API Key Now
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                    This key will not be shown again. Store it securely in your secret manager or environment variables.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={newlyCreatedKey}
                      className="flex-1 px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-slate-100 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(newlyCreatedKey)}
                      className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs transition-colors"
                    >
                      {copiedKey ? '✓ Copied' : 'Copy Key'}
                    </button>
                  </div>
                </div>
              )}

              {/* Existing Keys Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                      <th className="py-3 px-3">Label</th>
                      <th className="py-3 px-3">Key Prefix</th>
                      <th className="py-3 px-3">Created</th>
                      <th className="py-3 px-3">Last Used</th>
                      <th className="py-3 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {user.apiKeys && user.apiKeys.length > 0 ? (
                      user.apiKeys.map((key) => (
                        <tr key={key.keyId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-3 font-medium text-slate-900 dark:text-white">
                            {key.name || 'API Key'}
                          </td>
                          <td className="py-3 px-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                            {key.prefix}••••••••••••••••
                          </td>
                          <td className="py-3 px-3 text-xs text-slate-500">
                            {new Date(key.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-3 text-xs text-slate-500">
                            {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRevokeKey(key.keyId)}
                              disabled={revokingId === key.keyId}
                              className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 disabled:opacity-50"
                            >
                              {revokingId === key.keyId ? 'Revoking...' : 'Revoke'}
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-sm text-slate-400">
                          No active API keys found. Generate a key above to start using the API.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
