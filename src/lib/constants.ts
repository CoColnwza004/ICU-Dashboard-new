import type { Acuity, BedStatus, DailyKey, DeviceKey, LogEvent } from '../types';

export const HOSPITAL = 'โรงพยาบาลปากเกร็ด';
export const UNIT = 'หอผู้ป่วยวิกฤต ICU';

export const DEFAULT_BEDS = ['ICU-01', 'ICU-02', 'ICU-03', 'ICU-04'];

export interface DeviceDef {
  key: DeviceKey;
  dailyKey: DailyKey;
  label: string;
  th: string;
}

/** อุปกรณ์ / ตัวชี้วัดคุณภาพรายเตียง — ลำดับตรงกับคอลัมน์ G..N ในแท็บ Beds */
export const DEVICES: DeviceDef[] = [
  { key: 'onVentilator', dailyKey: 'ventilatorCount', label: 'Ventilator', th: 'เครื่องช่วยหายใจ' },
  { key: 'hasCLine', dailyKey: 'cLineCount', label: 'C-Line', th: 'สายสวนหลอดเลือดดำส่วนกลาง' },
  { key: 'hasFoley', dailyKey: 'foleyCount', label: 'Foley', th: 'สายสวนปัสสาวะ' },
  { key: 'hasMdr', dailyKey: 'mdrCount', label: 'MDR', th: 'เชื้อดื้อยา' },
  { key: 'hasIvHl', dailyKey: 'ivHlCount', label: 'IV/HL', th: 'สายน้ำเกลือ / Heparin lock' },
  { key: 'hasPiHome', dailyKey: 'piHomeCount', label: 'PI_Home', th: 'แผลกดทับมาจากบ้าน' },
  { key: 'hasHapBundle', dailyKey: 'hapBundleCount', label: 'HAP Bundle', th: 'ปฏิบัติตาม HAP bundle' },
  { key: 'hasBradenUnder12', dailyKey: 'bradenUnder12Count', label: 'Braden < 12', th: 'เสี่ยงแผลกดทับสูง' },
];

export type IndicatorGroup = 'flow' | 'device' | 'quality';

export interface IndicatorDef {
  key: DailyKey;
  no: number;
  label: string;
  th: string;
  unit: string;
  group: IndicatorGroup;
}

/** 12 ตัวชี้วัดรายวัน — ลำดับตรงกับคอลัมน์ B..M ในแท็บ Daily */
export const INDICATORS: IndicatorDef[] = [
  { no: 1, key: 'admittedNew', label: 'รับใหม่', th: 'New admission', unit: 'ราย', group: 'flow' },
  { no: 2, key: 'totalInWard', label: 'ผู้ป่วยในวอร์ด', th: 'Census', unit: 'ราย', group: 'flow' },
  { no: 3, key: 'referCount', label: 'Refer', th: 'ส่งต่อ / ย้ายวอร์ด', unit: 'ราย', group: 'flow' },
  { no: 4, key: 'deathCount', label: 'เสียชีวิต', th: 'Death', unit: 'ราย', group: 'flow' },
  { no: 5, key: 'ventilatorCount', label: 'Ventilator', th: 'เครื่องช่วยหายใจ', unit: 'ราย', group: 'device' },
  { no: 6, key: 'cLineCount', label: 'C-Line', th: 'Central line', unit: 'ราย', group: 'device' },
  { no: 7, key: 'foleyCount', label: 'Foley', th: 'สายสวนปัสสาวะ', unit: 'ราย', group: 'device' },
  { no: 8, key: 'mdrCount', label: 'MDR', th: 'เชื้อดื้อยา', unit: 'ราย', group: 'quality' },
  { no: 9, key: 'ivHlCount', label: 'IV/HL', th: 'สายน้ำเกลือ / HL', unit: 'ราย', group: 'device' },
  { no: 10, key: 'piHomeCount', label: 'PI_Home', th: 'แผลกดทับจากบ้าน', unit: 'ราย', group: 'quality' },
  { no: 11, key: 'hapBundleCount', label: 'HAP Bundle', th: 'ป้องกันปอดอักเสบ', unit: 'ราย', group: 'quality' },
  { no: 12, key: 'bradenUnder12Count', label: 'Braden < 12', th: 'เสี่ยงแผลกดทับสูง', unit: 'ราย', group: 'quality' },
];

export const INDICATOR_BY_KEY = Object.fromEntries(INDICATORS.map((i) => [i.key, i])) as Record<
  DailyKey,
  IndicatorDef
>;

export const STATUS_META: Record<BedStatus, { label: string; dot: string }> = {
  occupied: { label: 'มีผู้ป่วย', dot: 'bg-ink' },
  available: { label: 'ว่าง', dot: 'bg-good' },
  cleaning: { label: 'ทำความสะอาด', dot: 'bg-warn' },
};

export const ACUITIES: Acuity[] = ['Critical', 'High', 'Moderate', 'Stable'];

export const ACUITY_META: Record<Acuity, { th: string; dot: string }> = {
  Critical: { th: 'วิกฤต', dot: 'bg-critical' },
  High: { th: 'สูง', dot: 'bg-serious' },
  Moderate: { th: 'ปานกลาง', dot: 'bg-warn' },
  Stable: { th: 'คงที่', dot: 'bg-good' },
};

export const AGE_GROUPS = ['< 20 ปี', '20–40 ปี', '40–60 ปี', '60–70 ปี', '70–80 ปี', '> 80 ปี'];

export const EVENT_META: Record<LogEvent, { label: string; out: boolean }> = {
  admit: { label: 'รับเข้า', out: false },
  home: { label: 'จำหน่ายกลับบ้าน', out: true },
  ward: { label: 'ย้ายวอร์ด', out: true },
  refer: { label: 'ส่งต่อ (Refer)', out: true },
  expired: { label: 'เสียชีวิต', out: true },
};

/** ชุดสีกราฟ (ตรวจสอบความต่างของสีสำหรับผู้มีภาวะตาบอดสีแล้ว) — ใช้ตามลำดับ ไม่วนซ้ำ */
export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
export const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500'];
