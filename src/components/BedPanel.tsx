import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeftRight, Check, Trash2 } from 'lucide-react';
import type { Acuity, Bed, Gender, OutEvent } from '../types';
import { ACUITIES, ACUITY_META, AGE_GROUPS, DEVICES } from '../lib/constants';
import { fmtDateTime, parseLocalDateTime, toLocalDateTime } from '../lib/date';
import {
  admitLogFor,
  admitPatient,
  backfillInfo,
  cancelAdmission,
  caseLogs,
  composeOutNote,
  dischargePatient,
  emptyPatient,
  movePatient,
  pastDestinations,
  retimeAdmission,
  stayDays,
  updateBed,
  type OutDetail,
  type PatientInput,
} from '../lib/logic';
import { useStore } from '../lib/store';
import { Button, cx, Dot, Modal, Segmented, Switch } from './ui';

type Mode = 'admit' | 'edit';
type Pane = 'form' | 'out' | 'move' | 'cancel';

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
  const [out, setOut] = useState<OutDetail>({});
  const [outAt, setOutAt] = useState('');
  const [backfill, setBackfill] = useState(true);
  const [reverseCensus, setReverseCensus] = useState(false);
  const setOutField = (k: keyof OutDetail, v: string) => setOut((o) => ({ ...o, [k]: v }));

  // รีเซ็ตฟอร์มเมื่อเปิดเตียงใหม่เท่านั้น (ไม่รีเซ็ตทุกครั้งที่ข้อมูลจากชีตรีเฟรช)
  useEffect(() => {
    if (!bedNumber) return;
    const b = data.beds.find((x) => x.bedNumber === bedNumber) ?? null;
    setTarget(bedNumber);
    setPane('form');
    setMoveTo('');
    setMoveNote('');
    setOutEvent('home');
    setOut({});
    setOutAt('');
    setBackfill(true);
    if (b?.status === 'occupied') setForm(toForm(b));
    else setForm({ ...emptyPatient(), acuity: 'Critical', caseCode: nextCaseCode(data.beds, bedNumber) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bedNumber]);

  const set = <K extends keyof PatientInput>(k: K, v: PatientInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  // เวลารับเข้า: ย้อนหลังได้ (ลืมกดรับ) แต่ห้ามเกินเวลาปัจจุบัน
  const inAt = (form.admittedAt || (mode === 'admit' ? toLocalDateTime() : '')).replace(' ', 'T').slice(0, 16);
  const inAtError = inAt && inAt > toLocalDateTime() ? 'เวลารับเข้าต้องไม่เกินเวลาปัจจุบัน' : '';
  const backDays = mode === 'admit' && inAt && !inAtError ? stayDays(inAt, null) : [];

  const submit = () => {
    if (!target || inAtError) return;
    if (mode === 'admit') {
      const late = backDays.length ? ` (รับเข้า ${fmtDateTime(inAt)})` : '';
      void commit((d) => admitPatient(d, target, form, { backfill }), `รับผู้ป่วยเข้า ${target} แล้ว${late}`);
    } else {
      const oldAt = bed?.admittedAt ?? '';
      void commit((d) => {
        const a = updateBed(d, target, form);
        const b = retimeAdmission(a.next, target, oldAt, form.admittedAt ?? oldAt);
        return { next: b.next, ops: [...a.ops, ...b.ops] };
      }, `บันทึก ${target} แล้ว`);
    }
    onClose();
  };

  // เวลาที่จำหน่าย: ต้องไม่ก่อนเวลารับเข้า และไม่เกินเวลาปัจจุบัน
  const admittedAt = (bed?.admittedAt ?? '').replace(' ', 'T').slice(0, 16);
  const outAtError = !outAt
    ? 'กรุณาระบุเวลาที่จำหน่าย'
    : outAt > toLocalDateTime()
      ? 'เวลาที่จำหน่ายต้องไม่เกินเวลาปัจจุบัน'
      : admittedAt && outAt < admittedAt
        ? `ต้องไม่ก่อนเวลารับเข้า (${fmtDateTime(admittedAt)})`
        : '';
  const hospitals = useMemo(() => pastDestinations(data.logs, 'hospital'), [data.logs]);
  const units = useMemo(() => pastDestinations(data.logs, 'unit'), [data.logs]);
  // ลบเคส (รับผิด/บันทึกผิด) ขณะผู้ป่วยยังอยู่ในเตียง
  const cancelAdmit = target ? admitLogFor(data, target) : undefined;
  const cancelLogs = cancelAdmit ? caseLogs(data.logs, cancelAdmit) : [];
  const cancelInfo = backfillInfo(cancelLogs);
  const cancelDays = bed?.status === 'occupied' ? stayDays((bed.admittedAt || '').replace(' ', 'T').slice(0, 16), null).length : 0;
  const cancelUnsynced = cancelLogs.some((l) => l.row === undefined);
  const openCancel = () => {
    setReverseCensus(cancelInfo.counted);
    setPane('cancel');
  };
  const cancelCase = () => {
    void commit((d) => cancelAdmission(d, target, { reverseCensus }), `ลบเคส ${bed?.caseCode || ''} · เตียง ${target} ว่างแล้ว`);
    onClose();
  };

  const openOut = () => {
    setOutAt(toLocalDateTime());
    setPane('out');
  };

  const discharge = () => {
    if (outAtError) return;
    const label = OUT_OPTIONS.find((o) => o.value === outEvent)?.label;
    const detail: OutDetail =
      outEvent === 'refer' ? out : outEvent === 'ward' ? { unit: out.unit, info: out.info, note: out.note } : { note: out.note };
    const note = composeOutNote(detail);
    const at = parseLocalDateTime(outAt);
    const late = at && Date.now() - at.getTime() > 5 * 60_000 ? ` (เวลา ${fmtDateTime(outAt)})` : '';
    void commit((d) => dischargePatient(d, target, outEvent, note, outAt), `${target} · ${label} แล้ว${late}`);
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
                <Button variant="danger" onClick={openOut}>
                  จำหน่าย
                </Button>
                <Button variant="secondary" onClick={() => setPane('move')} disabled={freeBeds.length === 0}>
                  <ArrowLeftRight className="size-4" strokeWidth={1.8} />
                  ย้ายเตียง
                </Button>
                <Button variant="ghost" onClick={openCancel} aria-label="ลบเคส (รับผิด / บันทึกผิด)" title="ลบเคส (รับผิด / บันทึกผิด)">
                  <Trash2 className="size-4 text-critical" strokeWidth={1.8} />
                  <span className="text-critical">ลบเคส</span>
                </Button>
              </div>
            )}
            <Button variant="ghost" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button variant="primary" onClick={submit} disabled={!target || !!inAtError}>
              {mode === 'admit' ? 'รับเข้าเตียง' : 'บันทึก'}
            </Button>
          </>
        )
      }
    >
      {pane === 'cancel' ? (
        <div className="animate-rise space-y-5 pb-2">
          <p className="text-[15px] text-ink-2">
            ลบเคส <span className="font-medium text-ink">{bed?.caseCode || 'ไม่ระบุรหัสเคส'}</span> ออกจากเตียง {target} — ใช้เมื่อรับผิดเตียงหรือบันทึกผิด/ซ้ำ
            <br />
            <span className="text-[13px] text-ink-3">
              เตียงจะกลับเป็น “ว่าง” · ลบ{cancelLogs.length ? ` ${cancelLogs.length} แถวของเคสนี้` : 'รายการของเคสนี้'}ในทะเบียน · รับใหม่ −1 ในวันที่รับเข้า ·
              ถ้าผู้ป่วยออกจาก ICU จริง ให้ใช้ “จำหน่าย” แทน
            </span>
          </p>
          {cancelDays > 0 && (
            <div className="well px-4">
              <Switch
                label={`หักยอด “ผู้ป่วยในวอร์ด” ย้อนหลัง ${cancelDays} วันด้วย`}
                hint={cancelInfo.counted ? 'เคสนี้รับย้อนหลังพร้อมนับยอดรายวันไว้ จึงเปิดให้แล้ว (รวมอุปกรณ์ที่นับไว้)' : 'เปิดเฉพาะเมื่อแน่ใจว่าเคยนับผู้ป่วยรายนี้ในบันทึกรายวันของวันก่อน ๆ'}
                checked={reverseCensus}
                onChange={setReverseCensus}
              />
            </div>
          )}
          <p className="text-[13px] text-critical">ลบแล้วกู้คืนไม่ได้</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setPane('form')}>
              ย้อนกลับ
            </Button>
            <Button variant="danger" onClick={cancelCase} disabled={cancelUnsynced}>
              <Trash2 className="size-4" strokeWidth={1.8} />
              ยืนยันลบเคส
            </Button>
          </div>
        </div>
      ) : pane === 'move' ? (
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
          <Field label="วันเวลาที่จำหน่าย">
            <div className="flex gap-2">
              <input
                type="datetime-local"
                className="field"
                value={outAt}
                min={admittedAt || undefined}
                max={toLocalDateTime()}
                onChange={(e) => setOutAt(e.target.value)}
                aria-invalid={!!outAtError}
              />
              <button
                type="button"
                onClick={() => setOutAt(toLocalDateTime())}
                className="btn-glass h-11 shrink-0 rounded-full px-4 text-[13px] font-medium"
              >
                ตอนนี้
              </button>
            </div>
            {outAtError ? (
              <span className="mt-1.5 block text-[12px] text-critical">{outAtError}</span>
            ) : (
              <span className="mt-1.5 block text-[12px] text-ink-3">ปรับย้อนหลังได้ ถ้าบันทึกหลังจากผู้ป่วยออกไปแล้ว</span>
            )}
          </Field>
          {outEvent === 'refer' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="โรงพยาบาลปลายทาง">
                <input
                  className="field"
                  list="out-hospitals"
                  placeholder="เช่น รพ.ศูนย์นนทบุรี"
                  value={out.hospital ?? ''}
                  onChange={(e) => setOutField('hospital', e.target.value)}
                />
              </Field>
              <Field label="ตึก / หอผู้ป่วย / แผนก">
                <input
                  className="field"
                  list="out-units"
                  placeholder="เช่น ตึก A ชั้น 5 · ICU อายุรกรรม"
                  value={out.unit ?? ''}
                  onChange={(e) => setOutField('unit', e.target.value)}
                />
              </Field>
            </div>
          )}
          {outEvent === 'ward' && (
            <Field label="ตึก / หอผู้ป่วยปลายทาง">
              <input
                className="field"
                list="out-units"
                placeholder="เช่น อายุรกรรมชาย ตึก 3 ชั้น 4"
                value={out.unit ?? ''}
                onChange={(e) => setOutField('unit', e.target.value)}
              />
            </Field>
          )}
          {(outEvent === 'refer' || outEvent === 'ward') && (
            <Field label="ข้อมูลอื่น ๆ">
              <input
                className="field"
                placeholder={outEvent === 'refer' ? 'เช่น เหตุผลการส่งต่อ · ผู้รับประสาน · นำส่งโดยรถพยาบาล' : 'เช่น ผู้รับเวร · เตียงปลายทาง'}
                value={out.info ?? ''}
                onChange={(e) => setOutField('info', e.target.value)}
              />
            </Field>
          )}
          <Field label="โน้ตเพิ่มเติม">
            <textarea
              className="field min-h-20"
              placeholder="บันทึกเพิ่มเติม (ไม่ต้องใส่ชื่อหรือ HN ผู้ป่วย)"
              value={out.note ?? ''}
              onChange={(e) => setOutField('note', e.target.value)}
            />
          </Field>
          <datalist id="out-hospitals">
            {hospitals.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
          <datalist id="out-units">
            {units.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setPane('form')}>
              ย้อนกลับ
            </Button>
            <Button variant={outEvent === 'expired' ? 'danger' : 'primary'} onClick={discharge} disabled={!!outAtError}>
              ยืนยัน{outEvent === 'refer' ? ' ' : ''}{OUT_OPTIONS.find((o) => o.value === outEvent)?.label}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-7">
          {mode === 'admit' && data.beds.find((b) => b.bedNumber === target)?.status === 'cleaning' && (
            <div className="well flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-[14px] text-ink-2">
                เตียง <span className="num font-medium text-ink">{target}</span> ยังรอทำความสะอาด
              </p>
              <button
                type="button"
                onClick={() =>
                  void commit((d) => updateBed(d, target, { status: 'available' }), `${target} ทำความสะอาดเสร็จ · พร้อมรับผู้ป่วย`)
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-good px-4 text-[13px] font-medium text-white transition-[filter] hover:brightness-105"
              >
                <Check className="size-4" strokeWidth={2.4} />
                ทำความสะอาดเสร็จ
              </button>
            </div>
          )}

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
                  value={inAt}
                  max={toLocalDateTime()}
                  onChange={(e) => set('admittedAt', e.target.value)}
                  aria-invalid={!!inAtError}
                />
                {inAtError ? (
                  <span className="mt-1.5 block text-[12px] text-critical">{inAtError}</span>
                ) : (
                  <span className="mt-1.5 block text-[12px] text-ink-3">ลืมกดรับ? ใส่เวลาที่รับเข้าจริงย้อนหลังได้</span>
                )}
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
            {backDays.length > 0 && (
              <div className="well mt-3 space-y-2 px-4 py-3 text-[13px] text-ink-2">
                <p>
                  <span className="font-medium text-ink">รับเข้าย้อนหลัง</span> · ยอดรับใหม่จะนับเข้าวันที่ {fmtDateTime(inAt).split(' ').slice(0, 2).join(' ')} ตามเวลาที่รับจริง
                </p>
                <Switch
                  label={`เพิ่มยอด “ผู้ป่วยในวอร์ด” ย้อนหลัง ${backDays.length} วัน`}
                  hint="นับผู้ป่วยรายนี้ (และอุปกรณ์ที่ติ๊กไว้ด้านล่าง) เข้าไปในบันทึกรายวันของวันที่ผ่านมา · ปิดถ้ายอดวันก่อน ๆ ถูกต้องอยู่แล้ว"
                  checked={backfill}
                  onChange={setBackfill}
                />
              </div>
            )}
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
