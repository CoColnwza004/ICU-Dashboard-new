import type { DailyKey, FormLink, IcuData, Kpi, KpiData, KpiSource, LinkCategory, News, NewsCategory, SheetOp } from '../types';
import { normalizeDateKey, shiftDate, todayKey, toLocalDateTime } from './date';
import { autoStatsInput } from './stats';

type Raw = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const truthy = (v: unknown) => v === true || ['ใช่', 'true', 'yes', 'y', '1', '✓', 'x'].includes(str(v).toLowerCase());
const numOrNull = (v: unknown): number | null => {
  const s = str(v).replace(/,/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const rowOf = (r: Raw) => (typeof r.row === 'number' ? r.row : undefined);
const nextId = (prefix: string, ids: string[], width = 3) => {
  const n = ids.reduce((m, id) => Math.max(m, Number(id.replace(/\D/g, '')) || 0), 0) + 1;
  return `${prefix}${String(n).padStart(width, '0')}`;
};

/* ------------------------------------------------------------------ */
/* ข่าวสาร                                                              */
/* ------------------------------------------------------------------ */

export const NEWS_CATEGORIES: NewsCategory[] = ['ประกาศ', 'ข่าวสาร', 'กิจกรรม', 'อบรม / ประชุม', 'ด่วน'];

export const normalizeNews = (r: Raw): News => {
  const cat = str(r.category);
  const date = normalizeDateKey(str(r.date).slice(0, 10));
  return {
    id: str(r.id),
    title: str(r.title),
    body: str(r.body),
    category: (NEWS_CATEGORIES.find((c) => c === cat) ?? 'ข่าวสาร') as NewsCategory,
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
    image: str(r.image),
    attachment: str(r.attachment),
    pinned: truthy(r.pinned),
    author: str(r.author),
    published: str(r.status) !== 'ซ่อน',
    updatedAt: str(r.updatedAt),
    row: rowOf(r),
  };
};

/** ปักหมุดก่อน แล้วเรียงจากใหม่ไปเก่า */
export const sortNews = (a: News, b: News) =>
  Number(b.pinned) - Number(a.pinned) || b.date.localeCompare(a.date) || b.id.localeCompare(a.id);

export const nextNewsId = (news: News[]) => nextId('N', news.map((n) => n.id));

export const isNewNews = (n: News, today = todayKey()) => !!n.date && n.date >= shiftDate(today, -3);

const newsOp = (n: News): SheetOp => {
  const { row: _row, published, updatedAt: _u, ...rest } = n;
  return { type: 'upsertNews', news: { ...rest, status: published ? 'เผยแพร่' : 'ซ่อน' } };
};

export interface UploadFile {
  name: string;
  dataUrl: string;
}

/** บันทึกข่าว · รูป/ไฟล์แนบที่เลือกใหม่จะถูกอัปโหลดเข้า Google Drive */
export const saveNews = (data: IcuData, n: News, files: { image?: UploadFile; attachment?: UploadFile } = {}) => {
  const next: News = {
    ...n,
    image: files.image ? files.image.dataUrl : n.image,
    updatedAt: toLocalDateTime(),
  };
  const exists = data.news.some((x) => x.id === n.id);
  const news = (exists ? data.news.map((x) => (x.id === n.id ? { ...next, row: x.row } : x)) : [...data.news, next]).sort(sortNews);
  // รูปที่เพิ่งเลือก (data URL) ไม่ต้องเขียนลงชีต — สคริปต์จะใส่ลิงก์ Drive ให้หลังอัปโหลด
  const op = newsOp(files.image ? { ...next, image: n.image } : next);
  const ops: SheetOp[] = [op];
  (['image', 'attachment'] as const).forEach((field) => {
    const f = files[field];
    if (f) ops.push({ type: 'uploadNewsFile', newsId: n.id, field, name: f.name, dataUrl: f.dataUrl });
  });
  return { next: { ...data, news }, ops };
};

/* ------------------------------------------------------------------ */
/* Quality KPI                                                         */
/* ------------------------------------------------------------------ */

export const KPI_SOURCES: KpiSource[] = [
  'กรอกเอง',
  'วันนอนรวม',
  'วันใช้เครื่องช่วยหายใจ',
  'วันใส่ C-Line',
  'วันใส่ Foley',
  'จำนวนรับใหม่',
  'จำนวนจำหน่าย',
  'จำนวนเสียชีวิต',
];

export const normalizeKpi = (r: Raw): Kpi => {
  const src = (v: unknown) => (KPI_SOURCES.find((s) => s === str(v)) ?? 'กรอกเอง') as KpiSource;
  const dir = str(r.direction);
  return {
    id: str(r.id),
    name: str(r.name),
    group: str(r.group) || 'อื่นๆ',
    unit: str(r.unit),
    multiplier: numOrNull(r.multiplier) || 1,
    target: numOrNull(r.target),
    direction: dir === '≥' || dir === '>=' || dir === 'มากกว่า' ? '≥' : '≤',
    numeratorLabel: str(r.numeratorLabel),
    numeratorSource: src(r.numeratorSource),
    denominatorLabel: str(r.denominatorLabel),
    denominatorSource: src(r.denominatorSource),
    description: str(r.description),
    order: numOrNull(r.order) ?? 999,
    active: str(r.active) !== 'ยกเลิก' && r.active !== false,
    row: rowOf(r),
  };
};

export const sortKpis = (a: Kpi, b: Kpi) => a.order - b.order || a.id.localeCompare(b.id);

const monthKey = (v: unknown) => {
  const m = str(v).match(/^(\d{4})-(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}` : '';
};

export const normalizeKpiData = (r: Raw): KpiData => ({
  month: monthKey(r.month),
  kpiId: str(r.kpiId),
  numerator: numOrNull(r.numerator),
  denominator: numOrNull(r.denominator),
  note: str(r.note),
  updatedAt: str(r.updatedAt),
  row: rowOf(r),
});

const DAILY_SOURCE: Partial<Record<KpiSource, DailyKey>> = {
  วันนอนรวม: 'totalInWard',
  วันใช้เครื่องช่วยหายใจ: 'ventilatorCount',
  'วันใส่ C-Line': 'cLineCount',
  'วันใส่ Foley': 'foleyCount',
  จำนวนรับใหม่: 'admittedNew',
  จำนวนเสียชีวิต: 'deathCount',
};

/** ค่าที่คำนวณได้เองจากข้อมูลรายวัน / ทะเบียนรับ-จำหน่าย (null = ต้องกรอกเอง หรือยังไม่มีข้อมูลเดือนนั้น) */
export const autoValue = (data: IcuData, source: KpiSource, ym: string): number | null => {
  if (source === 'กรอกเอง') return null;
  if (source === 'จำนวนจำหน่าย') {
    // ใช้นิยามเดียวกับหน้าสถิติเตียง: ค่าที่บันทึกในแท็บ Stats ถ้ามี ไม่เช่นนั้น Refer + เสียชีวิต (Daily) + กลับบ้าน (Log)
    const saved = data.stats.find((s) => s.month === ym);
    if (saved?.discharges) return saved.discharges;
    const hasData = data.daily.some((d) => d.date.startsWith(ym)) || data.logs.some((l) => l.timestamp.startsWith(ym));
    return hasData ? autoStatsInput(data, ym).discharges : null;
  }
  const key = DAILY_SOURCE[source]!;
  const days = data.daily.filter((d) => d.date.startsWith(ym));
  if (!days.length) {
    if (source === 'วันนอนรวม') return data.stats.find((s) => s.month === ym)?.patientDays || null;
    return null;
  }
  return days.reduce((s, d) => s + (d[key] || 0), 0);
};

export interface KpiPoint {
  month: string;
  numerator: number | null;
  denominator: number | null;
  value: number | null;
  status: 'pass' | 'fail' | 'none';
  note: string;
  /** true = ตัวตั้ง/ตัวหารบางส่วนมาจากการคำนวณอัตโนมัติ */
  auto: boolean;
  entry?: KpiData;
}

export const kpiStatus = (k: Kpi, value: number | null): KpiPoint['status'] => {
  if (value === null || k.target === null) return 'none';
  return (k.direction === '≤' ? value <= k.target : value >= k.target) ? 'pass' : 'fail';
};

export const kpiPoint = (data: IcuData, k: Kpi, ym: string): KpiPoint => {
  const entry = data.kpiData.find((x) => x.kpiId === k.id && x.month === ym);
  const autoN = autoValue(data, k.numeratorSource, ym);
  const autoD = autoValue(data, k.denominatorSource, ym);
  const numerator = entry?.numerator ?? autoN;
  const denominator = entry?.denominator ?? autoD;
  // ตัวตั้งกรอกเองแต่ยังไม่กรอก → ยังไม่มีผล
  const value = numerator !== null && denominator ? (numerator / denominator) * k.multiplier : null;
  return {
    month: ym,
    numerator,
    denominator,
    value,
    status: kpiStatus(k, value),
    note: entry?.note ?? '',
    auto: value !== null && ((entry?.numerator == null && autoN !== null) || (entry?.denominator == null && autoD !== null)),
    entry,
  };
};

export const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** เดือนล่าสุดย้อนหลัง n เดือน (เก่า → ใหม่) */
export const lastMonths = (ym: string, n: number) => Array.from({ length: n }, (_, i) => shiftMonth(ym, i - n + 1));

export const kpiSeries = (data: IcuData, k: Kpi, ym: string, n = 12) => lastMonths(ym, n).map((m) => kpiPoint(data, k, m));

export const fmtKpi = (v: number | null, k: Pick<Kpi, 'multiplier'>) => {
  if (v === null) return '—';
  const digits = k.multiplier === 100 ? 1 : 2;
  return v.toLocaleString('th-TH', { maximumFractionDigits: digits, minimumFractionDigits: v === 0 ? 0 : Math.min(1, digits) });
};

export const kpiUnitShort = (k: Kpi) => (k.multiplier === 100 && k.unit.trim() === '%' ? '%' : k.unit);

export const nextKpiId = (kpis: Kpi[]) => nextId('K', kpis.map((k) => k.id), 2);

export const saveKpi = (data: IcuData, k: Kpi) => {
  const exists = data.kpis.some((x) => x.id === k.id);
  const kpis = (exists ? data.kpis.map((x) => (x.id === k.id ? { ...k, row: x.row } : x)) : [...data.kpis, k]).sort(sortKpis);
  const { row: _row, target, ...rest } = k;
  return { next: { ...data, kpis }, ops: [{ type: 'upsertKpi', kpi: { ...rest, target: target ?? '' } } as SheetOp] };
};

export interface KpiEntry {
  kpiId: string;
  numerator: number | null;
  denominator: number | null;
  note: string;
}

/** บันทึกผล KPI รายเดือนหลายตัวพร้อมกัน */
export const saveKpiMonth = (data: IcuData, ym: string, entries: KpiEntry[]) => {
  let kpiData = [...data.kpiData];
  const ops: SheetOp[] = [];
  entries.forEach((e) => {
    const rec: KpiData = { month: ym, kpiId: e.kpiId, numerator: e.numerator, denominator: e.denominator, note: e.note, updatedAt: toLocalDateTime() };
    const i = kpiData.findIndex((x) => x.month === ym && x.kpiId === e.kpiId);
    if (i >= 0) kpiData[i] = { ...rec, row: kpiData[i].row };
    else kpiData = [...kpiData, rec];
    ops.push({
      type: 'upsertKpiData',
      record: { month: ym, kpiId: e.kpiId, numerator: e.numerator ?? '', denominator: e.denominator ?? '', note: e.note },
    });
  });
  return { next: { ...data, kpiData }, ops };
};

/* ------------------------------------------------------------------ */
/* ลิงก์ Google Forms                                                   */
/* ------------------------------------------------------------------ */

export const LINK_CATEGORIES: LinkCategory[] = ['แบบประเมิน', 'รายงานอุบัติการณ์', 'ลงทะเบียน', 'อื่นๆ'];

export const normalizeLink = (r: Raw): FormLink => {
  const cat = str(r.category);
  return {
    id: str(r.id),
    title: str(r.title),
    description: str(r.description),
    url: str(r.url),
    category: (LINK_CATEGORIES.find((c) => c === cat) ?? 'อื่นๆ') as LinkCategory,
    order: numOrNull(r.order) ?? 999,
    active: str(r.active) !== 'ยกเลิก' && r.active !== false,
    row: rowOf(r),
  };
};

export const sortLinks = (a: FormLink, b: FormLink) => a.order - b.order || a.title.localeCompare(b.title, 'th');

export const nextLinkId = (links: FormLink[]) => nextId('L', links.map((l) => l.id));

/** ลิงก์ Google Forms ที่ฝังในหน้าเว็บได้ (docs.google.com/forms/…/viewform?embedded=true) */
export const formEmbedUrl = (url: string): string | null => {
  const u = url.trim();
  const m = u.match(/^https:\/\/docs\.google\.com\/forms\/(?:u\/\d+\/)?d\/(e\/)?([\w-]+)/);
  if (!m) return null;
  return `https://docs.google.com/forms/d/${m[1] ?? ''}${m[2]}/viewform?embedded=true`;
};

export const isSafeUrl = (url: string) => /^https:\/\//i.test(url.trim());

export const saveLink = (data: IcuData, l: FormLink) => {
  const exists = data.links.some((x) => x.id === l.id);
  const links = (exists ? data.links.map((x) => (x.id === l.id ? { ...l, row: x.row } : x)) : [...data.links, l]).sort(sortLinks);
  const { row: _row, ...rest } = l;
  return { next: { ...data, links }, ops: [{ type: 'upsertLink', link: rest } as SheetOp] };
};

/* ------------------------------------------------------------------ */
/* ไฟล์ใน Google Drive                                                  */
/* ------------------------------------------------------------------ */

const driveId = (u: string) => u.match(/\/file\/d\/([\w-]{20,})/)?.[1] ?? u.match(/[?&]id=([\w-]{20,})/)?.[1] ?? u.match(/googleusercontent\.com\/d\/([\w-]{20,})/)?.[1];

/** ลิงก์ดาวน์โหลดไฟล์ตรง (Google Drive) หรือคืนลิงก์เดิม */
export const downloadUrl = (link: string) => {
  const id = /drive\.google\.com/.test(link) ? driveId(link) : undefined;
  return id ? `https://drive.google.com/uc?export=download&id=${id}` : link;
};

/** รูปจาก Google Drive → ลิงก์รูปที่แสดงในเว็บได้ */
export const imageUrl = (link: string) => {
  const u = link.trim();
  if (!u || u.startsWith('data:')) return u;
  if (/lh3\.googleusercontent\.com/.test(u)) return u;
  const id = /drive\.google\.com/.test(u) ? driveId(u) : undefined;
  return id ? `https://lh3.googleusercontent.com/d/${id}` : u;
};

/* ------------------------------------------------------------------ */
/* ข้อมูลตัวอย่าง (โหมดทดลองในเครื่องเท่านั้น)                            */
/* ------------------------------------------------------------------ */

export const demoNews = (): News[] => {
  const t = todayKey();
  const n = (p: Partial<News> & Pick<News, 'id' | 'title' | 'category'>): News => ({
    body: '',
    date: t,
    image: '',
    attachment: '',
    pinned: false,
    author: 'หัวหน้าหอผู้ป่วย ICU',
    published: true,
    updatedAt: '',
    ...p,
  });
  return [
    n({ id: 'N001', title: 'ตัวอย่าง: ประชุมประจำเดือนหอผู้ป่วยวิกฤต', category: 'อบรม / ประชุม', date: shiftDate(t, -1), pinned: true, body: 'ข่าวตัวอย่างสำหรับทดลองระบบ\nแทนที่ด้วยประกาศจริงของหน่วยงานได้จากหน้าเจ้าหน้าที่' }),
    n({ id: 'N002', title: 'ตัวอย่าง: แจ้งปรับปรุงระบบออกซิเจนทางท่อ', category: 'ด่วน', date: t, body: 'ข่าวตัวอย่าง — ใช้หมวด “ด่วน” สำหรับเรื่องที่ทุกคนต้องเห็นทันที' }),
    n({ id: 'N003', title: 'ตัวอย่าง: กิจกรรม 5ส ประจำไตรมาส', category: 'กิจกรรม', date: shiftDate(t, -6), body: 'ข่าวตัวอย่าง' }),
    n({ id: 'N004', title: 'ตัวอย่าง: ประกาศแนวทางการเยี่ยมผู้ป่วยช่วงวันหยุด', category: 'ประกาศ', date: shiftDate(t, -12), body: 'ข่าวตัวอย่าง' }),
  ].sort(sortNews);
};

export const DEFAULT_KPIS = (): Kpi[] => {
  const k = (
    id: string,
    name: string,
    group: string,
    unit: string,
    multiplier: number,
    direction: Kpi['direction'],
    numeratorLabel: string,
    numeratorSource: KpiSource,
    denominatorLabel: string,
    denominatorSource: KpiSource,
  ): Kpi => ({
    id, name, group, unit, multiplier, target: null, direction, numeratorLabel, numeratorSource, denominatorLabel, denominatorSource,
    description: '', order: Number(id.slice(1)), active: true,
  });
  return [
    k('K01', 'อัตราปอดอักเสบจากการใช้เครื่องช่วยหายใจ (VAP)', 'การติดเชื้อ', 'ครั้ง / 1,000 วันใช้เครื่องช่วยหายใจ', 1000, '≤', 'จำนวนครั้งการเกิด VAP', 'กรอกเอง', 'จำนวนวันใช้เครื่องช่วยหายใจ', 'วันใช้เครื่องช่วยหายใจ'),
    k('K02', 'อัตราการติดเชื้อในกระแสเลือดจากสายสวนหลอดเลือดดำส่วนกลาง (CLABSI)', 'การติดเชื้อ', 'ครั้ง / 1,000 วันใส่ C-Line', 1000, '≤', 'จำนวนครั้งการเกิด CLABSI', 'กรอกเอง', 'จำนวนวันใส่ C-Line', 'วันใส่ C-Line'),
    k('K03', 'อัตราการติดเชื้อทางเดินปัสสาวะจากการคาสายสวน (CAUTI)', 'การติดเชื้อ', 'ครั้ง / 1,000 วันใส่ Foley', 1000, '≤', 'จำนวนครั้งการเกิด CAUTI', 'กรอกเอง', 'จำนวนวันใส่ Foley', 'วันใส่ Foley'),
    k('K04', 'อัตราการเกิดแผลกดทับรายใหม่', 'ความปลอดภัย', 'ครั้ง / 1,000 วันนอน', 1000, '≤', 'จำนวนแผลกดทับที่เกิดใหม่ใน ICU', 'กรอกเอง', 'จำนวนวันนอนรวม', 'วันนอนรวม'),
    k('K05', 'อัตราการเลื่อนหลุดของท่อช่วยหายใจโดยไม่ได้วางแผน', 'ความปลอดภัย', 'ครั้ง / 100 วันใช้เครื่องช่วยหายใจ', 100, '≤', 'จำนวนครั้งท่อช่วยหายใจเลื่อนหลุด', 'กรอกเอง', 'จำนวนวันใช้เครื่องช่วยหายใจ', 'วันใช้เครื่องช่วยหายใจ'),
    k('K06', 'อัตราการกลับเข้า ICU ซ้ำภายใน 48 ชั่วโมง', 'ผลลัพธ์', '%', 100, '≤', 'จำนวนผู้ป่วยกลับเข้า ICU ซ้ำภายใน 48 ชม.', 'กรอกเอง', 'จำนวนผู้ป่วยจำหน่ายจาก ICU', 'จำนวนจำหน่าย'),
    k('K07', 'อัตราการเสียชีวิตใน ICU', 'ผลลัพธ์', '%', 100, '≤', 'จำนวนผู้ป่วยเสียชีวิต', 'จำนวนเสียชีวิต', 'จำนวนผู้ป่วยจำหน่ายจาก ICU (รวมเสียชีวิต)', 'จำนวนจำหน่าย'),
    k('K08', 'ร้อยละการปฏิบัติตาม VAP / HAP bundle', 'กระบวนการ', '%', 100, '≥', 'จำนวนครั้งที่ปฏิบัติครบทุกข้อ', 'กรอกเอง', 'จำนวนครั้งที่ตรวจสอบ', 'กรอกเอง'),
    k('K09', 'ร้อยละการทำความสะอาดมือถูกต้อง (Hand hygiene)', 'กระบวนการ', '%', 100, '≥', 'จำนวนโอกาสที่ทำความสะอาดมือถูกต้อง', 'กรอกเอง', 'จำนวนโอกาสที่สังเกตทั้งหมด', 'กรอกเอง'),
  ];
};

/** KPI ตัวอย่าง: ตัวเลขสมมติเพื่อดูหน้าตาของกราฟ (มีคำว่า “ตัวอย่าง” ในหมายเหตุ) */
export const demoKpis = (): Pick<IcuData, 'kpis' | 'kpiData'> => {
  const kpis = DEFAULT_KPIS().map((k) => ({ ...k, target: { K08: 95, K09: 80 }[k.id] ?? null }));
  const ym = todayKey().slice(0, 7);
  const kpiData: KpiData[] = [];
  lastMonths(ym, 6).forEach((m, i) => {
    kpiData.push({ month: m, kpiId: 'K01', numerator: i % 3 === 0 ? 1 : 0, denominator: null, note: 'ตัวอย่าง', updatedAt: '' });
    kpiData.push({ month: m, kpiId: 'K08', numerator: 88 + ((i * 3) % 10), denominator: 100, note: 'ตัวอย่าง', updatedAt: '' });
    kpiData.push({ month: m, kpiId: 'K09', numerator: 70 + ((i * 7) % 20), denominator: 100, note: 'ตัวอย่าง', updatedAt: '' });
  });
  return { kpis, kpiData };
};

export const demoLinks = (): FormLink[] => [
  {
    id: 'L001',
    title: 'ตัวอย่าง: แบบประเมินความพึงพอใจของญาติผู้ป่วย',
    description: 'ลิงก์ตัวอย่าง — แทนที่ด้วยลิงก์ Google Forms จริงของหน่วยงาน',
    url: 'https://docs.google.com/forms/d/e/EXAMPLE_FORM_ID/viewform',
    category: 'แบบประเมิน',
    order: 1,
    active: true,
  },
  {
    id: 'L002',
    title: 'ตัวอย่าง: รายงานความเสี่ยง / อุบัติการณ์',
    description: 'ลิงก์ตัวอย่าง',
    url: 'https://docs.google.com/forms/d/e/EXAMPLE_FORM_ID_2/viewform',
    category: 'รายงานอุบัติการณ์',
    order: 2,
    active: true,
  },
];
