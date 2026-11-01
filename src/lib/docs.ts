import type { Doc, DocCategory, DocType, IcuData, SheetOp } from '../types';
import { normalizeDateKey, parseDateKey, shiftDate, todayKey, toLocalDateTime } from './date';

export const DOC_CATEGORIES: DocCategory[] = [
  'ควบคุมการติดเชื้อ',
  'การดูแลผู้ป่วยวิกฤต',
  'ภาวะฉุกเฉิน',
  'ยาและสารน้ำ',
  'การรับ-ส่งต่อผู้ป่วย',
  'อุปกรณ์การแพทย์',
  'ระเบียบหน่วยงาน',
  'อื่นๆ',
];
export const DOC_TYPES: DocType[] = ['SOP', 'แนวปฏิบัติ (CPG)', 'ระเบียบ / ข้อบังคับ', 'คู่มือ', 'แบบฟอร์ม', 'เอกสารทั่วไป'];
export const CPG: DocType = 'แนวปฏิบัติ (CPG)';

/** แจ้งเตือนก่อนครบกำหนดทบทวนกี่วัน */
export const REVIEW_SOON_DAYS = 30;

type Raw = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const truthy = (v: unknown) => v === true || ['ใช่', 'true', 'yes', 'y', '1', '✓', 'x'].includes(str(v).toLowerCase());
const dateKey = (v: unknown) => {
  const k = normalizeDateKey(str(v).slice(0, 10));
  return /^\d{4}-\d{2}-\d{2}$/.test(k) ? k : '';
};

export const normalizeDoc = (r: Raw): Doc => {
  const cat = str(r.category);
  const type = str(r.type);
  return {
    id: str(r.id),
    title: str(r.title),
    category: (DOC_CATEGORIES.find((c) => c === cat) ?? 'อื่นๆ') as DocCategory,
    type: (DOC_TYPES.find((t) => t === type || t.startsWith(type)) ?? 'คู่มือ') as DocType,
    summary: str(r.summary),
    content: str(r.content),
    link: str(r.link),
    version: str(r.version),
    effectiveDate: dateKey(r.effectiveDate),
    reviewDate: dateKey(r.reviewDate),
    owner: str(r.owner),
    tags: str(r.tags)
      .split(/[,;]/)
      .map((x) => x.trim())
      .filter(Boolean),
    pinned: truthy(r.pinned),
    active: str(r.status) !== 'ยกเลิก',
    updatedAt: str(r.updatedAt),
    row: typeof r.row === 'number' ? r.row : undefined,
  };
};

export const sortDocs = (a: Doc, b: Doc) => Number(b.pinned) - Number(a.pinned) || a.title.localeCompare(b.title, 'th');

export type ReviewState = 'overdue' | 'soon' | 'ok' | 'none';

export const reviewState = (d: Pick<Doc, 'reviewDate'>, today = todayKey()): ReviewState => {
  if (!d.reviewDate) return 'none';
  if (d.reviewDate < today) return 'overdue';
  if (d.reviewDate <= shiftDate(today, REVIEW_SOON_DAYS)) return 'soon';
  return 'ok';
};

export const daysUntil = (key: string, today = todayKey()) =>
  Math.round((parseDateKey(key).getTime() - parseDateKey(today).getTime()) / 86_400_000);

/** ขั้นตอนจากช่อง content (ตัดเลขข้อ/สัญลักษณ์หน้าบรรทัดออก) */
export const docSteps = (content: string) =>
  content
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim())
    .filter(Boolean);

export type FileKind = 'pdf' | 'doc' | 'sheet' | 'slides' | 'drive' | 'link' | 'none';

const driveId = (u: string) => u.match(/\/file\/d\/([\w-]{20,})/)?.[1] ?? u.match(/[?&]id=([\w-]{20,})/)?.[1];
const gdocId = (u: string, kind: string) => u.match(new RegExp(`docs\\.google\\.com/${kind}/d/([\\w-]{20,})`))?.[1];

