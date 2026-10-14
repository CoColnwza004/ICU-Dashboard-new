import { Activity, CalendarDays, Gauge, LayoutGrid, Maximize, Settings2, Sheet as SheetIcon } from 'lucide-react';
import { enterFullscreen } from './WallView';
import { HOSPITAL } from '../lib/constants';
import { relativeTime } from '../lib/date';
import { useNow, type View } from '../lib/hooks';
import { sheetLink } from '../lib/sheetApi';
import { useStore } from '../lib/store';
import { cx, Dot, IconButton, Segmented } from './ui';

const TABS: { value: Exclude<View, 'wall'>; label: string; icon: typeof Activity }[] = [
  { value: 'overview', label: 'ภาพรวม', icon: LayoutGrid },
  { value: 'indicators', label: '12 ตัวชี้วัด', icon: Activity },
  { value: 'stats', label: 'สถิติเตียง', icon: Gauge },
  { value: 'monthly', label: 'รายเดือน', icon: CalendarDays },
];

export function SyncBadge({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  const { state, lastSync, error } = useStore();
  const now = useNow(1000);
  const map = {
    local: { dot: 'bg-ink-3', text: 'ยังไม่เชื่อมต่อ Google Sheet', pulse: false },
    connecting: { dot: 'bg-accent', text: 'กำลังเชื่อมต่อ…', pulse: true },
    live: { dot: 'bg-good', text: `เรียลไทม์ · ${relativeTime(lastSync, now)}`, pulse: false },
    saving: { dot: 'bg-accent', text: 'กำลังบันทึกลงชีต…', pulse: true },
    offline: { dot: 'bg-warn', text: 'ออฟไลน์ · ใช้ข้อมูลล่าสุด', pulse: false },
    error: { dot: 'bg-critical', text: 'เชื่อมต่อชีตไม่ได้', pulse: false },
  }[state];
  return (
    <button
      type="button"
      onClick={onClick}
      title={error ?? map.text}
      aria-label={map.text}
      className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-[12px] text-ink-2 transition-colors hover:bg-fill-soft hover:text-ink"
    >
      <span className="relative inline-flex">
        <Dot className={cx(map.dot, map.pulse && 'animate-pulse-soft')} />
        {state === 'live' && <span className="absolute inset-0 animate-ping rounded-full bg-good/40 [animation-duration:2.4s]" />}
      </span>
      {!compact && <span className="max-w-[34vw] truncate">{map.text}</span>}
    </button>
  );
}

export function TopBar({ view, onView, onSettings }: { view: View; onView: (v: View) => void; onSettings: () => void }) {
  const { meta } = useStore();
  const link = sheetLink(meta);
  return (
    <>
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6">
        <div className="glass glass-strong mx-auto flex h-[58px] max-w-[1120px] items-center justify-between gap-3 rounded-full pr-2 pl-2.5">
          <button type="button" onClick={() => onView('overview')} className="flex min-w-0 items-center gap-2.5 rounded-full pr-2">
            <span className="btn-ink inline-flex size-9 shrink-0 items-center justify-center rounded-full">
              <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
                <path d="M5 17h5l2.5-6 4 11 2.5-5H27" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="truncate text-[15px] font-semibold tracking-tight">
              ICU <span className="font-normal text-ink-2">· {HOSPITAL}</span>
            </span>
          </button>

          <div className="hidden md:block">
            <Segmented options={TABS} value={view} onChange={onView} label="เมนูหลัก" />
          </div>

          <div className="flex items-center gap-0.5">
            <div className="hidden sm:block">
              <SyncBadge onClick={onSettings} />
            </div>
            <div className="sm:hidden">
              <SyncBadge onClick={onSettings} compact />
            </div>
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                aria-label="เปิด Google Sheet"
                title="เปิด Google Sheet"
                className="inline-flex size-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-fill-soft hover:text-ink"
              >
                <SheetIcon className="size-[18px]" strokeWidth={1.6} />
              </a>
            )}
            <IconButton
              label="โหมดเต็มจอ (จอแสดงผล)"
              onClick={() => {
                void enterFullscreen();
                onView('wall');
              }}
            >
              <Maximize className="size-[18px]" strokeWidth={1.6} />
            </IconButton>
            <IconButton label="เชื่อมต่อ Google Sheet / ตั้งค่า" onClick={onSettings}>
              <Settings2 className="size-[18px]" strokeWidth={1.6} />
            </IconButton>
          </div>
        </div>
      </header>

      {/* แถบแท็บลอยด้านล่างสำหรับมือถือ (แบบ iOS) */}
      <nav
        aria-label="เมนูหลัก"
        className="glass glass-strong fixed inset-x-0 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 mx-auto flex w-[min(420px,calc(100%-24px))] items-center justify-between rounded-full p-1.5 md:hidden"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.value === view;
          return (
            <button
              key={t.value}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onView(t.value)}
              className={cx(
                'flex h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10.5px] font-medium whitespace-nowrap transition-all duration-300 ease-[var(--ease-liquid)]',
                active ? 'seg-thumb text-accent' : 'text-ink-2 active:scale-95',
              )}
            >
              <Icon className="size-5" strokeWidth={active ? 2 : 1.6} />
              {t.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}
