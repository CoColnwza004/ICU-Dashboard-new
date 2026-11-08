import { FileDown, ImageDown } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Bed, DailyKey, IcuData } from '../types';
import { ACUITY_META, DEVICES, HOSPITAL, STATUS_META, UNIT } from '../lib/constants';
import { daysBetween, fmtDateLong, fmtMonth, parseLocalDateTime, toLocalDateTime } from '../lib/date';
import { DEVICE_ICON, EVENT_ICON } from '../lib/icons';
import { bedsAt, countsFromBeds, findDaily, flowBetween, flowCounts, normalizeBed, occupied, reconcileBeds } from '../lib/logic';
import { fetchShift, type ShiftRow } from '../lib/sheetApi';
import { exportPdf, exportPng } from '../lib/pdf';
import { isNurse, ratioText, realName, SHIFTS, shiftWindow, shiftWindowFor, teamOn, type ShiftKey } from '../lib/roster';
import { fmtStat, STAT_DEFS, statsFor } from '../lib/stats';
import { useStore } from '../lib/store';
import { Button, cx, Modal, Segmented, Switch } from './ui';

/* ------------------------------------------------------------------ */
/* รายงานประจำเวร (8 ชั่วโมง) — เนื้อหาเดียวกับโหมดเต็มจอ บันทึกเป็น PNG / PDF */
/* ------------------------------------------------------------------ */

export type ReportFormat = 'png' | 'pdf';
const REPORT_W = 1100;

/** ตั้งค่าบันทึกอัตโนมัติ (เก็บในเครื่องนี้) */
const AUTO_KEY = 'icu.shiftReport.auto.v1';
const DONE_KEY = 'icu.shiftReport.done.v1';
export const readAuto = (): ReportFormat | 'off' => {
  try {
    const v = localStorage.getItem(AUTO_KEY);
    return v === 'png' || v === 'pdf' ? v : 'off';
  } catch {
    return 'off';
  }
};
const writeAuto = (v: ReportFormat | 'off') => {
  try {
    if (v === 'off') localStorage.removeItem(AUTO_KEY);
    else localStorage.setItem(AUTO_KEY, v);
  } catch {
    /* ไม่เป็นไร */
  }
};

export const reportFilename = (src: Pick<ReportSource, 'date' | 'shift'>, format: ReportFormat) => {
  const name = { M: 'morning', A: 'evening', N: 'night' }[src.shift];
  return `ICU-shift-report-${src.date}-${name}.${format}`;
};

/* ------------------------------------------------------------------ */
/* ที่มาของข้อมูลรายงาน: สด (เวรนี้) · บันทึกรายชั่วโมงจากชีต · ประมาณการย้อนหลัง */
/* ------------------------------------------------------------------ */

export interface ReportSource {
  date: string;
  shift: ShiftKey;
  /** เวลาของข้อมูลเตียง */
  at: Date;
  beds: Bed[];
  devices: Partial<Record<DailyKey, number>>;
  mode: 'live' | 'snapshot' | 'reconstructed';
  /** รวมรายการที่บันทึกย้อนหลังในทะเบียนแล้ว (ปรับจากภาพบันทึกรายชั่วโมง) */
  adjusted?: boolean;
}

/** เวรปัจจุบัน: ใช้ข้อมูลสด */
export const liveSource = (data: IcuData, now = new Date()): ReportSource => {
  const w = shiftWindow(now);
  return { date: w.date, shift: w.def.key, at: now, beds: data.beds, devices: countsFromBeds(data.beds), mode: 'live' };
};

