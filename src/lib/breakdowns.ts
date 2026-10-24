import type { Bed, DailyKey, DailyRecord, LogEntry } from '../types';
import type { Slice } from '../components/charts';
import { ACUITIES, ACUITY_COLOR, EVENT_META, INDICATOR_BY_KEY, STATUS_META } from './constants';

/** ข้อมูลสำหรับแผนภูมิวงกลม (สัดส่วน) */

export const dischargeSlices = (logs: LogEntry[]): Slice[] =>
  (['home', 'ward', 'refer', 'expired'] as const).map((e) => ({
    key: e,
    label: EVENT_META[e].label,
    value: logs.filter((l) => l.event === e).length,
  }));

export const admitAcuitySlices = (logs: LogEntry[]): Slice[] => {
  const admits = logs.filter((l) => l.event === 'admit');
  const known = ACUITIES.map((a) => ({
    key: a,
    label: a,
    value: admits.filter((l) => l.acuity === a).length,
    color: ACUITY_COLOR[a],
  }));
  const other = admits.length - known.reduce((s, x) => s + x.value, 0);
  return other > 0 ? [...known, { key: 'none', label: 'ไม่ระบุ', value: other, color: '#8e8e93' }] : known;
};

export const sumSlices = (days: Partial<DailyRecord>[], keys: DailyKey[]): Slice[] =>
  keys.map((k) => ({
    key: k,
    label: INDICATOR_BY_KEY[k].label,
    value: days.reduce((s, d) => s + (d[k] ?? 0), 0),
  }));

export const bedStatusSlices = (beds: Bed[]): Slice[] =>
  (['occupied', 'available', 'cleaning'] as const).map((st, i) => ({
    key: st,
    label: STATUS_META[st].label,
    value: beds.filter((b) => b.status === st).length,
    color: ['#2a78d6', '#0ca30c', '#fab219'][i],
  }));

export const bedAcuitySlices = (beds: Bed[]): Slice[] =>
  ACUITIES.map((a) => ({
    key: a,
    label: a,
    value: beds.filter((b) => b.status === 'occupied' && b.acuity === a).length,
    color: ACUITY_COLOR[a],
  }));
