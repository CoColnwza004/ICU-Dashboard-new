import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';
import type { Bed, News } from '../types';
import { CPG } from '../lib/docs';
import { imageUrl, isNewNews, kpiPoint, shiftMonth } from '../lib/content';
import { HOSPITAL } from '../lib/constants';
import { fmtDateLong, fmtDateYear, todayKey } from '../lib/date';
import type { View } from '../lib/hooks';
import { useNow } from '../lib/hooks';
import { currentDuty, realName, SHIFT_BY_KEY } from '../lib/roster';
import { useStore } from '../lib/store';
import { useReveal } from '../lib/reveal';
import { FLOW_ITEMS, useFlow } from './Flow';
import { Avatar } from './Avatar';
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

      <Hero onGo={onGo} ribbon={!!urgent} />
      {featured && <NewsHero n={featured} onRead={() => setReading(featured)} onGo={onGo} />}
      <TileGrid onGo={onGo} />
      <NewsShelf news={news.slice(0, 8)} onRead={setReading} onGo={onGo} />

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

/** รูป 3 มิติ (Microsoft Fluent Emoji 3D · MIT) อยู่ใน public/3d */
export type Img3DName = 'news' | 'calendar' | 'target' | 'books' | 'stethoscope' | 'download' | 'memo' | 'display' | 'megaphone';

