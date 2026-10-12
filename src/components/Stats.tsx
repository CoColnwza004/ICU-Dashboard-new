import { ArrowUpRight, BedDouble, CalendarDays, Hotel, LogOut, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { fmtMonth } from '../lib/date';
import { availableMonths, saveStats } from '../lib/logic';
import { sheetLink } from '../lib/sheetApi';
import { autoStatsInput, computeStats, findStats, fmtStat, STAT_DEFS, type StatsInput } from '../lib/stats';
import { useStore } from '../lib/store';
import { Button, cx, Empty } from './ui';
import { Ring } from './viz';

const FIELDS: { key: keyof StatsInput; label: string; hint: string; icon: ReactNode }[] = [
  { key: 'beds', label: 'จำนวนเตียง', hint: 'เตียงที่เปิดให้บริการ', icon: <BedDouble className="size-4" strokeWidth={1.7} /> },
  { key: 'days', label: 'จำนวนวัน', hint: 'วันในช่วงที่คำนวณ', icon: <CalendarDays className="size-4" strokeWidth={1.7} /> },
  { key: 'patientDays', label: 'วันนอนรวม', hint: 'ผลรวม “ผู้ป่วยในวอร์ด” ทุกวัน', icon: <Hotel className="size-4" strokeWidth={1.7} /> },
  { key: 'discharges', label: 'ผู้ป่วยจำหน่าย', hint: 'กลับบ้าน + ย้าย + Refer + เสียชีวิต', icon: <LogOut className="size-4" strokeWidth={1.7} /> },
];

export function Stats({ onPrint }: { onPrint: (ym: string) => void }) {
  const { data, meta, commit } = useStore();
  const months = useMemo(() => {
    const set = new Set(availableMonths(data));
    data.stats.forEach((s) => set.add(s.month));
    return [...set].sort().reverse();
  }, [data]);
  const [ym, setYm] = useState(months[0]);
  const saved = findStats(data, ym);
  const auto = useMemo(() => autoStatsInput(data, ym), [data, ym]);
  const [draft, setDraft] = useState<StatsInput>(saved ?? auto);
  const [note, setNote] = useState(saved?.note ?? '');
  const [dirty, setDirty] = useState(false);

  // เปลี่ยนเดือน หรือมีข้อมูลใหม่จากชีต (และยังไม่ได้แก้ในฟอร์ม) → โหลดค่าใหม่
  useEffect(() => {
    if (dirty) return;
    setDraft(saved ?? auto);
    setNote(saved?.note ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, saved?.beds, saved?.days, saved?.patientDays, saved?.discharges, saved?.note, auto.beds, auto.days, auto.patientDays, auto.discharges]);

  const changeMonth = (m: string) => {
    setDirty(false);
    setYm(m);
  };
  const set = (k: keyof StatsInput, v: string) => {
    setDirty(true);
    setDraft((d) => ({ ...d, [k]: Math.max(0, Number.parseInt(v, 10) || 0) }));
  };
  const save = () => {
    void commit((d) => saveStats(d, { month: ym, ...draft, note }), `บันทึกสถิติ ${fmtMonth(ym)} แล้ว`);
    setDirty(false);
  };

  const values = computeStats(draft);
  const differsFromAuto = FIELDS.some((f) => draft[f.key] !== auto[f.key]);

  return (
    <div className="space-y-14 pt-6 sm:space-y-16 sm:pt-12">
      <section className="animate-rise">
        <p className="eyebrow">สถิติการใช้เตียง · ADC · ALOS · BOR · BTR · TOI</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="display text-[34px] sm:text-[48px]">{fmtMonth(ym)}</h1>
            <p className="mt-2 text-[15px] text-ink-2">
              {saved ? 'บันทึกแล้วในแท็บ Stats' : 'ยังไม่บันทึก — ค่าด้านล่างคำนวณจากข้อมูลในระบบ'}
              {saved?.row && meta && (
                <>
                  {' · '}
                  <a className="link" href={sheetLink(meta, 'stats', saved.row) ?? '#'} target="_blank" rel="noreferrer">
                    เปิดแถวนี้ในชีต
                  </a>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="เลือกเดือน"
              className="field btn-glass h-10 w-auto rounded-full py-0 pr-9"
              value={ym}
              onChange={(e) => changeMonth(e.target.value)}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {fmtMonth(m)}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={() => onPrint(ym)}>
              พิมพ์ / PDF
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {/* Input form */}
        <div className="card p-6 sm:p-7">
          <p className="eyebrow">ข้อมูลที่ใช้คำนวณ</p>
          <h2 className="display mt-1 mb-5 text-[22px]">กรอกข้อมูล</h2>
          <div className="space-y-3">
            {FIELDS.map((f) => (
              <label key={f.key} className="well block p-3.5">
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
                    <span className="text-ink-3">{f.icon}</span>
                    {f.label}
                  </span>
                  {draft[f.key] !== auto[f.key] && (
                    <button
                      type="button"
                      className="link text-[12px]"
                      onClick={(e) => {
                        e.preventDefault();
                        set(f.key, String(auto[f.key]));
                      }}
                    >
                      ใช้ค่าจากระบบ ({auto[f.key]})
                    </button>
                  )}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={draft[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="num mt-1.5 w-full bg-transparent text-[28px] font-semibold text-ink focus:outline-none"
                />
                <span className="block text-[11px] text-ink-3">{f.hint}</span>
              </label>
            ))}
            <textarea
              className="field min-h-16"
              placeholder="หมายเหตุ (ถ้ามี)"
              value={note}
              onChange={(e) => {
                setDirty(true);
                setNote(e.target.value);
              }}
            />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" onClick={save}>
              บันทึกลงชีต
            </Button>
            {differsFromAuto && (
              <Button
                variant="ghost"
                onClick={() => {
                  setDirty(true);
                  setDraft(auto);
                }}
              >
                <RefreshCw className="size-4" strokeWidth={1.7} />
                คำนวณจากระบบทั้งหมด
              </Button>
            )}
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
            ค่าจากระบบ: วันนอนรวมจากแท็บ Daily, ผู้ป่วยจำหน่ายจาก Refer + เสียชีวิต (Daily) และจำหน่ายกลับบ้าน (Log) ·
            แก้ตัวเลขเองได้ก่อนบันทึก
          </p>
        </div>

        {/* Results */}
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          {STAT_DEFS.map((d) => (
            <div key={d.key} className={cx('card flex flex-col p-6', d.key === 'bor' && 'sm:col-span-2')}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex items-baseline gap-2">
                    <span className="text-[17px] font-semibold">{d.label}</span>
                    <span className="truncate text-[12px] text-ink-3">{d.en}</span>
                  </p>
                  <p className="text-[13px] text-ink-2">{d.th}</p>
                </div>
                {d.key === 'bor' && <Ring value={Math.round(values.bor)} size={84} label="BOR" />}
              </div>
              <p className="mt-4">
                <span className="num text-[44px] leading-none font-semibold">{fmtStat(values[d.key])}</span>
                <span className="ml-1.5 text-[15px] text-ink-3">{d.unit}</span>
              </p>
              <div className="well mt-auto px-3.5 py-2.5 text-[12px] leading-relaxed">
                <p className="text-ink-2">
                  {d.label} = {d.formula}
                </p>
                <p className="num text-ink-3">
                  = {d.worked(draft)} = <span className="font-semibold text-ink">{fmtStat(values[d.key])}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* History */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 p-6 pb-4 sm:p-8 sm:pb-4">
          <div>
            <p className="eyebrow">แท็บ Stats</p>
            <h3 className="display mt-1 text-[22px]">สถิติที่บันทึกไว้</h3>
          </div>
          {meta && (
            <a className="link inline-flex items-center gap-0.5 text-[14px]" href={sheetLink(meta, 'stats') ?? '#'} target="_blank" rel="noreferrer">
              เปิดแท็บ Stats <ArrowUpRight className="size-3.5" />
            </a>
          )}
        </div>
        {data.stats.length === 0 ? (
          <Empty title="ยังไม่มีสถิติที่บันทึก">กรอกข้อมูลด้านบนแล้วกด “บันทึกลงชีต”</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead>
                <tr className="border-y border-line text-left text-[11px] text-ink-3">
                  <th className="py-2.5 pr-3 pl-6 font-medium sm:pl-8">เดือน</th>
                  <th className="px-2 py-2.5 text-right font-medium">เตียง</th>
                  <th className="px-2 py-2.5 text-right font-medium">วัน</th>
                  <th className="px-2 py-2.5 text-right font-medium">วันนอนรวม</th>
                  <th className="px-2 py-2.5 text-right font-medium">จำหน่าย</th>
                  {STAT_DEFS.map((d) => (
                    <th key={d.key} className="px-2 py-2.5 text-right font-medium">
                      {d.label}
                      {d.key === 'bor' && ' %'}
                    </th>
                  ))}
                  <th className="w-10 pr-6 sm:pr-8" />
                </tr>
              </thead>
              <tbody>
                {[...data.stats].reverse().map((r) => {
                  const v = computeStats(r);
                  return (
                    <tr
                      key={r.month}
                      onClick={() => changeMonth(r.month)}
                      className={cx(
                        'cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-fill-soft',
                        r.month === ym && 'bg-fill-soft',
                      )}
                    >
                      <td className="py-3 pr-3 pl-6 whitespace-nowrap sm:pl-8">{fmtMonth(r.month)}</td>
                      <td className="num px-2 py-3 text-right">{r.beds}</td>
                      <td className="num px-2 py-3 text-right">{r.days}</td>
                      <td className="num px-2 py-3 text-right">{r.patientDays}</td>
                      <td className="num px-2 py-3 text-right">{r.discharges}</td>
                      {STAT_DEFS.map((d) => (
                        <td key={d.key} className="num px-2 py-3 text-right font-medium">
                          {fmtStat(v[d.key])}
                        </td>
                      ))}
                      <td className="pr-6 text-right sm:pr-8">
                        {meta && r.row && (
                          <a
                            href={sheetLink(meta, 'stats', r.row) ?? '#'}
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
