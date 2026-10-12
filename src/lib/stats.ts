import type { IcuData, StatsRecord } from '../types';
import { todayKey } from './date';

/**
 * สถิติการใช้เตียง (สูตรมาตรฐานงานเวชระเบียน / สถิติโรงพยาบาล)
 *   ADC  = วันนอนรวม ÷ จำนวนวัน
 *   ALOS = วันนอนรวม ÷ จำนวนผู้ป่วยจำหน่าย
 *   BOR  = วันนอนรวม × 100 ÷ (จำนวนเตียง × จำนวนวัน)
 *   BTR  = จำนวนผู้ป่วยจำหน่าย ÷ จำนวนเตียง
 *   TOI  = (จำนวนเตียง × จำนวนวัน − วันนอนรวม) ÷ จำนวนผู้ป่วยจำหน่าย
 * สูตรเดียวกันนี้อยู่ในแท็บ Stats ของ Google Sheet (คอลัมน์ F–J)
 */
export type StatKey = 'adc' | 'alos' | 'bor' | 'btr' | 'toi';
export type StatsInput = Pick<StatsRecord, 'beds' | 'days' | 'patientDays' | 'discharges'>;

const div = (a: number, b: number) => (b ? a / b : 0);

export const computeStats = ({ beds, days, patientDays, discharges }: StatsInput): Record<StatKey, number> => ({
  adc: div(patientDays, days),
  alos: div(patientDays, discharges),
  bor: div(patientDays * 100, beds * days),
  btr: div(discharges, beds),
  toi: div(beds * days - patientDays, discharges),
});

export interface StatDef {
  key: StatKey;
  label: string;
  en: string;
  th: string;
  unit: string;
  formula: string;
  /** สูตรพร้อมตัวเลขจริง */
  worked: (i: StatsInput) => string;
}

export const STAT_DEFS: StatDef[] = [
  {
    key: 'adc',
    label: 'ADC',
    en: 'Average Daily Census',
    th: 'ผู้ป่วยเฉลี่ยต่อวัน',
    unit: 'ราย/วัน',
    formula: 'วันนอนรวม ÷ จำนวนวัน',
    worked: (i) => `${i.patientDays} ÷ ${i.days}`,
  },
  {
    key: 'alos',
    label: 'ALOS',
    en: 'Average Length of Stay',
    th: 'วันนอนเฉลี่ย',
    unit: 'วัน',
    formula: 'วันนอนรวม ÷ ผู้ป่วยจำหน่าย',
    worked: (i) => `${i.patientDays} ÷ ${i.discharges}`,
  },
  {
    key: 'bor',
    label: 'BOR',
    en: 'Bed Occupancy Rate',
    th: 'อัตราการครองเตียง',
    unit: '%',
    formula: 'วันนอนรวม × 100 ÷ (เตียง × จำนวนวัน)',
    worked: (i) => `${i.patientDays} × 100 ÷ (${i.beds} × ${i.days})`,
  },
  {
    key: 'btr',
    label: 'BTR',
    en: 'Bed Turnover Rate',
    th: 'อัตราการหมุนเวียนเตียง',
    unit: 'ครั้ง/เตียง',
    formula: 'ผู้ป่วยจำหน่าย ÷ จำนวนเตียง',
    worked: (i) => `${i.discharges} ÷ ${i.beds}`,
  },
  {
    key: 'toi',
    label: 'TOI',
    en: 'Turnover Interval',
    th: 'ระยะเวลาเตียงว่างเฉลี่ย',
    unit: 'วัน',
    formula: '(เตียง × จำนวนวัน − วันนอนรวม) ÷ ผู้ป่วยจำหน่าย',
    worked: (i) => `(${i.beds} × ${i.days} − ${i.patientDays}) ÷ ${i.discharges}`,
  },
];

export const fmtStat = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '0.00');

export const daysInMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

/** จำนวนวันของเดือน: เดือนปัจจุบันนับถึงวันนี้ เดือนที่ผ่านมานับทั้งเดือน */
export const daysForMonth = (ym: string) => {
  const today = todayKey();
  if (ym === today.slice(0, 7)) return Number(today.slice(8, 10));
  if (ym > today.slice(0, 7)) return 0;
  return daysInMonth(ym);
};

/** ค่าที่คำนวณจากข้อมูลในระบบ (แท็บ Daily + Log) ใช้เติมฟอร์มอัตโนมัติ */
export const autoStatsInput = (data: IcuData, ym: string): StatsInput => {
  const days = data.daily.filter((d) => d.date.startsWith(ym));
  const homes = data.logs.filter((l) => l.event === 'home' && l.timestamp.startsWith(ym)).length;
  return {
    beds: data.beds.length,
    days: daysForMonth(ym),
    patientDays: days.reduce((s, d) => s + d.totalInWard, 0),
    // จำหน่าย = Refer + ย้ายวอร์ด (นับรวมใน Refer ของแท็บ Daily) + เสียชีวิต + กลับบ้าน (จากทะเบียน)
    discharges: days.reduce((s, d) => s + d.referCount + d.deathCount, 0) + homes,
  };
};

export const findStats = (data: IcuData, ym: string) => data.stats.find((s) => s.month === ym);

/** ค่าที่บันทึกไว้ในแท็บ Stats ถ้ามี ไม่เช่นนั้นใช้ค่าคำนวณอัตโนมัติ */
export const statsFor = (data: IcuData, ym: string) => {
  const saved = findStats(data, ym);
  const input: StatsInput = saved ?? autoStatsInput(data, ym);
  return { input, saved: !!saved, note: saved?.note ?? '', values: computeStats(input) };
};
