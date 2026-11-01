import {
  Activity,
  CalendarClock,
  CalendarDays,
  Gauge,
  House,
  LayoutGrid,
  LockKeyhole,
  Maximize,
  Newspaper,
  Sheet as SheetIcon,
  ShieldCheck,
  Grip,
  Network,
} from 'lucide-react';
import { enterFullscreen } from './WallView';
import { HOSPITAL } from '../lib/constants';
import { relativeTime } from '../lib/date';
import { sectionOf, useNow, type Section, type View } from '../lib/hooks';
import { sheetLink } from '../lib/sheetApi';
import { useStore } from '../lib/store';
import { cx, Dot, IconButton, Segmented } from './ui';

export const APP_NAME = 'ICU Smart Center';

const SECTIONS: {
  value: Section;
  label: string;
  icon: typeof Activity;
  view: View;
  wide?: boolean;
}[] = [
  { value: 'home', label: 'หน้าแรก', icon: House, view: 'home' },
  { value: 'dashboard', label: 'แดชบอร์ด', icon: LayoutGrid, view: 'overview' },
  { value: 'news', label: 'ข่าวสาร', icon: Newspaper, view: 'news' },
  {
    value: 'roster',
    label: 'ตารางเวร',
    icon: CalendarClock,
    view: 'roster',
    wide: true,
  },
  {
    value: 'staff',
    label: 'ผังบริหาร',
    icon: Network,
    view: 'staff',
    wide: true,
  },
];

/** เมนูย่อยของแดชบอร์ด */
export const DASHBOARD_TABS: {
  value: View;
  label: string;
  icon: typeof Activity;
}[] = [
  { value: 'overview', label: 'ภาพรวม', icon: LayoutGrid },
  { value: 'indicators', label: '12 ตัวชี้วัด', icon: Activity },
  { value: 'stats', label: 'สถิติเตียง', icon: Gauge },
  { value: 'monthly', label: 'รายเดือน', icon: CalendarDays },
];

export function DashboardNav({ view, onView }: { view: View; onView: (v: View) => void }) {
  return (
    <div className="flex justify-center pt-5 sm:justify-start">
      <Segmented
        options={DASHBOARD_TABS}
        value={view}
        onChange={onView}
        label="เมนูแดชบอร์ด"
        stretch
        className="flex w-full sm:inline-flex sm:w-auto"
      />
    </div>
  );
}

export function SyncBadge({ onClick, compact }: { onClick?: () => void; compact?: boolean }) {
  const { state, lastSync, error } = useStore();
  const now = useNow(1000);
  const map = {
    local: {
      dot: 'bg-ink-3',
      text: 'ยังไม่เชื่อมต่อ Google Sheet',
      pulse: false,
    },
    connecting: { dot: 'bg-accent', text: 'กำลังเชื่อมต่อ…', pulse: true },
    live: {
      dot: 'bg-good',
      text: `เรียลไทม์ · ${relativeTime(lastSync, now)}`,
      pulse: false,
    },
    saving: { dot: 'bg-accent', text: 'กำลังบันทึกลงชีต…', pulse: true },
    offline: {
      dot: 'bg-warn',
      text: 'ออฟไลน์ · ใช้ข้อมูลล่าสุด',
      pulse: false,
    },
    error: { dot: 'bg-critical', text: 'เชื่อมต่อชีตไม่ได้', pulse: false },
  }[state];
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : { role: 'status' })}
      title={error ?? map.text}
      aria-label={map.text}
      className={cx(
        'inline-flex h-9 items-center gap-2 rounded-full px-3 text-[12px] text-ink-2 transition-colors',
        onClick && 'hover:bg-fill-soft hover:text-ink',
      )}
    >
      <span className="relative inline-flex">
        <Dot className={cx(map.dot, map.pulse && 'animate-pulse-soft')} />
        {state === 'live' && <span className="absolute inset-0 animate-ping rounded-full bg-good/40 [animation-duration:2.4s]" />}
      </span>
      {!compact && <span className="max-w-[34vw] truncate">{map.text}</span>}
    </Tag>
  );
}

