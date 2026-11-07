import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { analyzeLinkSafety } from '../utils/linkSafety';

export default function ConfirmLink() {
  const [searchParams] = useSearchParams();
  const rawUrl = searchParams.get('url') || '';
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    if (rawUrl) {
      setAnalysis(analyzeLinkSafety(rawUrl));
    }
  }, [rawUrl]);

  if (!rawUrl) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center shadow-lg">
          <h2 className="text-xl font-bold mb-2">Missing Destination URL</h2>
          <p className="text-sm text-slate-500 mb-6">No destination link parameter was provided.</p>
          <Link to="/" className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm">
            Go to Inbox
          </Link>
        </div>
      </div>
    );
  }

  const { destinationDomain, warnings = [], isHighRisk } = analysis || {};

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="max-w-xl w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-10 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <span className={`p-3 rounded-2xl text-2xl ${isHighRisk ? 'bg-red-100 dark:bg-red-950 text-red-600' : 'bg-amber-100 dark:bg-amber-950 text-amber-600'}`}>
            {isHighRisk ? '🛑' : '⚠️'}
          </span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              {isHighRisk ? 'Security Alert: Suspicious Link' : 'External Link Confirmation'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              You are about to leave TempMail and visit an external destination.
            </p>
          </div>
        </div>

        {/* Warning Badges */}
        {warnings.length > 0 && (
          <div className="space-y-3 mb-6">
            {warnings.map((w, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-2xl text-xs flex items-start gap-2.5 font-medium ${
                  w.level === 'danger'
                    ? 'bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-300'
                    : 'bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                }`}
              >
                <span className="text-base">{w.level === 'danger' ? '⚠️' : 'ℹ️'}</span>
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Destination Information */}
        <div className="p-4 rounded-2xl bg-slate-100/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 mb-8 space-y-2">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Destination Domain</span>
            <div className="font-mono text-base font-bold text-slate-800 dark:text-slate-100">
              {destinationDomain || 'Unknown domain'}
            </div>
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Full URL</span>
            <div className="font-mono text-xs text-slate-600 dark:text-slate-300 break-all select-all">
              {rawUrl}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={rawUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={`flex-1 py-3 px-4 rounded-xl text-center font-bold text-sm shadow-md transition-all ${
              isHighRisk
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-amber-600 hover:bg-amber-700 text-white'
            }`}
          >
            Open Destination Anyway ↗
          </a>
          <button
            onClick={() => window.close()}
            className="py-3 px-5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold transition-colors"
          >
            Return to Safety
          </button>
        </div>
      </div>
    </div>
  );
}
