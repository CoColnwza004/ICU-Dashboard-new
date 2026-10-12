import type {
  Acuity,
  Bed,
  BedStatus,
  DailyKey,
  DailyRecord,
  Gender,
  IcuData,
  LogEntry,
  LogEvent,
  SheetOp,
} from '../types';
import { ACUITIES, DEFAULT_BEDS, DEVICES, INDICATORS } from './constants';
import { normalizeDateKey, parseLocalDateTime, shiftDate, toLocalDateTime, todayKey } from './date';

/* ------------------------------------------------------------------ */
/* Factories                                                           */
/* ------------------------------------------------------------------ */

export const emptyPatient = (): Omit<Bed, 'bedNumber' | 'status' | 'updatedAt' | 'row'> => ({
  caseCode: '',
  acuity: '',
  ageGroup: '',
  gender: '',
  admittedAt: '',
  clinicalGoals: '',
  onVentilator: false,
  hasCLine: false,
  hasFoley: false,
  hasMdr: false,
  hasIvHl: false,
  hasPiHome: false,
  hasHapBundle: false,
  hasBradenUnder12: false,
});

export const emptyBed = (bedNumber: string): Bed => ({
  bedNumber,
  status: 'available',
  updatedAt: '',
  ...emptyPatient(),
});

export const emptyDaily = (date: string): DailyRecord => ({
  date,
  notes: '',
  ...(Object.fromEntries(INDICATORS.map((i) => [i.key, 0])) as Record<DailyKey, number>),
});

export const initialData = (): IcuData => ({
  beds: DEFAULT_BEDS.map(emptyBed),
  daily: [],
  logs: [],
});

/* ------------------------------------------------------------------ */
/* Normalising rows coming from the sheet (people type all sorts)      */
/* ------------------------------------------------------------------ */

const TRUTHY = new Set(['true', 'yes', 'y', '1', 'x', '✓', '✔', 'จริง', 'มี', 'ใช่']);
export const toBool = (v: unknown) => v === true || TRUTHY.has(String(v ?? '').trim().toLowerCase());

