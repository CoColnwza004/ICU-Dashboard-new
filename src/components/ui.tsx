import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus, X } from 'lucide-react';
import type { Notice } from '../lib/store';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

/* ------------------------------------------------------------------ */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap select-none',
        'transition-[background,opacity,transform,color] duration-200 ease-[var(--ease-apple)] active:scale-[0.97]',
        'disabled:opacity-40 disabled:pointer-events-none',
        size === 'sm' && 'h-8 px-3.5 text-[13px]',
        size === 'md' && 'h-10 px-5 text-[14px]',
        size === 'lg' && 'h-12 px-7 text-[15px]',
        variant === 'primary' && 'btn-ink hover:opacity-90',
        variant === 'accent' && 'bg-accent text-white hover:opacity-90',
        variant === 'secondary' && 'btn-glass hover:brightness-[1.03]',
        variant === 'ghost' && 'text-ink-2 hover:text-ink hover:bg-fill-soft',
        variant === 'danger' && 'bg-critical/10 text-critical hover:bg-critical/15',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        'inline-flex size-9 items-center justify-center rounded-full text-ink-2 transition-colors',
        'hover:bg-fill-soft hover:text-ink active:scale-95',
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  label,
  stretch,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  label?: string;
  stretch?: boolean;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);

  // วัดตำแหน่งปุ่มที่เลือก แล้วเลื่อน "หยดแก้ว" ไปหาแบบมีเด้งเล็กน้อย
  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => {
      const btn = el.querySelector<HTMLElement>('[aria-selected="true"]');
      setThumb(btn ? { x: btn.offsetLeft, w: btn.offsetWidth } : null); // ไม่มีปุ่มที่เลือก (เช่น อยู่หน้าอื่น) → ซ่อน
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, options.length]);

  return (
    <div
      ref={track}
      role="tablist"
      aria-label={label}
      className={cx('seg-track relative inline-flex max-w-full overflow-x-auto rounded-full p-[3px]', className)}
    >
      {thumb && (
        <span
          aria-hidden
          className="seg-thumb absolute top-[3px] bottom-[3px] left-0 rounded-full transition-[transform,width] duration-500 ease-[var(--ease-liquid)]"
          style={{ transform: `translateX(${thumb.x}px)`, width: thumb.w }}
        />
      )}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative z-[1] rounded-full font-medium whitespace-nowrap transition-colors duration-200',
              stretch && 'flex-1',
              size === 'md' ? 'h-8 px-4 text-[13px]' : 'h-7 px-3 text-[12px]',
              active ? 'text-ink' : 'text-ink-2 hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export const Dot = ({ className }: { className?: string }) => (
  <span aria-hidden className={cx('inline-block size-2 shrink-0 rounded-full', className)} />
);

/* ------------------------------------------------------------------ */

export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className="block text-[15px] text-ink">{label}</span>
        {hint && <span className="block text-[12px] text-ink-3">{hint}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-good' : 'bg-line-strong',
        )}
      >
        <span
          className={cx(
            'absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.15),0_1px_1px_rgb(0_0_0/0.16)]',
            'transition-transform duration-200 ease-[var(--ease-apple)]',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </label>
  );
}

/* ------------------------------------------------------------------ */

export function Stepper({
  value,
  onChange,
  label,
  min = 0,
  max = 99,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  min?: number;
  max?: number;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="seg-track inline-flex items-center gap-1 rounded-full p-1">
      <button
        type="button"
        aria-label={`ลด ${label}`}
        onClick={() => onChange(clamp(value - 1))}
        className="inline-flex size-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:text-ink enabled:hover:[background:var(--glass-bg-strong)] disabled:opacity-30"
        disabled={value <= min}
      >
        <Minus className="size-4" strokeWidth={1.75} />
      </button>
      <input
        aria-label={label}
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(clamp(Number.parseInt(e.target.value, 10) || 0))}
        className="num w-10 bg-transparent text-center text-[17px] font-semibold text-ink focus:outline-none"
      />
      <button
        type="button"
        aria-label={`เพิ่ม ${label}`}
        onClick={() => onChange(clamp(value + 1))}
        className="inline-flex size-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:text-ink enabled:hover:[background:var(--glass-bg-strong)] disabled:opacity-30"
        disabled={value >= max}
      >
        <Plus className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-xl',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // เก็บ onClose ล่าสุดไว้ใน ref: หน้าแม่สร้างฟังก์ชันใหม่ทุกครั้งที่ render (เช่น ทุกรอบดึงข้อมูลจากชีต)
  // ถ้าใส่ไว้ใน deps ของ effect ด้านล่าง หน้าต่างจะดึงโฟกัสกลับไปที่ตัวเอง → ช่องที่กำลังพิมพ์หลุดโฟกัส
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    const root = document.getElementById('root');
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    if (root) root.inert = true; // หน้าเว็บด้านหลังกด/โฟกัสไม่ได้ระหว่างเปิดหน้าต่าง
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (root) root.inert = false;
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="presentation">
      <div className="animate-fade absolute inset-0 bg-black/25 backdrop-blur-[6px]" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cx(
          'animate-sheet glass glass-strong flex max-h-[92dvh] w-full flex-col overflow-hidden focus:outline-none',
          'rounded-t-[30px] sm:rounded-[30px]',
          width,
        )}
      >
        <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 sm:px-8 sm:pt-7">
          <div className="min-w-0">
            <h2 className="display text-[22px] sm:text-[26px]">{title}</h2>
            {subtitle && <p className="mt-1 text-[14px] text-ink-2">{subtitle}</p>}
          </div>
          <IconButton label="ปิด" onClick={onClose} className="btn-glass -mr-2">
            <X className="size-4" strokeWidth={2} />
          </IconButton>
        </header>
        <div className="flex-1 overflow-y-auto px-6 pb-6 sm:px-8">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4 sm:px-8">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */

