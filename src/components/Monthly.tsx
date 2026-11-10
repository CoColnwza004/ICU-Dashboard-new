import { Activity, Download, Printer, Ambulance, ArrowUpRight, BedDouble, ChevronRight, ArrowRightLeft, Clock, Forward, HeartCrack, House, Pencil, Plus, Repeat, Trash2, Timer, UserPlus, Wind } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ACUITIES, DEVICES, EVENT_META, INDICATORS } from '../lib/constants';
import { fmtDateLong, fmtDateShort, fmtDateTime, fmtDayMonth, fmtMonth, parseLocalDateTime, toLocalDateTime } from '../lib/date';
import {
  addPastCase,
  availableMonths,
  backfillInfo,
  cancelAdmission,
  caseLogs,
  composeOutNote,
  deleteCase,
  editCase,
  logTime,
  monthlySummary,
  splitOutNote,
  stayDays,
  type OutDetail,
} from '../lib/logic';
import { sheetLink } from '../lib/sheetApi';
import { fmtStat, STAT_DEFS, statsFor } from '../lib/stats';
import { useStore } from '../lib/store';
import type { Acuity, DeviceKey, IcuData, LogEntry, OutEvent } from '../types';
import { admitAcuitySlices, dischargeSlices, sumSlices } from '../lib/breakdowns';
import { CHART_TYPES, DonutChart, SeriesChart, type ChartType } from './charts';
import { Button, ChoicePills, cx, Dot, Empty, Modal, PageHero, Segmented, Switch } from './ui';

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
  onPrint: (ym: string, landscape: boolean) => void;
  onPdf: (ym: string, landscape: boolean) => void;
  pdfBusy: boolean;
}) {
  const { data, meta, isStaff } = useStore();
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [adding, setAdding] = useState(false);
  // แนวกระดาษของรายงานประจำเดือน (จำไว้ในเครื่อง)
  const [paper, setPaper] = useState<'portrait' | 'landscape'>(() => {
    try {
      return localStorage.getItem('icu.monthly.paper.v1') === 'landscape' ? 'landscape' : 'portrait';
    } catch {
      return 'portrait';
    }
  });
  const setPaperPref = (v: 'portrait' | 'landscape') => {
    setPaper(v);
    try {
      localStorage.setItem('icu.monthly.paper.v1', v);
    } catch {
      /* ไม่บันทึกก็ได้ */
    }
  };
  const months = useMemo(() => availableMonths(data), [data]);
  const [ym, setYm] = useState(months[0]);
  const [filter, setFilter] = useState<Filter>('all');
  const [chartType, setChartType] = useState<ChartType>('auto');
  const s = useMemo(() => monthlySummary(data, ym), [data, ym]);
  const st = useMemo(() => statsFor(data, ym), [data, ym]);

  const logs = s.logs.filter((l) => filter === 'all' || (filter === 'in' ? l.event === 'admit' : EVENT_META[l.event].out));
  /** แตะแถวไหนของเคสก็ได้ → เปิดเคสนั้น (ใช้แถวจำหน่ายถ้ามี) */
  const openCase = (l: LogEntry) => {
    if (EVENT_META[l.event].out) return setEditing(l);
    const out = caseLogs(data.logs, l).find((x) => EVENT_META[x.event].out);
    setEditing(out ?? l);
  };

  const figures = [
    { label: 'รับใหม่', value: s.admissions, unit: 'ราย', Icon: UserPlus },
    { label: 'กลับบ้าน', value: s.homes, unit: 'ราย', Icon: House },
    { label: 'ย้ายวอร์ด', value: s.wards, unit: 'ราย', Icon: ArrowRightLeft },
    { label: 'Refer', value: s.refers, unit: 'ราย', Icon: Ambulance },
    { label: 'เสียชีวิต', value: s.deaths, unit: 'ราย', Icon: HeartCrack },
    { label: 'ยกยอดเดือนถัดไป', value: s.carries, unit: 'ราย', Icon: Forward },
    { label: 'Ventilator utilization', value: s.ventilatorRate, unit: '%', Icon: Wind },
    { label: 'ADC · ผู้ป่วยเฉลี่ยต่อวัน', value: fmtStat(st.values.adc), unit: 'ราย/วัน', Icon: Activity },
    { label: 'ALOS · วันนอนเฉลี่ย', value: fmtStat(st.values.alos), unit: 'วัน', Icon: Clock },
    { label: 'BOR · อัตราครองเตียง', value: fmtStat(st.values.bor), unit: '%', Icon: BedDouble },
    { label: 'BTR · อัตราหมุนเวียนเตียง', value: fmtStat(st.values.btr), unit: 'ครั้ง/เตียง', Icon: Repeat },
    { label: 'TOI · เตียงว่างเฉลี่ย', value: fmtStat(st.values.toi), unit: 'วัน', Icon: Timer },
  ];

  return (
    <div className="space-y-14 sm:space-y-16">
      <PageHero
        eyebrow="รายงานประจำเดือน"
        tone="#6250d6"
        title={fmtMonth(ym)}
        subtitle={`ข้อมูล ${s.days.length} วัน · ${s.patientDays} patient-days${
          s.peak && s.peak.totalInWard > 0 ? ` · สูงสุด ${s.peak.totalInWard} ราย (${fmtDateShort(s.peak.date)})` : ''
        }`}
        actions={
          <>
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
            <Segmented<'portrait' | 'landscape'>
              size="sm"
              value={paper}
              onChange={setPaperPref}
              label="รูปแบบกระดาษ"
              options={[
                { value: 'portrait', label: 'แนวตั้ง' },
                { value: 'landscape', label: 'แนวนอน' },
              ]}
            />
            <Button variant="ghost" onClick={() => onPrint(ym, paper === 'landscape')}>
              <Printer className="size-4" strokeWidth={1.8} />
              พิมพ์
            </Button>
            <Button variant="primary" onClick={() => onPdf(ym, paper === 'landscape')} disabled={pdfBusy}>
              <Download className="size-4" strokeWidth={1.8} />
              {pdfBusy ? 'กำลังสร้าง PDF…' : 'บันทึก PDF'}
            </Button>
          </>
        }
      />

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-2">
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
          <DonutChart size={240} centerLabel="เหตุการณ์" slices={sumSlices(s.days, ['admittedNew', 'homeCount', 'wardCount', 'referCount', 'deathCount', 'carryCount'])} />
        ) : (
          <SeriesChart
            mode={chartType}
            data={s.days}
            xKey="date"
            series={[
              { key: 'totalInWard', label: 'ผู้ป่วยในวอร์ด', kind: 'line' },
              { key: 'admittedNew', label: 'รับใหม่', kind: 'bar' },
              { key: 'homeCount', label: 'กลับบ้าน', kind: 'bar' },
              { key: 'wardCount', label: 'ย้ายวอร์ด', kind: 'bar' },
              { key: 'referCount', label: 'Refer', kind: 'bar' },
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
            {isStaff && (
              <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
                <Plus className="size-4" strokeWidth={2} />
                เพิ่มเคสย้อนหลัง
              </Button>
            )}
            {meta?.spreadsheetUrl && (
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
                  {isStaff && (
                    <th className="sticky right-0 bg-surface py-2.5 pr-4 pl-2 font-medium sm:pr-6">
                      <span className="sr-only">แก้ไข / ลบ</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {logs.map((l, idx) => {
                  const a = parseLocalDateTime(l.admittedAt);
                  const b = parseLocalDateTime(l.timestamp);
                  const los = EVENT_META[l.event].out && a && b ? Math.max(0, (b.getTime() - a.getTime()) / 86_400_000) : null;
                  return (
                    <tr
                      key={`${l.row ?? idx}-${l.timestamp}`}
                      onClick={isStaff ? () => openCase(l) : undefined}
                      className={cx('group border-b border-line transition-colors last:border-0 hover:bg-fill-soft', isStaff && 'cursor-pointer')}
                    >
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
                      <td className="max-w-[340px] min-w-[200px] py-3 pr-6 pl-3 text-[13px] leading-snug text-ink-2 sm:pr-8" title={l.note}>
                        <span className="line-clamp-3">{l.note || '—'}</span>
                      </td>
                      {isStaff && (
                        <td className="sticky right-0 bg-surface py-3 pr-4 pl-2 transition-colors group-hover:bg-raised sm:pr-6">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openCase(l);
                            }}
                            aria-label={`แก้ไขเคส ${l.caseCode || l.bedNumber} ${fmtDateTime(l.timestamp)}`}
                            title="แก้ไข / ลบเคส"
                            className="inline-flex size-8 items-center justify-center rounded-full bg-fill-soft text-ink-2 transition-colors hover:bg-accent/15 hover:text-accent"
                          >
                            <Pencil className="size-3.5" strokeWidth={1.9} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <EditCaseDialog entry={editing} onClose={() => setEditing(null)} />
      <AddPastCaseDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

/** แก้เคสที่จำหน่ายแล้วย้อนหลัง: เวลารับเข้า · เวลาจำหน่าย · หมายเหตุ */
function EditCaseDialog({ entry, onClose }: { entry: LogEntry | null; onClose: () => void }) {
  const { data, commit } = useStore();
  const [inAt, setInAt] = useState('');
  const [outAt, setOutAt] = useState('');
  const [detail, setDetail] = useState<OutDetail>({});
  const [event, setEvent] = useState<OutEvent>('home');
  const [code, setCode] = useState('');
  const [acuity, setAcuity] = useState<Acuity | ''>('');
  const [bedNo, setBedNo] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const setD = (k: keyof OutDetail, v: string) => setDetail((d) => ({ ...d, [k]: v }));
  const [reverseCensus, setReverseCensus] = useState(false);
  const related = useMemo(() => (entry ? caseLogs(data.logs, entry) : []), [data.logs, entry]);
  const info = useMemo(() => backfillInfo(related), [related]);
  useEffect(() => {
    if (!entry) return;
    setInAt(logTime(entry.admittedAt));
    setOutAt(logTime(entry.timestamp));
    setDetail(splitOutNote(entry.note));
    if (EVENT_META[entry.event].out) setEvent(entry.event as OutEvent);
    setCode(entry.caseCode);
    setAcuity((ACUITIES as string[]).includes(entry.acuity) ? (entry.acuity as Acuity) : '');
    setBedNo(entry.bedNumber);
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);
  useEffect(() => setReverseCensus(info.counted), [info.counted]);
  // ยังไม่จำหน่าย = ผู้ป่วยยังอยู่ในเตียง (ลบได้ แต่แก้เวลาที่ผังเตียง)
  const inBed = !!entry && !EVENT_META[entry.event].out;
  const bedNow = entry
    ? data.beds.find(
        (b) =>
          b.status === 'occupied' &&
          b.caseCode === entry.caseCode &&
          logTime(b.admittedAt) === logTime(entry.admittedAt) &&
          related.some((l) => l.bedNumber === b.bedNumber),
      )
    : undefined;
  // แถวรับเข้าที่ค้าง (ไม่มีจำหน่าย และไม่มีผู้ป่วยในเตียงแล้ว) → ไม่รู้ช่วงวันที่นอน จึงไม่หักยอดผู้ป่วยในวอร์ด
  const stay = !entry ? [] : inBed ? (bedNow ? stayDays(logTime(entry.admittedAt), null) : []) : stayDays(logTime(entry.admittedAt), logTime(entry.timestamp));
  const remove = () => {
    if (!entry) return;
    if (inBed && bedNow) {
      // ผู้ป่วยยังอยู่ในเตียง → เตียงกลับเป็นว่าง
      void commit((d) => cancelAdmission(d, bedNow.bedNumber, { reverseCensus }), `ลบเคส ${entry.caseCode || entry.bedNumber} · เตียง ${bedNow.bedNumber} ว่างแล้ว`);
    } else {
      void commit((d) => deleteCase(d, entry, { reverseCensus: reverseCensus && stay.length > 0 }), `ลบเคส ${entry.caseCode || entry.bedNumber} แล้ว`);
    }
    onClose();
  };

  const now = toLocalDateTime();
  const error = !inAt || !outAt
    ? 'กรุณาระบุวันเวลาให้ครบ'
    : outAt > now
      ? 'เวลาจำหน่ายต้องไม่เกินเวลาปัจจุบัน'
      : outAt < inAt
        ? 'เวลาจำหน่ายต้องหลังเวลารับเข้า'
        : '';
  const a = parseLocalDateTime(inAt);
  const b = parseLocalDateTime(outAt);
  const los = a && b && b >= a ? (b.getTime() - a.getTime()) / 86_400_000 : null;
  // ปลายทางเก็บตามประเภท: Refer = รพ. + ตึก · ย้ายวอร์ด = ตึก · อื่น ๆ = หมายเหตุ
  const note = composeOutNote(
    event === 'refer' ? detail : event === 'ward' ? { unit: detail.unit, info: detail.info, note: detail.note } : { info: detail.info, note: detail.note },
  );
  const movedBeds = related.some((l) => l.event === 'move');
  const changed =
    !!entry &&
    (inAt !== logTime(entry.admittedAt) ||
      outAt !== logTime(entry.timestamp) ||
      note !== entry.note ||
      event !== entry.event ||
      code.trim() !== entry.caseCode ||
      acuity !== entry.acuity ||
      bedNo !== entry.bedNumber);
  const unsynced = !!entry && related.some((l) => l.row === undefined);

  const save = () => {
    if (!entry || error || !changed) return;
    void commit(
      (d) => editCase(d, entry, { admittedAt: inAt, outAt, note, event, caseCode: code, acuity, bedNumber: movedBeds ? undefined : bedNo }),
      `แก้ไขเคส ${code.trim() || entry.bedNumber} แล้ว`,
    );
    onClose();
  };

  return (
    <Modal
      open={!!entry}
      onClose={onClose}
      title={confirmDelete ? 'ลบเคสนี้ออกจากทะเบียน' : inBed ? 'เคสที่ยังอยู่ในเตียง' : 'แก้ไขเคสย้อนหลัง'}
      subtitle={entry ? `${entry.caseCode || 'ไม่ระบุรหัสเคส'} · เตียง ${entry.bedNumber} · ${EVENT_META[entry.event].label}` : undefined}
      footer={
        confirmDelete ? (
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              ย้อนกลับ
            </Button>
            <Button variant="danger" onClick={remove} disabled={unsynced}>
              <Trash2 className="size-4" strokeWidth={1.8} />
              ยืนยันลบเคส
            </Button>
          </>
        ) : (
          <>
            <Button variant="danger" className="mr-auto" onClick={() => setConfirmDelete(true)} disabled={unsynced}>
              <Trash2 className="size-4" strokeWidth={1.8} />
              ลบเคส
            </Button>
            <Button variant="ghost" onClick={onClose}>
              ยกเลิก
            </Button>
            {!inBed && (
              <Button variant="primary" onClick={save} disabled={!!error || !changed || unsynced}>
                บันทึก
              </Button>
            )}
          </>
        )
      }
    >
      {confirmDelete && entry ? (
        <div className="space-y-4">
          <p className="text-[15px] text-ink-2">
            ลบ {related.length} แถวของเคสนี้ออกจากแท็บ Log (รับเข้า {fmtDateTime(entry.admittedAt)}
            {inBed ? '' : ` → ${EVENT_META[entry.event].label} ${fmtDateTime(entry.timestamp)}`}) และหักยอดคืนในบันทึกรายวัน
            {inBed && bedNow ? ` · เตียง ${bedNow.bedNumber} จะกลับเป็น “ว่าง”` : ''}:
          </p>
          <ul className="well space-y-1 px-4 py-3 text-[14px] text-ink-2">
            {related.some((l) => l.event === 'admit') && <li>· รับใหม่ −1 ในวันที่ {fmtDateTime(entry.admittedAt).split(' ').slice(0, 2).join(' ')}</li>}
            {EVENT_META[entry.event].out && (
              <li>
                · {EVENT_META[entry.event].label} −1 ในวันที่ {fmtDateTime(entry.timestamp).split(' ').slice(0, 2).join(' ')}
              </li>
            )}
          </ul>
          {stay.length > 0 && (
          <div className="well px-4">
            <Switch
              label={`หักยอด “ผู้ป่วยในวอร์ด” ${stay.length} วันด้วย`}
              hint={
                info.counted
                  ? 'เคสนี้เพิ่มย้อนหลังพร้อมนับยอดรายวันไว้ จึงเปิดให้แล้ว (รวมอุปกรณ์ที่ติ๊กไว้ตอนเพิ่ม)'
                  : 'เปิดเฉพาะเมื่อแน่ใจว่าเคยนับผู้ป่วยรายนี้ในบันทึกรายวันของวันเหล่านั้น'
              }
              checked={reverseCensus}
              onChange={setReverseCensus}
            />
          </div>
          )}
          <p className="text-[13px] text-critical">ลบแล้วกู้คืนไม่ได้</p>
        </div>
      ) : inBed && entry ? (
        <div className="space-y-3 text-[15px] text-ink-2">
          <p>
            {bedNow ? (
              <>
                ผู้ป่วยยังอยู่ใน<span className="font-medium text-ink">เตียง {bedNow.bedNumber}</span> · รับเข้า {fmtDateTime(entry.admittedAt)}
              </>
            ) : (
              <>ไม่พบผู้ป่วยรายนี้ในเตียงแล้ว แต่ทะเบียนยังไม่มีรายการจำหน่าย</>
            )}
          </p>
          <p className="text-[13px] text-ink-3">
            แก้เวลารับเข้าหรืออุปกรณ์ได้ที่ผังเตียง (แดชบอร์ด › ภาพรวม › แตะเตียง) · ถ้ารับผิดหรือบันทึกซ้ำ กด “ลบเคส”
          </p>
        </div>
      ) : (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-ink-2">วันเวลาที่รับเข้า</span>
            <input type="datetime-local" className="field" value={inAt} max={outAt || now} onChange={(e) => setInAt(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-ink-2">วันเวลาที่จำหน่าย</span>
            <input type="datetime-local" className="field" value={outAt} min={inAt || undefined} max={now} onChange={(e) => setOutAt(e.target.value)} />
          </label>
        </div>
        <p className={error ? 'text-[13px] text-critical' : 'text-[13px] text-ink-3'}>
          {error || (los !== null ? `นอน ICU ${los.toFixed(1)} วัน` : '')}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-ink-2">รหัสเคส</span>
            <input className="field" value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-ink-2">เตียง</span>
            <select className="field" value={bedNo} onChange={(e) => setBedNo(e.target.value)} disabled={movedBeds}>
              {[...new Set([bedNo, ...data.beds.map((b) => b.bedNumber)])].filter(Boolean).map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
            {movedBeds && <span className="mt-1 block text-[11px] text-ink-3">เคสนี้ย้ายเตียงระหว่างนอน แก้เตียงไม่ได้</span>}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-ink-2">ระดับความรุนแรง</span>
            <select className="field" value={acuity} onChange={(e) => setAcuity(e.target.value as Acuity | '')}>
              <option value="">ไม่ระบุ</option>
              {ACUITIES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <span className="mb-1.5 block text-[12px] text-ink-2">ประเภทการจำหน่าย</span>
          <ChoicePills options={OUT_TYPES} value={event} onChange={setEvent} label="ประเภทการจำหน่าย" />
        </div>
        {event === 'refer' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-ink-2">โรงพยาบาลปลายทาง</span>
              <input className="field" value={detail.hospital ?? ''} onChange={(e) => setD('hospital', e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-ink-2">ตึก / หอผู้ป่วย / แผนก</span>
              <input className="field" value={detail.unit ?? ''} onChange={(e) => setD('unit', e.target.value)} />
            </label>
          </div>
        )}
        {event === 'ward' && (
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-ink-2">ตึก / หอผู้ป่วยปลายทาง</span>
            <input className="field" value={detail.unit ?? ''} onChange={(e) => setD('unit', e.target.value)} />
          </label>
        )}
        <label className="block">
          <span className="mb-1.5 block text-[12px] text-ink-2">ข้อมูลอื่น ๆ</span>
          <input className="field" value={detail.info ?? ''} onChange={(e) => setD('info', e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12px] text-ink-2">โน้ตเพิ่มเติม</span>
          <textarea className="field min-h-20" value={detail.note ?? ''} onChange={(e) => setD('note', e.target.value)} placeholder="ไม่ต้องใส่ชื่อหรือ HN ผู้ป่วย" />
        </label>
        <p className="text-[12px] text-ink-3">
          {unsynced
            ? 'รายการนี้ยังไม่ได้บันทึกลงชีต รอสักครู่แล้วลองใหม่'
            : 'แก้ทุกแถวของเคสนี้ในแท็บ Log · ยอดรับใหม่และยอดจำหน่ายแต่ละประเภทย้ายไปวัน/ประเภทที่ถูกต้องให้อัตโนมัติ'}
        </p>
      </div>
      )}
    </Modal>
  );
}

const OUT_TYPES: { value: OutEvent; label: string }[] = [
  { value: 'home', label: 'กลับบ้าน' },
  { value: 'ward', label: 'ย้ายวอร์ด' },
  { value: 'refer', label: 'Refer' },
  { value: 'expired', label: 'เสียชีวิต' },
  { value: 'carry', label: 'ยกยอดเดือนถัดไป' },
];

/** เคสที่ลืมกดทั้งรับเข้าและจำหน่าย (ผู้ป่วยออกไปแล้ว) → เพิ่มลงทะเบียน + ยอดรายวันย้อนหลัง */
function AddPastCaseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, commit } = useStore();
  const [bedNo, setBedNo] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [acuity, setAcuity] = useState<Acuity | ''>('');
  const [inAt, setInAt] = useState('');
  const [outAt, setOutAt] = useState('');
  const [event, setEvent] = useState<OutEvent>('home');
  const [note, setNote] = useState('');
  const [devices, setDevices] = useState<Partial<Record<DeviceKey, boolean>>>({});
  const [backfill, setBackfill] = useState(true);

  useEffect(() => {
    if (!open) return;
    setBedNo(data.beds[0]?.bedNumber ?? '');
    setCode('');
    setCodeTouched(false);
    setAcuity('');
    setInAt('');
    setOutAt('');
    setEvent('home');
    setNote('');
    setDevices({});
    setBackfill(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // รหัสเคสอัตโนมัติจากวันที่รับเข้า + ลำดับเตียง (แก้เองได้)
  useEffect(() => {
    if (codeTouched || !inAt) return;
    const n = data.beds.findIndex((b) => b.bedNumber === bedNo) + 1;
    setCode(`CASE-${inAt.slice(2, 4)}${inAt.slice(5, 7)}${inAt.slice(8, 10)}-${String(n || 1).padStart(2, '0')}`);
  }, [inAt, bedNo, codeTouched, data.beds]);

  const now = toLocalDateTime();
  const error = !inAt || !outAt
    ? 'กรุณาระบุวันเวลารับเข้าและจำหน่าย'
    : outAt > now
      ? 'เวลาจำหน่ายต้องไม่เกินเวลาปัจจุบัน'
      : outAt <= inAt
        ? 'เวลาจำหน่ายต้องหลังเวลารับเข้า'
        : !code.trim()
          ? 'กรุณาใส่รหัสเคส'
          : '';
  const days = !error ? stayDays(inAt, outAt) : [];
  const duplicate = !!code.trim() && data.logs.some((l) => l.caseCode === code.trim() && logTime(l.admittedAt) === inAt);

  const save = () => {
    if (error || duplicate) return;
    void commit(
      (d) => addPastCase(d, { bedNumber: bedNo, caseCode: code, acuity, admittedAt: inAt, outAt, event, note, devices, backfill }),
      `เพิ่มเคส ${code.trim()} ย้อนหลังแล้ว`,
    );
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="เพิ่มเคสย้อนหลัง"
      subtitle="สำหรับเคสที่ลืมกดรับและผู้ป่วยออกจาก ICU ไปแล้ว · ถ้าผู้ป่วยยังอยู่ ให้กดรับที่ผังเตียงแล้วใส่เวลารับเข้าย้อนหลังแทน"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button variant="primary" onClick={save} disabled={!!error || duplicate}>
            เพิ่มลงทะเบียน
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-ink-2">เตียง</span>
            <select className="field" value={bedNo} onChange={(e) => setBedNo(e.target.value)}>
              {data.beds.map((b) => (
                <option key={b.bedNumber}>{b.bedNumber}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-ink-2">รหัสเคส</span>
            <input
              className="field"
              value={code}
              placeholder="เลือกเวลารับเข้าก่อน"
              onChange={(e) => {
                setCode(e.target.value);
                setCodeTouched(true);
              }}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-ink-2">ระดับความรุนแรงเมื่อรับเข้า</span>
            <select className="field" value={acuity} onChange={(e) => setAcuity(e.target.value as Acuity | '')}>
              <option value="">ไม่ระบุ</option>
              {ACUITIES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-ink-2">วันเวลาที่รับเข้า</span>
            <input type="datetime-local" className="field" value={inAt} max={outAt || now} onChange={(e) => setInAt(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-ink-2">วันเวลาที่จำหน่าย</span>
            <input type="datetime-local" className="field" value={outAt} min={inAt || undefined} max={now} onChange={(e) => setOutAt(e.target.value)} />
          </label>
        </div>
        <ChoicePills options={OUT_TYPES} value={event} onChange={setEvent} label="ประเภทการจำหน่าย" />
        <label className="block">
          <span className="mb-1.5 block text-[12px] text-ink-2">หมายเหตุ / ปลายทาง</span>
          <textarea
            className="field min-h-20"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={event === 'refer' ? 'เช่น รพ.ปลายทาง: รพ.ศูนย์นนทบุรี · ตึก/หอผู้ป่วย: ICU อายุรกรรม' : 'ไม่ต้องใส่ชื่อหรือ HN ผู้ป่วย'}
          />
        </label>
        <div>
          <p className="mb-2 text-[12px] text-ink-2">อุปกรณ์ที่ใช้ระหว่างนอน ICU (ใช้นับยอดอุปกรณ์รายวันย้อนหลัง)</p>
          <div className="flex flex-wrap gap-1.5">
            {DEVICES.map((d) => (
              <button
                key={d.key}
                type="button"
                aria-pressed={!!devices[d.key]}
                onClick={() => setDevices((x) => ({ ...x, [d.key]: !x[d.key] }))}
                className={cx(
                  'h-8 rounded-full px-3 text-[12px] font-medium transition-colors',
                  devices[d.key] ? 'btn-ink' : 'btn-glass text-ink-2',
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className="well px-4">
          <Switch
            label={days.length ? `เพิ่มยอด “ผู้ป่วยในวอร์ด” และอุปกรณ์ ${days.length} วัน` : 'เพิ่มยอด “ผู้ป่วยในวอร์ด” และอุปกรณ์ย้อนหลัง'}
            hint="ปิดถ้าเคยนับผู้ป่วยรายนี้ในบันทึกรายวันไว้แล้ว (เช่น กรอกตัวชี้วัดรายวันเอง)"
            checked={backfill}
            onChange={setBackfill}
          />
        </div>
        <p className={error || duplicate ? 'text-[13px] text-critical' : 'text-[13px] text-ink-3'}>
          {duplicate
            ? 'มีเคสนี้ในทะเบียนแล้ว (รหัสเคสและเวลารับเข้าเดียวกัน)'
            : error || 'ระบบจะเพิ่มแถว “รับเข้า” และ “จำหน่าย” ในแท็บ Log และนับยอดรับใหม่ / Refer / เสียชีวิตในวันที่ถูกต้อง'}
        </p>
      </div>
    </Modal>
  );
}
