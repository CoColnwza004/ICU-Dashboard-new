import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { DailyRecord } from '../types';
import { INDICATORS, type IndicatorGroup } from '../lib/constants';
import { fmtDateLong, fmtDateShort, fmtDayMonth, shiftDate, todayKey } from '../lib/date';
import { INDICATOR_ICON } from '../lib/icons';
import { countsFromBeds, emptyDaily, findDaily, saveDaily } from '../lib/logic';
import { sheetLink } from '../lib/sheetApi';
import { useStore } from '../lib/store';
import { SeriesChart, type SeriesDef } from './charts';
import { Button, cx, Empty, IconButton, Segmented, Stepper } from './ui';

const GROUPS: { value: IndicatorGroup; label: string; title: string }[] = [
  { value: 'flow', label: 'รับ–จำหน่าย', title: 'การรับเข้าและจำหน่าย' },
  { value: 'device', label: 'อุปกรณ์', title: 'อุปกรณ์ทางการแพทย์' },
  { value: 'quality', label: 'คุณภาพ', title: 'คุณภาพและความปลอดภัย' },
];

const SERIES: Record<IndicatorGroup, SeriesDef[]> = {
  flow: [
    { key: 'totalInWard', label: 'ผู้ป่วยในวอร์ด', kind: 'line' },
    { key: 'admittedNew', label: 'รับใหม่', kind: 'bar' },
    { key: 'referCount', label: 'Refer', kind: 'bar' },
    { key: 'deathCount', label: 'เสียชีวิต', kind: 'bar' },
  ],
  device: [
    { key: 'ventilatorCount', label: 'Ventilator', kind: 'line' },
    { key: 'cLineCount', label: 'C-Line', kind: 'line' },
    { key: 'foleyCount', label: 'Foley', kind: 'line' },
    { key: 'ivHlCount', label: 'IV/HL', kind: 'line' },
  ],
  quality: [
    { key: 'mdrCount', label: 'MDR', kind: 'bar' },
    { key: 'piHomeCount', label: 'PI_Home', kind: 'bar' },
    { key: 'hapBundleCount', label: 'HAP Bundle', kind: 'bar' },
    { key: 'bradenUnder12Count', label: 'Braden < 12', kind: 'bar' },
  ],
};

const RANGES = [
  { value: '14', label: '14 วัน' },
  { value: '30', label: '30 วัน' },
  { value: '90', label: '90 วัน' },
] as const;

