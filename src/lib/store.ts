import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { IcuData, SheetMeta, SheetOp, SyncState } from '../types';
import { initialData, normalizeData, upgradeLocalData, type ActionResult } from './logic';
import { DEFAULT_SHEETS_API_URL } from '../config';
import { fetchSnapshot, postOps, type SheetConfig, type Snapshot } from './sheetApi';

const CONFIG_KEY = 'icu.sheet.config.v2';
const DATA_KEY = 'icu.data.v2';
const META_KEY = 'icu.sheet.meta.v2';

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

const fingerprint = (s: Snapshot) => JSON.stringify([s.beds, s.daily, s.logs, s.stats, s.gids]);
const teamPrint = (s: Snapshot) => (s.staff === undefined ? null : JSON.stringify([s.staff, s.roster, s.docs]));
/** บุคลากร/ตารางเวรเปลี่ยนไม่บ่อย: ดึงทุก ๆ 6 รอบ (ประมาณ 30 วินาที) */
const TEAM_EVERY = 6;

export interface Toast {
  id: number;
  text: string;
  tone: 'default' | 'error';
}

export function useIcuStore() {
  const [config, setConfigState] = useState<SheetConfig>(() => {
    const saved = read(CONFIG_KEY, ENV_CONFIG);
    return saved.url ? saved : ENV_CONFIG; // ไม่มีลิงก์ที่บันทึกไว้ในเครื่อง → ใช้ชีตหลักของระบบอัตโนมัติ
  });
  const [data, setData] = useState<IcuData>(() => {
    const stored = read<Partial<IcuData>>(DATA_KEY, initialData());
    // ยังไม่เชื่อมชีต: เติมเตียงให้ครบ 8 เตียง · เชื่อมแล้ว: ชีตเป็นตัวกำหนดจำนวนเตียง
    return config.url ? { ...initialData(), ...stored, stats: stored.stats ?? [] } as IcuData : upgradeLocalData(stored);
  });
  const [meta, setMeta] = useState<SheetMeta | null>(() => (config.url ? read(META_KEY, null) : null));
  const [state, setState] = useState<SyncState>(config.url ? 'connecting' : 'local');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

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

  const toast = useCallback((text: string, tone: Toast['tone'] = 'default') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
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
        next.staff = dataRef.current.staff;
        next.roster = dataRef.current.roster;
        next.docs = dataRef.current.docs;
      }
      dataRef.current = next;
      setData(next);
      setMeta({ spreadsheetId: snap.spreadsheetId, spreadsheetUrl: snap.spreadsheetUrl, title: snap.title, gids: snap.gids });
    }
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
      pending.current += 1;
      setState('saving');
      const job = queue.current.then(async () => {
        try {
          const snap = await postOps(cfg, ops);
          pending.current -= 1;
          if (pending.current === 0) applySnapshot(snap);
          if (okText) toast(`${okText} · บันทึกลง Google Sheet แล้ว`);
        } catch (e) {
          pending.current -= 1;
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
          setState('error');
          toast(`บันทึกลงชีตไม่สำเร็จ: ${msg}`, 'error');
          void pull();
        }
      });
      queue.current = job;
      return job;
    },
    [applySnapshot, pull, toast],
  );

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
      toasts,
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
    [data, meta, config, state, lastSync, error, toasts, toast, commit, send, pull, setConfig, replaceLocal, applySnapshot],
  );
}

export type IcuStore = ReturnType<typeof useIcuStore>;

export const StoreContext = createContext<IcuStore | null>(null);

export const useStore = () => {
  const s = useContext(StoreContext);
  if (!s) throw new Error('StoreContext missing');
  return s;
};