export function Img3D({ name, size, className, eager }: { name: Img3DName; size: number; className?: string; eager?: boolean }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}3d/${name}.webp`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      className={cx('img-3d', className)}
      style={{ width: size, height: size }}
    />
  );
}

/** ส่วนที่ค่อย ๆ ปรากฏเมื่อเลื่อนมาถึง */
function Reveal({
  as: Tag = 'div',
  delay = 0,
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  delay?: number;
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  const ref = useReveal<HTMLElement>();
  return (
    <Tag ref={ref} className={cx('reveal', className)} style={{ '--delay': `${delay}ms` } as CSSProperties} {...rest}>
      {children}
    </Tag>
  );
}

function Hero({ onGo, ribbon }: { onGo: (v: View) => void; ribbon: boolean }) {
  const { data } = useStore();
  const now = useNow(30_000);
  const beds = data.beds;
  const occ = beds.filter((b) => b.status === 'occupied');
  const free = beds.filter((b) => b.status === 'available').length;
  const cleaning = beds.filter((b) => b.status === 'cleaning').length;
  const vent = occ.filter((b) => b.onVentilator).length;
  const time = new Date(now).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  // ใช้ตำแหน่งจริงของ layout (offsetTop) — ไม่นับการเลื่อนของแอนิเมชันที่ยังไม่จบ
  const scrollDown = () => {
    let el = document.getElementById('home-live') as HTMLElement | null;
    let top = 0;
    while (el) {
      top += el.offsetTop;
      el = el.offsetParent as HTMLElement | null;
    }
    window.scrollTo({ top: Math.max(0, top - 56), behavior: 'smooth' });
  };

  return (
    <>
      {/* จอแรก: เต็มความสูงหน้าจอ (มือถือ/คอม) + ลูกศรบอกว่าเลื่อนลงได้ */}
      <section
        className="relative flex flex-col items-center justify-center overflow-hidden px-4 pt-10 pb-40 text-center md:pb-28"
        style={{ minHeight: `calc(100svh - 48px${ribbon ? ' - 46px' : ''})` }}
      >
        {/* แสงนุ่ม ๆ ลอยช้า ๆ ด้านหลังหัวข้อ */}
        <div aria-hidden className="aurora">
          <span className="aurora-blob a" />
          <span className="aurora-blob b" />
          <span className="aurora-blob c" />
        </div>
        <p className="apple-fade-in relative text-[14px] text-[#86868b] sm:text-[17px]">
          {fmtDateLong(todayKey())} · {time} น.
        </p>
        <h1 className="hero-title relative mt-3" aria-label="ICU Smart Center">
          <span className="text-silver block sm:inline">ICU</span> <span className="text-intelligence">Smart Center</span>
        </h1>
        <p className="apple-fade-in relative mt-2 text-[21px] leading-snug text-[#f5f5f7] sm:text-[28px]">ข้อมูลหอผู้ป่วยวิกฤต ครบในที่เดียว</p>
        <p className="apple-fade-in relative mt-1 text-[15px] text-[#86868b] sm:text-[17px]">{HOSPITAL}</p>
        <div className="apple-fade-in relative mt-7 flex flex-wrap justify-center gap-3 sm:gap-4">
          <Cta primary onClick={() => onGo('overview')}>
            ดูแดชบอร์ด
          </Cta>
          <Cta onClick={() => onGo('wall')}>เปิดโหมดเต็มจอ</Cta>
        </div>
        <LivePills onGo={onGo} />
        <EcgLine />
        <button
          type="button"
          onClick={scrollDown}
          aria-label="เลื่อนลงเพื่อดูข้อมูลเพิ่มเติม"
          className="absolute bottom-[104px] left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-[12px] text-[#a1a1a6] hover:text-white md:bottom-8"
        >
          <span>เลื่อนลง</span>
          <span className="nudge-down inline-flex size-10 items-center justify-center rounded-full bg-white/10 backdrop-blur">
            <ChevronDown className="size-5" strokeWidth={2.2} />
          </span>
        </button>
      </section>

      {/* ผังเตียงสด + ตัวเลขหลัก + รับ-จำหน่ายวันนี้ */}
      <Reveal as="section" id="home-live" className="px-4 pt-6 pb-16 text-center sm:pb-24">
        <p className="text-[17px] font-semibold text-[#30d158] sm:text-[19px]">สถานะเตียงตอนนี้</p>
        <h2 className="apple-headline mt-1 text-[32px] sm:text-[48px]">ICU ขณะนี้</h2>
      {/* “ภาพสินค้า”: ผังเตียงสดแบบเรืองแสง */}
      <div className="mx-auto mt-10 max-w-[980px] sm:mt-12">
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
        <FlowRow />
      </div>
      </Reveal>
    </>
  );
}

/** เส้นคลื่นหัวใจแบบจอมอนิเตอร์ — แสงวิ่งจากซ้ายไปขวา */
const ecgPath = (() => {
  const W = 300;
  const y = 60;
  let d = `M0,${y}`;
  for (let i = 0; i < 4; i++) {
    const x = i * W;
    d +=
      `L${x + 0.3 * W},${y}` +
      `Q${x + 0.34 * W},${y - 9} ${x + 0.38 * W},${y}` +
      `L${x + 0.45 * W},${y}L${x + 0.475 * W},${y + 8}L${x + 0.5 * W},${y - 48}L${x + 0.53 * W},${y + 24}L${x + 0.555 * W},${y}` +
      `L${x + 0.63 * W},${y}Q${x + 0.7 * W},${y - 18} ${x + 0.77 * W},${y}L${x + W},${y}`;
  }
  return d;
})();

function EcgLine() {
  return (
    <svg aria-hidden viewBox="0 0 1200 120" preserveAspectRatio="none" className="relative mt-10 h-[72px] w-[min(1100px,100%)] sm:mt-12 sm:h-[96px]">
      <defs>
        <linearGradient id="ecg-grad" x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2997ff" />
          <stop offset="0.5" stopColor="#bf5af2" />
          <stop offset="1" stopColor="#ff375f" />
        </linearGradient>
        <linearGradient id="ecg-fade" x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.15" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.85" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="ecg-mask">
          <rect width="1200" height="120" fill="url(#ecg-fade)" />
        </mask>
      </defs>
      <g mask="url(#ecg-mask)" fill="none" strokeLinejoin="round" strokeLinecap="round">
        <path d={ecgPath} stroke="rgb(255 255 255 / 0.1)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
        <path d={ecgPath} pathLength={1} className="ecg-trace" stroke="url(#ecg-grad)" strokeWidth={7} opacity={0.28} vectorEffect="non-scaling-stroke" />
        <path d={ecgPath} pathLength={1} className="ecg-trace" stroke="url(#ecg-grad)" strokeWidth={2.2} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

/** ตัวเลขนับขึ้นเมื่อเปิดหน้า (เคารพ “ลดการเคลื่อนไหว”) */
function useCountUp(target: number, ms = 1100) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setV(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setV(Math.round(a + (target - a) * e));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function CountUp({ value }: { value: number }) {
  return <>{useCountUp(value)}</>;
}

/** แถบสถานะสดใต้ปุ่ม */
function LivePills({ onGo }: { onGo: (v: View) => void }) {
  const { data } = useStore();
  const beds = data.beds;
  const occ = beds.filter((b) => b.status === 'occupied');
  const free = beds.filter((b) => b.status === 'available').length;
  const vent = occ.filter((b) => b.onVentilator).length;
  const duty = currentDuty(data, new Date());
  const items: { label: string; value: ReactNode; tone: string }[] = [
    { label: 'ผู้ป่วย', value: <><CountUp value={occ.length} />/{beds.length}</>, tone: '#f5f5f7' },
    { label: 'เตียงว่าง', value: <CountUp value={free} />, tone: '#30d158' },
    { label: 'Ventilator', value: <CountUp value={vent} />, tone: '#64d2ff' },
    ...(duty.team.length ? [{ label: `ทีม${SHIFT_BY_KEY[duty.shift].label}`, value: <><CountUp value={duty.team.length} /> คน</>, tone: '#f5f5f7' }] : []),
  ];
  return (
    <button
      type="button"
      onClick={() => onGo('overview')}
      className="apple-fade-in relative mt-9 inline-flex max-w-full flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-[22px] bg-white/[0.06] px-5 py-3 text-[14px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] backdrop-blur transition-colors hover:bg-white/[0.09] sm:rounded-full sm:text-[15px]"
      aria-label="สถานะ ICU ขณะนี้ — แตะเพื่อดูแดชบอร์ด"
    >
      <span className="inline-flex items-center gap-2 text-[#a1a1a6]">
        <span className="relative inline-flex size-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#30d158]/60 [animation-duration:2.4s]" />
          <span className="relative size-2 rounded-full bg-[#30d158]" />
        </span>
        สด
      </span>
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-baseline gap-1.5">
          <span className="num text-[17px] font-semibold sm:text-[19px]" style={{ color: it.tone }}>
            {it.value}
          </span>
          <span className="text-[#a1a1a6]">{it.label}</span>
        </span>
      ))}
    </button>
  );
}

const FLOW_DARK: Record<string, string> = { admit: '#2997ff', home: '#30d158', ward: '#bf5af2', refer: '#ff9f0a', expired: '#a1a1a6' };

/** ยอดรับ-จำหน่ายวันนี้ (กลับบ้าน / ย้ายวอร์ด / Refer / เสียชีวิต) */
function FlowRow() {
  const { today, month } = useFlow();
  return (
    <div className="mx-auto mt-12 max-w-[820px]">
      <p className="text-[14px] text-[#86868b]">รับ-จำหน่ายวันนี้</p>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3">
        {FLOW_ITEMS.map((f) => (
          <div key={f.key} className="rounded-[18px] bg-[#161617] px-3 py-3 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
            <p className="apple-headline num text-[30px] sm:text-[36px]" style={{ color: FLOW_DARK[f.key] }}>
              {today[f.key]}
            </p>
            <p className="text-[13px] text-[#a1a1a6]">{f.label}</p>
          </div>
        ))}
      </div>
      <p className="num mt-3 text-[13px] text-[#86868b]">
        จำหน่ายรวมวันนี้ {today.out} ราย · เดือนนี้ {month.out} ราย
      </p>
    </div>
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
        className="absolute -right-10 -bottom-12 size-32 opacity-60 transition-opacity duration-500 group-hover:opacity-90 sm:size-44"
        style={{ background: `radial-gradient(closest-side, ${color}, transparent)` }}
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
    <Reveal as="section" className="border-t border-white/5 bg-[#0a0a0a] px-4 pt-14 pb-0 text-center sm:pt-20">
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
          <div className="relative flex aspect-[16/7] items-center justify-center bg-[radial-gradient(70%_120%_at_50%_100%,#ff9f0a44,transparent_70%)] sm:aspect-[16/6]">
            <Img3D name="megaphone" size={150} className="pop-3d float-3d sm:!size-[220px]" />
          </div>
        )}
      </div>
    </Reveal>
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
            <Img3D name="target" size={120} className="pop-3d mx-auto sm:!size-[150px]" />
            <p className="apple-headline num mt-4 text-[64px] text-[#f5f5f7] sm:text-[80px]">
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
        delay={120}
        sub={`ทีม${SHIFT_BY_KEY[duty.shift].label}ตอนนี้`}
        glow="#30d158"
        onMore={() => onGo('roster')}
        visual={
          duty.team.length ? (
            <div className="text-center">
            <Img3D name="calendar" size={96} className="pop-3d mx-auto mb-6 sm:!size-[120px]" />
            <div className="flex flex-wrap justify-center gap-4 px-4">
              {duty.team.slice(0, 6).map((t, i) => (
                <div key={`${t.name}-${i}`} className="flex w-[84px] flex-col items-center">
                  <Avatar staff={t.staff} name={t.name} size={64} ring={t.lead} />
                  <span className="mt-2 w-full truncate text-center text-[13px] text-[#f5f5f7]">{realName(t.staff?.name ?? t.name).split(' ')[0]}</span>
                </div>
              ))}
            </div>
            </div>
          ) : (
            <Big3D name="calendar" />
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
            <p className="text-[17px] text-[#a1a1a6]">ยังไม่มีรายชื่อบุคลากร</p>
          )
        }
      />
      <Tile
        title="คู่มือ & SOP"
        delay={120}
        sub="ขั้นตอนการทำงาน ระเบียบ ข้อบังคับ"
        glow="#30d158"
        onMore={() => onGo('docs')}
        visual={<Big3D name="books" caption={count(docs.filter((d) => d.type !== CPG).length, 'ฉบับ')} />}
      />
      <Tile
        title="แนวทางการรักษา"
        sub="Clinical practice guideline ของหน่วยงาน"
        glow="#ff375f"
        onMore={() => onGo('guidelines')}
        visual={<Big3D name="stethoscope" caption={count(docs.filter((d) => d.type === CPG).length, 'ฉบับ')} />}
      />
      <Tile
        title="เอกสารดาวน์โหลด"
        delay={120}
        sub="ไฟล์ PDF และแบบฟอร์มต่าง ๆ"
        glow="#ffd60a"
        onMore={() => onGo('downloads')}
        visual={<Big3D name="download" caption={count(docs.filter((d) => d.link).length, 'ไฟล์')} />}
      />
      <Tile
        title="Google Forms"
        sub="แบบประเมิน รายงาน ลงทะเบียน"
        glow="#0a84ff"
        onMore={() => onGo('forms')}
        visual={<Big3D name="memo" caption={count(data.links.filter((l) => l.active).length, 'แบบฟอร์ม')} />}
      />
      <Tile
        title="จอแสดงผล"
        delay={120}
        sub="โหมดเต็มจอสำหรับทีวีและแท็บเล็ต"
        glow="#64d2ff"
        onMore={() => onGo('wall')}
        moreLabel="เปิดเลย"
        visual={<Big3D name="display" />}
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
  delay = 0,
}: {
  title: string;
  sub: string;
  glow: string;
  visual: ReactNode;
  onMore: () => void;
  moreLabel?: string;
  delay?: number;
}) {
  return (
    <Reveal
      as="article"
      delay={delay}
      className="apple-tile flex min-h-[440px] flex-col items-center px-6 pt-12 pb-12 text-center sm:min-h-[540px] sm:pt-14"
    >
      <span aria-hidden className="apple-glow" style={{ '--glow': glow } as CSSProperties} />
      <h3 className="apple-headline text-[32px] sm:text-[40px]">{title}</h3>
      <p className="mt-2 text-[17px] text-[#a1a1a6] sm:text-[21px]">{sub}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Cta primary onClick={onMore}>
          {moreLabel}
        </Cta>
      </div>
      <div className="flex w-full flex-1 items-center justify-center pt-10">{visual}</div>
    </Reveal>
  );
}

function Big3D({ name, caption }: { name: Img3DName; caption?: string }) {
  return (
    <div className="text-center">
      <Img3D name={name} size={150} className="pop-3d mx-auto sm:!size-[190px]" />
      {caption && <p className="mt-5 text-[17px] text-[#a1a1a6]">{caption}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NewsShelf({ news, onRead, onGo }: { news: News[]; onRead: (n: News) => void; onGo: (v: View) => void }) {
  if (!news.length) return null;
  return (
    <Reveal as="section" className="bg-black py-16 sm:py-20">
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
    </Reveal>
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
          <div className="flex size-full items-end justify-center" style={{ background: `radial-gradient(80% 100% at 50% 100%, ${tone}55, transparent 75%)` }}>
            <Img3D name={n.category === 'ด่วน' || n.category === 'ประกาศ' ? 'megaphone' : 'news'} size={104} className="mb-4 transition-transform duration-700 group-hover:-translate-y-1 group-hover:scale-105" />
          </div>
        )}
      </div>
    </button>
  );
}
