import type { IcuData, RosterRow, Staff } from '../types';
import { parseDateKey, todayKey } from './date';

/** เวรมาตรฐาน 3 เวร (ตรงกับรหัสในแท็บ Roster) */
export type ShiftKey = 'M' | 'A' | 'N';

export interface ShiftDef {
  key: ShiftKey;
  code: string;
  label: string;
  time: string;
  start: number;
  end: number;
}

export const SHIFTS: ShiftDef[] = [
  { key: 'M', code: 'ช', label: 'เวรเช้า', time: '08:00–16:00', start: 8, end: 16 },
  { key: 'A', code: 'บ', label: 'เวรบ่าย', time: '16:00–24:00', start: 16, end: 24 },
  { key: 'N', code: 'ด', label: 'เวรดึก', time: '00:00–08:00', start: 0, end: 8 },
];

export interface DayCode {
  shifts: ShiftKey[];
  lead: boolean;
  off: boolean;
  leave: boolean;
  training: boolean;
  /** ข้อความที่อ่านไม่ออก (แสดงตามที่พิมพ์ในชีต) */
  other: string;
  raw: string;
}

const OFF = ['off', 'o', 'หยุด', '/', '-', 'x'];
const LEAVE = ['ลา', 'ล', 'l', 'leave', 'vl', 'sl', 'พักร้อน', 'ลาป่วย', 'ลากิจ'];
const TRAINING = ['อบรม', 'อ', 'ประชุม', 't', 'training'];

/** อ่านรหัสเวรจากช่องในชีต เช่น "ช", "บด", "ช/บ", "ช*", "M", "OFF", "ลา" */
export const parseCode = (raw: string): DayCode => {
  const s = (raw ?? '').trim();
  const lower = s.toLowerCase();
  const out: DayCode = { shifts: [], lead: false, off: false, leave: false, training: false, other: '', raw: s };
  if (!s) return out;
  if (OFF.includes(lower)) return { ...out, off: true };
  if (LEAVE.includes(lower)) return { ...out, leave: true };
  if (TRAINING.includes(lower)) return { ...out, training: true };
  out.lead = /[*★]/.test(s);
  const body = s.replace(/[*★\s/,+-]/g, '');
  const map: Record<string, ShiftKey> = { ช: 'M', บ: 'A', ด: 'N', m: 'M', a: 'A', n: 'N' };
  const shifts: ShiftKey[] = [];
  for (const ch of body.toLowerCase()) {
    const k = map[ch];
    if (!k) return { ...out, lead: false, other: s };
    if (!shifts.includes(k)) shifts.push(k);
  }
  out.shifts = (['M', 'A', 'N'] as ShiftKey[]).filter((k) => shifts.includes(k));
  return out;
};

/** รหัสมาตรฐานที่เขียนกลับลงชีต */
export const formatCode = (c: Pick<DayCode, 'shifts' | 'lead' | 'off' | 'leave' | 'training'>): string => {
  if (c.off) return 'OFF';
  if (c.leave) return 'ลา';
  if (c.training) return 'อบรม';
  if (!c.shifts.length) return '';
  return SHIFTS.filter((x) => c.shifts.includes(x.key))
    .map((x) => x.code)
    .join('') + (c.lead ? '*' : '');
};

export const daysInMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

export const shiftAt = (d = new Date()): ShiftKey => {
  const h = d.getHours();
  return h < 8 ? 'N' : h < 16 ? 'M' : 'A';
};

export const SHIFT_BY_KEY = Object.fromEntries(SHIFTS.map((s) => [s.key, s])) as Record<ShiftKey, ShiftDef>;

/** แถวตารางเวรของบุคลากรที่ยังปฏิบัติงานทุกคน (คนที่ยังไม่มีแถวในเดือนนั้นจะได้แถวว่าง) */
export const rosterFor = (data: IcuData, ym: string) => {
  const rows = data.roster.filter((r) => r.month === ym);
  const byId = new Map(rows.map((r) => [r.staffId, r]));
  const byName = new Map(rows.map((r) => [r.name, r]));
  const used = new Set<RosterRow>();
  const out = data.staff
    .filter((s) => s.active)
    .map((s) => {
      const row = byId.get(s.id) ?? byName.get(s.name);
      if (row) used.add(row);
      return { staff: s as Staff | null, name: s.name, row: row ?? null, days: row?.days ?? Array<string>(31).fill('') };
    });
  // แถวในชีตที่ไม่ตรงกับรายชื่อบุคลากร (เช่น พิมพ์ชื่อเองในชีต) ยังแสดงอยู่
  rows
    .filter((r) => !used.has(r))
    .forEach((r) => out.push({ staff: data.staff.find((s) => s.id === r.staffId) ?? null, name: r.name || r.staffId, row: r, days: r.days }));
  return out;
};

export type RosterLine = ReturnType<typeof rosterFor>[number];

export interface OnDuty {
  staff: Staff | null;
  name: string;
  lead: boolean;
}

