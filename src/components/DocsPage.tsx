import {
  ArrowRightLeft,
  ArrowUpRight,
  Download,
  Files,
  BookOpen,
  ChevronRight,
  FileText,
  Folder,
  HeartPulse,
  Landmark,
  ListChecks,
  Paperclip,
  Pencil,
  Pill,
  Pin,
  Plus,
  Scale,
  Search,
  ShieldCheck,
  Siren,
  Stethoscope,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { downloadUrl } from '../lib/content';
import type { Doc, DocCategory, DocType } from '../types';
import { fmtDateYear } from '../lib/date';
import {
  CPG,
  daysUntil,
  DOC_CATEGORIES,
  DOC_TYPES,
  docSteps,
  fileKind,
  nextDocId,
  previewUrl,
  REVIEW_SOON_DAYS,
  reviewState,
  saveDoc,
  type ReviewState,
} from '../lib/docs';
import { fmtSize, MAX_FILE_MB, readDataUrl } from '../lib/files';
import { sheetLink } from '../lib/sheetApi';
import { useStore } from '../lib/store';
import { Button, cx, Empty, Modal, PageHero, Segmented, Switch } from './ui';

export const CATEGORY_ICON: Record<DocCategory, LucideIcon> = {
  ควบคุมการติดเชื้อ: ShieldCheck,
  การดูแลผู้ป่วยวิกฤต: HeartPulse,
  ภาวะฉุกเฉิน: Siren,
  ยาและสารน้ำ: Pill,
  'การรับ-ส่งต่อผู้ป่วย': ArrowRightLeft,
  อุปกรณ์การแพทย์: Wrench,
  ระเบียบหน่วยงาน: Landmark,
  อื่นๆ: Folder,
};

export const TYPE_ICON: Record<DocType, LucideIcon> = {
  SOP: ListChecks,
  'แนวปฏิบัติ (CPG)': Stethoscope,
  'ระเบียบ / ข้อบังคับ': Scale,
  คู่มือ: BookOpen,
  แบบฟอร์ม: FileText,
  เอกสารทั่วไป: Files,
};

const REVIEW_META: Record<ReviewState, { label: (d: Doc) => string; cls: string } | null> = {
  overdue: { label: (d) => `เกินกำหนดทบทวน ${-daysUntil(d.reviewDate)} วัน`, cls: 'bg-critical/12 text-critical' },
  soon: { label: (d) => `ทบทวนภายใน ${daysUntil(d.reviewDate)} วัน`, cls: 'bg-warn/25 text-[#8a5c00]' },
  ok: null,
  none: null,
};

function ReviewBadge({ d }: { d: Doc }) {
  const m = REVIEW_META[reviewState(d)];
  if (!m) return null;
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', m.cls)}>{m.label(d)}</span>;
}

const matches = (d: Doc, q: string) =>
  `${d.title} ${d.summary} ${d.content} ${d.tags.join(' ')} ${d.category} ${d.type} ${d.owner}`.toLowerCase().includes(q.toLowerCase());

type ReviewFilter = 'all' | 'due';

export type DocScope = 'manuals' | 'guidelines';

const SCOPE = {
  manuals: {
    eyebrow: 'คู่มือ & SOP',
    tone: '#008300',
    title: 'คลังเอกสาร ICU',
    add: 'เพิ่มเอกสาร',
    includes: (d: Doc) => d.type !== CPG,
    type: 'SOP' as DocType,
    placeholder: 'ค้นหาเอกสาร ขั้นตอน หรือคำค้น เช่น Code Blue, การเยี่ยม',
  },
  guidelines: {
    eyebrow: 'แนวทางการรักษา',
    tone: '#d55181',
    title: 'แนวทางการรักษา (CPG)',
    add: 'แนบแนวทางการรักษา',
    includes: (d: Doc) => d.type === CPG,
    type: CPG,
    placeholder: 'ค้นหาแนวทางการรักษา เช่น Sepsis, VAP, DKA',
  },
};

export function DocsPage({ scope = 'manuals', startNew, onStarted }: { scope?: DocScope; startNew?: boolean; onStarted?: () => void }) {
  const { data, meta, isStaff } = useStore();
  const sc = SCOPE[scope];
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'all' | DocCategory>('all');
  const [type, setType] = useState<'all' | DocType>('all');
  const [review, setReview] = useState<ReviewFilter>('all');
  const [viewing, setViewing] = useState<Doc | null>(null);
  const [editing, setEditing] = useState<Doc | 'new' | null>(null);

  useEffect(() => {
    if (!startNew) return;
    if (isStaff) setEditing('new');
    onStarted?.();
  }, [startNew, isStaff, onStarted]);

  useEffect(() => {
    setCat('all');
    setType('all');
    setQ('');
  }, [scope]);

  const docs = data.docs.filter(sc.includes);
  const active = docs.filter((d) => d.active);
  const archived = isStaff ? docs.filter((d) => !d.active) : [];
  const due = active.filter((d) => ['overdue', 'soon'].includes(reviewState(d)));
  const overdue = active.filter((d) => reviewState(d) === 'overdue');

  const filtered = active.filter(
    (d) =>
      (cat === 'all' || d.category === cat) &&
      (type === 'all' || d.type === type) &&
      (review === 'all' || ['overdue', 'soon'].includes(reviewState(d))) &&
      (!q || matches(d, q)),
  );
  const searching = !!q || cat !== 'all' || type !== 'all' || review !== 'all';
  const pinned = active.filter((d) => d.pinned);
  const grouped = DOC_CATEGORIES.map((c) => ({ c, docs: filtered.filter((d) => d.category === c) })).filter((g) => g.docs.length);

  // ข้อมูลในชีตเปลี่ยน → อัปเดตเอกสารที่เปิดดูอยู่
  useEffect(() => {
    if (viewing) setViewing(data.docs.find((d) => d.id === viewing.id) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.docs]);

  return (
    <div className="space-y-10 sm:space-y-12">
      <PageHero
        eyebrow={sc.eyebrow}
        tone={sc.tone}
        title={sc.title}
        subtitle={`${active.length} เอกสาร${DOC_TYPES.map((t) => ({ t, n: active.filter((d) => d.type === t).length }))
          .filter((x) => x.n)
          .map((x) => ` · ${x.t} ${x.n}`)
          .join('')}`}
        actions={
          isStaff && (
            <Button variant="primary" size="lg" onClick={() => setEditing('new')}>
              <Plus className="size-4" strokeWidth={2} />
              {sc.add}
            </Button>
          )
        }
      >
        <label className="card mx-auto flex max-w-[680px] items-center gap-3 rounded-full px-5 py-1">
          <Search className="size-5 shrink-0 text-ink-3" strokeWidth={1.8} />
          <input
            className="h-12 w-full bg-transparent text-[16px] text-ink placeholder:text-ink-3 focus:outline-none"
            placeholder={sc.placeholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
          />
        </label>

        {isStaff && due.length > 0 && (
          <button
            type="button"
            onClick={() => setReview(review === 'due' ? 'all' : 'due')}
            className={cx(
              'mx-auto mt-4 flex w-full max-w-[680px] items-center gap-3 rounded-2xl px-4 py-3 text-left text-[14px] transition-colors',
              overdue.length ? 'bg-critical/10 text-critical' : 'bg-warn/20 text-[#8a5c00]',
            )}
          >
            <TriangleAlert className="size-5 shrink-0" strokeWidth={1.8} />
            <span className="flex-1">
              {overdue.length > 0 && `เกินกำหนดทบทวน ${overdue.length} ฉบับ`}
              {overdue.length > 0 && due.length > overdue.length && ' · '}
              {due.length > overdue.length && `ครบกำหนดภายใน ${REVIEW_SOON_DAYS} วัน ${due.length - overdue.length} ฉบับ`}
            </span>
            <span className="text-[12px] underline underline-offset-2">{review === 'due' ? 'แสดงทั้งหมด' : 'ดูรายการ'}</span>
          </button>
        )}
      </PageHero>

      {/* หมวด */}
      <section className="-mt-4 flex flex-col items-center space-y-3">
        <div className="-mx-4 flex max-w-full gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
          <Chip on={cat === 'all'} onClick={() => setCat('all')} label="ทั้งหมด" n={active.length} />
          {DOC_CATEGORIES.map((c) => {
            const n = active.filter((d) => d.category === c).length;
            if (!n) return null;
            const Icon = CATEGORY_ICON[c];
            return <Chip key={c} on={cat === c} onClick={() => setCat(cat === c ? 'all' : c)} label={c} n={n} icon={<Icon className="size-3.5" strokeWidth={1.8} />} />;
          })}
        </div>
        {scope === 'manuals' && <Segmented<'all' | DocType>
          size="sm"
          value={type}
          onChange={setType}
          label="ประเภทเอกสาร"
          options={[{ value: 'all', label: 'ทุกประเภท' }, ...DOC_TYPES.filter((t) => active.some((d) => d.type === t)).map((t) => ({ value: t, label: t }))]}
        />}
      </section>

      {active.length === 0 ? (
        <div className="card">
          <Empty title="ยังไม่มีเอกสาร">
            {isStaff ? `กด “${sc.add}” เพื่ออัปโหลด PDF หรือพิมพ์ขั้นตอน หรือกรอกในแท็บ Docs ของ Google Sheet` : 'เจ้าหน้าที่จะเพิ่มเอกสารที่นี่'}
            {isStaff && meta?.spreadsheetUrl && (
              <>
                {' · '}
                <a className="link" href={sheetLink(meta, 'docs') ?? '#'} target="_blank" rel="noreferrer">
                  เปิดแท็บ Docs
                </a>
              </>
            )}
          </Empty>
        </div>
      ) : (
        <>
          {!searching && pinned.length > 0 && (
            <section>
              <p className="eyebrow mb-3 flex items-center gap-1.5">
                <Pin className="size-3.5" /> สำคัญ / ปักหมุด
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pinned.map((d) => (
                  <PinnedCard key={d.id} d={d} onOpen={() => setViewing(d)} />
                ))}
              </div>
            </section>
          )}

          {filtered.length === 0 ? (
            <div className="card">
              <Empty title="ไม่พบเอกสารที่ค้นหา">ลองใช้คำค้นอื่น หรือเลือก “ทั้งหมด”</Empty>
            </div>
          ) : (
            <section className="space-y-8">
              {grouped.map(({ c, docs }) => {
                const Icon = CATEGORY_ICON[c];
                return (
                  <div key={c}>
                    <p className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
                      <span className="icon-chip size-8 rounded-[10px]">
                        <Icon className="size-4" strokeWidth={1.8} />
                      </span>
                      {c}
                      <span className="text-[13px] font-normal text-ink-3">{docs.length}</span>
                    </p>
                    <ul className="card divide-y divide-line overflow-hidden">
                      {docs.map((d) => (
                        <DocRow key={d.id} d={d} onOpen={() => setViewing(d)} />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}

      {archived.length > 0 && (
        <section>
          <p className="eyebrow mb-3">ยกเลิกแล้ว ({archived.length})</p>
          <ul className="card divide-y divide-line overflow-hidden opacity-70">
            {archived.map((d) => (
              <DocRow key={d.id} d={d} onOpen={() => setViewing(d)} />
            ))}
          </ul>
        </section>
      )}

      <DocViewer
        doc={viewing}
        onClose={() => setViewing(null)}
        onEdit={(d) => {
          setViewing(null);
          setEditing(d);
        }}
      />
      <DocEditor value={editing} onClose={() => setEditing(null)} defaultType={sc.type} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* เอกสารดาวน์โหลด — ทุกเอกสารที่มีไฟล์แนบ                                */
/* ------------------------------------------------------------------ */

const KIND_LABEL: Record<string, string> = { pdf: 'PDF', doc: 'Google Docs', sheet: 'Google Sheets', slides: 'Google Slides', drive: 'ไฟล์', link: 'ลิงก์' };

export function DownloadsPage({ startNew, onStarted }: { startNew?: boolean; onStarted?: () => void }) {
  const { data, isStaff } = useStore();
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | DocType>('all');
  const [viewing, setViewing] = useState<Doc | null>(null);
  const [editing, setEditing] = useState<Doc | 'new' | null>(null);

  useEffect(() => {
    if (!startNew) return;
    if (isStaff) setEditing('new');
    onStarted?.();
  }, [startNew, isStaff, onStarted]);

  const files = data.docs.filter((d) => d.active && d.link);
  const list = files
    .filter((d) => (type === 'all' || d.type === type) && (!q || matches(d, q)))
    .sort((a, b) => (b.updatedAt || b.effectiveDate).localeCompare(a.updatedAt || a.effectiveDate));

  return (
    <div className="space-y-8 sm:space-y-10">
      <PageHero
        eyebrow="ดาวน์โหลด"
        tone="#c98500"
        title="เอกสารดาวน์โหลด"
        subtitle={`${files.length} ไฟล์ · PDF แบบฟอร์ม คู่มือ และแนวทางการรักษา`}
        actions={
          isStaff && (
            <Button variant="primary" size="lg" onClick={() => setEditing('new')}>
              <Paperclip className="size-4" strokeWidth={2} />
              แนบไฟล์
            </Button>
          )
        }
      >
        <label className="card mx-auto flex max-w-[680px] items-center gap-3 rounded-full px-5 py-1">
          <Search className="size-5 shrink-0 text-ink-3" strokeWidth={1.8} />
          <input
            className="h-12 w-full bg-transparent text-[16px] text-ink placeholder:text-ink-3 focus:outline-none"
            placeholder="ค้นหาไฟล์"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
          />
        </label>
        <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
          <Chip on={type === 'all'} onClick={() => setType('all')} label="ทั้งหมด" n={files.length} />
          {DOC_TYPES.map((t) => {
            const n = files.filter((d) => d.type === t).length;
            if (!n) return null;
            const Icon = TYPE_ICON[t];
            return <Chip key={t} on={type === t} onClick={() => setType(type === t ? 'all' : t)} label={t} n={n} icon={<Icon className="size-3.5" strokeWidth={1.8} />} />;
          })}
        </div>
      </PageHero>

      {list.length === 0 ? (
        <div className="card">
          <Empty title={files.length ? 'ไม่พบไฟล์ที่ค้นหา' : 'ยังไม่มีไฟล์ให้ดาวน์โหลด'}>
            {isStaff ? 'กด “แนบไฟล์” เพื่ออัปโหลด PDF' : files.length ? 'ลองใช้คำค้นอื่น' : 'เจ้าหน้าที่จะแนบไฟล์ไว้ที่นี่'}
          </Empty>
        </div>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {list.map((d) => {
            const Icon = TYPE_ICON[d.type];
            const kind = fileKind(d.link);
            return (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-6">
                <span className="icon-chip shrink-0">
                  <Icon className="size-[18px]" strokeWidth={1.7} />
                </span>
                <button type="button" onClick={() => setViewing(d)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[15px] font-medium">{d.title}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-ink-3">
                    {d.type} · {KIND_LABEL[kind] ?? 'ไฟล์'}
                    {d.version && ` · ฉบับที่ ${d.version}`}
                    {d.effectiveDate && ` · ${fmtDateYear(d.effectiveDate)}`}
                  </span>
                </button>
                <a
                  href={downloadUrl(d.link)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`ดาวน์โหลด ${d.title}`}
                  className="btn-ink inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium sm:px-4"
                >
                  <Download className="size-4" />
                  <span className="hidden sm:inline">ดาวน์โหลด</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      <DocViewer
        doc={viewing}
        onClose={() => setViewing(null)}
        onEdit={(d) => {
          setViewing(null);
          setEditing(d);
        }}
      />
      <DocEditor value={editing} onClose={() => setEditing(null)} defaultType="เอกสารทั่วไป" requireFile />
    </div>
  );
}

function Chip({ on, onClick, label, n, icon }: { on: boolean; onClick: () => void; label: string; n: number; icon?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors',
        on ? 'btn-ink' : 'btn-glass text-ink-2 hover:text-ink',
      )}
    >
      {icon}
      {label}
      <span className={cx('num text-[11px]', on ? 'opacity-70' : 'text-ink-3')}>{n}</span>
    </button>
  );
}

function PinnedCard({ d, onOpen }: { d: Doc; onOpen: () => void }) {
  const Icon = TYPE_ICON[d.type];
  const steps = docSteps(d.content);
  return (
    <button type="button" onClick={onOpen} className="card group flex flex-col p-5 text-left transition-transform duration-500 ease-[var(--ease-liquid)] hover:-translate-y-1">
      <div className="flex items-start justify-between gap-3">
        <span className="icon-chip">
          <Icon className="size-[18px]" strokeWidth={1.7} />
        </span>
        <Pin className="size-4 text-ink-3" />
      </div>
      <p className="mt-3 line-clamp-2 text-[15px] leading-snug font-semibold">{d.title}</p>
      <p className="mt-1 text-[12px] text-ink-3">
        {d.type} · {d.category}
      </p>
      {d.summary && <p className="mt-2 line-clamp-2 text-[13px] text-ink-2">{d.summary}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-[12px] text-ink-3">
        {steps.length > 0 && <span>{steps.length} ขั้นตอน</span>}
        {d.link && (
          <span className="inline-flex items-center gap-1">
            <Paperclip className="size-3" /> ไฟล์แนบ
          </span>
        )}
        <ReviewBadge d={d} />
      </div>
    </button>
  );
}

function DocRow({ d, onOpen }: { d: Doc; onOpen: () => void }) {
  const Icon = TYPE_ICON[d.type];
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-fill-soft sm:px-6">
        <span className="icon-chip shrink-0">
          <Icon className="size-[18px]" strokeWidth={1.7} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {d.pinned && <Pin className="size-3.5 shrink-0 text-ink-3" />}
            <span className="truncate text-[15px] font-medium">{d.title}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
            <span>{d.type}</span>
            {d.version && <span>· ฉบับที่ {d.version}</span>}
            {d.effectiveDate && <span>· ประกาศใช้ {fmtDateYear(d.effectiveDate)}</span>}
            {d.link && (
              <span className="inline-flex items-center gap-0.5">
                · <Paperclip className="size-3" /> ไฟล์
              </span>
            )}
            <ReviewBadge d={d} />
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-3" />
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* อ่านเอกสาร                                                          */
/* ------------------------------------------------------------------ */

function DocViewer({ doc, onClose, onEdit }: { doc: Doc | null; onClose: () => void; onEdit: (d: Doc) => void }) {
  const { meta, isStaff } = useStore();
  if (!doc) return <Modal open={false} onClose={onClose} title="" children={null} />;
  const steps = docSteps(doc.content);
  const preview = previewUrl(doc.link);
  const kind = fileKind(doc.link);
  const Icon = TYPE_ICON[doc.type];
  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-4xl"
      title={doc.title}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <Icon className="size-3.5" /> {doc.type}
          </span>
          <span>· {doc.category}</span>
          {doc.version && <span>· ฉบับที่ {doc.version}</span>}
          {!doc.active && <span className="text-critical">· ยกเลิกแล้ว</span>}
        </span>
      }
      footer={
        <>
          {isStaff && meta?.spreadsheetUrl && doc.row && (
            <a className="link mr-auto inline-flex items-center gap-0.5 text-[13px]" href={sheetLink(meta, 'docs', doc.row) ?? '#'} target="_blank" rel="noreferrer">
              แถวนี้ในชีต <ArrowUpRight className="size-3.5" />
            </a>
          )}
          {isStaff && (
            <Button variant="secondary" onClick={() => onEdit(doc)}>
              <Pencil className="size-4" strokeWidth={1.8} />
              แก้ไข
            </Button>
          )}
          {doc.link && (
            <a href={doc.link} target="_blank" rel="noreferrer" className="btn-glass inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[14px] font-medium">
              เปิดไฟล์ <ArrowUpRight className="size-4" />
            </a>
          )}
          {doc.link && ['drive', 'pdf'].includes(kind) && (
            <a href={downloadUrl(doc.link)} target="_blank" rel="noreferrer" className="btn-ink inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[14px] font-medium">
              <Download className="size-4" /> ดาวน์โหลด
            </a>
          )}
        </>
      }
    >
      <div className="space-y-6">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Meta label="ประกาศใช้" value={doc.effectiveDate ? fmtDateYear(doc.effectiveDate) : '—'} />
          <Meta
            label="ทบทวนครั้งถัดไป"
            value={doc.reviewDate ? fmtDateYear(doc.reviewDate) : '—'}
            extra={<ReviewBadge d={doc} />}
          />
          <Meta label="ผู้รับผิดชอบ" value={doc.owner || '—'} />
          <Meta label="อัปเดตล่าสุด" value={doc.updatedAt ? fmtDateYear(doc.updatedAt.slice(0, 10)) : '—'} />
        </dl>

        {doc.summary && <p className="text-[15px] leading-relaxed text-ink-2">{doc.summary}</p>}

        {steps.length > 0 && (
          <section>
            <h3 className="eyebrow mb-3">ขั้นตอน</h3>
            <ol className="space-y-2">
              {steps.map((s, i) => (
                <li key={i} className="well flex gap-3 px-4 py-3">
                  <span className="num inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/12 text-[13px] font-semibold text-accent">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 text-[15px] leading-relaxed">{s}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {preview ? (
          <section>
            <h3 className="eyebrow mb-3">ไฟล์เอกสาร</h3>
            <div className="well overflow-hidden p-0">
              <iframe title={doc.title} src={preview} className="h-[62vh] w-full border-0 bg-white" allow="autoplay" loading="lazy" />
            </div>
            <p className="mt-2 text-[12px] text-ink-3">ถ้าไฟล์ไม่แสดง ให้กด “เปิดไฟล์” หรือแชร์ไฟล์ใน Drive แบบ “ทุกคนที่มีลิงก์ดูได้”</p>
          </section>
        ) : (
          kind === 'link' && (
            <p className="text-[14px] text-ink-2">
              เอกสารนี้เป็นลิงก์ภายนอก กด “เปิดไฟล์” เพื่อดู
            </p>
          )
        )}

        {doc.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {doc.tags.map((t) => (
              <li key={t} className="well rounded-full px-2.5 py-1 text-[12px] text-ink-2">
                #{t}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function Meta({ label, value, extra }: { label: string; value: string; extra?: ReactNode }) {
  return (
    <div className="well px-3.5 py-2.5">
      <dt className="text-[11px] text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-[14px] font-medium">{value}</dd>
      {extra && <dd className="mt-1">{extra}</dd>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* เพิ่ม / แก้ไขเอกสาร                                                  */
/* ------------------------------------------------------------------ */

const blankDoc = (id: string, type: DocType = 'SOP'): Doc => ({
  id,
  title: '',
  category: 'การดูแลผู้ป่วยวิกฤต',
  type,
  summary: '',
  content: '',
  link: '',
  version: '1',
  effectiveDate: '',
  reviewDate: '',
  owner: '',
  tags: [],
  pinned: false,
  active: true,
  updatedAt: '',
});

function DocEditor({
  value,
  onClose,
  defaultType = 'SOP',
  requireFile,
}: {
  value: Doc | 'new' | null;
  onClose: () => void;
  defaultType?: DocType;
  /** หน้าดาวน์โหลด: ต้องมีไฟล์หรือลิงก์ */
  requireFile?: boolean;
}) {
  const { data, commit, toast } = useStore();
  const [form, setForm] = useState<Doc>(blankDoc('D01'));
  const [tags, setTags] = useState('');
  const [file, setFile] = useState<{ name: string; dataUrl: string; size: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value) return;
    const d = value === 'new' ? blankDoc(nextDocId(data.docs), defaultType) : value;
    setForm(d);
    setTags(d.tags.join(', '));
    setFile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const set = <K extends keyof Doc>(k: K, v: Doc[K]) => setForm((f) => ({ ...f, [k]: v }));

  const pick = async (f?: File) => {
    if (!f) return;
    if (f.size > MAX_FILE_MB * 1024 * 1024) return toast(`ไฟล์ใหญ่เกิน ${MAX_FILE_MB} MB`, 'error', 'ลองย่อไฟล์ หรือวางลิงก์ Google Drive แทน');
    try {
      setFile({ name: f.name, dataUrl: await readDataUrl(f), size: f.size });
      if (!form.title.trim()) set('title', f.name.replace(/\.[^.]+$/, ''));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'อ่านไฟล์ไม่ได้', 'error');
    }
  };

  const save = () => {
    if (!form.title.trim()) return;
    if (requireFile && !file && !form.link.trim()) return toast('ยังไม่ได้แนบไฟล์', 'error', 'เลือกไฟล์ หรือวางลิงก์ไฟล์ก่อนบันทึก');
    const d: Doc = {
      ...form,
      title: form.title.trim(),
      tags: tags
        .split(/[,;]/)
        .map((x) => x.trim())
        .filter(Boolean),
    };
    void commit(
      (s) => saveDoc(s, d, file ? { name: file.name, dataUrl: file.dataUrl } : undefined),
      file ? `บันทึก “${d.title}” และอัปโหลดไฟล์แล้ว` : `บันทึก “${d.title}” แล้ว`,
    );
    onClose();
  };

  return (
    <Modal
      open={!!value}
      onClose={onClose}
      width="max-w-2xl"
      title={value === 'new' ? (requireFile ? 'แนบไฟล์ดาวน์โหลด' : defaultType === CPG ? 'แนบแนวทางการรักษา' : 'เพิ่มเอกสาร') : 'แก้ไขเอกสาร'}
      subtitle={`รหัส ${form.id}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button variant="primary" onClick={save} disabled={!form.title.trim()}>
            บันทึก
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="ชื่อเอกสาร *">
          <input className="field" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="เช่น SOP การรับผู้ป่วยใหม่เข้า ICU" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="หมวด">
            <select className="field" value={form.category} onChange={(e) => set('category', e.target.value as DocCategory)}>
              {DOC_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="ประเภท">
            <select className="field" value={form.type} onChange={(e) => set('type', e.target.value as DocType)}>
              {DOC_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="สรุปสั้น ๆ">
          <textarea className="field min-h-16" value={form.summary} onChange={(e) => set('summary', e.target.value)} placeholder="เอกสารนี้ใช้เมื่อไร / ใครต้องอ่าน" />
        </Field>
        <Field label="ขั้นตอน (ไม่บังคับ · 1 บรรทัด = 1 ข้อ)">
          <textarea
            className="field min-h-32 font-[inherit]"
            value={form.content}
            onChange={(e) => set('content', e.target.value)}
            placeholder={'เช่น\nตรวจสอบ...\nแจ้ง...\nบันทึก...'}
          />
        </Field>

        <section className="well space-y-3 p-4">
          <p className="text-[13px] font-medium">ไฟล์เอกสาร</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              className="hidden"
              onChange={(e) => void pick(e.target.files?.[0])}
            />
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              <Paperclip className="size-4" strokeWidth={1.8} />
              {file ? 'เปลี่ยนไฟล์' : form.link ? 'อัปโหลดไฟล์ใหม่' : 'อัปโหลด PDF / ไฟล์'}
            </Button>
            {file && (
              <span className="text-[12px] text-ink-2">
                {file.name} · {fmtSize(file.size)} (อัปโหลดเมื่อกดบันทึก)
              </span>
            )}
          </div>
          <Field label="หรือวางลิงก์ (Google Drive / Google Docs / PDF)">
            <input className="field" value={form.link} onChange={(e) => set('link', e.target.value)} placeholder="https://drive.google.com/file/d/…" disabled={!!file} />
          </Field>
          <p className="text-[11px] text-ink-3">ไฟล์ที่อัปโหลดจะเก็บในโฟลเดอร์ “ICU Smart Center - คู่มือ SOP” ใน Google Drive · ไม่เกิน {MAX_FILE_MB} MB</p>
        </section>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="ฉบับที่">
            <input className="field" value={form.version} onChange={(e) => set('version', e.target.value)} />
          </Field>
          <Field label="วันที่ประกาศใช้">
            <input type="date" className="field" value={form.effectiveDate} onChange={(e) => set('effectiveDate', e.target.value)} />
          </Field>
          <Field label="วันที่ต้องทบทวน">
            <input type="date" className="field" value={form.reviewDate} onChange={(e) => set('reviewDate', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ผู้รับผิดชอบ">
            <input className="field" value={form.owner} onChange={(e) => set('owner', e.target.value)} placeholder="เช่น หัวหน้าหอผู้ป่วย / ทีม IC" />
          </Field>
          <Field label="คำค้น (คั่นด้วยจุลภาค)">
            <input className="field" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="เช่น VAP, ปอดอักเสบ" />
          </Field>
        </div>
        <div className="well divide-y divide-line px-4">
          <Switch label="ปักหมุด" hint="แสดงเป็นเอกสารสำคัญด้านบน" checked={form.pinned} onChange={(v) => set('pinned', v)} />
          <Switch label="ใช้งานอยู่" hint="ปิดเมื่อยกเลิกเอกสาร (ยังเก็บไว้ในรายการ “ยกเลิกแล้ว”)" checked={form.active} onChange={(v) => set('active', v)} />
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

