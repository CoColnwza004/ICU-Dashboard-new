import { ArrowUpRight, CalendarDays, Download, EyeOff, ImagePlus, Megaphone, Paperclip, Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { News, NewsCategory } from '../types';
import { downloadUrl, imageUrl, isNewNews, NEWS_CATEGORIES, nextNewsId, saveNews, type UploadFile } from '../lib/content';
import { fmtDateYear, todayKey } from '../lib/date';
import { fmtSize, MAX_FILE_MB, readDataUrl, resizeImage } from '../lib/files';
import { sheetLink } from '../lib/sheetApi';
import { useStore } from '../lib/store';
import { Button, cx, Empty, Modal, PageHero, Switch } from './ui';

export const NEWS_TONE: Record<NewsCategory, string> = {
  ด่วน: 'bg-critical/12 text-critical',
  ประกาศ: 'bg-accent/12 text-accent',
  ข่าวสาร: 'bg-fill text-ink-2',
  กิจกรรม: 'bg-good/12 text-good',
  'อบรม / ประชุม': 'bg-[#6250d6]/12 text-[#6250d6] dark:text-[#a99cff]',
};

/** สีพื้นหัวการ์ดเมื่อไม่มีรูป */
const NEWS_GRADIENT: Record<NewsCategory, string> = {
  ด่วน: 'linear-gradient(135deg,#f6b4a8,#e34948)',
  ประกาศ: 'linear-gradient(135deg,#9cc4f5,#2a78d6)',
  ข่าวสาร: 'linear-gradient(135deg,#d9dbe3,#8e8e95)',
  กิจกรรม: 'linear-gradient(135deg,#a6e3c8,#1baf7a)',
  'อบรม / ประชุม': 'linear-gradient(135deg,#c9c0f7,#6250d6)',
};

export function CategoryPill({ c }: { c: NewsCategory }) {
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', NEWS_TONE[c])}>{c}</span>;
}

function NewsImage({ n, className }: { n: News; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = imageUrl(n.image);
  if (src && !failed) {
    return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={cx('object-cover', className)} />;
  }
  return (
    <div className={cx('flex items-center justify-center', className)} style={{ background: NEWS_GRADIENT[n.category] }} aria-hidden>
      <Megaphone className="size-10 text-white/85" strokeWidth={1.4} />
    </div>
  );
}

const excerpt = (s: string) => s.replace(/\s+/g, ' ').trim();

/** การ์ดข่าว (ใช้ในหน้าข่าวและหน้าแรก) */
export function NewsCard({ n, onOpen, featured }: { n: News; onOpen: () => void; featured?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx('card menu-card group flex w-full overflow-hidden text-left', featured ? 'flex-col md:flex-row' : 'flex-col', !n.published && 'opacity-60')}
    >
      <NewsImage n={n} className={cx('w-full shrink-0', featured ? 'aspect-[16/9] md:aspect-auto md:min-h-[260px] md:w-[52%]' : 'aspect-[16/9]')} />
      <div className={cx('flex flex-1 flex-col', featured ? 'p-6 sm:p-7' : 'p-5')}>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          <CategoryPill c={n.category} />
          {n.pinned && <Pin className="size-3.5" aria-label="ปักหมุด" />}
          {isNewNews(n) && <span className="font-semibold text-accent">ใหม่</span>}
          {!n.published && (
            <span className="inline-flex items-center gap-1">
              <EyeOff className="size-3.5" /> ซ่อนอยู่
            </span>
          )}
        </div>
        <p className={cx('mt-2 leading-snug font-semibold', featured ? 'display text-[22px] sm:text-[26px]' : 'line-clamp-2 text-[16px]')}>{n.title}</p>
        {n.body && <p className={cx('mt-1.5 text-[14px] text-ink-2', featured ? 'line-clamp-4' : 'line-clamp-2')}>{excerpt(n.body)}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-[12px] text-ink-3">
          {n.date && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" /> {fmtDateYear(n.date)}
            </span>
          )}
          {n.author && <span>{n.author}</span>}
          {n.attachment && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="size-3.5" /> ไฟล์แนบ
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/** แถวข่าวแบบย่อ (หน้าแรก) */
export function NewsLine({ n, onOpen }: { n: News; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-fill-soft">
        <NewsImage n={n} className="size-14 shrink-0 rounded-[14px]" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[11px] text-ink-3">
            <CategoryPill c={n.category} />
            {n.date && fmtDateYear(n.date)}
            {isNewNews(n) && <span className="font-semibold text-accent">ใหม่</span>}
          </span>
          <span className="mt-1 line-clamp-1 block text-[15px] font-medium">{n.title}</span>
        </span>
      </button>
    </li>
  );
}

export function NewsPage({ startNew, onStarted }: { startNew?: boolean; onStarted?: () => void }) {
  const { data, isStaff, meta } = useStore();
  const [cat, setCat] = useState<'all' | NewsCategory>('all');
  const [reading, setReading] = useState<News | null>(null);
  const [editing, setEditing] = useState<News | 'new' | null>(null);

  useEffect(() => {
    if (!startNew) return;
    if (isStaff) setEditing('new');
    onStarted?.();
  }, [startNew, isStaff, onStarted]);

  useEffect(() => {
    if (reading) setReading(data.news.find((n) => n.id === reading.id) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.news]);

  const visible = data.news.filter((n) => n.published);
  const hidden = isStaff ? data.news.filter((n) => !n.published) : [];
  const list = visible.filter((n) => cat === 'all' || n.category === cat);
  const [lead, ...rest] = list;

  return (
    <div className="space-y-8 sm:space-y-10">
      <PageHero
        eyebrow="ข่าวสาร"
        tone="#eb6834"
        title="ข่าวสาร & ประกาศ"
        subtitle={`${visible.length} รายการ${visible.filter((n) => isNewNews(n)).length > 0 ? ` · ใหม่ ${visible.filter((n) => isNewNews(n)).length}` : ''}`}
        actions={
          isStaff && (
            <Button variant="primary" size="lg" onClick={() => setEditing('new')}>
              <Plus className="size-4" strokeWidth={2} />
              ประกาศข่าว
            </Button>
          )
        }
      >
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
          <Chip on={cat === 'all'} onClick={() => setCat('all')}>
            ทั้งหมด
          </Chip>
          {NEWS_CATEGORIES.filter((c) => visible.some((n) => n.category === c)).map((c) => (
            <Chip key={c} on={cat === c} onClick={() => setCat(cat === c ? 'all' : c)}>
              {c}
            </Chip>
          ))}
        </div>
      </PageHero>

      {list.length === 0 ? (
        <div className="card">
          <Empty title="ยังไม่มีข่าว">
            {isStaff ? 'กด “ประกาศข่าว” เพื่อเพิ่มข่าวแรก' : 'เจ้าหน้าที่จะประกาศข่าวสารที่นี่'}
            {isStaff && meta?.spreadsheetUrl && (
              <>
                {' · '}
                <a className="link" href={sheetLink(meta, 'news') ?? '#'} target="_blank" rel="noreferrer">
                  เปิดแท็บ News
                </a>
              </>
            )}
          </Empty>
        </div>
      ) : (
        <>
          <NewsCard n={lead} onOpen={() => setReading(lead)} featured />
          {rest.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((n) => (
                <NewsCard key={n.id} n={n} onOpen={() => setReading(n)} />
              ))}
            </div>
          )}
        </>
      )}

      {hidden.length > 0 && (
        <section>
          <p className="eyebrow mb-3 flex items-center gap-1.5">
            <EyeOff className="size-3.5" /> ซ่อนอยู่ (เห็นเฉพาะเจ้าหน้าที่) · {hidden.length}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hidden.map((n) => (
              <NewsCard key={n.id} n={n} onOpen={() => setReading(n)} />
            ))}
          </div>
        </section>
      )}

      <NewsReader
        news={reading}
        onClose={() => setReading(null)}
        onEdit={(n) => {
          setReading(null);
          setEditing(n);
        }}
      />
      <NewsEditor value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex h-9 shrink-0 items-center rounded-full px-4 text-[13px] font-medium whitespace-nowrap transition-colors',
        on ? 'btn-ink' : 'btn-glass text-ink-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* อ่านข่าว                                                             */
/* ------------------------------------------------------------------ */

export function NewsReader({ news, onClose, onEdit }: { news: News | null; onClose: () => void; onEdit?: (n: News) => void }) {
  const { isStaff, meta } = useStore();
  if (!news) return <Modal open={false} onClose={onClose} title="" children={null} />;
  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-3xl"
      title={news.title}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-2">
          <CategoryPill c={news.category} />
          {news.date && <span>{fmtDateYear(news.date)}</span>}
          {news.author && <span>· {news.author}</span>}
          {!news.published && <span className="text-critical">· ซ่อนอยู่</span>}
        </span>
      }
      footer={
        <>
          {isStaff && meta?.spreadsheetUrl && news.row && (
            <a className="link mr-auto inline-flex items-center gap-0.5 text-[13px]" href={sheetLink(meta, 'news', news.row) ?? '#'} target="_blank" rel="noreferrer">
              แถวนี้ในชีต <ArrowUpRight className="size-3.5" />
            </a>
          )}
          {isStaff && onEdit && (
            <Button variant="secondary" onClick={() => onEdit(news)}>
              <Pencil className="size-4" strokeWidth={1.8} />
              แก้ไข
            </Button>
          )}
          {news.attachment && (
            <>
              <a href={news.attachment} target="_blank" rel="noreferrer" className="btn-glass inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[14px] font-medium">
                เปิดไฟล์แนบ <ArrowUpRight className="size-4" />
              </a>
              <a href={downloadUrl(news.attachment)} target="_blank" rel="noreferrer" className="btn-ink inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[14px] font-medium">
                <Download className="size-4" /> ดาวน์โหลด
              </a>
            </>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {news.image && <NewsImage n={news} className="max-h-[60vh] w-full rounded-[20px] object-contain bg-fill-soft" />}
        {news.body ? (
          <p className="text-[16px] leading-relaxed whitespace-pre-line text-ink">{news.body}</p>
        ) : (
          !news.image && <p className="text-[14px] text-ink-3">ไม่มีรายละเอียดเพิ่มเติม</p>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* ประกาศ / แก้ไขข่าว                                                   */
/* ------------------------------------------------------------------ */

const blankNews = (id: string): News => ({
  id,
  title: '',
  body: '',
  category: 'ข่าวสาร',
  date: todayKey(),
  image: '',
  attachment: '',
  pinned: false,
  author: '',
  published: true,
  updatedAt: '',
});

function NewsEditor({ value, onClose }: { value: News | 'new' | null; onClose: () => void }) {
  const { data, commit, toast } = useStore();
  const [form, setForm] = useState<News>(blankNews('N001'));
  const [image, setImage] = useState<UploadFile | null>(null);
  const [file, setFile] = useState<(UploadFile & { size: number }) | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value) return;
    setForm(value === 'new' ? blankNews(nextNewsId(data.news)) : value);
    setImage(null);
    setFile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const set = <K extends keyof News>(k: K, v: News[K]) => setForm((f) => ({ ...f, [k]: v }));

  const pickImage = async (f?: File) => {
    if (!f) return;
    try {
      setImage({ name: f.name.replace(/\.[^.]+$/, '') + '.jpg', dataUrl: await resizeImage(f) });
    } catch (e) {
      toast('อ่านไฟล์รูปไม่ได้', 'error', e instanceof Error ? e.message : undefined);
    }
  };

  const pickFile = async (f?: File) => {
    if (!f) return;
    if (f.size > MAX_FILE_MB * 1024 * 1024) return toast(`ไฟล์ใหญ่เกิน ${MAX_FILE_MB} MB`, 'error', 'ลองย่อไฟล์ หรือวางลิงก์ Google Drive แทน');
    try {
      setFile({ name: f.name, dataUrl: await readDataUrl(f), size: f.size });
    } catch {
      toast('อ่านไฟล์ไม่ได้', 'error');
    }
  };

  const save = () => {
    if (!form.title.trim()) return;
    const n: News = { ...form, title: form.title.trim(), body: form.body.trim(), author: form.author.trim() };
    void commit(
      (d) => saveNews(d, n, { image: image ?? undefined, attachment: file ?? undefined }),
      value === 'new' ? (n.published ? 'ประกาศข่าวแล้ว' : 'บันทึกข่าว (ซ่อน) แล้ว') : 'บันทึกการแก้ไขแล้ว',
    );
    onClose();
  };

  const preview = image?.dataUrl ?? imageUrl(form.image);

  return (
    <Modal
      open={!!value}
      onClose={onClose}
      width="max-w-2xl"
      title={value === 'new' ? 'ประกาศข่าว' : 'แก้ไขข่าว'}
      subtitle={`รหัส ${form.id}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button variant="primary" onClick={save} disabled={!form.title.trim()}>
            {value === 'new' && form.published ? 'ประกาศ' : 'บันทึก'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="หัวข้อ *">
          <input className="field" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="เช่น ประชุมประจำเดือน ICU" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="หมวด">
            <select className="field" value={form.category} onChange={(e) => set('category', e.target.value as NewsCategory)}>
              {NEWS_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="วันที่">
            <input type="date" className="field" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
        </div>
        <Field label="รายละเอียด">
          <textarea className="field min-h-36" value={form.body} onChange={(e) => set('body', e.target.value)} placeholder="รายละเอียดข่าว / ประกาศ" />
        </Field>

        <section className="well space-y-3 p-4">
          <p className="text-[13px] font-medium">รูปภาพประกอบ</p>
          {preview && (
            <div className="relative overflow-hidden rounded-[16px]">
              <img src={preview} alt="" className="max-h-56 w-full object-cover" referrerPolicy="no-referrer" />
              <button
                type="button"
                aria-label="นำรูปออก"
                onClick={() => {
                  setImage(null);
                  set('image', '');
                }}
                className="glass absolute top-2 right-2 inline-flex size-9 items-center justify-center rounded-full text-critical"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          )}
          <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pickImage(e.target.files?.[0])} />
          <Button variant="secondary" size="sm" onClick={() => imgRef.current?.click()}>
            <ImagePlus className="size-4" strokeWidth={1.8} />
            {preview ? 'เปลี่ยนรูป' : 'เลือกรูป'}
          </Button>
        </section>

        <section className="well space-y-3 p-4">
          <p className="text-[13px] font-medium">ไฟล์แนบ (PDF / เอกสาร)</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              className="hidden"
              onChange={(e) => void pickFile(e.target.files?.[0])}
            />
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              <Paperclip className="size-4" strokeWidth={1.8} />
              {file ? 'เปลี่ยนไฟล์' : form.attachment ? 'อัปโหลดไฟล์ใหม่' : 'แนบไฟล์'}
            </Button>
            {file && (
              <span className="text-[12px] text-ink-2">
                {file.name} · {fmtSize(file.size)} (อัปโหลดเมื่อกดบันทึก)
              </span>
            )}
          </div>
          <Field label="หรือวางลิงก์ไฟล์">
            <input className="field" value={form.attachment} onChange={(e) => set('attachment', e.target.value)} placeholder="https://drive.google.com/file/d/…" disabled={!!file} />
          </Field>
          <p className="text-[11px] text-ink-3">ไฟล์จะเก็บในโฟลเดอร์ “ICU Smart Center - ไฟล์ข่าวสาร” ใน Google Drive · ไม่เกิน {MAX_FILE_MB} MB</p>
        </section>

        <Field label="ผู้ประกาศ">
          <input className="field" value={form.author} onChange={(e) => set('author', e.target.value)} placeholder="เช่น หัวหน้าหอผู้ป่วย / ทีม IC" />
        </Field>
        <div className="well divide-y divide-line px-4">
          <Switch label="ปักหมุด" hint="แสดงเป็นข่าวเด่นด้านบนและหน้าแรก" checked={form.pinned} onChange={(v) => set('pinned', v)} />
          <Switch label="เผยแพร่" hint="ปิดเพื่อซ่อนข่าวจากผู้เข้าชมทั่วไป" checked={form.published} onChange={(v) => set('published', v)} />
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
