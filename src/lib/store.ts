import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { IcuData, SheetMeta, SheetOp, SyncState } from '../types';
import { initialData, normalizeData, upgradeLocalData, type ActionResult } from './logic';
import { DEFAULT_SHEETS_API_URL, LEGACY_SHEETS_API_URLS } from '../config';
import { ApiError, changePin as apiChangePin, fetchSnapshot, postOps, verifyPin, type SheetConfig, type Snapshot } from './sheetApi';

const CONFIG_KEY = 'icu.sheet.config.v2';
const DATA_KEY = 'icu.data.v2';
const META_KEY = 'icu.sheet.meta.v2';
const SESSION_KEY = 'icu.staff.session.v1';
/** "จำไว้ในเครื่องนี้" อยู่ได้ 12 ชั่วโมง (ประมาณ 1 เวร) */
const REMEMBER_MS = 12 * 3600_000;

interface Session {
  pin: string;
  exp: number;
}

const readSession = (): string | null => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s.pin || (s.exp && s.exp < Date.now())) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s.pin;
  } catch {
    return null;
  }
};

const writeSession = (pin: string | null, remember = false) => {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    if (!pin) return;
    const s: Session = { pin, exp: remember ? Date.now() + REMEMBER_MS : 0 };
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* ไม่เป็นไร */
  }
};

const POLL_MS = Math.max(2000, Number(import.meta.env.VITE_POLL_MS) || 5000);

const ENV_CONFIG: SheetConfig = {
  url: (import.meta.env.VITE_SHEETS_API_URL as string | undefined)?.trim() || DEFAULT_SHEETS_API_URL,
  token: (import.meta.env.VITE_SHEETS_API_TOKEN as string | undefined)?.trim() || '',
};

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage อาจถูกปิดไว้ — ไม่เป็นไร */
  }
};

const fingerprint = (s: Snapshot) => JSON.stringify([s.beds, s.daily, s.logs, s.stats, s.gids, s.spreadsheetUrl]);
const teamPrint = (s: Snapshot) =>
  s.staff === undefined ? null : JSON.stringify([s.staff, s.roster, s.docs, s.news, s.kpis, s.kpiData, s.links]);
/** บุคลากร/ตารางเวรเปลี่ยนไม่บ่อย: ดึงทุก ๆ 6 รอบ (ประมาณ 30 วินาที) */
const TEAM_EVERY = 6;

/** ป๊อปอัปกลางจอ: กำลังบันทึก → ✓ สำเร็จ / ✗ ผิดพลาด */
export interface Notice {
  id: number;
  phase: 'saving' | 'ok' | 'error';
  text: string;
  detail?: string;
}

