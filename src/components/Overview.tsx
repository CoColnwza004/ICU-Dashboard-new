import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { HOSPITAL, INDICATORS, STATUS_META, UNIT } from '../lib/constants';
import { fmtDateLong, fmtDayMonth, fmtDateShort, shiftDate, todayKey } from '../lib/date';
import { useNow, type View } from '../lib/hooks';
import { countsFromBeds, emptyDaily, findDaily, occupied, updateBed } from '../lib/logic';
import { sheetLink } from '../lib/sheetApi';
import { useStore } from '../lib/store';
import { BedCard } from './BedCard';
import { SeriesChart } from './charts';
import { Button, cx, Dot, SectionHeader } from './ui';

export function Overview({
  onOpenBed,
  onAdmit,
  onView,
  onSettings,
}: {
  onOpenBed: (bedNumber: string) => void;
  onAdmit: () => void;
  onView: (v: View) => void;
  onSettings: () => void;
}) {
  const { data, meta, state, commit } = useStore();
  const now = useNow(1000);
  const today = todayKey();
  const beds = data.beds;
  const occ = occupied(beds);
  const total = beds.length;
  const rate = total ? Math.round((occ.length / total) * 100) : 0;
  const vent = occ.filter((b) => b.onVentilator).length;
  const critical = occ.filter((b) => b.acuity === 'Critical').length;
  const free = beds.filter((b) => b.status === 'available').length;

  const todayRec = findDaily(data.daily, today) ?? { ...emptyDaily(today), ...countsFromBeds(beds) };
  const outsToday = data.logs.filter((l) => l.timestamp.startsWith(today) && l.event !== 'admit').length;

  const trend = useMemo(() => {
    const out: { date: string; totalInWard: number | null }[] = [];
    for (let i = 13; i >= 0; i--) {
      const date = shiftDate(today, -i);
      const r = findDaily(data.daily, date);
      // วันที่ไม่มีข้อมูลแสดงเป็นช่องว่าง ไม่ใช่ 0
      out.push({ date, totalInWard: r ? r.totalInWard : date === today ? occ.length : null });
    }
    return out;
  }, [data.daily, today, occ.length]);

  const clock = new Date(now).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-16 sm:space-y-20">
      {/* Hero */}
      <section className="animate-rise pt-6 sm:pt-12">
        <p className="eyebrow">
          {fmtDateLong(today)} · <span className="num">{clock}</span> น.
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="display text-[40px] sm:text-[56px]">{UNIT}</h1>
            <p className="mt-2 text-[17px] text-ink-2 sm:text-[19px]">
              {HOSPITAL} · {total} เตียง
            </p>
          </div>
          <Button variant="primary" size="lg" onClick={onAdmit} disabled={free + beds.filter((b) => b.status === 'cleaning').length === 0}>
            รับผู้ป่วยใหม่
          </Button>
        </div>

        {/* Key figures */}
        <div className="card mt-10 grid grid-cols-2 lg:grid-cols-4">
          <Figure label="ผู้ป่วยขณะนี้" className="border-r border-b border-line lg:border-b-0">
            <span className="num text-[44px] font-semibold sm:text-[56px]">{occ.length}</span>
            <span className="num ml-1 text-[20px] text-ink-3">/ {total}</span>
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-fill">
              <div className="h-full rounded-full bg-ink transition-[width] duration-700" style={{ width: `${rate}%` }} />
            </div>
            <p className="mt-2 text-[12px] text-ink-3">อัตราครองเตียง {rate}%</p>
          </Figure>
          <Figure label="เตียงว่าง" className="border-b border-line lg:border-r lg:border-b-0">
            <span className="num text-[44px] font-semibold sm:text-[56px]">{free}</span>
            <p className="mt-4 text-[12px] text-ink-3">
              ทำความสะอาด {beds.filter((b) => b.status === 'cleaning').length} เตียง
            </p>
          </Figure>
          <Figure label="ใช้เครื่องช่วยหายใจ" className="border-r border-line">
            <span className="num text-[44px] font-semibold sm:text-[56px]">{vent}</span>
            <p className="mt-4 text-[12px] text-ink-3">
              {occ.length ? Math.round((vent / occ.length) * 100) : 0}% ของผู้ป่วย
            </p>
          </Figure>
          <Figure label="ระดับวิกฤต (Critical)">
            <span className="num text-[44px] font-semibold sm:text-[56px]">{critical}</span>
            <p className="mt-4 text-[12px] text-ink-3">
              วันนี้ รับใหม่ {todayRec.admittedNew} · ออก {outsToday}
            </p>
          </Figure>
        </div>
      </section>

      {/* Beds */}
      <section>
        <SectionHeader
          eyebrow="ผังเตียง"
          title="เตียงผู้ป่วย"
          description="แตะที่เตียงเพื่อรับผู้ป่วย แก้ไขอุปกรณ์ หรือจำหน่าย — ทุกการเปลี่ยนแปลงบันทึกลง Google Sheet"
          action={
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
              {(['occupied', 'available', 'cleaning'] as const).map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <Dot className={STATUS_META[s].dot} />
                  {STATUS_META[s].label} {beds.filter((b) => b.status === s).length}
                </li>
              ))}
            </ul>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {beds.map((b) => (
            <BedCard
              key={b.bedNumber}
              bed={b}
              sheetHref={sheetLink(meta, 'beds', b.row)}
              onOpen={() => onOpenBed(b.bedNumber)}
              onMarkReady={() =>
                void commit((d) => updateBed(d, b.bedNumber, { status: 'available' }), `${b.bedNumber} พร้อมใช้งาน`)
              }
            />
          ))}
        </div>
      </section>

      {/* Today + trend */}
      <section className="grid gap-4 lg:grid-cols-5">
        <div className="card p-6 sm:p-8 lg:col-span-3">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">12 ตัวชี้วัด · {fmtDateShort(today)}</p>
              <h3 className="display mt-1 text-[22px]">สรุปวันนี้</h3>
            </div>
            <button type="button" onClick={() => onView('indicators')} className="link inline-flex items-center text-[14px]">
              ดูและแก้ไข <ChevronRight className="size-4" />
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 sm:grid-cols-3">
            {INDICATORS.map((i) => (
              <div key={i.key} className="flex items-baseline justify-between gap-3 border-t border-line py-3">
                <dt className="truncate text-[13px] text-ink-2">{i.label}</dt>
                <dd className="num text-[17px] font-semibold">{todayRec[i.key]}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="card flex flex-col p-6 sm:p-8 lg:col-span-2">
          <p className="eyebrow">14 วันล่าสุด</p>
          <h3 className="display mt-1 mb-6 text-[22px]">ผู้ป่วยในวอร์ด</h3>
          <div className="mt-auto">
            <SeriesChart
              data={trend}
              xKey="date"
              series={[{ key: 'totalInWard', label: 'ผู้ป่วยในวอร์ด', kind: 'area' }]}
              height={180}
              xFormat={fmtDayMonth}
              labelFormat={fmtDateShort}
              yMax={Math.max(total, 1)}
            />
          </div>
        </div>
      </section>

      {/* Google Sheet */}
      <section className="card flex flex-col items-start justify-between gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
        <div>
          <p className="eyebrow">Google Sheets</p>
          <h3 className="display mt-1 text-[22px]">
            {state === 'local' ? 'เชื่อมข้อมูลกับ Google Sheet' : meta?.title || 'เชื่อมต่อ Google Sheet แล้ว'}
          </h3>
          <p className="mt-1 max-w-xl text-[14px] text-ink-2">
            {state === 'local'
              ? 'ตอนนี้ข้อมูลเก็บอยู่ในเบราว์เซอร์นี้เท่านั้น เชื่อมกับ Google Sheet เพื่อแก้ไขได้ทั้งในชีตและบนเว็บ และให้ทุกเครื่องเห็นข้อมูลเดียวกันแบบเรียลไทม์'
              : 'แก้ไขในชีต หน้าเว็บจะอัปเดตเองภายในไม่กี่วินาที · แก้ไขบนเว็บ ข้อมูลจะถูกเขียนกลับไปที่ชีตทันที'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {meta && (
            <>
              <a
                href={sheetLink(meta, 'beds') ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-1 rounded-full bg-fill px-5 text-[14px] font-medium transition-colors hover:bg-line-strong"
              >
                เปิดชีต <ArrowUpRight className="size-4" />
              </a>
            </>
          )}
          <Button variant={state === 'local' ? 'primary' : 'ghost'} onClick={onSettings} className={cx(state !== 'local' && 'bg-fill-soft')}>
            {state === 'local' ? 'เชื่อมต่อ' : 'ตั้งค่า'}
          </Button>
        </div>
      </section>
    </div>
  );
}

function Figure({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('p-6 sm:p-8', className)}>
      <p className="mb-3 text-[13px] text-ink-2">{label}</p>
      <div className="leading-none">{children}</div>
    </div>
  );
}
