import React from 'react';
import { Link } from 'react-router-dom';

export default function AuthShell({ title, subtitle, children, footerLink }) {
  return (
    <div className="min-h-screen bg-[#F6F7F4] dark:bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 transition-colors font-sans">
      <div className="w-full max-w-[960px] bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[580px]">
        {/* Left Teal Branding Panel */}
        <div className="md:col-span-5 bg-[#0F766E] text-white p-8 sm:p-10 flex flex-col justify-between relative overflow-hidden">
          {/* Subtle background decoration */}
          <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-teal-600/30 blur-2xl pointer-events-none" />
          <div className="absolute -left-12 -bottom-12 w-48 h-48 rounded-full bg-teal-800/30 blur-2xl pointer-events-none" />

          <div className="relative z-10">
            {/* Logo */}
            <Link to="/" className="inline-flex items-center gap-3 group">
              <svg width="38" height="38" viewBox="0 0 36 36" role="img" aria-label="TempMail logo" className="flex-none">
                <rect width="36" height="36" rx="10" fill="#ffffff"></rect>
                <path d="M9 13l9 6 9-6M9 13v10h18V13H9z" fill="none" stroke="#0F766E" strokeWidth="2.2" strokeLinejoin="round"></path>
              </svg>
              <span className="font-display font-extrabold text-2xl tracking-tight text-white">
                TempMail
              </span>
            </Link>

            <div className="mt-10 sm:mt-12">
              <span className="inline-block px-2.5 py-1 text-xs font-semibold uppercase tracking-wider bg-teal-800/60 text-teal-100 rounded-md mb-3 border border-teal-500/30">
                PRO FEATURES
              </span>
              <h2 className="text-2xl sm:text-3xl font-display font-bold leading-tight text-white m-0">
                Your account unlocks the full inbox.
              </h2>
            </div>

            {/* Benefit Checkpoints */}
            <ul className="mt-8 space-y-4 text-sm text-teal-50 list-none p-0 m-0">
              <li className="flex items-center gap-3">
                <span className="flex-none w-5 h-5 rounded-full bg-teal-500/40 text-teal-200 flex items-center justify-center font-bold text-xs">
                  ✓
                </span>
                <span>Inboxes that last up to 30 days</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="flex-none w-5 h-5 rounded-full bg-teal-500/40 text-teal-200 flex items-center justify-center font-bold text-xs">
                  ✓
                </span>
                <span>No ads ever</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="flex-none w-5 h-5 rounded-full bg-teal-500/40 text-teal-200 flex items-center justify-center font-bold text-xs">
                  ✓
                </span>
                <span>API key for your test suite</span>
              </li>
            </ul>
          </div>

          <div className="relative z-10 pt-6 mt-6 border-t border-teal-600/60 text-xs text-teal-200">
            🔒 We never read your emails. Private & end-to-end disposable.
          </div>
        </div>

        {/* Right Form Card */}
        <div className="md:col-span-7 p-6 sm:p-10 flex flex-col justify-center">
          <div className="w-full max-w-[420px] mx-auto">
            <div className="mb-6">
              <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white m-0">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                  {subtitle}
                </p>
              )}
            </div>

            {children}

            {footerLink && (
              <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 text-center text-sm text-slate-600 dark:text-slate-400">
                {footerLink}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
