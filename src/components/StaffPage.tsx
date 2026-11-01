import { Camera, LayoutList, Network, Search, Star, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Staff, StaffGroup } from '../types';
import { todayKey } from '../lib/date';
import { nextStaffId, saveStaff } from '../lib/logic';
import { joinName, NAME_PREFIXES, parseCode, realName, rosterFor, SHIFT_BY_KEY, splitName, type NameParts } from '../lib/roster';
import { sheetLink } from '../lib/sheetApi';
import { useStore } from '../lib/store';
import { Avatar } from './Avatar';
import { Button, cx, Empty, Modal, Segmented, Switch } from './ui';

export const STAFF_GROUPS: StaffGroup[] = ['แพทย์', 'พยาบาล', 'ผู้ช่วยพยาบาล', 'พนักงานช่วยเหลือคนไข้', 'อื่นๆ'];

type Mode = 'org' | 'list';

/** เวรวันนี้ของแต่ละคน เช่น "เวรเช้า", "หยุด" */
const useTodayDuty = () => {
  const { data } = useStore();
  return useMemo(() => {
    const today = todayKey();
    const day = Number(today.slice(8, 10));
    const map = new Map<string, string>();
    rosterFor(data, today.slice(0, 7)).forEach((l) => {
      if (!l.staff) return;
      const c = parseCode(l.days[day - 1]);
      const text = c.shifts.length
        ? c.shifts.map((k) => SHIFT_BY_KEY[k].label.replace('เวร', '')).join(' + ') + (c.lead ? ' ★' : '')
        : c.off
          ? 'หยุด'
          : c.leave
            ? 'ลา'
            : c.training
              ? 'อบรม'
              : c.other;
      if (text) map.set(l.staff.id, text);
    });
    return map;
  }, [data]);
};

