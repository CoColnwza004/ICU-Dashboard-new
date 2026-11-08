export type BedStatus = 'available' | 'occupied' | 'cleaning';
export type Acuity = 'Critical' | 'High' | 'Moderate' | 'Stable';
export type Gender = 'ชาย' | 'หญิง' | 'อื่นๆ' | '';

/** 10 อุปกรณ์ / ตัวชี้วัดคุณภาพรายผู้ป่วย */
export type DeviceKey =
  | 'onVentilator'
  | 'hasCLine'
  | 'hasFoley'
  | 'hasMdr'
  | 'hasIvHl'
  | 'hasPiHome'
  | 'hasHapBundle'
  | 'hasBradenUnder12'
  | 'hasHighFlow'
  | 'hasCannula';

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
  | 'bradenUnder12Count'
  | 'highFlowCount'
  | 'cannulaCount';

/** 1 วัน = 1 แถวในแท็บ Daily */
export interface DailyRecord extends Record<DailyKey, number> {
  date: string; // yyyy-MM-dd
  notes: string;
  row?: number;
}

export type LogEvent = 'admit' | 'home' | 'ward' | 'refer' | 'expired' | 'move';
/** เหตุการณ์ที่ผู้ป่วยออกจาก ICU */
export type OutEvent = 'home' | 'ward' | 'refer' | 'expired';

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

/** 1 เดือน = 1 แถวในแท็บ Stats (ค่า ADC/ALOS/BOR/BTR/TOI คำนวณจากช่องเหล่านี้) */
export interface StatsRecord {
  month: string; // yyyy-MM
  beds: number;
  days: number;
  patientDays: number;
  discharges: number;
  note: string;
  row?: number;
}

export type StaffGroup = 'แพทย์' | 'พยาบาล' | 'ผู้ช่วยพยาบาล' | 'พนักงานช่วยเหลือคนไข้' | 'อื่นๆ';

/** 1 คน = 1 แถวในแท็บ Staff (มีแค่ชื่อและรูป ไม่มีเบอร์โทร) */
export interface Staff {
  id: string;
  name: string;
  nickname: string;
  position: string;
  group: StaffGroup;
  reportsTo: string;
  photo: string;
  skills: string[];
  order: number;
  active: boolean;
  row?: number;
}

/** 1 คน ต่อ 1 เดือน = 1 แถวในแท็บ Roster · days[0] = วันที่ 1 */
export interface RosterRow {
  month: string; // yyyy-MM
  staffId: string;
  name: string;
  days: string[];
  row?: number;
}

export type DocCategory =
  | 'ควบคุมการติดเชื้อ'
  | 'การดูแลผู้ป่วยวิกฤต'
  | 'ภาวะฉุกเฉิน'
  | 'ยาและสารน้ำ'
  | 'การรับ-ส่งต่อผู้ป่วย'
  | 'อุปกรณ์การแพทย์'
  | 'ระเบียบหน่วยงาน'
  | 'อื่นๆ';
export type DocType = 'SOP' | 'แนวปฏิบัติ (CPG)' | 'ระเบียบ / ข้อบังคับ' | 'คู่มือ' | 'แบบฟอร์ม' | 'เอกสารทั่วไป';

/** 1 เอกสาร = 1 แถวในแท็บ Docs */
export interface Doc {
  id: string;
  title: string;
  category: DocCategory;
  type: DocType;
  summary: string;
  /** ขั้นตอนสั้น ๆ 1 บรรทัด = 1 ข้อ */
  content: string;
  link: string;
  version: string;
  effectiveDate: string; // yyyy-MM-dd
  reviewDate: string; // yyyy-MM-dd
  owner: string;
  tags: string[];
  pinned: boolean;
  active: boolean;
  updatedAt: string;
  row?: number;
}

export type NewsCategory = 'ประกาศ' | 'ข่าวสาร' | 'กิจกรรม' | 'อบรม / ประชุม' | 'ด่วน';

/** 1 ข่าว = 1 แถวในแท็บ News */
export interface News {
  id: string;
  title: string;
  body: string;
  category: NewsCategory;
  date: string; // yyyy-MM-dd
  image: string;
  attachment: string;
  pinned: boolean;
  author: string;
  published: boolean;
  updatedAt: string;
  row?: number;
}

