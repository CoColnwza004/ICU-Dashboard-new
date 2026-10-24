import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { Acuity, Bed, Gender, OutEvent } from '../types';
import { ACUITIES, ACUITY_META, AGE_GROUPS, DEVICES } from '../lib/constants';
import { fmtDateTime, toLocalDateTime } from '../lib/date';
import { admitPatient, dischargePatient, emptyPatient, movePatient, updateBed, type PatientInput } from '../lib/logic';
import { useStore } from '../lib/store';
import { Button, cx, Dot, Modal, Segmented, Switch } from './ui';

type Mode = 'admit' | 'edit';
type Pane = 'form' | 'out' | 'move';

const OUT_OPTIONS: { value: OutEvent; label: string }[] = [
  { value: 'home', label: 'กลับบ้าน' },
  { value: 'ward', label: 'ย้ายวอร์ด' },
  { value: 'refer', label: 'Refer' },
  { value: 'expired', label: 'เสียชีวิต' },
];

const nextCaseCode = (beds: Bed[], bedNumber: string) => {
  const d = new Date();
  const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const n = beds.findIndex((b) => b.bedNumber === bedNumber) + 1;
  return `CASE-${stamp}-${String(n || 1).padStart(2, '0')}`;
};

const toForm = (bed: Bed | null): PatientInput => {
  const base = emptyPatient();
  if (!bed) return base;
  const { caseCode, acuity, ageGroup, gender, clinicalGoals, admittedAt } = bed;
  return {
    ...base,
    caseCode,
    acuity,
    ageGroup,
    gender,
    clinicalGoals,
    admittedAt,
    ...Object.fromEntries(DEVICES.map((d) => [d.key, bed[d.key]])),
  };
};