/** ใครอยู่เวรไหนในวันที่กำหนด */
export const teamOn = (data: IcuData, date: string, shift: ShiftKey): OnDuty[] => {
  const ym = date.slice(0, 7);
  const day = Number(date.slice(8, 10));
  return rosterFor(data, ym)
    .map((l) => ({ l, c: parseCode(l.days[day - 1]) }))
    .filter(({ c }) => c.shifts.includes(shift))
    .map(({ l, c }) => ({ staff: l.staff, name: l.name, lead: c.lead }))
    .sort((a, b) => Number(b.lead) - Number(a.lead) || (a.staff?.order ?? 999) - (b.staff?.order ?? 999));
};

export const isNurse = (d: OnDuty) => d.staff?.group === 'พยาบาล';

/** เวรตอนนี้ (เวรดึกหลังเที่ยงคืนนับเป็นของวันนี้) */
export const currentDuty = (data: IcuData, now = new Date()) => {
  const shift = shiftAt(now);
  const date = todayKey();
  return { shift, date, team: teamOn(data, date, shift) };
};

export const hasRoster = (data: IcuData, ym = todayKey().slice(0, 7)) => data.roster.some((r) => r.month === ym);

/** อัตราส่วนพยาบาล : ผู้ป่วย เช่น "1 : 1.5" */
export const ratioText = (nurses: number, patients: number) => {
  if (!nurses) return patients ? 'ไม่มีพยาบาลในเวร' : '—';
  const r = patients / nurses;
  return `1 : ${Number.isInteger(r) ? r : r.toFixed(1)}`;
};

const WD = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
export const weekdayShort = (ym: string, day: number) => WD[parseDateKey(`${ym}-${String(day).padStart(2, '0')}`).getDay()];
export const isWeekend = (ym: string, day: number) => {
  const d = parseDateKey(`${ym}-${String(day).padStart(2, '0')}`).getDay();
  return d === 0 || d === 6;
};

/* ------------------------------------------------------------------ */
/* ชื่อ: แท็บ Staff เก็บ “ชื่อ-สกุล” ช่องเดียว เช่น “นางสาวกมลวรรณ ใจดี”     */
/* ฟอร์มบนเว็บแยกเป็น คำนำหน้า / ชื่อจริง / นามสกุล แล้วรวมกลับเป็นช่องเดิม  */
/* ------------------------------------------------------------------ */
export const NAME_PREFIXES = ['นาย', 'นาง', 'นางสาว', 'นพ.', 'พญ.', 'ดร.', 'พว.', 'ผศ.', 'รศ.', 'ศ.'];
const PREFIX = /^(นางสาว|น\.ส\.|นาง|นาย|ดร\.|นพ\.|พญ\.|พว\.|ผศ\.|รศ\.|ศ\.)\s*/;

export interface NameParts {
  prefix: string;
  first: string;
  last: string;
}

export const splitName = (full: string): NameParts => {
  const s = (full || '').trim();
  const m = s.match(PREFIX);
  const rest = s.slice(m ? m[0].length : 0).trim();
  const i = rest.search(/\s/);
  return { prefix: m ? m[1] : '', first: i < 0 ? rest : rest.slice(0, i), last: i < 0 ? '' : rest.slice(i).trim() };
};

/** คำนำหน้าติดกับชื่อแบบที่ใช้ทั่วไป เช่น “นางสาวกมลวรรณ ใจดี”, “นพ.สมชาย ดีงาม” */
export const joinName = ({ prefix, first, last }: NameParts) =>
  `${prefix.trim()}${first.trim()}${last.trim() ? ` ${last.trim()}` : ''}`.trim();

export const firstName = (name: string) => splitName(name).first || name;

/** ชื่อจริง + นามสกุล (ไม่มีคำนำหน้า) */
export const realName = (name: string) => {
  const p = splitName(name);
  return [p.first, p.last].filter(Boolean).join(' ') || name;
};

/** ชื่อที่ใช้แสดงแบบสั้น: ชื่อจริง (ไม่มีคำนำหน้า) — ชื่อเล่นเป็นข้อมูลรอง */
export const shortName = (s: { name: string; nickname?: string } | null, fallback = '') => firstName(s ? s.name : fallback);

const pad2 = (n: number) => String(n).padStart(2, '0');

/** ช่วงเวลาของเวร (8 ชั่วโมง) ที่ครอบคลุมเวลา now · end เป็นเวลาสิ้นสุด (ไม่รวม) */
export const shiftWindow = (now = new Date()) => {
  const def = SHIFT_BY_KEY[shiftAt(now)];
  const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const endAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), def.end, 0, 0);
  return {
    def,
    date,
    start: `${date}T${pad2(def.start)}:00`,
    end: `${date}T${pad2(def.end)}:00`,
    endAt,
    /** ใช้กันบันทึกซ้ำ เช่น 2026-11-01-M */
    key: `${date}-${def.key}`,
  };
};
