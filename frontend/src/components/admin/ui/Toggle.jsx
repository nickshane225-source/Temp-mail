import React from 'react';

export default function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  className = '',
  id,
}) {
  const toggleId = id || `toggle-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <label
      htmlFor={toggleId}
      className={`inline-flex items-center gap-2.5 cursor-pointer select-none text-xs font-medium text-slate-700 dark:text-slate-300 ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
    >
      <div className="relative">
        <input
          id={toggleId}
          type="checkbox"
          className="sr-only peer"
          checked={Boolean(checked)}
          onChange={(e) => !disabled && onChange && onChange(e.target.checked)}
          disabled={disabled}
        />
        <div className="w-9 h-5 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0F766E]"></div>
      </div>
      {label && <span>{label}</span>}
    </label>
  );
}