export function BedPanel({ bedNumber, onClose }: { bedNumber: string | null; onClose: () => void }) {
  const { data, commit } = useStore();
  const bed = data.beds.find((b) => b.bedNumber === bedNumber) ?? null;
  const mode: Mode = bed?.status === 'occupied' ? 'edit' : 'admit';
  const freeBeds = useMemo(() => data.beds.filter((b) => b.status !== 'occupied'), [data.beds]);

  const [target, setTarget] = useState('');
  const [form, setForm] = useState<PatientInput>(emptyPatient());
  const [pane, setPane] = useState<Pane>('form');
  const [moveTo, setMoveTo] = useState('');
  const [moveNote, setMoveNote] = useState('');
  const [outEvent, setOutEvent] = useState<OutEvent>('home');
  const [outNote, setOutNote] = useState('');

  // รีเซ็ตฟอร์มเมื่อเปิดเตียงใหม่เท่านั้น (ไม่รีเซ็ตทุกครั้งที่ข้อมูลจากชีตรีเฟรช)
  useEffect(() => {
    if (!bedNumber) return;
    const b = data.beds.find((x) => x.bedNumber === bedNumber) ?? null;
    setTarget(bedNumber);
    setPane('form');
    setMoveTo('');
    setMoveNote('');
    setOutEvent('home');
    setOutNote('');
    if (b?.status === 'occupied') setForm(toForm(b));
    else setForm({ ...emptyPatient(), acuity: 'Critical', caseCode: nextCaseCode(data.beds, bedNumber) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bedNumber]);

  const set = <K extends keyof PatientInput>(k: K, v: PatientInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!target) return;
    if (mode === 'admit') {
      void commit((d) => admitPatient(d, target, form), `รับผู้ป่วยเข้า ${target} แล้ว`);
    } else {
      void commit((d) => updateBed(d, target, form), `บันทึก ${target} แล้ว`);
    }
    onClose();
  };

  const discharge = () => {
    const label = OUT_OPTIONS.find((o) => o.value === outEvent)?.label;
    void commit((d) => dischargePatient(d, target, outEvent, outNote), `${target} · ${label} แล้ว`);
    onClose();
  };

  const move = () => {
    if (!moveTo) return;
    void commit((d) => movePatient(d, target, moveTo, moveNote), `ย้ายผู้ป่วย ${target} → ${moveTo} แล้ว`);
    onClose();
  };

  const open = !!bedNumber;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'admit' ? 'รับผู้ป่วยใหม่' : `เตียง ${target}`}
      subtitle={
        mode === 'admit'
          ? 'ข้อมูลแบบไม่ระบุตัวตน — ไม่ต้องกรอกชื่อหรือ HN'
          : `รับเข้า ${fmtDateTime(bed?.admittedAt ?? '')} · ${bed?.caseCode || 'ไม่ระบุรหัสเคส'}`
      }
      footer={
        pane !== 'form' ? null : (
          <>
            {mode === 'edit' && (
              <div className="mr-auto flex flex-wrap gap-2">
                <Button variant="danger" onClick={() => setPane('out')}>
                  จำหน่าย
                </Button>
                <Button variant="secondary" onClick={() => setPane('move')} disabled={freeBeds.length === 0}>
                  <ArrowLeftRight className="size-4" strokeWidth={1.8} />
                  ย้ายเตียง
                </Button>
              </div>
            )}
            <Button variant="ghost" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button variant="primary" onClick={submit} disabled={!target}>
              {mode === 'admit' ? 'รับเข้าเตียง' : 'บันทึก'}
            </Button>
          </>
        )
      }
    >
      {pane === 'move' ? (
        <div className="animate-rise space-y-5 pb-2">
          <p className="text-[15px] text-ink-2">
            ย้ายผู้ป่วย <span className="font-medium text-ink">{bed?.caseCode || 'ไม่ระบุรหัสเคส'}</span> จากเตียง {target} ไปที่
            <br />
            <span className="text-[13px] text-ink-3">
              ข้อมูลผู้ป่วย อุปกรณ์ และวันที่รับเข้าเดิมจะย้ายไปด้วย · เตียง {target} จะเปลี่ยนเป็น “ทำความสะอาด” · บันทึกลงทะเบียน (Log)
              อัตโนมัติ
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {freeBeds.length === 0 && <p className="text-[14px] text-ink-3">ไม่มีเตียงว่างให้ย้าย</p>}
            {freeBeds.map((b) => (
              <button
                key={b.bedNumber}
                type="button"
                onClick={() => setMoveTo(b.bedNumber)}
                className={cx(
                  'num h-11 rounded-full px-5 text-[15px] font-medium transition-colors',
                  moveTo === b.bedNumber ? 'btn-ink' : 'btn-glass text-ink-2 hover:text-ink',
                )}
              >
                {b.bedNumber}
                {b.status === 'cleaning' && <span className="ml-1.5 text-[11px] opacity-60">ทำความสะอาด</span>}
              </button>
            ))}
          </div>
          <textarea
            className="field min-h-20"
            placeholder="เหตุผล (ถ้ามี) เช่น ย้ายเข้าห้องแยกโรค / ใกล้เคาน์เตอร์พยาบาล"
            value={moveNote}
            onChange={(e) => setMoveNote(e.target.value)}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setPane('form')}>
              ย้อนกลับ
            </Button>
            <Button variant="primary" onClick={move} disabled={!moveTo}>
              {moveTo ? `ยืนยันย้าย ${target} → ${moveTo}` : 'เลือกเตียงปลายทาง'}
            </Button>
          </div>
        </div>
      ) : pane === 'out' ? (
        <div className="animate-rise space-y-5 pb-2">
          <p className="text-[15px] text-ink-2">
            จำหน่ายผู้ป่วย <span className="font-medium text-ink">{bed?.caseCode}</span> ออกจากเตียง {target}
            <br />
            <span className="text-[13px] text-ink-3">
              เตียงจะเปลี่ยนเป็น “ทำความสะอาด” และบันทึกลงทะเบียน (แท็บ Log) อัตโนมัติ
            </span>
          </p>
          <Segmented options={OUT_OPTIONS} value={outEvent} onChange={setOutEvent} label="ประเภทการจำหน่าย" />
          <textarea
            className="field min-h-24"
            placeholder="หมายเหตุ เช่น ส่งต่อโรงพยาบาลศูนย์ / ย้ายอายุรกรรมชาย"
            value={outNote}
            onChange={(e) => setOutNote(e.target.value)}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setPane('form')}>
              ย้อนกลับ
            </Button>
            <Button variant={outEvent === 'expired' ? 'danger' : 'primary'} onClick={discharge}>
              ยืนยัน{OUT_OPTIONS.find((o) => o.value === outEvent)?.label}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-7">
          {mode === 'admit' && (
            <Group title="เตียง">
              <div className="flex flex-wrap gap-2">
                {freeBeds.length === 0 && <p className="text-[14px] text-ink-3">ไม่มีเตียงว่าง</p>}
                {freeBeds.map((b) => (
                  <button
                    key={b.bedNumber}
                    type="button"
                    onClick={() => setTarget(b.bedNumber)}
                    className={cx(
                      'num h-10 rounded-full px-4 text-[14px] font-medium transition-colors',
                      target === b.bedNumber ? 'btn-ink' : 'btn-glass text-ink-2 hover:text-ink',
                    )}
                  >
                    {b.bedNumber}
                    {b.status === 'cleaning' && <span className="ml-1.5 text-[11px] opacity-60">ทำความสะอาด</span>}
                  </button>
                ))}
              </div>
            </Group>
          )}

          <Group title="ข้อมูลผู้ป่วย (ไม่ระบุตัวตน)">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="รหัสเคส">
                <input className="field" value={form.caseCode} onChange={(e) => set('caseCode', e.target.value)} />
              </Field>
              <Field label="วันเวลาที่รับเข้า">
                <input
                  type="datetime-local"
                  className="field"
                  value={(form.admittedAt || (mode === 'admit' ? toLocalDateTime() : '')).slice(0, 16)}
                  onChange={(e) => set('admittedAt', e.target.value)}
                />
              </Field>
              <Field label="ช่วงอายุ">
                <select className="field" value={form.ageGroup} onChange={(e) => set('ageGroup', e.target.value)}>
                  <option value="">ไม่ระบุ</option>
                  {AGE_GROUPS.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                  {form.ageGroup && !AGE_GROUPS.includes(form.ageGroup) && <option>{form.ageGroup}</option>}
                </select>
              </Field>
              <Field label="เพศ" plain>
                <Segmented<Exclude<Gender, ''> | 'none'>
                  options={[
                    { value: 'ชาย', label: 'ชาย' },
                    { value: 'หญิง', label: 'หญิง' },
                    { value: 'อื่นๆ', label: 'อื่นๆ' },
                    { value: 'none', label: 'ไม่ระบุ' },
                  ]}
                  value={form.gender || 'none'}
                  onChange={(v) => set('gender', v === 'none' ? '' : v)}
                  size="sm"
                />
              </Field>
            </div>
          </Group>

          <Group title="ระดับความรุนแรง">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ACUITIES.map((a: Acuity) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => set('acuity', a)}
                  className={cx(
                    'flex items-center gap-2 rounded-2xl px-4 py-3 text-left transition-colors',
                    form.acuity === a ? 'btn-ink' : 'well text-ink hover:brightness-[1.02]',
                  )}
                >
                  <Dot className={ACUITY_META[a].dot} />
                  <span>
                    <span className="block text-[14px] font-medium">{a}</span>
                    <span className={cx('block text-[11px]', form.acuity === a ? 'opacity-70' : 'text-ink-3')}>
                      {ACUITY_META[a].th}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Group>

          <Group title="อุปกรณ์และตัวชี้วัดคุณภาพ">
            <div className="well divide-y divide-line px-4">
              {DEVICES.map((d) => (
                <Switch key={d.key} label={d.label} hint={d.th} checked={form[d.key]} onChange={(v) => set(d.key, v)} />
              ))}
            </div>
          </Group>

          <Group title="เป้าหมายการรักษา / หมายเหตุ">
            <textarea
              className="field min-h-20"
              placeholder="เช่น MAP > 65, Weaning trial, SpO₂ > 94%"
              value={form.clinicalGoals}
              onChange={(e) => set('clinicalGoals', e.target.value)}
            />
          </Group>
        </div>
      )}
    </Modal>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="eyebrow mb-2.5">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children, plain }: { label: string; children: ReactNode; plain?: boolean }) {
  const Tag = plain ? 'div' : 'label';
  return (
    <Tag className="block">
      <span className="mb-1.5 block text-[12px] text-ink-2">{label}</span>
      {children}
    </Tag>
  );
}
