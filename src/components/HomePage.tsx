import {
  BookOpen,
  ChevronRight,
  ClipboardList,
  Download,
  Maximize,
  Megaphone,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { Bed, News } from '../types';
import { CPG } from '../lib/docs';
import { imageUrl, isNewNews, kpiPoint, shiftMonth } from '../lib/content';
import { HOSPITAL } from '../lib/constants';
import { fmtDateLong, fmtDateYear, todayKey } from '../lib/date';
import type { View } from '../lib/hooks';
import { useNow } from '../lib/hooks';
import { currentDuty, realName, SHIFT_BY_KEY } from '../lib/roster';
import { useStore } from '../lib/store';
import { Avatar } from './Avatar';
import { MENU_GROUPS } from './Menu';
import { CategoryPill, NewsReader } from './NewsPage';
import { cx } from './ui';

/* ------------------------------------------------------------------ */
/* หน้าแรกแบบเว็บไซต์ Apple — พื้นดำ หัวข้อใหญ่กลางจอ ปุ่มฟ้าแบบเม็ดยา      */
/* ------------------------------------------------------------------ */

export function HomePage({ onGo }: { onGo: (v: View) => void }) {
  const { data } = useStore();
  const [reading, setReading] = useState<News | null>(null);
  const news = data.news.filter((n) => n.published);
  const urgent = news.find((n) => n.category === 'ด่วน' && isNewNews(n, todayKey())) ?? null;
  const featured = news.find((n) => n.pinned) ?? news[0] ?? null;

  return (
    <div className="bg-black text-[#f5f5f7]">
      {urgent && (
        <button
          type="button"
          onClick={() => setReading(urgent)}
          className="block w-full bg-[#1d1d1f] px-4 py-3 text-center text-[14px] text-[#f5f5f7]/85"
        >
          <span className="font-semibold text-[#ff6961]">ประกาศด่วน</span> · {urgent.title}{' '}
          <span className="apple-link whitespace-nowrap">อ่านต่อ ›</span>
        </button>
      )}

      <Hero onGo={onGo} />
      {featured && <NewsHero n={featured} onRead={() => setReading(featured)} onGo={onGo} />}
      <TileGrid onGo={onGo} />
      <NewsShelf news={news.slice(0, 8)} onRead={setReading} onGo={onGo} />
      <Directory onGo={onGo} />

      <NewsReader news={reading} onClose={() => setReading(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Cta({ children, onClick, primary }: { children: ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cx('apple-btn', primary ? 'apple-btn-primary' : 'apple-btn-outline')}>
      {children}
    </button>
  );
}

function Hero({ onGo }: { onGo: (v: View) => void }) {
  const { data } = useStore();
  const now = useNow(30_000);
  const beds = data.beds;
  const occ = beds.filter((b) => b.status === 'occupied');
  const free = beds.filter((b) => b.status === 'available').length;
  const cleaning = beds.filter((b) => b.status === 'cleaning').length;
  const vent = occ.filter((b) => b.onVentilator).length;
  const time = new Date(now).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  return (
    <section className="apple-fade-in px-4 pt-14 pb-16 text-center sm:pt-20 sm:pb-24">
      <p className="text-[14px] text-[#86868b] sm:text-[17px]">
        {fmtDateLong(todayKey())} · {time} น.
      </p>
      <h1 className="apple-headline mt-2 text-[44px] sm:text-[64px] lg:text-[80px]">ICU Smart Center</h1>
      <p className="mt-2 text-[21px] leading-snug text-[#f5f5f7] sm:text-[28px]">ข้อมูลหอผู้ป่วยวิกฤต ครบในที่เดียว</p>
      <p className="mt-1 text-[15px] text-[#86868b] sm:text-[17px]">{HOSPITAL}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3 sm:gap-4">
        <Cta primary onClick={() => onGo('overview')}>
          ดูแดชบอร์ด
        </Cta>
        <Cta onClick={() => onGo('wall')}>เปิดโหมดเต็มจอ</Cta>
      </div>

      {/* “ภาพสินค้า”: ผังเตียงสดแบบเรืองแสง */}
      <div className="mx-auto mt-12 max-w-[980px] sm:mt-16">
        <div className="relative rounded-[32px] bg-[radial-gradient(120%_90%_at_50%_0%,#1c1c1e_0%,#0a0a0a_60%,#000_100%)] p-4 shadow-[0_0_0_1px_rgb(255_255_255/0.06)] sm:p-8">
          <div className="grid grid-cols-4 gap-2.5 sm:gap-4">
            {beds.map((b) => (
              <BedGlow key={b.bedNumber} b={b} onClick={() => onGo('overview')} />
            ))}
          </div>
        </div>
        <dl className="mt-10 grid grid-cols-2 gap-y-8 sm:grid-cols-4">
          <Stat value={`${occ.length}/${beds.length}`} label="ผู้ป่วย / เตียง" />
          <Stat value={free} label="เตียงว่าง" tone="#30d158" />
          <Stat value={cleaning} label="รอทำความสะอาด" tone="#ffd60a" />
          <Stat value={vent} label="ใช้เครื่องช่วยหายใจ" tone="#64d2ff" />
        </dl>
      </div>
    </section>
  );
}

const ACUITY_GLOW: Record<string, string> = { Critical: '#ff453a', High: '#ff9f0a', Moderate: '#ffd60a', Stable: '#30d158', '': '#8e8e93' };

function BedGlow({ b, onClick }: { b: Bed; onClick: () => void }) {
  const color = b.status === 'occupied' ? ACUITY_GLOW[b.acuity] : b.status === 'available' ? '#30d158' : '#ffd60a';
  const label = b.status === 'occupied' ? b.acuity || 'มีผู้ป่วย' : b.status === 'available' ? 'ว่าง' : 'ทำความสะอาด';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${b.bedNumber} ${label}`}
      className="group relative flex aspect-[4/5] flex-col justify-between overflow-hidden rounded-[18px] bg-[#161617] p-2.5 text-left transition-transform duration-500 ease-[var(--ease-liquid)] hover:-translate-y-1 sm:aspect-[4/3] sm:rounded-[22px] sm:p-4"
      style={{ boxShadow: `inset 0 0 0 1px rgb(255 255 255 / 0.06), inset 0 -40px 60px -30px ${color}55` }}
    >
      <span
        aria-hidden
        className="absolute -right-6 -bottom-8 size-24 rounded-full opacity-50 blur-2xl transition-opacity duration-500 group-hover:opacity-80 sm:size-32"
        style={{ background: color }}
      />
      <span className="num relative text-[13px] font-semibold text-[#f5f5f7] sm:text-[17px]">{b.bedNumber.replace('ICU-', '')}</span>
      <span className="relative">
        <span className="block size-2 rounded-full sm:size-2.5" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
        <span className="mt-1.5 block truncate text-[10px] text-[#a1a1a6] sm:text-[13px]">{label}</span>
      </span>
    </button>
  );
}

function Stat({ value, label, tone = '#f5f5f7' }: { value: ReactNode; label: string; tone?: string }) {
  return (
    <div>
      <dd className="apple-headline num text-[40px] sm:text-[48px]" style={{ color: tone }}>
        {value}
      </dd>
      <dt className="mt-1 text-[14px] text-[#86868b]">{label}</dt>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NewsHero({ n, onRead, onGo }: { n: News; onRead: () => void; onGo: (v: View) => void }) {
  const src = imageUrl(n.image);
  const [failed, setFailed] = useState(false);
  return (
    <section className="border-t border-white/5 bg-[#0a0a0a] px-4 pt-14 pb-0 text-center sm:pt-20">
      <p className="text-[17px] font-semibold text-[#ff9f0a] sm:text-[19px]">ข่าวสาร & ประกาศ</p>
      <h2 className="apple-headline mx-auto mt-2 max-w-[880px] text-[32px] sm:text-[48px]">{n.title}</h2>
      <p className="mx-auto mt-3 flex max-w-[700px] flex-wrap items-center justify-center gap-2 text-[17px] text-[#a1a1a6] sm:text-[21px]">
        <CategoryPill c={n.category} />
        {n.date && fmtDateYear(n.date)}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3 sm:gap-4">
        <Cta primary onClick={onRead}>
          อ่านต่อ
        </Cta>
        <Cta onClick={() => onGo('news')}>ข่าวทั้งหมด</Cta>
      </div>
      <div className="mx-auto mt-10 max-w-[980px] overflow-hidden rounded-t-[32px] sm:mt-14">
        {src && !failed ? (
          <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="aspect-[16/7] w-full object-cover" />
        ) : (
          <div className="relative flex aspect-[16/6] items-center justify-center bg-[radial-gradient(70%_120%_at_50%_100%,#ff9f0a55,transparent_70%)]">
            <Megaphone className="size-20 text-[#ff9f0a] sm:size-28" strokeWidth={1.1} />
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function TileGrid({ onGo }: { onGo: (v: View) => void }) {
  const { data } = useStore();
  const now = useNow(60_000);
  const duty = currentDuty(data, new Date(now));
  const ym = shiftMonth(todayKey().slice(0, 7), -1);
  const kpis = data.kpis.filter((k) => k.active);
  const pts = kpis.map((k) => kpiPoint(data, k, ym));
  const judged = pts.filter((p) => p.status !== 'none');
  const pass = judged.filter((p) => p.status === 'pass').length;
  const staff = data.staff.filter((s) => s.active);
  const ids = new Set(staff.map((s) => s.id));
  const leader = staff.find((s) => !s.reportsTo || !ids.has(s.reportsTo)) ?? null;
  const docs = data.docs.filter((d) => d.active);
  const count = (n: number, unit: string) => (n ? `${n} ${unit}` : 'พร้อมใช้งาน');

  return (
    <section className="grid gap-3 bg-black p-3 sm:grid-cols-2">
      <Tile
        title="Quality KPI"
        sub="ตัวชี้วัดคุณภาพ เทียบเป้าหมายทุกเดือน"
        glow="#ff453a"
        onMore={() => onGo('kpi')}
        visual={
          <div className="text-center">
            <p className="apple-headline num text-[72px] text-[#f5f5f7] sm:text-[96px]">
              {judged.length ? (
                <>
                  {pass}
                  <span className="text-[#86868b]">/{judged.length}</span>
                </>
              ) : (
                kpis.length
              )}
            </p>
            <p className="text-[15px] text-[#a1a1a6]">{judged.length ? 'ตัวชี้วัดผ่านเป้า · เดือนที่แล้ว' : 'ตัวชี้วัดคุณภาพ'}</p>
          </div>
        }
      />
      <Tile
        title="ตารางเวร"
        sub={`ทีม${SHIFT_BY_KEY[duty.shift].label}ตอนนี้`}
        glow="#30d158"
        onMore={() => onGo('roster')}
        visual={
          duty.team.length ? (
            <div className="flex flex-wrap justify-center gap-4 px-4">
              {duty.team.slice(0, 6).map((t, i) => (
                <div key={`${t.name}-${i}`} className="flex w-[84px] flex-col items-center">
                  <Avatar staff={t.staff} name={t.name} size={64} ring={t.lead} />
                  <span className="mt-2 w-full truncate text-center text-[13px] text-[#f5f5f7]">{realName(t.staff?.name ?? t.name).split(' ')[0]}</span>
                </div>
              ))}
            </div>
          ) : (
            <BigIcon icon={ClipboardList} tone="#30d158" />
          )
        }
      />
      <Tile
        title="ผังบริหารงาน"
        sub="โครงสร้างทีมและบุคลากร ICU"
        glow="#bf5af2"
        onMore={() => onGo('staff')}
        visual={
          leader ? (
            <div className="text-center">
              <Avatar staff={leader} size={112} className="mx-auto shadow-[0_0_60px_-10px_#bf5af2]" />
              <p className="mt-4 text-[19px] font-semibold text-[#f5f5f7]">{leader.name}</p>
              <p className="text-[14px] text-[#a1a1a6]">{leader.position || leader.group}</p>
              {staff.length > 1 && <p className="mt-1 text-[13px] text-[#86868b]">และทีมอีก {staff.length - 1} คน</p>}
            </div>
          ) : (
            <BigIcon icon={ClipboardList} tone="#bf5af2" />
          )
        }
      />
      <Tile
        title="คู่มือ & SOP"
        sub="ขั้นตอนการทำงาน ระเบียบ ข้อบังคับ"
        glow="#30d158"
        onMore={() => onGo('docs')}
        visual={<BigIcon icon={BookOpen} tone="#30d158" caption={count(docs.filter((d) => d.type !== CPG).length, 'ฉบับ')} />}
      />
      <Tile
        title="แนวทางการรักษา"
        sub="Clinical practice guideline ของหน่วยงาน"
        glow="#ff375f"
        onMore={() => onGo('guidelines')}
        visual={<BigIcon icon={Stethoscope} tone="#ff375f" caption={count(docs.filter((d) => d.type === CPG).length, 'ฉบับ')} />}
      />
      <Tile
        title="เอกสารดาวน์โหลด"
        sub="ไฟล์ PDF และแบบฟอร์มต่าง ๆ"
        glow="#ffd60a"
        onMore={() => onGo('downloads')}
        visual={<BigIcon icon={Download} tone="#ffd60a" caption={count(docs.filter((d) => d.link).length, 'ไฟล์')} />}
      />
      <Tile
        title="Google Forms"
        sub="แบบประเมิน รายงาน ลงทะเบียน"
        glow="#0a84ff"
        onMore={() => onGo('forms')}
        visual={<BigIcon icon={ClipboardList} tone="#0a84ff" caption={count(data.links.filter((l) => l.active).length, 'แบบฟอร์ม')} />}
      />
      <Tile
        title="จอแสดงผล"
        sub="โหมดเต็มจอสำหรับทีวีและแท็บเล็ต"
        glow="#64d2ff"
        onMore={() => onGo('wall')}
        moreLabel="เปิดเลย"
        visual={<BigIcon icon={Maximize} tone="#64d2ff" />}
      />
    </section>
  );
}

function Tile({
  title,
  sub,
  glow,
  visual,
  onMore,
  moreLabel = 'ดูเพิ่มเติม',
}: {
  title: string;
  sub: string;
  glow: string;
  visual: ReactNode;
  onMore: () => void;
  moreLabel?: string;
}) {
  return (
    <article className="apple-tile flex min-h-[460px] flex-col items-center px-6 pt-12 pb-12 text-center sm:min-h-[560px] sm:pt-14">
      <span aria-hidden className="apple-glow rounded-full" style={{ background: glow }} />
      <h3 className="apple-headline text-[32px] sm:text-[40px]">{title}</h3>
      <p className="mt-2 text-[17px] text-[#a1a1a6] sm:text-[21px]">{sub}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Cta primary onClick={onMore}>
          {moreLabel}
        </Cta>
      </div>
      <div className="flex w-full flex-1 items-center justify-center pt-10">{visual}</div>
    </article>
  );
}

function BigIcon({ icon: Icon, tone, caption }: { icon: LucideIcon; tone: string; caption?: string }) {
  return (
    <div className="text-center">
      <span
        className="mx-auto inline-flex size-[120px] items-center justify-center rounded-[32px] sm:size-[140px] sm:rounded-[36px]"
        style={{
          background: `linear-gradient(160deg, color-mix(in srgb, ${tone} 75%, white) 0%, ${tone} 100%)`,
          boxShadow: `0 30px 80px -20px ${tone}, inset 0 1px 0 rgb(255 255 255 / 0.4)`,
        }}
      >
        <Icon className="size-14 text-white sm:size-16" strokeWidth={1.5} />
      </span>
      {caption && <p className="mt-6 text-[17px] text-[#a1a1a6]">{caption}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NewsShelf({ news, onRead, onGo }: { news: News[]; onRead: (n: News) => void; onGo: (v: View) => void }) {
  if (!news.length) return null;
  return (
    <section className="bg-black py-16 sm:py-20">
      <div className="mx-auto flex max-w-[1024px] items-end justify-between px-4 sm:px-6">
        <h2 className="apple-headline text-[28px] sm:text-[40px]">ข่าวล่าสุด</h2>
        <button type="button" onClick={() => onGo('news')} className="apple-link inline-flex items-center text-[17px]">
          ดูทั้งหมด <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:px-[max(24px,calc((100vw_-_1024px)/2))]">
        {news.map((n) => (
          <ShelfCard key={n.id} n={n} onOpen={() => onRead(n)} />
        ))}
      </div>
    </section>
  );
}

const SHELF_TONE: Record<string, string> = {
  ด่วน: '#ff453a',
  ประกาศ: '#0a84ff',
  ข่าวสาร: '#8e8e93',
  กิจกรรม: '#30d158',
  'อบรม / ประชุม': '#bf5af2',
};

function ShelfCard({ n, onOpen }: { n: News; onOpen: () => void }) {
  const src = imageUrl(n.image);
  const [failed, setFailed] = useState(false);
  const tone = SHELF_TONE[n.category] ?? '#8e8e93';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex h-[380px] w-[280px] shrink-0 snap-start flex-col overflow-hidden rounded-[24px] bg-[#1d1d1f] text-left transition-transform duration-500 ease-[var(--ease-liquid)] hover:scale-[1.015] sm:w-[320px]"
    >
      <div className="p-6">
        <p className="text-[12px] font-semibold" style={{ color: tone }}>
          {n.category}
          {isNewNews(n) && <span className="ml-2 text-[#2997ff]">ใหม่</span>}
        </p>
        <p className="mt-2 line-clamp-3 text-[21px] leading-snug font-semibold text-[#f5f5f7]">{n.title}</p>
        {n.date && <p className="mt-2 text-[14px] text-[#86868b]">{fmtDateYear(n.date)}</p>}
      </div>
      <div className="mt-auto h-[160px] w-full overflow-hidden">
        {src && !failed ? (
          <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="size-full object-cover transition-transform duration-700 group-hover:scale-105" />
        ) : (
          <div className="flex size-full items-end justify-center" style={{ background: `radial-gradient(80% 100% at 50% 100%, ${tone}66, transparent 75%)` }}>
            <Megaphone className="mb-6 size-12" style={{ color: tone }} strokeWidth={1.3} />
          </div>
        )}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */

function Directory({ onGo }: { onGo: (v: View) => void }) {
  const { isStaff } = useStore();
  const items = useMemo(() => MENU_GROUPS, []);
  return (
    <footer className="bg-[#161617] text-[12px] text-[#86868b]">
      <div className="mx-auto max-w-[1024px] px-4 py-10 sm:px-6">
        <p className="border-b border-white/10 pb-4 leading-relaxed">
          ข้อมูลในเว็บไซต์นี้ไม่ระบุตัวตนผู้ป่วย · ผู้เข้าชมทั่วไปดูข้อมูลได้อย่างเดียว · เจ้าหน้าที่ ICU เข้าสู่ระบบเพื่อแก้ไขข้อมูล
        </p>
        <nav className="grid grid-cols-2 gap-6 py-6 sm:grid-cols-4">
          {items.map((g) => (
            <div key={g.title}>
              <p className="mb-2 font-semibold text-[#e8e8ed]">{g.title}</p>
              <ul className="space-y-2">
                {g.items.map((m) => (
                  <li key={m.view}>
                    <button type="button" onClick={() => onGo(m.view)} className="text-left hover:text-[#e8e8ed] hover:underline">
                      {m.view === 'admin' && isStaff ? 'เจ้าหน้าที่ ICU (เข้าสู่ระบบแล้ว)' : m.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <p className="border-t border-white/10 pt-4">
          ICU Smart Center · หอผู้ป่วยวิกฤต {HOSPITAL}
        </p>
      </div>
    </footer>
  );
}