export const fileKind = (link: string): FileKind => {
  const u = link.trim();
  if (!u) return 'none';
  if (gdocId(u, 'document')) return 'doc';
  if (gdocId(u, 'spreadsheets')) return 'sheet';
  if (gdocId(u, 'presentation')) return 'slides';
  if (driveId(u)) return 'drive';
  if (/\.pdf(\?|#|$)/i.test(u)) return 'pdf';
  return 'link';
};

/** ลิงก์สำหรับแสดงตัวอย่างในหน้าเว็บ (Google Drive / Docs ที่แชร์แบบทุกคนที่มีลิงก์) */
export const previewUrl = (link: string): string | null => {
  const u = link.trim();
  const id = driveId(u);
  if (id && /drive\.google\.com/.test(u)) return `https://drive.google.com/file/d/${id}/preview`;
  for (const kind of ['document', 'spreadsheets', 'presentation']) {
    const gid = gdocId(u, kind);
    if (gid) return `https://docs.google.com/${kind}/d/${gid}/preview`;
  }
  if (/^https:\/\/.+\.pdf(\?|#|$)/i.test(u)) return u;
  return null;
};

export const nextDocId = (docs: Doc[]) => {
  const n = docs.reduce((m, d) => Math.max(m, Number(d.id.replace(/\D/g, '')) || 0), 0) + 1;
  return `D${String(n).padStart(2, '0')}`;
};

export const docOp = (d: Doc): SheetOp => {
  const { row: _row, active, updatedAt: _u, ...rest } = d;
  return { type: 'upsertDoc', doc: { ...rest, status: active ? 'ใช้งาน' : 'ยกเลิก' } };
};

/** บันทึกเอกสาร · file = ไฟล์ที่ผู้ใช้แนบ (data URL) จะถูกอัปโหลดเข้า Google Drive */
export const saveDoc = (data: IcuData, doc: Doc, file?: { name: string; dataUrl: string }) => {
  const next: Doc = { ...doc, updatedAt: toLocalDateTime() };
  const exists = data.docs.some((d) => d.id === doc.id);
  const docs = (exists ? data.docs.map((d) => (d.id === doc.id ? { ...next, row: d.row } : d)) : [...data.docs, next]).sort(sortDocs);
  const ops: SheetOp[] = [docOp(next)];
  if (file) ops.push({ type: 'uploadDoc', docId: doc.id, name: file.name, dataUrl: file.dataUrl });
  return { next: { ...data, docs }, ops };
};

/** เอกสารตัวอย่าง (โหมดทดลองในเครื่องเท่านั้น) — แทนที่ด้วยเอกสารจริงของหน่วยงาน */
export const demoDocs = (): Doc[] => {
  const t = todayKey();
  const d = (p: Partial<Doc> & Pick<Doc, 'id' | 'title' | 'category' | 'type'>): Doc => ({
    summary: '',
    content: '',
    link: '',
    version: '1',
    effectiveDate: shiftDate(t, -200),
    reviewDate: shiftDate(t, 165),
    owner: 'หัวหน้าหอผู้ป่วย ICU',
    tags: [],
    pinned: false,
    active: true,
    updatedAt: '',
    ...p,
  });
  return [
    d({
      id: 'D01',
      title: 'ตัวอย่าง: แนวปฏิบัติการป้องกันปอดอักเสบจากเครื่องช่วยหายใจ (VAP bundle)',
      category: 'ควบคุมการติดเชื้อ',
      type: 'แนวปฏิบัติ (CPG)',
      summary: 'เอกสารตัวอย่างสำหรับทดลองระบบ ให้แทนที่ด้วยแนวปฏิบัติที่หน่วยงานรับรองแล้ว',
      content: 'จัดท่านอนศีรษะสูง 30–45 องศา\nประเมินความพร้อมในการหย่าเครื่องช่วยหายใจทุกวัน\nดูแลความสะอาดช่องปากตามแนวทางของหน่วยงาน\nตรวจสอบแรงดัน cuff ตามแนวทางของหน่วยงาน\nล้างมือก่อนและหลังสัมผัสผู้ป่วย',
      tags: ['VAP', 'HAP bundle', 'ปอดอักเสบ'],
      pinned: true,
      version: '3',
    }),
    d({
      id: 'D02',
      title: 'ตัวอย่าง: SOP การตอบสนองเมื่อผู้ป่วยหัวใจหยุดเต้น (Code Blue)',
      category: 'ภาวะฉุกเฉิน',
      type: 'SOP',
      summary: 'ลำดับการแจ้งเหตุ บทบาทในทีม และการบันทึก (ตัวอย่าง)',
      content: 'ผู้พบเหตุเรียกขอความช่วยเหลือและเริ่ม CPR\nแจ้ง Code Blue ตามช่องทางของโรงพยาบาล\nหัวหน้าเวรมอบหมายบทบาทในทีม\nนำรถฉุกเฉินและเครื่อง defibrillator มาที่เตียง\nบันทึกเวลาและเหตุการณ์ในแบบบันทึก',
      tags: ['CPR', 'ACLS'],
      pinned: true,
    }),
    d({
      id: 'D03',
      title: 'ตัวอย่าง: ระเบียบการเยี่ยมผู้ป่วยในหอผู้ป่วยวิกฤต',
      category: 'ระเบียบหน่วยงาน',
      type: 'ระเบียบ / ข้อบังคับ',
      summary: 'เวลาเยี่ยม จำนวนผู้เยี่ยม และข้อปฏิบัติของญาติ (ตัวอย่าง)',
      content: 'เยี่ยมตามเวลาที่หน่วยงานกำหนด\nล้างมือด้วยแอลกอฮอล์ก่อนเข้าและออกจากหอผู้ป่วย\nงดนำอาหารและดอกไม้เข้าหอผู้ป่วย',
    }),
    d({
      id: 'D04',
      title: 'ตัวอย่าง: SOP การรับผู้ป่วยใหม่เข้า ICU',
      category: 'การรับ-ส่งต่อผู้ป่วย',
      type: 'SOP',
      summary: 'ตัวอย่างเอกสารที่เกินกำหนดทบทวน',
      reviewDate: shiftDate(t, -12),
      version: '2',
    }),
    d({
      id: 'D05',
      title: 'ตัวอย่าง: คู่มือการใช้งานเครื่องช่วยหายใจ',
      category: 'อุปกรณ์การแพทย์',
      type: 'คู่มือ',
      summary: 'ตัวอย่างเอกสารที่ใกล้ครบกำหนดทบทวน',
      reviewDate: shiftDate(t, 18),
      tags: ['Ventilator'],
    }),
    d({
      id: 'D06',
      title: 'ตัวอย่าง: แบบบันทึกการส่งเวร (SBAR)',
      category: 'การดูแลผู้ป่วยวิกฤต',
      type: 'แบบฟอร์ม',
      summary: 'แบบฟอร์มส่งเวรรูปแบบ SBAR (ตัวอย่าง)',
      tags: ['ส่งเวร', 'SBAR'],
    }),
  ].sort(sortDocs);
};
