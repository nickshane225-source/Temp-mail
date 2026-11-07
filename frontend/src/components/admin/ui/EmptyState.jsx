import React from 'react';

export default function EmptyState({
  icon = '📭',
  title = 'No records found',
  description,
  action,
  className = '',
}) {
  return (
    <div className={`p-10 text-center flex flex-col items-center justify-center ${className}`}>
      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center text-xl mb-3">
        {icon}
      </div>
      <h4 className="text-sm font-bold text-slate-900 dark:text-white m-0">
        {title}
      </h4>
      {description && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