/** นาฬิกา: อัปเดตเฉพาะตัวเลข ไม่ทำให้ทั้งหน้า re-render ทุกวินาที */
export function Clock({ seconds, secondsClassName }: { seconds?: boolean; secondsClassName?: string }) {
  const now = useNowTick(seconds ? 1000 : 15_000);
  const d = new Date(now);
  return (
    <>
      {d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
      {seconds && <span className={secondsClassName}>{String(d.getSeconds()).padStart(2, '0')}</span>}
    </>
  );
}

const useNowTick = (ms: number) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
};

/** หัวหน้าแบบเว็บไซต์ Apple: ป้ายสีเล็ก · หัวข้อใหญ่กลางจอ · คำอธิบาย · ปุ่มเม็ดยา */
export function PageHero({
  eyebrow,
  tone,
  title,
  subtitle,
  actions,
  children,
}: {
  eyebrow?: ReactNode;
  /** สีของป้ายเล็กด้านบน */
  tone?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** เนื้อหาเพิ่มใต้ปุ่ม เช่น ช่องค้นหา ตัวเลือกเดือน */
  children?: ReactNode;
}) {
  return (
    <section className="animate-rise pt-10 text-center sm:pt-16">
      {eyebrow && (
        <p className="text-[15px] font-semibold sm:text-[17px]" style={{ color: tone ?? 'var(--color-accent)' }}>
          {eyebrow}
        </p>
      )}
      <h1 className="apple-headline mt-1 text-[36px] sm:text-[52px]">{title}</h1>
      {subtitle && <div className="mx-auto mt-2 max-w-2xl text-[17px] leading-snug text-ink-2 sm:text-[21px]">{subtitle}</div>}
      {actions && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
      {children && <div className="mt-8">{children}</div>}
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h2 className="display text-[24px] sm:text-[28px]">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-[14px] text-ink-2">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** ป๊อปอัปกลางจอ — ✓ เมื่อสำเร็จ, ✗ เมื่อผิดพลาด (แตะเพื่อปิด) */
export function Popup({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  if (!notice) return null;
  const { phase } = notice;
  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center p-6"
      role={phase === 'error' ? 'alertdialog' : 'status'}
      aria-live={phase === 'error' ? 'assertive' : 'polite'}
    >
      <div
        className={cx('absolute inset-0 bg-black/10 animate-fade', phase === 'error' && 'pointer-events-auto bg-black/20')}
        onClick={onClose}
        aria-hidden
      />
      <button
        type="button"
        key={notice.id + phase}
        onClick={onClose}
        className={cx(
          'glass glass-strong pointer-events-auto relative flex w-[min(300px,100%)] flex-col items-center rounded-[30px] px-7 pt-8 pb-7 text-center shadow-[var(--shadow-float)]',
          phase === 'error' ? 'animate-shake' : 'animate-pop',
        )}
      >
        <span
          className={cx(
            'relative inline-flex size-[76px] items-center justify-center rounded-full',
            phase === 'ok' && 'bg-good/14 text-good',
            phase === 'error' && 'bg-critical/12 text-critical',
            phase === 'saving' && 'bg-accent/10 text-accent',
          )}
        >
          {phase === 'saving' ? (
            <svg viewBox="0 0 48 48" className="animate-spin-slow size-11" aria-hidden>
              <circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="4" />
              <path d="M24 6a18 18 0 0 1 18 18" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 48 48" className="size-11" aria-hidden>
              {phase === 'ok' ? (
                <path d="M12 25.5l8 8L36.5 16" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" className="draw" style={{ ['--len' as string]: 40 }} />
              ) : (
                <>
                  <path d="M15 15l18 18" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" className="draw" style={{ ['--len' as string]: 26 }} />
                  <path d="M33 15L15 33" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" className="draw draw-2" style={{ ['--len' as string]: 26 }} />
                </>
              )}
            </svg>
          )}
        </span>
        <span className="mt-4 text-[17px] leading-snug font-semibold text-ink">{notice.text}</span>
        {notice.detail && <span className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{notice.detail}</span>}
        {phase === 'error' && <span className="mt-4 text-[12px] text-ink-3">แตะเพื่อปิด</span>}
      </button>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */

export function Empty({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {children && <div className="mt-1 text-[13px] text-ink-3">{children}</div>}
    </div>
  );
}
