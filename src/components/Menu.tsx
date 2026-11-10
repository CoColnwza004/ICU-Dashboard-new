import { INDICATORS } from '../lib/constants';
import {
  Activity,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Download,
  Gauge,
  LayoutGrid,
  LockKeyhole,
  Maximize,
  Network,
  Newspaper,
  ShieldCheck,
  Stethoscope,
  Target,
  type LucideIcon,
} from 'lucide-react';
import type { IcuData } from '../types';
import { CPG } from '../lib/docs';
import { isNewNews, kpiPoint } from '../lib/content';
import type { View } from '../lib/hooks';
import { fmtDateLong, todayKey } from '../lib/date';
import { useStore } from '../lib/store';
import { cx, Modal } from './ui';

export interface MenuItem {
  view: View;
  title: string;
  desc: string;
  icon: LucideIcon;
  /** สีไอคอน */
  tone: string;
  badge?: (d: IcuData) => string | null;
}

const prevMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const MENU: Record<string, MenuItem> = {
  overview: {
    view: 'overview',
    title: 'แดชบอร์ดเตียง',
    desc: 'สถานะเตียงและผู้ป่วยแบบเรียลไทม์',
    icon: LayoutGrid,
    tone: '#2a78d6',
    badge: (d) => {
      const free = d.beds.filter((b) => b.status === 'available').length;
      return `ว่าง ${free}/${d.beds.length}`;
    },
  },
  news: {
    view: 'news',
    title: 'ข่าวสาร & ประกาศ',
    desc: 'ประกาศ กิจกรรม การประชุม/อบรม',
    icon: Newspaper,
    tone: '#eb6834',
    badge: (d) => {
      const n = d.news.filter((x) => x.published && isNewNews(x)).length;
      return n ? `ใหม่ ${n}` : null;
    },
  },
  roster: { view: 'roster', title: 'ตารางเวร', desc: 'ทีมเวรวันนี้และตารางทั้งเดือน', icon: CalendarClock, tone: '#1baf7a' },
  staff: {
    view: 'staff',
    title: 'ผังบริหารงาน',
    desc: 'โครงสร้างทีมและรายชื่อบุคลากร',
    icon: Network,
    tone: '#6250d6',
    badge: (d) => {
      const n = d.staff.filter((s) => s.active).length;
      return n ? `${n} คน` : null;
    },
  },
  kpi: {
    view: 'kpi',
    title: 'Quality KPI',
    desc: 'ตัวชี้วัดคุณภาพเทียบเป้าหมาย',
    icon: Target,
    tone: '#e34948',
    badge: (d) => {
      const ym = prevMonth();
      const pts = d.kpis.filter((k) => k.active).map((k) => kpiPoint(d, k, ym));
      const judged = pts.filter((p) => p.status !== 'none');
      return judged.length ? `ผ่าน ${judged.filter((p) => p.status === 'pass').length}/${judged.length}` : null;
    },
  },
  docs: {
    view: 'docs',
    title: 'คู่มือ & SOP',
    desc: 'ขั้นตอนการทำงาน ระเบียบ ข้อบังคับ',
    icon: BookOpen,
    tone: '#008300',
    badge: (d) => {
      const n = d.docs.filter((x) => x.active && x.type !== CPG).length;
      return n ? `${n} ฉบับ` : null;
    },
  },
  guidelines: {
    view: 'guidelines',
    title: 'แนวทางการรักษา',
    desc: 'Clinical practice guideline (CPG)',
    icon: Stethoscope,
    tone: '#e87ba4',
    badge: (d) => {
      const n = d.docs.filter((x) => x.active && x.type === CPG).length;
      return n ? `${n} ฉบับ` : null;
    },
  },
  downloads: {
    view: 'downloads',
    title: 'เอกสารดาวน์โหลด',
    desc: 'ไฟล์ PDF และแบบฟอร์มต่าง ๆ',
    icon: Download,
    tone: '#eda100',
    badge: (d) => {
      const n = d.docs.filter((x) => x.active && x.link).length;
      return n ? `${n} ไฟล์` : null;
    },
  },
  forms: {
    view: 'forms',
    title: 'Google Forms',
    desc: 'แบบประเมิน รายงาน ลงทะเบียน',
    icon: ClipboardList,
    tone: '#0071e3',
    badge: (d) => {
      const n = d.links.filter((x) => x.active).length;
      return n ? `${n} ฟอร์ม` : null;
    },
  },
  indicators: { view: 'indicators', title: `${INDICATORS.length} ตัวชี้วัดรายวัน`, desc: 'ยอดผู้ป่วยและอุปกรณ์รายวัน', icon: Activity, tone: '#2a78d6' },
  stats: { view: 'stats', title: 'สถิติเตียง', desc: 'ADC · ALOS · BOR · BTR · TOI', icon: Gauge, tone: '#008300' },
  monthly: { view: 'monthly', title: 'สรุปรายเดือน', desc: 'รายงานประจำเดือนและ PDF', icon: CalendarDays, tone: '#6250d6' },
  wall: { view: 'wall', title: 'จอแสดงผล', desc: 'โหมดเต็มจอสำหรับทีวี / แท็บเล็ต', icon: Maximize, tone: '#5f5f66' },
  admin: { view: 'admin', title: 'เจ้าหน้าที่ ICU', desc: 'เข้าสู่ระบบเพื่อแก้ไขข้อมูล', icon: LockKeyhole, tone: '#1d1d1f' },
};

