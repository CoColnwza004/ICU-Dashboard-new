import { Settings2, Sheet as SheetIcon } from 'lucide-react';
import { HOSPITAL } from '../lib/constants';
import { relativeTime } from '../lib/date';
import { useNow, type View } from '../lib/hooks';
import { sheetLink } from '../lib/sheetApi';
import { useStore } from '../lib/store';
import { cx, Dot, IconButton, Segmented } from './ui';

const TABS: { value: View; label: string }[] = [
  { value: 'overview', label: 'ภาพรวม' },
  { value: 'indicators', label: '12 ตัวชี้วัด' },
  { value: 'monthly', label: 'รายเดือน' },
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
      className="inline-flex h-8 items-center gap-2 rounded-full px-3 text-[12px] text-ink-2 transition-colors hover:bg-fill-soft hover:text-ink"
    >
      <Dot className={cx(map.dot, map.pulse && 'animate-pulse-soft')} />
      {!compact && <span className="max-w-[40vw] truncate">{map.text}</span>}
    </button>
  );
}

export function TopBar({ view, onView, onSettings }: { view: View; onView: (v: View) => void; onSettings: () => void }) {
  const { meta } = useStore();
  const link = sheetLink(meta);
  return (
    <header className="glass sticky top-0 z-40 border-b border-line/70">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-3 px-4 sm:px-6">
        <button type="button" onClick={() => onView('overview')} className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex size-7 items-center justify-center rounded-[8px] bg-ink text-on-ink">
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
          <IconButton label="เชื่อมต่อ Google Sheet / ตั้งค่า" onClick={onSettings}>
            <Settings2 className="size-[18px]" strokeWidth={1.6} />
          </IconButton>
        </div>
      </div>
      <div className="px-4 pb-2.5 md:hidden">
        <Segmented options={TABS} value={view} onChange={onView} size="sm" label="เมนูหลัก" stretch className="flex w-full sm:w-auto" />
      </div>
    </header>
  );
}
