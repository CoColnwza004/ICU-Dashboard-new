import { ACUITY_META, DEVICES, EVENT_META, HOSPITAL, INDICATORS, STATUS_META, UNIT } from '../lib/constants';
import { fmtDateLong, fmtDateShort, fmtDateTime, fmtDayMonth, fmtMonth, shiftDate, todayKey } from '../lib/date';
import { countsFromBeds, emptyDaily, findDaily, monthlySummary } from '../lib/logic';
import { computeStats, fmtStat, STAT_DEFS, statsFor, dischargeBreakdown } from '../lib/stats';
import { useStore } from '../lib/store';
import { daysInMonth, isWeekend, parseCode, realName, rosterFor, SHIFTS, weekdayShort } from '../lib/roster';
import { CodeChip } from './RosterPage';
import { admitAcuitySlices, bedAcuitySlices, bedStatusSlices, dischargeSlices, sumSlices } from '../lib/breakdowns';
import { DonutChart, SeriesChart, type Slice } from './charts';

export type PrintJob =
  | { kind: 'daily'; date: string }
  | { kind: 'monthly'; ym: string; landscape?: boolean }
  | { kind: 'stats'; ym: string }
  | { kind: 'roster'; ym: string };

/** ตารางเวรกว้าง (31 วัน) ใช้กระดาษแนวนอนเสมอ · รายงานประจำเดือนเลือกได้ */
export const isLandscape = (job: PrintJob) => job.kind === 'roster' || (job.kind === 'monthly' && !!job.landscape);

const th = 'border-b border-black/20 py-1.5 pr-2 text-left text-[10px] font-semibold text-black/60';
const td = 'border-b border-black/10 py-1.5 pr-2 text-[11px]';

export const pdfFilename = (job: PrintJob) =>
  job.kind === 'daily'
    ? `ICU-daily-report-${job.date}.pdf`
    : job.kind === 'stats'
      ? `ICU-bed-stats-${job.ym}.pdf`
      : job.kind === 'roster'
        ? `ICU-roster-${job.ym}.pdf`
        : `ICU-monthly-report-${job.ym}${job.landscape ? '-landscape' : ''}.pdf`;
// ชื่อไฟล์เป็นภาษาอังกฤษ: บางเบราว์เซอร์/มือถือไม่รับชื่อไฟล์ภาษาไทยและจะตั้งชื่อเป็น "download"

/** สีตัวอักษรในรายงานเป็นโทนสว่างเสมอ (แม้เครื่องจะใช้โหมดมืด) */
const LIGHT_VARS = {
  '--color-ink': '#000000',
  '--color-ink-2': '#333333',
  '--color-ink-3': '#666666',
  '--color-surface': '#ffffff',
  '--color-line': '#e5e5ea',
  '--color-fill': '#e8e8ed',
  color: '#000',
  background: '#fff',
} as React.CSSProperties;

