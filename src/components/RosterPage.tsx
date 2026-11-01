import { ArrowUpRight, ChevronLeft, ChevronRight, Download, Pencil, Printer, Star } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmtDateLong, fmtMonth, todayKey } from '../lib/date';
import { occupied, saveRoster } from '../lib/logic';
import {
  daysInMonth,
  formatCode,
  isNurse,
  isWeekend,
  parseCode,
  ratioText,
  rosterFor,
  shiftAt,
  SHIFTS,
  realName,
  teamOn,
  weekdayShort,
  type DayCode,
  type ShiftKey,
} from '../lib/roster';
import { sheetLink } from '../lib/sheetApi';
import { useStore } from '../lib/store';
import { Avatar } from './Avatar';
import { Button, cx, Empty } from './ui';

export const SHIFT_COLOR: Record<ShiftKey, string> = { M: '#2a78d6', A: '#eb6834', N: '#6250d6' };

const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** ชิปแสดงรหัสเวรในตาราง */
export function CodeChip({ code, small }: { code: string; small?: boolean }) {
  const c = parseCode(code);
  if (!c.raw) return null;
  const base = cx('inline-flex items-center justify-center rounded-md font-semibold leading-none', small ? 'h-5 min-w-5 px-1 text-[10px]' : 'h-6 min-w-6 px-1.5 text-[11px]');
  if (c.off) return <span className={cx(base, 'bg-fill text-ink-3')}>หยุด</span>;
  if (c.leave) return <span className={cx(base, 'bg-[#e87ba4]/20 text-[#a33a63]')}>ลา</span>;
  if (c.training) return <span className={cx(base, 'bg-[#1baf7a]/18 text-[#127a55]')}>อบรม</span>;
  if (c.other) return <span className={cx(base, 'bg-fill-soft text-ink-2')}>{c.other}</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      {c.shifts.map((k) => (
        <span
          key={k}
          className={base}
          style={{ background: `color-mix(in srgb, ${SHIFT_COLOR[k]} 16%, transparent)`, color: SHIFT_COLOR[k] }}
        >
          {SHIFTS.find((s) => s.key === k)!.code}
        </span>
      ))}
      {c.lead && <Star className={cx('fill-warn text-warn', small ? 'size-2.5' : 'size-3')} aria-label="หัวหน้าเวร" />}
    </span>
  );
}