export function Indicators({ onPrint }: { onPrint: (date: string) => void }) {
  const { data, meta, commit } = useStore();
  const today = todayKey();
  const [date, setDate] = useState(today);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DailyRecord>(emptyDaily(today));
  const [group, setGroup] = useState<IndicatorGroup>('flow');
  const [range, setRange] = useState<(typeof RANGES)[number]['value']>('14');

  const stored = findDaily(data.daily, date);
  const record: DailyRecord = stored ?? {
    ...emptyDaily(date),
    ...(date === today ? countsFromBeds(data.beds) : {}),
  };

  useEffect(() => {
    if (!editing) setDraft(record);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, editing, stored]);

  const startEdit = () => {
    setDraft(record);
    setEditing(true);
  };
  const save = () => {
    void commit((d) => saveDaily(d, draft), `บันทึกตัวชี้วัด ${fmtDateShort(draft.date)} แล้ว`);
    setEditing(false);
  };

  const trend = useMemo(() => {
    const days = Number(range);
    const out: (Partial<DailyRecord> & { date: string })[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = shiftDate(today, -i);
      out.push(findDaily(data.daily, d) ?? { date: d });
    }
    return out;
  }, [data.daily, range, today]);

  const rows = useMemo(
    () => data.daily.filter((d) => d.date >= shiftDate(today, -Number(range) + 1)).slice().reverse(),
    [data.daily, range, today],
  );

  const shown = editing ? draft : record;

  return (
    <div className="space-y-14 pt-6 sm:space-y-16 sm:pt-12">
      {/* Header */}
      <section className="animate-rise">
        <p className="eyebrow">12 ตัวชี้วัดรายวัน</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="display text-[34px] sm:text-[48px]">{fmtDateLong(date)}</h1>
            <p className="mt-2 text-[15px] text-ink-2">
              {stored
                ? 'ข้อมูลจากแท็บ Daily'
                : date === today
                  ? 'ยังไม่มีแถวของวันนี้ — ตัวเลขด้านล่างคำนวณจากผังเตียงปัจจุบัน'
                  : 'ยังไม่มีข้อมูลของวันนี้'}
              {stored?.row && meta && (
                <>
                  {' · '}
                  <a className="link" href={sheetLink(meta, 'daily', stored.row) ?? '#'} target="_blank" rel="noreferrer">
                    เปิดแถวนี้ในชีต
                  </a>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="glass flex items-center gap-1 rounded-full p-1">
              <IconButton label="วันก่อนหน้า" onClick={() => setDate(shiftDate(date, -1))} disabled={editing}>
                <ChevronLeft className="size-4" />
              </IconButton>
              <input
                type="date"
                aria-label="เลือกวันที่"
                value={date}
                max={today}
                disabled={editing}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="num h-9 rounded-full bg-transparent px-2 text-[14px] text-ink focus:outline-none"
              />
              <IconButton
                label="วันถัดไป"
                onClick={() => setDate(shiftDate(date, 1))}
                disabled={editing || date >= today}
                className="disabled:opacity-30"
              >
                <ChevronRight className="size-4" />
              </IconButton>
            </div>
            {date !== today && !editing && (
              <Button variant="ghost" size="sm" onClick={() => setDate(today)}>
                วันนี้
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* 12 indicators */}
      <section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="display text-[24px] sm:text-[28px]">{editing ? 'แก้ไขตัวเลข' : 'สรุปตัวชี้วัด'}</h2>
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setDraft((d) => ({ ...d, ...countsFromBeds(data.beds) }))}
                  title="ผู้ป่วยในวอร์ดและจำนวนอุปกรณ์ ตามผังเตียงตอนนี้"
                >
                  เติมจากผังเตียง
                </Button>
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  ยกเลิก
                </Button>
                <Button variant="primary" onClick={save}>
                  บันทึก
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => onPrint(date)}>
                  พิมพ์ / PDF
                </Button>
                <Button variant="primary" onClick={startEdit}>
                  แก้ไข
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {GROUPS.map((g) => (
            <div key={g.value} className="card p-6 sm:p-8">
              <p className="eyebrow mb-5">{g.title}</p>
              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-4">
                {INDICATORS.filter((i) => i.group === g.value).map((i) => {
                  const Icon = INDICATOR_ICON[i.key];
                  const prev = findDaily(data.daily, shiftDate(date, -1));
                  const diff = prev ? shown[i.key] - prev[i.key] : null;
                  return (
                    <div key={i.key} className="well min-w-0 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="icon-chip size-8 rounded-[10px]">
                          <Icon className="size-4" strokeWidth={1.7} />
                        </span>
                        <span className="num text-[11px] text-ink-3">#{i.no}</span>
                      </div>
                      <p className="mt-3 truncate text-[13px] font-medium text-ink-2">{i.label}</p>
                      {editing ? (
                        <div className="mt-2">
                          <Stepper label={i.label} value={draft[i.key]} onChange={(v) => setDraft((d) => ({ ...d, [i.key]: v }))} />
                        </div>
                      ) : (
                        <p className="flex items-baseline gap-2">
                          <span className="num text-[40px] leading-tight font-semibold">{shown[i.key]}</span>
                          {diff !== null && diff !== 0 && (
                            <span className="num text-[12px] text-ink-3">
                              {diff > 0 ? '▲' : '▼'} {Math.abs(diff)}
                            </span>
                          )}
                        </p>
                      )}
                      <p className="truncate text-[12px] text-ink-3">{i.th}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {(editing || shown.notes) && (
            <div className="card p-6 sm:p-8">
              <p className="eyebrow mb-3">หมายเหตุ</p>
              {editing ? (
                <textarea
                  className="field min-h-20"
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  placeholder="บันทึกเพิ่มเติมของวันนี้"
                />
              ) : (
                <p className="text-[15px] whitespace-pre-wrap text-ink-2">{shown.notes}</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Trend */}
      <section className="card p-6 sm:p-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">แนวโน้ม</p>
            <h3 className="display mt-1 text-[22px]">{GROUPS.find((g) => g.value === group)?.title}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Segmented options={GROUPS} value={group} onChange={setGroup} size="sm" label="กลุ่มตัวชี้วัด" />
            <Segmented options={[...RANGES]} value={range} onChange={setRange} size="sm" label="ช่วงเวลา" />
          </div>
        </div>
        <SeriesChart data={trend} xKey="date" series={SERIES[group]} height={320} xFormat={fmtDayMonth} labelFormat={fmtDateLong} />
      </section>

      {/* Table */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 p-6 pb-4 sm:p-8 sm:pb-4">
          <div>
            <p className="eyebrow">ตาราง · {RANGES.find((r) => r.value === range)?.label}ล่าสุด</p>
            <h3 className="display mt-1 text-[22px]">บันทึกรายวัน</h3>
          </div>
          {meta && (
            <a className="link inline-flex items-center gap-0.5 text-[14px]" href={sheetLink(meta, 'daily') ?? '#'} target="_blank" rel="noreferrer">
              แท็บ Daily ในชีต <ArrowUpRight className="size-3.5" />
            </a>
          )}
        </div>
        {rows.length === 0 ? (
          <Empty title="ยังไม่มีข้อมูลในช่วงนี้">กด “แก้ไข” เพื่อบันทึกตัวชี้วัดของวันนี้ หรือกรอกในแท็บ Daily ของชีต</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead>
                <tr className="border-y border-line text-left text-[11px] text-ink-3">
                  <th className="py-2.5 pr-3 pl-6 font-medium sm:pl-8">วันที่</th>
                  {INDICATORS.map((i) => (
                    <th key={i.key} className="px-2 py-2.5 text-right font-medium whitespace-nowrap">
                      {i.label}
                    </th>
                  ))}
                  <th className="w-12 pr-6 sm:pr-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.date}
                    onClick={() => !editing && setDate(r.date)}
                    className={cx(
                      'cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-fill-soft',
                      r.date === date && 'bg-fill-soft',
                    )}
                  >
                    <td className="py-3 pr-3 pl-6 whitespace-nowrap sm:pl-8">{fmtDateShort(r.date)}</td>
                    {INDICATORS.map((i) => (
                      <td key={i.key} className={cx('num px-2 py-3 text-right', r[i.key] === 0 && 'text-ink-3')}>
                        {r[i.key]}
                      </td>
                    ))}
                    <td className="pr-6 text-right sm:pr-8">
                      {meta && r.row && (
                        <a
                          href={sheetLink(meta, 'daily', r.row) ?? '#'}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="เปิดแถวนี้ในชีต"
                          className="inline-flex size-7 items-center justify-center rounded-full text-ink-3 hover:bg-fill hover:text-link"
                        >
                          <ArrowUpRight className="size-3.5" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
