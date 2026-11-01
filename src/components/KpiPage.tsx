import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Minus, PencilLine, Plus, Settings2, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Kpi, KpiSource } from '../types';
import {
  autoValue,
  fmtKpi,
  KPI_SOURCES,
  kpiPoint,
  kpiSeries,
  kpiStatus,
  kpiUnitShort,
  nextKpiId,
  saveKpi,
  saveKpiMonth,
  shiftMonth,
  type KpiEntry,
  type KpiPoint,
} from '../lib/content';
import { fmtMonth, todayKey } from '../lib/date';
import { sheetLink } from '../lib/sheetApi';
import { useStore } from '../lib/store';
import { useChartTheme } from './charts';
import { Button, cx, Empty, Modal, Segmented, Switch } from './ui';

const STATUS_UI: Record<KpiPoint['status'], { label: string; cls: string; icon: typeof Check }> = {
  pass: { label: 'ผ่านเป้า', cls: 'bg-good/14 text-good', icon: Check },
  fail: { label: 'ไม่ผ่านเป้า', cls: 'bg-critical/12 text-critical', icon: X },
  none: { label: 'ยังไม่ประเมิน', cls: 'bg-fill text-ink-3', icon: Minus },
};

const STATUS_COLOR = { pass: '#0ca30c', fail: '#d03b3b' } as const;

function StatusPill({ status, k }: { status: KpiPoint['status']; k: Kpi }) {
  const ui = STATUS_UI[status];
  const Icon = ui.icon;
  const label = status === 'none' && k.target === null ? 'ยังไม่ตั้งเป้า' : ui.label;
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', ui.cls)}>
      <Icon className="size-3" strokeWidth={2.6} /> {label}
    </span>
  );
}

const targetText = (k: Kpi) => (k.target === null ? 'ยังไม่ตั้งเป้าหมาย' : `เป้าหมาย ${k.direction} ${fmtKpi(k.target, k)}`);

/** เดือนที่ควรแสดงก่อน: เดือนที่แล้ว (สรุปผลเมื่อสิ้นเดือน) */
const defaultMonth = () => shiftMonth(todayKey().slice(0, 7), -1);

