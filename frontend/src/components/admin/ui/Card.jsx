import React from 'react';

export default function Card({ children, className = '', title, subtitle, action, ...props }) {
  return (
    <div
      className={`rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors ${className}`}
      {...props}
    >
      {(title || action) && (
        <div className="px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
          <div>
            {title && (
              <h3 className="text-base font-bold text-slate-900 dark:text-white m-0">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 m-0">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}