/** เวรที่ผ่านมาแล้ว: ใช้สถานะเตียงที่ชีตบันทึกไว้ (ถ้ามี) ไม่เช่นนั้นย้อนจากทะเบียนรับ-จำหน่าย */
export const pastSource = (data: IcuData, date: string, shift: ShiftKey, snap?: ShiftRow | null): ReportSource => {
  const w = shiftWindowFor(date, shift);
  if (snap?.beds) {
    try {
      const rows = JSON.parse(snap.beds) as Record<string, unknown>[];
      const saved = rows.map(normalizeBed).filter((b) => b.bedNumber);
      if (saved.length) {
        const savedAt = parseLocalDateTime(String(snap.savedAt).replace(' ', 'T')) ?? w.endAt;
        // เติม/แก้ตามทะเบียนจนถึงสิ้นเวร: รับเข้า/จำหน่ายหลังภาพบันทึกชั่วโมงสุดท้าย หรือที่บันทึกย้อนหลังภายหลัง
        const lastMinute = toLocalDateTime(new Date(w.endAt.getTime() - 60_000));
        const { beds, changed } = reconcileBeds(saved, data.logs, lastMinute);
        const daily = changed ? findDaily(data.daily, date) : undefined;
        const devices = daily ? Object.fromEntries(DEVICES.map((d) => [d.dailyKey, daily[d.dailyKey]])) : countsFromBeds(beds);
        return { date, shift, at: changed ? w.endAt : savedAt, beds, devices, mode: 'snapshot', adjusted: changed };
      }
    } catch {
      /* ข้อมูลเสีย → ประมาณการแทน */
    }
  }
  const beds = bedsAt(data, w.end);
  const daily = findDaily(data.daily, date);
  const devices = daily ? Object.fromEntries(DEVICES.map((d) => [d.dailyKey, daily[d.dailyKey]])) : countsFromBeds(beds);
  return { date, shift, at: w.endAt, beds, devices, mode: 'reconstructed' };
};

/** รายงานเป็นโทนสว่างเสมอ (แม้หน้าเว็บจะเป็นโหมดมืด) */
const LIGHT: CSSProperties = {
  ['--color-ink' as string]: '#1d1d1f',
  ['--color-ink-2' as string]: '#48484a',
  ['--color-ink-3' as string]: '#6e6e73',
  ['--color-line' as string]: '#e5e5ea',
  color: '#1d1d1f',
  background: '#ffffff',
  fontFamily: 'var(--font-sans)',
  width: REPORT_W,
};

const BED_COLOR = (b: Bed) =>
  b.status === 'occupied'
    ? { Critical: '#d03b3b', High: '#ec835a', Moderate: '#e0a100', Stable: '#0ca30c', '': '#8e8e93' }[b.acuity]
    : b.status === 'available'
      ? '#0ca30c'
      : '#e0a100';

const FLOW_ROWS = [
  { key: 'admit', label: 'รับใหม่', tone: '#0071e3' },
  { key: 'home', label: 'กลับบ้าน', tone: '#0ca30c' },
  { key: 'ward', label: 'ย้ายวอร์ด', tone: '#6250d6' },
  { key: 'refer', label: 'Refer', tone: '#eb6834' },
  { key: 'expired', label: 'เสียชีวิต', tone: '#48484a' },
] as const;

