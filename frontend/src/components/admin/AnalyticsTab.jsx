import React, { useState, useEffect } from 'react';
import { api } from '../../api';

export default function AnalyticsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/admin/analytics')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return <div className="py-16 text-center text-sm text-slate-400">Loading deep analytics...</div>;
  }

  const maxHour = Math.max(...(data.hours || []), 1);

  return (
    <div className="space-y-6">
      {/* 24-Hour Traffic Distribution */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">
          24-Hour Inbound Activity (UTC)
        </h3>
        <p className="text-xs text-slate-400 mb-6">Hourly breakdown of incoming emails across all mailboxes</p>

        <div className="flex items-end gap-1.5 h-36 px-2 overflow-x-auto">
          {(data.hours || []).map((count, h) => {
            const pct = Math.round((count / maxHour) * 100);
            return (
              <div key={h} className="flex-1 flex flex-col items-center gap-1 min-w-[20px] group">
                <span className="text-[9px] font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                  {count}
                </span>
                <div
                  style={{ height: `${Math.max(4, pct)}%` }}
                  className="w-full bg-teal-500 rounded-t-md group-hover:bg-teal-400 transition-all"
                ></div>
                <span className="text-[9px] text-slate-400 font-mono">{h}h</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Sender Domains */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
            Top Sending Domains
          </h3>
          <div className="space-y-2">
            {(data.topSenders || []).length === 0 ? (
              <div className="text-xs text-slate-400 py-6 text-center">No telemetry yet.</div>
            ) : (
              (data.topSenders || []).map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 text-xs"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{s.domain}</span>
                  <span className="font-mono text-slate-400">{s.count} received</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Sender Countries */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
            Top Connecting Origin Countries
          </h3>
          <div className="space-y-2">
            {(data.topCountries || []).length === 0 ? (
              <div className="text-xs text-slate-400 py-6 text-center">No geo-telemetry yet.</div>
            ) : (
              (data.topCountries || []).map((c, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 text-xs"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    🌍 {c.country}
                  </span>
                  <span className="font-mono text-slate-400">{c.count} hits</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
