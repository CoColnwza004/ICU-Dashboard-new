import { ArrowUpRight } from 'lucide-react';
import type { Bed } from '../types';
import { ACUITY_META, DEVICES, STATUS_META } from '../lib/constants';
import { daysBetween } from '../lib/date';
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

  return (
    <article
      className={cx(
        'card group relative flex min-h-[180px] flex-col p-5 sm:min-h-[248px] transition-transform duration-300 ease-[var(--ease-apple)]',
        'hover:-translate-y-0.5',
      )}
    >
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
              {devices.map((d) => (
                <li key={d.key} className="rounded-full bg-fill-soft px-2.5 py-1 text-[11px] font-medium text-ink-2">
                  {d.label}
                </li>
              ))}
            </ul>
          )}

          {bed.clinicalGoals && (
            <p className="mt-auto line-clamp-2 pt-4 text-[12px] leading-relaxed text-ink-3">{bed.clinicalGoals}</p>
          )}
        </div>
      ) : (
        <div className="pointer-events-none relative mt-5 flex flex-1 flex-col justify-end">
          <p className="pointer-events-none text-[13px] text-ink-3">
            {bed.status === 'available' ? 'พร้อมรับผู้ป่วยใหม่' : 'รอทำความสะอาดและเตรียมเตียง'}
          </p>
          {bed.status === 'available' ? (
            <span className="pointer-events-none mt-3 inline-flex h-9 w-fit items-center rounded-full bg-ink px-4 text-[13px] font-medium text-on-ink transition-opacity group-hover:opacity-85">
              รับผู้ป่วย
            </span>
          ) : (
            <button
              type="button"
              onClick={onMarkReady}
              className="pointer-events-auto relative mt-3 inline-flex h-9 w-fit items-center rounded-full bg-fill px-4 text-[13px] font-medium text-ink transition-colors hover:bg-line-strong"
            >
              พร้อมใช้งาน
            </button>
          )}
        </div>
      )}
    </article>
  );
}
