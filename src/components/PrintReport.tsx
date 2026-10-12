import { ACUITY_META, DEVICES, EVENT_META, HOSPITAL, INDICATORS, STATUS_META, UNIT } from '../lib/constants';
import { fmtDateLong, fmtDateShort, fmtDateTime, fmtDayMonth, fmtMonth, shiftDate, todayKey } from '../lib/date';
import { countsFromBeds, emptyDaily, findDaily, monthlySummary } from '../lib/logic';
import { computeStats, fmtStat, STAT_DEFS, statsFor } from '../lib/stats';
import { useStore } from '../lib/store';
import { SeriesChart } from './charts';

export type PrintJob = { kind: 'daily'; date: string } | { kind: 'monthly'; ym: string } | { kind: 'stats'; ym: string };

const th = 'border-b border-black/20 py-1.5 pr-2 text-left text-[10px] font-semibold text-black/60';
const td = 'border-b border-black/10 py-1.5 pr-2 text-[11px]';

export function PrintReport({ job }: { job: PrintJob }) {
  const { data } = useStore();
  const printed = new Date().toLocaleString('th-TH-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="print-only text-black" style={{ fontFamily: 'var(--font-sans)' }}>
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
                : `รายงานประจำเดือน — ${fmtMonth(job.ym)}`}
          </h1>
        </div>
        <p className="text-[10px] text-black/50">พิมพ์เมื่อ {printed}</p>
      </header>
      {job.kind === 'daily' && <Daily date={job.date} />}
      {job.kind === 'monthly' && <MonthlyBody ym={job.ym} />}
      {job.kind === 'stats' && (
        <>
          <StatsBlock ym={job.ym} />
          <StatsHistory />
        </>
      )}
      <footer className="mt-8 border-t border-black/20 pt-2 text-[9px] text-black/50">
        ข้อมูลไม่ระบุตัวตนผู้ป่วย (Zero-PII) · ICU Dashboard
      </footer>
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
              { key: 'referCount', label: 'Refer', kind: 'bar' },
              { key: 'deathCount', label: 'เสียชีวิต', kind: 'bar' },
            ]}
          />
        </section>

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
    return (
      <section className="mb-6 break-inside-avoid">
        <h2 className="mb-2 text-[13px] font-semibold">สถิติการใช้เตียง (ADC · ALOS · BOR · BTR · TOI)</h2>
        <p className="mb-2 text-[10px] text-black/60">
          จำนวนเตียง {input.beds} · จำนวนวัน {input.days} · วันนอนรวม {input.patientDays} · ผู้ป่วยจำหน่าย {input.discharges}
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

  function MonthlyBody({ ym }: { ym: string }) {
    const s = monthlySummary(data, ym);
    const figs = [
      ['รับใหม่', `${s.admissions} ราย`],
      ['Refer / ย้ายวอร์ด', `${s.refers} ราย`],
      ['เสียชีวิต', `${s.deaths} ราย`],
      ['Ventilator-days', `${s.ventilatorDays} วัน`],
      ['Ventilator utilization', `${s.ventilatorRate}%`],
      ['ผู้ป่วยสูงสุดต่อวัน', `${s.peak?.totalInWard ?? 0} ราย`],
    ];
    return (
      <>
        <section className="mb-6 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-black/15 bg-black/15">
          {figs.map(([l, v]) => (
            <div key={l} className="bg-white p-3">
              <p className="text-[10px] text-black/60">{l}</p>
              <p className="text-[22px] font-semibold">{v}</p>
            </div>
          ))}
        </section>
        <StatsBlock ym={ym} />
        {s.days.length > 0 && (
          <section className="mb-6 break-inside-avoid">
            <h2 className="mb-2 text-[13px] font-semibold">รับเข้า–ออก และผู้ป่วยในวอร์ดรายวัน</h2>
            <SeriesChart
              printWidth={680}
              height={200}
              data={s.days}
              xKey="date"
              xFormat={fmtDayMonth}
              series={[
                { key: 'totalInWard', label: 'ผู้ป่วยในวอร์ด', kind: 'line' },
                { key: 'admittedNew', label: 'รับใหม่', kind: 'bar' },
                { key: 'referCount', label: 'Refer / ย้าย', kind: 'bar' },
                { key: 'deathCount', label: 'เสียชีวิต', kind: 'bar' },
              ]}
            />
          </section>
        )}
        <section className="mb-6">
          <h2 className="mb-2 text-[13px] font-semibold">12 ตัวชี้วัดรายวัน</h2>
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>วันที่</th>
                {INDICATORS.map((i) => (
                  <th key={i.key} className={`${th} text-right`}>
                    {i.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.days.map((d) => (
                <tr key={d.date}>
                  <td className={td}>{fmtDateShort(d.date)}</td>
                  {INDICATORS.map((i) => (
                    <td key={i.key} className={`${td} text-right`}>
                      {d[i.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {s.logs.length > 0 && (
          <section>
            <h2 className="mb-2 text-[13px] font-semibold">ทะเบียนผู้ป่วยเข้า–ออก</h2>
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
                {s.logs.map((l, i) => (
                  <tr key={i}>
                    <td className={td}>{fmtDateTime(l.timestamp)}</td>
                    <td className={td}>{EVENT_META[l.event].label}</td>
                    <td className={td}>{l.bedNumber}</td>
                    <td className={td}>{l.caseCode || '—'}</td>
                    <td className={td}>{l.acuity || '—'}</td>
                    <td className={td}>{l.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </>
    );
  }
}
