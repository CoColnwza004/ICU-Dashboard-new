import { Star } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Staff } from '../types';
import { firstName } from '../lib/roster';
import { Avatar } from './Avatar';
import { cx } from './ui';

/* ------------------------------------------------------------------ */
/* ผังบริหารงานแบบเรียบง่าย: หัวหน้าด้านบน → ทีมละคอลัมน์ (ไม่ต้องเลื่อน/ซูม)  */
/* ------------------------------------------------------------------ */

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
  const size = (n: Node): number => n.kids.reduce((a, k) => a + 1 + size(k), 0);
  return { trees: roots.filter((r) => r.kids.length), lone: roots.filter((r) => !r.kids.length), size };
};

export function OrgChart({ staff, duty, onOpen }: { staff: Staff[]; duty: Map<string, string>; onOpen?: (s: Staff) => void }) {
  const { trees, lone, size } = buildTree(staff);

  return (
    <div className="space-y-12">
      {trees.map((t) => {
        const teams = t.kids.filter((k) => k.kids.length);
        const direct = t.kids.filter((k) => !k.kids.length);
        return (
          <section key={t.s.id} className="flex flex-col items-center">
            <LeaderCard s={t.s} duty={duty.get(t.s.id)} onOpen={onOpen} count={size(t)} />
            <span aria-hidden className="h-8 w-px bg-line-strong" />
            <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {teams.map((k) => (
                <TeamColumn key={k.s.id} head={k} duty={duty} onOpen={onOpen} size={size(k)} />
              ))}
              {direct.length > 0 && (
                <div className="card p-4">
                  <p className="text-[13px] font-semibold text-ink-2">ขึ้นตรงกับ{firstName(t.s.name) ? ` ${firstName(t.s.name)}` : 'หัวหน้า'}</p>
                  <p className="text-[12px] text-ink-3">{direct.length} คน</p>
                  <Members nodes={direct} duty={duty} onOpen={onOpen} />
                </div>
              )}
            </div>
          </section>
        );
      })}

      {lone.length > 0 && (
        <section>
          <p className="mb-3 text-center text-[13px] font-medium text-ink-3">
            {trees.length ? 'ยังไม่ได้ระบุหัวหน้า' : 'บุคลากรทั้งหมด'} · {lone.length} คน
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lone.map((n) => (
              <Row key={n.s.id} s={n.s} duty={duty.get(n.s.id)} onOpen={onOpen} boxed />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Clickable({ s, onOpen, className, children }: { s: Staff; onOpen?: (s: Staff) => void; className?: string; children: ReactNode }) {
  if (!onOpen) return <div className={className}>{children}</div>;
  return (
    <button type="button" onClick={() => onOpen(s)} className={cx('text-left transition-colors hover:bg-fill-soft', className)}>
      {children}
    </button>
  );
}

function DutyTag({ duty }: { duty?: string }) {
  if (!duty) return null;
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-fill-soft px-2 py-0.5 text-[11px] text-ink-2">
      {duty.includes('★') && <Star className="size-3 fill-warn text-warn" />}
      {duty.replace(' ★', '')}
    </span>
  );
}

/** หัวหน้าสูงสุด */
function LeaderCard({ s, duty, onOpen, count }: { s: Staff; duty?: string; onOpen?: (s: Staff) => void; count: number }) {
  return (
    <Clickable s={s} onOpen={onOpen} className="card flex w-full max-w-[360px] flex-col items-center rounded-[24px] px-6 py-6 text-center">
      <Avatar staff={s} size={84} className="shadow-[0_10px_28px_-14px_rgb(0_0_0/0.45)]" />
      <p className="mt-3 text-[19px] leading-snug font-semibold">{s.name}</p>
      <p className="text-[13px] text-ink-3">{s.nickname ? `(${s.nickname})` : ''}</p>
      <p className="mt-1 text-[14px] font-medium text-accent">{s.position || s.group}</p>
      <p className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-[12px] text-ink-3">
        ทีมทั้งหมด {count} คน
        <DutyTag duty={duty} />
      </p>
    </Clickable>
  );
}

/** หัวหน้าทีม + สมาชิกเรียงลงมา มีเส้นเชื่อมด้านซ้าย */
function TeamColumn({ head, duty, onOpen, size }: { head: Node; duty: Map<string, string>; onOpen?: (s: Staff) => void; size: number }) {
  return (
    <div className="card p-4">
      <Clickable s={head.s} onOpen={onOpen} className="-m-1.5 flex items-center gap-3 rounded-[16px] p-1.5">
        <Avatar staff={head.s} size={52} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] leading-snug font-semibold">{head.s.name}</span>
          <span className="block truncate text-[12px] text-ink-3">
            {head.s.nickname ? `(${head.s.nickname}) · ` : ''}
            {head.s.position || head.s.group}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
            ทีม {size} คน
            <DutyTag duty={duty.get(head.s.id)} />
          </span>
        </span>
      </Clickable>
      <Members nodes={head.kids} duty={duty} onOpen={onOpen} />
    </div>
  );
}

/** รายชื่อสมาชิก (ซ้อนลงไปได้หลายชั้น) */
function Members({ nodes, duty, onOpen }: { nodes: Node[]; duty: Map<string, string>; onOpen?: (s: Staff) => void }) {
  return (
    <ul className="mt-3 ml-[26px] space-y-1 border-l border-line-strong pl-3">
      {nodes.map((n) => (
        <li key={n.s.id} className="relative">
          <span aria-hidden className="absolute top-[22px] -left-3 h-px w-3 bg-line-strong" />
          <Row s={n.s} duty={duty.get(n.s.id)} onOpen={onOpen} />
          {n.kids.length > 0 && <Members nodes={n.kids} duty={duty} onOpen={onOpen} />}
        </li>
      ))}
    </ul>
  );
}

function Row({ s, duty, onOpen, boxed }: { s: Staff; duty?: string; onOpen?: (s: Staff) => void; boxed?: boolean }) {
  return (
    <Clickable s={s} onOpen={onOpen} className={cx('flex w-full items-center gap-3 rounded-[14px] px-2 py-1.5', boxed && 'card px-3 py-2.5')}>
      <Avatar staff={s} size={boxed ? 40 : 36} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] leading-snug font-medium" title={s.name}>
          {s.name}
          {s.nickname && <span className="font-normal text-ink-3"> ({s.nickname})</span>}
        </span>
        <span className="block truncate text-[12px] text-ink-3">{s.position || s.group}</span>
      </span>
      <DutyTag duty={duty} />
    </Clickable>
  );
}
