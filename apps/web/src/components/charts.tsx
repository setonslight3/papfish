import { useId, useState } from 'react';
import type { DailyAccuracy, MasteryBand } from '@papfish/core';
import { classNames } from '@/lib/format';

/**
 * Charts for the progress screens.
 *
 * All three carry a single series, so identity never depends on colour: the
 * title names the series and values are labelled directly. The mastery scale is
 * sequential (one hue, dark to light, monotonic in lightness against the dark
 * surface); "Untrained" sits outside that scale and is drawn in neutral grey
 * because it is a different thing, not a lower value.
 */
const SEQUENTIAL = ['#0e7490', '#0891b2', '#0ea5e9', '#7dd3fc'];
const NEUTRAL = '#64748b';
const ACCENT = '#38bdf8';
const GRID = '#1e293b';
const AXIS_TEXT = '#64748b';

function formatShortDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function AccuracyTrend({ series }: { series: DailyAccuracy[] }): React.JSX.Element {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const width = 320;
  const height = 140;
  const padding = { top: 12, right: 8, bottom: 22, left: 26 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const withData = series.filter((day) => day.attempts > 0);
  if (withData.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No attempts in this window yet - train a session and the trend appears here.
      </p>
    );
  }

  const x = (index: number) =>
    padding.left + (series.length <= 1 ? plotWidth / 2 : (index / (series.length - 1)) * plotWidth);
  const y = (value: number) => padding.top + plotHeight - (value / 100) * plotHeight;

  // Days without attempts break the line rather than implying a score of zero.
  const segments: { index: number; day: DailyAccuracy }[][] = [];
  let current: { index: number; day: DailyAccuracy }[] = [];
  series.forEach((day, index) => {
    if (day.attempts > 0) {
      current.push({ index, day });
    } else if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  });
  if (current.length > 0) segments.push(current);

  const last = withData.at(-1)!;
  const lastIndex = series.findIndex((day) => day === last);
  const active = hover !== null ? series[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Accuracy over the last ${series.length} days`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 50, 100].map((value) => (
          <g key={value}>
            <line x1={padding.left} x2={width - padding.right} y1={y(value)} y2={y(value)} stroke={GRID} strokeWidth="1" />
            <text x={padding.left - 6} y={y(value) + 3} textAnchor="end" fontSize="8" fill={AXIS_TEXT}>
              {value}
            </text>
          </g>
        ))}

        {segments.map((segment, segmentIndex) => {
          const points = segment.map(({ index, day }) => `${x(index)},${y(day.accuracy)}`);
          const areaPath = `M ${x(segment[0].index)},${y(0)} L ${points.join(' L ')} L ${x(segment.at(-1)!.index)},${y(0)} Z`;
          return (
            <g key={segmentIndex}>
              {segment.length > 1 ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
              <polyline
                points={points.join(' ')}
                fill="none"
                stroke={ACCENT}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          );
        })}

        {series.map((day, index) =>
          day.attempts > 0 ? (
            <circle
              key={day.date}
              cx={x(index)}
              cy={y(day.accuracy)}
              r={hover === index ? 4.5 : 3}
              fill={ACCENT}
              stroke="#0b1120"
              strokeWidth="2"
            />
          ) : null,
        )}

        {/* Hit targets are wider than the marks so a finger can find them. */}
        {series.map((day, index) => (
          <rect
            key={`hit-${day.date}`}
            x={x(index) - plotWidth / Math.max(1, series.length - 1) / 2}
            y={padding.top}
            width={plotWidth / Math.max(1, series.length - 1)}
            height={plotHeight}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
            onFocus={() => setHover(index)}
          />
        ))}

        <text x={x(lastIndex)} y={y(last.accuracy) - 8} textAnchor="end" fontSize="9" fill="#e2e8f0" fontWeight="600">
          {last.accuracy}%
        </text>

        <text x={padding.left} y={height - 6} fontSize="8" fill={AXIS_TEXT}>
          {formatShortDate(series[0].date)}
        </text>
        <text x={width - padding.right} y={height - 6} textAnchor="end" fontSize="8" fill={AXIS_TEXT}>
          {formatShortDate(series.at(-1)!.date)}
        </text>
      </svg>

      {active && active.attempts > 0 ? (
        <div className="pointer-events-none absolute top-0 right-0 rounded-md border border-slate-700 bg-slate-950/95 px-2 py-1 text-[11px] text-slate-200">
          <span className="font-semibold">{formatShortDate(active.date)}</span> · {active.accuracy}%
          <span className="text-slate-500"> ({active.correct}/{active.attempts})</span>
        </div>
      ) : null}
    </div>
  );
}

export function MasteryDistribution({ bands }: { bands: MasteryBand[] }): React.JSX.Element {
  const total = bands.reduce((sum, band) => sum + band.count, 0);
  if (total === 0) {
    return <p className="text-sm text-slate-500">No positions yet.</p>;
  }

  const max = Math.max(...bands.map((band) => band.count));

  return (
    <ul className="space-y-2">
      {bands.map((band, index) => {
        const share = max > 0 ? (band.count / max) * 100 : 0;
        const color = band.min < 0 ? NEUTRAL : SEQUENTIAL[Math.max(0, index - 1)] ?? ACCENT;
        return (
          <li key={band.label} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-[11px] text-slate-400">{band.label}</span>
            <div className="h-3 flex-1 overflow-hidden rounded-r bg-slate-800/60">
              <div
                className="h-full rounded-r transition-[width]"
                style={{ width: `${Math.max(share, band.count > 0 ? 3 : 0)}%`, backgroundColor: color }}
                title={`${band.count} position${band.count === 1 ? '' : 's'}`}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-[11px] text-slate-300 tabular-nums">
              {band.count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ReviewForecast({ upcoming }: { upcoming: number[] }): React.JSX.Element {
  const max = Math.max(1, ...upcoming);
  const labels = ['Today', '+1', '+2', '+3', '+4', '+5', '+6'];

  return (
    <div className="flex items-end gap-1.5" role="img" aria-label="Reviews due over the next seven days">
      {upcoming.map((count, index) => (
        <div key={index} className="flex flex-1 flex-col items-center gap-1">
          <span
            className={classNames(
              'text-[10px] tabular-nums',
              count > 0 ? 'text-slate-300' : 'text-slate-600',
            )}
          >
            {count}
          </span>
          <div
            className="w-full rounded-t transition-[height]"
            style={{
              height: `${Math.max(4, (count / max) * 56)}px`,
              backgroundColor: index === 0 && count > 0 ? ACCENT : count > 0 ? '#0891b2' : GRID,
            }}
            title={`${count} due ${labels[index] === 'Today' ? 'today' : `in ${index} days`}`}
          />
          <span className="text-[10px] text-slate-500">{labels[index]}</span>
        </div>
      ))}
    </div>
  );
}