function PieRow({ items }: { items: { title: string; slices: Slice[]; unit?: string; center: string }[] }) {
  return (
    <section className="mb-6 break-inside-avoid">
      <div className="grid grid-cols-3 gap-4">
        {items.map((it) => (
          <div key={it.title} className="rounded-lg border border-black/15 p-3">
            <p className="mb-2 text-[11px] font-semibold">{it.title}</p>
            <DonutChart printWidth={1} size={96} slices={it.slices} unit={it.unit} centerLabel={it.center} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function PrintReport({ job, mode = 'print' }: { job: PrintJob; mode?: 'print' | 'pdf' }) {
  const { data } = useStore();
  const printed = new Date().toLocaleString('th-TH-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div
      className={mode === 'print' ? 'print-only text-black' : 'text-black'}
      style={{ fontFamily: 'var(--font-sans)', ...LIGHT_VARS, ...(mode === 'pdf' ? { padding: '4px 2px' } : {}) }}
    >
      {job.kind !== 'monthly' && (
      <header className="mb-6 flex items-end justify-between border-b border-black pb-3">
        <div>
          <p className="text-[11px] text-black/60">
            {HOSPITAL} · {UNIT}
          </p>
          <h1 className="text-[22px] font-semibold tracking-tight">
            {job.kind === 'daily'
              ? `รายงานตัวชี้วัดประจำวัน — ${fmtDateLong(job.date)}`
              : job.kind === 'stats'
                ? `สถิติการใช้เตียง — ${fmtMonth(job.ym)}`
                : `ตารางเวร — ${fmtMonth(job.ym)}`}
          </h1>
        </div>
        <p className="text-[10px] text-black/50">พิมพ์เมื่อ {printed}</p>
      </header>
      )}
      {job.kind === 'daily' && <Daily date={job.date} />}
      {job.kind === 'monthly' && (
        <>
          {mode === 'print' && job.landscape && <style>{'@page { size: A4 landscape; margin: 10mm; }'}</style>}
          <MonthlyPages ym={job.ym} landscape={!!job.landscape} />
        </>
      )}
      {job.kind === 'roster' && (
        <>
          {mode === 'print' && <style>{'@page { size: A4 landscape; margin: 10mm; }'}</style>}
          <RosterPrint ym={job.ym} />
        </>
      )}
      {job.kind === 'stats' && (
        <>
          <StatsBlock ym={job.ym} />
          <StatsHistory />
        </>
      )}
      {job.kind !== 'monthly' && (
        <footer className="mt-8 border-t border-black/20 pt-2 text-[9px] text-black/50">
          ข้อมูลไม่ระบุตัวตนผู้ป่วย (Zero-PII) · ICU Dashboard
        </footer>
      )}
    </div>
  );

  function Daily({ date }: { date: string }) {
    const rec = findDaily(data.daily, date) ?? {
      ...emptyDaily(date),
      ...(date === todayKey() ? countsFromBeds(data.beds) : {}),
    };
    const trend = Array.from({ length: 14 }, (_, i) => {
      const d = shiftDate(date, i - 13);
      return findDaily(data.daily, d) ?? { date: d };
    });
    return (
      <>
        <section className="mb-6 grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-black/15 bg-black/15">
          {INDICATORS.map((i) => (
            <div key={i.key} className="bg-white p-3">
              <p className="text-[10px] text-black/60">
                {i.no}. {i.label}
              </p>
              <p className="text-[24px] leading-tight font-semibold">{rec[i.key]}</p>
              <p className="text-[9px] text-black/50">{i.th}</p>
            </div>
          ))}
        </section>
        {rec.notes && <p className="mb-6 text-[11px]">หมายเหตุ: {rec.notes}</p>}

        <section className="mb-6 break-inside-avoid">
          <h2 className="mb-2 text-[13px] font-semibold">แนวโน้ม 14 วัน</h2>
          <SeriesChart
            printWidth={680}
            height={200}
            data={trend}
            xKey="date"
            xFormat={fmtDayMonth}
            series={[
              { key: 'totalInWard', label: 'ผู้ป่วยในวอร์ด', kind: 'line' },
              { key: 'admittedNew', label: 'รับใหม่', kind: 'bar' },
              { key: 'homeCount', label: 'กลับบ้าน', kind: 'bar' },
              { key: 'wardCount', label: 'ย้ายวอร์ด', kind: 'bar' },
              { key: 'referCount', label: 'Refer', kind: 'bar' },
              { key: 'deathCount', label: 'เสียชีวิต', kind: 'bar' },
            ]}
          />
        </section>

        {date === todayKey() && (
          <PieRow
            items={[
              { title: 'สถานะเตียงขณะพิมพ์', slices: bedStatusSlices(data.beds), unit: 'เตียง', center: 'เตียง' },
              { title: 'ความรุนแรงของผู้ป่วยขณะนี้', slices: bedAcuitySlices(data.beds), center: 'ผู้ป่วย' },
              { title: 'เหตุการณ์วันนี้', slices: sumSlices([rec], ['admittedNew', 'homeCount', 'wardCount', 'referCount', 'deathCount', 'carryCount']), center: 'ครั้ง' },
            ]}
          />
        )}
        {date === todayKey() && (
          <section className="break-inside-avoid">
            <h2 className="mb-2 text-[13px] font-semibold">สถานะเตียงขณะพิมพ์</h2>
            <table className="w-full">
              <thead>
                <tr>
                  {['เตียง', 'สถานะ', 'รหัสเคส', 'ระดับ', 'อุปกรณ์', 'รับเข้า'].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.beds.map((b) => (
                  <tr key={b.bedNumber}>
                    <td className={td}>{b.bedNumber}</td>
                    <td className={td}>{STATUS_META[b.status].label}</td>
                    <td className={td}>{b.caseCode || '—'}</td>
                    <td className={td}>{b.acuity ? `${b.acuity} (${ACUITY_META[b.acuity].th})` : '—'}</td>
                    <td className={td}>
                      {DEVICES.filter((d) => b[d.key])
                        .map((d) => d.label)
                        .join(', ') || '—'}
                    </td>
                    <td className={td}>{b.admittedAt ? fmtDateTime(b.admittedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </>
    );
  }

  /** ADC · ALOS · BOR · BTR · TOI พร้อมสูตรและตัวเลขที่ใช้ */
  function StatsBlock({ ym }: { ym: string }) {
    const { input, values, saved, note } = statsFor(data, ym);
    const p = dischargeBreakdown(data, ym);
    return (
      <section className="mb-6 break-inside-avoid">
        <h2 className="mb-2 text-[13px] font-semibold">สถิติการใช้เตียง (ADC · ALOS · BOR · BTR · TOI)</h2>
        <p className="mb-2 text-[10px] text-black/60">
          จำนวนเตียง {input.beds} · จำนวนวัน {input.days} · วันนอนรวม {input.patientDays} · ผู้ป่วยจำหน่าย {input.discharges} (กลับบ้าน{' '}
          {p.home} · ย้ายวอร์ด {p.ward} · Refer {p.refer} · เสียชีวิต {p.expired} · ยกยอดเดือนถัดไป {p.carry})
          {saved ? ' · ข้อมูลจากแท็บ Stats' : ' · คำนวณจากข้อมูลในระบบ (ยังไม่บันทึกในแท็บ Stats)'}
        </p>
        <div className="mb-2 grid grid-cols-5 gap-px overflow-hidden rounded-lg border border-black/15 bg-black/15">
          {STAT_DEFS.map((d) => (
            <div key={d.key} className="bg-white p-3">
              <p className="text-[10px] font-semibold">{d.label}</p>
              <p className="text-[9px] text-black/55">{d.th}</p>
              <p className="mt-1 text-[20px] leading-tight font-semibold">{fmtStat(values[d.key])}</p>
              <p className="text-[9px] text-black/55">{d.unit}</p>
            </div>
          ))}
        </div>
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>ตัวชี้วัด</th>
              <th className={th}>สูตร</th>
              <th className={th}>แทนค่า</th>
              <th className={`${th} text-right`}>ผลลัพธ์</th>
            </tr>
          </thead>
          <tbody>
            {STAT_DEFS.map((d) => (
              <tr key={d.key}>
                <td className={td}>
                  {d.label} ({d.en})
                </td>
                <td className={td}>{d.formula}</td>
                <td className={td}>{d.worked(input)}</td>
                <td className={`${td} text-right font-semibold`}>
                  {fmtStat(values[d.key])} {d.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {note && <p className="mt-2 text-[10px]">หมายเหตุ: {note}</p>}
      </section>
    );
  }

  function StatsHistory() {
    if (data.stats.length === 0) return null;
    return (
      <section className="break-inside-avoid">
        <h2 className="mb-2 text-[13px] font-semibold">สถิติรายเดือนที่บันทึกไว้</h2>
        <table className="w-full">
          <thead>
            <tr>
              {['เดือน', 'เตียง', 'วัน', 'วันนอนรวม', 'จำหน่าย'].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
              {STAT_DEFS.map((d) => (
                <th key={d.key} className={`${th} text-right`}>
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...data.stats].reverse().map((r) => {
              const v = computeStats(r);
              return (
                <tr key={r.month}>
                  <td className={td}>{fmtMonth(r.month)}</td>
                  <td className={td}>{r.beds}</td>
                  <td className={td}>{r.days}</td>
                  <td className={td}>{r.patientDays}</td>
                  <td className={td}>{r.discharges}</td>
                  {STAT_DEFS.map((d) => (
                    <td key={d.key} className={`${td} text-right`}>
                      {fmtStat(v[d.key])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    );
  }

  function RosterPrint({ ym }: { ym: string }) {
    const n = daysInMonth(ym);
    const lines = rosterFor(data, ym);
    const days = Array.from({ length: n }, (_, i) => i + 1);
    const cell = 'border border-black/15 px-0 py-1 text-center';
    return (
      <section>
        <table className="w-full table-fixed border-collapse text-[9px]">
          <thead>
            <tr>
              <th className="w-[150px] border border-black/15 px-1.5 py-1 text-left text-[9px] font-semibold">ชื่อ</th>
              {days.map((d) => (
                <th key={d} className={`${cell} font-semibold ${isWeekend(ym, d) ? 'bg-black/5' : ''}`}>
                  <span className="block text-[7px] font-normal text-black/50">{weekdayShort(ym, d)}</span>
                  {d}
                </th>
              ))}
              <th className="w-[34px] border border-black/15 text-[8px]">รวม</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="truncate border border-black/15 px-1.5 py-1 text-[9px]">
                  {realName(l.staff?.name ?? l.name)}
                  {l.staff?.nickname ? ` (${l.staff.nickname})` : ''}
                </td>
                {days.map((d) => (
                  <td key={d} className={`${cell} ${isWeekend(ym, d) ? 'bg-black/5' : ''}`}>
                    <CodeChip code={l.days[d - 1]} small />
                  </td>
                ))}
                <td className="border border-black/15 text-center font-semibold">
                  {days.reduce((s, d) => s + parseCode(l.days[d - 1]).shifts.length, 0)}
                </td>
              </tr>
            ))}
            {SHIFTS.map((s) => (
              <tr key={s.key}>
                <td className="border border-black/15 px-1.5 py-0.5 text-[8px] text-black/60">จำนวน{s.label}</td>
                {days.map((d) => (
                  <td key={d} className={`${cell} text-[8px] text-black/70`}>
                    {lines.filter((l) => parseCode(l.days[d - 1]).shifts.includes(s.key)).length}
                  </td>
                ))}
                <td className="border border-black/15" />
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[9px] text-black/60">
          ช = เช้า 08:00–16:00 · บ = บ่าย 16:00–24:00 · ด = ดึก 00:00–08:00 · ★ = หัวหน้าเวร · หยุด / ลา / อบรม
        </p>
      </section>
    );
  }

  /**
   * รายงานประจำเดือนแบบหน้าละหมวด (ข้อมูลประเภทเดียวกันอยู่หน้าเดียวกัน ไม่ถูกตัดครึ่ง)
   * 1) ภาพรวม: ยอดรับ-จำหน่าย · สถิติเตียง · สัดส่วน  2) ตัวชี้วัดรายวัน: กราฟ + ตาราง  3) ทะเบียนเข้า–ออก (ยาว → แบ่งหน้าพร้อมหัวตาราง)
   * แต่ละหน้า (data-pdf-page) ถูกย่อให้พอดีกระดาษ 1 แผ่นตอนบันทึก PDF
   */
  function MonthlyPages({ ym, landscape }: { ym: string; landscape: boolean }) {
    const s = monthlySummary(data, ym);
    const figs: [string, string][] = [
      ['รับใหม่', `${s.admissions} ราย`],
      ['กลับบ้าน', `${s.homes} ราย`],
      ['ย้ายวอร์ด', `${s.wards} ราย`],
      ['Refer', `${s.refers} ราย`],
      ['เสียชีวิต', `${s.deaths} ราย`],
      ['ยกยอดเดือนถัดไป', `${s.carries} ราย`],
      ['Ventilator-days', `${s.ventilatorDays} วัน`],
      ['Ventilator utilization', `${s.ventilatorRate}%`],
      ['ผู้ป่วยสูงสุดต่อวัน', `${s.peak?.totalInWard ?? 0} ราย`],
    ];
    const per = landscape ? 30 : 46; // แถวทะเบียนต่อหน้า
    const chunks: (typeof s.logs)[] = [];
    for (let i = 0; i < s.logs.length; i += per) chunks.push(s.logs.slice(i, i + per));
    const figures = (
      <section className="mb-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-black/15 bg-black/15">
        {figs.map(([l, v]) => (
          <div key={l} className="bg-white px-3 py-2">
            <p className="text-[10px] text-black/60">{l}</p>
            <p className="text-[19px] leading-tight font-semibold">{v}</p>
          </div>
        ))}
      </section>
    );
    const pies = (
      <PieRow
        items={[
          { title: 'ประเภทการจำหน่าย', slices: dischargeSlices(s.logs), center: 'จำหน่าย' },
          { title: 'ความรุนแรงเมื่อรับเข้า', slices: admitAcuitySlices(s.logs), center: 'รับเข้า' },
          {
            title: 'อุปกรณ์ (ผู้ป่วย-วัน)',
            slices: sumSlices(s.days, ['ventilatorCount', 'highFlowCount', 'cannulaCount', 'cLineCount', 'foleyCount', 'ivHlCount']),
            unit: 'ผู้ป่วย-วัน',
            center: 'ผู้ป่วย-วัน',
          },
        ]}
      />
    );
    const W = landscape ? 1080 : 740;
    // แนวนอนหน้ากระดาษเตี้ยกว่า → แถวชิดขึ้นให้ 31 วันพอดี 1 หน้า
    const rowCls = landscape ? '!py-px leading-[15px]' : '!py-[3px]';
    return (
      <>
        <Page title="ภาพรวมประจำเดือน" ym={ym}>
          {landscape ? (
            <div className="grid grid-cols-[1fr_1.05fr] gap-5">
              <div>
                {figures}
                <h2 className="mb-2 text-[13px] font-semibold">สัดส่วน</h2>
                {pies}
              </div>
              <StatsBlock ym={ym} />
            </div>
          ) : (
            <>
              {figures}
              <StatsBlock ym={ym} />
              <h2 className="mb-2 text-[13px] font-semibold">สัดส่วน</h2>
              {pies}
            </>
          )}
        </Page>
        <Page title={`${INDICATORS.length} ตัวชี้วัดรายวัน`} ym={ym}>
          {s.days.length > 0 && (
            <section className="mb-4">
              <h2 className="mb-1 text-[12px] font-semibold">รับเข้า–ออก และผู้ป่วยในวอร์ดรายวัน</h2>
              <SeriesChart
                printWidth={W}
                height={landscape ? 110 : 190}
                data={s.days}
                xKey="date"
                xFormat={fmtDayMonth}
                series={[
                  { key: 'totalInWard', label: 'ผู้ป่วยในวอร์ด', kind: 'line' },
                  { key: 'admittedNew', label: 'รับใหม่', kind: 'bar' },
                  { key: 'homeCount', label: 'กลับบ้าน', kind: 'bar' },
                  { key: 'wardCount', label: 'ย้ายวอร์ด', kind: 'bar' },
                  { key: 'referCount', label: 'Refer', kind: 'bar' },
                  { key: 'deathCount', label: 'เสียชีวิต', kind: 'bar' },
                  { key: 'carryCount', label: 'ยกยอด', kind: 'bar' },
                ]}
              />
            </section>
          )}
          <section>
            <table className="w-full table-fixed">
              <thead>
                <tr>
                  <th className={`${th} w-[52px]`}>วันที่</th>
                  {INDICATORS.map((i) => (
                    <th key={i.key} className={`${th} pr-1 text-right align-bottom leading-tight !text-[9px]`}>
                      {i.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.days.map((d) => (
                  <tr key={d.date}>
                    <td className={`${td} ${rowCls} whitespace-nowrap`}>{fmtDateShort(d.date)}</td>
                    {INDICATORS.map((i) => (
                      <td key={i.key} className={`${td} ${rowCls} pr-1 text-right`}>
                        {d[i.key] || <span className="text-black/30">0</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className={`${td} font-semibold`}>รวม</td>
                  {INDICATORS.map((i) => (
                    <td key={i.key} className={`${td} pr-1 text-right font-semibold`}>
                      {s.days.reduce((a, d) => a + d[i.key], 0)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </section>
        </Page>
        {chunks.map((rows, ci) => (
          <Page key={ci} title={`ทะเบียนผู้ป่วยเข้า–ออก${chunks.length > 1 ? ` (${ci + 1}/${chunks.length})` : ''}`} ym={ym}>
            <table className="w-full">
              <thead>
                <tr>
                  {['เวลา', 'เหตุการณ์', 'เตียง', 'รหัสเคส', 'ระดับ', 'หมายเหตุ'].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((l, i) => (
                  <tr key={i}>
                    <td className={`${td} !py-1 whitespace-nowrap`}>{fmtDateTime(l.timestamp)}</td>
                    <td className={`${td} !py-1 whitespace-nowrap`}>{EVENT_META[l.event].label}</td>
                    <td className={`${td} !py-1`}>{l.bedNumber}</td>
                    <td className={`${td} !py-1 whitespace-nowrap`}>{l.caseCode || '—'}</td>
                    <td className={`${td} !py-1`}>{l.acuity || '—'}</td>
                    <td className={`${td} !py-1 text-[10px]`}>{l.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Page>
        ))}
      </>
    );
  }

  /** 1 หน้ากระดาษ: หัวรายงาน + หมวด · ท้ายหน้า */
  function Page({ title, ym, children }: { title: string; ym: string; children: React.ReactNode }) {
    return (
      <div data-pdf-page className="pdf-page bg-white" style={{ padding: '2px 2px 4px' }}>
        <header className="mb-4 flex items-end justify-between border-b border-black pb-2">
          <div>
            <p className="text-[10px] text-black/60">
              {HOSPITAL} · {UNIT} · รายงานประจำเดือน {fmtMonth(ym)}
            </p>
            <h1 className="text-[19px] leading-tight font-semibold tracking-tight">{title}</h1>
          </div>
          <p className="text-[9px] text-black/50">พิมพ์เมื่อ {printed}</p>
        </header>
        {children}
        <footer className="mt-4 border-t border-black/20 pt-1.5 text-[9px] text-black/50">
          ข้อมูลไม่ระบุตัวตนผู้ป่วย (Zero-PII) · ICU Smart Center
        </footer>
      </div>
    );
  }

}
