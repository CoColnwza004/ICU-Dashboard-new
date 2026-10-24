import { Activity, Download, Printer, Ambulance, ArrowUpRight, BedDouble, ChevronRight, Clock, HeartCrack, Repeat, Timer, UserPlus, Wind } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EVENT_META, INDICATORS } from '../lib/constants';
import { fmtDateLong, fmtDateShort, fmtDateTime, fmtDayMonth, fmtMonth, parseLocalDateTime } from '../lib/date';
import { availableMonths, monthlySummary } from '../lib/logic';
import { sheetLink } from '../lib/sheetApi';
import { fmtStat, STAT_DEFS, statsFor } from '../lib/stats';
import { useStore } from '../lib/store';
import type { IcuData } from '../types';
import { admitAcuitySlices, dischargeSlices, sumSlices } from '../lib/breakdowns';
import { CHART_TYPES, DonutChart, SeriesChart, type ChartType } from './charts';
import { Button, Dot, Empty, Segmented } from './ui';

type Filter = 'all' | 'in' | 'out';

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const downloadMonthCsv = (data: IcuData, ym: string) => {
  const s = monthlySummary(data, ym);
  const lines = [
    ['วันที่', ...INDICATORS.map((i) => i.label), 'หมายเหตุ'].join(','),
    ...s.days.map((d) => [d.date, ...INDICATORS.map((i) => d[i.key]), csvCell(d.notes)].join(',')),
    '',
    ['เวลา', 'เหตุการณ์', 'เตียง', 'รหัสเคส', 'ระดับความรุนแรง', 'วันที่รับเข้า', 'หมายเหตุ'].join(','),
    ...s.logs.map((l) =>
      [l.timestamp, EVENT_META[l.event].label, l.bedNumber, l.caseCode, l.acuity, l.admittedAt, l.note].map(csvCell).join(','),
    ),
  ];
  const st = statsFor(data, ym);
  lines.push(
    '',
    ['จำนวนเตียง', 'จำนวนวัน', 'วันนอนรวม', 'ผู้ป่วยจำหน่าย', ...STAT_DEFS.map((d) => `${d.label} (${d.unit})`)].join(','),
    [st.input.beds, st.input.days, st.input.patientDays, st.input.discharges, ...STAT_DEFS.map((d) => fmtStat(st.values[d.key]))].join(','),
  );
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ICU-monthly-${ym}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

export function Monthly({
  onPrint,
  onPdf,
  pdfBusy,
}: {
  onPrint: (ym: string) => void;
  onPdf: (ym: string) => void;
  pdfBusy: boolean;
}) {
  const { data, meta } = useStore();
  const months = useMemo(() => availableMonths(data), [data]);
  const [ym, setYm] = useState(months[0]);
  const [filter, setFilter] = useState<Filter>('all');
  const [chartType, setChartType] = useState<ChartType>('auto');
  const s = useMemo(() => monthlySummary(data, ym), [data, ym]);
  const st = useMemo(() => statsFor(data, ym), [data, ym]);

  const logs = s.logs.filter((l) => filter === 'all' || (filter === 'in' ? l.event === 'admit' : EVENT_META[l.event].out));

  const figures = [
    { label: 'รับใหม่', value: s.admissions, unit: 'ราย', Icon: UserPlus },
    { label: 'Refer / ย้ายวอร์ด', value: s.refers, unit: 'ราย', Icon: Ambulance },
    { label: 'เสียชีวิต', value: s.deaths, unit: 'ราย', Icon: HeartCrack },
    { label: 'Ventilator utilization', value: s.ventilatorRate, unit: '%', Icon: Wind },
    { label: 'ADC · ผู้ป่วยเฉลี่ยต่อวัน', value: fmtStat(st.values.adc), unit: 'ราย/วัน', Icon: Activity },
    { label: 'ALOS · วันนอนเฉลี่ย', value: fmtStat(st.values.alos), unit: 'วัน', Icon: Clock },
    { label: 'BOR · อัตราครองเตียง', value: fmtStat(st.values.bor), unit: '%', Icon: BedDouble },
    { label: 'BTR · อัตราหมุนเวียนเตียง', value: fmtStat(st.values.btr), unit: 'ครั้ง/เตียง', Icon: Repeat },
    { label: 'TOI · เตียงว่างเฉลี่ย', value: fmtStat(st.values.toi), unit: 'วัน', Icon: Timer },
  ];

  return (
    <div className="space-y-14 pt-6 sm:space-y-16 sm:pt-12">
      <section className="animate-rise">
        <p className="eyebrow">รายงานประจำเดือน</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="display text-[34px] sm:text-[48px]">{fmtMonth(ym)}</h1>
            <p className="mt-2 text-[15px] text-ink-2">
              ข้อมูล {s.days.length} วัน · {s.patientDays} patient-days
              {s.peak && s.peak.totalInWard > 0 && ` · สูงสุด ${s.peak.totalInWard} ราย (${fmtDateShort(s.peak.date)})`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="เลือกเดือน"
              className="field btn-glass h-10 w-auto rounded-full py-0 pr-9"
              value={ym}
              onChange={(e) => setYm(e.target.value)}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {fmtMonth(m)}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={() => downloadMonthCsv(data, ym)}>
              CSV
            </Button>
            <Button variant="ghost" onClick={() => onPrint(ym)}>
              <Printer className="size-4" strokeWidth={1.8} />
              พิมพ์
            </Button>
            <Button variant="primary" onClick={() => onPdf(ym)} disabled={pdfBusy}>
                  <Download className="size-4" strokeWidth={1.8} />
                  {pdfBusy ? 'กำลังสร้าง PDF…' : 'บันทึก PDF'}
                </Button>
          </div>
        </div>

        <div className="mt-10 mb-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-2">
          <span>
            ADC · ALOS · BOR · BTR · TOI {st.saved ? 'จากแท็บ Stats' : 'คำนวณจากข้อมูลในระบบ'} ({st.input.beds} เตียง ·{' '}
            {st.input.days} วัน · วันนอนรวม {st.input.patientDays} · จำหน่าย {st.input.discharges})
          </span>
          <a href="#stats" className="link inline-flex items-center">
            กรอก / แก้ไขสถิติ <ChevronRight className="size-4" />
          </a>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {figures.map(({ label, value, unit, Icon }) => (
            <div key={label} className="card p-5 sm:p-6">
              <div className="flex items-center gap-2.5">
                <span className="icon-chip">
                  <Icon className="size-[18px]" strokeWidth={1.7} />
                </span>
                <p className="text-[13px] font-medium text-ink-2">{label}</p>
              </div>
              <p className="mt-4">
                <span className="num text-[36px] font-semibold sm:text-[44px]">{value}</span>
                <span className="ml-1 text-[15px] text-ink-3">{unit}</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-6 sm:p-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">รายวัน</p>
            <h3 className="display mt-1 text-[22px]">
              รับเข้า–ออก และผู้ป่วยในวอร์ด
              {chartType === 'pie' && <span className="text-ink-3"> · สัดส่วนทั้งเดือน</span>}
            </h3>
          </div>
          <Segmented options={CHART_TYPES} value={chartType} onChange={setChartType} size="sm" label="รูปแบบกราฟ" />
        </div>
        {s.days.length === 0 ? (
          <Empty title="ยังไม่มีข้อมูลรายวันในเดือนนี้" />
        ) : chartType === 'pie' ? (
          <DonutChart size={240} centerLabel="เหตุการณ์" slices={sumSlices(s.days, ['admittedNew', 'referCount', 'deathCount'])} />
        ) : (
          <SeriesChart
            mode={chartType}
            data={s.days}
            xKey="date"
            series={[
              { key: 'totalInWard', label: 'ผู้ป่วยในวอร์ด', kind: 'line' },
              { key: 'admittedNew', label: 'รับใหม่', kind: 'bar' },
              { key: 'referCount', label: 'Refer / ย้าย', kind: 'bar' },
              { key: 'deathCount', label: 'เสียชีวิต', kind: 'bar' },
            ]}
            height={300}
            xFormat={fmtDayMonth}
            labelFormat={fmtDateLong}
          />
        )}
      </section>

      {/* สัดส่วน (แผนภูมิวงกลม) */}
      <section>
        <p className="eyebrow">สัดส่วน · {fmtMonth(ym)}</p>
        <h2 className="display mt-1 mb-5 text-[24px] sm:text-[28px]">สรุปแบบแผนภูมิวงกลม</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card p-6">
            <h3 className="mb-4 text-[15px] font-semibold">ประเภทการจำหน่าย</h3>
            <DonutChart size={170} centerLabel="จำหน่าย" slices={dischargeSlices(s.logs)} />
          </div>
          <div className="card p-6">
            <h3 className="mb-4 text-[15px] font-semibold">ความรุนแรงเมื่อรับเข้า</h3>
            <DonutChart size={170} centerLabel="รับเข้า" slices={admitAcuitySlices(s.logs)} />
          </div>
          <div className="card p-6">
            <h3 className="mb-4 text-[15px] font-semibold">อุปกรณ์ (ผู้ป่วย-วัน)</h3>
            <DonutChart
              size={170}
              unit="ผู้ป่วย-วัน"
              centerLabel="ผู้ป่วย-วัน"
              slices={sumSlices(s.days, ['ventilatorCount', 'cLineCount', 'foleyCount', 'ivHlCount'])}
            />
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 p-6 pb-4 sm:p-8 sm:pb-4">
          <div>
            <p className="eyebrow">ทะเบียน · ไม่ระบุตัวตน</p>
            <h3 className="display mt-1 text-[22px]">ผู้ป่วยเข้า–ออก</h3>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented<Filter>
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: `ทั้งหมด ${s.logs.length}` },
                { value: 'in', label: 'รับเข้า' },
                { value: 'out', label: 'จำหน่าย' },
              ]}
              label="ตัวกรองทะเบียน"
            />
            {meta && (
              <a className="link inline-flex items-center gap-0.5 text-[14px]" href={sheetLink(meta, 'log') ?? '#'} target="_blank" rel="noreferrer">
                แท็บ Log <ArrowUpRight className="size-3.5" />
              </a>
            )}
          </div>
        </div>
        {logs.length === 0 ? (
          <Empty title="ไม่มีรายการในเดือนนี้">รายการจะถูกเพิ่มอัตโนมัติเมื่อรับหรือจำหน่ายผู้ป่วยจากหน้าผังเตียง</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="border-y border-line text-left text-[11px] text-ink-3">
                  <th className="py-2.5 pr-3 pl-6 font-medium sm:pl-8">เวลา</th>
                  <th className="px-3 py-2.5 font-medium">เหตุการณ์</th>
                  <th className="px-3 py-2.5 font-medium">เตียง</th>
                  <th className="px-3 py-2.5 font-medium">รหัสเคส</th>
                  <th className="px-3 py-2.5 font-medium">ระดับ</th>
                  <th className="px-3 py-2.5 text-right font-medium">นอน (วัน)</th>
                  <th className="py-2.5 pr-6 pl-3 font-medium sm:pr-8">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l, idx) => {
                  const a = parseLocalDateTime(l.admittedAt);
                  const b = parseLocalDateTime(l.timestamp);
                  const los = EVENT_META[l.event].out && a && b ? Math.max(0, (b.getTime() - a.getTime()) / 86_400_000) : null;
                  return (
                    <tr key={`${l.row ?? idx}-${l.timestamp}`} className="border-b border-line transition-colors last:border-0 hover:bg-fill-soft">
                      <td className="py-3 pr-3 pl-6 whitespace-nowrap text-ink-2 sm:pl-8">{fmtDateTime(l.timestamp)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <Dot className={EVENT_META[l.event].out ? 'bg-ink-3' : 'bg-accent'} />
                          {EVENT_META[l.event].label}
                        </span>
                      </td>
                      <td className="num px-3 py-3">{l.bedNumber}</td>
                      <td className="px-3 py-3">{l.caseCode || '—'}</td>
                      <td className="px-3 py-3 text-ink-2">{l.acuity || '—'}</td>
                      <td className="num px-3 py-3 text-right">{los === null ? '—' : los.toFixed(1)}</td>
                      <td className="max-w-[260px] truncate py-3 pr-6 pl-3 text-ink-2 sm:pr-8">{l.note || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
