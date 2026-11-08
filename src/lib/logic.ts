import type {
  RosterRow,
  Staff,
  StaffGroup,
  StatsRecord,
  Acuity,
  Bed,
  BedStatus,
  DailyKey,
  DailyRecord,
  DeviceKey,
  Gender,
  IcuData,
  LogEntry,
  LogEvent,
  OutEvent,
  SheetOp,
} from '../types';
import { ACUITIES, DEFAULT_BEDS, DEVICES, EVENT_META, INDICATORS } from './constants';
import { demoDocs, docOp, normalizeDoc, sortDocs } from './docs';
import { demoKpis, demoLinks, demoNews, normalizeKpi, normalizeKpiData, normalizeLink, normalizeNews, sortKpis, sortLinks, sortNews } from './content';
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
  hasHighFlow: false,
  hasCannula: false,
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
  stats: [],
  staff: [],
  roster: [],
  docs: [],
  news: [],
  kpis: [],
  kpiData: [],
  links: [],
});

/** ข้อมูลเก่าในเบราว์เซอร์ (ก่อนมีแท็บ Stats / 8 เตียง) → รูปแบบปัจจุบัน */
export const upgradeLocalData = (d: Partial<IcuData>): IcuData => {
  const beds = [...(d.beds ?? [])];
  DEFAULT_BEDS.forEach((n) => {
    if (!beds.some((b) => b.bedNumber === n)) beds.push(emptyBed(n));
  });
  beds.sort((a, b) => a.bedNumber.localeCompare(b.bedNumber));
  return {
    ...initialData(),
    ...d,
    beds,
  };
};

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
  move: 'move',
  ย้ายเตียง: 'move',
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

const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const normalizeStats = (r: Raw): StatsRecord => ({
  month: normalizeDateKey(`${str(r.month)}-01`).slice(0, 7),
  beds: num(r.beds),
  days: num(r.days),
  patientDays: num(r.patientDays),
  discharges: num(r.discharges),
  note: str(r.note),
  row: typeof r.row === 'number' ? r.row : undefined,
});

const STAFF_GROUPS: StaffGroup[] = ['แพทย์', 'พยาบาล', 'ผู้ช่วยพยาบาล', 'พนักงานช่วยเหลือคนไข้', 'อื่นๆ'];

export const normalizeStaff = (r: Raw): Staff => {
  const g = str(r.group);
  return {
    id: str(r.id),
    name: str(r.name),
    nickname: str(r.nickname),
    position: str(r.position),
    group: (STAFF_GROUPS.find((x) => x === g) ?? (g.includes('พยาบาล') && !g.includes('ผู้ช่วย') ? 'พยาบาล' : 'อื่นๆ')) as StaffGroup,
    reportsTo: str(r.reportsTo),
    photo: str(r.photo),
    skills: str(r.skills)
      .split(/[,،;]/)
      .map((x) => x.trim())
      .filter(Boolean),
    order: Number(r.order) || 0,
    active: r.active !== false && str(r.active) !== 'ไม่ใช้งาน',
    row: typeof r.row === 'number' ? r.row : undefined,
  };
};

export const normalizeRoster = (r: Raw): RosterRow => {
  const days = Array.isArray(r.days) ? (r.days as unknown[]).map(str) : [];
  while (days.length < 31) days.push('');
  return {
    month: normalizeDateKey(`${str(r.month)}-01`).slice(0, 7),
    staffId: str(r.staffId),
    name: str(r.name),
    days: days.slice(0, 31),
    row: typeof r.row === 'number' ? r.row : undefined,
  };
};

const byOrder = (a: Staff, b: Staff) => a.order - b.order || a.id.localeCompare(b.id);

