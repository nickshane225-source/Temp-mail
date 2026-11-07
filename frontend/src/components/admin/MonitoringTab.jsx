import React, { useState, useEffect } from 'react';
import { api } from '../../api';

export default function MonitoringTab() {
  const [health, setHealth] = useState(null);
  const [failures, setFailures] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [h, f] = await Promise.all([
        api('/admin/health').catch(() => null),
        api('/admin/failures').catch(() => ({ failures: [] })),
      ]);
      setHealth(h);
      setFailures(f.failures || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Health Diagnostic Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            System Overall Health
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                health?.status === 'healthy'
                  ? 'bg-emerald-500'
                  : health?.status === 'degraded'
                  ? 'bg-amber-500'
                  : 'bg-red-500'
              }`}
            ></span>
            <span className="text-2xl font-extrabold capitalize text-slate-900 dark:text-white">
              {health?.status || 'Probing...'}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Uptime: {Math.floor((health?.uptime || 0) / 3600)}h {Math.floor(((health?.uptime || 0) % 3600) / 60)}m
          </div>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Database (MongoDB)
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <span>{health?.mongodb?.connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono">
            Ping Latency: {health?.mongodb?.pingMs || 0}ms
          </div>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            SMTP Receiver Gateway
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
            Port :{health?.smtp?.port || 25}
          </div>
          <div className="text-xs text-emerald-600 mt-1 font-semibold">
            {health?.smtp?.listening ? '✓ Listening for Inbound Mail' : 'Offline'}
          </div>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Storage Records
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
            {health?.storage?.messageCount || 0} msgs
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {health?.storage?.mailboxCount || 0} active inboxes in memory
          </div>
        </div>
      </div>

      {/* Failure Log Telemetry */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              System Exceptions & Failure Logs ({failures.length})
            </h3>
            <p className="text-xs text-slate-400">
              Real-time stack traces captured by monitoring handlers (auto-purged after 30 days)
            </p>
          </div>
          <button
            onClick={loadData}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Probing error logs...</div>
        ) : failures.length === 0 ? (
          <div className="py-12 text-center text-xs text-emerald-600 font-semibold bg-emerald-50/40 dark:bg-emerald-950/20 rounded-2xl">
            ✓ Zero critical exceptions logged in the last 24 hours. Systems running normally.
          </div>
        ) : (
          <div className="space-y-2">
            {failures.map((f) => (
              <div
                key={f._id}
                className="p-3.5 rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/20 text-xs font-mono"
              >
                <div className="flex items-center justify-between font-bold text-red-600 mb-1">
                  <span>Type: {f.type}</span>
                  <span className="font-normal text-slate-400 text-[11px]">
                    {new Date(f.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-slate-800 dark:text-slate-200 mb-1">{f.error}</div>
                {f.source && <div className="text-[10px] text-slate-500">Source: {f.source}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
