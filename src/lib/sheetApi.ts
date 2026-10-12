import type { SheetMeta, SheetOp } from '../types';

export interface SheetConfig {
  url: string;
  token: string;
}

export interface Snapshot extends SheetMeta {
  beds: Record<string, unknown>[];
  daily: Record<string, unknown>[];
  logs: Record<string, unknown>[];
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
  if (!body.ok) {
    throw new Error(body.error === 'unauthorized' ? 'รหัสลับ (token) ไม่ถูกต้อง' : body.error || 'เกิดข้อผิดพลาด');
  }
  return body;
}

export async function fetchSnapshot(cfg: SheetConfig, signal?: AbortSignal): Promise<Snapshot> {
  const u = new URL(cfg.url.trim());
  if (cfg.token) u.searchParams.set('token', cfg.token);
  u.searchParams.set('_', String(Date.now()));
  return readJson(await fetch(u, { signal, cache: 'no-store', redirect: 'follow' }));
}

/** text/plain = "simple request" ไม่มี CORS preflight (Apps Script ไม่รองรับ OPTIONS) */
export async function postOps(cfg: SheetConfig, ops: SheetOp[]): Promise<Snapshot> {
  return readJson(
    await fetch(cfg.url.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: cfg.token || undefined, ops }),
      redirect: 'follow',
    }),
  );
}

export const sheetLink = (meta: SheetMeta | null, tab?: keyof SheetMeta['gids'], row?: number) => {
  if (!meta?.spreadsheetUrl) return null;
  const base = meta.spreadsheetUrl.split('#')[0];
  if (!tab) return base;
  return `${base}#gid=${meta.gids[tab]}${row ? `&range=A${row}` : ''}`;
};