const toInt = (v: unknown) => {
  const n = Number.parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

export const toStatus = (v: unknown): BedStatus => {
  const s = str(v).toLowerCase();
  if (['occupied', 'มีผู้ป่วย', 'ครองเตียง', 'ไม่ว่าง'].includes(s)) return 'occupied';
  if (['cleaning', 'ทำความสะอาด', 'ฆ่าเชื้อ', 'maintenance', 'ซ่อมบำรุง'].includes(s)) return 'cleaning';
  return 'available';
};

const ACUITY_TH: Record<string, Acuity> = { วิกฤต: 'Critical', สูง: 'High', ปานกลาง: 'Moderate', คงที่: 'Stable' };
export const toAcuity = (v: unknown): Acuity | '' => {
  const s = str(v);
  return ACUITIES.find((a) => a.toLowerCase() === s.toLowerCase()) ?? ACUITY_TH[s] ?? '';
};

const toGender = (v: unknown): Gender => {
  const s = str(v).toLowerCase();
  if (['ชาย', 'male', 'm', 'ช'].includes(s)) return 'ชาย';
  if (['หญิง', 'female', 'f', 'ญ'].includes(s)) return 'หญิง';
  return s ? 'อื่นๆ' : '';
};

const EVENT_ALIASES: Record<string, LogEvent> = {
  admit: 'admit',
  รับเข้า: 'admit',
  home: 'home',
  จำหน่ายกลับบ้าน: 'home',
  กลับบ้าน: 'home',
  ward: 'ward',
  ย้ายวอร์ด: 'ward',
  refer: 'refer',
  'ส่งต่อ (refer)': 'refer',
  ส่งต่อ: 'refer',
  expired: 'expired',
  เสียชีวิต: 'expired',
};

type Raw = Record<string, unknown>;

export const normalizeBed = (r: Raw): Bed => {
  const bed: Bed = {
    bedNumber: str(r.bedNumber),
    status: toStatus(r.status),
    caseCode: str(r.caseCode),
    acuity: toAcuity(r.acuity),
    ageGroup: str(r.ageGroup),
    gender: toGender(r.gender),
    admittedAt: str(r.admittedAt),
    clinicalGoals: str(r.clinicalGoals),
    updatedAt: str(r.updatedAt),
    row: typeof r.row === 'number' ? r.row : undefined,
    ...(Object.fromEntries(DEVICES.map((d) => [d.key, toBool(r[d.key])])) as Record<
      (typeof DEVICES)[number]['key'],
      boolean
    >),
  };
  // ถ้าในชีตกรอกรหัสเคสไว้แต่ลืมเปลี่ยนสถานะ ให้ถือว่ามีผู้ป่วย
  if (bed.status === 'available' && bed.caseCode) bed.status = 'occupied';
  return bed;
};

export const normalizeDaily = (r: Raw): DailyRecord => ({
  ...emptyDaily(normalizeDateKey(r.date)),
  ...(Object.fromEntries(INDICATORS.map((i) => [i.key, toInt(r[i.key])])) as Record<DailyKey, number>),
  notes: str(r.notes),
  row: typeof r.row === 'number' ? r.row : undefined,
});

export const normalizeLog = (r: Raw): LogEntry => ({
  timestamp: str(r.timestamp),
  event: EVENT_ALIASES[str(r.event).toLowerCase()] ?? 'admit',
  bedNumber: str(r.bedNumber),
  caseCode: str(r.caseCode),
  acuity: str(r.acuity),
  admittedAt: str(r.admittedAt),
  note: str(r.note),
  row: typeof r.row === 'number' ? r.row : undefined,
});

export const normalizeData = (raw: { beds?: Raw[]; daily?: Raw[]; logs?: Raw[] }): IcuData => ({
  beds: (raw.beds ?? []).map(normalizeBed).filter((b) => b.bedNumber),
  daily: (raw.daily ?? [])
    .map(normalizeDaily)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    .sort((a, b) => a.date.localeCompare(b.date)),
  logs: (raw.logs ?? []).map(normalizeLog),
});

/* ------------------------------------------------------------------ */
/* Derived values                                                      */
/* ------------------------------------------------------------------ */

export const occupied = (beds: Bed[]) => beds.filter((b) => b.status === 'occupied');

/** ยอดคงพยาบาลและอุปกรณ์ ณ ปัจจุบัน คำนวณจากผังเตียง */
export const countsFromBeds = (beds: Bed[]) => {
  const occ = occupied(beds);
  const out: Partial<Record<DailyKey, number>> = { totalInWard: occ.length };
  DEVICES.forEach((d) => {
    out[d.dailyKey] = occ.filter((b) => b[d.key]).length;
  });
  return out;
};

export const findDaily = (daily: DailyRecord[], date: string) => daily.find((d) => d.date === date);

/* ------------------------------------------------------------------ */
/* Actions — each returns the next local state + ops for the sheet     */
/* ------------------------------------------------------------------ */

export interface ActionResult {
  next: IcuData;
  ops: SheetOp[];
}

const putBed = (beds: Bed[], bed: Bed) => beds.map((b) => (b.bedNumber === bed.bedNumber ? bed : b));

const putDaily = (daily: DailyRecord[], rec: DailyRecord) => {
  const exists = daily.some((d) => d.date === rec.date);
  const list = exists ? daily.map((d) => (d.date === rec.date ? rec : d)) : [...daily, rec];
  return list.sort((a, b) => a.date.localeCompare(b.date));
};

/** อัปเดตแถวของวันนี้: ยอดคงพยาบาล/อุปกรณ์ตามผังเตียง + เพิ่มยอดเหตุการณ์ (รับใหม่, refer, เสียชีวิต) */
const touchToday = (daily: DailyRecord[], beds: Bed[], inc: Partial<Record<DailyKey, number>> = {}) => {
  const date = todayKey();
  const base = findDaily(daily, date) ?? emptyDaily(date);
  const patch: Partial<DailyRecord> = { ...countsFromBeds(beds) };
  (Object.keys(inc) as DailyKey[]).forEach((k) => {
    patch[k] = base[k] + (inc[k] ?? 0);
  });
  const rec = { ...base, ...patch };
  return {
    daily: putDaily(daily, rec),
    op: { type: 'upsertDaily', record: { date, ...patch } } as SheetOp,
  };
};

const bedOp = (bed: Bed): SheetOp => {
  const { row: _row, updatedAt: _u, ...rest } = bed;
  return { type: 'upsertBed', bed: rest };
};

export type PatientInput = Pick<
  Bed,
  'caseCode' | 'acuity' | 'ageGroup' | 'gender' | 'clinicalGoals' | (typeof DEVICES)[number]['key']
> & { admittedAt?: string };

export const admitPatient = (data: IcuData, bedNumber: string, p: PatientInput): ActionResult => {
  const prev = data.beds.find((b) => b.bedNumber === bedNumber) ?? emptyBed(bedNumber);
  const admittedAt = p.admittedAt || toLocalDateTime();
  const bed: Bed = { ...prev, ...p, admittedAt, status: 'occupied', updatedAt: toLocalDateTime() };
  const beds = putBed(data.beds, bed);
  const today = touchToday(data.daily, beds, { admittedNew: 1 });
  const entry: LogEntry = {
    timestamp: toLocalDateTime(),
    event: 'admit',
    bedNumber,
    caseCode: bed.caseCode,
    acuity: bed.acuity,
    admittedAt,
    note: bed.clinicalGoals,
  };
  return {
    next: { beds, daily: today.daily, logs: [...data.logs, entry] },
    ops: [bedOp(bed), today.op, { type: 'appendLog', entry }],
  };
};

export const updateBed = (data: IcuData, bedNumber: string, patch: Partial<Bed>): ActionResult => {
  const prev = data.beds.find((b) => b.bedNumber === bedNumber) ?? emptyBed(bedNumber);
  const bed: Bed = { ...prev, ...patch, bedNumber, updatedAt: toLocalDateTime() };
  const beds = putBed(data.beds, bed);
  const touchesCensus = prev.status === 'occupied' || bed.status === 'occupied';
  if (!touchesCensus) return { next: { ...data, beds }, ops: [bedOp(bed)] };
  const today = touchToday(data.daily, beds);
  return { next: { ...data, beds, daily: today.daily }, ops: [bedOp(bed), today.op] };
};

export const dischargePatient = (
  data: IcuData,
  bedNumber: string,
  event: Exclude<LogEvent, 'admit'>,
  note: string,
): ActionResult => {
  const prev = data.beds.find((b) => b.bedNumber === bedNumber);
  if (!prev) return { next: data, ops: [] };
  const bed: Bed = { ...emptyBed(bedNumber), row: prev.row, status: 'cleaning', updatedAt: toLocalDateTime() };
  const beds = putBed(data.beds, bed);
  const inc: Partial<Record<DailyKey, number>> =
    event === 'expired' ? { deathCount: 1 } : event === 'refer' || event === 'ward' ? { referCount: 1 } : {};
  const today = touchToday(data.daily, beds, inc);
  const entry: LogEntry = {
    timestamp: toLocalDateTime(),
    event,
    bedNumber,
    caseCode: prev.caseCode,
    acuity: prev.acuity,
    admittedAt: prev.admittedAt,
    note,
  };
  return {
    next: { beds, daily: today.daily, logs: [...data.logs, entry] },
    ops: [bedOp(bed), today.op, { type: 'appendLog', entry }],
  };
};

export const saveDaily = (data: IcuData, rec: DailyRecord): ActionResult => {
  const { row: _row, ...record } = rec;
  return { next: { ...data, daily: putDaily(data.daily, rec) }, ops: [{ type: 'upsertDaily', record }] };
};

/** ส่งข้อมูลทั้งหมดในเครื่องขึ้นชีต (ใช้ตอนเชื่อมต่อครั้งแรก) */
export const pushAllOps = (data: IcuData): SheetOp[] => [
  ...data.beds.map(bedOp),
  ...data.daily.map((d) => {
    const { row: _row, ...record } = d;
    return { type: 'upsertDaily', record } as SheetOp;
  }),
  ...data.logs.map((l) => {
    const { row: _row, ...entry } = l;
    return { type: 'appendLog', entry } as SheetOp;
  }),
];

/* ------------------------------------------------------------------ */
/* Monthly report                                                      */
/* ------------------------------------------------------------------ */

export const monthlySummary = (data: IcuData, ym: string) => {
  const bedCount = Math.max(1, data.beds.length);
  const days = data.daily.filter((d) => d.date.startsWith(ym));
  const sum = (k: DailyKey) => days.reduce((s, d) => s + d[k], 0);
  const patientDays = sum('totalInWard');
  const admissions = sum('admittedNew');
  const occupancy = days.length ? Math.round((patientDays / (days.length * bedCount)) * 100) : 0;
  const peak = days.reduce<DailyRecord | null>((p, d) => (!p || d.totalInWard > p.totalInWard ? d : p), null);
  const logs = data.logs
    .filter((l) => l.timestamp.startsWith(ym))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const outs = logs.filter((l) => l.event !== 'admit');
  const stays = outs
    .map((l) => {
      const a = parseLocalDateTime(l.admittedAt);
      const b = parseLocalDateTime(l.timestamp);
      return a && b ? (b.getTime() - a.getTime()) / 86_400_000 : null;
    })
    .filter((x): x is number => x !== null && x >= 0);
  const alos = stays.length
    ? stays.reduce((s, x) => s + x, 0) / stays.length
    : admissions
      ? patientDays / admissions
      : 0;
  return {
    days,
    logs,
    admissions,
    refers: sum('referCount'),
    deaths: sum('deathCount'),
    discharges: outs.filter((l) => l.event === 'home').length,
    patientDays,
    ventilatorDays: sum('ventilatorCount'),
    ventilatorRate: patientDays ? Math.round((sum('ventilatorCount') / patientDays) * 100) : 0,
    occupancy,
    alos: Math.round(alos * 10) / 10,
    peak,
    bedCount,
  };
};

export const availableMonths = (data: IcuData) => {
  const set = new Set<string>([todayKey().slice(0, 7)]);
  data.daily.forEach((d) => set.add(d.date.slice(0, 7)));
  data.logs.forEach((l) => l.timestamp && set.add(l.timestamp.slice(0, 7)));
  return [...set].filter((m) => /^\d{4}-\d{2}$/.test(m)).sort().reverse();
};

/* ------------------------------------------------------------------ */
/* Demo data (local mode only)                                         */
/* ------------------------------------------------------------------ */

export const demoData = (): IcuData => {
  const today = todayKey();
  let seed = 7;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const daily: DailyRecord[] = [];
  let census = 2;
  for (let i = 44; i >= 0; i--) {
    const date = shiftDate(today, -i);
    const admitted = rnd() > 0.55 ? 1 : 0;
    const refer = census > 1 && rnd() > 0.75 ? 1 : 0;
    const death = census > 1 && rnd() > 0.93 ? 1 : 0;
    census = Math.min(4, Math.max(0, census + admitted - refer - death));
    const vent = Math.min(census, Math.round(census * (0.4 + rnd() * 0.5)));
    daily.push({
      ...emptyDaily(date),
      admittedNew: admitted,
      totalInWard: census,
      referCount: refer,
      deathCount: death,
      ventilatorCount: vent,
      cLineCount: Math.min(census, vent + (rnd() > 0.5 ? 1 : 0)),
      foleyCount: Math.min(census, Math.round(census * 0.8)),
      mdrCount: rnd() > 0.8 ? 1 : 0,
      ivHlCount: census,
      piHomeCount: rnd() > 0.85 ? 1 : 0,
      hapBundleCount: vent,
      bradenUnder12Count: Math.min(census, rnd() > 0.6 ? 1 : 0),
    });
  }
  const now = new Date();
  const ago = (d: number) => toLocalDateTime(new Date(now.getTime() - d * 86_400_000));
  const beds: Bed[] = [
    {
      ...emptyBed('ICU-01'),
      status: 'occupied',
      caseCode: 'CASE-2410',
      acuity: 'Critical',
      ageGroup: '70–80 ปี',
      gender: 'ชาย',
      admittedAt: ago(3.2),
      clinicalGoals: 'MAP > 65, lung protective ventilation',
      onVentilator: true,
      hasCLine: true,
      hasFoley: true,
      hasIvHl: true,
      hasHapBundle: true,
      hasBradenUnder12: true,
    },
    {
      ...emptyBed('ICU-02'),
      status: 'occupied',
      caseCode: 'CASE-2414',
      acuity: 'High',
      ageGroup: '60–70 ปี',
      gender: 'หญิง',
      admittedAt: ago(1.4),
      clinicalGoals: 'Weaning trial, SpO₂ > 94%',
      onVentilator: true,
      hasFoley: true,
      hasIvHl: true,
      hasMdr: true,
      hasHapBundle: true,
    },
    { ...emptyBed('ICU-03'), status: 'cleaning' },
    emptyBed('ICU-04'),
  ];
  const t = daily[daily.length - 1];
  Object.assign(t, countsFromBeds(beds));
  const logs: LogEntry[] = [
    { timestamp: ago(3.2), event: 'admit', bedNumber: 'ICU-01', caseCode: 'CASE-2410', acuity: 'Critical', admittedAt: ago(3.2), note: '' },
    { timestamp: ago(2.1), event: 'refer', bedNumber: 'ICU-03', caseCode: 'CASE-2402', acuity: 'High', admittedAt: ago(6), note: 'ส่งต่อ รพ.ศูนย์' },
    { timestamp: ago(1.4), event: 'admit', bedNumber: 'ICU-02', caseCode: 'CASE-2414', acuity: 'High', admittedAt: ago(1.4), note: '' },
    { timestamp: ago(0.3), event: 'ward', bedNumber: 'ICU-03', caseCode: 'CASE-2408', acuity: 'Moderate', admittedAt: ago(4.5), note: 'ย้ายอายุรกรรมชาย' },
  ];
  return { beds, daily, logs };
};

