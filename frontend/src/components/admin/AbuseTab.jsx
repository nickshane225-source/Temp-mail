import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api';

export default function AbuseTab() {
  const [reports, setReports] = useState([]);
  const [blocklist, setBlocklist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add block modal state
  const [newType, setNewType] = useState('address');
  const [newValue, setNewValue] = useState('');
  const [newReason, setNewReason] = useState('');
  const [isWildcard, setIsWildcard] = useState(false);
  const [addingBlock, setAddingBlock] = useState(false);

  const loadAbuseData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [reps, blocks] = await Promise.all([
        api('/admin/reports/grouped').catch(() => []),
        api('/admin/blocklist').catch(() => []),
      ]);
      setReports(Array.isArray(reps) ? reps : []);
      setBlocklist(Array.isArray(blocks) ? blocks : []);
    } catch (err) {
      setError(err.message || 'Failed to load abuse telemetry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAbuseData();
  }, [loadAbuseData]);

  const handleAddBlock = async (e) => {
    e.preventDefault();
    if (!newValue.trim()) return;
    setAddingBlock(true);
    try {
      await api('/admin/blocklist', {
        method: 'POST',
        body: {
          type: newType,
          value: newValue.trim(),
          reason: newReason.trim(),
          isWildcard: isWildcard || newValue.includes('*'),
        },
      });
      setNewValue('');
      setNewReason('');
      setIsWildcard(false);
      loadAbuseData();
    } catch (err) {
      alert(err.message || 'Failed to add block entry.');
    } finally {
      setAddingBlock(false);
    }
  };

  const handleDeleteBlock = async (id) => {
    if (!confirm('Remove this entry from the blocklist?')) return;
    try {
      await api(`/admin/blocklist/${id}`, { method: 'DELETE' });
      loadAbuseData();
    } catch (err) {
      alert(err.message || 'Failed to delete block.');
    }
  };

  const handleBlockReportedSender = async (senderEmail) => {
    try {
      await api('/admin/blocklist', {
        method: 'POST',
        body: { type: 'address', value: senderEmail, reason: 'Auto-blocked from Abuse Reports grouping' },
      });
      loadAbuseData();
    } catch (err) {
      alert(err.message || 'Failed to block sender.');
    }
  };

  const handleExportCsv = () => {
    const token = localStorage.getItem('tm_admin');
    window.open(`/api/admin/blocklist/export?token=${encodeURIComponent(token || '')}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Abuse Center & Threat Shield
          </h2>
          <p className="text-xs text-slate-500">
            Automated threat mitigation, grouped reports by sender, and wildcard firewall rules
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
        >
          <span>📥</span>
          <span>Export Blocklist CSV</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Grouped Reports by Sender */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              User Reports Grouped by Sender ({reports.length})
            </h3>
            <p className="text-xs text-slate-400">Repeated abuse sources flagged by temp-mail recipients</p>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[500px] space-y-2.5">
            {reports.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">No active reports.</div>
            ) : (
              reports.map((r) => (
                <div
                  key={r._id || 'unknown'}
                  className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850 flex items-center justify-between text-xs"
                >
                  <div className="max-w-[70%]">
                    <div className="font-bold text-slate-900 dark:text-white truncate">
                      {r._id || 'Unknown Sender'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Reported <strong>{r.count} times</strong> • Last: {new Date(r.lastReportedAt).toLocaleDateString()}
                    </div>
                    <div className="text-[10px] text-amber-600 truncate mt-0.5">
                      Reasons: {(r.reasons || []).join(', ')}
                    </div>
                  </div>

                  <button
                    onClick={() => handleBlockReportedSender(r._id)}
                    className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] shadow-sm whitespace-nowrap cursor-pointer"
                  >
                    Block Sender
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Blocklist Management & Firewall Rules */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Global Blocklist ({blocklist.length} rules)
            </h3>
            <p className="text-xs text-slate-400">Supports exact match or wildcard patterns (e.g. *.phish.com)</p>
          </div>

          {/* Add Rule Form */}
          <form onSubmit={handleAddBlock} className="mb-4 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 space-y-2.5">
            <div className="grid grid-cols-3 gap-2">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              >
                <option value="address">Email Address</option>
                <option value="domain">Domain / Host</option>
                <option value="ip">Sender IP</option>
              </select>

              <input
                type="text"
                required
                placeholder="Value (e.g. *.badspam.com)"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="col-span-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Reason (optional)"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
              <button
                type="submit"
                disabled={addingBlock}
                className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm cursor-pointer disabled:opacity-50"
              >
                {addingBlock ? 'Adding...' : '+ Add Rule'}
              </button>
            </div>
          </form>

          {/* Blocklist Table */}
          <div className="flex-1 overflow-y-auto max-h-[380px] space-y-2">
            {blocklist.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">No active blocks configured.</div>
            ) : (
              blocklist.map((b) => (
                <div
                  key={b._id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-mono font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <span>{b.value}</span>
                      {b.isWildcard && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] uppercase">
                          Wildcard
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Type: {b.type} • Reason: {b.reason || 'None provided'} • Hits: {b.hitCount || 0}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteBlock(b._id)}
                    className="text-red-500 hover:text-red-700 font-semibold text-xs"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
