import { ArrowUpRight, BedDouble, ChevronRight, Maximize, Siren, Users, Wind } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { DEVICES, EVENT_META, HOSPITAL, INDICATORS, STATUS_META, UNIT } from '../lib/constants';
import { fmtDateLong, fmtDateShort, fmtDateTime, fmtDayMonth, shiftDate, todayKey } from '../lib/date';
import { useNow, type View } from '../lib/hooks';
import { DEVICE_ICON, EVENT_ICON, INDICATOR_ICON } from '../lib/icons';
import { countsFromBeds, emptyDaily, findDaily, occupied, updateBed } from '../lib/logic';
import { sheetLink } from '../lib/sheetApi';
import { useStore } from '../lib/store';
import type { DailyKey } from '../types';
import { BedCard } from './BedCard';
import { enterFullscreen } from './WallView';
import { bedAcuitySlices, bedStatusSlices } from '../lib/breakdowns';
import { CHART_TYPES, DonutChart, SeriesChart, type ChartType } from './charts';
import { Button, cx, Dot, Empty, SectionHeader, Segmented } from './ui';
import { AcuityBar, BedStrip, Delta, Ring, Sparkline } from './viz';

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
  const cleaning = beds.filter((b) => b.status === 'cleaning').length;

  // แถวของวันนี้ในแท็บ Daily (ถ้ายังไม่มี คำนวณจากผังเตียงปัจจุบัน)
  const todayRec = findDaily(data.daily, today) ?? { ...emptyDaily(today), ...countsFromBeds(beds) };
  const yesterday = findDaily(data.daily, shiftDate(today, -1));

  /** 14 วันล่าสุดของตัวชี้วัดหนึ่ง — วันนี้ใช้ค่าจากผังเตียงสด */
  const series = (k: DailyKey) =>
    Array.from({ length: 14 }, (_, i) => {
      const d = shiftDate(today, i - 13);
      if (d === today) return todayRec[k];
      return findDaily(data.daily, d)?.[k] ?? null;
    });

  const trend = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const date = shiftDate(today, i - 13);
        const r = findDaily(data.daily, date);
        return {
          date,
          totalInWard: date === today ? occ.length : (r?.totalInWard ?? null),
          admittedNew: r?.admittedNew ?? null,
        };
      }),
    [data.daily, today, occ.length],
  );

  const recent = useMemo(
    () => [...data.logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 6),
    [data.logs],
  );

  const [chartType, setChartType] = useState<ChartType>('auto');
  const clock = new Date(now).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-14 sm:space-y-16">
      {/* Hero */}
      <section className="animate-rise pt-8 sm:pt-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] text-ink-2">
              <span className="relative inline-flex">
                <Dot className="bg-good" />
                <span className="absolute inset-0 animate-ping rounded-full bg-good/40 [animation-duration:2.4s]" />
              </span>
              {fmtDateLong(today)} · <span className="num text-ink">{clock}</span> น.
            </p>
            <h1 className="display mt-4 text-[40px] sm:text-[58px]">{UNIT}</h1>
            <p className="mt-2 text-[17px] text-ink-2 sm:text-[19px]">
              {HOSPITAL} · {total} เตียง · ผู้ป่วย {occ.length} ราย
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                void enterFullscreen();
                onView('wall');
              }}
            >
              <Maximize className="size-4" strokeWidth={1.8} />
              โหมดเต็มจอ
            </Button>
            <Button variant="primary" size="lg" onClick={onAdmit} disabled={free + cleaning === 0}>
              รับผู้ป่วยใหม่
            </Button>
          </div>
        </div>

        {/* Key figures */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tile icon={<Users className="size-[18px]" strokeWidth={1.7} />} label="ผู้ป่วยขณะนี้">
            <div className="flex items-center justify-between gap-3">
              <p>
                <span className="num text-[52px] leading-none font-semibold">{occ.length}</span>
                <span className="num ml-1 text-[20px] text-ink-3">/ {total}</span>
              </p>
              <Ring value={rate} label="อัตราครองเตียง" />
            </div>
            <div className="mt-auto flex items-center justify-between gap-2 pt-4">
              <span className="text-[12px] text-ink-3">อัตราครองเตียง</span>
              <Delta value={yesterday ? occ.length - yesterday.totalInWard : null} />
            </div>
          </Tile>

          <Tile icon={<BedDouble className="size-[18px]" strokeWidth={1.7} />} label="เตียงว่าง">
            <p>
              <span className="num text-[52px] leading-none font-semibold">{free}</span>
              <span className="ml-2 text-[13px] text-ink-3">ทำความสะอาด {cleaning}</span>
            </p>
            <div className="mt-auto pt-5">
              <BedStrip beds={beds} />
            </div>
          </Tile>

          <Tile icon={<Wind className="size-[18px]" strokeWidth={1.7} />} label="ใช้เครื่องช่วยหายใจ">
            <p>
              <span className="num text-[52px] leading-none font-semibold">{vent}</span>
              <span className="ml-2 text-[13px] text-ink-3">
                {occ.length ? Math.round((vent / occ.length) * 100) : 0}% ของผู้ป่วย
              </span>
            </p>
            <div className="mt-auto pt-4">
              <Sparkline values={series('ventilatorCount')} max={total} label="Ventilator 14 วัน" />
              <p className="mt-1 text-[11px] text-ink-3">14 วันล่าสุด</p>
            </div>
          </Tile>

          <Tile icon={<Siren className="size-[18px]" strokeWidth={1.7} />} label="ระดับวิกฤต (Critical)">
            <p>
              <span className="num text-[52px] leading-none font-semibold">{critical}</span>
              <span className="ml-2 text-[13px] text-ink-3">จาก {occ.length} ราย</span>
            </p>
            <div className="mt-auto pt-5">
              <AcuityBar beds={beds} />
            </div>
          </Tile>
        </div>
      </section>

      {/* Beds */}
      <section>
        <SectionHeader
          eyebrow="ผังเตียง"
          title="เตียงผู้ป่วย"
          description="แตะที่เตียงเพื่อรับผู้ป่วย แก้ไขอุปกรณ์ หรือจำหน่าย — ทุกการเปลี่ยนแปลงบันทึกลง Google Sheet"
          action={
            <ul className="glass flex flex-wrap gap-x-4 gap-y-1 rounded-full px-4 py-2 text-[12px] text-ink-2">
              {(['occupied', 'available', 'cleaning'] as const).map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <Dot className={STATUS_META[s].dot} />
                  {STATUS_META[s].label} <span className="num text-ink">{beds.filter((b) => b.status === s).length}</span>
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

      {/* Today + devices */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card p-6 sm:p-7 lg:col-span-2">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">12 ตัวชี้วัด · {fmtDateShort(today)}</p>
              <h3 className="display mt-1 text-[22px]">สรุปวันนี้</h3>
            </div>
            <button type="button" onClick={() => onView('indicators')} className="link inline-flex items-center text-[14px]">
              ดูและแก้ไข <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {INDICATORS.map((i) => {
              const Icon = INDICATOR_ICON[i.key];
              return (
                <div key={i.key} className="well flex items-center gap-3 px-3.5 py-3">
                  <Icon className="size-4 shrink-0 text-ink-3" strokeWidth={1.7} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-ink-2">{i.label}</p>
                    <p className="num text-[20px] leading-tight font-semibold">{todayRec[i.key]}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-6 sm:p-7">
          <p className="eyebrow">ขณะนี้</p>
          <h3 className="display mt-1 mb-5 text-[22px]">การใช้อุปกรณ์</h3>
          <ul className="space-y-3">
            {DEVICES.map((d) => {
              const Icon = DEVICE_ICON[d.key];
              const n = occ.filter((b) => b[d.key]).length;
              const pct = occ.length ? (n / occ.length) * 100 : 0;
              return (
                <li key={d.key}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[13px]">
                    <span className="flex items-center gap-2 text-ink-2">
                      <Icon className="size-3.5 text-ink-3" strokeWidth={1.8} />
                      {d.label}
                    </span>
                    <span className="num font-medium">
                      {n}
                      <span className="text-ink-3">/{occ.length}</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-fill">
                    <div
                      className="h-full rounded-full transition-[width] duration-700 ease-[var(--ease-apple)]"
                      style={{ width: `${pct}%`, background: 'linear-gradient(90deg, color-mix(in srgb, var(--color-accent) 55%, transparent), var(--color-accent))' }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Trend + activity */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card flex flex-col p-6 sm:p-7 lg:col-span-2">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">{chartType === 'pie' ? 'ขณะนี้' : '14 วันล่าสุด'}</p>
              <h3 className="display mt-1 text-[22px]">
                {chartType === 'pie' ? 'สัดส่วนเตียงและผู้ป่วย' : 'ผู้ป่วยในวอร์ด และรับใหม่'}
              </h3>
            </div>
            <Segmented options={CHART_TYPES} value={chartType} onChange={setChartType} size="sm" label="รูปแบบกราฟ" />
          </div>
          {chartType === 'pie' ? (
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-3 text-[13px] font-medium text-ink-2">สถานะเตียง</p>
                <DonutChart size={150} unit="เตียง" centerLabel="เตียง" slices={bedStatusSlices(beds)} />
              </div>
              <div>
                <p className="mb-3 text-[13px] font-medium text-ink-2">ความรุนแรงของผู้ป่วย</p>
                <DonutChart size={150} centerLabel="ผู้ป่วย" slices={bedAcuitySlices(beds)} />
              </div>
            </div>
          ) : (
          <div className="mt-auto">
            <SeriesChart
              mode={chartType}
              data={trend}
              xKey="date"
              series={[
                { key: 'totalInWard', label: 'ผู้ป่วยในวอร์ด', kind: 'area' },
                { key: 'admittedNew', label: 'รับใหม่', kind: 'bar' },
              ]}
              height={220}
              xFormat={fmtDayMonth}
              labelFormat={fmtDateShort}
              yMax={Math.max(total, 1)}
            />
          </div>
          )}
        </div>

        <div className="card p-6 sm:p-7">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">ทะเบียน</p>
              <h3 className="display mt-1 text-[22px]">ความเคลื่อนไหวล่าสุด</h3>
            </div>
            <button type="button" onClick={() => onView('monthly')} className="link inline-flex items-center text-[14px]">
              ทั้งหมด <ChevronRight className="size-4" />
            </button>
          </div>
          {recent.length === 0 ? (
            <Empty title="ยังไม่มีรายการ">รับหรือจำหน่ายผู้ป่วยแล้วรายการจะแสดงที่นี่</Empty>
          ) : (
            <ol className="relative space-y-1">
              {recent.map((l, i) => {
                const Icon = EVENT_ICON[l.event];
                const admit = l.event === 'admit';
                return (
                  <li key={`${l.timestamp}-${i}`} className="relative flex gap-3 py-2">
                    {i < recent.length - 1 && <span className="absolute top-11 bottom-[-6px] left-[16px] w-px bg-line" aria-hidden />}
                    <span className={cx('icon-chip shrink-0 rounded-full', admit && 'text-accent')}>
                      <Icon className="size-4" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className="truncate text-[14px]">
                        {EVENT_META[l.event].label} <span className="num text-ink-2">· {l.bedNumber}</span>
                      </p>
                      <p className="truncate text-[12px] text-ink-3">
                        {fmtDateTime(l.timestamp)}
                        {l.caseCode && ` · ${l.caseCode}`}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>

      {/* Google Sheet */}
      <section className="card relative flex flex-col items-start justify-between gap-6 overflow-hidden p-6 sm:flex-row sm:items-center sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 -z-10 size-72 rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(circle, #34a853 0%, transparent 65%)' }}
        />
        <div className="flex items-start gap-4">
          <span className="icon-chip size-12 shrink-0 rounded-2xl text-[#188038]">
            <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
              <path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm4 18H6V4h7v5h5v11ZM8 12h8v2h-3v4h-2v-4H8v-2Z" />
            </svg>
          </span>
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
        </div>
        <div className="flex flex-wrap gap-2">
          {meta && (
            <a
              href={sheetLink(meta, 'beds') ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="btn-glass inline-flex h-10 items-center gap-1 rounded-full px-5 text-[14px] font-medium"
            >
              เปิดชีต <ArrowUpRight className="size-4" />
            </a>
          )}
          <Button variant={state === 'local' ? 'primary' : 'secondary'} onClick={onSettings}>
            {state === 'local' ? 'เชื่อมต่อ' : 'ตั้งค่า'}
          </Button>
        </div>
      </section>
    </div>
  );
}

function Tile({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="card flex min-h-[210px] flex-col p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="icon-chip">{icon}</span>
        <p className="text-[13px] font-medium text-ink-2">{label}</p>
      </div>
      {children}
    </div>
  );
}
