import { useEffect, useState } from 'react';

export const useNow = (ms = 1000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
};

export type View = 'overview' | 'indicators' | 'stats' | 'monthly' | 'wall';
const VIEWS: View[] = ['overview', 'indicators', 'stats', 'monthly', 'wall'];

const fromHash = (): View => {
  const h = window.location.hash.replace('#', '') as View;
  return VIEWS.includes(h) ? h : 'overview';
};

/** แท็บหลักเก็บไว้ใน URL hash เพื่อแชร์ลิงก์ / กด back ได้ */
export const useHashView = () => {
  const [view, setView] = useState<View>(fromHash);
  useEffect(() => {
    const on = () => setView(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (v: View) => {
    if (v !== view) window.location.hash = v === 'overview' ? '' : v;
    setView(v);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return [view, go] as const;
};
