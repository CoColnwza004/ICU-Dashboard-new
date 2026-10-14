import { Maximize, Minimize, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Bed } from '../types';
import { ACUITY_META, DEVICES, EVENT_META, HOSPITAL, INDICATORS, STATUS_META, UNIT } from '../lib/constants';
import { daysBetween, fmtDateLong, fmtDateTime, fmtMonth, todayKey } from '../lib/date';
import { DEVICE_ICON, EVENT_ICON, INDICATOR_ICON } from '../lib/icons';
import { countsFromBeds, emptyDaily, findDaily, occupied } from '../lib/logic';
import { fmtStat, STAT_DEFS, statsFor } from '../lib/stats';
import { useNow } from '../lib/hooks';
import { useStore } from '../lib/store';
import { SyncBadge } from './TopBar';
import { cx, Dot } from './ui';
import { AcuityBar, Ring } from './viz';

type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

const fsElement = () => document.fullscreenElement ?? (document as FsDoc).webkitFullscreenElement ?? null;
const canFullscreen = () => {
  const el = document.documentElement as FsEl;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
};
export const enterFullscreen = async () => {
  const el = document.documentElement as FsEl;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
  } catch {
    /* เบราว์เซอร์ไม่อนุญาต (เช่น iPhone) — ยังแสดงโหมดจอแสดงผลได้ตามปกติ */
  }
};
const exitFullscreen = async () => {
  const d = document as FsDoc;
  try {
    if (document.exitFullscreen && document.fullscreenElement) await document.exitFullscreen();
    else if (d.webkitExitFullscreen && d.webkitFullscreenElement) await d.webkitExitFullscreen();
  } catch {
    /* ignore */
  }
};

/** กันหน้าจอดับระหว่างเปิดค้างไว้ (ทีวี / แท็บเล็ตที่เคาน์เตอร์พยาบาล) */
const useWakeLock = () => {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } };
    let lock: Sentinel | null = null;
    const acquire = async () => {
      try {
        if (document.visibilityState === 'visible') lock = (await nav.wakeLock?.request('screen')) ?? null;
      } catch {
        lock = null;
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => {});
    };
  }, []);
};

/** ซ่อนปุ่มควบคุมและเคอร์เซอร์เมื่อไม่ได้ขยับเมาส์ / แตะจอ */
const useIdle = (ms = 3500) => {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t = window.setTimeout(() => setIdle(true), ms);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(t);
      t = window.setTimeout(() => setIdle(true), ms);
    };
    const evs = ['mousemove', 'pointerdown', 'keydown', 'touchstart'] as const;
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      window.clearTimeout(t);
      evs.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [ms]);
  return idle;
};

