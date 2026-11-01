import { Link2, Minus, Plus, Scan, Star } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { Staff } from '../types';
import { saveStaff } from '../lib/logic';
import { realName } from '../lib/roster';
import { useStore } from '../lib/store';
import { Avatar } from './Avatar';
import { cx } from './ui';

/* ------------------------------------------------------------------ */
/* ผังบริหารงาน: วางตำแหน่งแบบต้นไม้ + เส้นเชื่อม + เลื่อน/ซูม + ลากเพื่อโยงสาย */
/* ------------------------------------------------------------------ */

const W = 184; // ความกว้างการ์ด
const H = 136; // ความสูงการ์ด
const GX = 28; // ระยะห่างแนวนอนระหว่างกลุ่ม
const GY = 64; // ระยะห่างแนวตั้งระหว่างชั้น
const SPINE = 22; // ระยะจากเส้นกลางถึงการ์ด (แบบเรียงซ้อน)
const SG = 18; // ระยะห่างแถวแบบเรียงซ้อน
const PAD = 32;

interface Node {
  s: Staff;
  kids: Node[];
  /** กลางการ์ด (แกน x) และขอบบน (แกน y) */
  x: number;
  y: number;
  w: number;
  h: number;
  stack: boolean;
}

interface Layout {
  nodes: Node[];
  lines: string[];
  width: number;
  height: number;
  loneLabelY: number | null;
}

/** ลูกทีมที่ไม่มีลูกทีมต่อ และมีมากกว่า 3 คน → เรียงซ้อน 2 คอลัมน์รอบเส้นกลาง (ผังไม่กว้างเกินไป) */
const measure = (n: Node): void => {
  if (!n.kids.length) {
    n.w = W;
    n.h = H;
    return;
  }
  n.kids.forEach(measure);
  n.stack = n.kids.length > 3 && n.kids.every((k) => !k.kids.length);
  if (n.stack) {
    const rows = Math.ceil(n.kids.length / 2);
    n.w = 2 * W + 2 * SPINE;
    n.h = H + GY + rows * H + (rows - 1) * SG;
    return;
  }
  const kidsW = n.kids.reduce((a, k) => a + k.w, 0) + GX * (n.kids.length - 1);
  n.w = Math.max(W, kidsW);
  n.h = H + GY + Math.max(...n.kids.map((k) => k.h));
};

const place = (n: Node, left: number, top: number): void => {
  n.x = left + n.w / 2;
  n.y = top;
  if (!n.kids.length) return;
  const childTop = top + H + GY;
  if (n.stack) {
    n.kids.forEach((k, i) => {
      const row = Math.floor(i / 2);
      const side = i % 2 === 0 ? -1 : 1;
      k.x = n.x + side * (SPINE + W / 2);
      k.y = childTop + row * (H + SG);
    });
    return;
  }
  const kidsW = n.kids.reduce((a, k) => a + k.w, 0) + GX * (n.kids.length - 1);
  let cur = left + (n.w - kidsW) / 2;
  n.kids.forEach((k) => {
    place(k, cur, childTop);
    cur += k.w + GX;
  });
};

/** เส้นหักมุมโค้งมน: จากล่างกลางการ์ดหัวหน้า → ลง → ข้าม → ลงถึงบนกลางการ์ดลูกทีม */
const elbow = (x1: number, y1: number, x2: number, y2: number) => {
  const mid = y1 + GY / 2;
  if (Math.abs(x2 - x1) < 1) return `M${x1},${y1}V${y2}`;
  const r = Math.min(12, Math.abs(x2 - x1) / 2, GY / 4);
  const dir = x2 > x1 ? 1 : -1;
  return `M${x1},${y1}V${mid - r}Q${x1},${mid} ${x1 + dir * r},${mid}H${x2 - dir * r}Q${x2},${mid} ${x2},${mid + r}V${y2}`;
};

const collect = (n: Node, nodes: Node[], lines: string[]) => {
  nodes.push(n);
  if (!n.kids.length) return;
  if (n.stack) {
    const last = n.kids[n.kids.length - 1];
    lines.push(`M${n.x},${n.y + H}V${last.y + H / 2}`);
    n.kids.forEach((k) => {
      const edge = k.x < n.x ? k.x + W / 2 : k.x - W / 2;
      lines.push(`M${n.x},${k.y + H / 2}H${edge}`);
    });
  } else {
    n.kids.forEach((k) => lines.push(elbow(n.x, n.y + H, k.x, k.y)));
  }
  n.kids.forEach((k) => collect(k, nodes, lines));
};

