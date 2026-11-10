import { Keyboard } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* ------------------------------------------------------------------ */
/* ลืมเปลี่ยนภาษา: กดปุ่มตัวเลขแถวบนขณะแป้นพิมพ์เป็นภาษาไทย (ได้ ๅ / - ภ ถ …)  */
/* → ช่องตัวเลข: แปลงเป็นตัวเลขให้ทันที · ช่องวันที่/เวลา/รหัส: เตือนให้เปลี่ยนภาษา */
/* ------------------------------------------------------------------ */

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const HOW = isMac ? 'กด Control + Space หรือ Caps Lock' : 'กดปุ่ม ~ (ใต้ Esc) หรือ Alt + Shift';

type Kind = 'convert' | 'warn';

/** ช่องที่ควรพิมพ์เป็นตัวเลข */
const numericKind = (el: HTMLInputElement): Kind | null => {
  const t = el.type;
  if (['date', 'time', 'datetime-local', 'month', 'week'].includes(t)) return 'warn';
  if (t === 'password') return 'warn'; // รหัสเจ้าหน้าที่: เตือนอย่างเดียว ไม่แก้สิ่งที่พิมพ์
  if (t === 'number' || el.inputMode === 'numeric' || el.inputMode === 'decimal' || el.dataset.numeric !== undefined) return 'convert';
  return null;
};

/** ปุ่มบนแป้น → ตัวที่ควรได้ (อ่านจากตำแหน่งปุ่ม ไม่ขึ้นกับภาษา) */
const intended = (e: KeyboardEvent, el: HTMLInputElement) => {
  const d = e.code.match(/^(?:Digit|Numpad)([0-9])$/);
  if (d) return d[1];
  if ((e.code === 'Period' || e.code === 'NumpadDecimal') && el.inputMode === 'decimal') return '.';
  return null;
};

/** ใส่ตัวอักษรในช่องที่ React ควบคุมอยู่ (ให้ onChange ทำงานตามปกติ) */
const insert = (el: HTMLInputElement, text: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + text + el.value.slice(end);
  setter?.call(el, next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  const pos = start + text.length;
  requestAnimationFrame(() => {
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      /* บางชนิดช่องเลื่อนเคอร์เซอร์ไม่ได้ */
    }
  });
};

export function KeyboardLangGuard() {
  const [hint, setHint] = useState<Kind | null>(null);
  const timer = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const kind = numericKind(el);
      if (!kind) return;
      const want = intended(e, el);
      // ได้ตัวอักษรอื่นที่ไม่ใช่ตัวเลข (เช่น ๅ / ภ ถ หรือเลขไทย) → แป้นพิมพ์เป็นภาษาไทยอยู่
      if (!want || e.key === want || e.key.length !== 1 || /[0-9.]/.test(e.key)) return;
      let shown: Kind = kind;
      if (kind === 'convert' && el.type !== 'number') {
        e.preventDefault();
        insert(el, want);
      } else if (kind === 'convert') {
        shown = 'warn';
      }
      setHint(shown);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setHint(null), 5000);
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      window.clearTimeout(timer.current);
    };
  }, []);

  if (!hint) return null;
  return createPortal(
    <div
      role="status"
      className="animate-pop pointer-events-none fixed inset-x-0 top-16 z-[90] flex justify-center px-4"
    >
      <div className="glass glass-strong pointer-events-auto flex max-w-md items-start gap-3 rounded-[18px] px-4 py-3 text-[14px]">
        <Keyboard className="mt-0.5 size-5 shrink-0 text-accent" strokeWidth={1.8} />
        <p className="leading-snug">
          <span className="font-semibold text-ink">แป้นพิมพ์เป็นภาษาไทยอยู่</span>
          <span className="block text-ink-2">
            {hint === 'convert' ? 'แปลงเป็นตัวเลขให้แล้ว · ' : 'ช่องนี้ต้องพิมพ์ตัวเลขภาษาอังกฤษ · '}
            เปลี่ยนภาษา: {HOW}
          </span>
        </p>
        <button
          type="button"
          onClick={() => setHint(null)}
          className="-mr-1 shrink-0 rounded-full px-2 text-[13px] text-ink-3 hover:text-ink"
          aria-label="ปิดคำเตือน"
        >
          ปิด
        </button>
      </div>
    </div>,
    document.body,
  );
}
