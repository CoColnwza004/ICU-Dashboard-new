import { ArrowUpRight, Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import scriptCode from '../../apps-script/Code.gs?raw';
import { relativeTime } from '../lib/date';
import { useNow } from '../lib/hooks';
import { demoData, initialData, pushAllOps } from '../lib/logic';
import { fetchSnapshot, sheetLink, validateUrl } from '../lib/sheetApi';
import { useStore } from '../lib/store';
import type { IcuData } from '../types';
import { Button, cx, Dot, Modal } from './ui';

const BACKUP_KEY = 'icu.local.backup.v2';

const hasContent = (d: IcuData | null) =>
  !!d && (d.daily.length > 0 || d.logs.length > 0 || d.beds.some((b) => b.status !== 'available'));

const readBackup = (): IcuData | null => {
  try {
    return JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null');
  } catch {
    return null;
  }
};

const STEPS = [
  <>
    สร้าง Google Sheet ใหม่ (หรือเปิดชีตเดิมของหน่วยงาน) ที่{' '}
    <a className="link" href="https://sheets.new" target="_blank" rel="noreferrer">
      sheets.new
    </a>
  </>,
  <>
    ในชีต ไปที่เมนู <b>ส่วนขยาย › Apps Script</b> ลบโค้ดเดิมทั้งหมด แล้ววางโค้ดที่คัดลอกจากปุ่มด้านล่าง กดบันทึก
  </>,
  <>
    กด <b>Deploy › New deployment</b> เลือกชนิด <b>Web app</b> ตั้งค่า <b>Execute as: Me</b> และ{' '}
    <b>Who has access: Anyone</b> แล้วกด Deploy (อนุญาตสิทธิ์ตามที่ Google ถาม)
  </>,
  <>
    คัดลอก <b>Web app URL</b> (ลงท้ายด้วย <code className="text-[13px]">/exec</code>) มาวางในช่องด้านล่าง แล้วกดเชื่อมต่อ —
    ระบบจะสร้างแท็บ Beds, Daily และ Log ให้อัตโนมัติ
  </>,
];

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const { config, meta, state, lastSync, error, data, envConfigured, pollMs } = store;
  const now = useNow(1000);
  const [url, setUrl] = useState(config.url);
  const [token, setToken] = useState(config.token);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmPush, setConfirmPush] = useState(false);
  const [backup, setBackup] = useState<IcuData | null>(readBackup);

  useEffect(() => {
    if (!open) return;
    setUrl(config.url);
    setToken(config.token);
    setMsg(null);
    setConfirmPush(false);
    // รีเซ็ตเฉพาะตอนเปิดหน้าต่าง (ไม่ล้างข้อความ "สำเร็จ" หลังเชื่อมต่อ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const connected = !!config.url;

  const connect = async () => {
    const invalid = validateUrl(url);
    if (invalid) return setMsg({ text: invalid, ok: false });
    setBusy(true);
    setMsg(null);
    try {
      const snap = await fetchSnapshot({ url, token });
      // เก็บข้อมูลในเครื่องไว้ก่อน เผื่อต้องการย้ายขึ้นชีต
      if (!connected && hasContent(data)) {
        try {
          localStorage.setItem(BACKUP_KEY, JSON.stringify(data));
        } catch {
          /* ignore */
        }
        setBackup(data);
      }
      store.setConfig({ url: url.trim(), token: token.trim() });
      store.applySnapshot(snap);
      setMsg({ text: `เชื่อมต่อ “${snap.title}” สำเร็จ`, ok: true });
      store.toast('เชื่อมต่อ Google Sheet แล้ว · ข้อมูลจะอัปเดตแบบเรียลไทม์');
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    store.setConfig({ url: '', token: '' });
    setUrl('');
    setToken('');
    store.toast('ตัดการเชื่อมต่อแล้ว · ใช้ข้อมูลในเครื่องนี้ต่อ');
  };

  const pushLocal = async () => {
    if (!backup) return;
    setConfirmPush(false);
    await store.send(pushAllOps(backup), 'ส่งข้อมูลเดิมขึ้นชีตแล้ว');
    localStorage.removeItem(BACKUP_KEY);
    setBackup(null);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(scriptCode);
    } catch {
      const t = document.createElement('textarea');
      t.value = scriptCode;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const downloadScript = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([scriptCode], { type: 'text/plain' }));
    a.download = 'Code.gs';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title="Google Sheet"
      subtitle="แก้ไขได้ทั้งในชีตและบนเว็บ — ข้อมูลตรงกันแบบเรียลไทม์"
    >
      <div className="space-y-8 pb-2">
        {/* Status */}
        <section className="rounded-2xl bg-fill-soft p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[15px] font-medium">
                <Dot
                  className={cx(
                    state === 'live' && 'bg-good',
                    (state === 'saving' || state === 'connecting') && 'bg-accent animate-pulse-soft',
                    state === 'error' && 'bg-critical',
                    state === 'offline' && 'bg-warn',
                    state === 'local' && 'bg-ink-3',
                  )}
                />
                {connected ? meta?.title || 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ — ข้อมูลอยู่ในเบราว์เซอร์นี้เท่านั้น'}
              </p>
              <p className="mt-1 text-[13px] text-ink-2">
                {connected
                  ? error && state === 'error'
                    ? error
                    : `ดึงข้อมูลทุก ${Math.round(pollMs / 1000)} วินาที · ล่าสุด ${relativeTime(lastSync, now) || '—'}`
                  : 'เชื่อมต่อเพื่อให้ทุกเครื่องเห็นข้อมูลชุดเดียวกัน'}
              </p>
            </div>
            {connected && (
              <div className="flex flex-wrap gap-2">
                {meta && (
                  <a
                    href={sheetLink(meta) ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center gap-1 rounded-full bg-surface px-3.5 text-[13px] font-medium hover:opacity-80"
                  >
                    เปิดชีต <ArrowUpRight className="size-3.5" />
                  </a>
                )}
                <Button size="sm" variant="ghost" onClick={() => void store.pull()}>
                  ซิงค์ทันที
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* Connect */}
        <section>
          <h3 className="eyebrow mb-3">{connected ? 'การเชื่อมต่อ' : 'เชื่อมต่อ'}</h3>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-ink-2">Web app URL</span>
              <input
                className="field"
                placeholder="https://script.google.com/macros/s/…/exec"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-ink-2">รหัสลับ (ถ้าตั้ง API_TOKEN ไว้ในสคริปต์)</span>
              <input
                className="field"
                placeholder="ไม่บังคับ"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            {msg && <p className={cx('text-[13px]', msg.ok ? 'text-good' : 'text-critical')}>{msg.text}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="primary" onClick={() => void connect()} disabled={busy}>
                {busy ? 'กำลังทดสอบ…' : connected ? 'บันทึกและเชื่อมต่อใหม่' : 'เชื่อมต่อ'}
              </Button>
              {connected && (
                <Button variant="ghost" onClick={disconnect}>
                  ตัดการเชื่อมต่อ
                </Button>
              )}
            </div>
            {envConfigured && (
              <p className="text-[12px] text-ink-3">ค่าเริ่มต้นของลิงก์ถูกตั้งไว้แล้วตอน deploy (VITE_SHEETS_API_URL)</p>
            )}
          </div>
        </section>

        {connected && hasContent(backup) && (
          <section>
            <h3 className="eyebrow mb-3">ย้ายข้อมูลเดิม</h3>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-fill-soft p-5">
              <p className="max-w-md text-[13px] text-ink-2">
                มีข้อมูลที่บันทึกไว้ในเบราว์เซอร์นี้ก่อนเชื่อมต่อ ({backup?.daily.length ?? 0} วัน, {backup?.logs.length ?? 0} รายการทะเบียน)
                ส่งขึ้นชีตได้ — แถวที่มีวันที่หรือเตียงเดียวกันในชีตจะถูกเขียนทับ
              </p>
              {confirmPush ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setConfirmPush(false)}>
                    ยกเลิก
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => void pushLocal()}>
                    ยืนยันส่งขึ้นชีต
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      localStorage.removeItem(BACKUP_KEY);
                      setBackup(null);
                    }}
                  >
                    ไม่ต้องการ
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setConfirmPush(true)}>
                    ส่งขึ้นชีต
                  </Button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Guide */}
        <section>
          <h3 className="eyebrow mb-3">วิธีตั้งค่า (ครั้งเดียว ประมาณ 3 นาที)</h3>
          <ol className="space-y-4">
            {STEPS.map((s, i) => (
              <li key={i} className="flex gap-4">
                <span className="num inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-fill-soft text-[13px] font-semibold">
                  {i + 1}
                </span>
                <p className="pt-0.5 text-[14px] leading-relaxed text-ink-2">{s}</p>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void copy()}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" strokeWidth={1.75} />}
              {copied ? 'คัดลอกแล้ว' : 'คัดลอกโค้ด Apps Script'}
            </Button>
            <Button variant="ghost" onClick={downloadScript}>
              ดาวน์โหลด Code.gs
            </Button>
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
            ข้อมูลในระบบไม่มีชื่อหรือ HN ของผู้ป่วย · ถ้าต้องการจำกัดการเข้าถึง ให้ตั้ง API_TOKEN ในสคริปต์และใส่รหัสเดียวกันด้านบน ·
            เมื่อแก้โค้ดสคริปต์ ให้ Deploy › Manage deployments › Edit › New version
          </p>
        </section>

        {!connected && (
          <section>
            <h3 className="eyebrow mb-3">ข้อมูลในเครื่อง</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  store.replaceLocal(demoData());
                  store.toast('โหลดข้อมูลตัวอย่างแล้ว');
                  onClose();
                }}
              >
                ลองใช้ข้อมูลตัวอย่าง
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  store.replaceLocal(initialData());
                  store.toast('ล้างข้อมูลในเครื่องแล้ว');
                }}
              >
                ล้างข้อมูล
              </Button>
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