const buildLayout = (staff: Staff[]): Layout => {
  const ids = new Set(staff.map((s) => s.id));
  const map = new Map<string, Node>(staff.map((s) => [s.id, { s, kids: [], x: 0, y: 0, w: W, h: H, stack: false }]));
  const roots: Node[] = [];
  staff.forEach((s) => {
    const n = map.get(s.id)!;
    const boss = s.reportsTo && ids.has(s.reportsTo) && s.reportsTo !== s.id ? map.get(s.reportsTo)! : null;
    if (boss) boss.kids.push(n);
    else roots.push(n);
  });
  // กันข้อมูลหัวหน้าวนกัน (A → B → A): คนที่ไม่ถูกวางเลยจะกลายเป็นจุดเริ่มใหม่
  const reached = new Set<string>();
  const walk = (n: Node, path: Set<string>) => {
    reached.add(n.s.id);
    n.kids = n.kids.filter((k) => !path.has(k.s.id));
    n.kids.forEach((k) => walk(k, new Set(path).add(k.s.id)));
  };
  roots.forEach((r) => walk(r, new Set([r.s.id])));
  staff.forEach((s) => {
    if (!reached.has(s.id)) {
      const n = map.get(s.id)!;
      roots.push(n);
      walk(n, new Set([s.id]));
    }
  });

  const trees = roots.filter((r) => r.kids.length);
  const lone = roots.filter((r) => !r.kids.length);
  const nodes: Node[] = [];
  const lines: string[] = [];
  let left = PAD;
  let bottom = PAD;
  trees.forEach((t) => {
    measure(t);
    place(t, left, PAD);
    left += t.w + GX * 2;
    bottom = Math.max(bottom, PAD + t.h);
    collect(t, nodes, lines);
  });
  let width = Math.max(left - GX * 2 + PAD, PAD * 2 + W);
  let loneLabelY: number | null = null;
  if (lone.length) {
    const cols = Math.max(3, Math.min(6, Math.ceil(Math.sqrt(lone.length * 1.6))));
    const gridW = cols * W + (cols - 1) * GX;
    const top = trees.length ? bottom + GY + 28 : PAD + 28;
    loneLabelY = top - 26;
    width = Math.max(width, gridW + PAD * 2);
    const startX = (width - gridW) / 2;
    lone.forEach((n, i) => {
      n.x = startX + (i % cols) * (W + GX) + W / 2;
      n.y = top + Math.floor(i / cols) * (H + SG);
      nodes.push(n);
    });
    bottom = top + Math.ceil(lone.length / cols) * (H + SG) - SG;
  }
  // จัดต้นไม้ให้อยู่กลางเมื่อแถวล่างกว้างกว่า
  const treesW = left - GX * 2 + PAD;
  if (trees.length && width > treesW) {
    const shift = (width - treesW) / 2;
    const loneSet = new Set(lone);
    nodes.forEach((n) => {
      if (!loneSet.has(n)) n.x += shift;
    });
    lines.length = 0;
    trees.forEach((t) => collect(t, [], lines));
  }
  return { nodes, lines, width, height: bottom + PAD, loneLabelY };
};

const isUnder = (staff: Staff[], id: string, maybeBossId: string) => {
  // maybeBossId อยู่ใต้ id หรือไม่ (ถ้าใช่ จะโยงไม่ได้เพราะจะวนกัน)
  const byId = new Map(staff.map((s) => [s.id, s]));
  let cur = byId.get(maybeBossId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    if (cur.id === id) return true;
    seen.add(cur.id);
    cur = cur.reportsTo ? byId.get(cur.reportsTo) : undefined;
  }
  return false;
};

/* ------------------------------------------------------------------ */

interface ViewState {
  x: number;
  y: number;
  k: number;
}
const clampK = (k: number) => Math.min(2, Math.max(0.25, k));

