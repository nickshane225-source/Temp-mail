import React from 'react';

export default function Skeleton({
  className = 'h-4 w-full',
  rounded = 'rounded-md',
}) {
  return (
    <div
      className={`bg-slate-200 dark:bg-slate-800 animate-pulse ${rounded} ${className}`}
    />
  );
}
