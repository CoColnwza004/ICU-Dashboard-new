import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/** auto = ตามการตั้งค่าของเครื่อง */
export type ThemePref = 'auto' | 'light' | 'dark';
const KEY = 'icu.theme.v1';

const readPref = (): ThemePref => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
};

/** ใส่ data-theme ที่ <html> · force = บังคับ (หน้าแรกเป็นพื้นดำเสมอ) */
export const applyTheme = (pref: ThemePref, force?: 'dark') => {
  const root = document.documentElement;
  const t = force ?? (pref === 'auto' ? null : pref);
  if (t) root.dataset.theme = t;
  else delete root.dataset.theme;
};

export function useThemePref() {
  const [pref, setPref] = useState<ThemePref>(readPref);
  const set = useCallback((p: ThemePref) => {
    setPref(p);
    try {
      if (p === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, p);
    } catch {
      /* ไม่เป็นไร */
    }
  }, []);
  return [pref, set] as const;
}

const media = () => window.matchMedia('(prefers-color-scheme: dark)');
const isDarkNow = () => {
  const t = document.documentElement.dataset.theme;
  return t === 'dark' || (t !== 'light' && media().matches);
};
const subscribe = (cb: () => void) => {
  const m = media();
  m.addEventListener('change', cb);
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => {
    m.removeEventListener('change', cb);
    mo.disconnect();
  };
};

/** โหมดที่แสดงอยู่จริงตอนนี้ (ใช้กับกราฟที่ต้องเลือกสีเอง) */
export const useIsDark = () => useSyncExternalStore(subscribe, isDarkNow, () => false);

/** ใช้ในหน้าที่เปลี่ยนธีม: สลับ auto → light → dark */
export const nextPref = (p: ThemePref): ThemePref => (p === 'auto' ? 'light' : p === 'light' ? 'dark' : 'auto');

export const useApplyTheme = (pref: ThemePref, forceDark: boolean) => {
  useEffect(() => applyTheme(pref, forceDark ? 'dark' : undefined), [pref, forceDark]);
};