export function OrgChart({ staff, duty, onOpen }: { staff: Staff[]; duty: Map<string, string>; onOpen?: (s: Staff) => void }) {
  const { isStaff, commit, toast } = useStore();
  const layout = useMemo(() => buildLayout(staff), [staff]);
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [arrange, setArrange] = useState(false);
  const [drag, setDrag] = useState<{ id: string; px: number; py: number; over: string | null } | null>(null);
  const gesture = useRef<{
    mode: 'pan' | 'node' | 'pinch';
    startX: number;
    startY: number;
    vx: number;
    vy: number;
    moved: boolean;
    id?: string;
    dist?: number;
    k?: number;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const suppressClick = useRef(false);

  /** overview = ย่อให้เห็นทั้งผัง (ปุ่ม “พอดีจอ”) · ไม่ใช่ = เปิดครั้งแรกด้วยขนาดที่อ่านชื่อได้ */
  const fit = useCallback((overview = false) => {
    const el = box.current;
    if (!el) return;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    if (overview) {
      const k = clampK(Math.min(1, (vw - 24) / layout.width, (vh - 24) / layout.height));
      setView({ k, x: (vw - layout.width * k) / 2, y: (vh - layout.height * k) / 2 });
      return;
    }
    // พอดีความกว้าง (แนวตั้งเลื่อนดูได้) · จอแคบไม่ย่อจนอ่านไม่ออก แต่เริ่มที่หัวหน้าสูงสุดตรงกลาง
    const k = clampK(Math.max(0.7, Math.min(1, (vw - 16) / layout.width)));
    const w = layout.width * k;
    const top = layout.nodes[0];
    const x = w <= vw ? (vw - w) / 2 : Math.min(8, Math.max(vw - w - 8, vw / 2 - (top ? top.x : layout.width / 2) * k));
    setView({ k, x, y: Math.max(8, Math.min(24, (vh - layout.height * k) / 2)) });
  }, [layout]);

  // จัดตำแหน่งครั้งแรกครั้งเดียว — หลังโยงเส้น/ข้อมูลอัปเดต ผังจะไม่กระโดดกลับ
  const fitted = useRef(false);
  useLayoutEffect(() => {
    if (fitted.current || !layout.nodes.length) return;
    fitted.current = true;
    fit();
  }, [fit, layout.nodes.length]);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const el = box.current;
    if (!el) return;
    const v = viewRef.current;
    const px = cx ?? el.clientWidth / 2;
    const py = cy ?? el.clientHeight / 2;
    const k = clampK(v.k * factor);
    setView({ k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k });
  }, []);

  // ซูมด้วยการบีบบนแทร็กแพด / Ctrl + ล้อเมาส์ (เลื่อนปกติยังเลื่อนหน้าเว็บได้)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const capture = (ids: number[]) =>
    ids.forEach((id) => {
      try {
        box.current?.setPointerCapture(id);
      } catch {
        /* ไม่เป็นไร */
      }
    });

  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const targetAt = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-org-id],[data-org-root]');
    if (!el) return null;
    return el.dataset.orgRoot ? '__root__' : (el.dataset.orgId ?? null);
  };

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      capture([...pointers.current.keys()]);
      const [a, b] = [...pointers.current.values()];
      gesture.current = { mode: 'pinch', startX: 0, startY: 0, vx: 0, vy: 0, moved: true, dist: Math.hypot(a.x - b.x, a.y - b.y), k: viewRef.current.k };
      setDrag(null);
      return;
    }
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-org-id]');
    const v = viewRef.current;
    if (arrange && card) {
      gesture.current = { mode: 'node', startX: p.x, startY: p.y, vx: v.x, vy: v.y, moved: false, id: card.dataset.orgId };
    } else {
      gesture.current = { mode: 'pan', startX: p.x, startY: p.y, vx: v.x, vy: v.y, moved: false };
    }
  };

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (g.mode === 'pinch') {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const [a, b] = pts;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const v = viewRef.current;
      const k = clampK((g.k ?? 1) * (d / (g.dist ?? d)));
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      setView({ k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k });
      return;
    }
    const dx = p.x - g.startX;
    const dy = p.y - g.startY;
    if (!g.moved && Math.hypot(dx, dy) < 5) return;
    if (!g.moved) capture([e.pointerId]); // จับเมาส์/นิ้วเมื่อเริ่มลากจริง (แตะเฉย ๆ ยังกดการ์ดได้)
    g.moved = true;
    if (g.mode === 'pan') {
      setView((v) => ({ ...v, x: g.vx + dx, y: g.vy + dy }));
    } else if (g.id) {
      const over = targetAt(e.clientX, e.clientY);
      setDrag({ id: g.id, px: p.x, py: p.y, over: over === g.id ? null : over });
    }
  };

  const endGesture = (e: RPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) {
      // เหลือนิ้วเดียวหลังบีบ → เลื่อนต่อจากตำแหน่งนั้น
      const [p] = [...pointers.current.values()];
      const v = viewRef.current;
      gesture.current = { mode: 'pan', startX: p.x, startY: p.y, vx: v.x, vy: v.y, moved: true };
      return;
    }
    gesture.current = null;
    if (!g) return;
    if (g.moved) suppressClick.current = true;
    if (g.mode === 'node' && g.moved && g.id) {
      const over = targetAt(e.clientX, e.clientY);
      setDrag(null);
      link(g.id, over);
    }
  };

  const link = (id: string, over: string | null) => {
    const s = staff.find((x) => x.id === id);
    if (!s || !over || over === id) return;
    if (over === '__root__') {
      if (!s.reportsTo) return;
      void commit((d) => saveStaff(d, { ...s, reportsTo: '' }), `${realName(s.name)} อยู่บนสุดของผังแล้ว`);
      return;
    }
    const boss = staff.find((x) => x.id === over);
    if (!boss) return;
    if (isUnder(staff, id, over)) {
      toast('โยงสายไม่ได้', 'error', `${realName(boss.name)} อยู่ใต้ ${realName(s.name)} อยู่แล้ว`);
      return;
    }
    if (s.reportsTo === over) return;
    void commit((d) => saveStaff(d, { ...s, reportsTo: over }), `โยง ${realName(s.name)} → ${realName(boss.name)} แล้ว`);
  };

  const byId = useMemo(() => new Map(layout.nodes.map((n) => [n.s.id, n])), [layout.nodes]);
  const dragNode = drag ? byId.get(drag.id) : null;
  const overNode = drag?.over && drag.over !== '__root__' ? byId.get(drag.over) : null;
  const invalid = !!(drag && overNode && isUnder(staff, drag.id, overNode.s.id));
  // พิกัดในผัง (ก่อนซูม) ของปลายเส้นที่กำลังลาก
  const tip = drag ? { x: (drag.px - view.x) / view.k, y: (drag.py - view.y) / view.k } : null;
  const rootIds = new Set(layout.nodes.filter((n) => !n.s.reportsTo || !byId.has(n.s.reportsTo)).map((n) => n.s.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-ink-3">
          {arrange ? 'ลากการ์ดไปวางบนหัวหน้าเพื่อโยงเส้น · วางที่แถบด้านบนเพื่อให้อยู่บนสุดของผัง' : 'ลากเพื่อเลื่อนผัง · บีบนิ้ว หรือ Ctrl + เลื่อนเมาส์ เพื่อซูม'}
        </p>
        {isStaff && (
          <button
            type="button"
            onClick={() => setArrange((a) => !a)}
            aria-pressed={arrange}
            className={cx(
              'inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-colors',
              arrange ? 'btn-ink' : 'btn-glass',
            )}
          >
            <Link2 className="size-4" strokeWidth={1.8} />
            {arrange ? 'เสร็จสิ้นการจัดผัง' : 'จัดผัง / โยงเส้น'}
          </button>
        )}
      </div>

      <div
        ref={box}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        className={cx(
          'card relative h-[68vh] min-h-[420px] touch-none overflow-hidden bg-canvas select-none',
          drag ? 'cursor-grabbing' : arrange ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
        )}
        style={{
          backgroundImage: 'radial-gradient(circle, var(--color-line-strong) 1px, transparent 1.2px)',
          backgroundSize: `${24 * view.k}px ${24 * view.k}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        role="region"
        aria-label="ผังบริหารงาน (ลากเพื่อเลื่อน)"
      >
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ width: layout.width, height: layout.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
        >
          <svg width={layout.width} height={layout.height} className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
            <g fill="none" stroke="var(--color-line-strong)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              {layout.lines.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
            {dragNode && tip && (
              <path
                d={`M${dragNode.x},${dragNode.y + H / 2}L${overNode ? overNode.x : tip.x},${overNode ? overNode.y + H : tip.y}`}
                fill="none"
                stroke={invalid ? 'var(--color-critical)' : 'var(--color-accent)'}
                strokeWidth={2.4}
                strokeDasharray="6 6"
                strokeLinecap="round"
              />
            )}
          </svg>
          {layout.loneLabelY !== null && (
            <p className="absolute right-0 left-0 text-center text-[13px] font-medium text-ink-3" style={{ top: layout.loneLabelY }}>
              ยังไม่ได้โยงสายบังคับบัญชา{isStaff ? ' — กด “จัดผัง / โยงเส้น” แล้วลากไปวางบนหัวหน้า' : ''}
            </p>
          )}
          {layout.nodes.map((n) => (
            <OrgNode
              key={n.s.id}
              s={n.s}
              x={n.x}
              y={n.y}
              duty={duty.get(n.s.id)}
              root={rootIds.has(n.s.id) && n.kids.length > 0}
              state={drag?.id === n.s.id ? 'dragging' : drag?.over === n.s.id ? (invalid ? 'invalid' : 'target') : undefined}
              arrange={arrange}
              onOpen={onOpen && !arrange ? () => onOpen(n.s) : undefined}
            />
          ))}
        </div>

        {drag && (
          <div
            data-org-root
            className={cx(
              'absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-5 py-2.5 text-[13px] font-medium shadow-[var(--shadow-float)] transition-colors',
              drag.over === '__root__' ? 'btn-ink' : 'glass glass-strong text-ink-2',
            )}
          >
            วางที่นี่ = บนสุดของผัง (ไม่มีหัวหน้า)
          </div>
        )}

        <div
          className={cx('glass glass-strong absolute top-3 right-3 flex items-center gap-1 rounded-full p-1 transition-opacity', drag && 'pointer-events-none opacity-0')}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ZoomBtn label="ซูมออก" onClick={() => zoomAt(1 / 1.25)}>
            <Minus className="size-4" />
          </ZoomBtn>
          <span className="num w-11 text-center text-[12px] text-ink-2">{Math.round(view.k * 100)}%</span>
          <ZoomBtn label="ซูมเข้า" onClick={() => zoomAt(1.25)}>
            <Plus className="size-4" />
          </ZoomBtn>
          <ZoomBtn label="พอดีจอ" onClick={() => fit(true)}>
            <Scan className="size-4" />
          </ZoomBtn>
        </div>
      </div>
    </div>
  );
}

function ZoomBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="inline-flex size-8 items-center justify-center rounded-full text-ink-2 hover:bg-fill-soft hover:text-ink">
      {children}
    </button>
  );
}

function OrgNode({
  s,
  x,
  y,
  duty,
  root,
  state,
  arrange,
  onOpen,
}: {
  s: Staff;
  x: number;
  y: number;
  duty?: string;
  root: boolean;
  state?: 'dragging' | 'target' | 'invalid';
  arrange: boolean;
  onOpen?: () => void;
}) {
  const Tag = onOpen ? 'button' : 'div';
  return (
    <Tag
      {...(onOpen ? { type: 'button' as const, onClick: onOpen } : {})}
      data-org-id={s.id}
      className={cx(
        'absolute flex flex-col items-center rounded-[20px] px-3 pt-3 pb-2.5 text-center transition-[box-shadow,opacity,transform] duration-200',
        'bg-[var(--color-surface)] shadow-[0_0_0_1px_var(--card-ring),0_8px_24px_-14px_rgb(0_0_0/0.35)]',
        root && 'shadow-[0_0_0_2px_var(--color-accent),0_10px_30px_-14px_rgb(0_0_0/0.4)]',
        arrange && 'cursor-grab',
        state === 'dragging' && 'opacity-40',
        state === 'target' && 'scale-[1.04] shadow-[0_0_0_3px_var(--color-accent),0_12px_30px_-10px_var(--color-accent)]',
        state === 'invalid' && 'shadow-[0_0_0_3px_var(--color-critical)]',
      )}
      style={{ left: x - W / 2, top: y, width: W, height: H }}
    >
      <Avatar staff={s} size={50} />
      <span className="mt-1.5 line-clamp-2 w-full text-[13px] leading-snug font-semibold text-ink">{s.name}</span>
      <span className="w-full truncate text-[11px] text-ink-3">
        {s.nickname ? `(${s.nickname}) · ` : ''}
        {s.position || s.group}
      </span>
      {duty && (
        <span className="mt-auto inline-flex items-center gap-0.5 text-[10px] text-ink-3">
          {duty.includes('★') && <Star className="size-2.5 fill-warn text-warn" />}
          {duty.replace(' ★', '')}
        </span>
      )}
    </Tag>
  );
}
