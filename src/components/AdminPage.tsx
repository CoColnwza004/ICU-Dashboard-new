import {
  Activity,
  BedDouble,
  BookOpen,
  CalendarClock,
  ClipboardList,
  Download,
  Gauge,
  KeyRound,
  LockKeyhole,
  LogOut,
  Megaphone,
  Settings2,
  Sheet as SheetIcon,
  ShieldCheck,
  Stethoscope,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { Intent, View } from '../lib/hooks';
import { sheetLink } from '../lib/sheetApi';
import { useStore } from '../lib/store';
import { IconTile } from './Menu';
import { Button, cx, Modal, PageHero } from './ui';

interface Action {
  title: string;
  desc: string;
  icon: LucideIcon;
  tone: string;
  go?: [View, Intent?];
}

const ACTIONS: { title: string; items: Action[] }[] = [
  {
    title: 'ประกาศ & ข้อมูลประจำวัน',
    items: [
      { title: 'ประกาศข่าว', desc: 'ข่าวสาร ประกาศ กิจกรรม พร้อมรูปและไฟล์แนบ', icon: Megaphone, tone: '#eb6834', go: ['news', 'new'] },
      { title: 'รับผู้ป่วย / จัดการเตียง', desc: 'รับใหม่ ย้ายเตียง จำหน่าย ทำความสะอาด', icon: BedDouble, tone: '#2a78d6', go: ['overview', 'admit'] },
      { title: 'บันทึก 12 ตัวชี้วัดรายวัน', desc: 'ยอดผู้ป่วยและอุปกรณ์ของวันนี้', icon: Activity, tone: '#2a78d6', go: ['indicators', 'entry'] },
      { title: 'จัดตารางเวร', desc: 'ลงเวรรายเดือน', icon: CalendarClock, tone: '#1baf7a', go: ['roster', 'entry'] },
    ],
  },
  {
    title: 'คุณภาพ & สถิติ',
    items: [
      { title: 'กรอกผล Quality KPI', desc: 'ตัวตั้ง / ตัวหาร รายเดือน', icon: Target, tone: '#e34948', go: ['kpi', 'entry'] },
      { title: 'กรอกสถิติเตียง', desc: 'ADC ALOS BOR BTR TOI', icon: Gauge, tone: '#008300', go: ['stats'] },
    ],
  },
  {
    title: 'เอกสาร & แบบฟอร์ม',
    items: [
      { title: 'เพิ่มคู่มือ / SOP', desc: 'อัปโหลด PDF หรือพิมพ์ขั้นตอน', icon: BookOpen, tone: '#008300', go: ['docs', 'new'] },
      { title: 'แนบแนวทางการรักษา', desc: 'CPG ของหน่วยงาน', icon: Stethoscope, tone: '#e87ba4', go: ['guidelines', 'new'] },
      { title: 'แนบไฟล์ดาวน์โหลด', desc: 'PDF แบบฟอร์มและเอกสารทั่วไป', icon: Download, tone: '#eda100', go: ['downloads', 'new'] },
      { title: 'เพิ่มลิงก์ Google Forms', desc: 'แบบประเมิน รายงาน ลงทะเบียน', icon: ClipboardList, tone: '#0071e3', go: ['forms', 'new'] },
      { title: 'จัดการบุคลากร', desc: 'ชื่อ ตำแหน่ง รูป ผังบริหารงาน', icon: Users, tone: '#6250d6', go: ['staff', 'new'] },
    ],
  },
];

export function AdminPage({ onGo, onSettings }: { onGo: (v: View, intent?: Intent) => void; onSettings: () => void }) {
  const { isStaff, logout, meta } = useStore();
  const [changing, setChanging] = useState(false);
  if (!isStaff) return <LoginCard />;
  const link = sheetLink(meta);
  return (
    <div className="space-y-10">
      <PageHero
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-4" /> เข้าสู่ระบบเจ้าหน้าที่แล้ว
          </span>
        }
        tone="var(--color-good)"
        title="เจ้าหน้าที่ ICU"
        subtitle="เลือกงานที่ต้องการ — ทุกการแก้ไขบันทึกลง Google Sheet ทันที"
        actions={
          <>
          {link && (
            <a href={link} target="_blank" rel="noreferrer" className="btn-glass inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium">
              <SheetIcon className="size-4" strokeWidth={1.7} /> Google Sheet
            </a>
          )}
          <Button variant="secondary" onClick={onSettings}>
            <Settings2 className="size-4" strokeWidth={1.7} /> การเชื่อมต่อ
          </Button>
          <Button variant="secondary" onClick={() => setChanging(true)}>
            <KeyRound className="size-4" strokeWidth={1.7} /> เปลี่ยนรหัส
          </Button>
          <Button variant="danger" onClick={logout}>
            <LogOut className="size-4" strokeWidth={1.8} /> ออกจากระบบ
          </Button>
          </>
        }
      />

      {ACTIONS.map((g) => (
        <section key={g.title}>
          <p className="eyebrow mb-3">{g.title}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {g.items.map((a) => (
              <button
                key={a.title}
                type="button"
                onClick={() => a.go && onGo(a.go[0], a.go[1])}
                className="card menu-card flex min-h-[140px] flex-col p-4 text-left sm:p-5"
              >
                <IconTile icon={a.icon} tone={a.tone} />
                <span className="mt-auto block pt-4">
                  <span className="block text-[15px] leading-snug font-semibold">{a.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-ink-3">{a.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      <p className="text-[12px] text-ink-3">
        ปิดหน้าเว็บหรือกด “ออกจากระบบ” เมื่อใช้เครื่องส่วนกลาง · ผู้เข้าชมทั่วไปดูข้อมูลได้อย่างเดียว ไม่สามารถแก้ไขได้
      </p>

      <ChangePin open={changing} onClose={() => setChanging(false)} />
    </div>
  );
}

function LoginCard() {
  const { login, pinSet, config } = useStore();
  const [pin, setPin] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pin.trim() || busy) return;
    setBusy(true);
    const ok = await login(pin, remember);
    setBusy(false);
    if (!ok) {
      setPin('');
      setShake((n) => n + 1);
    }
  };

  return (
    <div className="flex min-h-[70dvh] items-center justify-center pt-8">
      <form onSubmit={submit} key={shake} className={cx('card w-full max-w-[400px] p-7 text-center sm:p-9', shake > 0 ? 'animate-shake' : 'animate-rise')}>
        <span className="mx-auto inline-flex">
          <IconTile icon={LockKeyhole} tone="#0071e3" size="lg" />
        </span>
        <h1 className="display mt-5 text-[26px]">เจ้าหน้าที่ ICU</h1>
        <p className="mt-1.5 text-[14px] text-ink-2">ใส่รหัสเจ้าหน้าที่เพื่อแก้ไขข้อมูล ประกาศข่าว และแนบไฟล์</p>
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          aria-label="รหัสเจ้าหน้าที่"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="รหัสเจ้าหน้าที่"
          className="field num mt-6 h-14 text-center text-[22px] tracking-[0.3em] placeholder:text-[15px] placeholder:tracking-normal"
        />
        <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
          จำไว้ในเครื่องนี้ 12 ชั่วโมง (เครื่องส่วนตัวเท่านั้น)
        </label>
        <Button type="submit" variant="primary" size="lg" className="mt-6 w-full" disabled={!pin.trim() || busy}>
          {busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}
        </Button>
        {pinSet === false && (
          <p className="mt-5 rounded-2xl bg-warn/20 px-4 py-3 text-left text-[12px] leading-relaxed text-[#8a5c00] dark:text-warn">
            ยังไม่ได้ตั้งรหัสเจ้าหน้าที่ — เจ้าของชีตเปิด Google Sheet แล้วเลือกเมนู <b>ICU Smart Center › ตั้ง / เปลี่ยนรหัสเจ้าหน้าที่</b>
          </p>
        )}
        {!config.url && <p className="mt-5 text-[12px] text-ink-3">โหมดทดลองในเครื่อง: ใส่รหัสใดก็ได้</p>}
        <p className="mt-6 text-[12px] text-ink-3">ผู้เข้าชมทั่วไปดูข้อมูลทุกหน้าได้โดยไม่ต้องใช้รหัส</p>
      </form>
    </div>
  );
}

function ChangePin({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { changePin } = useStore();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const short = a.trim().length > 0 && a.trim().length < 6;
  const mismatch = b.length > 0 && a !== b;
  const valid = a.trim().length >= 6 && a === b;
  const close = () => {
    setA('');
    setB('');
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="เปลี่ยนรหัสเจ้าหน้าที่"
      subtitle="รหัสใหม่ใช้กับทุกเครื่องทันที — แจ้งเจ้าหน้าที่คนอื่นด้วย"
      width="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={async () => {
              if (await changePin(a)) close();
            }}
          >
            เปลี่ยนรหัส
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <input type="password" autoComplete="new-password" className="field" placeholder="รหัสใหม่ (อย่างน้อย 6 ตัว)" value={a} onChange={(e) => setA(e.target.value)} />
        <input type="password" autoComplete="new-password" className="field" placeholder="ยืนยันรหัสใหม่" value={b} onChange={(e) => setB(e.target.value)} />
        {short && <p className="text-[12px] text-critical">รหัสต้องมีอย่างน้อย 6 ตัว</p>}
        {mismatch && <p className="text-[12px] text-critical">รหัสทั้งสองช่องไม่ตรงกัน</p>}
      </div>
    </Modal>
  );
}
