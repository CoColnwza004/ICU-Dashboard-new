const pad = (n: number) => String(n).padStart(2, '0');

export const toDateKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const toLocalDateTime = (d: Date = new Date()) =>
  `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const todayKey = () => toDateKey(new Date());

export const parseDateKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const shiftDate = (key: string, days: number) => {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
};

/** รับวันที่หลายรูปแบบจากชีต (yyyy-mm-dd, dd/mm/yyyy, พ.ศ.) → yyyy-MM-dd */
export const normalizeDateKey = (raw: unknown): string => {
  const s = String(raw ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y: number, mo: number, d: number;
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/))) {
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    return s;
  }
  if (y > 2400) y -= 543;
  return `${y}-${pad(mo)}-${pad(d)}`;
};

export const parseLocalDateTime = (s: string): Date | null => {
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
};

const TH = 'th-TH-u-ca-gregory';

export const fmtDateLong = (key: string) =>
  parseDateKey(key).toLocaleDateString(TH, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const fmtDateShort = (key: string) =>
  parseDateKey(key).toLocaleDateString(TH, { day: 'numeric', month: 'short' });

export const fmtDayMonth = (key: string) => {
  const [, m, d] = key.split('-');
  return `${Number(d)}/${Number(m)}`;
};

export const fmtDateTime = (s: string) => {
  const d = parseLocalDateTime(s);
  if (!d) return s || '—';
  return d.toLocaleString(TH, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const fmtMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(TH, { month: 'long', year: 'numeric' });
};

export const daysBetween = (from: string, to: Date = new Date()) => {
  const d = parseLocalDateTime(from);
  if (!d) return 0;
  return Math.max(0, Math.floor((to.getTime() - d.getTime()) / 86_400_000));
};

export const relativeTime = (d: Date | null, now: number) => {
  if (!d) return '';
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 5) return 'เมื่อสักครู่';
  if (s < 60) return `${s} วินาทีที่แล้ว`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} นาทีที่แล้ว`;
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
};
