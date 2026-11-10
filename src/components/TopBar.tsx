import { INDICATORS } from '../lib/constants';
import {
  Activity,
  CalendarClock,
  CalendarDays,
  Gauge,
  Grip,
  House,
  LayoutGrid,
  LockKeyhole,
  Moon,
  Newspaper,
  Sheet as SheetIcon,
  ShieldCheck,
  Sun,
  SunMoon,
} from 'lucide-react';
import { relativeTime } from '../lib/date';
import { sectionOf, useNow, type Section, type View } from '../lib/hooks';
import { sheetLink } from '../lib/sheetApi';
import { useStore, useSync } from '../lib/store';
import type { ThemePref } from '../lib/theme';
import { cx, Dot, Segmented } from './ui';

export const APP_NAME = 'ICU Smart Center';

/** แท็บล่างบนมือถือ */
const SECTIONS: { value: Section; label: string; icon: typeof Activity; view: View }[] = [
  { value: 'home', label: 'หน้าแรก', icon: House, view: 'home' },
  { value: 'dashboard', label: 'แดชบอร์ด', icon: LayoutGrid, view: 'overview' },
  { value: 'news', label: 'ข่าวสาร', icon: Newspaper, view: 'news' },
  { value: 'roster', label: 'ตารางเวร', icon: CalendarClock, view: 'roster' },
];

/** ลิงก์บนแถบเมนู (แบบเว็บไซต์ Apple) — views = หน้าที่นับว่าอยู่ในเมนูนั้น */
const NAV_LINKS: { label: string; view: View; views: View[] }[] = [
  { label: 'แดชบอร์ด', view: 'overview', views: ['overview', 'indicators', 'stats', 'monthly'] },
  { label: 'ข่าวสาร', view: 'news', views: ['news'] },
  { label: 'ตารางเวร', view: 'roster', views: ['roster'] },
  { label: 'ผังบริหาร', view: 'staff', views: ['staff'] },
  { label: 'Quality KPI', view: 'kpi', views: ['kpi'] },
  { label: 'คู่มือ', view: 'docs', views: ['docs'] },
  { label: 'แนวทางการรักษา', view: 'guidelines', views: ['guidelines'] },
  { label: 'ดาวน์โหลด', view: 'downloads', views: ['downloads'] },
  { label: 'แบบฟอร์ม', view: 'forms', views: ['forms'] },
];

/** เมนูย่อยของแดชบอร์ด */
export const DASHBOARD_TABS: { value: View; label: string; icon: typeof Activity }[] = [
  { value: 'overview', label: 'ภาพรวม', icon: LayoutGrid },
  { value: 'indicators', label: `${INDICATORS.length} ตัวชี้วัด`, icon: Activity },
  { value: 'stats', label: 'สถิติเตียง', icon: Gauge },
  { value: 'monthly', label: 'รายเดือน', icon: CalendarDays },
];

export function DashboardNav({ view, onView }: { view: View; onView: (v: View) => void }) {
  return (
    <div className="flex justify-center pt-6">
      <Segmented options={DASHBOARD_TABS} value={view} onChange={onView} label="เมนูแดชบอร์ด" stretch className="flex w-full sm:inline-flex sm:w-auto" />
    </div>
  );
}

export function SyncBadge({ onClick, compact }: { onClick?: () => void; compact?: boolean }) {
  const { state, lastSync, error } = useSync();
  const now = useNow(1000);
  const map = {
    local: { dot: 'bg-ink-3', text: 'ยังไม่เชื่อมต่อ Google Sheet', pulse: false },
    connecting: { dot: 'bg-accent', text: 'กำลังเชื่อมต่อ…', pulse: true },
    live: { dot: 'bg-good', text: `เรียลไทม์ · ${relativeTime(lastSync, now)}`, pulse: false },
    saving: { dot: 'bg-accent', text: 'กำลังบันทึกลงชีต…', pulse: true },
    offline: { dot: 'bg-warn', text: 'ออฟไลน์ · ใช้ข้อมูลล่าสุด', pulse: false },
    error: { dot: 'bg-critical', text: 'เชื่อมต่อชีตไม่ได้', pulse: false },
  }[state];
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : { role: 'status' })}
      title={error ?? map.text}
      aria-label={map.text}
      className={cx('inline-flex h-9 items-center gap-2 rounded-full px-2.5 text-[12px] opacity-80', onClick && 'hover:opacity-100')}
    >
      <span className="relative inline-flex">
        <Dot className={cx(map.dot, map.pulse && 'animate-pulse-soft')} />
        {state === 'live' && <span className="absolute inset-0 animate-ping rounded-full bg-good/40 [animation-duration:2.4s]" />}
      </span>
      {!compact && <span className="max-w-[34vw] truncate">{map.text}</span>}
    </Tag>
  );
}

