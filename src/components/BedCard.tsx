import { ArrowUpRight, Check } from 'lucide-react';
import type { Bed } from '../types';
import { ACUITY_META, DEVICES, STATUS_META } from '../lib/constants';
import { DEVICE_ICON } from '../lib/icons';
import { daysBetween, fmtDateTime } from '../lib/date';
import { cx, Dot } from './ui';

export function BedCard({
  bed,
  sheetHref,
  onOpen,
  onMarkReady,
}: {
  bed: Bed;
  sheetHref: string | null;
  onOpen: () => void;
  onMarkReady: () => void;
}) {
  const status = STATUS_META[bed.status];
  const occupied = bed.status === 'occupied';
  const devices = DEVICES.filter((d) => bed[d.key]);
  const los = occupied ? daysBetween(bed.admittedAt) + 1 : 0;

  const halo =
    bed.status === 'occupied'
      ? { Critical: '#d03b3b', High: '#ec835a', Moderate: '#fab219', Stable: '#0ca30c', '': '#8e8e93' }[bed.acuity]
      : bed.status === 'available'
        ? '#0ca30c'
        : '#fab219';

  return (
    <article
      className={cx(
        'card group flex min-h-[180px] flex-col overflow-hidden p-5 sm:min-h-[260px] transition-transform duration-500 ease-[var(--ease-liquid)]',
        'hover:-translate-y-1',
      )}
    >
      {/* แสงสีจาง ๆ ตามระดับความรุนแรง / สถานะ */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-12 -z-10 size-48 rounded-full opacity-[0.22] blur-2xl transition-opacity duration-500 group-hover:opacity-35"
        style={{ background: `radial-gradient(circle, ${halo} 0%, transparent 70%)` }}
      />
      <button
        type="button"
        onClick={onOpen}
        aria-label={occupied ? `แก้ไขข้อมูลเตียง ${bed.bedNumber}` : `รับผู้ป่วยเข้าเตียง ${bed.bedNumber}`}
        className="absolute inset-0 rounded-[var(--radius-card)]"
      />

      <header className="pointer-events-none relative flex items-start justify-between gap-2">
        <div>
          <p className="num text-[22px] font-semibold leading-none">{bed.bedNumber}</p>
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-2">
            <Dot className={status.dot} />
            {status.label}
          </p>
        </div>
        {sheetHref && (
          <a
            href={sheetHref}
            target="_blank"
            rel="noreferrer"
            title="เปิดแถวนี้ใน Google Sheet"
            className="pointer-events-auto relative -mt-1 -mr-1 inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:text-link max-sm:opacity-100"
          >
            ชีต <ArrowUpRight className="size-3" />
          </a>
        )}
      </header>

      {occupied ? (
        <div className="pointer-events-none relative mt-5 flex flex-1 flex-col">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[15px] font-medium">{bed.caseCode || 'ไม่ระบุรหัสเคส'}</p>
            <p className="shrink-0 text-[12px] text-ink-3">วันที่ {los}</p>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-2">
            {bed.acuity ? (
              <>
                <Dot className={ACUITY_META[bed.acuity].dot} />
                {bed.acuity} · {ACUITY_META[bed.acuity].th}
              </>
            ) : (
              'ยังไม่ระบุระดับความรุนแรง'
            )}
            {(bed.ageGroup || bed.gender) && (
              <span className="text-ink-3">· {[bed.gender, bed.ageGroup].filter(Boolean).join(' ')}</span>
            )}
          </p>

          {devices.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {devices.map((d) => {
                const Icon = DEVICE_ICON[d.key];
                return (
                  <li key={d.key} className="well inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-ink-2">
                    <Icon className="size-3 text-ink-3" strokeWidth={2} />
                    {d.label}
                  </li>
                );
              })}
            </ul>
          )}

          {bed.clinicalGoals && (
            <p className="mt-auto line-clamp-2 pt-4 text-[12px] leading-relaxed text-ink-3">{bed.clinicalGoals}</p>
          )}
        </div>
      ) : (
        <div className="pointer-events-none relative mt-5 flex flex-1 flex-col justify-end">
          <p className="pointer-events-none text-[13px] text-ink-3">
            {bed.status === 'available'
              ? 'พร้อมรับผู้ป่วยใหม่'
              : `รอทำความสะอาด${bed.updatedAt ? ` · ตั้งแต่ ${fmtDateTime(bed.updatedAt)}` : ''}`}
          </p>
          {bed.status === 'available' ? (
            <span className="btn-ink pointer-events-none mt-3 inline-flex h-9 w-fit items-center rounded-full px-4 text-[13px] font-medium transition-opacity group-hover:opacity-90">
              รับผู้ป่วย
            </span>
          ) : (
            <button
              type="button"
              onClick={onMarkReady}
              className="pointer-events-auto relative mt-3 inline-flex h-10 w-fit items-center gap-1.5 rounded-full bg-good px-4 text-[13px] font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_6px_16px_-8px_rgb(12_163_12/0.7)] transition-[filter,transform] hover:brightness-105 active:scale-[0.97]"
            >
              <Check className="size-4" strokeWidth={2.4} />
              ทำความสะอาดเสร็จ
            </button>
          )}
        </div>
      )}
    </article>
  );
}
