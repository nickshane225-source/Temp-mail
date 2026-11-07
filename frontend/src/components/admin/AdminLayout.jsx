import React, { useState, useEffect } from 'react';

export default function AdminLayout({
  tabs,
  activeTab,
  onSelectTab,
  admin,
  onLogout,
  children,
}) {
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem('tm_theme') === 'dark';
    } catch {
      return false;
    }
  });

  // Sync dark mode class and data-theme on documentElement
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      try {
        localStorage.setItem('tm_theme', 'dark');
      } catch {}
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
      try {
        localStorage.setItem('tm_theme', 'light');
      } catch {}
    }
  }, [darkMode]);

  // Keyboard navigation: 1-9 for tabs, Ctrl+K or Cmd+K for search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSearchModal((prev) => !prev);
        return;
      }
      if (e.key === 'Escape') {
        setShowSearchModal(false);
        return;
      }
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= Math.min(9, tabs.length)) {
        e.preventDefault();
        onSelectTab(tabs[num - 1]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, onSelectTab]);

  return (
    <div className="min-h-screen bg-[#F6F7F4] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 h-16 flex items-center justify-between shadow-xs">
        {/* Left: Brand & Breadcrumb */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#0F766E] text-white font-black text-sm shadow-xs">
              ⚡
            </div>
            <div className="hidden sm:block">
              <span className="font-display font-bold text-sm tracking-tight text-slate-900 dark:text-white">
                TempMail Admin
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

          {/* Breadcrumb & Operational badge */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Admin /</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {activeTab}
            </span>
            <span className="hidden md:inline-flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Operational
            </span>
          </div>
        </div>

        {/* Right: Search, Theme Toggle, Admin User Pill, Logout */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSearchModal(true)}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 text-xs text-slate-500 hover:border-teal-500 transition-colors shadow-2xs"
          >
            <span>🔍 Search</span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-mono text-slate-600 dark:text-slate-300">
              ⌘K
            </kbd>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            title="Toggle theme"
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>

          {/* Admin User Info Pill */}
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 text-xs">
            <span className="w-2 h-2 rounded-full bg-teal-500" />
            <span className="font-medium text-slate-700 dark:text-slate-300 max-w-[130px] truncate">
              {admin?.email}
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 uppercase">
              {admin?.role || 'owner'}
            </span>
          </div>

          <button
            onClick={onLogout}
            className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold transition-colors"
          >
            Log Out
          </button>
        </div>
      </header>

      {/* Main Container - max-w-[1400px] */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Sticky Tab Bar */}
        <div className="sticky top-16 z-20 bg-[#F6F7F4]/90 dark:bg-slate-950/90 backdrop-blur-md pt-1 pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
            {tabs.map((t, idx) => {
              const isActive = activeTab === t;
              return (
                <button
                  key={t}
                  onClick={() => onSelectTab(t)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-[#0F766E] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span>{t}</span>
                  {idx < 9 && (
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                        isActive ? 'bg-teal-800/80 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                      }`}
                    >
                      {idx + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Body */}
        <main>{children}</main>
      </div>

      {/* Quick Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
              <span className="text-slate-400">🔍</span>
              <input
                autoFocus
                type="text"
                placeholder="Jump to tab or setting (e.g. Overview, Payments, Domains)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-sm text-slate-900 dark:text-white outline-none"
              />
              <button
                onClick={() => setShowSearchModal(false)}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ESC
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              {tabs
                .filter((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      onSelectTab(t);
                      setShowSearchModal(false);
                      setSearchQuery('');
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center justify-between"
                  >
                    <span>{t}</span>
                    <span className="text-[10px] text-slate-400">Select</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
