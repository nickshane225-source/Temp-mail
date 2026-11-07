import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api';
import Card from './ui/Card';
import StatCard from './ui/StatCard';
import Toggle from './ui/Toggle';
import Chart from './ui/Chart';
import Skeleton from './ui/Skeleton';

export default function OverviewTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Date range picker states
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [compare, setCompare] = useState(true);

  // Live SSE stream state
  const [liveStreamConnected, setLiveStreamConnected] = useState(false);
  const [liveEvents, setLiveEvents] = useState([]);

  // Preset Date Range Helper
  const applyPreset = (preset) => {
    const today = new Date();
    const endStr = today.toISOString().slice(0, 10);
    setEndDate(endStr);

    if (preset === 'today') {
      setStartDate(endStr);
    } else if (preset === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      setStartDate(d.toISOString().slice(0, 10));
    } else if (preset === '30d') {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      setStartDate(d.toISOString().slice(0, 10));
    } else if (preset === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(firstDay.toISOString().slice(0, 10));
    }
  };

  const loadRangeAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api(`/admin/analytics/range?start=${startDate}&end=${endDate}&compare=${compare}`);
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, compare]);

  useEffect(() => {
    loadRangeAnalytics();
  }, [loadRangeAnalytics]);

  // Connect live message stream
  useEffect(() => {
    const token = localStorage.getItem('tm_admin');
    const es = new EventSource(`/api/admin/messages/stream?token=${encodeURIComponent(token || '')}`);

    es.onopen = () => setLiveStreamConnected(true);
    es.onerror = () => setLiveStreamConnected(false);

    es.onmessage = (e) => {
      try {
        const item = JSON.parse(e.data);
        if (item.type !== 'connected') {
          setLiveEvents((prev) => [item, ...prev.slice(0, 19)]);
        }
      } catch {}
    };

    return () => es.close();
  }, []);

  return (
    <div className="space-y-6">
      {/* Date Range Controls & Presets Bar */}
      <Card>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white m-0">
                Executive Overview
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  liveStreamConnected
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${liveStreamConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                {liveStreamConnected ? 'Live Feed Streaming' : 'Feed Offline'}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 m-0">
              Real-time traffic performance, comparison metrics, and live inbound events
            </p>
          </div>

          {/* Quick Date Presets & Custom Pickers */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Presets */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-medium">
              <button
                type="button"
                onClick={() => applyPreset('today')}
                className="px-2.5 py-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => applyPreset('7d')}
                className="px-2.5 py-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
              >
                7d
              </button>
              <button
                type="button"
                onClick={() => applyPreset('30d')}
                className="px-2.5 py-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
              >
                30d
              </button>
              <button
                type="button"
                onClick={() => applyPreset('month')}
                className="px-2.5 py-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
              >
                Month
              </button>
            </div>

            {/* Custom Range Inputs */}
            <div className="flex items-center gap-1.5 text-xs">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 outline-none"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 outline-none"
              />
            </div>

            {/* Styled Toggle Switch */}
            <div className="pl-2 border-l border-slate-200 dark:border-slate-800">
              <Toggle
                checked={compare}
                onChange={setCompare}
                label="Compare Previous"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Comparative Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <StatCard
          title="Total Inbound Messages"
          value={data?.current?.received}
          delta={compare ? data?.changePercent?.received : undefined}
          priorValue={compare ? data?.previous?.received : undefined}
          priorLabel="prior period msgs"
          icon="✉️"
        />

        <StatCard
          title="Mailboxes Provisioned"
          value={data?.current?.mailboxes}
          delta={compare ? data?.changePercent?.mailboxes : undefined}
          priorValue={compare ? data?.previous?.mailboxes : undefined}
          priorLabel="prior period boxes"
          icon="📦"
        />

        {/* Top Active Senders Card */}
        <Card className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Top Active Senders
              </span>
              <span className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center text-sm">
                📡
              </span>
            </div>
            <div className="space-y-2 mt-2">
              {data?.topSenders && data.topSenders.length > 0 ? (
                data.topSenders.slice(0, 3).map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[170px]">
                      {s.domain}
                    </span>
                    <span className="font-mono text-slate-400 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                      {s.count} msgs
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-slate-400 text-xs py-3 text-center">
                  No domain telemetry recorded.
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
            Ranked by mail volume in selected range
          </div>
        </Card>
      </div>

      {/* Daily Message Volume SVG Chart */}
      <Card
        title="Daily Message Volume"
        subtitle={compare ? "Comparing current period (teal) against prior period (subtle gray)" : "Timeline of messages received per day"}
      >
        {loading ? (
          <div className="py-12 space-y-3">
            <Skeleton className="h-44 w-full rounded-xl" />
          </div>
        ) : (
          <Chart
            data={data?.dailySeries || []}
            priorData={data?.priorDailySeries || []}
            showCompare={compare}
            height={220}
            emptyMessage="No activity recorded in this range."
          />
        )}
      </Card>

      {/* Live Inbound Telemetry Feed */}
      <Card
        title="Live Inbound Metadata Feed (Privacy-Preserved)"
        subtitle="Real-time SSE event stream of incoming mail metadata. Email bodies are never decrypted or displayed here."
        action={
          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            Live SSE
          </span>
        }
      >
        {liveEvents.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-850 rounded-xl">
            Waiting for incoming mail events...
          </div>
        ) : (
          <div className="space-y-2">
            {liveEvents.map((evt, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/60 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">
                    To: {evt.address}
                  </span>
                  <span className="text-slate-400 mx-2">•</span>
                  <span className="text-slate-500 dark:text-slate-400">From: {evt.from}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      (evt.spamScore || 0) >= 50
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    }`}
                  >
                    Spam Score: {evt.spamScore || 0}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(evt.receivedAt || Date.now()).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
