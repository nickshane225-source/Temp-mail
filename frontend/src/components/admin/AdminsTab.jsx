import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { api } from '../../api';

export default function AdminsTab({ currentAdmin }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);

  // New admin state
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('moderator');
  const [creating, setCreating] = useState(false);

  // 2FA state
  const [totpUri, setTotpUri] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpQrDataUrl, setTotpQrDataUrl] = useState('');
  const [totpTokenInput, setTotpTokenInput] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);

  // Change password state
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [passMsg, setPassMsg] = useState('');

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const list = await api('/admin/admins');
      setAdmins(Array.isArray(list) ? list : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api('/admin/admins', {
        method: 'POST',
        body: { email: newEmail, password: newPassword, role: newRole },
      });
      setNewEmail('');
      setNewPassword('');
      loadAdmins();
    } catch (err) {
      alert(err.message || 'Failed to create admin.');
    } finally {
      setCreating(false);
    }
  };

  const handleLogoutAll = async () => {
    if (!confirm('Log out of all active admin sessions on all devices?')) return;
    try {
      await api('/admin/logout-all', { method: 'POST' });
      alert('All sessions invalidated.');
    } catch (err) {
      alert(err.message || 'Failed to invalidate sessions.');
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPassMsg('');
    try {
      await api('/admin/change-password', {
        method: 'POST',
        body: { currentPassword: curPass, newPassword: newPass },
      });
      setPassMsg('✓ Password updated successfully.');
      setCurPass('');
      setNewPass('');
    } catch (err) {
      alert(err.message || 'Failed to change password.');
    }
  };

  const start2faSetup = async () => {
    try {
      const res = await api('/admin/2fa/setup', { method: 'POST' });
      setTotpSecret(res.secret);
      setTotpUri(res.uri);
      const qr = await QRCode.toDataURL(res.uri, { width: 200, margin: 1 });
      setTotpQrDataUrl(qr);
    } catch (err) {
      alert(err.message || 'Failed to start 2FA setup.');
    }
  };

  const confirm2faEnable = async (e) => {
    e.preventDefault();
    try {
      const res = await api('/admin/2fa/enable', {
        method: 'POST',
        body: { secret: totpSecret, token: totpTokenInput },
      });
      setBackupCodes(res.backupCodes || []);
      setTotpQrDataUrl('');
      loadAdmins();
    } catch (err) {
      alert(err.message || 'Invalid 2FA code.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Active Session & Session Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Admin Accounts & Security
          </h2>
          <p className="text-xs text-slate-500">
            Active logged-in as <strong>{currentAdmin?.email}</strong> ({currentAdmin?.role || 'owner'})
          </p>
        </div>

        <button
          onClick={handleLogoutAll}
          className="px-4 py-2 rounded-xl border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold shadow-sm transition-colors cursor-pointer"
        >
          🔒 Log Out Everywhere
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Admin Accounts List */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
            Team Members ({admins.length})
          </h3>

          <form onSubmit={handleCreateAdmin} className="mb-4 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="email"
                required
                placeholder="Admin email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
              <input
                type="password"
                required
                placeholder="Temporary password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              >
                <option value="owner">Role: Owner (Full Access)</option>
                <option value="moderator">Role: Moderator (No settings)</option>
                <option value="billing_only">Role: Billing Only</option>
                <option value="read_only">Role: Read-Only (Auditor)</option>
              </select>

              <button
                type="submit"
                disabled={creating}
                className="flex-1 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm cursor-pointer disabled:opacity-50"
              >
                {creating ? 'Adding...' : '+ Add Admin'}
              </button>
            </div>
          </form>

          <div className="space-y-2 flex-1 overflow-y-auto max-h-[350px]">
            {admins.map((a) => (
              <div
                key={a._id}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-bold text-slate-800 dark:text-slate-200">{a.email}</div>
                  <div className="text-[10px] text-slate-400">
                    Role: <strong className="uppercase">{a.role}</strong> • 2FA: {a.totpEnabled ? 'Active' : 'Off'}
                  </div>
                </div>
                {a.disabled ? (
                  <span className="text-[10px] text-red-500 font-bold">Disabled</span>
                ) : (
                  <span className="text-[10px] text-emerald-600 font-bold">Active</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Security Credentials & 2FA */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
          {/* Password update */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">
              Update Admin Password
            </h3>
            {passMsg && <div className="text-xs text-emerald-600 font-semibold mb-2">{passMsg}</div>}
            <form onSubmit={handleChangePassword} className="space-y-2">
              <input
                type="password"
                required
                placeholder="Current password"
                value={curPass}
                onChange={(e) => setCurPass(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
              <input
                type="password"
                required
                minLength={8}
                placeholder="New password (min 8 chars)"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
              <button
                type="submit"
                className="w-full py-2 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white font-bold text-xs shadow-sm cursor-pointer"
              >
                Change Password
              </button>
            </form>
          </div>

          {/* 2FA Setup */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">
              Two-Factor Authentication (TOTP)
            </h3>
            {!totpQrDataUrl && !backupCodes.length && (
              <button
                onClick={start2faSetup}
                className="w-full py-2 rounded-xl border border-teal-600 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/40 font-bold text-xs shadow-sm cursor-pointer"
              >
                Configure Authenticator App (2FA)
              </button>
            )}

            {totpQrDataUrl && (
              <form onSubmit={confirm2faEnable} className="text-center space-y-3">
                <img src={totpQrDataUrl} alt="2FA QR Code" className="mx-auto rounded-xl border" />
                <div className="text-xs text-slate-500 font-mono">Secret: {totpSecret}</div>
                <input
                  type="text"
                  required
                  placeholder="Enter 6-digit TOTP code"
                  value={totpTokenInput}
                  onChange={(e) => setTotpTokenInput(e.target.value)}
                  className="w-48 px-3 py-1.5 text-center text-sm font-mono tracking-widest rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                <button
                  type="submit"
                  className="w-full py-2 rounded-xl bg-teal-600 text-white font-bold text-xs"
                >
                  Verify & Activate 2FA
                </button>
              </form>
            )}

            {backupCodes.length > 0 && (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800">
                <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-2">
                  ✓ 2FA Activated! Save your backup codes safely:
                </div>
                <div className="grid grid-cols-2 gap-1 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                  {backupCodes.map((c, i) => (
                    <div key={i}>{c}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