const THEME_UI: Record<ThemePref, { icon: typeof Sun; label: string }> = {
  auto: { icon: SunMoon, label: 'ธีม: ตามเครื่อง (แตะเพื่อเปลี่ยนเป็นโหมดสว่าง)' },
  light: { icon: Sun, label: 'ธีม: โหมดสว่าง (แตะเพื่อเปลี่ยนเป็นโหมดมืด)' },
  dark: { icon: Moon, label: 'ธีม: โหมดมืด (แตะเพื่อกลับไปตามเครื่อง)' },
};

/** แถบเมนูบนแบบเว็บไซต์ Apple: เต็มความกว้าง โปร่งแสง ตัวอักษรเล็กเรียงกลาง — ใช้ทุกหน้า */
export function TopBar({
  view,
  onView,
  onSettings,
  onMenu,
  theme,
  onTheme,
}: {
  view: View;
  onView: (v: View) => void;
  onSettings?: () => void;
  onMenu: () => void;
  theme: ThemePref;
  /** ไม่ส่งมา = ซ่อนปุ่มธีม (หน้าแรกเป็นพื้นดำเสมอ) */
  onTheme?: () => void;
}) {
  const { meta, isStaff } = useStore();
  const link = isStaff ? sheetLink(meta) : null;
  const section = sectionOf(view);
  const ThemeIcon = THEME_UI[theme].icon;
  const iconBtn = 'inline-flex size-9 items-center justify-center rounded-full opacity-80 transition-opacity hover:opacity-100';

  return (
    <>
      <header className="apple-nav sticky top-0 z-40">
        <nav aria-label="เมนูหลัก" className="mx-auto flex h-12 max-w-[1024px] items-center justify-between gap-2 px-4 sm:px-6">
          <button type="button" onClick={() => onView('home')} aria-label={`${APP_NAME} หน้าแรก`} className="inline-flex items-center gap-2 opacity-90 hover:opacity-100">
            <svg viewBox="0 0 32 32" className="size-[22px]" aria-hidden>
              <path d="M5 17h5l2.5-6 4 11 2.5-5H27" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[13px] font-semibold tracking-tight lg:hidden">{APP_NAME}</span>
          </button>
          <ul className="hidden flex-1 items-center justify-between px-6 lg:flex xl:px-8">
            {NAV_LINKS.map((l) => {
              const active = l.views.includes(view);
              return (
                <li key={l.view}>
                  <button
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onView(l.view)}
                    className={cx('text-[12px] transition-opacity hover:opacity-100', active ? 'font-semibold opacity-100' : 'opacity-75')}
                  >
                    {l.label}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center">
            {view !== 'home' && <SyncBadge onClick={onSettings} compact />}
            {link && (
              <a href={link} target="_blank" rel="noreferrer" aria-label="เปิด Google Sheet" title="เปิด Google Sheet" className={cx(iconBtn, 'hidden sm:inline-flex')}>
                <SheetIcon className="size-[17px]" strokeWidth={1.7} />
              </a>
            )}
            {onTheme && (
              <button type="button" onClick={onTheme} aria-label={THEME_UI[theme].label} title={THEME_UI[theme].label} className={iconBtn}>
                <ThemeIcon className="size-[17px]" strokeWidth={1.8} />
              </button>
            )}
            <button type="button" onClick={onMenu} aria-label="เมนูทั้งหมด" title="เมนูทั้งหมด" className={cx(iconBtn, section === 'more' && 'opacity-100')}>
              <Grip className="size-[17px]" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onClick={() => onView('admin')}
              aria-label={isStaff ? 'เจ้าหน้าที่ ICU (เข้าสู่ระบบแล้ว)' : 'เข้าสู่ระบบเจ้าหน้าที่'}
              title={isStaff ? 'เจ้าหน้าที่ ICU' : 'เข้าสู่ระบบเจ้าหน้าที่'}
              className={cx(iconBtn, isStaff && 'text-good opacity-100')}
            >
              {isStaff ? <ShieldCheck className="size-[17px]" strokeWidth={1.8} /> : <LockKeyhole className="size-[17px]" strokeWidth={1.6} />}
            </button>
          </div>
        </nav>
      </header>
      <MobileNav section={section} onView={onView} onMenu={onMenu} />
    </>
  );
}

/** แถบแท็บลอยด้านล่างสำหรับมือถือ (แบบ iOS) */
function MobileNav({ section, onView, onMenu }: { section: Section; onView: (v: View) => void; onMenu: () => void }) {
  const items = [
    ...SECTIONS.map((t) => ({ key: t.value, label: t.label, icon: t.icon, active: t.value === section, on: () => onView(t.view) })),
    { key: 'more', label: 'เมนู', icon: Grip, active: section === 'more' || section === 'staff', on: onMenu },
  ];
  return (
    <nav
      aria-label="เมนูหลัก"
      className="glass glass-strong fixed inset-x-0 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 mx-auto flex w-[min(440px,calc(100%-24px))] items-center justify-between rounded-full p-1.5 md:hidden"
    >
      {items.map((t) => {
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
  );
}