export function KpiPage({ startEntry, onStarted }: { startEntry?: boolean; onStarted?: () => void }) {
  const { data, isStaff, meta } = useStore();
  const [ym, setYm] = useState(defaultMonth);
  const [detail, setDetail] = useState<Kpi | null>(null);
  const [entry, setEntry] = useState(false);
  const [manage, setManage] = useState(false);
  const thisMonth = todayKey().slice(0, 7);

  useEffect(() => {
    if (!startEntry) return;
    if (isStaff) setEntry(true);
    onStarted?.();
  }, [startEntry, isStaff, onStarted]);

  const kpis = data.kpis.filter((k) => k.active);
  const points = useMemo(() => new Map(kpis.map((k) => [k.id, kpiPoint(data, k, ym)])), [data, kpis, ym]);
  const groups = [...new Set(kpis.map((k) => k.group))];
  const pts = [...points.values()];
  const pass = pts.filter((p) => p.status === 'pass').length;
  const fail = pts.filter((p) => p.status === 'fail').length;
  const noData = pts.filter((p) => p.value === null).length;

  return (
    <div className="space-y-8 pt-6 sm:space-y-10 sm:pt-12">
      <section className="animate-rise">
        <p className="eyebrow">Quality KPI</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="display text-[34px] sm:text-[48px]">ตัวชี้วัดคุณภาพ</h1>
            <p className="mt-2 text-[15px] text-ink-2">{kpis.length} ตัวชี้วัด · เทียบผลกับเป้าหมายรายเดือน</p>
          </div>
          {isStaff && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setManage(true)}>
                <Settings2 className="size-4" strokeWidth={1.8} />
                ตั้งค่าตัวชี้วัด
              </Button>
              <Button variant="primary" onClick={() => setEntry(true)}>
                <PencilLine className="size-4" strokeWidth={1.8} />
                กรอกผล KPI
              </Button>
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <button type="button" aria-label="เดือนก่อน" onClick={() => setYm(shiftMonth(ym, -1))} className="btn-glass inline-flex size-10 items-center justify-center rounded-full">
              <ChevronLeft className="size-5" />
            </button>
            <span className="display min-w-[150px] text-center text-[20px]">{fmtMonth(ym)}</span>
            <button
              type="button"
              aria-label="เดือนถัดไป"
              disabled={ym >= thisMonth}
              onClick={() => setYm(shiftMonth(ym, 1))}
              className="btn-glass inline-flex size-10 items-center justify-center rounded-full disabled:opacity-30"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 text-[13px]">
            <Summary n={pass} label="ผ่านเป้า" cls="text-good" />
            <Summary n={fail} label="ไม่ผ่านเป้า" cls="text-critical" />
            <Summary n={noData} label="ยังไม่มีข้อมูล" cls="text-ink-3" />
          </div>
        </div>
      </section>

      {kpis.length === 0 ? (
        <div className="card">
          <Empty title="ยังไม่มีตัวชี้วัด">
            {isStaff ? 'กด “ตั้งค่าตัวชี้วัด” เพื่อเพิ่ม หรือกรอกในแท็บ KPI ของ Google Sheet' : 'เจ้าหน้าที่จะเพิ่มตัวชี้วัดคุณภาพที่นี่'}
          </Empty>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g}>
            <p className="eyebrow mb-3">{g}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {kpis
                .filter((k) => k.group === g)
                .map((k) => (
                  <KpiCard key={k.id} k={k} p={points.get(k.id)!} ym={ym} onOpen={() => setDetail(k)} />
                ))}
            </div>
          </section>
        ))
      )}

      <p className="text-[12px] text-ink-3">
        ค่าที่มีเครื่องหมาย <Sparkles className="inline size-3" /> คำนวณอัตโนมัติจากข้อมูลรายวัน (วันนอน วันใช้เครื่องช่วยหายใจ ฯลฯ) — เจ้าหน้าที่แก้ไขได้ในหน้ากรอกผล
        {isStaff && meta?.spreadsheetUrl && (
          <>
            {' · '}
            <a className="link" href={sheetLink(meta, 'kpiData') ?? '#'} target="_blank" rel="noreferrer">
              เปิดแท็บ KPIData
            </a>
          </>
        )}
      </p>

      <KpiDetail k={detail} ym={ym} onClose={() => setDetail(null)} />
      <KpiEntryModal open={entry} initialYm={ym} onClose={() => setEntry(false)} />
      <KpiManager open={manage} onClose={() => setManage(false)} />
    </div>
  );
}

function Summary({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <span className="glass inline-flex h-10 items-center gap-1.5 rounded-full px-4">
      <span className={cx('num text-[16px] font-semibold', cls)}>{n}</span>
      <span className="text-ink-2">{label}</span>
    </span>
  );
}

function KpiCard({ k, p, ym, onOpen }: { k: Kpi; p: KpiPoint; ym: string; onOpen: () => void }) {
  const { data } = useStore();
  const series = useMemo(() => kpiSeries(data, k, ym, 12), [data, k, ym]);
  return (
    <button type="button" onClick={onOpen} className="card menu-card flex flex-col p-5 text-left">
      <div className="flex items-start justify-between gap-3">
        <p className="line-clamp-2 text-[14px] leading-snug font-semibold">{k.name}</p>
        <StatusPill status={p.status} k={k} />
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="num display text-[36px] leading-none">{fmtKpi(p.value, k)}</span>
        {p.value !== null && <span className="text-[12px] text-ink-3">{kpiUnitShort(k)}</span>}
        {p.auto && <Sparkles className="size-3.5 text-accent" aria-label="คำนวณอัตโนมัติ" />}
      </div>
      <p className="mt-1 text-[12px] text-ink-3">
        {targetText(k)}
        {p.denominator !== null && p.numerator !== null && (
          <span className="num"> · {p.numerator.toLocaleString('th-TH')} / {p.denominator.toLocaleString('th-TH')}</span>
        )}
      </p>
      <div className="mt-auto pt-4">
        <MiniBars k={k} points={series} />
      </div>
    </button>
  );
}

