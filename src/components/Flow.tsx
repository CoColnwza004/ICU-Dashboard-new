import { EVENT_ICON } from '../lib/icons';
import { flowCounts } from '../lib/logic';
import { todayKey } from '../lib/date';
import { useStore } from '../lib/store';
import { cx } from './ui';

/** ลำดับและสีของยอดรับ-จำหน่าย */
export const FLOW_ITEMS = [
  { key: 'admit', label: 'รับใหม่', tone: 'var(--color-accent)' },
  { key: 'home', label: 'กลับบ้าน', tone: 'var(--color-good)' },
  { key: 'ward', label: 'ย้ายวอร์ด', tone: '#6250d6' },
  { key: 'refer', label: 'Refer', tone: '#eb6834' },
  { key: 'expired', label: 'เสียชีวิต', tone: 'var(--color-ink-2)' },
] as const;

export const useFlow = () => {
  const { data } = useStore();
  const today = todayKey();
  return { today: flowCounts(data, today), month: flowCounts(data, today.slice(0, 7)) };
};

/**
 * ยอดรับใหม่ / กลับบ้าน / ย้ายวอร์ด / Refer / เสียชีวิต — วันนี้ (ตัวใหญ่) และเดือนนี้ (ตัวเล็ก)
 * size="wall" ใช้หน่วย vmin สำหรับจอแสดงผล
 */
export function FlowTiles({ size = 'page' }: { size?: 'page' | 'wall' }) {
  const { today, month } = useFlow();
  const wall = size === 'wall';
  return (
    <div>
      <div className={cx('grid gap-2', wall ? 'grid-cols-3 gap-[0.8vmin] sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-5 sm:gap-3')}>
        {FLOW_ITEMS.map((f, i) => {
          const Icon = EVENT_ICON[f.key];
          return (
            <div
              key={f.key}
              className={cx('well min-w-0', wall ? 'px-[1vmin] py-[0.9vmin]' : 'px-4 py-3', !wall && i === 0 && 'col-span-2 sm:col-span-1')}
            >
              <p className={cx('flex items-center gap-1.5 truncate font-medium text-ink-2', wall ? 'text-[clamp(10px,1.25vmin,17px)]' : 'text-[13px]')}>
                <Icon className="size-[1.15em] shrink-0" style={{ color: f.tone }} strokeWidth={2} />
                {f.label}
              </p>
              <p className={cx('num leading-tight font-semibold', wall ? 'mt-[0.3vmin] text-[clamp(20px,3.4vmin,48px)]' : 'mt-1 text-[32px]')}>
                {today[f.key]}
              </p>
              <p className={cx('num truncate text-ink-3', wall ? 'text-[clamp(9px,1.1vmin,15px)]' : 'text-[12px]')}>เดือนนี้ {month[f.key]}</p>
            </div>
          );
        })}
      </div>
      <p className={cx('num text-ink-3', wall ? 'mt-[0.8vmin] text-[clamp(10px,1.2vmin,16px)]' : 'mt-3 text-[13px]')}>
        จำหน่ายรวม วันนี้ <span className="font-semibold text-ink">{today.out}</span> ราย · เดือนนี้{' '}
        <span className="font-semibold text-ink">{month.out}</span> ราย
        {!wall && <span className="ml-1">(กลับบ้าน + ย้ายวอร์ด + Refer + เสียชีวิต · จากทะเบียนรับ-จำหน่าย)</span>}
      </p>
    </div>
  );
}