export function WallView({ onExit }: { onExit: () => void }) {
  const { data } = useStore();
  const now = useNow(1000);
  const idle = useIdle();
  const [isFs, setIsFs] = useState(() => !!fsElement());
  const [vmin, setVmin] = useState(() => Math.min(window.innerWidth, window.innerHeight));
  useEffect(() => {
    const on = () => setVmin(Math.min(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const supported = useMemo(canFullscreen, []);
  useWakeLock();

  useEffect(() => {
    const on = () => setIsFs(!!fsElement());
    document.addEventListener('fullscreenchange', on);
    document.addEventListener('webkitfullscreenchange', on);
    return () => {
      document.removeEventListener('fullscreenchange', on);
      document.removeEventListener('webkitfullscreenchange', on);
    };
  }, []);

  const exit = useCallback(() => {
    void exitFullscreen();
    onExit();
  }, [onExit]);

  // Esc ครั้งแรกออกจากเต็มจอของเบราว์เซอร์ ครั้งถัดไปออกจากโหมดนี้
  const fsRef = useRef(isFs);
  fsRef.current = isFs;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !fsRef.current) exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exit]);

  const today = todayKey();
  const ym = today.slice(0, 7);
  const beds = data.beds;
  const occ = occupied(beds);
  const total = beds.length;
  const rate = total ? Math.round((occ.length / total) * 100) : 0;
  const free = beds.filter((b) => b.status === 'available').length;
  const cleaning = beds.filter((b) => b.status === 'cleaning').length;
  const vent = occ.filter((b) => b.onVentilator).length;
  const critical = occ.filter((b) => b.acuity === 'Critical').length;
  const todayRec = findDaily(data.daily, today) ?? { ...emptyDaily(today), ...countsFromBeds(beds) };
  const st = statsFor(data, ym);
  const recent = useMemo(
    () => [...data.logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 4),
    [data.logs],
  );
  const d = new Date(now);
  const clock = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const secs = String(d.getSeconds()).padStart(2, '0');
  // จอเล็ก (มือถือ / แท็บเล็ตแนวตั้ง) เลื่อนดูได้ · จอใหญ่ (ทีวี / คอม) พอดีหน้าจอเดียว
  const cols = total <= 4 ? 'grid-cols-2' : total <= 6 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4';

  return (
    <div
      className={cx(
        'fixed inset-0 z-50 flex flex-col gap-[1.2vmin] overflow-y-auto p-[1.6vmin] lg:overflow-hidden',
        idle && 'cursor-none',
      )}
      role="region"
      aria-label="โหมดจอแสดงผลเต็มจอ"
    >
      <div className="ambient" aria-hidden />

      {/* Header */}
      <header className="glass glass-strong flex shrink-0 items-center justify-between gap-4 rounded-[2.2vmin] px-[2vmin] py-[1.2vmin]">
        <div className="flex min-w-0 items-center gap-[1.4vmin]">
          <span className="btn-ink inline-flex size-[clamp(36px,5vmin,64px)] shrink-0 items-center justify-center rounded-full">
            <svg viewBox="0 0 32 32" className="size-[60%]" aria-hidden>
              <path d="M5 17h5l2.5-6 4 11 2.5-5H27" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="display truncate text-[clamp(18px,2.6vmin,40px)]">{UNIT}</p>
            <p className="truncate text-[clamp(12px,1.5vmin,22px)] text-ink-2">
              {HOSPITAL} · {fmtDateLong(today)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-[1.4vmin]">
          <div className="hidden sm:block">
            <SyncBadge onClick={() => {}} />
          </div>
          <p className="num text-[clamp(28px,5vmin,84px)] leading-none font-semibold">
            {clock}
            <span className="ml-1 text-[0.45em] text-ink-3">{secs}</span>
          </p>
        </div>
      </header>

      {/* KPI row */}
      <section className="grid shrink-0 grid-cols-2 gap-[1.2vmin] md:grid-cols-5">
        <Kpi label="ผู้ป่วยขณะนี้" className="col-span-2 md:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <p>
              <Big>{occ.length}</Big>
              <span className="num ml-1 text-[clamp(16px,2.4vmin,36px)] text-ink-3">/ {total}</span>
            </p>
            <Ring value={rate} size={Math.round(vmin * 0.085) + 20} label="อัตราครองเตียง" />
          </div>
        </Kpi>
        <Kpi label="เตียงว่าง">
          <Big>{free}</Big>
          <Sub>พร้อมรับผู้ป่วย</Sub>
        </Kpi>
        <Kpi label="ทำความสะอาด">
          <Big>{cleaning}</Big>
          <Sub>รอเตรียมเตียง</Sub>
        </Kpi>
        <Kpi label="ใช้เครื่องช่วยหายใจ">
          <Big>{vent}</Big>
          <Sub>{occ.length ? Math.round((vent / occ.length) * 100) : 0}% ของผู้ป่วย</Sub>
        </Kpi>
        <Kpi label="ระดับวิกฤต (Critical)">
          <Big>{critical}</Big>
          <div className="mt-[0.8vmin] [&_li]:text-[clamp(10px,1.2vmin,16px)]">
            <AcuityBar beds={beds} />
          </div>
        </Kpi>
      </section>

      {/* Main */}
      <section className="grid shrink-0 gap-[1.2vmin] lg:min-h-0 lg:flex-1 lg:shrink lg:grid-cols-[1fr_minmax(300px,30%)]">
        <div className={cx('grid gap-[1.2vmin] lg:min-h-0 lg:auto-rows-fr', cols)}>
          {beds.map((b) => (
            <WallBed key={b.bedNumber} bed={b} />
          ))}
        </div>

        <div className="flex flex-col gap-[1.2vmin] pb-16 lg:min-h-0 lg:pb-0">
          {/* 12 indicators */}
          <div className="card flex flex-col p-[1.8vmin]">
            <PanelTitle>12 ตัวชี้วัด · วันนี้</PanelTitle>
            <div className="grid grid-cols-3 gap-[0.8vmin]">
              {INDICATORS.map((i) => {
                const Icon = INDICATOR_ICON[i.key];
                return (
                  <div key={i.key} className="well min-w-0 px-[1vmin] py-[0.7vmin]">
                    <p className="flex items-center gap-1 truncate text-[clamp(10px,1.2vmin,16px)] text-ink-2">
                      <Icon className="size-[1.2em] shrink-0 text-ink-3" strokeWidth={1.8} />
                      {i.label}
                    </p>
                    <p className="num text-[clamp(18px,2.8vmin,40px)] leading-tight font-semibold">{todayRec[i.key]}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bed stats */}
          <div className="card p-[1.8vmin]">
            <PanelTitle>สถิติเตียง · {fmtMonth(ym)}</PanelTitle>
            <div className="grid grid-cols-5 gap-[0.8vmin]">
              {STAT_DEFS.map((s) => (
                <div key={s.key} className="well min-w-0 px-[0.8vmin] py-[0.7vmin] text-center">
                  <p className="text-[clamp(10px,1.2vmin,16px)] font-semibold text-ink-2">{s.label}</p>
                  <p className="num truncate text-[clamp(14px,2.1vmin,30px)] leading-tight font-semibold">
                    {s.key === 'bor' ? Math.round(st.values.bor) : fmtStat(st.values[s.key])}
                  </p>
                  <p className="truncate text-[clamp(9px,1vmin,14px)] text-ink-3">{s.unit}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent */}
          <div className="card flex flex-col overflow-hidden p-[1.8vmin] lg:min-h-0 lg:flex-1">
            <PanelTitle>ความเคลื่อนไหวล่าสุด</PanelTitle>
            {recent.length === 0 ? (
              <p className="text-[clamp(12px,1.4vmin,18px)] text-ink-3">ยังไม่มีรายการ</p>
            ) : (
              <ol className="min-h-0 space-y-[0.9vmin] overflow-hidden">
                {recent.map((l, i) => {
                  const Icon = EVENT_ICON[l.event];
                  return (
                    <li key={`${l.timestamp}-${i}`} className="flex items-center gap-[1vmin]">
                      <span className={cx('icon-chip size-[clamp(26px,3.4vmin,46px)] shrink-0 rounded-full', l.event === 'admit' && 'text-accent')}>
                        <Icon className="size-[50%]" strokeWidth={1.8} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[clamp(12px,1.5vmin,20px)]">
                          {EVENT_META[l.event].label} <span className="num text-ink-2">· {l.bedNumber}</span>
                        </p>
                        <p className="truncate text-[clamp(10px,1.2vmin,16px)] text-ink-3">{fmtDateTime(l.timestamp)}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </section>

      {/* Floating controls (fade out when idle) */}
      <div
        className={cx(
          'fixed right-[2vmin] bottom-[2vmin] z-10 flex gap-2 transition-opacity duration-500',
          idle ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
      >
        {supported && (
          <button
            type="button"
            onClick={() => void (isFs ? exitFullscreen() : enterFullscreen())}
            className="btn-glass inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-medium"
          >
            {isFs ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            {isFs ? 'ย่อหน้าจอ' : 'เต็มจอ'}
          </button>
        )}
        <button
          type="button"
          onClick={exit}
          className="btn-ink inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-medium"
        >
          <X className="size-4" />
          ออกจากโหมดนี้
        </button>
      </div>
    </div>
  );
}

function Kpi({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('card flex flex-col p-[1.8vmin]', className)}>
      <p className="mb-[0.6vmin] text-[clamp(12px,1.5vmin,20px)] font-medium text-ink-2">{label}</p>
      {children}
    </div>
  );
}

const Big = ({ children }: { children: ReactNode }) => (
  <span className="num text-[clamp(34px,6vmin,96px)] leading-none font-semibold">{children}</span>
);
const Sub = ({ children }: { children: ReactNode }) => (
  <p className="mt-[0.6vmin] text-[clamp(11px,1.3vmin,18px)] text-ink-3">{children}</p>
);
const PanelTitle = ({ children }: { children: ReactNode }) => (
  <p className="mb-[1vmin] text-[clamp(12px,1.5vmin,20px)] font-semibold text-ink-2">{children}</p>
);

function WallBed({ bed }: { bed: Bed }) {
  const occupiedBed = bed.status === 'occupied';
  const devices = DEVICES.filter((d) => bed[d.key]);
  const halo = occupiedBed
    ? { Critical: '#d03b3b', High: '#ec835a', Moderate: '#fab219', Stable: '#0ca30c', '': '#8e8e93' }[bed.acuity]
    : bed.status === 'available'
      ? '#0ca30c'
      : '#fab219';
  return (
    <article className="card flex min-h-[150px] flex-col overflow-hidden p-[1.6vmin]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[30%] -right-[20%] -z-10 aspect-square w-[80%] rounded-full opacity-25 blur-2xl"
        style={{ background: `radial-gradient(circle, ${halo} 0%, transparent 70%)` }}
      />
      <div className="flex items-start justify-between gap-2">
        <p className="num text-[clamp(18px,2.8vmin,40px)] leading-none font-semibold">{bed.bedNumber}</p>
        <p className="flex items-center gap-1.5 text-[clamp(11px,1.3vmin,18px)] text-ink-2">
          <Dot className={cx('size-[0.7em]', STATUS_META[bed.status].dot)} />
          {STATUS_META[bed.status].label}
        </p>
      </div>
      {occupiedBed ? (
        <div className="mt-[1vmin] flex min-h-0 flex-1 flex-col">
          <p className="truncate text-[clamp(13px,1.7vmin,24px)] font-medium">{bed.caseCode || 'ไม่ระบุรหัสเคส'}</p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-[clamp(11px,1.4vmin,19px)] text-ink-2">
            {bed.acuity && (
              <>
                <Dot className={cx('size-[0.6em]', ACUITY_META[bed.acuity].dot)} />
                {bed.acuity}
              </>
            )}
            <span className="text-ink-3">· วันที่ {daysBetween(bed.admittedAt) + 1}</span>
          </p>
          <ul className="mt-auto flex flex-wrap gap-[0.5vmin] pt-[0.8vmin]">
            {devices.map((dv) => {
              const Icon = DEVICE_ICON[dv.key];
              return (
                <li key={dv.key} className="well inline-flex items-center gap-1 rounded-full px-[0.8vmin] py-[0.3vmin] text-[clamp(9px,1.1vmin,15px)] font-medium text-ink-2">
                  <Icon className="size-[1.1em] text-ink-3" strokeWidth={2} />
                  {dv.label}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-auto text-[clamp(12px,1.5vmin,20px)] text-ink-3">
          {bed.status === 'available' ? 'พร้อมรับผู้ป่วยใหม่' : 'รอทำความสะอาด'}
        </p>
      )}
    </article>
  );
}
