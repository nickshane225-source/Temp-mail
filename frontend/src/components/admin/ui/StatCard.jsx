import React from 'react';

export default function StatCard({
  title,
  value,
  delta,
  priorValue,
  priorLabel = 'vs prior period',
  icon,
  variant = 'teal',
  className = '',
}) {
  const hasPrior = priorValue !== undefined && priorValue !== null && priorValue > 0;
  const isPositive = delta > 0;
  const isNegative = delta < 0;

  return (
    <div
      className={`p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between transition-colors ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title}
        </span>
        {icon && (
          <span className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center text-sm">
            {icon}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-3 my-1">
        <span className="text-3xl sm:text-4xl font-display font-extrabold text-slate-900 dark:text-white tracking-tight">
          {value !== undefined ? value : '0'}
        </span>

        {/* Delta Pill */}
        {hasPrior && delta !== undefined ? (
          <span
            className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold ${
              isPositive
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                : isNegative
                ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            <span>{isPositive ? '↑ +' : isNegative ? '↓ ' : ''}</span>
            <span>{delta}%</span>
          </span>
        ) : (
          <span className="text-[11px] font-medium text-slate-400">
            {priorValue === 0 ? 'No prior data' : '-'}
          </span>
        )}
      </div>

      <div className="mt-3 text-xs text-slate-400">
        {hasPrior
          ? `${priorValue} ${priorLabel}`
          : priorValue === 0
          ? 'No activity in prior period'
          : 'Selected date range'}
      </div>
    </div>
  );
}
