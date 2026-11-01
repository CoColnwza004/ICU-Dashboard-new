import { ChevronRight, Megaphone } from 'lucide-react';
import { useState } from 'react';
import type { News } from '../types';
import { HOSPITAL, UNIT } from '../lib/constants';
import { fmtDateLong, todayKey } from '../lib/date';
import type { View } from '../lib/hooks';
import { useNow } from '../lib/hooks';
import { useStore } from '../lib/store';
import { DutyCard } from './DutyCard';
import { HOME_MENU, MenuGrid } from './Menu';
import { NewsLine, NewsReader } from './NewsPage';
import { cx, Dot } from './ui';

export function HomePage({ onGo }: { onGo: (v: View) => void }) {
  const { data } = useStore();
  const now = useNow(30_000);
  const [reading, setReading] = useState<News | null>(null);
  const time = new Date(now).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  const beds = data.beds;
  const occ = beds.filter((b) => b.status === 'occupied').length;
  const free = beds.filter((b) => b.status === 'available').length;
  const cleaning = beds.filter((b) => b.status === 'cleaning').length;

  const news = data.news.filter((n) => n.published);
  const urgent = news.find((n) => n.category === 'ด่วน' && n.date >= shiftDays(-7)) ?? news.find((n) => n.pinned);
  const latest = news.filter((n) => n !== urgent).slice(0, 4);

  return (
    <div className="space-y-10 pt-6 sm:space-y-12 sm:pt-12">
      <section className="animate-rise">
        <p className="eyebrow">
          {fmtDateLong(todayKey())} · {time} น.
        </p>
        <h1 className="display mt-3 text-[40px] leading-[1.05] sm:text-[60px]">ICU Smart Center</h1>
        <p className="mt-2 text-[16px] text-ink-2 sm:text-[18px]">
          {UNIT} · {HOSPITAL}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <StatusChip dot="bg-accent" n={occ} label={`ผู้ป่วย / ${beds.length} เตียง`} onClick={() => onGo('overview')} />
          <StatusChip dot="bg-good" n={free} label="เตียงว่าง" onClick={() => onGo('overview')} />
          {cleaning > 0 && <StatusChip dot="bg-warn" n={cleaning} label="ทำความสะอาด" onClick={() => onGo('overview')} />}
        </div>
      </section>

      {urgent && (
        <button
          type="button"
          onClick={() => setReading(urgent)}
          className={cx(
            'card menu-card flex w-full items-center gap-4 p-4 text-left sm:p-5',
            urgent.category === 'ด่วน' && 'ring-1 ring-critical/30',
          )}
        >
          <span
            className={cx(
              'inline-flex size-11 shrink-0 items-center justify-center rounded-[14px]',
              urgent.category === 'ด่วน' ? 'bg-critical/12 text-critical' : 'bg-accent/12 text-accent',
            )}
          >
            <Megaphone className="size-5" strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold text-ink-3">{urgent.category === 'ด่วน' ? 'ประกาศด่วน' : 'ประกาศสำคัญ'}</span>
            <span className="block truncate text-[16px] font-semibold">{urgent.title}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-ink-3" />
        </button>
      )}

      <section>
        <p className="eyebrow mb-4">เมนู</p>
        <MenuGrid items={HOME_MENU} onGo={onGo} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <div className="mb-3 flex items-end justify-between">
            <p className="eyebrow">ข่าวล่าสุด</p>
            <button type="button" onClick={() => onGo('news')} className="link inline-flex items-center text-[14px]">
              ดูทั้งหมด <ChevronRight className="size-4" />
            </button>
          </div>
          {latest.length ? (
            <ul className="card divide-y divide-line overflow-hidden py-1">
              {latest.map((n) => (
                <NewsLine key={n.id} n={n} onOpen={() => setReading(n)} />
              ))}
            </ul>
          ) : (
            <div className="card px-6 py-10 text-center text-[14px] text-ink-3">ยังไม่มีข่าวสาร</div>
          )}
        </div>
        <div>
          <p className="eyebrow mb-3">ทีมเวรตอนนี้</p>
          <DutyCard onOpenRoster={() => onGo('roster')} />
        </div>
      </section>

      <NewsReader news={reading} onClose={() => setReading(null)} />
    </div>
  );
}

const shiftDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function StatusChip({ dot, n, label, onClick }: { dot: string; n: number; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="glass inline-flex h-11 items-center gap-2 rounded-full px-4 text-[14px] transition-transform active:scale-[0.97]">
      <Dot className={dot} />
      <span className="num text-[17px] font-semibold">{n}</span>
      <span className="text-ink-2">{label}</span>
    </button>
  );
}