export function RosterPage({
  onPrint,
  onPdf,
  pdfBusy,
  startEdit,
  onStarted,
}: {
  onPrint: (ym: string) => void;
  onPdf: (ym: string) => void;
  pdfBusy: boolean;
  startEdit?: boolean;
  onStarted?: () => void;
}) {
  const { data, meta, commit, isStaff } = useStore();
  const today = todayKey();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [day, setDay] = useState(Number(today.slice(8, 10)));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, Record<number, string>>>({});
  const [picker, setPicker] = useState<{ key: string; day: number; x: number; y: number } | null>(null);

  const n = daysInMonth(ym);
  const isThisMonth = ym === today.slice(0, 7);
  useEffect(() => {
    setDay(isThisMonth ? Number(today.slice(8, 10)) : 1);
    setDraft({});
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym]);

  const lines = useMemo(() => rosterFor(data, ym), [data, ym]);

  // มาจากหน้าเจ้าหน้าที่ → เข้าโหมดจัดเวรทันที
  useEffect(() => {
    if (!startEdit) return;
    if (isStaff) setEditing(true);
    onStarted?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startEdit]);

  useEffect(() => {
    if (!isStaff) setEditing(false);
  }, [isStaff]);
  const keyOf = (l: (typeof lines)[number]) => l.staff?.id ?? l.row?.staffId ?? l.name;
  const codeAt = (l: (typeof lines)[number], d: number) => draft[keyOf(l)]?.[d] ?? l.days[d - 1] ?? '';
  const closePicker = useCallback(() => setPicker(null), []);
  const changed = Object.values(draft).reduce((s, x) => s + Object.keys(x).length, 0);

  const setCode = (key: string, d: number, code: string) =>
    setDraft((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [d]: code } }));

  const save = () => {
    // แถวที่ไม่มีรหัสบุคลากร (พิมพ์ชื่อเองในชีต) ใช้ชื่อเป็นรหัสแทน
    void commit((d) => saveRoster(d, ym, draft), `บันทึกตารางเวร ${fmtMonth(ym)} แล้ว`);
    setDraft({});
    setEditing(false);
    setPicker(null);
  };

  const date = `${ym}-${String(day).padStart(2, '0')}`;
  const nowShift = shiftAt();
  const patients = occupied(data.beds).length;
  const coverage = (d: number, k: ShiftKey) => lines.filter((l) => parseCode(codeAt(l, d)).shifts.includes(k)).length;
  const dataWithDraft = useMemo(() => {
    if (!changed) return data;
    return saveRoster(data, ym, draft).next;
  }, [data, draft, ym, changed]);

  return (
    <div className="space-y-10 pt-6 sm:space-y-12 sm:pt-12">
      <section className="animate-rise">
        <p className="eyebrow">ตารางเวร</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <div className="flex items-center gap-3">
            <button type="button" aria-label="เดือนก่อน" onClick={() => setYm(shiftMonth(ym, -1))} className="btn-glass inline-flex size-10 items-center justify-center rounded-full">
              <ChevronLeft className="size-5" />
            </button>
            <h1 className="display text-[30px] sm:text-[44px]">{fmtMonth(ym)}</h1>
            <button type="button" aria-label="เดือนถัดไป" onClick={() => setYm(shiftMonth(ym, 1))} className="btn-glass inline-flex size-10 items-center justify-center rounded-full">
              <ChevronRight className="size-5" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDraft({});
                    setEditing(false);
                    setPicker(null);
                  }}
                >
                  ยกเลิก
                </Button>
                <Button variant="primary" onClick={save} disabled={!changed}>
                  บันทึก{changed ? ` (${changed} ช่อง)` : ''}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => onPrint(ym)}>
                  <Printer className="size-4" strokeWidth={1.8} />
                  พิมพ์
                </Button>
                <Button variant="secondary" onClick={() => onPdf(ym)} disabled={pdfBusy}>
                  <Download className="size-4" strokeWidth={1.8} />
                  {pdfBusy ? 'กำลังสร้าง PDF…' : 'บันทึก PDF'}
                </Button>
                {isStaff && <Button variant="primary" onClick={() => setEditing(true)} disabled={lines.length === 0}>
                  <Pencil className="size-4" strokeWidth={1.8} />
                  จัดเวร
                </Button>}
              </>
            )}
          </div>
        </div>
      </section>

      {/* เวรของวันที่เลือก */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">{date === today ? 'วันนี้' : 'วันที่เลือก'}</p>
            <h2 className="display mt-1 text-[22px] sm:text-[26px]">{fmtDateLong(date)}</h2>
          </div>
          <p className="text-[12px] text-ink-3">แตะหัวคอลัมน์วันที่ในตารางเพื่อดูวันอื่น</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {SHIFTS.map((s) => {
            const team = teamOn(dataWithDraft, date, s.key);
            const live = date === today && s.key === nowShift;
            const nurses = team.filter(isNurse).length;
            return (
              <div key={s.key} className={cx('card p-5 sm:p-6', live && 'ring-2 ring-accent/60')}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-[15px] font-semibold">
                      <span className="size-2.5 rounded-full" style={{ background: SHIFT_COLOR[s.key] }} />
                      {s.label}
                    </p>
                    <p className="num text-[12px] text-ink-3">{s.time}</p>
                  </div>
                  <div className="text-right">
                    {live ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/12 px-2.5 py-1 text-[11px] font-medium text-accent">
                        <span className="size-1.5 animate-pulse-soft rounded-full bg-accent" />
                        กำลังปฏิบัติงาน
                      </span>
                    ) : (
                      <span className="num text-[13px] text-ink-2">{team.length} คน</span>
                    )}
                    {live && <p className="num mt-1 text-[11px] text-ink-3">พยาบาล : ผู้ป่วย {ratioText(nurses, patients)}</p>}
                  </div>
                </div>
                {team.length === 0 ? (
                  <p className="text-[13px] text-ink-3">ยังไม่มีผู้อยู่เวร</p>
                ) : (
                  <ul className="space-y-2.5">
                    {team.map((t, i) => (
                      <li key={`${t.name}-${i}`} className="flex items-center gap-3">
                        <Avatar staff={t.staff} name={t.name} size={36} ring={t.lead} />
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium">
                            {realName(t.staff?.name ?? t.name)}
                            {t.lead && <span className="ml-1.5 text-[11px] font-normal text-[#8a5c00]">★ หัวหน้าเวร</span>}
                          </p>
                          <p className="truncate text-[11px] text-ink-3">
                            {[t.staff?.nickname && `(${t.staff.nickname})`, t.staff?.position || t.staff?.group].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ตารางทั้งเดือน */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 p-6 pb-4 sm:p-8 sm:pb-4">
          <div>
            <p className="eyebrow">ทั้งเดือน</p>
            <h3 className="display mt-1 text-[22px]">{editing ? 'จัดเวร — แตะช่องเพื่อเลือกเวร' : 'ตารางเวรรายเดือน'}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-ink-2">
            <Legend />
            {meta?.spreadsheetUrl && (
              <a className="link inline-flex items-center gap-0.5 text-[14px]" href={sheetLink(meta, 'roster') ?? '#'} target="_blank" rel="noreferrer">
                แท็บ Roster <ArrowUpRight className="size-3.5" />
              </a>
            )}
          </div>
        </div>

        {lines.length === 0 ? (
          <Empty title="ยังไม่มีรายชื่อบุคลากร">เพิ่มรายชื่อที่เมนู “บุคลากร” ก่อน แล้วกลับมาจัดเวร</Empty>
        ) : (
          <div className="overflow-x-auto pb-2">
            <table className="w-max min-w-full border-separate border-spacing-0 text-[12px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-[2] min-w-[170px] border-b border-line bg-[var(--glass-bg-strong)] py-2 pr-3 pl-6 text-left text-[11px] font-medium text-ink-3 backdrop-blur sm:pl-8">
                    ชื่อ
                  </th>
                  {Array.from({ length: n }, (_, i) => i + 1).map((d) => {
                    const isToday = isThisMonth && d === Number(today.slice(8, 10));
                    return (
                      <th
                        key={d}
                        onClick={() => setDay(d)}
                        className={cx(
                          'w-9 min-w-9 cursor-pointer border-b border-line px-0.5 py-1.5 text-center font-medium',
                          isWeekend(ym, d) && 'bg-fill-soft',
                          d === day && 'bg-accent/10',
                        )}
                      >
                        <span className={cx('block text-[10px]', isToday ? 'font-semibold text-accent' : 'text-ink-3')}>{weekdayShort(ym, d)}</span>
                        <span
                          className={cx(
                            'num mx-auto mt-0.5 flex size-6 items-center justify-center rounded-full text-[12px]',
                            isToday ? 'bg-accent text-white' : 'text-ink',
                          )}
                        >
                          {d}
                        </span>
                      </th>
                    );
                  })}
                  <th className="border-b border-line px-3 text-center text-[10px] font-medium text-ink-3">รวมเวร</th>
                  <th className="border-b border-line pr-6 pl-1 text-center text-[10px] font-medium text-ink-3 sm:pr-8">หยุด</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const key = keyOf(l);
                  let shifts = 0;
                  let offs = 0;
                  for (let d = 1; d <= n; d++) {
                    const c = parseCode(codeAt(l, d));
                    shifts += c.shifts.length;
                    if (c.off) offs += 1;
                  }
                  return (
                    <tr key={key} className="group">
                      <td className="sticky left-0 z-[1] border-b border-line/70 bg-[var(--glass-bg-strong)] py-1.5 pr-3 pl-6 backdrop-blur sm:pl-8">
                        <span className="flex items-center gap-2">
                          <Avatar staff={l.staff} name={l.name} size={26} />
                          <span className="min-w-0">
                            <span className="block max-w-[150px] truncate text-[12px] font-medium" title={l.staff?.name ?? l.name}>
                              {realName(l.staff?.name ?? l.name)}
                            </span>
                            <span className="block max-w-[150px] truncate text-[10px] text-ink-3">
                              {l.staff ? [l.staff.nickname && `(${l.staff.nickname})`, l.staff.group].filter(Boolean).join(' · ') : 'ไม่อยู่ในรายชื่อ'}
                            </span>
                          </span>
                        </span>
                      </td>
                      {Array.from({ length: n }, (_, i) => i + 1).map((d) => {
                        const code = codeAt(l, d);
                        const dirty = draft[key]?.[d] !== undefined;
                        return (
                          <td
                            key={d}
                            className={cx(
                              'h-10 border-b border-line/70 px-0.5 text-center',
                              isWeekend(ym, d) && 'bg-fill-soft',
                              d === day && 'bg-accent/8',
                              editing && 'cursor-pointer hover:bg-accent/12',
                              dirty && 'outline-2 -outline-offset-2 outline-accent/50',
                            )}
                            onClick={(e) => {
                              if (!editing) return setDay(d);
                              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setPicker({ key, day: d, x: r.left + r.width / 2, y: r.bottom + 6 });
                            }}
                          >
                            <CodeChip code={code} small />
                          </td>
                        );
                      })}
                      <td className="num border-b border-line/70 px-3 text-center font-semibold">{shifts}</td>
                      <td className="num border-b border-line/70 pr-6 pl-1 text-center text-ink-3 sm:pr-8">{offs}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {SHIFTS.map((s) => (
                  <tr key={s.key}>
                    <td className="sticky left-0 z-[1] bg-[var(--glass-bg-strong)] py-1 pr-3 pl-6 text-[11px] text-ink-2 backdrop-blur sm:pl-8">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ background: SHIFT_COLOR[s.key] }} />
                        จำนวน{s.label}
                      </span>
                    </td>
                    {Array.from({ length: n }, (_, i) => i + 1).map((d) => {
                      const c = coverage(d, s.key);
                      return (
                        <td key={d} className={cx('num py-1 text-center text-[11px]', c === 0 ? 'font-semibold text-critical' : 'text-ink-2', isWeekend(ym, d) && 'bg-fill-soft')}>
                          {c}
                        </td>
                      );
                    })}
                    <td colSpan={2} />
                  </tr>
                ))}
              </tfoot>
            </table>
          </div>
        )}
        <p className="px-6 pt-2 pb-6 text-[12px] text-ink-3 sm:px-8">
          แก้ได้ทั้งบนเว็บ (ปุ่ม “จัดเวร”) และในแท็บ Roster ของชีต · รหัส: ช เช้า, บ บ่าย, ด ดึก, ควบเวรเขียนต่อกัน เช่น “ชบ”, ใส่ * ท้ายรหัสเป็นหัวหน้าเวร,
          OFF หยุด, ลา, อบรม · ตัวเลขสีแดงด้านล่าง = เวรที่ยังไม่มีคน
        </p>
      </section>

      {picker && (
        <CodePicker
          x={picker.x}
          y={picker.y}
          value={(() => {
            const l = lines.find((x) => keyOf(x) === picker.key)!;
            return codeAt(l, picker.day);
          })()}
          title={`${realName(lines.find((x) => keyOf(x) === picker.key)?.staff?.name ?? lines.find((x) => keyOf(x) === picker.key)?.name ?? '')} · ${picker.day} ${fmtMonth(ym)}`}
          onChange={(code) => setCode(picker.key, picker.day, code)}
          onClose={closePicker}
        />
      )}
    </div>
  );
}

function Legend() {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {SHIFTS.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1">
          <CodeChip code={s.code} small /> {s.label.replace('เวร', '')}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <Star className="size-3 fill-warn text-warn" /> หัวหน้าเวร
      </span>
    </span>
  );
}

/** หน้าต่างเล็กสำหรับเลือกเวรของช่องที่แตะ */
function CodePicker({
  x,
  y,
  value,
  title,
  onChange,
  onClose,
}: {
  x: number;
  y: number;
  value: string;
  title: string;
  onChange: (code: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const c = parseCode(value);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    // ไม่สนใจ scroll ที่เกิดทันทีหลังแตะ (เบราว์เซอร์เลื่อนช่องให้อยู่ในจอ / แรงเฉื่อยบนมือถือ)
    const opened = performance.now();
    const scrolled = () => performance.now() - opened > 400 && onClose();
    const t = window.setTimeout(() => document.addEventListener('pointerdown', away), 0);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', scrolled, { passive: true, capture: true });
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', scrolled, { capture: true });
    };
  }, [onClose]);

  const toggleShift = (k: ShiftKey) => {
    const shifts = c.shifts.includes(k) ? c.shifts.filter((s) => s !== k) : [...c.shifts, k];
    onChange(formatCode({ shifts, lead: c.lead && shifts.length > 0, off: false, leave: false, training: false }));
  };
  const only = (p: Partial<DayCode>) =>
    onChange(formatCode({ shifts: [], lead: false, off: false, leave: false, training: false, ...p }));

  const W = 264;
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, x - W / 2));
  const top = Math.min(y, window.innerHeight - 230);

  return createPortal(
    <div ref={ref} className="glass glass-strong animate-sheet fixed z-[70] rounded-2xl p-3" style={{ left, top, width: W }} role="dialog" aria-label="เลือกเวร">
      <p className="mb-2 truncate px-1 text-[12px] font-medium text-ink-2">{title}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {SHIFTS.map((s) => {
          const on = c.shifts.includes(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggleShift(s.key)}
              className={cx('flex h-12 flex-col items-center justify-center rounded-xl text-[13px] font-semibold transition-colors', on ? 'text-white' : 'well text-ink')}
              style={on ? { background: SHIFT_COLOR[s.key] } : undefined}
            >
              {s.code}
              <span className={cx('text-[9px] font-normal', on ? 'opacity-85' : 'text-ink-3')}>{s.label.replace('เวร', '')}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={!c.shifts.length}
        onClick={() => onChange(formatCode({ ...c, lead: !c.lead }))}
        className={cx(
          'mt-1.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-[12px] font-medium transition-colors disabled:opacity-40',
          c.lead ? 'bg-warn/25 text-[#8a5c00]' : 'well text-ink-2',
        )}
      >
        <Star className={cx('size-3.5', c.lead && 'fill-warn text-warn')} /> หัวหน้าเวร
      </button>
      <div className="mt-1.5 grid grid-cols-4 gap-1.5 text-[12px]">
        {[
          { label: 'หยุด', on: c.off, p: { off: true } },
          { label: 'ลา', on: c.leave, p: { leave: true } },
          { label: 'อบรม', on: c.training, p: { training: true } },
          { label: 'ล้าง', on: false, p: {} },
        ].map((o) => (
          <button key={o.label} type="button" onClick={() => only(o.p)} className={cx('h-9 rounded-xl font-medium', o.on ? 'btn-ink' : 'well text-ink-2')}>
            {o.label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