/** ที่มาของตัวตั้ง / ตัวหาร: กรอกเอง หรือดึงอัตโนมัติจากข้อมูลรายวัน */
export type KpiSource =
  | 'กรอกเอง'
  | 'วันนอนรวม'
  | 'วันใช้เครื่องช่วยหายใจ'
  | 'วันใส่ C-Line'
  | 'วันใส่ Foley'
  | 'จำนวนรับใหม่'
  | 'จำนวนจำหน่าย'
  | 'จำนวนเสียชีวิต';

/** นิยามตัวชี้วัดคุณภาพ 1 ตัว = 1 แถวในแท็บ KPI */
export interface Kpi {
  id: string;
  name: string;
  group: string;
  unit: string;
  multiplier: number;
  target: number | null;
  direction: '≤' | '≥';
  numeratorLabel: string;
  numeratorSource: KpiSource;
  denominatorLabel: string;
  denominatorSource: KpiSource;
  description: string;
  order: number;
  active: boolean;
  row?: number;
}

/** ผล KPI 1 ตัว ต่อ 1 เดือน = 1 แถวในแท็บ KPIData */
export interface KpiData {
  month: string; // yyyy-MM
  kpiId: string;
  numerator: number | null;
  denominator: number | null;
  note: string;
  updatedAt: string;
  row?: number;
}

export type LinkCategory = 'แบบประเมิน' | 'รายงานอุบัติการณ์' | 'ลงทะเบียน' | 'อื่นๆ';

/** ลิงก์ Google Forms 1 รายการ = 1 แถวในแท็บ Links */
export interface FormLink {
  id: string;
  title: string;
  description: string;
  url: string;
  category: LinkCategory;
  order: number;
  active: boolean;
  row?: number;
}

export interface SheetMeta {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  gids: {
    beds: number;
    daily: number;
    log: number;
    stats?: number;
    staff?: number;
    roster?: number;
    docs?: number;
    news?: number;
    kpi?: number;
    kpiData?: number;
    links?: number;
  };
}

export interface IcuData {
  beds: Bed[];
  daily: DailyRecord[];
  logs: LogEntry[];
  stats: StatsRecord[];
  staff: Staff[];
  roster: RosterRow[];
  docs: Doc[];
  news: News[];
  kpis: Kpi[];
  kpiData: KpiData[];
  links: FormLink[];
}

export type SheetOp =
  | { type: 'upsertBed'; bed: Partial<Bed> & { bedNumber: string } }
  | { type: 'upsertDaily'; record: Partial<DailyRecord> & { date: string } }
  | { type: 'appendLog'; entry: LogEntry }
  | { type: 'upsertStats'; record: Omit<StatsRecord, 'row'> }
  | { type: 'upsertStaff'; staff: Partial<Omit<Staff, 'row'>> & { id: string } }
  | { type: 'upsertRoster'; record: { month: string; staffId: string; name: string; days: Record<string, string> } }
  | { type: 'uploadPhoto'; staffId: string; dataUrl: string }
  | { type: 'deleteStaff'; id: string; fromMonth: string }
  | { type: 'deleteLog'; rows: { row: number; caseCode: string; bedNumber: string }[] }
  | { type: 'updateLog'; row: number; caseCode: string; bedNumber: string; patch: { timestamp?: string; admittedAt?: string; note?: string } }
  | { type: 'upsertDoc'; doc: Partial<Omit<Doc, 'row' | 'active' | 'updatedAt'>> & { id: string; status?: 'ใช้งาน' | 'ยกเลิก' } }
  | { type: 'uploadDoc'; docId: string; name: string; dataUrl: string }
  | { type: 'upsertNews'; news: Partial<Omit<News, 'row' | 'published' | 'updatedAt'>> & { id: string; status?: 'เผยแพร่' | 'ซ่อน' } }
  | { type: 'uploadNewsFile'; newsId: string; field: 'image' | 'attachment'; name: string; dataUrl: string }
  | { type: 'upsertKpi'; kpi: Partial<Omit<Kpi, 'row' | 'target'>> & { id: string; target?: number | '' } }
  | { type: 'upsertKpiData'; record: { month: string; kpiId: string; numerator: number | ''; denominator: number | ''; note: string } }
  | { type: 'upsertLink'; link: Partial<Omit<FormLink, 'row'>> & { id: string } };

export type SyncState = 'local' | 'connecting' | 'live' | 'saving' | 'offline' | 'error';
