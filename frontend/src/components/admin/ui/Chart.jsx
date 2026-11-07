import React, { useState } from 'react';

export default function Chart({
  data = [],
  priorData = [],
  height = 200,
  showCompare = false,
  emptyMessage = 'No messages received in this period',
}) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl"
      >
        <div className="text-2xl mb-1">📊</div>
        <div className="text-xs text-slate-400 font-medium">{emptyMessage}</div>
      </div>
    );
  }

  const values = data.map((d) => d.received || 0);
  const priorValues = showCompare ? priorData.map((d) => d.received || 0) : [];
  const maxVal = Math.max(...values, ...priorValues, 5);

  const padding = { top: 20, right: 20, bottom: 35, left: 40 };
  const width = 800; // SVG coordinate system
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const barCount = data.length;
  const step = innerWidth / barCount;
  const barWidth = Math.min(32, Math.max(8, step * 0.6));

  // Horizontal Gridlines (4 levels)
  const gridLevels = [0, 0.33, 0.66, 1];

  return (
    <div className="w-full relative select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        style={{ maxHeight: height }}
      >
        {/* Gridlines & Y-Axis labels */}
        {gridLevels.map((lvl, idx) => {
          const y = padding.top + innerHeight * (1 - lvl);
          const labelVal = Math.round(maxVal * lvl);
          return (
            <g key={idx}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="currentColor"
                className="text-slate-200 dark:text-slate-800"
                strokeDasharray={lvl === 0 ? 'none' : '3 3'}
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                className="text-[10px] font-mono fill-slate-400"
              >
                {labelVal}
              </text>
            </g>
          );
        })}

        {/* Prior Period Bars / Line (if comparison enabled) */}
        {showCompare &&
          priorData.map((d, i) => {
            const h = ((d.received || 0) / maxVal) * innerHeight;
            const x = padding.left + i * step + (step - barWidth) / 2;
            const y = padding.top + innerHeight - h;
            return (
              <rect
                key={`prior-${i}`}
                x={x - 2}
                y={y}
                width={barWidth + 4}
                height={Math.max(2, h)}
                rx="3"
                className="fill-slate-300/40 dark:fill-slate-700/50"
              />
            );
          })}

        {/* Current Period Bars */}
        {data.map((d, i) => {
          const val = d.received || 0;
          const h = (val / maxVal) * innerHeight;
          const x = padding.left + i * step + (step - barWidth) / 2;
          const y = padding.top + innerHeight - h;
          const isHovered = hoveredIndex === i;

          return (
            <g
              key={`bar-${i}`}
              className="cursor-pointer group"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Invisible wider hit target */}
              <rect
                x={padding.left + i * step}
                y={padding.top}
                width={step}
                height={innerHeight}
                fill="transparent"
              />

              {/* Styled Bar */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(3, h)}
                rx="4"
                className={`transition-colors ${
                  isHovered
                    ? 'fill-teal-400'
                    : 'fill-[#0F766E] dark:fill-teal-500'
                }`}
              />

              {/* X-axis date label */}
              {(barCount <= 14 || i % Math.ceil(barCount / 10) === 0) && (
                <text
                  x={x + barWidth / 2}
                  y={height - 10}
                  textAnchor="middle"
                  className="text-[10px] font-mono fill-slate-400 dark:fill-slate-500"
                >
                  {d.day ? d.day.slice(5) : ''}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Hover Tooltip Overlay */}
      {hoveredIndex !== null && data[hoveredIndex] && (
        <div
          style={{
            left: `${((padding.left + hoveredIndex * step + step / 2) / width) * 100}%`,
            top: '0px',
            transform: 'translate(-50%, -100%)',
          }}
          className="absolute z-20 pointer-events-none mb-2 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs shadow-lg border border-slate-700 whitespace-nowrap"
        >
          <div className="font-semibold">{data[hoveredIndex].day}</div>
          <div className="text-teal-300 font-mono text-[11px]">
            {data[hoveredIndex].received} message{data[hoveredIndex].received === 1 ? '' : 's'}
          </div>
          {showCompare && priorData[hoveredIndex] && (
            <div className="text-slate-400 text-[10px]">
              Prior: {priorData[hoveredIndex].received || 0}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