export function ShiftReport({ src }: { src: ReportSource }) {
  const { data } = useStore();
  const w = shiftWindowFor(src.date, src.shift);
  const beds = src.beds;
  const occ = occupied(beds);
  const free = beds.filter((b) => b.status === 'available').length;
  const cleaning = beds.filter((b) => b.status === 'cleaning').length;
  const vent = occ.filter((b) => b.onVentilator).length;
  const acuity = (['Critical', 'High', 'Moderate', 'Stable'] as const).map((a) => ({ a, n: occ.filter((b) => b.acuity === a).length }));
  const rate = beds.length ? Math.round((occ.length / beds.length) * 100) : 0;
  const shiftFlow = flowBetween(data, w.start, w.end);
  const dayFlow = flowCounts(data, w.date);
  const monthFlow = flowCounts(data, w.date.slice(0, 7));
  const devices = src.devices;
  const st = statsFor(data, w.date.slice(0, 7));
  const team = teamOn(data, w.date, w.def.key);
  const nurses = team.filter(isNurse).length;
  const time =
    src.mode === 'reconstructed'
      ? `${String(w.def.end).padStart(2, '0')}:00`
      : src.at.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const timeLabel = src.mode === 'reconstructed' || src.adjusted ? 'ข้อมูล ณ สิ้นเวร' : src.mode === 'snapshot' ? 'บันทึกจากระบบเมื่อ' : 'ข้อมูล ณ เวลา';

  return (
    <div style={LIGHT} className="px-7 py-5">
      {/* หัวรายงาน */}
      <header className="flex items-end justify-between border-b border-black/15 pb-3">
        <div className="flex items-center gap-4">
          <span className="inline-flex size-12 items-center justify-center rounded-[14px] bg-[#0071e3] text-white">
            <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
              <path d="M5 17h5l2.5-6 4 11 2.5-5H27" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <p className="text-[13px] text-[#6e6e73]">
              {UNIT} · {HOSPITAL}
            </p>
            <h1 className="text-[26px] leading-tight font-semibold tracking-tight">
              รายงานประจำ{w.def.label} · {w.def.time} น.
            </h1>
            <p className="text-[14px] text-[#48484a]">
              {fmtDateLong(w.date)}
              {src.mode === 'reconstructed' && (
                <span className="ml-2 rounded-full bg-[#fff4d6] px-2 py-0.5 text-[11px] font-medium text-[#8a5c00]">
                  ย้อนหลัง · ประมาณการจากทะเบียนรับ-จำหน่าย · อุปกรณ์จากบันทึกรายวัน
                </span>
              )}
              {src.mode === 'snapshot' && (
                <span className="ml-2 rounded-full bg-[#e8f3ff] px-2 py-0.5 text-[11px] font-medium text-[#0059b3]">
                  ย้อนหลัง · จากบันทึกสถานะเตียงรายชั่วโมง{src.adjusted ? ' + ปรับตามทะเบียนรับ-จำหน่ายถึงสิ้นเวร' : ''}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[12px] text-[#6e6e73]">{timeLabel}</p>
          <p className="num text-[30px] leading-none font-semibold">{time}</p>
        </div>
      </header>

      {/* ตัวเลขหลัก */}
      <section className="mt-3 grid grid-cols-5 gap-3">
        <Kpi label={src.mode === 'live' ? 'ผู้ป่วยขณะนี้' : 'ผู้ป่วย'} value={`${occ.length}/${beds.length}`} sub={`ครองเตียง ${rate}%`} />
        <Kpi label="เตียงว่าง" value={free} tone="#0ca30c" sub="พร้อมรับผู้ป่วย" />
        <Kpi label="ทำความสะอาด" value={cleaning} tone={cleaning ? '#b07d00' : undefined} sub="รอเตรียมเตียง" />
        <Kpi label="ใช้เครื่องช่วยหายใจ" value={vent} sub={`${occ.length ? Math.round((vent / occ.length) * 100) : 0}% ของผู้ป่วย`} />
        <Kpi
          label="ระดับวิกฤต (Critical)"
          value={acuity[0].n}
          tone={acuity[0].n ? '#d03b3b' : undefined}
          sub={acuity.map((x) => `${x.a} ${x.n}`).join(' · ')}
        />
      </section>

      <section className="mt-3 grid grid-cols-[1fr_340px] gap-4">
        <div className="space-y-3">
        {/* ผังเตียง */}
        <div className="grid grid-cols-4 content-start gap-2.5">
          {beds.map((b) => {
            const devs = DEVICES.filter((d) => b[d.key]);
            return (
              <div key={b.bedNumber} className="rounded-[14px] border border-black/10 p-3" style={{ boxShadow: `inset 3px 0 0 ${BED_COLOR(b)}` }}>
                <div className="flex items-start justify-between gap-1">
                  <p className="num text-[17px] leading-none font-semibold">{b.bedNumber}</p>
                  <p className="flex items-center gap-1 text-[11px] text-[#48484a]">
                    <span className={cx('inline-block size-2 rounded-full', STATUS_META[b.status].dot)} />
                    {STATUS_META[b.status].label}
                  </p>
                </div>
                {b.status === 'occupied' ? (
                  <>
                    <p className="mt-2 truncate text-[13px] font-medium">{b.caseCode || 'ไม่ระบุรหัสเคส'}</p>
                    <p className="text-[11px] text-[#48484a]">
                      {b.acuity ? `${b.acuity} · ${ACUITY_META[b.acuity].th}` : 'ไม่ระบุระดับ'} · วันที่ {daysBetween(b.admittedAt) + 1}
                    </p>
                    {devs.length > 0 && (
                      <p className="mt-1.5 flex flex-wrap gap-1">
                        {devs.map((d) => (
                          <span key={d.key} className="rounded-full bg-[#f2f2f7] px-1.5 py-0.5 text-[9.5px] font-medium text-[#48484a]">
                            {d.label}
                          </span>
                        ))}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-6 text-[12px] text-[#6e6e73]">{b.status === 'available' ? 'พร้อมรับผู้ป่วยใหม่' : 'รอทำความสะอาด'}</p>
                )}
              </div>
            );
          })}
        </div>
            {/* อุปกรณ์ */}
          <Panel title={src.mode === 'reconstructed' || src.adjusted ? 'อุปกรณ์ · บันทึกรายวัน' : 'อุปกรณ์ · ณ เวลารายงาน'}>
            <div className="grid grid-cols-5 gap-1.5">
              {DEVICES.map((d) => {
                const Icon = DEVICE_ICON[d.key];
                return (
                  <div key={d.key} className="rounded-[10px] bg-[#f5f5f7] px-1.5 py-1.5">
                    <p className="flex items-center gap-0.5 text-[9.5px] whitespace-nowrap text-[#48484a]">
                      <Icon className="size-2.5 shrink-0" strokeWidth={1.8} />
                      {d.label}
                    </p>
                    <p className="num text-[17px] leading-tight font-semibold">{devices[d.dailyKey] ?? 0}</p>
                  </div>
                );
              })}
            </div>
            <p className="num mt-2 text-[10.5px] text-[#6e6e73]">
              {STAT_DEFS.map((s) => `${s.label} ${s.key === 'bor' ? `${Math.round(st.values.bor)}%` : fmtStat(st.values[s.key])}`).join(' · ')} ·{' '}
              {fmtMonth(w.date.slice(0, 7))}
            </p>
          </Panel>

        </div>

        <div className="space-y-3">
          {/* รับ-จำหน่าย */}
          <Panel title="รับ-จำหน่าย">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10.5px] text-[#6e6e73]">
                  <th className="pb-1 text-left font-medium" />
                  <th className="pb-1 text-right font-medium">เวรนี้</th>
                  <th className="pb-1 text-right font-medium">วันนี้</th>
                  <th className="pb-1 text-right font-medium">เดือนนี้</th>
                </tr>
              </thead>
              <tbody>
                {FLOW_ROWS.map((f) => {
                  const Icon = EVENT_ICON[f.key];
                  return (
                    <tr key={f.key} className="border-t border-black/5">
                      <td className="py-1">
                        <span className="inline-flex items-center gap-1.5">
                          <Icon className="size-3.5" style={{ color: f.tone }} strokeWidth={2} />
                          {f.label}
                        </span>
                      </td>
                      <td className="num py-1 text-right text-[15px] font-semibold">{shiftFlow[f.key]}</td>
                      <td className="num py-1 text-right">{dayFlow[f.key]}</td>
                      <td className="num py-1 text-right text-[#6e6e73]">{monthFlow[f.key]}</td>
                    </tr>
                  );
                })}
                <tr className="border-t border-black/15 font-semibold">
                  <td className="py-1">จำหน่ายรวม</td>
                  <td className="num py-1 text-right text-[15px]">{shiftFlow.out}</td>
                  <td className="num py-1 text-right">{dayFlow.out}</td>
                  <td className="num py-1 text-right text-[#6e6e73]">{monthFlow.out}</td>
                </tr>
              </tbody>
            </table>
          </Panel>

          {/* ทีมเวร */}
          <Panel title={`ทีม${w.def.label}`} right={team.length ? `พยาบาล : ผู้ป่วย ${ratioText(nurses, occ.length)}` : undefined}>
            {team.length ? (
              <p className="text-[12px] leading-relaxed">
                {team.map((t, i) => (
                  <span key={`${t.name}-${i}`}>
                    {i > 0 && ' · '}
                    {realName(t.staff?.name ?? t.name)}
                    {t.lead && <span className="text-[#b07d00]"> ★</span>}
                  </span>
                ))}
              </p>
            ) : (
              <p className="text-[12px] text-[#6e6e73]">ยังไม่มีตารางเวรของเวรนี้</p>
            )}
          </Panel>
        </div>
      </section>

      <footer className="mt-3 flex justify-between border-t border-black/10 pt-2 text-[10.5px] text-[#6e6e73]">
        <span>ICU Smart Center · ข้อมูลไม่ระบุตัวตนผู้ป่วย</span>
        <span>
          สร้างเมื่อ {new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })} น. · ★ หัวหน้าเวร
        </span>
      </footer>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub: string; tone?: string }) {
  return (
    <div className="rounded-[14px] bg-[#f5f5f7] px-4 py-2.5">
      <p className="text-[12px] text-[#48484a]">{label}</p>
      <p className="num mt-1 text-[30px] leading-none font-semibold" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      <p className="mt-1 text-[10.5px] leading-snug text-[#6e6e73]">{sub}</p>
    </div>
  );
}

function Panel({ title, right, children }: { title: string; right?: string; children: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-black/10 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[12.5px] font-semibold">{title}</p>
        {right && <p className="num text-[10.5px] text-[#6e6e73]">{right}</p>}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* สร้างไฟล์นอกจอ แล้วดาวน์โหลด                                            */
/* ------------------------------------------------------------------ */

export function ShiftReportExporter({ format, src, onDone }: { format: ReportFormat; src: ReportSource; onDone: (ok: boolean, error?: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const run = async () => {
      await new Promise((r) => window.setTimeout(r, 200));
      try {
        const name = reportFilename(src, format);
        if (format === 'png') await exportPng(ref.current!, name);
        else await exportPdf(ref.current!, name, true, { onePage: true });
        onDone(true);
      } catch (e) {
        console.error(e);
        onDone(false, e instanceof Error ? e.message : String(e));
      }
    };
    void run();
  }, [src, format, onDone]);
  return createPortal(
    <div aria-hidden style={{ position: 'fixed', left: -12000, top: 0, width: REPORT_W, pointerEvents: 'none' }}>
      <div ref={ref}>
        <ShiftReport src={src} />
      </div>
    </div>,
    document.body,
  );
}

/** ย่อรายงานให้พอดีหน้าต่าง (ดูตัวอย่างก่อนดาวน์โหลด) */
function ScaledPreview({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0.5);
  const [h, setH] = useState(360);
  useLayoutEffect(() => {
    const measure = () => {
      if (!box.current || !inner.current) return;
      const kk = box.current.clientWidth / REPORT_W;
      setK(kk);
      setH(inner.current.offsetHeight * kk);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_var(--color-line)]" style={{ height: h }}>
      <div ref={inner} style={{ width: REPORT_W, transform: `scale(${k})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  );
}

/** หน้าต่างดาวน์โหลดรายงานประจำเวร: เลือกวัน/เวร (ย้อนหลังได้) · ดูตัวอย่าง · PNG / PDF · ตั้งบันทึกอัตโนมัติ */
export function ShiftReportDialog({ open, onClose, onWall }: { open: boolean; onClose: () => void; onWall?: boolean }) {
  const { data, toast, config } = useStore();
  const [now, setNow] = useState(() => new Date());
  const current = shiftWindow(now);
  const [date, setDate] = useState(current.date);
  const [shift, setShift] = useState<ShiftKey>(current.def.key);
  const [snap, setSnap] = useState<{ key: string; row: ShiftRow | null | undefined } | null>(null);
  const [job, setJob] = useState<ReportFormat | null>(null);
  const [auto, setAuto] = useState<ReportFormat | 'off'>(readAuto);
  const [autoFmt, setAutoFmt] = useState<ReportFormat>(() => (readAuto() === 'png' ? 'png' : 'pdf'));

  useEffect(() => {
    if (!open) return;
    const n = new Date();
    const w = shiftWindow(n);
    setNow(n);
    setDate(w.date);
    setShift(w.def.key);
    setAuto(readAuto());
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, [open]);

  const w = shiftWindowFor(date, shift);
  const isCurrent = w.key === current.key;
  const isFuture = !isCurrent && w.startAt.getTime() > now.getTime();

  // เวรที่ผ่านมา: ขอสถานะเตียงที่บันทึกไว้จากชีต (ถ้าสคริปต์รองรับ)
  useEffect(() => {
    if (!open || isCurrent || isFuture || !config.url) return;
    if (snap?.key === w.key) return;
    let cancelled = false;
    setSnap({ key: w.key, row: undefined });
    fetchShift(config, w.key)
      .then((row) => !cancelled && setSnap({ key: w.key, row }))
      .catch(() => !cancelled && setSnap({ key: w.key, row: undefined }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, w.key, isCurrent, isFuture, config.url]);

  const src = useMemo<ReportSource | null>(() => {
    if (isFuture) return null;
    if (isCurrent) return liveSource(data, now);
    return pastSource(data, date, shift, snap?.key === w.key ? snap.row : undefined);
  }, [data, now, date, shift, isCurrent, isFuture, snap, w.key]);

  const setAutoMode = (on: boolean, fmt = autoFmt) => {
    const v = on ? fmt : 'off';
    setAuto(v);
    writeAuto(v);
  };
  const today = current.date;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-4xl"
      title="รายงานประจำเวร"
      subtitle={`${w.def.label} ${w.def.time} น. · ${fmtDateLong(date)}${isCurrent ? ' · เวรปัจจุบัน' : ' · ย้อนหลัง'}`}
      footer={
        <>
          <Button variant="secondary" disabled={!!job || !src} onClick={() => setJob('png')}>
            <ImageDown className="size-4" strokeWidth={1.8} />
            {job === 'png' ? 'กำลังสร้าง…' : 'ดาวน์โหลดรูปภาพ (PNG)'}
          </Button>
          <Button variant="primary" disabled={!!job || !src} onClick={() => setJob('pdf')}>
            <FileDown className="size-4" strokeWidth={1.8} />
            {job === 'pdf' ? 'กำลังสร้าง…' : 'ดาวน์โหลด PDF'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* เลือกวันและเวร */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            วันที่
            <input
              type="date"
              className="field h-9 w-auto py-0"
              value={date}
              max={today}
              aria-label="วันที่ของเวร"
              onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)}
            />
          </label>
          <Segmented<ShiftKey>
            size="sm"
            value={shift}
            onChange={setShift}
            label="เลือกเวร"
            options={SHIFTS.map((x) => ({ value: x.key, label: `${x.label.replace('เวร', '')} ${x.time}` }))}
          />
          {!isCurrent && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDate(current.date);
                setShift(current.def.key);
              }}
            >
              กลับไปเวรปัจจุบัน
            </Button>
          )}
        </div>

        {isFuture ? (
          <div className="well px-5 py-10 text-center text-[14px] text-ink-2">ยังไม่ถึงเวรนี้ — เลือกเวรปัจจุบันหรือเวรที่ผ่านมาแล้ว</div>
        ) : (
          src && (
            <>
              <ScaledPreview>
                <ShiftReport src={src} />
              </ScaledPreview>
              {src.mode === 'reconstructed' && (
                <p className="text-[12px] leading-relaxed text-ink-3">
                  {snap?.key === w.key && snap.row === undefined && config.url ? 'กำลังค้นข้อมูลที่บันทึกไว้… · ' : ''}
                  รายงานย้อนหลังนี้ประมาณการสถานะเตียงจากทะเบียนรับ-จำหน่าย และใช้ยอดอุปกรณ์จากบันทึกรายวัน — ถ้าต้องการข้อมูลตรงตามจริง
                  ให้เจ้าของชีตเลือกเมนู <b>ICU Smart Center › เปิดบันทึกสถานะเตียงทุกชั่วโมง</b> (ครั้งเดียว) แล้วเวรถัด ๆ ไปจะมีข้อมูลจริง
                </p>
              )}
            </>
          )
        )}

        <div className="well px-4">
          <Switch
            label="บันทึกอัตโนมัติก่อนจบทุกเวร"
            hint={
              onWall
                ? 'บันทึกเวลา 07:58 · 15:58 · 23:58 ขณะเปิดหน้าจอนี้ค้างไว้'
                : 'ทำงานเมื่อเปิดโหมดเต็มจอค้างไว้ในเครื่องนี้ (บันทึกเวลา 07:58 · 15:58 · 23:58)'
            }
            checked={auto !== 'off'}
            onChange={(v) => setAutoMode(v)}
          />
          {auto !== 'off' && (
            <div className="flex flex-wrap items-center gap-3 pb-3">
              <span className="text-[13px] text-ink-2">รูปแบบไฟล์</span>
              <Segmented<ReportFormat>
                size="sm"
                value={autoFmt}
                onChange={(f) => {
                  setAutoFmt(f);
                  setAutoMode(true, f);
                }}
                options={[
                  { value: 'pdf', label: 'PDF' },
                  { value: 'png', label: 'รูปภาพ PNG' },
                ]}
              />
              <span className="text-[12px] text-ink-3">ครั้งแรกเบราว์เซอร์อาจถามว่าอนุญาตให้ดาวน์โหลดหลายไฟล์หรือไม่ — กด “อนุญาต”</span>
            </div>
          )}
        </div>
      </div>

      {job && src && (
        <ShiftReportExporter
          format={job}
          src={src}
          onDone={(ok, err) => {
            setJob(null);
            if (ok) toast(job === 'png' ? 'บันทึกรูปภาพรายงานแล้ว' : 'บันทึกไฟล์ PDF แล้ว', 'default', reportFilename(src, job));
            else toast('สร้างรายงานไม่สำเร็จ', 'error', err);
          }}
        />
      )}
    </Modal>
  );
}

/** ใช้ในโหมดเต็มจอ: บันทึกรายงานอัตโนมัติ 2 นาทีก่อนจบแต่ละเวร (ถ้าเปิดใช้) */
export function useAutoShiftReport() {
  const [job, setJob] = useState<{ format: ReportFormat; at: Date } | null>(null);
  useEffect(() => {
    const tick = () => {
      const mode = readAuto();
      if (mode === 'off') return;
      const now = new Date();
      const w = shiftWindow(now);
      const minsLeft = (w.endAt.getTime() - now.getTime()) / 60_000;
      if (minsLeft > 2) return;
      try {
        if (localStorage.getItem(DONE_KEY) === w.key) return;
        localStorage.setItem(DONE_KEY, w.key);
      } catch {
        return;
      }
      setJob({ format: mode, at: now });
    };
    tick();
    const t = window.setInterval(tick, 20_000);
    return () => window.clearInterval(t);
  }, []);
  return [job, () => setJob(null)] as const;
}
