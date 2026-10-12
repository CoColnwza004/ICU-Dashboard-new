import { useId } from 'react';
import type { Bed } from '../types';
import { ACUITIES, ACUITY_META } from '../lib/constants';
import { useChartTheme } from './charts';
import { cx, Dot } from './ui';

/** เส้นแนวโน้มขนาดเล็ก (ไม่มีแกน) — ช่องที่ไม่มีข้อมูลจะเว้นว่าง */
export function Sparkline({
  values,
  height = 40,
  max,
  label,
}: {
  values: (number | null)[];
  height?: number;
  max?: number;
  label: string;
}) {
  const id = useId();
  const color = useChartTheme().series[0];
  const w = 160;
  const nums = values.filter((v): v is number => v !== null);
  const top = Math.max(1, max ?? Math.max(...nums, 1));
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => (v === null ? null : ([i * step, height - 3 - (v / top) * (height - 8)] as const)));
  const segments: (readonly [number, number])[][] = [];
  pts.forEach((p) => {
    if (!p) return segments.push([]);
    if (!segments.length) segments.push([]);
    segments[segments.length - 1].push(p);
  });
  const last = [...pts].reverse().find(Boolean);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="h-10 w-full overflow-visible" role="img" aria-label={label}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {segments
        .filter((s) => s.length > 1)
        .map((s, i) => {
          const line = s.map(([x, y], j) => `${j ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
          return (
            <g key={i}>
              <path d={`${line}L${s[s.length - 1][0]},${height}L${s[0][0]},${height}Z`} fill={`url(#${id})`} />
              <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
      {last && <circle cx={last[0]} cy={last[1]} r={3} fill={color} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

/** วงแหวนแสดงสัดส่วน 0–100 */
export function Ring({ value, size = 76, label }: { value: number; size?: number; label: string }) {
  const id = useId();
  const accent = useChartTheme().series[0];
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} ${pct}%`} className="shrink-0 -rotate-90">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity={0.55} />
          <stop offset="100%" stopColor={accent} />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-fill)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        className="transition-[stroke-dasharray] duration-1000 ease-[var(--ease-apple)]"
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="num rotate-90 fill-ink text-[15px] font-semibold"
        style={{ transformOrigin: 'center' }}
      >
        {pct}%
      </text>
    </svg>
  );
}

/** สัดส่วนระดับความรุนแรงของผู้ป่วยที่อยู่ในเตียง */
export function AcuityBar({ beds }: { beds: Bed[] }) {
  const occ = beds.filter((b) => b.status === 'occupied');
  const counts = ACUITIES.map((a) => ({ a, n: occ.filter((b) => b.acuity === a).length }));
  const unknown = occ.length - counts.reduce((s, c) => s + c.n, 0);
  return (
    <div>
      <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-fill">
        {counts.map(({ a, n }) =>
          n ? <span key={a} className={cx('h-full', ACUITY_META[a].dot)} style={{ flex: n }} title={`${a} ${n}`} /> : null,
        )}
        {unknown > 0 && <span className="h-full bg-ink-3/50" style={{ flex: unknown }} />}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-2">
        {counts.map(({ a, n }) => (
          <li key={a} className="flex items-center gap-1">
            <Dot className={cx('size-1.5', ACUITY_META[a].dot)} />
            {a} <span className="num text-ink">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** แถบเตียงทั้งหมดแบบย่อ */
export function BedStrip({ beds }: { beds: Bed[] }) {
  return (
    <div className="flex gap-1.5">
      {beds.map((b) => (
        <div key={b.bedNumber} className="min-w-0 flex-1 text-center">
          <div
            className={cx(
              'h-7 rounded-[9px] transition-colors',
              b.status === 'occupied' && 'btn-ink',
              b.status === 'available' && 'bg-good/20 ring-1 ring-good/30 ring-inset',
              b.status === 'cleaning' && 'bg-warn/25 ring-1 ring-warn/40 ring-inset',
            )}
            title={`${b.bedNumber}`}
          />
          <p className="num mt-1 truncate text-[10px] text-ink-3">{b.bedNumber.replace(/^ICU-?/, '')}</p>
        </div>
      ))}
    </div>
  );
}

export function Delta({ value, unit = '' }: { value: number | null; unit?: string }) {
  if (value === null) return <span className="text-[12px] text-ink-3">ไม่มีข้อมูลเมื่อวาน</span>;
  const tone = value === 0 ? 'text-ink-2 bg-fill-soft' : 'text-ink bg-fill';
  return (
    <span className={cx('num inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', tone)}>
      {value > 0 ? '▲ +' : value < 0 ? '▼ −' : '± '}
      {Math.abs(value)}
      {unit} จากเมื่อวาน
    </span>
  );
}
