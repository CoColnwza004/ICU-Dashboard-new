import { Plus, Star, Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Staff } from '../types';
import { todayKey } from '../lib/date';
import { activeBoss } from '../lib/logic';
import { parseCode, rosterFor, SHIFT_BY_KEY } from '../lib/roster';
import { useStore } from '../lib/store';
import { Avatar } from './Avatar';
import { cx } from './ui';

/* ------------------------------------------------------------------ */
/* ผังบริหารงานแบบลำดับขั้น (Hierarchical) — หัวหน้าบนสุด แตกกิ่งลงมาเป็นชั้น  */
/* ย่อให้พอดีความกว้างจออัตโนมัติ (ไม่ต้องลาก/ซูม)                           */
/* ------------------------------------------------------------------ */

/** เวรวันนี้ของแต่ละคน เช่น "เวรเช้า", "หยุด" */
export const useTodayDuty = () => {
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

/** บุคลากรที่ปฏิบัติงาน · หัวหน้าที่ปิด “ไม่ใช้งาน” → ขึ้นกับหัวหน้าคนถัดไปแทน */
export const useActiveStaff = () => {
  const { data } = useStore();
  return useMemo(
    () => data.staff.filter((s) => s.active).map((s) => ({ ...s, reportsTo: activeBoss(data.staff, s) })),
    [data.staff],
  );
};

interface Node {
  s: Staff;
  kids: Node[];
}

/** สร้างต้นไม้จากช่อง “หัวหน้า” · กันข้อมูลวนกัน (A → B → A) */
const buildTree = (staff: Staff[]) => {
  const ids = new Set(staff.map((s) => s.id));
  const map = new Map<string, Node>(staff.map((s) => [s.id, { s, kids: [] }]));
  const roots: Node[] = [];
  staff.forEach((s) => {
    const boss = s.reportsTo && s.reportsTo !== s.id && ids.has(s.reportsTo) ? map.get(s.reportsTo)! : null;
    if (boss) boss.kids.push(map.get(s.id)!);
    else roots.push(map.get(s.id)!);
  });
  const placed = new Set<string>();
  const prune = (n: Node, path: Set<string>) => {
    placed.add(n.s.id);
    n.kids = n.kids.filter((k) => !path.has(k.s.id));
    n.kids.forEach((k) => prune(k, new Set(path).add(k.s.id)));
  };
  roots.forEach((r) => prune(r, new Set([r.s.id])));
  staff.forEach((s) => {
    if (!placed.has(s.id)) {
      const n = map.get(s.id)!;
      roots.push(n);
      prune(n, new Set([s.id]));
    }
  });
  return { trees: roots.filter((r) => r.kids.length), lone: roots.filter((r) => !r.kids.length) };
};

/** สีวงแหวนตามชั้น: บนสุด แดงส้ม · ชั้นสอง เหลืองทอง · ชั้นถัดไป ฟ้าอมเขียว */
const RING = ['#ff6b3d', '#f5b400', '#1f9fbf', '#5e8cff'];
const ringOf = (level: number) => RING[Math.min(level, RING.length - 1)];
const SIZE = [88, 72, 62, 56];
const sizeOf = (level: number) => SIZE[Math.min(level, SIZE.length - 1)];

export interface OrgActions {
  onOpen?: (s: Staff) => void;
  onAdd?: (boss: Staff) => void;
  onDelete?: (s: Staff) => void;
}

export function OrgChart({
  staff,
  duty,
  compact,
  ...act
}: { staff: Staff[]; duty: Map<string, string>; compact?: boolean } & OrgActions) {
  const { trees, lone } = buildTree(staff);
  const narrow = useNarrow();

  return (
    <div className="space-y-12">
      {trees.map((t) =>
        narrow ? (
          <MobileTree key={t.s.id} n={t} duty={duty} act={act} />
        ) : (
          <FitWidth key={t.s.id}>
            <ul className="org-tree">
              <Branch n={t} level={0} duty={duty} act={act} />
            </ul>
          </FitWidth>
        ),
      )}

      {lone.length > 0 && !compact && (
        <section>
          <p className="mb-4 text-center text-[13px] font-medium text-ink-3">
            {trees.length ? 'ยังไม่ได้ระบุหัวหน้า' : 'บุคลากรทั้งหมด'} · {lone.length} คน
          </p>
          <div className="flex flex-wrap justify-center gap-x-2 gap-y-6">
            {lone.map((n) => (
              <Person key={n.s.id} s={n.s} level={3} duty={duty.get(n.s.id)} act={act} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** จอแคบ (มือถือ): หัวหน้าบนสุด → การ์ดแต่ละสาย · ลูกทีมเรียงลงพร้อมเส้นเชื่อม */
const useNarrow = () => {
  const q = '(max-width: 639px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
};

function MobileTree({ n, duty, act }: { n: Node; duty: Map<string, string>; act: OrgActions }) {
  return (
    <div className="flex flex-col items-center">
      <Person s={n.s} level={0} duty={duty.get(n.s.id)} act={act} />
      <span aria-hidden className="h-6 w-px bg-line-strong" />
      <div className="w-full space-y-3">
        {n.kids.map((k) => (
          <div key={k.s.id} className="card p-2">
            <Row s={k.s} level={1} duty={duty.get(k.s.id)} act={act} />
            {k.kids.length > 0 && <MobileList nodes={k.kids} level={2} duty={duty} act={act} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileList({ nodes, level, duty, act }: { nodes: Node[]; level: number; duty: Map<string, string>; act: OrgActions }) {
  return (
    <ul className="mt-1 ml-[31px] space-y-0.5 border-l-[1.5px] border-line-strong pl-2.5">
      {nodes.map((k) => (
        <li key={k.s.id} className="relative">
          <span aria-hidden className="absolute top-[27px] -left-2.5 h-[1.5px] w-2.5 bg-line-strong" />
          <Row s={k.s} level={level} duty={duty.get(k.s.id)} act={act} />
          {k.kids.length > 0 && <MobileList nodes={k.kids} level={level + 1} duty={duty} act={act} />}
        </li>
      ))}
    </ul>
  );
}

/** 1 คน + ลูกทีมด้านล่าง (เส้นเชื่อมวาดด้วย CSS ใน .org-tree) */
function Branch({ n, level, duty, act }: { n: Node; level: number; duty: Map<string, string>; act: OrgActions }) {
  // ลูกทีมที่ไม่มีลูกทีมต่อ และมีหลายคน → เรียงลงเป็นแถวแนวตั้ง ผังจะได้ไม่กว้างเกินจอ
  const stack = n.kids.length >= 3 && n.kids.every((k) => !k.kids.length);
  return (
    <li>
      <Person s={n.s} level={level} duty={duty.get(n.s.id)} act={act} />
      {n.kids.length > 0 &&
        (stack ? (
          <div className="org-stack">
            <div className="card w-[248px] p-1.5">
              {n.kids.map((k) => (
                <Row key={k.s.id} s={k.s} level={level + 1} duty={duty.get(k.s.id)} act={act} />
              ))}
            </div>
          </div>
        ) : (
          <ul>
            {n.kids.map((k) => (
              <Branch key={k.s.id} n={k} level={level + 1} duty={duty} act={act} />
            ))}
          </ul>
        ))}
    </li>
  );
}

function DutyTag({ duty }: { duty?: string }) {
  if (!duty) return null;
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-fill-soft px-2 py-0.5 text-[11px] whitespace-nowrap text-ink-2">
      {duty.includes('★') && <Star className="size-3 fill-warn text-warn" />}
      {duty.replace(' ★', '')}
    </span>
  );
}

/** ปุ่มเล็กสำหรับเจ้าหน้าที่: เพิ่มลูกทีม / ลบ */
function Tools({ s, act, className }: { s: Staff; act: OrgActions; className?: string }) {
  if (!act.onAdd && !act.onDelete) return null;
  return (
    <span className={cx('flex items-center justify-center gap-1', className)}>
      {act.onAdd && (
        <IconBtn label={`เพิ่มลูกทีมใต้ ${s.name}`} onClick={() => act.onAdd!(s)}>
          <Plus className="size-3.5" strokeWidth={2.2} />
        </IconBtn>
      )}
      {act.onDelete && (
        <IconBtn label={`ลบ ${s.name}`} danger onClick={() => act.onDelete!(s)}>
          <Trash2 className="size-3.5" strokeWidth={1.9} />
        </IconBtn>
      )}
    </span>
  );
}

function IconBtn({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cx(
        'inline-flex size-7 items-center justify-center rounded-full bg-fill-soft text-ink-2 transition-colors',
        danger ? 'hover:bg-critical/15 hover:text-critical' : 'hover:bg-accent/15 hover:text-accent',
      )}
    >
      {children}
    </button>
  );
}

/** กล่องคนในผัง: ตำแหน่งด้านบน · รูปวงกลม · ชื่อ-สกุล */
function Person({ s, level, duty, act }: { s: Staff; level: number; duty?: string; act: OrgActions }) {
  const size = sizeOf(level);
  const body = (
    <>
      <span className="org-role">{s.position || s.group}</span>
      <span className="org-ring" style={{ '--ring': ringOf(level) } as React.CSSProperties}>
        <Avatar staff={s} size={size} />
      </span>
      <span className="mt-2 block text-[13px] leading-snug font-semibold text-ink">{s.name}</span>
      {s.nickname && <span className="block text-[12px] text-ink-3">({s.nickname})</span>}
      {duty && (
        <span className="mt-1 block">
          <DutyTag duty={duty} />
        </span>
      )}
    </>
  );
  return (
    <div className="org-node">
      {act.onOpen ? (
        <button type="button" onClick={() => act.onOpen!(s)} className="org-hit" aria-label={`แก้ไข ${s.name}`}>
          {body}
        </button>
      ) : (
        <div className="org-hit">{body}</div>
      )}
      <Tools s={s} act={act} className="mt-1.5" />
    </div>
  );
}

/** แถวลูกทีม (กรณีเรียงแนวตั้ง) */
function Row({ s, level, duty, act }: { s: Staff; level: number; duty?: string; act: OrgActions }) {
  const inner = (
    <>
      <span className="org-ring shrink-0" style={{ '--ring': ringOf(level), '--ring-w': '2px' } as React.CSSProperties}>
        <Avatar staff={s} size={38} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[13px] leading-snug font-medium text-ink">
          {s.name}
          {s.nickname && <span className="font-normal text-ink-3"> ({s.nickname})</span>}
        </span>
        <span className="block truncate text-[11px] text-ink-3">{s.position || s.group}</span>
      </span>
      <DutyTag duty={duty} />
    </>
  );
  return (
    <div className="flex items-center gap-1 rounded-[14px] transition-colors hover:bg-fill-soft">
      {act.onOpen ? (
        <button type="button" onClick={() => act.onOpen!(s)} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5" aria-label={`แก้ไข ${s.name}`}>
          {inner}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5">{inner}</div>
      )}
      <Tools s={s} act={act} className="pr-1.5" />
    </div>
  );
}

/** ย่อเนื้อหาให้พอดีความกว้าง (ไม่ขยายเกิน 100%) · ถ้าต้องย่อเล็กกว่า min ให้เลื่อนแนวนอนแทน */
function FitWidth({ children, min = 0.6 }: { children: ReactNode; min?: number }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ k: 1, w: 0, h: 0 });
  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const fit = () => {
      const w = i.offsetWidth;
      const h = i.offsetHeight;
      const k = Math.max(min, Math.min(1, o.clientWidth / Math.max(1, w)));
      setBox((b) => (b.k === k && b.w === w && b.h === h ? b : { k, w, h }));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [min]);
  return (
    <div ref={outer} className="overflow-x-auto overflow-y-hidden pb-1">
      <div className="relative mx-auto" style={{ width: box.w * box.k || undefined, height: box.h * box.k || undefined }}>
        <div ref={inner} className="absolute top-0 left-0 w-max" style={{ transform: `scale(${box.k})`, transformOrigin: 'top left' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
