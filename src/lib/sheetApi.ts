import type { SheetMeta, SheetOp } from '../types';

export interface SheetConfig {
  url: string;
  token: string;
}

export interface Snapshot extends SheetMeta {
  beds: Record<string, unknown>[];
  daily: Record<string, unknown>[];
  logs: Record<string, unknown>[];
  stats?: Record<string, unknown>[];
  /** ไม่มีเมื่อขอแบบ parts=core หรือสคริปต์เป็นเวอร์ชันเก่า */
  staff?: Record<string, unknown>[];
  roster?: Record<string, unknown>[];
  docs?: Record<string, unknown>[];
  news?: Record<string, unknown>[];
  kpis?: Record<string, unknown>[];
  kpiData?: Record<string, unknown>[];
  links?: Record<string, unknown>[];
  /** สคริปต์เวอร์ชันที่มีรหัสเจ้าหน้าที่: ตั้งรหัสแล้วหรือยัง (undefined = สคริปต์เวอร์ชันเก่า) */
  pinSet?: boolean;
}

const ERRORS: Record<string, string> = {
  unauthorized: 'รหัสลับ (token) ไม่ถูกต้อง',
  'wrong pin': 'รหัสเจ้าหน้าที่ไม่ถูกต้อง',
  locked: 'ใส่รหัสผิดหลายครั้ง ระบบล็อกไว้ 10 นาที',
  'pin not set': 'ยังไม่ได้ตั้งรหัสเจ้าหน้าที่ — ตั้งได้ที่ชีต เมนู ICU Smart Center › ตั้ง / เปลี่ยนรหัสเจ้าหน้าที่',
  'pin too short': 'รหัสต้องมีอย่างน้อย 6 ตัว',
};

/** ข้อผิดพลาดจากสคริปต์ · code = ข้อความดั้งเดิม (เช่น 'wrong pin') */
export class ApiError extends Error {
  code: string;
  constructor(code: string) {
    super(ERRORS[code] ?? code);
    this.code = code;
  }
}

const isAppsScriptUrl = (url: string) => /^https:\/\/script\.google(usercontent)?\.com\//.test(url.trim());
const isLocalDevUrl = (url: string) => import.meta.env.DEV && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url.trim());

export const validateUrl = (url: string) => {
  if (!url.trim()) return 'กรุณาวางลิงก์ Web app';
  if (isLocalDevUrl(url)) return null;
  if (!isAppsScriptUrl(url)) return 'ลิงก์ต้องขึ้นต้นด้วย https://script.google.com/macros/s/…';
  if (!/\/exec(\?|$)/.test(url.trim())) return 'ใช้ลิงก์ที่ลงท้ายด้วย /exec (ไม่ใช่ /dev)';
  return null;
};

async function readJson(res: Response): Promise<Snapshot> {
  if (!res.ok) throw new Error(`เซิร์ฟเวอร์ตอบกลับ ${res.status}`);
  const text = await res.text();
  let body: { ok?: boolean; error?: string } & Snapshot;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('อ่านข้อมูลไม่ได้ — ตรวจสอบว่า Deploy แบบ "Who has access: Anyone"');
  }
  if (!body.ok) throw new ApiError(body.error || 'เกิดข้อผิดพลาด');
  return body;
}

/** parts='core' = เฉพาะเตียง/รายวัน/Log/Stats (ดึงบ่อย) · ไม่ระบุ = รวมบุคลากรและตารางเวร */
export async function fetchSnapshot(cfg: SheetConfig, parts?: 'core', signal?: AbortSignal): Promise<Snapshot> {
  const u = new URL(cfg.url.trim());
  if (cfg.token) u.searchParams.set('token', cfg.token);
  if (parts) u.searchParams.set('parts', parts);
  u.searchParams.set('_', String(Date.now()));
  return readJson(await fetch(u, { signal, cache: 'no-store', redirect: 'follow' }));
}

/** text/plain = "simple request" ไม่มี CORS preflight (Apps Script ไม่รองรับ OPTIONS) */
async function post(cfg: SheetConfig, body: Record<string, unknown>): Promise<Snapshot> {
  return readJson(
    await fetch(cfg.url.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: cfg.token || undefined, ...body }),
      redirect: 'follow',
    }),
  );
}

/** บันทึกข้อมูล (ต้องมีรหัสเจ้าหน้าที่) */
export const postOps = (cfg: SheetConfig, pin: string, ops: SheetOp[]) => post(cfg, { pin, ops });

/** ตรวจรหัสเจ้าหน้าที่ → ได้ข้อมูลทั้งหมดพร้อมลิงก์ชีต */
export const verifyPin = (cfg: SheetConfig, pin: string) => post(cfg, { pin, action: 'verify' });

export const changePin = (cfg: SheetConfig, pin: string, newPin: string) => post(cfg, { pin, action: 'changePin', newPin });

export const sheetLink = (meta: SheetMeta | null, tab?: keyof SheetMeta['gids'], row?: number) => {
  if (!meta?.spreadsheetUrl) return null;
  const base = meta.spreadsheetUrl.split('#')[0];
  const gid = tab ? meta.gids[tab] : undefined;
  if (gid === undefined) return base;
  return `${base}#gid=${gid}${row ? `&range=A${row}` : ''}`;
};
