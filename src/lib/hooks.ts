import { useEffect, useState } from 'react';

export const useNow = (ms = 1000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
};

export type View =
  | 'home'
  | 'overview'
  | 'indicators'
  | 'stats'
  | 'monthly'
  | 'wall'
  | 'roster'
  | 'staff'
  | 'docs'
  | 'news'
  | 'kpi'
  | 'guidelines'
  | 'downloads'
  | 'forms'
  | 'admin';
const VIEWS: View[] = [
  'home',
  'overview',
  'indicators',
  'stats',
  'monthly',
  'wall',
  'roster',
  'staff',
  'docs',
  'news',
  'kpi',
  'guidelines',
  'downloads',
  'forms',
  'admin',
];

/** เมนูบนสุด: หน้าแรก · แดชบอร์ด (มีเมนูย่อย 4 หน้า) · ข่าวสาร · ตารางเวร · บุคลากร · อื่น ๆ อยู่ใน “เมนูทั้งหมด” */
export type Section = 'home' | 'dashboard' | 'news' | 'roster' | 'staff' | 'more';
export const DASHBOARD_VIEWS: View[] = ['overview', 'indicators', 'stats', 'monthly'];
export const sectionOf = (v: View): Section =>
  DASHBOARD_VIEWS.includes(v) ? 'dashboard' : v === 'home' || v === 'news' || v === 'roster' || v === 'staff' ? v : 'more';

/** งานที่เปิดค้างไว้เมื่อมาจากหน้าเจ้าหน้าที่ เช่น เปิดฟอร์มประกาศข่าวทันที */
export type Intent = 'new' | 'entry' | 'admit';

const fromHash = (): { view: View; intent: Intent | null } => {
  const [h, q] = window.location.hash.replace('#', '').split('?');
  const view = VIEWS.includes(h as View) ? (h as View) : 'home';
  const intent = (['new', 'entry', 'admit'] as Intent[]).find((x) => x === q) ?? null;
  return { view, intent };
};

/** แท็บหลักเก็บไว้ใน URL hash เพื่อแชร์ลิงก์ / กด back ได้ */
export const useHashView = () => {
  const [state, setState] = useState(fromHash);
  useEffect(() => {
    const on = () => setState(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (v: View, intent: Intent | null = null) => {
    const hash = v === 'home' && !intent ? '' : intent ? `${v}?${intent}` : v;
    if (hash !== window.location.hash.replace('#', '')) {
      if (hash) window.location.hash = hash;
      else history.pushState(null, '', window.location.pathname + window.location.search);
    }
    setState({ view: v, intent });
    // เลื่อนขึ้นบนสุดทำใน App หลังหน้าใหม่แสดงผลแล้ว (ดู useLayoutEffect ใน App)
  };
  /** ใช้ intent แล้ว — ลบออกจาก URL (กด back จะไม่เปิดฟอร์มซ้ำ) */
  const clearIntent = () => {
    setState((s) => ({ ...s, intent: null }));
    if (window.location.hash.includes('?')) history.replaceState(null, '', `#${window.location.hash.replace('#', '').split('?')[0]}`);
  };
  return { view: state.view, intent: state.intent, go, clearIntent };
};
