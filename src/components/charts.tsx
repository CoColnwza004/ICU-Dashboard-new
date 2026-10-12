import { useEffect, useState, type ReactElement } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { SERIES_DARK, SERIES_LIGHT } from '../lib/constants';

const useDark = () => {
  const q = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setDark(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return dark;
};

export const useChartTheme = (forceLight = false) => {
  const dark = useDark() && !forceLight;
  return dark
    ? { series: SERIES_DARK, grid: '#2c2c2e', axis: '#8e8e93', surface: '#1c1c1e', ink: '#f5f5f7' }
    : { series: SERIES_LIGHT, grid: '#ececf0', axis: '#86868b', surface: '#ffffff', ink: '#1d1d1f' };
};

export interface SeriesDef {
  key: string;
  label: string;
  kind: 'bar' | 'line' | 'area';
}

/** Legend อยู่เหนือกราฟ — ข้อความใช้สีตัวอักษรปกติ สีของเส้นอยู่ที่ marker เท่านั้น */
export function Legend({ series, colors }: { series: SeriesDef[]; colors: string[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-ink-2">
      {series.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            aria-hidden
            className={s.kind === 'bar' ? 'size-2.5 rounded-[3px]' : 'h-[2px] w-3.5 rounded-full'}
            style={{ background: colors[i] }}
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  series,
  colors,
  labelFormat,
  unit,
}: TooltipContentProps<number, string> & {
  series: SeriesDef[];
  colors: string[];
  labelFormat?: (l: string) => string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass glass-strong min-w-[180px] rounded-2xl px-4 py-3 text-[12px]">
      <p className="mb-2 font-semibold text-ink">{labelFormat ? labelFormat(String(label)) : label}</p>
      <ul className="space-y-1">
        {series.map((s, i) => {
          const p = payload.find((x) => x.dataKey === s.key);
          if (!p) return null;
          return (
            <li key={s.key} className="flex items-center justify-between gap-6">
              <span className="flex items-center gap-2 text-ink-2">
                <span className="size-2 rounded-full" style={{ background: colors[i] }} />
                {s.label}
              </span>
              <span className="num font-semibold text-ink">
                {p.value}
                {unit && <span className="ml-1 font-normal text-ink-3">{unit}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SeriesChart({
  data,
  xKey,
  series,
  height = 300,
  xFormat,
  labelFormat,
  unit = 'ราย',
  yMax,
  showLegend = true,
  printWidth,
}: {
  data: object[];
  xKey: string;
  series: SeriesDef[];
  height?: number;
  xFormat?: (v: string) => string;
  labelFormat?: (v: string) => string;
  unit?: string;
  yMax?: number;
  showLegend?: boolean;
  /** ความกว้างคงที่สำหรับหน้าพิมพ์ (ใช้สีโหมดสว่างเสมอ) */
  printWidth?: number;
}) {
  const theme = useChartTheme(!!printWidth);
  const colors = series.length === 1 ? [theme.series[0]] : theme.series;
  const bars = series.filter((s) => s.kind === 'bar').length;
  const barSize = Math.max(4, Math.min(14, Math.floor(380 / Math.max(1, data.length * Math.max(1, bars)))));

  return (
    <div>
      {showLegend && <Legend series={series} colors={colors} />}
      <div style={{ height }}>
        <Frame printWidth={printWidth} height={height}>
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 4, left: -28, bottom: 0 }}
            barGap={2}
            barCategoryGap="22%"
            {...(printWidth ? { width: printWidth, height } : {})}
          >
            <defs>
              {series.map((s, i) =>
                s.kind === 'area' ? (
                  <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors[i]} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={colors[i]} stopOpacity={0} />
                  </linearGradient>
                ) : null,
              )}
            </defs>
            <CartesianGrid vertical={false} stroke={theme.grid} />
            <XAxis
              dataKey={xKey}
              tickFormatter={xFormat}
              tick={{ fill: theme.axis }}
              tickLine={false}
              axisLine={{ stroke: theme.grid }}
              minTickGap={18}
              tickMargin={8}
            />
            <YAxis
              allowDecimals={false}
              domain={[0, yMax ?? ((max: number) => Math.max(4, Math.ceil(max)))]}
              tick={{ fill: theme.axis }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              cursor={{ stroke: theme.axis, strokeWidth: 1, strokeDasharray: '3 3', fill: 'transparent' }}
              content={(p) => (
                <ChartTooltip
                  {...(p as TooltipContentProps<number, string>)}
                  series={series}
                  colors={colors}
                  labelFormat={labelFormat}
                  unit={unit}
                />
              )}
            />
            {series.map((s, i) => {
              const c = colors[i];
              if (s.kind === 'bar')
                return (
                  <Bar key={s.key} dataKey={s.key} name={s.label} fill={c} radius={[4, 4, 0, 0]} barSize={barSize} isAnimationActive={false} />
                );
              if (s.kind === 'area')
                return (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={c}
                    strokeWidth={2}
                    fill={`url(#grad-${s.key})`}
                    dot={isolatedDot(data, s.key, c, theme.surface)}
                    activeDot={{ r: 4, fill: c, stroke: theme.surface, strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                );
              return (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={c}
                  strokeWidth={2}
                  dot={isolatedDot(data, s.key, c, theme.surface)}
                  activeDot={{ r: 4, fill: c, stroke: theme.surface, strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              );
            })}
          </ComposedChart>
        </Frame>
      </div>
    </div>
  );
}

/** จุดที่อยู่โดดเดี่ยว (ไม่มีค่าข้างเคียง) ต้องแสดง marker ไม่เช่นนั้นเส้นจะมองไม่เห็น */
const isolatedDot =
  (data: object[], key: string, color: string, surface: string) =>
  (p: { cx?: number; cy?: number; index?: number }) => {
    const i = p.index ?? 0;
    const val = (j: number) => (data[j] as Record<string, unknown> | undefined)?.[key];
    const has = (j: number) => val(j) !== undefined && val(j) !== null;
    if (!has(i) || has(i - 1) || has(i + 1) || p.cx === undefined || p.cy === undefined) return <g key={i} />;
    return <circle key={i} cx={p.cx} cy={p.cy} r={4} fill={color} stroke={surface} strokeWidth={2} />;
  };

function Frame({ printWidth, children }: { printWidth?: number; height: number; children: ReactElement }) {
  if (printWidth) return children;
  return (
    <ResponsiveContainer width="100%" height="100%">
      {children}
    </ResponsiveContainer>
  );
}