export const HOME_MENU: MenuItem[] = [
  MENU.overview,
  MENU.news,
  MENU.roster,
  MENU.staff,
  MENU.kpi,
  MENU.docs,
  MENU.guidelines,
  MENU.downloads,
  MENU.forms,
  MENU.stats,
  MENU.wall,
  MENU.admin,
];

export const MENU_GROUPS: { title: string; items: MenuItem[] }[] = [
  { title: 'ICU วันนี้', items: [MENU.overview, MENU.news, MENU.roster, MENU.staff, MENU.wall] },
  { title: 'คุณภาพ & สถิติ', items: [MENU.kpi, MENU.indicators, MENU.stats, MENU.monthly] },
  { title: 'เอกสาร & แบบฟอร์ม', items: [MENU.docs, MENU.guidelines, MENU.downloads, MENU.forms] },
  { title: 'สำหรับเจ้าหน้าที่', items: [MENU.admin] },
];

export function IconTile({ icon: Icon, tone, size = 'md' }: { icon: LucideIcon; tone: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_6px_14px_-6px_var(--tile)]',
        size === 'sm' && 'size-9 rounded-[11px]',
        size === 'md' && 'size-11 rounded-[14px]',
        size === 'lg' && 'size-14 rounded-[18px]',
      )}
      style={{
        ['--tile' as string]: tone,
        background: `linear-gradient(160deg, color-mix(in srgb, ${tone} 78%, white) 0%, ${tone} 100%)`,
      }}
    >
      <Icon className={size === 'lg' ? 'size-7' : size === 'md' ? 'size-[22px]' : 'size-[18px]'} strokeWidth={1.8} />
    </span>
  );
}

/** การ์ดเมนูแบบ Apple — แตะเพื่อเข้าหน้า */
export function MenuCard({ item, onGo }: { item: MenuItem; onGo: (v: View) => void }) {
  const { data, isStaff } = useStore();
  const isAdmin = item.view === 'admin';
  const badge = isAdmin ? (isStaff ? 'เข้าสู่ระบบแล้ว' : null) : item.badge?.(data);
  const icon = isAdmin && isStaff ? ShieldCheck : item.icon;
  return (
    <button
      type="button"
      onClick={() => onGo(item.view)}
      className="card menu-card group flex min-h-[148px] flex-col p-4 text-left sm:min-h-[164px] sm:p-5"
    >
      <div className="flex w-full items-start justify-between gap-2">
        <IconTile icon={icon} tone={isAdmin && isStaff ? '#0ca30c' : item.tone} />
        {badge && (
          <span className={cx('num rounded-full px-2 py-0.5 text-[11px] font-medium', isAdmin ? 'bg-good/14 text-good' : 'well text-ink-2')}>{badge}</span>
        )}
      </div>
      <span className="mt-auto block pt-4">
        <span className="flex items-center gap-1 text-[15px] leading-snug font-semibold sm:text-[16px]">
          {item.title}
          <ChevronRight className="size-4 shrink-0 text-ink-3 transition-transform duration-300 group-hover:translate-x-0.5" />
        </span>
        <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-ink-3 sm:text-[13px]">{item.desc}</span>
      </span>
    </button>
  );
}

export function MenuGrid({ items, onGo }: { items: MenuItem[]; onGo: (v: View) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {items.map((m) => (
        <MenuCard key={m.view} item={m} onGo={onGo} />
      ))}
    </div>
  );
}

/** หน้าต่าง “เมนูทั้งหมด” */
export function MenuSheet({ open, onClose, onGo }: { open: boolean; onClose: () => void; onGo: (v: View) => void }) {
  const { data, isStaff } = useStore();
  return (
    <Modal open={open} onClose={onClose} title="เมนูทั้งหมด" subtitle={`ICU Smart Center · ${fmtDateLong(todayKey())}`} width="max-w-3xl">
      <div className="space-y-6 pb-2">
        {MENU_GROUPS.map((g) => (
          <section key={g.title}>
            <p className="eyebrow mb-2.5">{g.title}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {g.items.map((m) => {
                const badge = m.view === 'admin' ? (isStaff ? 'เข้าสู่ระบบแล้ว' : null) : m.badge?.(data);
                return (
                  <button
                    key={m.view}
                    type="button"
                    onClick={() => {
                      onClose();
                      onGo(m.view);
                    }}
                    className="well flex items-center gap-3 p-3 text-left transition-colors hover:bg-fill-soft"
                  >
                    <IconTile icon={m.view === 'admin' && isStaff ? ShieldCheck : m.icon} tone={m.view === 'admin' && isStaff ? '#0ca30c' : m.tone} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{m.title}</span>
                      <span className="block truncate text-[12px] text-ink-3">{m.desc}</span>
                    </span>
                    {badge && <span className="num shrink-0 text-[11px] text-ink-3">{badge}</span>}
                    <ChevronRight className="size-4 shrink-0 text-ink-3" />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
