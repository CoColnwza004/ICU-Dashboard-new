import { ArrowUpRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EVENT_META, INDICATORS } from '../lib/constants';
import { fmtDateLong, fmtDateShort, fmtDateTime, fmtDayMonth, fmtMonth, parseLocalDateTime } from '../lib/date';
import { availableMonths, monthlySummary } from '../lib/logic';
import { sheetLink } from '../lib/sheetApi';
import { useStore } from '../lib/store';
import type { IcuData } from '../types';
import { SeriesChart } from './charts';
import { Button, cx, Dot, Empty, Segmented } from './ui';

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
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ICU-รายงาน-${ym}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

export function Monthly({ onPrint }: { onPrint: (ym: string) => void }) {
  const { data, meta } = useStore();
  const months = useMemo(() => availableMonths(data), [data]);
  const [ym, setYm] = useState(months[0]);
  const [filter, setFilter] = useState<Filter>('all');
  const s = useMemo(() => monthlySummary(data, ym), [data, ym]);

  const logs = s.logs.filter((l) => filter === 'all' || (filter === 'in' ? l.event === 'admit' : l.event !== 'admit'));

  const figures = [
    { label: 'รับใหม่', value: s.admissions, unit: 'ราย' },
    { label: 'Refer / ย้ายวอร์ด', value: s.refers, unit: 'ราย' },
    { label: 'เสียชีวิต', value: s.deaths, unit: 'ราย' },
    { label: 'อัตราครองเตียงเฉลี่ย', value: s.occupancy, unit: '%' },
    { label: 'วันนอนเฉลี่ย (ALOS)', value: s.alos, unit: 'วัน' },
    { label: 'Ventilator utilization', value: s.ventilatorRate, unit: '%' },
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
              className="field h-10 w-auto rounded-full py-0 pr-9"
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
            <Button variant="primary" onClick={() => onPrint(ym)}>
              พิมพ์ / PDF
            </Button>
          </div>
        </div>

        <div className="card mt-10 grid grid-cols-2 md:grid-cols-3">
          {figures.map((f, i) => (
            <div
              key={f.label}
              className={cx(
                'border-line p-6 sm:p-8',
                i % 2 === 0 ? 'border-r' : 'border-r-0',
                i < 4 ? 'border-b' : 'border-b-0',
                i % 3 !== 2 ? 'md:border-r' : 'md:border-r-0',
                i < 3 ? 'md:border-b' : 'md:border-b-0',
              )}
            >
              <p className="text-[13px] text-ink-2">{f.label}</p>
              <p className="mt-2">
                <span className="num text-[36px] font-semibold sm:text-[44px]">{f.value}</span>
                <span className="ml-1 text-[15px] text-ink-3">{f.unit}</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-6 sm:p-8">
        <p className="eyebrow">รายวัน</p>
        <h3 className="display mt-1 mb-6 text-[22px]">รับเข้า–ออก และผู้ป่วยในวอร์ด</h3>
        {s.days.length === 0 ? (
          <Empty title="ยังไม่มีข้อมูลรายวันในเดือนนี้" />
        ) : (
          <SeriesChart
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
                  const los = l.event !== 'admit' && a && b ? Math.max(0, (b.getTime() - a.getTime()) / 86_400_000) : null;
                  return (
                    <tr key={`${l.row ?? idx}-${l.timestamp}`} className="border-b border-line/60 last:border-0">
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