export const normalizeData = (raw: {
  beds?: Raw[];
  daily?: Raw[];
  logs?: Raw[];
  stats?: Raw[];
  staff?: Raw[];
  roster?: Raw[];
  docs?: Raw[];
  news?: Raw[];
  kpis?: Raw[];
  kpiData?: Raw[];
  links?: Raw[];
}): IcuData => ({
  news: (raw.news ?? []).map(normalizeNews).filter((n) => n.id && n.title).sort(sortNews),
  kpis: (raw.kpis ?? []).map(normalizeKpi).filter((k) => k.id && k.name).sort(sortKpis),
  kpiData: (raw.kpiData ?? []).map(normalizeKpiData).filter((x) => /^\d{4}-\d{2}$/.test(x.month) && x.kpiId),
  links: (raw.links ?? []).map(normalizeLink).filter((l) => l.id && l.title).sort(sortLinks),
  docs: (raw.docs ?? []).map(normalizeDoc).filter((d) => d.id && d.title).sort(sortDocs),
  staff: (raw.staff ?? []).map(normalizeStaff).filter((x) => x.id && x.name).sort(byOrder),
  roster: (raw.roster ?? []).map(normalizeRoster).filter((x) => /^\d{4}-\d{2}$/.test(x.month) && (x.staffId || x.name)),
  beds: (raw.beds ?? []).map(normalizeBed).filter((b) => b.bedNumber),
  daily: (raw.daily ?? [])
    .map(normalizeDaily)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    .sort((a, b) => a.date.localeCompare(b.date)),
  logs: (raw.logs ?? []).map(normalizeLog),
  stats: (raw.stats ?? [])
    .map(normalizeStats)
    .filter((x) => /^\d{4}-\d{2}$/.test(x.month))
    .sort((a, b) => a.month.localeCompare(b.month)),
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

/**
 * ปรับสถานะเตียงที่บันทึกไว้ ณ เวลา `at` ให้ตรงกับทะเบียน (รวมรายการที่บันทึกย้อนหลังภายหลัง):
 * - ทะเบียนบอกว่าเคสนี้จำหน่ายไปแล้ว ณ เวลานั้น แต่ภาพบันทึกยังแสดงอยู่ → เปลี่ยนเป็น "ทำความสะอาด"
 * - ทะเบียนบอกว่าเคสนี้อยู่ในเตียง ณ เวลานั้น แต่ภาพบันทึกไม่มี (ลืมกดรับ แล้วรับย้อนหลัง) → เติมเข้าเตียงนั้น
 * เคสที่ไม่มีในทะเบียนไม่ถูกแตะ
 */
export const reconcileBeds = (beds: Bed[], logs: LogEntry[], at: string) => {
  const last = new Map<string, LogEntry>();
  logs
    .filter((l) => l.caseCode && logTime(l.timestamp) <= at)
    .sort((a, b) => logTime(a.timestamp).localeCompare(logTime(b.timestamp)))
    .forEach((l) => last.set(l.caseCode, l));
  let changed = false;
  const next = beds.map((b) => {
    const st = b.status === 'occupied' && b.caseCode ? last.get(b.caseCode) : undefined;
    if (st && EVENT_META[st.event].out) {
      changed = true;
      return { ...emptyBed(b.bedNumber), row: b.row, status: 'cleaning' as const, updatedAt: st.timestamp };
    }
    return b;
  });
  const present = new Set(next.filter((b) => b.status === 'occupied').map((b) => b.caseCode));
  last.forEach((l) => {
    if (EVENT_META[l.event].out || present.has(l.caseCode)) return;
    const i = next.findIndex((b) => b.bedNumber === l.bedNumber);
    if (i < 0 || next[i].status === 'occupied') return;
    next[i] = {
      ...emptyBed(l.bedNumber),
      row: next[i].row,
      status: 'occupied',
      caseCode: l.caseCode,
      acuity: toAcuity(l.acuity),
      admittedAt: l.admittedAt,
      updatedAt: l.timestamp,
    };
    present.add(l.caseCode);
    changed = true;
  });
  return { beds: next, changed };
};

/** วันที่ (yyyy-MM-dd) ที่ผู้ป่วยอยู่ในวอร์ด ตั้งแต่วันรับเข้าถึงวันก่อนจำหน่าย (จำหน่ายวันเดียวกัน = นับวันรับเข้า 1 วัน) · ยังไม่จำหน่าย → ถึงเมื่อวาน */
export const stayDays = (inAt: string, outAt: string | null) => {
  const first = inAt.slice(0, 10);
  const end = outAt ? outAt.slice(0, 10) : todayKey();
  const days: string[] = [];
  for (let d = first; d < end; d = shiftDate(d, 1)) days.push(d);
  if (outAt && !days.length) days.push(first);
  return days;
};

type DailyDelta = Map<string, Partial<Record<DailyKey, number>>>;
const addDelta = (delta: DailyDelta, day: string, key: DailyKey, n: number) => {
  const a = delta.get(day) ?? {};
  a[key] = (a[key] ?? 0) + n;
  delta.set(day, a);
};
/** บวก/ลบยอดรายวันหลายวันพร้อมกัน (ไม่ติดลบ) */
const applyDelta = (daily: DailyRecord[], delta: DailyDelta) => {
  const ops: SheetOp[] = [];
  delta.forEach((inc, day) => {
    const keys = (Object.keys(inc) as DailyKey[]).filter((k) => inc[k]);
    if (!keys.length) return;
    const base = findDaily(daily, day);
    if (!base && keys.every((k) => (inc[k] ?? 0) <= 0)) return;
    const rec = base ?? emptyDaily(day);
    const patch: Partial<DailyRecord> = {};
    keys.forEach((k) => (patch[k] = Math.max(0, rec[k] + (inc[k] ?? 0))));
    daily = putDaily(daily, { ...rec, ...patch });
    ops.push({ type: 'upsertDaily', record: { date: day, ...patch } });
  });
  return { daily, ops };
};
/** ผู้ป่วยในวอร์ด + อุปกรณ์ที่ติ๊กไว้ +1 ในแต่ละวันที่นอนอยู่ */
const addCensus = (delta: DailyDelta, days: string[], flags: Partial<Record<DeviceKey, boolean>>) => {
  days.forEach((d) => {
    addDelta(delta, d, 'totalInWard', 1);
    DEVICES.forEach((dv) => flags[dv.key] && addDelta(delta, d, dv.dailyKey, 1));
  });
};

/**
 * รับผู้ป่วยเข้าเตียง · เวลารับเข้าย้อนหลังได้ (ลืมกดรับ):
 * ยอดรับใหม่นับเข้าวันที่รับจริง · backfill = เพิ่มยอดผู้ป่วยในวอร์ด/อุปกรณ์ของวันก่อนหน้าที่ขาดไป
 */
export const admitPatient = (data: IcuData, bedNumber: string, p: PatientInput, opts: { backfill?: boolean } = {}): ActionResult => {
  const prev = data.beds.find((b) => b.bedNumber === bedNumber) ?? emptyBed(bedNumber);
  const now = toLocalDateTime();
  const admittedAt = logTime(p.admittedAt || now) > now ? now : logTime(p.admittedAt || now);
  const bed: Bed = { ...prev, ...p, admittedAt, status: 'occupied', updatedAt: now };
  const beds = putBed(data.beds, bed);
  const day = admittedAt.slice(0, 10);
  const sameDay = day === todayKey();
  const today = touchToday(data.daily, beds, sameDay ? { admittedNew: 1 } : {});
  const delta: DailyDelta = new Map();
  if (!sameDay) {
    addDelta(delta, day, 'admittedNew', 1);
    if (opts.backfill) addCensus(delta, stayDays(admittedAt, null), Object.fromEntries(DEVICES.map((d) => [d.key, bed[d.key]])));
  }
  const past = applyDelta(today.daily, delta);
  const entry: LogEntry = {
    timestamp: admittedAt,
    event: 'admit',
    bedNumber,
    caseCode: bed.caseCode,
    acuity: bed.acuity,
    admittedAt,
    note: bed.clinicalGoals,
  };
  return {
    next: { ...data, beds, daily: past.daily, logs: [...data.logs, entry] },
    ops: [bedOp(bed), today.op, ...past.ops, { type: 'appendLog', entry }],
  };
};

/** แก้เวลารับเข้าของผู้ป่วยที่ยังอยู่ในเตียง → แก้แถวรับเข้าในทะเบียน + ย้ายยอดรับใหม่ไปวันที่ถูกต้อง */
export const retimeAdmission = (data: IcuData, bedNumber: string, oldAt: string, newAt: string): ActionResult => {
  const bed = data.beds.find((b) => b.bedNumber === bedNumber);
  const from = logTime(oldAt);
  const to = logTime(newAt);
  if (!bed || !from || !to || from === to) return { next: data, ops: [] };
  const ops: SheetOp[] = [];
  let admitFound = false;
  const logs = data.logs.map((l) => {
    if (l.caseCode !== bed.caseCode || logTime(l.admittedAt) !== from) return l;
    const isAdmit = l.event === 'admit';
    if (isAdmit) admitFound = true;
    const upd = { ...l, admittedAt: to, timestamp: isAdmit ? to : l.timestamp };
    if (l.row) ops.push({ type: 'updateLog', row: l.row, caseCode: l.caseCode, bedNumber: l.bedNumber, patch: isAdmit ? { admittedAt: to, timestamp: to } : { admittedAt: to } });
    return upd;
  });
  const delta: DailyDelta = new Map();
  if (admitFound && from.slice(0, 10) !== to.slice(0, 10)) {
    addDelta(delta, from.slice(0, 10), 'admittedNew', -1);
    addDelta(delta, to.slice(0, 10), 'admittedNew', 1);
  }
  const moved = applyDelta(data.daily, delta);
  return { next: { ...data, logs, daily: moved.daily }, ops: [...ops, ...moved.ops] };
};

/** หมายเหตุในแถวรับเข้าของเคสที่เพิ่มย้อนหลังและนับยอดรายวันแล้ว — ใช้ตอนลบเคสเพื่อหักยอดคืน */
export const BACKFILL_MARK = 'บันทึกย้อนหลัง · นับยอดรายวันแล้ว';
/** อ่านว่าเคสนี้เคยนับยอดรายวันย้อนหลังไว้ไหม และอุปกรณ์อะไร */
export const backfillInfo = (logs: LogEntry[]) => {
  const admit = logs.find((l) => l.event === 'admit' && l.note.startsWith(BACKFILL_MARK));
  if (!admit) return { counted: false, devices: {} as Partial<Record<DeviceKey, boolean>> };
  const m = admit.note.match(/\(อุปกรณ์: ([^)]*)\)/);
  const names = m ? m[1].split(',').map((x) => x.trim()) : [];
  return { counted: true, devices: Object.fromEntries(DEVICES.filter((d) => names.includes(d.label)).map((d) => [d.key, true])) as Partial<Record<DeviceKey, boolean>> };
};

/**
 * ลบเคสออกจากทะเบียน (บันทึกผิด/ซ้ำ): ลบทุกแถวของเคส และหักยอดรายวันคืน
 * (รับใหม่ · Refer/เสียชีวิต · และถ้า reverseCensus: ผู้ป่วยในวอร์ด/อุปกรณ์ของวันที่นอนอยู่)
 */
export const deleteCase = (data: IcuData, out: LogEntry, opts: { reverseCensus: boolean }): ActionResult => {
  const related = caseLogs(data.logs, out);
  const delta: DailyDelta = new Map();
  const admit = related.find((l) => l.event === 'admit');
  if (admit) addDelta(delta, logTime(admit.timestamp).slice(0, 10), 'admittedNew', -1);
  const outKey = OUT_COUNT[out.event];
  if (outKey) addDelta(delta, logTime(out.timestamp).slice(0, 10), outKey, -1);
  if (opts.reverseCensus) {
    const info = backfillInfo(related);
    stayDays(logTime(out.admittedAt), logTime(out.timestamp)).forEach((d) => {
      addDelta(delta, d, 'totalInWard', -1);
      DEVICES.forEach((dv) => info.devices[dv.key] && addDelta(delta, d, dv.dailyKey, -1));
    });
  }
  const res = applyDelta(data.daily, delta);
  const gone = related.filter((l) => l.row).map((l) => l.row!) ;
  // แถวที่อยู่ใต้แถวที่ลบจะเลื่อนขึ้นในชีต → ปรับเลขแถวในเครื่องให้ตรง
  const logs = data.logs
    .filter((l) => !related.includes(l))
    .map((l) => (l.row ? { ...l, row: l.row - gone.filter((r) => r < l.row!).length } : l));
  const rows = related.filter((l) => l.row).map((l) => ({ row: l.row!, caseCode: l.caseCode, bedNumber: l.bedNumber }));
  return {
    next: { ...data, logs, daily: res.daily },
    ops: [...res.ops, ...(rows.length ? [{ type: 'deleteLog', rows } as SheetOp] : [])],
  };
};

export interface PastCase {
  bedNumber: string;
  caseCode: string;
  acuity: Acuity | '';
  admittedAt: string;
  outAt: string;
  event: OutEvent;
  note: string;
  devices: Partial<Record<DeviceKey, boolean>>;
  backfill: boolean;
}

/** เพิ่มเคสที่ลืมบันทึกทั้งรับเข้าและจำหน่าย (ผู้ป่วยออกไปแล้ว) → ทะเบียน 2 แถว + ยอดรายวันของวันเหล่านั้น */
export const addPastCase = (data: IcuData, c: PastCase): ActionResult => {
  const admittedAt = logTime(c.admittedAt);
  const outAt = logTime(c.outAt);
  const base = { bedNumber: c.bedNumber, caseCode: c.caseCode.trim(), acuity: c.acuity, admittedAt };
  const used = DEVICES.filter((d) => c.devices[d.key]).map((d) => d.label);
  const admitNote = c.backfill ? `${BACKFILL_MARK}${used.length ? ` (อุปกรณ์: ${used.join(', ')})` : ''}` : 'บันทึกย้อนหลัง';
  const admit: LogEntry = { ...base, timestamp: admittedAt, event: 'admit', note: admitNote };
  const out: LogEntry = { ...base, timestamp: outAt, event: c.event, note: c.note };
  const delta: DailyDelta = new Map();
  addDelta(delta, admittedAt.slice(0, 10), 'admittedNew', 1);
  const outKey = OUT_COUNT[c.event];
  if (outKey) addDelta(delta, outAt.slice(0, 10), outKey, 1);
  if (c.backfill) addCensus(delta, stayDays(admittedAt, outAt), c.devices);
  const res = applyDelta(data.daily, delta);
  return {
    next: { ...data, daily: res.daily, logs: [...data.logs, admit, out] },
    ops: [...res.ops, { type: 'appendLog', entry: admit }, { type: 'appendLog', entry: out }],
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

/** รายละเอียดการจำหน่าย: ปลายทาง (Refer / ย้ายวอร์ด) + หมายเหตุ — รวมเป็นข้อความเดียวในช่อง note ของทะเบียน */
export interface OutDetail {
  hospital?: string;
  unit?: string;
  info?: string;
  note?: string;
}
const OUT_LABELS: [keyof OutDetail, string][] = [
  ['hospital', 'รพ.ปลายทาง'],
  ['unit', 'ตึก/หอผู้ป่วย'],
  ['info', 'ข้อมูลเพิ่มเติม'],
  ['note', 'หมายเหตุ'],
];
export const composeOutNote = (d: OutDetail) => {
  const parts = OUT_LABELS.map(([k, label]) => [label, (d[k] ?? '').trim().replace(/\s*·\s*/g, ', ')] as const).filter(([, v]) => v);
  // มีแค่หมายเหตุ → เก็บเป็นข้อความธรรมดาเหมือนเดิม
  if (parts.length === 1 && parts[0][0] === 'หมายเหตุ') return parts[0][1];
  return parts.map(([label, v]) => `${label}: ${v}`).join(' · ');
};
/** อ่านกลับจากช่อง note (ใช้แนะนำชื่อโรงพยาบาล/ตึกที่เคยกรอก) */
export const parseOutNote = (note: string): OutDetail => {
  const out: OutDetail = {};
  note.split(' · ').forEach((part) => {
    const hit = OUT_LABELS.find(([, label]) => part.startsWith(`${label}: `));
    if (hit) out[hit[0]] = part.slice(hit[1].length + 2).trim();
  });
  return out;
};
/** ชื่อโรงพยาบาล / ตึกที่เคยกรอก (ล่าสุดก่อน) */
export const pastDestinations = (logs: LogEntry[], key: 'hospital' | 'unit') => {
  const seen = new Set<string>();
  [...logs]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .forEach((l) => {
      const v = parseOutNote(l.note)[key];
      if (v) seen.add(v);
    });
  return [...seen].slice(0, 30);
};

/**
 * จำหน่ายผู้ป่วย: เตียงเปลี่ยนเป็น "ทำความสะอาด" + บันทึกทะเบียน
 * `at` = เวลาที่จำหน่ายจริง (ปรับย้อนหลังได้) · ยอด Refer/เสียชีวิตนับเข้าวันของเวลานั้น
 */
export const dischargePatient = (
  data: IcuData,
  bedNumber: string,
  event: OutEvent,
  note: string,
  at: string = toLocalDateTime(),
): ActionResult => {
  const prev = data.beds.find((b) => b.bedNumber === bedNumber);
  if (!prev) return { next: data, ops: [] };
  const bed: Bed = { ...emptyBed(bedNumber), row: prev.row, status: 'cleaning', updatedAt: toLocalDateTime() };
  const beds = putBed(data.beds, bed);
  const inc: Partial<Record<DailyKey, number>> =
    event === 'expired' ? { deathCount: 1 } : event === 'refer' || event === 'ward' ? { referCount: 1 } : {};
  const day = at.slice(0, 10);
  const sameDay = day === todayKey();
  const today = touchToday(data.daily, beds, sameDay ? inc : {});
  let daily = today.daily;
  const ops: SheetOp[] = [bedOp(bed), today.op];
  if (!sameDay && Object.keys(inc).length) {
    const base = findDaily(daily, day) ?? emptyDaily(day);
    const patch: Partial<DailyRecord> = {};
    (Object.keys(inc) as DailyKey[]).forEach((k) => (patch[k] = base[k] + (inc[k] ?? 0)));
    daily = putDaily(daily, { ...base, ...patch });
    ops.push({ type: 'upsertDaily', record: { date: day, ...patch } });
  }
  const entry: LogEntry = {
    timestamp: at,
    event,
    bedNumber,
    caseCode: prev.caseCode,
    acuity: prev.acuity,
    admittedAt: prev.admittedAt,
    note,
  };
  return {
    next: { ...data, beds, daily, logs: [...data.logs, entry] },
    ops: [...ops, { type: 'appendLog', entry }],
  };
};

/** เวลาในทะเบียนแบบ yyyy-MM-ddTHH:mm */
export const logTime = (t: string) => t.replace(' ', 'T').slice(0, 16);

/** รายการทั้งหมดของเคสเดียวกัน (รหัสเคส + เวลารับเข้าเดียวกัน = การนอนครั้งเดียวกัน) */
export const caseLogs = (logs: LogEntry[], out: LogEntry) =>
  logs.filter(
    (l) =>
      l.caseCode === out.caseCode &&
      (logTime(l.admittedAt) === logTime(out.admittedAt) || (l.event === 'admit' && logTime(l.timestamp) === logTime(out.admittedAt))),
  );

const OUT_COUNT: Partial<Record<LogEvent, DailyKey>> = { refer: 'referCount', ward: 'referCount', expired: 'deathCount' };

/**
 * แก้เคสที่จำหน่ายแล้วย้อนหลัง: เวลารับเข้า / เวลาจำหน่าย / หมายเหตุ
 * อัปเดตทุกแถวของเคสในทะเบียน และย้ายยอดรายวัน (รับใหม่ / Refer / เสียชีวิต) ไปวันที่ถูกต้อง
 */
export const editCase = (data: IcuData, out: LogEntry, next: { admittedAt: string; outAt: string; note: string }): ActionResult => {
  const oldIn = logTime(out.admittedAt);
  const oldOut = logTime(out.timestamp);
  const related = caseLogs(data.logs, out);
  const ops: SheetOp[] = [];
  const logs = data.logs.map((l) => {
    if (!related.includes(l)) return l;
    const isOut = l === out;
    const isAdmit = l.event === 'admit';
    const upd: LogEntry = {
      ...l,
      admittedAt: next.admittedAt,
      timestamp: isOut ? next.outAt : isAdmit ? next.admittedAt : l.timestamp,
      note: isOut ? next.note : l.note,
    };
    const patch: { timestamp?: string; admittedAt?: string; note?: string } = {};
    if (logTime(l.admittedAt) !== next.admittedAt) patch.admittedAt = next.admittedAt;
    if (logTime(l.timestamp) !== logTime(upd.timestamp)) patch.timestamp = upd.timestamp;
    if (isOut && l.note !== next.note) patch.note = next.note;
    if (Object.keys(patch).length && l.row) ops.push({ type: 'updateLog', row: l.row, caseCode: l.caseCode, bedNumber: l.bedNumber, patch });
    return Object.keys(patch).length ? upd : l;
  });
  // ยอดรายวันที่ต้องย้ายวัน
  const delta: DailyDelta = new Map();
  const move = (key: DailyKey, from: string, to: string) => {
    if (from === to) return;
    addDelta(delta, from, key, -1);
    addDelta(delta, to, key, 1);
  };
  if (related.some((l) => l.event === 'admit')) move('admittedNew', oldIn.slice(0, 10), next.admittedAt.slice(0, 10));
  const outKey = OUT_COUNT[out.event];
  if (outKey) move(outKey, oldOut.slice(0, 10), next.outAt.slice(0, 10));
  const moved = applyDelta(data.daily, delta);
  ops.push(...moved.ops);
  const daily = moved.daily;
  return { next: { ...data, logs, daily }, ops };
};

/** ย้ายผู้ป่วยไปเตียงอื่น: ข้อมูลผู้ป่วยตามไปทั้งหมด (วันที่รับเข้าเดิม) เตียงเดิมเปลี่ยนเป็น "ทำความสะอาด" */
export const movePatient = (data: IcuData, from: string, to: string, note: string): ActionResult => {
  const src = data.beds.find((b) => b.bedNumber === from);
  const dst = data.beds.find((b) => b.bedNumber === to);
  if (!src || src.status !== 'occupied' || !dst || dst.status === 'occupied' || from === to) return { next: data, ops: [] };
  const now = toLocalDateTime();
  const moved: Bed = { ...src, bedNumber: to, row: dst.row, status: 'occupied', updatedAt: now };
  const vacated: Bed = { ...emptyBed(from), row: src.row, status: 'cleaning', updatedAt: now };
  const beds = putBed(putBed(data.beds, moved), vacated);
  const entry: LogEntry = {
    timestamp: now,
    event: 'move',
    bedNumber: to,
    caseCode: src.caseCode,
    acuity: src.acuity,
    admittedAt: src.admittedAt,
    note: [`ย้ายจาก ${from} → ${to}`, note].filter(Boolean).join(' · '),
  };
  // ส่งชื่อเหตุการณ์เป็นภาษาไทย ให้สคริปต์ทุกเวอร์ชันเขียนลงชีตได้ถูกต้อง
  const sheetEntry = { ...entry, event: EVENT_META.move.label } as unknown as LogEntry;
  return {
    next: { ...data, beds, logs: [...data.logs, entry] },
    ops: [bedOp(vacated), bedOp(moved), { type: 'appendLog', entry: sheetEntry }],
  };
};

export const saveDaily = (data: IcuData, rec: DailyRecord): ActionResult => {
  const { row: _row, ...record } = rec;
  return { next: { ...data, daily: putDaily(data.daily, rec) }, ops: [{ type: 'upsertDaily', record }] };
};

export const saveStats = (data: IcuData, rec: StatsRecord): ActionResult => {
  const { row: _row, ...record } = rec;
  const exists = data.stats.some((x) => x.month === rec.month);
  const stats = (exists ? data.stats.map((x) => (x.month === rec.month ? { ...rec, row: x.row } : x)) : [...data.stats, rec]).sort(
    (a, b) => a.month.localeCompare(b.month),
  );
  return { next: { ...data, stats }, ops: [{ type: 'upsertStats', record }] };
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
  ...(data.stats ?? []).map((x) => {
    const { row: _row, ...record } = x;
    return { type: 'upsertStats', record } as SheetOp;
  }),
  ...(data.staff ?? []).flatMap((x) => {
    const { row: _row, photo, ...staff } = x;
    const local = photo.startsWith('data:');
    return [
      { type: 'upsertStaff', staff: local ? staff : { ...staff, photo } } as SheetOp,
      ...(local ? [{ type: 'uploadPhoto', staffId: x.id, dataUrl: photo } as SheetOp] : []),
    ];
  }),
  ...(data.docs ?? []).map(docOp),
  ...(data.news ?? []).map((n) => {
    const { row: _row, published, updatedAt: _u, ...news } = n;
    return { type: 'upsertNews', news: { ...news, status: published ? 'เผยแพร่' : 'ซ่อน' } } as SheetOp;
  }),
  ...(data.kpis ?? []).map((k) => {
    const { row: _row, target, ...kpi } = k;
    return { type: 'upsertKpi', kpi: { ...kpi, target: target ?? '' } } as SheetOp;
  }),
  ...(data.kpiData ?? []).map(
    (x) =>
      ({
        type: 'upsertKpiData',
        record: { month: x.month, kpiId: x.kpiId, numerator: x.numerator ?? '', denominator: x.denominator ?? '', note: x.note },
      }) as SheetOp,
  ),
  ...(data.links ?? []).map((l) => {
    const { row: _row, ...link } = l;
    return { type: 'upsertLink', link } as SheetOp;
  }),
  ...(data.roster ?? []).map(
    (r) =>
      ({
        type: 'upsertRoster',
        record: { month: r.month, staffId: r.staffId, name: r.name, days: Object.fromEntries(r.days.map((v, i) => [String(i + 1), v])) },
      }) as SheetOp,
  ),
];

/* ------------------------------------------------------------------ */
/* Staff & roster actions                                              */
/* ------------------------------------------------------------------ */

export const nextStaffId = (staff: Staff[]) => {
  const n = staff.reduce((m, s) => Math.max(m, Number(s.id.replace(/\D/g, '')) || 0), 0) + 1;
  return `S${String(n).padStart(2, '0')}`;
};

/** บันทึกบุคลากร · photoDataUrl = รูปใหม่ที่ผู้ใช้เลือก (ถ้ามี) จะถูกอัปโหลดขึ้น Google Drive */
export const saveStaff = (data: IcuData, s: Staff, photoDataUrl?: string): ActionResult => {
  const next: Staff = { ...s, photo: photoDataUrl ?? s.photo };
  const exists = data.staff.some((x) => x.id === s.id);
  const staff = (exists ? data.staff.map((x) => (x.id === s.id ? { ...next, row: x.row } : x)) : [...data.staff, next]).sort(byOrder);
  const { row: _row, photo, ...rest } = next;
  const ops: SheetOp[] = [{ type: 'upsertStaff', staff: photoDataUrl ? rest : { ...rest, photo } }];
  if (photoDataUrl) ops.push({ type: 'uploadPhoto', staffId: s.id, dataUrl: photoDataUrl });
  return { next: { ...data, staff }, ops };
};

/**
 * ลบบุคลากรถาวร: ลบออกจากแท็บ Staff + ตารางเวรตั้งแต่เดือนนี้ (เดือนก่อน ๆ เก็บเป็นประวัติ)
 * ลูกทีมของคนที่ถูกลบจะย้ายไปขึ้นกับหัวหน้าของคนนั้นแทน
 */
export const deleteStaff = (data: IcuData, id: string): ActionResult => {
  const target = data.staff.find((s) => s.id === id);
  if (!target) return { next: data, ops: [] };
  const boss = target.reportsTo === id ? '' : target.reportsTo;
  const ops: SheetOp[] = [];
  const staff = data.staff
    .filter((s) => s.id !== id)
    .map((s) => {
      if (s.reportsTo !== id) return s;
      ops.push({ type: 'upsertStaff', staff: { id: s.id, reportsTo: boss } });
      return { ...s, reportsTo: boss };
    });
  const fromMonth = todayKey().slice(0, 7);
  ops.push({ type: 'deleteStaff', id, fromMonth });
  const roster = data.roster.filter((r) => !(r.staffId === id && r.month >= fromMonth));
  return { next: { ...data, staff, roster }, ops };
};

/** หัวหน้าที่ใช้ในผัง: ถ้าหัวหน้าที่ระบุไว้ไม่ใช้งานแล้ว ไล่ขึ้นไปหาหัวหน้าคนถัดไปที่ยังปฏิบัติงาน */
export const activeBoss = (all: Staff[], s: Staff) => {
  const byId = new Map(all.map((x) => [x.id, x]));
  const seen = new Set([s.id]);
  let cur = s.reportsTo;
  while (cur && !seen.has(cur)) {
    const b = byId.get(cur);
    if (!b) return '';
    if (b.active) return b.id;
    seen.add(cur);
    cur = b.reportsTo;
  }
  return '';
};

/** แก้ตารางเวรหลายช่องพร้อมกัน: changes[staffId][day] = รหัสเวร */
export const saveRoster = (data: IcuData, month: string, changes: Record<string, Record<number, string>>): ActionResult => {
  let roster = [...data.roster];
  const ops: SheetOp[] = [];
  Object.entries(changes).forEach(([staffId, days]) => {
    const person = data.staff.find((s) => s.id === staffId);
    const name = person?.name ?? '';
    const idx = roster.findIndex((r) => r.month === month && r.staffId === staffId);
    const base: RosterRow = idx >= 0 ? roster[idx] : { month, staffId, name, days: Array(31).fill('') };
    const nextDays = [...base.days];
    Object.entries(days).forEach(([d, v]) => {
      nextDays[Number(d) - 1] = v;
    });
    const row: RosterRow = { ...base, name: name || base.name, days: nextDays };
    roster = idx >= 0 ? roster.map((r, i) => (i === idx ? row : r)) : [...roster, row];
    ops.push({
      type: 'upsertRoster',
      record: { month, staffId, name: row.name, days: Object.fromEntries(Object.entries(days).map(([d, v]) => [String(d), v])) },
    });
  });
  return { next: { ...data, roster }, ops };
};

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
  const outs = logs.filter((l) => EVENT_META[l.event].out);
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

/**
 * สถานะเตียง ณ เวลา end (ย้อนหลัง) — เริ่มจากสถานะปัจจุบัน แล้วย้อนเหตุการณ์ในทะเบียนที่เกิดหลัง end ทีละรายการ
 * (ผู้ป่วยที่ยังอยู่จะคงข้อมูลอุปกรณ์ปัจจุบันไว้ · ผู้ป่วยที่ถูกคืนจากทะเบียนจะไม่มีข้อมูลอุปกรณ์)
 */
export const bedsAt = (data: IcuData, end: string): Bed[] => {
  const state = new Map(data.beds.map((b) => [b.bedNumber, { ...b }]));
  const ts = (t: string) => t.replace(' ', 'T');
  const later = data.logs.filter((l) => ts(l.timestamp) >= end).sort((a, b) => ts(b.timestamp).localeCompare(ts(a.timestamp)));
  const patient = (bedNumber: string, l: LogEntry): Bed => ({
    ...emptyBed(bedNumber),
    status: 'occupied',
    caseCode: l.caseCode,
    acuity: toAcuity(l.acuity),
    admittedAt: l.admittedAt,
    updatedAt: l.timestamp,
  });
  later.forEach((l) => {
    if (l.event === 'admit') {
      // ก่อนรับเข้า เตียงนี้ยังว่าง
      state.set(l.bedNumber, { ...emptyBed(l.bedNumber), status: 'available' });
    } else if (l.event === 'move') {
      const m = l.note.match(/ย้ายจาก\s*(\S+)\s*→\s*(\S+)/);
      const from = m?.[1];
      const cur = state.get(l.bedNumber);
      state.set(l.bedNumber, { ...emptyBed(l.bedNumber), status: 'available' });
      if (from && state.has(from)) {
        state.set(from, cur && cur.status === 'occupied' && cur.caseCode === l.caseCode ? { ...cur, bedNumber: from } : patient(from, l));
      }
    } else if (EVENT_META[l.event]?.out) {
      // ก่อนจำหน่าย ผู้ป่วยยังอยู่ที่เตียงนี้
      state.set(l.bedNumber, patient(l.bedNumber, l));
    }
  });
  return data.beds.map((b) => state.get(b.bedNumber)!);
};

/** ยอดรับ-จำหน่ายจากทะเบียน (Log) ในช่วงเวลา [start, end) · เวลาเป็นข้อความ 'yyyy-MM-ddTHH:mm' */
export const flowBetween = (data: IcuData, start: string, end: string) => {
  const c = { admit: 0, home: 0, ward: 0, refer: 0, expired: 0 };
  data.logs.forEach((l) => {
    const t = l.timestamp.replace(' ', 'T');
    if (t >= start && t < end && l.event in c) c[l.event as keyof typeof c] += 1;
  });
  return { ...c, out: c.home + c.ward + c.refer + c.expired };
};

/** ยอดรับ-จำหน่ายจากทะเบียน (Log) · prefix = 'yyyy-MM-dd' (วัน) หรือ 'yyyy-MM' (เดือน) */
export const flowCounts = (data: IcuData, prefix: string) => {
  const c = { admit: 0, home: 0, ward: 0, refer: 0, expired: 0 };
  data.logs.forEach((l) => {
    if (l.timestamp.startsWith(prefix) && l.event in c) c[l.event as keyof typeof c] += 1;
  });
  return { ...c, out: c.home + c.ward + c.refer + c.expired };
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
  let census = 4;
  for (let i = 44; i >= 0; i--) {
    const date = shiftDate(today, -i);
    const admitted = rnd() > 0.45 ? (rnd() > 0.7 ? 2 : 1) : 0;
    const refer = census > 2 && rnd() > 0.6 ? 1 : 0;
    const death = census > 2 && rnd() > 0.92 ? 1 : 0;
    census = Math.min(8, Math.max(1, census + admitted - refer - death));
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
      highFlowCount: rnd() > 0.6 ? 1 : 0,
      cannulaCount: rnd() > 0.5 ? 1 : 0,
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
      ageGroup: '70–79 ปี',
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
      ageGroup: '60–69 ปี',
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
    {
      ...emptyBed('ICU-05'),
      status: 'occupied',
      caseCode: 'CASE-2416',
      acuity: 'Moderate',
      ageGroup: '6–12 ปี',
      gender: 'ชาย',
      admittedAt: ago(0.6),
      clinicalGoals: 'Post-op monitoring, pain score < 4',
      hasIvHl: true,
      hasFoley: true,
    },
    {
      ...emptyBed('ICU-06'),
      status: 'occupied',
      caseCode: 'CASE-2411',
      acuity: 'Stable',
      ageGroup: '40–59 ปี',
      gender: 'หญิง',
      admittedAt: ago(2.8),
      clinicalGoals: 'Prepare transfer to ward',
      hasIvHl: true,
    },
    emptyBed('ICU-07'),
    emptyBed('ICU-08'),
  ];
  const t = daily[daily.length - 1];
  Object.assign(t, countsFromBeds(beds));
  const logs: LogEntry[] = [
    { timestamp: ago(3.2), event: 'admit', bedNumber: 'ICU-01', caseCode: 'CASE-2410', acuity: 'Critical', admittedAt: ago(3.2), note: '' },
    { timestamp: ago(2.1), event: 'refer', bedNumber: 'ICU-03', caseCode: 'CASE-2402', acuity: 'High', admittedAt: ago(6), note: 'ส่งต่อ รพ.ศูนย์' },
    { timestamp: ago(1.4), event: 'admit', bedNumber: 'ICU-02', caseCode: 'CASE-2414', acuity: 'High', admittedAt: ago(1.4), note: '' },
    { timestamp: ago(0.3), event: 'ward', bedNumber: 'ICU-03', caseCode: 'CASE-2408', acuity: 'Moderate', admittedAt: ago(4.5), note: 'ย้ายอายุรกรรมชาย' },
  ];
  return { beds, daily, logs, stats: [], ...demoTeam(), docs: demoDocs(), news: demoNews(), ...demoKpis(), links: demoLinks() };
};

/** ทีมตัวอย่าง (ชื่อสมมติ ไม่มีรูป) + ตารางเวรเดือนนี้ — ใช้เฉพาะโหมดทดลองในเครื่อง */
const demoTeam = (): Pick<IcuData, 'staff' | 'roster'> => {
  const p = (
    id: string,
    name: string,
    nickname: string,
    position: string,
    group: StaffGroup,
    reportsTo: string,
    skills: string[] = [],
  ): Staff => ({ id, name, nickname, position, group, reportsTo, photo: '', skills, order: Number(id.slice(1)), active: true });
  const staff: Staff[] = [
    p('S01', 'นางสาวกมลวรรณ ใจดี', 'แอน', 'หัวหน้าหอผู้ป่วย ICU', 'พยาบาล', '', ['ACLS', 'การบริหารการพยาบาล']),
    p('S02', 'นางพรทิพย์ ศรีสุข', 'ทิพย์', 'พยาบาลวิชาชีพชำนาญการ', 'พยาบาล', 'S01', ['ACLS', 'Infection control']),
    p('S03', 'นางสาวสุภาวดี มั่นคง', 'วดี', 'พยาบาลวิชาชีพชำนาญการ', 'พยาบาล', 'S01', ['ACLS', 'Ventilator care']),
    p('S04', 'นางสาวปิยะนุช แสงทอง', 'ปิ่น', 'พยาบาลวิชาชีพ', 'พยาบาล', 'S02', ['BLS']),
    p('S05', 'นางสาวชุติมา วงศ์ใหญ่', 'ชุ', 'พยาบาลวิชาชีพ', 'พยาบาล', 'S02', ['BLS', 'CRRT']),
    p('S06', 'นายธนพล รักษ์ดี', 'ต้น', 'พยาบาลวิชาชีพ', 'พยาบาล', 'S02', ['BLS']),
    p('S07', 'นางสาวอรอุมา ทองดี', 'อร', 'พยาบาลวิชาชีพ', 'พยาบาล', 'S03', ['BLS']),
    p('S08', 'นางสาวณัฐธิดา บุญมา', 'ณัฐ', 'พยาบาลวิชาชีพ', 'พยาบาล', 'S03', ['BLS', 'Wound care']),
    p('S09', 'นางสาวศิริพร คำแก้ว', 'ศิ', 'พยาบาลวิชาชีพ', 'พยาบาล', 'S03', ['BLS']),
    p('S10', 'นางสาวมณีรัตน์ พูลผล', 'มณี', 'ผู้ช่วยพยาบาล', 'ผู้ช่วยพยาบาล', 'S01'),
    p('S11', 'นายสมชาย ดีงาม', 'ชาย', 'พนักงานช่วยเหลือคนไข้', 'พนักงานช่วยเหลือคนไข้', 'S01'),
  ];
  const ym = todayKey().slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  const nDays = new Date(y, m, 0).getDate();
  const cycle = ['ช', 'ช', 'บ', 'บ', 'ด', 'ด', 'OFF', 'OFF'];
  const roster: RosterRow[] = staff.map((st, i) => {
    const days = Array.from({ length: 31 }, (_, d) => {
      if (d >= nDays) return '';
      const dow = new Date(y, m - 1, d + 1).getDay();
      if (st.id === 'S01') return dow === 0 || dow === 6 ? 'OFF' : 'ช*';
      if (st.id === 'S11') return dow === 0 ? 'OFF' : 'ช';
      let code = cycle[(d + i * 3) % cycle.length];
      if (i === 5 && d === 9) code = 'ลา';
      if (i === 7 && d === 14) code = 'อบรม';
      if ((st.id === 'S02' || st.id === 'S03') && code !== 'OFF' && (st.id === 'S02') === (d % 2 === 0)) code += '*';
      return code;
    });
    return { month: ym, staffId: st.id, name: st.name, days };
  });
  return { staff, roster };
};

