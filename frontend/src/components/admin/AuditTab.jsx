import React, { useState, useEffect } from 'react';
import { api } from '../../api';

export default function AuditTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [searchAdmin, setSearchAdmin] = useState('');

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await api('/admin/audit-logs');
      setLogs(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = logs.filter((l) => {
    const matchAction = !filterAction || l.action?.toLowerCase().includes(filterAction.toLowerCase());
    const matchAdmin = !searchAdmin || l.adminEmail?.toLowerCase().includes(searchAdmin.toLowerCase());
    return matchAction && matchAdmin;
  });

  const handleExportCsv = () => {
    const headers = ['AdminEmail', 'Action', 'IP', 'Date', 'Details'];
    const rows = filteredLogs.map((l) => [
      `"${l.adminEmail || ''}"`,
      `"${l.action || ''}"`,
      `"${l.ip || ''}"`,
      `"${new Date(l.createdAt).toISOString()}"`,
      `"${JSON.stringify(l.details || {}).replace(/"/g, '""')}"`,
    ].join(','));

    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Administrative Audit Trail
          </h2>
          <p className="text-xs text-slate-500">
            Immutable log of all configuration edits, domain mutations, user suspensions, and security events
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
        >
          <span>📥</span>
          <span>Export Audit CSV</span>
        </button>
      </div>

      {/* Filter Row */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-sm flex gap-3">
        <input
          type="text"
          placeholder="Filter by admin email..."
          value={searchAdmin}
          onChange={(e) => setSearchAdmin(e.target.value)}
          className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
        />
        <input
          type="text"
          placeholder="Filter by action keyword (e.g. settings, suspend)..."
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
        />
      </div>

      {/* Audit Log Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading audit trail...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">No matching audit logs recorded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-5">Admin Email</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Details</th>
                  <th className="py-3 px-4">IP Address</th>
                  <th className="py-3 px-5 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredLogs.map((l) => (
                  <tr key={l._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-3.5 px-5 font-bold text-slate-800 dark:text-slate-200">
                      {l.adminEmail}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-teal-600 dark:text-teal-400">
                      {l.action}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 max-w-[280px] truncate">
                      {JSON.stringify(l.details || {})}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      {l.ip || '—'}
                    </td>
                    <td className="py-3.5 px-5 text-right text-slate-400 whitespace-nowrap">
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
