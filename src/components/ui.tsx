import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus, X } from 'lucide-react';
import type { Toast } from '../lib/store';

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
        variant === 'primary' && 'bg-ink text-on-ink hover:opacity-85',
        variant === 'accent' && 'bg-accent text-white hover:opacity-90',
        variant === 'secondary' && 'bg-fill text-ink hover:bg-line-strong',
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
  stretch?: boolean;
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cx('inline-flex rounded-full bg-fill p-[3px] max-w-full overflow-x-auto', className)}
    >
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
              'rounded-full whitespace-nowrap font-medium transition-all duration-200 ease-[var(--ease-apple)]',
              stretch && 'flex-1',
              size === 'md' ? 'h-8 px-4 text-[13px]' : 'h-7 px-3 text-[12px]',
              active ? 'bg-surface text-ink shadow-[0_1px_4px_rgb(0_0_0/0.12)]' : 'text-ink-2 hover:text-ink',
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
          checked ? 'bg-good' : 'bg-fill',
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
    <div className="inline-flex items-center gap-1 rounded-full bg-fill-soft p-1">
      <button
        type="button"
        aria-label={`ลด ${label}`}
        onClick={() => onChange(clamp(value - 1))}
        className="inline-flex size-8 items-center justify-center rounded-full text-ink-2 hover:bg-surface hover:text-ink disabled:opacity-30"
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
        className="inline-flex size-8 items-center justify-center rounded-full text-ink-2 hover:bg-surface hover:text-ink disabled:opacity-30"
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
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
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
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="presentation">
      <div className="animate-fade absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cx(
          'animate-sheet relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-surface shadow-[var(--shadow-float)] focus:outline-none',
          'rounded-t-[28px] sm:rounded-[28px]',
          width,
        )}
      >
        <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 sm:px-8 sm:pt-7">
          <div className="min-w-0">
            <h2 className="display text-[22px] sm:text-[26px]">{title}</h2>
            {subtitle && <p className="mt-1 text-[14px] text-ink-2">{subtitle}</p>}
          </div>
          <IconButton label="ปิด" onClick={onClose} className="-mr-2 bg-fill-soft">
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

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            'animate-sheet glass pointer-events-auto max-w-md rounded-full px-5 py-2.5 text-[13px] font-medium shadow-[var(--shadow-float)]',
            t.tone === 'error' ? 'text-critical' : 'text-ink',
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
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
