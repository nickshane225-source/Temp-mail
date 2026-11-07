import React, { useState, useEffect } from 'react';
import { api } from '../../api';

export default function UserDetailDrawer({ userId, onClose, onUserUpdated }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Modal dialog states
  const [showCustomGrantModal, setShowCustomGrantModal] = useState(false);
  const [grantDays, setGrantDays] = useState(30);
  const [grantReason, setGrantReason] = useState('');

  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  const loadDetails = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api(`/admin/users/${userId}`);
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load user details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) loadDetails();
  }, [userId]);

  const handleGrantCustom = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await api(`/admin/users/${userId}/grant-custom-premium`, {
        method: 'POST',
        body: { days: Number(grantDays), reason: grantReason },
      });
      setShowCustomGrantModal(false);
      await loadDetails();
      onUserUpdated?.();
    } catch (err) {
      alert(err.message || 'Failed to grant custom premium.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspend = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await api(`/admin/users/${userId}/suspend`, {
        method: 'POST',
        body: { reason: suspendReason || 'Administrative suspension' },
      });
      setShowSuspendModal(false);
      await loadDetails();
      onUserUpdated?.();
    } catch (err) {
      alert(err.message || 'Failed to suspend user.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
    if (!confirm('Reactivate this user account and restore API/login access?')) return;
    setActionLoading(true);
    try {
      await api(`/admin/users/${userId}/reactivate`, { method: 'POST' });
      await loadDetails();
      onUserUpdated?.();
    } catch (err) {
      alert(err.message || 'Failed to reactivate user.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeKey = async (keyId) => {
    if (!confirm('Are you sure you want to revoke this developer API key immediately?')) return;
    setActionLoading(true);
    try {
      await api(`/admin/users/${userId}/api-keys/${keyId}`, { method: 'DELETE' });
      await loadDetails();
      onUserUpdated?.();
    } catch (err) {
      alert(err.message || 'Failed to revoke API key.');
    } finally {
      setActionLoading(false);
    }
  };

  if (!userId) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex justify-end">
      <div className="bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 w-full max-w-xl h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
              User Profile Drawer
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">
              {data?.user?.email || 'Loading details...'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-lg font-bold transition-colors"
          >
            ×
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading user lifecycle data...</div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-600 text-sm">
              {error}
            </div>
          ) : (
            <>
              {/* Account Status Card */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500 uppercase">Account Status</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      data.user.status === 'suspended'
                        ? 'bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400'
                        : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    {data.user.status || 'active'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs mb-4">
                  <div>
                    <span className="text-slate-400">Registered:</span>
                    <div className="font-semibold text-slate-700 dark:text-slate-300">
                      {new Date(data.user.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400">Last Login:</span>
                    <div className="font-semibold text-slate-700 dark:text-slate-300">
                      {data.user.lastLoginAt ? new Date(data.user.lastLoginAt).toLocaleString() : 'Never'}
                    </div>
                  </div>
                </div>

                {data.user.suspendedReason && (
                  <div className="mb-4 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 text-xs">
                    <strong>Suspension Reason:</strong> {data.user.suspendedReason}
                  </div>
                )}

                {/* Account Actions Toolbar */}
                <div className="flex gap-2">
                  {data.user.status === 'suspended' ? (
                    <button
                      onClick={handleReactivate}
                      disabled={actionLoading}
                      className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors"
                    >
                      Reactivate Account
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowSuspendModal(true)}
                      disabled={actionLoading}
                      className="flex-1 py-2 rounded-xl border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 font-semibold text-xs transition-colors"
                    >
                      Suspend / Force Logout
                    </button>
                  )}
                  <button
                    onClick={() => setShowCustomGrantModal(true)}
                    className="flex-1 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm transition-colors"
                  >
                    Grant Custom Premium
                  </button>
                </div>
              </div>

              {/* Subscription Details */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase">Subscription</span>
                  <span className="text-xs font-bold text-teal-600 dark:text-teal-400">
                    {data.user.isPremium ? '⭐ Premium Pro ($4.99/mo)' : 'Free Tier'}
                  </span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  {data.user.isPremium
                    ? `Active until: ${data.user.premiumUntil ? new Date(data.user.premiumUntil).toLocaleDateString() : 'Auto-renewing'}`
                    : 'User has standard 30-minute mailbox lifespans.'}
                </div>
              </div>

              {/* Developer API Keys */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Active API Keys ({data.apiKeys?.length || 0})
                  </h3>
                </div>

                <div className="space-y-2">
                  {data.apiKeys && data.apiKeys.length > 0 ? (
                    data.apiKeys.map((k) => (
                      <div
                        key={k.keyId}
                        className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-200">{k.name}</div>
                          <div className="font-mono text-[11px] text-slate-400">Prefix: {k.prefix}...</div>
                          <div className="text-[10px] text-slate-400">
                            Last used: {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRevokeKey(k.keyId)}
                          disabled={actionLoading}
                          className="px-2.5 py-1 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950 font-semibold text-[11px]"
                        >
                          Revoke Key
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-400 text-center py-4 bg-slate-50/50 dark:bg-slate-850 rounded-xl">
                      No API keys created by this user.
                    </div>
                  )}
                </div>
              </div>

              {/* Payment History */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Payment History ({data.payments?.length || 0})
                </h3>
                <div className="space-y-2">
                  {data.payments && data.payments.length > 0 ? (
                    data.payments.map((p) => (
                      <div
                        key={p._id}
                        className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-200">
                            ${p.amount} {p.currency} • {p.provider}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Order: {p.orderId || p.paymentId || 'N/A'}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(p.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            p.status === 'finished'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {p.status}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-400 text-center py-4 bg-slate-50/50 dark:bg-slate-850 rounded-xl">
                      No payment transactions on file.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Grant Custom Premium Modal */}
      {showCustomGrantModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold mb-3">Grant Custom Premium</h3>
            <form onSubmit={handleGrantCustom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  Number of Days
                </label>
                <input
                  type="number"
                  min="1"
                  max="3650"
                  required
                  value={grantDays}
                  onChange={(e) => setGrantDays(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  Reason for Grant
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. VIP partner, compensation for downtime"
                  value={grantReason}
                  onChange={(e) => setGrantReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCustomGrantModal(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs"
                >
                  {actionLoading ? 'Granting...' : 'Grant Premium'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Suspend User Modal */}
      {showSuspendModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-3xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-red-600 mb-2">Suspend User & Invalidate Tokens</h3>
            <p className="text-xs text-slate-500 mb-4">
              Suspending this user will immediately invalidate all active JWT sessions, block login, and disable API key usage.
            </p>
            <form onSubmit={handleSuspend} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  Reason for Suspension
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. API abuse, payment fraud, bot spam"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowSuspendModal(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
                >
                  {actionLoading ? 'Suspending...' : 'Suspend User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
