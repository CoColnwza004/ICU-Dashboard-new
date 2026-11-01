import { ArrowUpRight, ClipboardCheck, ClipboardList, FilePenLine, Pencil, Plus, ShieldAlert, UserRoundPlus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { FormLink, LinkCategory } from '../types';
import { formEmbedUrl, isSafeUrl, LINK_CATEGORIES, nextLinkId, saveLink } from '../lib/content';
import { sheetLink } from '../lib/sheetApi';
import { useStore } from '../lib/store';
import { IconTile } from './Menu';
import { Button, cx, Empty, Modal, Switch } from './ui';

const CAT_UI: Record<LinkCategory, { icon: typeof ClipboardList; tone: string }> = {
  แบบประเมิน: { icon: ClipboardCheck, tone: '#1baf7a' },
  รายงานอุบัติการณ์: { icon: ShieldAlert, tone: '#e34948' },
  ลงทะเบียน: { icon: UserRoundPlus, tone: '#2a78d6' },
  อื่นๆ: { icon: ClipboardList, tone: '#6250d6' },
};

export function FormsPage({ startNew, onStarted }: { startNew?: boolean; onStarted?: () => void }) {
  const { data, isStaff, meta } = useStore();
  const [open, setOpen] = useState<FormLink | null>(null);
  const [editing, setEditing] = useState<FormLink | 'new' | null>(null);

  useEffect(() => {
    if (!startNew) return;
    if (isStaff) setEditing('new');
    onStarted?.();
  }, [startNew, isStaff, onStarted]);

  const active = data.links.filter((l) => l.active);
  const inactive = isStaff ? data.links.filter((l) => !l.active) : [];
  const groups = LINK_CATEGORIES.map((c) => ({ c, items: active.filter((l) => l.category === c) })).filter((g) => g.items.length);

  return (
    <div className="space-y-8 pt-6 sm:space-y-10 sm:pt-12">
      <section className="animate-rise">
        <p className="eyebrow">Google Forms</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="display text-[34px] sm:text-[48px]">แบบฟอร์มออนไลน์</h1>
            <p className="mt-2 text-[15px] text-ink-2">{active.length} แบบฟอร์ม · แบบประเมิน รายงาน และลงทะเบียน</p>
          </div>
          {isStaff && (
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus className="size-4" strokeWidth={2} />
              เพิ่มลิงก์ฟอร์ม
            </Button>
          )}
        </div>
      </section>

      {active.length === 0 ? (
        <div className="card">
          <Empty title="ยังไม่มีแบบฟอร์ม">
            {isStaff ? 'กด “เพิ่มลิงก์ฟอร์ม” แล้ววางลิงก์ Google Forms' : 'เจ้าหน้าที่จะเพิ่มลิงก์แบบฟอร์มที่นี่'}
            {isStaff && meta?.spreadsheetUrl && (
              <>
                {' · '}
                <a className="link" href={sheetLink(meta, 'links') ?? '#'} target="_blank" rel="noreferrer">
                  เปิดแท็บ Links
                </a>
              </>
            )}
          </Empty>
        </div>
      ) : (
        groups.map(({ c, items }) => (
          <section key={c}>
            <p className="eyebrow mb-3">{c}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((l) => (
                <FormCard key={l.id} l={l} onOpen={() => setOpen(l)} onEdit={isStaff ? () => setEditing(l) : undefined} />
              ))}
            </div>
          </section>
        ))
      )}

      {inactive.length > 0 && (
        <section>
          <p className="eyebrow mb-3">ปิดใช้งาน (เห็นเฉพาะเจ้าหน้าที่) · {inactive.length}</p>
          <div className="grid gap-4 opacity-60 sm:grid-cols-2 lg:grid-cols-3">
            {inactive.map((l) => (
              <FormCard key={l.id} l={l} onOpen={() => setOpen(l)} onEdit={() => setEditing(l)} />
            ))}
          </div>
        </section>
      )}

      <FormViewer link={open} onClose={() => setOpen(null)} />
      <LinkEditor value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function FormCard({ l, onOpen, onEdit }: { l: FormLink; onOpen: () => void; onEdit?: () => void }) {
  const ui = CAT_UI[l.category];
  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <IconTile icon={ui.icon} tone={ui.tone} />
        {onEdit && (
          <button type="button" onClick={onEdit} aria-label={`แก้ไข ${l.title}`} className="inline-flex size-9 items-center justify-center rounded-full text-ink-3 hover:bg-fill-soft hover:text-ink">
            <Pencil className="size-4" />
          </button>
        )}
      </div>
      <p className="mt-4 text-[16px] leading-snug font-semibold">{l.title}</p>
      {l.description && <p className="mt-1 line-clamp-3 text-[13px] text-ink-2">{l.description}</p>}
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <Button variant="primary" size="sm" onClick={onOpen}>
          <FilePenLine className="size-4" /> กรอกแบบฟอร์ม
        </Button>
        {isSafeUrl(l.url) && (
          <a href={l.url} target="_blank" rel="noreferrer" className="btn-glass inline-flex h-8 items-center gap-1 rounded-full px-3.5 text-[13px] font-medium">
            เปิดแท็บใหม่ <ArrowUpRight className="size-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

function FormViewer({ link, onClose }: { link: FormLink | null; onClose: () => void }) {
  if (!link) return <Modal open={false} onClose={onClose} title="" children={null} />;
  const embed = formEmbedUrl(link.url);
  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-3xl"
      title={link.title}
      subtitle={link.description || link.category}
      footer={
        isSafeUrl(link.url) ? (
          <a href={link.url} target="_blank" rel="noreferrer" className="btn-ink inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[14px] font-medium">
            เปิดในแท็บใหม่ <ArrowUpRight className="size-4" />
          </a>
        ) : undefined
      }
    >
      {embed ? (
        <div className="well overflow-hidden p-0">
          <iframe title={link.title} src={embed} className="h-[66vh] w-full border-0 bg-white" loading="lazy" />
        </div>
      ) : (
        <p className="py-6 text-[14px] text-ink-2">แบบฟอร์มนี้เปิดในหน้าเว็บไม่ได้ กด “เปิดในแท็บใหม่” เพื่อกรอก</p>
      )}
      {embed && <p className="mt-2 text-[12px] text-ink-3">ถ้าฟอร์มไม่แสดง (เช่น ฟอร์มที่ต้องลงชื่อเข้าใช้) ให้กด “เปิดในแท็บใหม่”</p>}
    </Modal>
  );
}

const blankLink = (id: string, order: number): FormLink => ({
  id,
  title: '',
  description: '',
  url: '',
  category: 'แบบประเมิน',
  order,
  active: true,
});

function LinkEditor({ value, onClose }: { value: FormLink | 'new' | null; onClose: () => void }) {
  const { data, commit } = useStore();
  const [f, setF] = useState<FormLink>(blankLink('L001', 1));
  useEffect(() => {
    if (!value) return;
    setF(value === 'new' ? blankLink(nextLinkId(data.links), Math.max(0, ...data.links.map((l) => l.order)) + 1) : value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const set = <K extends keyof FormLink>(k: K, v: FormLink[K]) => setF((x) => ({ ...x, [k]: v }));
  const urlOk = isSafeUrl(f.url);
  const valid = f.title.trim() && urlOk;
  const save = () => {
    if (!valid) return;
    const l = { ...f, title: f.title.trim(), url: f.url.trim(), description: f.description.trim() };
    void commit((d) => saveLink(d, l), value === 'new' ? 'เพิ่มแบบฟอร์มแล้ว' : 'บันทึกการแก้ไขแล้ว');
    onClose();
  };
  return (
    <Modal
      open={!!value}
      onClose={onClose}
      title={value === 'new' ? 'เพิ่มลิงก์ Google Forms' : 'แก้ไขลิงก์ฟอร์ม'}
      subtitle={`รหัส ${f.id}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button variant="primary" onClick={save} disabled={!valid}>
            บันทึก
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="ชื่อแบบฟอร์ม *">
          <input className="field" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="เช่น แบบประเมินความพึงพอใจ" />
        </Field>
        <Field label="ลิงก์ Google Forms *">
          <input
            className={cx('field', f.url && !urlOk && 'border-critical')}
            value={f.url}
            onChange={(e) => set('url', e.target.value)}
            placeholder="https://docs.google.com/forms/d/e/…/viewform หรือ https://forms.gle/…"
            inputMode="url"
          />
          {f.url && !urlOk && <span className="mt-1 block text-[12px] text-critical">ลิงก์ต้องขึ้นต้นด้วย https://</span>}
        </Field>
        <Field label="คำอธิบาย">
          <textarea className="field min-h-20" value={f.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <Field label="หมวด">
            <select className="field" value={f.category} onChange={(e) => set('category', e.target.value as LinkCategory)}>
              {LINK_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="ลำดับ">
            <input className="field num" inputMode="numeric" value={f.order} onChange={(e) => set('order', Number(e.target.value) || 0)} />
          </Field>
        </div>
        <div className="well px-4">
          <Switch label="เปิดใช้งาน" hint="ปิดเพื่อซ่อนฟอร์มนี้จากผู้เข้าชม" checked={f.active} onChange={(v) => set('active', v)} />
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] text-ink-2">{label}</span>
      {children}
    </label>
  );
}
