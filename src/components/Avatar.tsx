import { useState } from 'react';
import type { Staff } from '../types';
import { firstName } from '../lib/roster';
import { cx } from './ui';

/** ลิงก์รูปจาก Google Drive (แชร์แบบทุกคนที่มีลิงก์) → ลิงก์รูปที่แสดงในเว็บได้ */
export const photoUrl = (url: string) => {
  const u = (url || '').trim();
  if (!u || u.startsWith('data:')) return u;
  const id = u.match(/\/file\/d\/([\w-]{20,})/)?.[1] ?? u.match(/[?&]id=([\w-]{20,})/)?.[1];
  return id ? `https://lh3.googleusercontent.com/d/${id}=w400` : u;
};

const TINTS = ['#dbe8fb', '#fde4d9', '#d6f2e7', '#fcefc9', '#f8dfe9', '#e3e0fa'];
const INKS = ['#1c5cab', '#a8441c', '#127a55', '#8a5c00', '#a33a63', '#4a3aa7'];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function Avatar({
  staff,
  name,
  size = 40,
  className,
  ring,
}: {
  staff?: Staff | null;
  name?: string;
  size?: number;
  className?: string;
  /** วงแหวนเน้น เช่น หัวหน้าเวร */
  ring?: boolean;
}) {
  const label = staff?.name ?? name ?? '';
  const src = photoUrl(staff?.photo ?? '');
  const [failed, setFailed] = useState<string | null>(null);
  const i = hash(staff?.id ?? label) % TINTS.length;
  const initial = (staff?.nickname || firstName(label)).slice(0, 1) || '?';
  return (
    <span
      className={cx(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none',
        ring && 'ring-2 ring-warn ring-offset-2 ring-offset-[var(--color-surface)]',
        className,
      )}
      style={{ width: size, height: size, background: TINTS[i], color: INKS[i], fontSize: Math.round(size * 0.42) }}
      title={label}
    >
      {src && failed !== src ? (
        <img src={src} alt={label} loading="lazy" className="size-full object-cover" onError={() => setFailed(src)} referrerPolicy="no-referrer" />
      ) : (
        initial
      )}
    </span>
  );
}
