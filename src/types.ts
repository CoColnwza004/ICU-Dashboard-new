export type BedStatus = 'available' | 'occupied' | 'cleaning';
export type Acuity = 'Critical' | 'High' | 'Moderate' | 'Stable';
export type Gender = 'ชาย' | 'หญิง' | 'อื่นๆ' | '';

/** 8 อุปกรณ์ / ตัวชี้วัดคุณภาพรายผู้ป่วย */
export type DeviceKey =
  | 'onVentilator'
  | 'hasCLine'
  | 'hasFoley'
  | 'hasMdr'
  | 'hasIvHl'
  | 'hasPiHome'
  | 'hasHapBundle'
  | 'hasBradenUnder12';

/** 1 เตียง = 1 แถวในแท็บ Beds (ไม่มีข้อมูลระบุตัวตนผู้ป่วย) */
export interface Bed extends Record<DeviceKey, boolean> {
  bedNumber: string;
  status: BedStatus;
  caseCode: string;
  acuity: Acuity | '';
  ageGroup: string;
  gender: Gender;
  admittedAt: string; // yyyy-MM-ddTHH:mm(:ss) เวลาท้องถิ่น
  clinicalGoals: string;
  updatedAt: string;
  row?: number;
}

export type DailyKey =
  | 'admittedNew'
  | 'totalInWard'
  | 'referCount'
  | 'deathCount'
  | 'ventilatorCount'
  | 'cLineCount'
  | 'foleyCount'
  | 'mdrCount'
  | 'ivHlCount'
  | 'piHomeCount'
  | 'hapBundleCount'
  | 'bradenUnder12Count';

/** 1 วัน = 1 แถวในแท็บ Daily */
export interface DailyRecord extends Record<DailyKey, number> {
  date: string; // yyyy-MM-dd
  notes: string;
  row?: number;
}

export type LogEvent = 'admit' | 'home' | 'ward' | 'refer' | 'expired';

export interface LogEntry {
  timestamp: string;
  event: LogEvent;
  bedNumber: string;
  caseCode: string;
  acuity: string;
  admittedAt: string;
  note: string;
  row?: number;
}

export interface SheetMeta {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  gids: { beds: number; daily: number; log: number };
}

export interface IcuData {
  beds: Bed[];
  daily: DailyRecord[];
  logs: LogEntry[];
}

export type SheetOp =
  | { type: 'upsertBed'; bed: Partial<Bed> & { bedNumber: string } }
  | { type: 'upsertDaily'; record: Partial<DailyRecord> & { date: string } }
  | { type: 'appendLog'; entry: LogEntry };

export type SyncState = 'local' | 'connecting' | 'live' | 'saving' | 'offline' | 'error';