/** แท่งเล็ก 12 เดือน: เขียว = ผ่าน, แดง = ไม่ผ่าน, ฟ้า = ไม่มีเป้า */
function MiniBars({ k, points }: { k: Kpi; points: KpiPoint[] }) {
  const theme = useChartTheme();
  const vals = points.map((p) => p.value);
  const top = Math.max(k.target ?? 0, ...vals.map((v) => v ?? 0)) || 1;
  return (
    <div className="flex h-10 items-end gap-[3px]" role="img" aria-label={`แนวโน้ม 12 เดือน ${k.name}`}>
      {points.map((p) => (
        <span
          key={p.month}
          title={`${fmtMonth(p.month)}: ${fmtKpi(p.value, k)}`}
          className="flex-1 rounded-[3px]"
          style={{
            height: p.value === null ? 3 : `${Math.max(8, (p.value / top) * 100)}%`,
            background: p.value === null ? 'var(--color-fill)' : p.status === 'none' ? theme.series[0] : STATUS_COLOR[p.status],
            opacity: p.value === null ? 1 : 0.9,
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* รายละเอียด KPI                                                        */
/* ------------------------------------------------------------------ */

const shortMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'short' });
};

function KpiDetail({ k, ym, onClose }: { k: Kpi | null; ym: string; onClose: () => void }) {
  const { data, isStaff, meta } = useStore();
  const theme = useChartTheme();
  if (!k) return <Modal open={false} onClose={onClose} title="" children={null} />;
  const series = kpiSeries(data, k, ym, 12);
  const rows = series.map((p) => ({ ...p, label: shortMonth(p.month) }));
  const values = series.map((p) => p.value ?? 0);
  const yMax = Math.max(k.target ?? 0, ...values) * 1.15 || 1;
  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-3xl"
      title={k.name}
      subtitle={`${k.group} · ${k.unit || '—'} · ${targetText(k)}`}
      footer={
        isStaff && meta?.spreadsheetUrl ? (
          <a className="link mr-auto inline-flex items-center gap-0.5 text-[13px]" href={sheetLink(meta, 'kpi', k.row) ?? '#'} target="_blank" rel="noreferrer">
            นิยามในชีต <ArrowUpRight className="size-3.5" />
          </a>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={theme.grid} />
              <XAxis dataKey="label" tick={{ fill: theme.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: theme.grid }} />
              <YAxis domain={[0, yMax]} tick={{ fill: theme.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => fmtKpi(v, k)} />
              <Tooltip
                cursor={{ fill: 'var(--color-fill-soft)' }}
                content={({ active, payload }) => {
                  const p = active && payload?.[0]?.payload as (KpiPoint & { label: string }) | undefined;
                  if (!p) return null;
                  return (
                    <div className="glass glass-strong rounded-2xl px-3 py-2 text-[12px]">
                      <p className="font-semibold">{fmtMonth(p.month)}</p>
                      <p className="num">
                        {fmtKpi(p.value, k)} {p.value !== null && kpiUnitShort(k)}
                      </p>
                    </div>
                  );
                }}
              />
              {k.target !== null && (
                <ReferenceLine
                  y={k.target}
                  stroke={theme.ink}
                  strokeOpacity={0.55}
                  strokeDasharray="5 4"
                  label={{ value: `เป้า ${k.direction} ${fmtKpi(k.target, k)}`, position: 'insideTopRight', fill: theme.axis, fontSize: 11 }}
                />
              )}
              <Bar dataKey="value" radius={[5, 5, 0, 0]} maxBarSize={28} isAnimationActive={false}>
                {rows.map((p) => (
                  <Cell key={p.month} fill={p.status === 'none' ? theme.series[0] : STATUS_COLOR[p.status]} />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <Def label="ตัวตั้ง" value={k.numeratorLabel || '—'} source={k.numeratorSource} />
          <Def label="ตัวหาร" value={k.denominatorLabel || '—'} source={k.denominatorSource} />
        </dl>
        {k.description && <p className="text-[14px] leading-relaxed text-ink-2">{k.description}</p>}
        <p className="text-[12px] text-ink-3">สูตร: (ตัวตั้ง ÷ ตัวหาร) × {k.multiplier.toLocaleString('th-TH')}</p>

        <div className="well overflow-x-auto p-0">
          <table className="w-full min-w-[460px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] text-ink-3">
                <th className="px-4 py-2.5 font-medium">เดือน</th>
                <th className="px-3 py-2.5 text-right font-medium">ตัวตั้ง</th>
                <th className="px-3 py-2.5 text-right font-medium">ตัวหาร</th>
                <th className="px-3 py-2.5 text-right font-medium">ผล</th>
                <th className="px-4 py-2.5 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...series].reverse().map((p) => (
                <tr key={p.month}>
                  <td className="px-4 py-2.5">{fmtMonth(p.month)}</td>
                  <td className="num px-3 py-2.5 text-right">{p.numerator ?? '—'}</td>
                  <td className="num px-3 py-2.5 text-right">{p.denominator ?? '—'}</td>
                  <td className="num px-3 py-2.5 text-right font-semibold">{fmtKpi(p.value, k)}</td>
                  <td className="px-4 py-2.5">
                    <StatusPill status={p.status} k={k} />
                    {p.note && <span className="ml-2 text-[11px] text-ink-3">{p.note}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

function Def({ label, value, source }: { label: string; value: string; source: KpiSource }) {
  return (
    <div className="well px-4 py-3">
      <dt className="text-[11px] text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-[14px] font-medium">{value}</dd>
      <dd className="mt-1 text-[11px] text-ink-3">
        {source === 'กรอกเอง' ? 'กรอกเองทุกเดือน' : (
          <span className="inline-flex items-center gap-1 text-accent">
            <Sparkles className="size-3" /> อัตโนมัติจาก “{source}”
          </span>
        )}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* กรอกผลรายเดือน                                                        */
/* ------------------------------------------------------------------ */

type Draft = Record<string, { n: string; d: string; note: string }>;
const toNum = (s: string) => {
  const t = s.replace(/,/g, '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function KpiEntryModal({ open, initialYm, onClose }: { open: boolean; initialYm: string; onClose: () => void }) {
  const { data, commit } = useStore();
  const [ym, setYm] = useState(initialYm);
  const [draft, setDraft] = useState<Draft>({});
  const kpis = data.kpis.filter((k) => k.active);

  useEffect(() => {
    if (open) setYm(initialYm);
  }, [open, initialYm]);

  // เติมค่าที่บันทึกไว้ หรือค่าคำนวณอัตโนมัติ
  useEffect(() => {
    if (!open) return;
    const next: Draft = {};
    kpis.forEach((k) => {
      const e = data.kpiData.find((x) => x.kpiId === k.id && x.month === ym);
      const n = e?.numerator ?? autoValue(data, k.numeratorSource, ym);
      const d = e?.denominator ?? autoValue(data, k.denominatorSource, ym);
      next[k.id] = { n: n === null ? '' : String(n), d: d === null ? '' : String(d), note: e?.note ?? '' };
    });
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ym]);

  const set = (id: string, f: 'n' | 'd' | 'note', v: string) => setDraft((s) => ({ ...s, [id]: { ...s[id], [f]: v } }));

  const save = () => {
    const entries: KpiEntry[] = kpis
      .map((k) => ({ kpiId: k.id, numerator: toNum(draft[k.id]?.n ?? ''), denominator: toNum(draft[k.id]?.d ?? ''), note: (draft[k.id]?.note ?? '').trim() }))
      .filter((e) => {
        const old = data.kpiData.find((x) => x.kpiId === e.kpiId && x.month === ym);
        return old ? old.numerator !== e.numerator || old.denominator !== e.denominator || old.note !== e.note : e.numerator !== null || e.note;
      });
    if (entries.length) void commit((d) => saveKpiMonth(d, ym, entries), `บันทึกผล KPI ${fmtMonth(ym)} แล้ว`);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-3xl"
      title="กรอกผล KPI"
      subtitle={
        <span className="inline-flex items-center gap-1">
          <button type="button" aria-label="เดือนก่อน" onClick={() => setYm(shiftMonth(ym, -1))} className="inline-flex size-7 items-center justify-center rounded-full hover:bg-fill-soft">
            <ChevronLeft className="size-4" />
          </button>
          <span className="font-medium text-ink">{fmtMonth(ym)}</span>
          <button type="button" aria-label="เดือนถัดไป" onClick={() => setYm(shiftMonth(ym, 1))} className="inline-flex size-7 items-center justify-center rounded-full hover:bg-fill-soft">
            <ChevronRight className="size-4" />
          </button>
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button variant="primary" onClick={save}>
            บันทึก
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {kpis.map((k) => {
          const dr = draft[k.id] ?? { n: '', d: '', note: '' };
          const n = toNum(dr.n);
          const d = toNum(dr.d);
          const v = n !== null && d ? (n / d) * k.multiplier : null;
          return (
            <div key={k.id} className="well p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-[14px] leading-snug font-semibold">{k.name}</p>
                <span className="inline-flex items-center gap-2 text-[12px]">
                  <span className="num font-semibold">
                    {fmtKpi(v, k)} {v !== null && kpiUnitShort(k)}
                  </span>
                  <StatusPill status={kpiStatus(k, v)} k={k} />
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1.2fr]">
                <NumField label={k.numeratorLabel || 'ตัวตั้ง'} value={dr.n} onChange={(x) => set(k.id, 'n', x)} auto={k.numeratorSource !== 'กรอกเอง'} />
                <NumField label={k.denominatorLabel || 'ตัวหาร'} value={dr.d} onChange={(x) => set(k.id, 'd', x)} auto={k.denominatorSource !== 'กรอกเอง'} />
                <label className="block">
                  <span className="mb-1 block truncate text-[11px] text-ink-3">หมายเหตุ</span>
                  <input className="field h-10" value={dr.note} onChange={(e) => set(k.id, 'note', e.target.value)} />
                </label>
              </div>
            </div>
          );
        })}
        <p className="text-[12px] text-ink-3">
          <Sparkles className="inline size-3 text-accent" /> = เติมให้อัตโนมัติจากข้อมูลรายวัน แก้ไขได้ · เว้นว่างตัวตั้งถ้ายังไม่มีข้อมูล
        </p>
      </div>
    </Modal>
  );
}

function NumField({ label, value, onChange, auto }: { label: string; value: string; onChange: (v: string) => void; auto?: boolean }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-center gap-1 truncate text-[11px] text-ink-3" title={label}>
        {auto && <Sparkles className="size-3 shrink-0 text-accent" />}
        <span className="truncate">{label}</span>
      </span>
      <input className="field num h-10" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="—" />
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* ตั้งค่าตัวชี้วัด                                                        */
/* ------------------------------------------------------------------ */

const blankKpi = (id: string, order: number): Kpi => ({
  id,
  name: '',
  group: 'อื่นๆ',
  unit: '%',
  multiplier: 100,
  target: null,
  direction: '≤',
  numeratorLabel: '',
  numeratorSource: 'กรอกเอง',
  denominatorLabel: '',
  denominatorSource: 'กรอกเอง',
  description: '',
  order,
  active: true,
});

function KpiManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useStore();
  const [editing, setEditing] = useState<Kpi | null>(null);
  return (
    <>
      <Modal
        open={open && !editing}
        onClose={onClose}
        width="max-w-2xl"
        title="ตั้งค่าตัวชี้วัด"
        subtitle="ชื่อ เป้าหมาย สูตร และที่มาของข้อมูล"
        footer={
          <Button variant="primary" onClick={() => setEditing(blankKpi(nextKpiId(data.kpis), Math.max(0, ...data.kpis.map((k) => k.order)) + 1))}>
            <Plus className="size-4" /> เพิ่มตัวชี้วัด
          </Button>
        }
      >
        <ul className="divide-y divide-line">
          {data.kpis.map((k) => (
            <li key={k.id}>
              <button type="button" onClick={() => setEditing(k)} className={cx('flex w-full items-center gap-3 py-3 text-left', !k.active && 'opacity-50')}>
                <span className="num w-9 shrink-0 text-[12px] text-ink-3">{k.id}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{k.name}</span>
                  <span className="block truncate text-[12px] text-ink-3">
                    {k.group} · {targetText(k)}
                    {!k.active && ' · ยกเลิกแล้ว'}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-3" />
              </button>
            </li>
          ))}
        </ul>
      </Modal>
      <KpiForm value={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function KpiForm({ value, onClose }: { value: Kpi | null; onClose: () => void }) {
  const { data, commit } = useStore();
  const [f, setF] = useState<Kpi | null>(value);
  const [target, setTarget] = useState('');
  useEffect(() => {
    setF(value);
    setTarget(value?.target === null || value?.target === undefined ? '' : String(value.target));
  }, [value]);
  if (!value || !f) return null;
  const set = <K extends keyof Kpi>(k: K, v: Kpi[K]) => setF((x) => (x ? { ...x, [k]: v } : x));
  const groups = [...new Set(['การติดเชื้อ', 'ความปลอดภัย', 'ผลลัพธ์', 'กระบวนการ', ...data.kpis.map((k) => k.group)])];
  const save = () => {
    if (!f.name.trim()) return;
    const k: Kpi = { ...f, name: f.name.trim(), target: toNum(target) };
    void commit((d) => saveKpi(d, k), `บันทึกตัวชี้วัด ${k.id} แล้ว`);
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-2xl"
      title={data.kpis.some((k) => k.id === f.id) ? 'แก้ไขตัวชี้วัด' : 'เพิ่มตัวชี้วัด'}
      subtitle={`รหัส ${f.id}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button variant="primary" onClick={save} disabled={!f.name.trim()}>
            บันทึก
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="ชื่อตัวชี้วัด *">
          <input className="field" value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="กลุ่ม">
            <input className="field" list="kpi-groups" value={f.group} onChange={(e) => set('group', e.target.value)} />
            <datalist id="kpi-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>
          <Field label="หน่วย">
            <input className="field" value={f.unit} onChange={(e) => set('unit', e.target.value)} placeholder="เช่น % หรือ ครั้ง / 1,000 วันนอน" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="ตัวคูณ">
            <select className="field" value={f.multiplier} onChange={(e) => set('multiplier', Number(e.target.value))}>
              {[1, 100, 1000].map((m) => (
                <option key={m} value={m}>
                  × {m.toLocaleString('th-TH')}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <span className="mb-1.5 block text-[12px] text-ink-2">ทิศทางเป้าหมาย</span>
            <Segmented<Kpi['direction']>
              value={f.direction}
              onChange={(v) => set('direction', v)}
              stretch
              className="flex w-full"
              options={[
                { value: '≤', label: '≤ ไม่เกิน' },
                { value: '≥', label: '≥ อย่างน้อย' },
              ]}
            />
          </div>
          <Field label="เป้าหมาย (เว้นว่างได้)">
            <input className="field num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="—" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ตัวตั้ง (คำอธิบาย)">
            <input className="field" value={f.numeratorLabel} onChange={(e) => set('numeratorLabel', e.target.value)} />
          </Field>
          <Field label="ที่มาตัวตั้ง">
            <select className="field" value={f.numeratorSource} onChange={(e) => set('numeratorSource', e.target.value as KpiSource)}>
              {KPI_SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="ตัวหาร (คำอธิบาย)">
            <input className="field" value={f.denominatorLabel} onChange={(e) => set('denominatorLabel', e.target.value)} />
          </Field>
          <Field label="ที่มาตัวหาร">
            <select className="field" value={f.denominatorSource} onChange={(e) => set('denominatorSource', e.target.value as KpiSource)}>
              {KPI_SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="คำอธิบาย / นิยาม">
          <textarea className="field min-h-20" value={f.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="grid items-end gap-3 sm:grid-cols-[120px_1fr]">
          <Field label="ลำดับ">
            <input className="field num" inputMode="numeric" value={f.order} onChange={(e) => set('order', Number(e.target.value) || 0)} />
          </Field>
          <div className="well px-4">
            <Switch label="ใช้งาน" hint="ปิดเพื่อซ่อนตัวชี้วัดนี้" checked={f.active} onChange={(v) => set('active', v)} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] text-ink-2">{label}</span>
      {children}
    </label>
  );
}