export function useIcuStore() {
  const [config, setConfigState] = useState<SheetConfig>(() => {
    const saved = read(CONFIG_KEY, ENV_CONFIG);
    // ไม่มีลิงก์ที่บันทึกไว้ในเครื่อง หรือเป็นลิงก์ชุดเก่า → ใช้ชีตหลักของระบบอัตโนมัติ
    if (!saved.url || LEGACY_SHEETS_API_URLS.includes(saved.url.trim())) return ENV_CONFIG;
    return saved;
  });
  const [data, setData] = useState<IcuData>(() => {
    const stored = read<Partial<IcuData>>(DATA_KEY, initialData());
    // ยังไม่เชื่อมชีต: เติมเตียงให้ครบ 8 เตียง · เชื่อมแล้ว: ชีตเป็นตัวกำหนดจำนวนเตียง
    return config.url ? ({ ...initialData(), ...stored } as IcuData) : upgradeLocalData(stored);
  });
  const [meta, setMeta] = useState<SheetMeta | null>(() => (config.url ? read(META_KEY, null) : null));
  const [state, setState] = useState<SyncState>(config.url ? 'connecting' : 'local');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pin, setPinState] = useState<string | null>(readSession);
  const [pinSet, setPinSet] = useState<boolean | null>(null);
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const noticeTimer = useRef(0);

  const dataRef = useRef(data);
  const configRef = useRef(config);
  const pending = useRef(0);
  const inFlight = useRef(false);
  const lastPrint = useRef('');
  const lastTeam = useRef('');
  const pollCount = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());

  dataRef.current = data;
  configRef.current = config;

  useEffect(() => write(DATA_KEY, data), [data]);
  useEffect(() => write(META_KEY, meta), [meta]);

  /** แสดงป๊อปอัป · คืน id ไว้เปลี่ยนสถานะภายหลัง */
  const notify = useCallback((n: Omit<Notice, 'id'>, id = Date.now() + Math.random()) => {
    window.clearTimeout(noticeTimer.current);
    setNotice({ ...n, id });
    if (n.phase !== 'saving') {
      noticeTimer.current = window.setTimeout(
        () => setNotice((cur) => (cur?.id === id ? null : cur)),
        n.phase === 'ok' ? 1700 : 5200,
      );
    }
    return id;
  }, []);

  const dismissNotice = useCallback(() => {
    window.clearTimeout(noticeTimer.current);
    setNotice(null);
  }, []);

  /** ข้อความสั้น ๆ: ✓ สำเร็จ หรือ ✗ ผิดพลาด (กลางจอ) */
  const toast = useCallback(
    (text: string, tone: 'default' | 'error' = 'default', detail?: string) => {
      notify({ phase: tone === 'error' ? 'error' : 'ok', text, detail });
    },
    [notify],
  );

  const logoutLocal = useCallback(() => {
    writeSession(null);
    pinRef.current = null;
    setPinState(null);
    setMeta((m) => (m ? { ...m, spreadsheetId: '', spreadsheetUrl: '' } : m));
  }, []);

  const applySnapshot = useCallback((snap: Snapshot) => {
    const print = fingerprint(snap);
    const team = teamPrint(snap);
    const teamChanged = team !== null && team !== lastTeam.current;
    if (print !== lastPrint.current || teamChanged) {
      lastPrint.current = print;
      if (team !== null) lastTeam.current = team;
      const next = normalizeData(snap);
      // รอบที่ไม่ได้ขอข้อมูลบุคลากร (parts=core) ใช้ข้อมูลเดิมต่อ
      if (snap.staff === undefined) {
        const cur = dataRef.current;
        Object.assign(next, {
          staff: cur.staff, roster: cur.roster, docs: cur.docs, news: cur.news, kpis: cur.kpis, kpiData: cur.kpiData, links: cur.links,
        });
      }
      dataRef.current = next;
      setData(next);
      // ลิงก์ชีตส่งมาเฉพาะเมื่อยืนยันรหัสเจ้าหน้าที่แล้ว — รอบดึงข้อมูลปกติใช้ลิงก์เดิมต่อ
      setMeta((prev) => {
        const staff = !!pinRef.current;
        return {
          spreadsheetId: snap.spreadsheetId || (staff ? prev?.spreadsheetId ?? '' : ''),
          spreadsheetUrl: snap.spreadsheetUrl || (staff ? prev?.spreadsheetUrl ?? '' : ''),
          title: snap.title,
          gids: snap.gids,
        };
      });
    }
    if (snap.pinSet !== undefined) setPinSet(snap.pinSet);
    setLastSync(new Date());
    setError(null);
    setState(pending.current > 0 ? 'saving' : 'live');
  }, []);

  /** ดึงข้อมูลล่าสุดจากชีต (ข้ามรอบถ้ากำลังบันทึก เพื่อไม่ให้ค่าเก่าทับค่าที่เพิ่งแก้) */
  const pull = useCallback(async () => {
    const cfg = configRef.current;
    if (!cfg.url || inFlight.current || pending.current > 0) return;
    inFlight.current = true;
    try {
      const full = pollCount.current % TEAM_EVERY === 0;
      pollCount.current += 1;
      const snap = await fetchSnapshot(cfg, full ? undefined : 'core');
      if (pending.current === 0 && configRef.current.url === cfg.url) applySnapshot(snap);
    } catch (e) {
      setState(navigator.onLine ? 'error' : 'offline');
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
    }
  }, [applySnapshot]);

  // Real-time polling: ทุก POLL_MS ขณะหน้าเว็บเปิดอยู่ + ทันทีเมื่อกลับมาที่แท็บ
  useEffect(() => {
    if (!config.url) {
      setState('local');
      return;
    }
    setState((s) => (s === 'local' ? 'connecting' : s));
    lastPrint.current = '';
    lastTeam.current = '';
    pollCount.current = 0;
    void pull();
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') void pull();
    }, POLL_MS);
    const wake = () => {
      if (document.visibilityState !== 'visible') return;
      pollCount.current = 0; // กลับมาที่แท็บ: ดึงข้อมูลทั้งหมด
      void pull();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
    };
  }, [config.url, config.token, pull]);

  const send = useCallback(
    (ops: SheetOp[], okText?: string) => {
      const cfg = configRef.current;
      if (!cfg.url || ops.length === 0) {
        if (okText) toast(okText);
        return Promise.resolve();
      }
      const staffPin = pinRef.current;
      if (!staffPin) {
        toast('ต้องเข้าสู่ระบบเจ้าหน้าที่ก่อน', 'error', 'ไปที่เมนู “เจ้าหน้าที่ ICU” แล้วใส่รหัส');
        pollCount.current = 0;
        void pull(); // คืนค่าจากชีต
        return Promise.resolve();
      }
      const id = okText ? notify({ phase: 'saving', text: 'กำลังบันทึก…', detail: okText }) : 0;
      pending.current += 1;
      setState('saving');
      const job = queue.current.then(async () => {
        try {
          const snap = await postOps(cfg, staffPin, ops);
          pending.current -= 1;
          if (pending.current === 0) applySnapshot(snap);
          if (okText) notify({ phase: 'ok', text: okText, detail: 'บันทึกลง Google Sheet แล้ว' }, id);
        } catch (e) {
          pending.current -= 1;
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
          setState('error');
          if (e instanceof ApiError && e.code === 'wrong pin') {
            logoutLocal();
            notify({ phase: 'error', text: 'รหัสเจ้าหน้าที่ถูกเปลี่ยนแล้ว', detail: 'กรุณาเข้าสู่ระบบใหม่ · ข้อมูลยังไม่ถูกบันทึก' }, id || undefined);
          } else {
            notify({ phase: 'error', text: 'บันทึกไม่สำเร็จ', detail: msg }, id || undefined);
          }
          pollCount.current = 0;
          void pull();
        }
      });
      queue.current = job;
      return job;
    },
    [applySnapshot, pull, toast, notify, logoutLocal],
  );

  /** เข้าสู่ระบบเจ้าหน้าที่ (ตรวจรหัสกับสคริปต์ในชีต) */
  const login = useCallback(
    async (code: string, remember: boolean) => {
      const p = code.trim();
      if (!p) return false;
      const cfg = configRef.current;
      try {
        if (cfg.url) {
          const snap = await verifyPin(cfg, p);
          if (snap.pinSet === undefined) {
            throw new Error('สคริปต์ใน Google Sheet ยังเป็นเวอร์ชันเก่า — วางโค้ดใหม่แล้ว Deploy เวอร์ชันใหม่ก่อน');
          }
          pinRef.current = p;
          lastPrint.current = '';
          applySnapshot(snap);
        }
        pinRef.current = p;
        setPinState(p);
        writeSession(p, remember);
        notify({ phase: 'ok', text: 'เข้าสู่ระบบเจ้าหน้าที่แล้ว' });
        return true;
      } catch (e) {
        pinRef.current = pin;
        notify({ phase: 'error', text: 'เข้าสู่ระบบไม่สำเร็จ', detail: e instanceof Error ? e.message : String(e) });
        return false;
      }
    },
    [applySnapshot, notify, pin],
  );

  const logout = useCallback(() => {
    logoutLocal();
    notify({ phase: 'ok', text: 'ออกจากระบบแล้ว' });
  }, [logoutLocal, notify]);

  const changePin = useCallback(
    async (newPin: string) => {
      const cfg = configRef.current;
      const cur = pinRef.current;
      if (!cur) return false;
      const id = notify({ phase: 'saving', text: 'กำลังเปลี่ยนรหัส…' });
      try {
        if (cfg.url) await apiChangePin(cfg, cur, newPin.trim());
        pinRef.current = newPin.trim();
        setPinState(newPin.trim());
        writeSession(newPin.trim(), !!localStorage.getItem(SESSION_KEY));
        notify({ phase: 'ok', text: 'เปลี่ยนรหัสแล้ว', detail: 'ใช้รหัสใหม่ในเครื่องอื่น ๆ ด้วย' }, id);
        return true;
      } catch (e) {
        notify({ phase: 'error', text: 'เปลี่ยนรหัสไม่สำเร็จ', detail: e instanceof Error ? e.message : String(e) }, id);
        return false;
      }
    },
    [notify],
  );

  // เปิดเว็บมาพร้อมรหัสที่จำไว้: ตรวจซ้ำแบบเงียบ ๆ (รหัสถูกเปลี่ยน → ออกจากระบบ)
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || !pin || !config.url) return;
    checked.current = true;
    verifyPin(config, pin)
      .then((snap) => {
        if (snap.pinSet === undefined) return logoutLocal();
        lastPrint.current = '';
        applySnapshot(snap);
      })
      .catch((e) => {
        if (e instanceof ApiError && ['wrong pin', 'pin not set'].includes(e.code)) logoutLocal();
      });
  }, [pin, config, applySnapshot, logoutLocal]);

  /** ใช้ action แบบ optimistic: อัปเดตหน้าเว็บทันที แล้วเขียนลงชีตตามหลัง */
  const commit = useCallback(
    (fn: (d: IcuData) => ActionResult, okText?: string) => {
      const { next, ops } = fn(dataRef.current);
      dataRef.current = next;
      setData(next);
      return send(ops, okText);
    },
    [send],
  );

  const setConfig = useCallback((cfg: SheetConfig) => {
    write(CONFIG_KEY, cfg);
    configRef.current = cfg;
    setConfigState(cfg);
    if (!cfg.url) {
      setMeta(null);
      setError(null);
    }
  }, []);

  const replaceLocal = useCallback((next: IcuData) => {
    dataRef.current = next;
    setData(next);
  }, []);

  return useMemo(
    () => ({
      data,
      meta,
      config,
      state,
      lastSync,
      error,
      notice,
      dismissNotice,
      isStaff: !!pin,
      pinSet,
      login,
      logout,
      changePin,
      pollMs: POLL_MS,
      envConfigured: !!ENV_CONFIG.url,
      toast,
      commit,
      send,
      pull,
      setConfig,
      replaceLocal,
      applySnapshot,
    }),
    [
      data, meta, config, state, lastSync, error, notice, dismissNotice, pin, pinSet, login, logout, changePin,
      toast, commit, send, pull, setConfig, replaceLocal, applySnapshot,
    ],
  );
}

export type IcuStore = ReturnType<typeof useIcuStore>;

export const StoreContext = createContext<IcuStore | null>(null);

export const useStore = () => {
  const s = useContext(StoreContext);
  if (!s) throw new Error('StoreContext missing');
  return s;
};