export function TopBar({
  view,
  onView,
  onSettings,
  onMenu,
  apple,
}: {
  view: View;
  onView: (v: View) => void;
  onSettings?: () => void;
  onMenu: () => void;
  /** หน้าแรก: แถบเมนูแบบเว็บไซต์ Apple (เต็มความกว้าง พื้นดำโปร่ง ตัวอักษรเล็ก) */
  apple?: boolean;
}) {
  const { meta, isStaff } = useStore();
  const link = isStaff ? sheetLink(meta) : null;
  const section = sectionOf(view);
  const staffBtn = (
    <button
      type="button"
      onClick={() => onView('admin')}
      aria-label={isStaff ? 'เจ้าหน้าที่ ICU (เข้าสู่ระบบแล้ว)' : 'เข้าสู่ระบบเจ้าหน้าที่'}
      title={isStaff ? 'เจ้าหน้าที่ ICU' : 'เข้าสู่ระบบเจ้าหน้าที่'}
      className={cx(
        'inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium transition-colors',
        isStaff ? 'bg-good/14 text-good hover:bg-good/20' : 'text-ink-2 hover:bg-fill-soft hover:text-ink',
      )}
    >
      {isStaff ? <ShieldCheck className="size-[18px]" strokeWidth={1.8} /> : <LockKeyhole className="size-[18px]" strokeWidth={1.6} />}
      <span className="hidden lg:inline">{isStaff ? 'เจ้าหน้าที่' : 'เจ้าหน้าที่'}</span>
    </button>
  );
  const mobileNav = <MobileNav section={section} onView={onView} onMenu={onMenu} />;

  if (apple) {
    const links: { label: string; view: View }[] = [
      { label: 'แดชบอร์ด', view: 'overview' },
      { label: 'ข่าวสาร', view: 'news' },
      { label: 'ตารางเวร', view: 'roster' },
      { label: 'ผังบริหาร', view: 'staff' },
      { label: 'Quality KPI', view: 'kpi' },
      { label: 'คู่มือ', view: 'docs' },
      { label: 'แนวทางการรักษา', view: 'guidelines' },
      { label: 'ดาวน์โหลด', view: 'downloads' },
      { label: 'แบบฟอร์ม', view: 'forms' },
    ];
    return (
      <>
        <header className="apple-nav sticky top-0 z-40 text-[#e8e8ed]">
          <nav aria-label="เมนูหลัก" className="mx-auto flex h-12 max-w-[1024px] items-center justify-between gap-2 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => onView('home')}
              aria-label={`${APP_NAME} หน้าแรก`}
              className="inline-flex items-center gap-2 opacity-90 hover:opacity-100"
            >
              <svg viewBox="0 0 32 32" className="size-[22px]" aria-hidden>
                <path
                  d="M5 17h5l2.5-6 4 11 2.5-5H27"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-[13px] font-semibold tracking-tight lg:hidden">{APP_NAME}</span>
            </button>
            <ul className="hidden flex-1 items-center justify-between px-6 lg:flex xl:px-10">
              {links.map((l) => (
                <li key={l.view}>
                  <button
                    type="button"
                    onClick={() => onView(l.view)}
                    className="text-[12px] text-[#e8e8ed]/80 transition-colors hover:text-white"
                  >
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onMenu}
                aria-label="เมนูทั้งหมด"
                className="inline-flex size-9 items-center justify-center rounded-full text-[#e8e8ed]/80 hover:text-white"
              >
                <Grip className="size-[17px]" strokeWidth={1.8} />
              </button>
              <button
                type="button"
                onClick={() => onView('admin')}
                aria-label={isStaff ? 'เจ้าหน้าที่ ICU (เข้าสู่ระบบแล้ว)' : 'เข้าสู่ระบบเจ้าหน้าที่'}
                className={cx(
                  'inline-flex size-9 items-center justify-center rounded-full',
                  isStaff ? 'text-[#30d158]' : 'text-[#e8e8ed]/80 hover:text-white',
                )}
              >
                {isStaff ? (
                  <ShieldCheck className="size-[17px]" strokeWidth={1.8} />
                ) : (
                  <LockKeyhole className="size-[17px]" strokeWidth={1.6} />
                )}
              </button>
            </div>
          </nav>
        </header>
        {mobileNav}
      </>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6">
        <div className="glass glass-strong mx-auto flex h-[58px] max-w-[1120px] items-center justify-between gap-3 rounded-full pr-2 pl-2.5">
          <button type="button" onClick={() => onView('home')} className="flex min-w-0 items-center gap-2.5 rounded-full pr-2">
            <span className="btn-ink inline-flex size-9 shrink-0 items-center justify-center rounded-full">
              <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
                <path
                  d="M5 17h5l2.5-6 4 11 2.5-5H27"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[15px] font-semibold tracking-tight">{APP_NAME}</span>
              <span className="block truncate text-[11px] text-ink-3">{HOSPITAL}</span>
            </span>
          </button>

          <div className="hidden md:block lg:hidden">
            <Segmented
              options={SECTIONS.filter((x) => !x.wide)}
              value={section}
              onChange={(s) => onView(SECTIONS.find((x) => x.value === s)!.view)}
              label="เมนูหลัก"
            />
          </div>
          <div className="hidden lg:block">
            <Segmented
              options={SECTIONS}
              value={section}
              onChange={(s) => onView(SECTIONS.find((x) => x.value === s)!.view)}
              label="เมนูหลัก"
            />
          </div>

          <div className="flex items-center gap-0.5">
            <div className="hidden sm:block">
              <SyncBadge onClick={onSettings} compact />
            </div>
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                aria-label="เปิด Google Sheet"
                title="เปิด Google Sheet"
                className="hidden size-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-fill-soft hover:text-ink sm:inline-flex"
              >
                <SheetIcon className="size-[18px]" strokeWidth={1.6} />
              </a>
            )}
            <IconButton
              label="โหมดเต็มจอ (จอแสดงผล)"
              className="hidden sm:inline-flex"
              onClick={() => {
                void enterFullscreen();
                onView('wall');
              }}
            >
              <Maximize className="size-[18px]" strokeWidth={1.6} />
            </IconButton>
            <IconButton label="เมนูทั้งหมด" onClick={onMenu} className={cx(section === 'more' && 'bg-fill-soft text-ink')}>
              <Grip className="size-[18px]" strokeWidth={1.8} />
            </IconButton>
            {staffBtn}
          </div>
        </div>
      </header>

      {mobileNav}
    </>
  );
}

/** แถบแท็บลอยด้านล่างสำหรับมือถือ (แบบ iOS) */
function MobileNav({ section, onView, onMenu }: { section: Section; onView: (v: View) => void; onMenu: () => void }) {
  return (
    <>
      <nav
        aria-label="เมนูหลัก"
        className="glass glass-strong fixed inset-x-0 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 mx-auto flex w-[min(440px,calc(100%-24px))] items-center justify-between rounded-full p-1.5 md:hidden"
      >
        {[
          ...SECTIONS.slice(0, 4).map((t) => ({
            key: t.value,
            label: t.label,
            icon: t.icon,
            active: t.value === section,
            on: () => onView(t.view),
          })),
          {
            key: 'more',
            label: 'เมนู',
            icon: Grip,
            active: section === 'more',
            on: onMenu,
          },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              aria-current={t.active ? 'page' : undefined}
              onClick={t.on}
              className={cx(
                'flex h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all duration-300 ease-[var(--ease-liquid)]',
                t.active ? 'seg-thumb text-accent' : 'text-ink-2 active:scale-95',
              )}
            >
              <Icon className="size-5" strokeWidth={t.active ? 2 : 1.6} />
              {t.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}