export function StaffPage({ startNew, onStarted }: { startNew?: boolean; onStarted?: () => void }) {
  const { data, meta, isStaff } = useStore();
  const [mode, setMode] = useState<Mode>('org');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<'all' | StaffGroup>('all');
  const [editing, setEditing] = useState<Staff | 'new' | null>(null);
  const duty = useTodayDuty();
  const open = isStaff ? setEditing : undefined;

  useEffect(() => {
    if (!startNew) return;
    if (isStaff) setEditing('new');
    onStarted?.();
  }, [startNew, isStaff, onStarted]);

  const active = data.staff.filter((s) => s.active);
  const counts = STAFF_GROUPS.map((g) => ({ g, n: active.filter((s) => s.group === g).length })).filter((x) => x.n > 0);
  const list = active.filter(
    (s) =>
      (group === 'all' || s.group === group) &&
      (!q || `${s.name} ${s.nickname} ${s.position} ${s.skills.join(' ')}`.toLowerCase().includes(q.toLowerCase())),
  );
  const inactive = isStaff ? data.staff.filter((s) => !s.active) : [];

  return (
    <div className="space-y-10 pt-6 sm:space-y-12 sm:pt-12">
      <section className="animate-rise">
        <p className="eyebrow">บุคลากร</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="display text-[34px] sm:text-[48px]">{mode === 'org' ? 'ผังบริหารงาน ICU' : 'ทีม ICU'}</h1>
            <p className="mt-2 text-[15px] text-ink-2">
              {active.length} คน
              {counts.map((c) => ` · ${c.g} ${c.n}`).join('')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<Mode>
              value={mode}
              onChange={setMode}
              label="รูปแบบการแสดง"
              options={[
                {
                  value: 'org',
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <Network className="size-3.5" /> ผังองค์กร
                    </span>
                  ),
                },
                {
                  value: 'list',
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <LayoutList className="size-3.5" /> รายชื่อ
                    </span>
                  ),
                },
              ]}
            />
            {isStaff && (
              <Button variant="primary" onClick={() => setEditing('new')}>
                <UserPlus className="size-4" strokeWidth={1.8} />
                เพิ่มบุคลากร
              </Button>
            )}
          </div>
        </div>
      </section>

      {active.length === 0 ? (
        <div className="card">
          <Empty title="ยังไม่มีรายชื่อบุคลากร">
            {isStaff ? 'กด “เพิ่มบุคลากร” หรือกรอกในแท็บ Staff ของ Google Sheet' : 'เจ้าหน้าที่จะเพิ่มรายชื่อบุคลากรที่นี่'}
            {meta?.spreadsheetUrl && (
              <>
                {' · '}
                <a className="link" href={sheetLink(meta, 'staff') ?? '#'} target="_blank" rel="noreferrer">
                  เปิดแท็บ Staff
                </a>
              </>
            )}
          </Empty>
        </div>
      ) : mode === 'org' ? (
        <section className="card overflow-x-auto p-6 sm:p-8">
          <OrgChart staff={active} duty={duty} onOpen={open} />
          {isStaff && (
            <p className="mt-6 text-[12px] text-ink-3">ผังสร้างจากช่อง “หัวหน้า (รหัส)” ของแต่ละคน · แตะที่ชื่อเพื่อแก้ไข</p>
          )}
        </section>
      ) : (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative min-w-[220px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
              <input className="field pl-10" placeholder="ค้นหาชื่อ ตำแหน่ง ความเชี่ยวชาญ" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <Segmented<'all' | StaffGroup>
              size="sm"
              value={group}
              onChange={setGroup}
              label="กลุ่มงาน"
              options={[{ value: 'all', label: 'ทั้งหมด' }, ...counts.map((c) => ({ value: c.g, label: c.g }))]}
            />
          </div>
          {list.length === 0 ? (
            <div className="card">
              <Empty title="ไม่พบรายชื่อที่ค้นหา" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {list.map((s) => (
                <PersonCard key={s.id} s={s} duty={duty.get(s.id)} onOpen={open && (() => open(s))} />
              ))}
            </div>
          )}
        </section>
      )}

      {inactive.length > 0 && (
        <section>
          <p className="eyebrow mb-3">ไม่ใช้งาน ({inactive.length})</p>
          <div className="flex flex-wrap gap-2">
            {inactive.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => open?.(s)}
                className="btn-glass inline-flex items-center gap-2 rounded-full py-1 pr-3.5 pl-1 text-[13px] text-ink-2 opacity-70 hover:opacity-100"
              >
                <Avatar staff={s} size={26} />
                {s.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <StaffPanel value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function PersonCard({ s, duty, onOpen }: { s: Staff; duty?: string; onOpen?: () => void }) {
  const Tag = onOpen ? 'button' : 'div';
  return (
    <Tag
      {...(onOpen ? { type: 'button' as const, onClick: onOpen } : {})}
      className={cx(
        'card group flex flex-col items-center p-5 text-center',
        onOpen && 'transition-transform duration-500 ease-[var(--ease-liquid)] hover:-translate-y-1',
      )}
    >
      <Avatar staff={s} size={96} className="shadow-[0_8px_24px_-12px_rgb(20_30_60/0.45)]" />
      <p className="mt-4 w-full truncate text-[15px] font-semibold">{s.name}</p>
      <p className="w-full truncate text-[13px] text-ink-2">
        {s.nickname && <span>{s.nickname} · </span>}
        {s.position || s.group}
      </p>
      {s.skills.length > 0 && (
        <ul className="mt-3 flex flex-wrap justify-center gap-1">
          {s.skills.slice(0, 3).map((k) => (
            <li key={k} className="well rounded-full px-2 py-0.5 text-[10px] text-ink-2">
              {k}
            </li>
          ))}
        </ul>
      )}
      {duty && (
        <p className="mt-auto pt-3 text-[11px] text-ink-3">
          วันนี้: <span className="font-medium text-ink-2">{duty}</span>
        </p>
      )}
    </Tag>
  );
}

/* ------------------------------------------------------------------ */
/* ผังองค์กร: กล่องซ้อนกันตามสายบังคับบัญชา (ใช้ได้ทั้งจอใหญ่และมือถือ) */
/* ------------------------------------------------------------------ */

function OrgChart({ staff, duty, onOpen }: { staff: Staff[]; duty: Map<string, string>; onOpen?: (s: Staff) => void }) {
  const ids = new Set(staff.map((s) => s.id));
  const children = new Map<string, Staff[]>();
  const roots: Staff[] = [];
  staff.forEach((s) => {
    if (s.reportsTo && ids.has(s.reportsTo) && s.reportsTo !== s.id) {
      children.set(s.reportsTo, [...(children.get(s.reportsTo) ?? []), s]);
    } else roots.push(s);
  });
  // สร้างผังแบบเรียกฟังก์ชันตรง ๆ (ไม่เก็บสถานะระหว่าง render) และกันวนซ้ำถ้าข้อมูลหัวหน้าวนกัน
  const renderNode = (s: Staff, depth: number, path: Set<string>): ReactNode => {
    if (path.has(s.id)) return null;
    const next = new Set(path).add(s.id);
    const kids = (children.get(s.id) ?? []).filter((k) => !next.has(k.id));
    const hasKids = (k: Staff) => (children.get(k.id) ?? []).length > 0;
    const leaves = kids.filter((k) => !hasKids(k));
    const branches = kids.filter(hasKids);
    return (
      <div key={s.id} className="flex flex-col items-center">
        <OrgCard s={s} duty={duty.get(s.id)} onOpen={onOpen && (() => onOpen(s))} big={depth === 0} />
        {kids.length > 0 && (
          <>
            <span className="h-6 w-px bg-line-strong" aria-hidden />
            <div className="well flex flex-col items-center gap-4 rounded-[20px] p-2 sm:gap-6 sm:rounded-[24px] sm:p-5">
              {branches.length > 0 && (
                <div className="flex flex-wrap items-start justify-center gap-3 sm:gap-5">{branches.map((k) => renderNode(k, depth + 1, next))}</div>
              )}
              {leaves.length > 0 && (
                <div className="flex max-w-[860px] flex-wrap justify-center gap-2 sm:gap-3">{leaves.map((k) => renderNode(k, depth + 1, next))}</div>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex min-w-fit flex-wrap items-start justify-center gap-8">
      {roots.map((r) => renderNode(r, 0, new Set()))}
    </div>
  );
}

/** การ์ดในผังบริหารงาน: ชื่อ-สกุลจริงเป็นหัวเรื่อง (ชื่อเล่นเป็นรอง) */
function OrgCard({ s, duty, onOpen, big }: { s: Staff; duty?: string; onOpen?: () => void; big?: boolean }) {
  const Tag = onOpen ? 'button' : 'div';
  return (
    <Tag
      {...(onOpen ? { type: 'button' as const, onClick: onOpen } : {})}
      className={cx(
        'glass glass-strong flex flex-col items-center rounded-[22px] text-center',
        onOpen && 'transition-transform duration-300 hover:-translate-y-0.5',
        big ? 'w-[230px] px-4 pt-5 pb-4 sm:w-[260px]' : 'w-[138px] px-2.5 pt-3 pb-2.5 sm:w-[164px] sm:px-3',
      )}
    >
      <Avatar staff={s} size={big ? 92 : 56} className={big ? 'shadow-[0_10px_28px_-12px_rgb(20_30_60/0.5)]' : undefined} />
      <span className={cx('mt-2.5 line-clamp-2 w-full leading-snug font-semibold text-balance', big ? 'text-[16px]' : 'text-[13px]')}>{s.name}</span>
      {s.nickname && <span className={cx('w-full truncate text-ink-3', big ? 'text-[12px]' : 'text-[11px]')}>({s.nickname})</span>}
      <span className={cx('mt-1 line-clamp-2 w-full leading-snug', big ? 'text-[12px] font-medium text-accent' : 'text-[11px] text-ink-2')}>
        {s.position || s.group}
      </span>
      {duty && (
        <span className="mt-1 inline-flex items-center gap-0.5 text-[10px] text-ink-3">
          {duty.includes('★') && <Star className="size-2.5 fill-warn text-warn" />}
          {duty.replace(' ★', '')}
        </span>
      )}
    </Tag>
  );
}

/* ------------------------------------------------------------------ */
/* แก้ไข / เพิ่มบุคลากร                                                  */
/* ------------------------------------------------------------------ */

/** ตัดรูปเป็นสี่เหลี่ยมจัตุรัสตรงกลาง ย่อเหลือ 400×400 แล้วบีบอัดเป็น JPEG */
const toSquareJpeg = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 400;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 400, 400);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('อ่านไฟล์รูปไม่ได้'));
    };
    img.src = url;
  });

const blankStaff = (id: string, order: number): Staff => ({
  id,
  name: '',
  nickname: '',
  position: '',
  group: 'พยาบาล',
  reportsTo: '',
  photo: '',
  skills: [],
  order,
  active: true,
});

function StaffPanel({ value, onClose }: { value: Staff | 'new' | null; onClose: () => void }) {
  const { data, commit, toast } = useStore();
  const [form, setForm] = useState<Staff>(blankStaff('S01', 1));
  const [skills, setSkills] = useState('');
  const [parts, setParts] = useState<NameParts>({ prefix: '', first: '', last: '' });
  const [photo, setPhoto] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  const isNew = value === 'new';

  useEffect(() => {
    if (!value) return;
    const s =
      value === 'new'
        ? blankStaff(nextStaffId(data.staff), Math.max(0, ...data.staff.map((x) => x.order)) + 1)
        : value;
    setForm(s);
    setParts(splitName(s.name));
    setSkills(s.skills.join(', '));
    setPhoto(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const set = <K extends keyof Staff>(k: K, v: Staff[K]) => setForm((f) => ({ ...f, [k]: v }));
  /** แก้คำนำหน้า / ชื่อจริง / นามสกุล → รวมเป็น “ชื่อ-สกุล” ช่องเดียวในชีต */
  const setPart = (k: keyof NameParts, v: string) => {
    const next = { ...parts, [k]: v };
    setParts(next);
    set('name', joinName(next));
  };

  const pick = async (file?: File) => {
    if (!file) return;
    try {
      setPhoto(await toSquareJpeg(file));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'อ่านไฟล์รูปไม่ได้', 'error');
    }
  };

  const save = () => {
    if (!parts.first.trim()) return;
    const s: Staff = {
      ...form,
      name: joinName(parts),
      skills: skills
        .split(/[,،;]/)
        .map((x) => x.trim())
        .filter(Boolean),
    };
    void commit((d) => saveStaff(d, s, photo), `บันทึกข้อมูล ${s.nickname || s.name} แล้ว`);
    onClose();
  };

  const bosses = data.staff.filter((s) => s.active && s.id !== form.id);
  const preview: Staff = { ...form, photo: photo ?? form.photo };

  return (
    <Modal
      open={!!value}
      onClose={onClose}
      title={isNew ? 'เพิ่มบุคลากร' : realName(form.name) || 'บุคลากร'}
      subtitle={isNew ? 'ชื่อและรูปจะแสดงในผังองค์กรและตารางเวร' : `รหัส ${form.id}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button variant="primary" onClick={save} disabled={!parts.first.trim()}>
            บันทึก
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex items-center gap-5">
          <Avatar staff={preview} size={96} />
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <Camera className="size-4" strokeWidth={1.8} />
              {preview.photo ? 'เปลี่ยนรูป' : 'เพิ่มรูป'}
            </Button>
            <p className="text-[12px] text-ink-3">ถ่ายรูปหรือเลือกจากเครื่อง · ระบบตัดเป็นสี่เหลี่ยมให้อัตโนมัติ</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[120px_1fr_1fr]">
          <Field label="คำนำหน้า">
            <input
              className="field"
              list="name-prefixes"
              value={parts.prefix}
              onChange={(e) => setPart('prefix', e.target.value)}
              placeholder="นางสาว"
              autoComplete="honorific-prefix"
            />
            <datalist id="name-prefixes">
              {NAME_PREFIXES.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <Field label="ชื่อจริง *">
            <input
              className="field"
              value={parts.first}
              onChange={(e) => setPart('first', e.target.value)}
              placeholder="เช่น กมลวรรณ"
              autoComplete="given-name"
            />
          </Field>
          <Field label="นามสกุล">
            <input className="field" value={parts.last} onChange={(e) => setPart('last', e.target.value)} placeholder="เช่น ใจดี" autoComplete="family-name" />
          </Field>
        </div>
        {form.name && <p className="-mt-3 text-[12px] text-ink-3">แสดงในผังและตารางเวรเป็น “{form.name}”</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ชื่อเล่น">
            <input className="field" value={form.nickname} onChange={(e) => set('nickname', e.target.value)} />
          </Field>
          <Field label="ตำแหน่ง">
            <input className="field" value={form.position} onChange={(e) => set('position', e.target.value)} placeholder="เช่น พยาบาลวิชาชีพชำนาญการ" />
          </Field>
          <Field label="กลุ่มงาน">
            <select className="field" value={form.group} onChange={(e) => set('group', e.target.value as StaffGroup)}>
              {STAFF_GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="หัวหน้า (ใช้สร้างผังองค์กร)">
            <select className="field" value={form.reportsTo} onChange={(e) => set('reportsTo', e.target.value)}>
              <option value="">— บนสุดของผัง —</option>
              {bosses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nickname ? `${b.nickname} · ` : ''}
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ลำดับการแสดง">
            <input
              type="number"
              className="field"
              value={form.order}
              onChange={(e) => set('order', Number(e.target.value) || 0)}
            />
          </Field>
        </div>
        <Field label="ความเชี่ยวชาญ / ใบรับรอง (คั่นด้วยจุลภาค)">
          <input className="field" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="เช่น ACLS, Infection control, CRRT" />
        </Field>
        <div className="well px-4">
          <Switch
            label="ปฏิบัติงานอยู่"
            hint="ปิดเมื่อย้าย/ลาออก — จะซ่อนจากผังและตารางเวร แต่ข้อมูลเดิมยังอยู่"
            checked={form.active}
            onChange={(v) => set('active', v)}
          />
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
