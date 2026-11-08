/**
 * ICU Dashboard — Google Sheets API
 * --------------------------------------------------------------
 * วางโค้ดนี้ใน Google Sheet: ส่วนขยาย (Extensions) › Apps Script
 * แล้ว Deploy เป็น Web app (Execute as: Me, Who has access: Anyone)
 * นำลิงก์ที่ลงท้ายด้วย /exec ไปวางในหน้า "เชื่อมต่อ Google Sheet" ของเว็บ
 *
 * ชีตจะถูกสร้างให้อัตโนมัติ 4 แท็บ:
 *   Beds  — สถานะเตียงปัจจุบัน (1 แถว = 1 เตียง)
 *   Daily — 12 ตัวชี้วัดรายวัน (1 แถว = 1 วัน)
 *   Log   — ทะเบียนรับเข้า / จำหน่าย
 *   Stats — สถิติการใช้เตียงรายเดือน (ADC, ALOS, BOR, BTR, TOI คำนวณด้วยสูตรในชีต)
 *   Staff — รายชื่อบุคลากร (ชื่อ ตำแหน่ง รูป หัวหน้า) ใช้ทำผังองค์กร
 *   Roster — ตารางเวรรายเดือน (1 แถว = 1 คน ต่อ 1 เดือน, คอลัมน์ 1–31 = วันที่)
 *   Docs   — คู่มือ / SOP / แนวทางการรักษา / เอกสารดาวน์โหลด (ไฟล์ PDF เก็บใน Google Drive)
 *   News   — ข่าวสาร / ประกาศ
 *   KPI    — นิยามตัวชี้วัดคุณภาพ (Quality KPI) และเป้าหมาย
 *   KPIData — ผล KPI รายเดือน (ตัวตั้ง / ตัวหาร)
 *   Links  — ลิงก์ Google Forms
 *
 * ครั้งแรกหลังวางโค้ดเวอร์ชันนี้:
 *   1) เลือกฟังก์ชัน authorize แล้วกด Run เพื่ออนุญาตให้บันทึกไฟล์ลง Google Drive
 *   2) กลับไปที่ชีต เมนู ICU Smart Center › ตั้ง / เปลี่ยนรหัสเจ้าหน้าที่
 *      (ทุกคนเปิดดูเว็บได้ แต่การแก้ไข/บันทึกข้อมูลต้องใช้รหัสนี้)
 *
 * แก้ไขข้อมูลในชีตได้ตามปกติ เว็บจะดึงข้อมูลใหม่ภายในไม่กี่วินาที
 * และเมื่อแก้ไขบนเว็บ ข้อมูลจะถูกเขียนกลับมาที่ชีตนี้ทันที
 * (อย่าสลับลำดับคอลัมน์ — เพิ่มแถวได้ เช่น เพิ่มเตียง ICU-09 ในแท็บ Beds)
 */

// (ไม่บังคับ) ตั้งรหัสลับ แล้วใส่รหัสเดียวกันในหน้าเชื่อมต่อของเว็บ
const API_TOKEN = '';

const TAB = {
  beds: 'Beds', daily: 'Daily', log: 'Log', stats: 'Stats', staff: 'Staff', roster: 'Roster', docs: 'Docs',
  news: 'News', kpi: 'KPI', kpiData: 'KPIData', links: 'Links', shifts: 'ShiftReports',
};

// รหัสเจ้าหน้าที่: เก็บเฉพาะค่า hash ใน Script Properties (ตั้งจากเมนูในชีต)
const PIN_PROP = 'STAFF_PIN_HASH';
const SALT_PROP = 'STAFF_PIN_SALT';
const PIN_MIN_LENGTH = 6;
const PIN_MAX_FAILS = 10; // ใส่ผิดเกินนี้ → ล็อก 10 นาที
const PIN_LOCK_SECONDS = 600;
const DEFAULT_BED_COUNT = 8;

const BED_COLS = [
  'bedNumber', 'status', 'caseCode', 'acuity', 'ageGroup', 'gender',
  'onVentilator', 'hasCLine', 'hasFoley', 'hasMdr', 'hasIvHl', 'hasPiHome', 'hasHapBundle', 'hasBradenUnder12',
  'admittedAt', 'clinicalGoals', 'updatedAt',
  'hasHighFlow', 'hasCannula', // เพิ่มภายหลัง: ต่อท้ายเพื่อไม่ให้คอลัมน์เดิมเลื่อน (R, S)
];
const BED_HEAD = [
  'เตียง', 'สถานะ', 'รหัสเคส', 'ระดับความรุนแรง', 'ช่วงอายุ', 'เพศ',
  'Ventilator', 'C-Line', 'Foley', 'MDR', 'IV/HL', 'PI_Home', 'HAP_Bundle', 'Braden < 12',
  'วันที่รับเข้า', 'เป้าหมาย / หมายเหตุ', 'อัปเดตล่าสุด',
  'High flow', 'Cannula',
];
const BED_BOOL_FROM = 7; // คอลัมน์ G
const BED_BOOL_COUNT = 8; // G..N
const BED_EXTRA_BOOL_FROM = 18; // R..S (High flow, Cannula)
const BED_EXTRA_BOOL_COUNT = 2;

const DAILY_COLS = [
  'date', 'admittedNew', 'totalInWard', 'referCount', 'deathCount',
  'ventilatorCount', 'cLineCount', 'foleyCount', 'mdrCount', 'ivHlCount',
  'piHomeCount', 'hapBundleCount', 'bradenUnder12Count', 'notes',
  'highFlowCount', 'cannulaCount', // เพิ่มภายหลัง (O, P)
];
const DAILY_HEAD = [
  'วันที่', 'รับใหม่', 'ผู้ป่วยในวอร์ด', 'Refer', 'เสียชีวิต',
  'Ventilator', 'C-Line', 'Foley', 'MDR', 'IV/HL',
  'PI_Home', 'HAP_Bundle', 'Braden < 12', 'หมายเหตุ',
  'High flow', 'Cannula',
];

const LOG_COLS = ['timestamp', 'event', 'bedNumber', 'caseCode', 'acuity', 'admittedAt', 'note'];
const LOG_HEAD = ['เวลา', 'เหตุการณ์', 'เตียง', 'รหัสเคส', 'ระดับความรุนแรง', 'วันที่รับเข้า', 'หมายเหตุ'];

// Stats: A–E กรอก, F–J เป็นสูตร ARRAYFORMULA ในหัวตาราง (ห้ามเขียนทับ), K หมายเหตุ
const STATS_COLS = ['month', 'beds', 'days', 'patientDays', 'discharges', 'adc', 'alos', 'bor', 'btr', 'toi', 'note'];
const STATS_INPUT = ['month', 'beds', 'days', 'patientDays', 'discharges'];
const STATS_HEAD = [
  'เดือน', 'จำนวนเตียง', 'จำนวนวัน', 'วันนอนรวม', 'จำนวนจำหน่าย',
  '={"ADC";ARRAYFORMULA(IF(A2:A="",,IF(C2:C=0,0,D2:D/C2:C)))}',
  '={"ALOS (วัน)";ARRAYFORMULA(IF(A2:A="",,IF(E2:E=0,0,D2:D/E2:E)))}',
  '={"BOR %";ARRAYFORMULA(IF(A2:A="",,IF(B2:B*C2:C=0,0,D2:D/(B2:B*C2:C))))}',
  '={"BTR (ครั้ง/เตียง)";ARRAYFORMULA(IF(A2:A="",,IF(B2:B=0,0,E2:E/B2:B)))}',
  '={"TOI (วัน)";ARRAYFORMULA(IF(A2:A="",,IF(E2:E=0,0,(B2:B*C2:C-D2:D)/E2:E)))}',
  'หมายเหตุ',
];

const AGE_GROUPS = [
  '< 1 ปี (ทารก)', '1–5 ปี', '6–12 ปี', '13–17 ปี', '18–39 ปี', '40–59 ปี', '60–69 ปี', '70–79 ปี', '≥ 80 ปี',
];

const STAFF_COLS = ['id', 'name', 'nickname', 'position', 'group', 'reportsTo', 'photo', 'skills', 'order', 'active'];
const STAFF_HEAD = [
  'รหัส', 'ชื่อ-สกุล', 'ชื่อเล่น', 'ตำแหน่ง', 'กลุ่มงาน', 'หัวหน้า (รหัส)', 'รูป (ลิงก์)', 'ความเชี่ยวชาญ', 'ลำดับ', 'สถานะ',
];
const STAFF_GROUPS = ['แพทย์', 'พยาบาล', 'ผู้ช่วยพยาบาล', 'พนักงานช่วยเหลือคนไข้', 'อื่นๆ'];
const STAFF_ACTIVE = 'ปฏิบัติงาน';
const STAFF_INACTIVE = 'ไม่ใช้งาน';

const ROSTER_DAYS = 31;
const ROSTER_HEAD = (function () {
  const h = ['เดือน', 'รหัส', 'ชื่อ'];
  for (let d = 1; d <= ROSTER_DAYS; d++) h.push(String(d));
  return h;
})();

const PHOTO_FOLDER = 'ICU Smart Center - รูปบุคลากร';
const DOC_FOLDER = 'ICU Smart Center - คู่มือ SOP';

const DOC_COLS = [
  'id', 'title', 'category', 'type', 'summary', 'content', 'link', 'version',
  'effectiveDate', 'reviewDate', 'owner', 'tags', 'pinned', 'status', 'updatedAt',
];
const DOC_HEAD = [
  'รหัส', 'ชื่อเอกสาร', 'หมวด', 'ประเภท', 'สรุปสั้น ๆ', 'ขั้นตอน (1 บรรทัด = 1 ข้อ)', 'ลิงก์ไฟล์', 'ฉบับที่',
  'วันที่ประกาศใช้', 'วันที่ต้องทบทวน', 'ผู้รับผิดชอบ', 'คำค้น', 'ปักหมุด', 'สถานะ', 'อัปเดตล่าสุด',
];
const DOC_CATEGORIES = [
  'ควบคุมการติดเชื้อ', 'การดูแลผู้ป่วยวิกฤต', 'ภาวะฉุกเฉิน', 'ยาและสารน้ำ',
  'การรับ-ส่งต่อผู้ป่วย', 'อุปกรณ์การแพทย์', 'ระเบียบหน่วยงาน', 'อื่นๆ',
];
const DOC_TYPES = ['SOP', 'แนวปฏิบัติ (CPG)', 'ระเบียบ / ข้อบังคับ', 'คู่มือ', 'แบบฟอร์ม', 'เอกสารทั่วไป'];
const DOC_ACTIVE = 'ใช้งาน';
const DOC_INACTIVE = 'ยกเลิก';
const FILE_FOLDER = 'ICU Smart Center - ไฟล์ข่าวสาร';

const NEWS_COLS = ['id', 'title', 'body', 'category', 'date', 'image', 'attachment', 'pinned', 'author', 'status', 'updatedAt'];
const NEWS_HEAD = [
  'รหัส', 'หัวข้อ', 'รายละเอียด', 'หมวด', 'วันที่', 'รูปภาพ (ลิงก์)', 'ไฟล์แนบ (ลิงก์)', 'ปักหมุด', 'ผู้ประกาศ', 'สถานะ', 'อัปเดตล่าสุด',
];
const NEWS_CATEGORIES = ['ประกาศ', 'ข่าวสาร', 'กิจกรรม', 'อบรม / ประชุม', 'ด่วน'];
const NEWS_PUBLISHED = 'เผยแพร่';
const NEWS_HIDDEN = 'ซ่อน';

const KPI_COLS = [
  'id', 'name', 'group', 'unit', 'multiplier', 'target', 'direction',
  'numeratorLabel', 'numeratorSource', 'denominatorLabel', 'denominatorSource', 'description', 'order', 'active',
];
const KPI_HEAD = [
  'รหัส', 'ชื่อตัวชี้วัด', 'กลุ่ม', 'หน่วย', 'ตัวคูณ', 'เป้าหมาย', 'ทิศทาง',
  'ตัวตั้ง (คำอธิบาย)', 'ที่มาตัวตั้ง', 'ตัวหาร (คำอธิบาย)', 'ที่มาตัวหาร', 'คำอธิบาย / นิยาม', 'ลำดับ', 'สถานะ',
];
const KPI_SOURCES = [
  'กรอกเอง', 'วันนอนรวม', 'วันใช้เครื่องช่วยหายใจ', 'วันใส่ C-Line', 'วันใส่ Foley', 'จำนวนรับใหม่', 'จำนวนจำหน่าย', 'จำนวนเสียชีวิต',
];
// นิยามตั้งต้น (ไม่ใส่เป้าหมาย — ให้หน่วยงานกำหนดเอง)
const KPI_SEED = [
  ['K01', 'อัตราปอดอักเสบจากการใช้เครื่องช่วยหายใจ (VAP)', 'การติดเชื้อ', 'ครั้ง / 1,000 วันใช้เครื่องช่วยหายใจ', 1000, '', '≤', 'จำนวนครั้งการเกิด VAP', 'กรอกเอง', 'จำนวนวันใช้เครื่องช่วยหายใจ', 'วันใช้เครื่องช่วยหายใจ', '', 1, 'ใช้งาน'],
  ['K02', 'อัตราการติดเชื้อในกระแสเลือดจากสายสวนหลอดเลือดดำส่วนกลาง (CLABSI)', 'การติดเชื้อ', 'ครั้ง / 1,000 วันใส่ C-Line', 1000, '', '≤', 'จำนวนครั้งการเกิด CLABSI', 'กรอกเอง', 'จำนวนวันใส่ C-Line', 'วันใส่ C-Line', '', 2, 'ใช้งาน'],
  ['K03', 'อัตราการติดเชื้อทางเดินปัสสาวะจากการคาสายสวน (CAUTI)', 'การติดเชื้อ', 'ครั้ง / 1,000 วันใส่ Foley', 1000, '', '≤', 'จำนวนครั้งการเกิด CAUTI', 'กรอกเอง', 'จำนวนวันใส่ Foley', 'วันใส่ Foley', '', 3, 'ใช้งาน'],
  ['K04', 'อัตราการเกิดแผลกดทับรายใหม่', 'ความปลอดภัย', 'ครั้ง / 1,000 วันนอน', 1000, '', '≤', 'จำนวนแผลกดทับที่เกิดใหม่ใน ICU', 'กรอกเอง', 'จำนวนวันนอนรวม', 'วันนอนรวม', '', 4, 'ใช้งาน'],
  ['K05', 'อัตราการเลื่อนหลุดของท่อช่วยหายใจโดยไม่ได้วางแผน', 'ความปลอดภัย', 'ครั้ง / 100 วันใช้เครื่องช่วยหายใจ', 100, '', '≤', 'จำนวนครั้งท่อช่วยหายใจเลื่อนหลุด', 'กรอกเอง', 'จำนวนวันใช้เครื่องช่วยหายใจ', 'วันใช้เครื่องช่วยหายใจ', '', 5, 'ใช้งาน'],
  ['K06', 'อัตราการกลับเข้า ICU ซ้ำภายใน 48 ชั่วโมง', 'ผลลัพธ์', '%', 100, '', '≤', 'จำนวนผู้ป่วยกลับเข้า ICU ซ้ำภายใน 48 ชม.', 'กรอกเอง', 'จำนวนผู้ป่วยจำหน่ายจาก ICU', 'จำนวนจำหน่าย', '', 6, 'ใช้งาน'],
  ['K07', 'อัตราการเสียชีวิตใน ICU', 'ผลลัพธ์', '%', 100, '', '≤', 'จำนวนผู้ป่วยเสียชีวิต', 'จำนวนเสียชีวิต', 'จำนวนผู้ป่วยจำหน่ายจาก ICU (รวมเสียชีวิต)', 'จำนวนจำหน่าย', '', 7, 'ใช้งาน'],
  ['K08', 'ร้อยละการปฏิบัติตาม VAP / HAP bundle', 'กระบวนการ', '%', 100, '', '≥', 'จำนวนครั้งที่ปฏิบัติครบทุกข้อ', 'กรอกเอง', 'จำนวนครั้งที่ตรวจสอบ', 'กรอกเอง', '', 8, 'ใช้งาน'],
  ['K09', 'ร้อยละการทำความสะอาดมือถูกต้อง (Hand hygiene)', 'กระบวนการ', '%', 100, '', '≥', 'จำนวนโอกาสที่ทำความสะอาดมือถูกต้อง', 'กรอกเอง', 'จำนวนโอกาสที่สังเกตทั้งหมด', 'กรอกเอง', '', 9, 'ใช้งาน'],
];
const KPI_DATA_COLS = ['month', 'kpiId', 'numerator', 'denominator', 'note', 'updatedAt'];
const KPI_DATA_HEAD = ['เดือน (yyyy-mm)', 'รหัสตัวชี้วัด', 'ตัวตั้ง', 'ตัวหาร', 'หมายเหตุ', 'อัปเดตล่าสุด'];

const LINK_COLS = ['id', 'title', 'description', 'url', 'category', 'order', 'active'];
const LINK_HEAD = ['รหัส', 'ชื่อแบบฟอร์ม', 'คำอธิบาย', 'ลิงก์ Google Forms', 'หมวด', 'ลำดับ', 'สถานะ'];
const LINK_CATEGORIES = ['แบบประเมิน', 'รายงานอุบัติการณ์', 'ลงทะเบียน', 'อื่นๆ'];

// สถานะเตียงทุกชั่วโมง (ใช้ทำรายงานประจำเวรย้อนหลังได้ตรงตามจริง) — 1 แถว = 1 เวร (เขียนทับทุกชั่วโมงจนจบเวร)
const SHIFT_COLS = ['key', 'date', 'shift', 'savedAt', 'beds'];
const SHIFT_HEAD = ['รหัสเวร', 'วันที่', 'เวร', 'บันทึกล่าสุด', 'สถานะเตียง (JSON)'];
const SHIFT_TH = { M: 'เวรเช้า', A: 'เวรบ่าย', N: 'เวรดึก' };

/** ช่องที่เป็นวันที่อย่างเดียว (ไม่มีเวลา) */
const DATE_ONLY = { date: true, effectiveDate: true, reviewDate: true };

const STATUS_TH = { available: 'ว่าง', occupied: 'มีผู้ป่วย', cleaning: 'ทำความสะอาด' };
const EVENT_TH = {
  admit: 'รับเข้า', home: 'จำหน่ายกลับบ้าน', ward: 'ย้ายวอร์ด', refer: 'ส่งต่อ (Refer)', expired: 'เสียชีวิต', move: 'ย้ายเตียง',
};
const DATETIME_FIELDS = { admittedAt: true, updatedAt: true, timestamp: true, savedAt: true };

/* ------------------------------------------------------------------ */
/* Web app entry points                                                */
/* ------------------------------------------------------------------ */

function doGet(e) {
  return respond_(function () {
    checkToken_(e && e.parameter && e.parameter.token);
    ensureSetup_();
    // ?shift=2026-11-01-M → สถานะเตียงที่บันทึกไว้ของเวรนั้น (รายงานย้อนหลัง)
    if (e && e.parameter && e.parameter.shift) return { shift: readShift_(String(e.parameter.shift)) };
    // ผู้เข้าชมทั่วไป: อ่านได้อย่างเดียว ไม่ส่งลิงก์ชีตออกไป
    return snapshot_(e && e.parameter && e.parameter.parts, false);
  });
}

/**
 * การเขียนทุกครั้งต้องมีรหัสเจ้าหน้าที่ (body.pin)
 *   { pin, action: 'verify' }             → ตรวจรหัส (เข้าสู่ระบบ)
 *   { pin, action: 'changePin', newPin }  → เปลี่ยนรหัส
 *   { pin, ops: [...] }                   → บันทึกข้อมูล
 */
function doPost(e) {
  return respond_(function () {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkToken_(body.token);
    checkPin_(body.pin);
    if (body.action === 'changePin') {
      setPin_(body.newPin);
      return snapshot_(undefined, true);
    }
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      ensureSetup_();
      if (body.action !== 'verify') (body.ops || []).forEach(applyOp_);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
    return snapshot_(undefined, true);
  });
}

function respond_(fn) {
  let out;
  try {
    out = fn();
    out.ok = true;
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(token) {
  if (API_TOKEN && token !== API_TOKEN) throw new Error('unauthorized');
}

/* ------------------------------------------------------------------ */
/* รหัสเจ้าหน้าที่                                                       */
/* ------------------------------------------------------------------ */

function pinSet_() {
  return !!PropertiesService.getScriptProperties().getProperty(PIN_PROP);
}

function hashPin_(pin, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pin, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function checkPin_(pin) {
  const props = PropertiesService.getScriptProperties();
  const hash = props.getProperty(PIN_PROP);
  if (!hash) throw new Error('pin not set');
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('pinFails')) || 0;
  if (fails >= PIN_MAX_FAILS) throw new Error('locked');
  if (!pin || hashPin_(String(pin), props.getProperty(SALT_PROP) || '') !== hash) {
    cache.put('pinFails', String(fails + 1), PIN_LOCK_SECONDS);
    throw new Error('wrong pin');
  }
}

function setPin_(pin) {
  const p = String(pin || '').trim();
  if (p.length < PIN_MIN_LENGTH) throw new Error('pin too short');
  const salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({ STAFF_PIN_SALT: salt, STAFF_PIN_HASH: hashPin_(p, salt) });
  CacheService.getScriptCache().remove('pinFails');
}

/** เมนูในชีต: ตั้ง / เปลี่ยนรหัสเจ้าหน้าที่ (เจ้าของชีตเท่านั้นที่เปิดเมนูนี้ได้) */
function promptStaffPin() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt(
    'ตั้งรหัสเจ้าหน้าที่ ICU',
    'ใส่รหัสใหม่อย่างน้อย ' + PIN_MIN_LENGTH + ' ตัว (ตัวเลขหรือตัวอักษร) — ใช้สำหรับแก้ไขข้อมูลบนเว็บ',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  try {
    setPin_(res.getResponseText());
    ui.alert('ตั้งรหัสเรียบร้อย ✓');
  } catch (err) {
    ui.alert('รหัสต้องมีอย่างน้อย ' + PIN_MIN_LENGTH + ' ตัว');
  }
}

/** ปลดล็อกทันที (กรณีมีคนใส่รหัสผิดหลายครั้งจนถูกล็อก) */
function unlockStaffPin() {
  CacheService.getScriptCache().remove('pinFails');
  SpreadsheetApp.getUi().alert('ปลดล็อกแล้ว');
}

/* ------------------------------------------------------------------ */
/* Menu & setup                                                        */
/* ------------------------------------------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ICU Smart Center')
    .addItem('ตั้ง / เปลี่ยนรหัสเจ้าหน้าที่', 'promptStaffPin')
    .addItem('ปลดล็อกรหัส (ใส่ผิดหลายครั้ง)', 'unlockStaffPin')
    .addSeparator()
    .addItem('เปิดบันทึกสถานะเตียงทุกชั่วโมง (รายงานเวรย้อนหลัง)', 'enableShiftSnapshots')
    .addSeparator()
    .addItem('ตั้งค่า / ซ่อมแซมแท็บ', 'setup')
    .addToUi();
}

function setup() {
  ensureSetup_(true);
}

/** กด Run ฟังก์ชันนี้ 1 ครั้งในหน้า Apps Script เพื่ออนุญาตให้สคริปต์บันทึกรูปบุคลากรลง Google Drive */
function authorize() {
  SpreadsheetApp.getActive().getName();
  PropertiesService.getScriptProperties().getKeys();
  CacheService.getScriptCache().get('pinFails');
  photoFolder_();
}

/** ชีตเดิมที่สร้างก่อนมีคอลัมน์ High flow / Cannula → เพิ่มหัวคอลัมน์ + ช่องติ๊กต่อท้ายให้อัตโนมัติ */
function addNewColumns_(ss) {
  const beds = ss.getSheetByName(TAB.beds);
  if (beds && beds.getRange(1, BED_HEAD.length).getValue() === '') {
    sheet_(TAB.beds, BED_HEAD);
    const n = Math.max(beds.getLastRow() - 1, 0);
    if (n) {
      const range = beds.getRange(2, BED_EXTRA_BOOL_FROM, n, BED_EXTRA_BOOL_COUNT);
      range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
      range.setValues(range.getValues().map(function (r) {
        return r.map(function (v) { return v === true; });
      }));
    }
  }
  const daily = ss.getSheetByName(TAB.daily);
  if (daily && daily.getRange(1, DAILY_HEAD.length).getValue() === '') {
    sheet_(TAB.daily, DAILY_HEAD);
    daily.getRange('O2:P').setNumberFormat('0');
  }
}

function ensureSetup_(force) {
  const ss = SpreadsheetApp.getActive();
  const existed = {
    beds: !!ss.getSheetByName(TAB.beds),
    daily: !!ss.getSheetByName(TAB.daily),
    log: !!ss.getSheetByName(TAB.log),
    stats: !!ss.getSheetByName(TAB.stats),
    staff: !!ss.getSheetByName(TAB.staff),
    roster: !!ss.getSheetByName(TAB.roster),
    docs: !!ss.getSheetByName(TAB.docs),
    news: !!ss.getSheetByName(TAB.news),
    kpi: !!ss.getSheetByName(TAB.kpi),
    kpiData: !!ss.getSheetByName(TAB.kpiData),
    links: !!ss.getSheetByName(TAB.links),
    shifts: !!ss.getSheetByName(TAB.shifts),
  };
  const all = Object.keys(existed).every(function (k) { return existed[k]; });
  if (all) addNewColumns_(ss);
  if (!force && all) return;

  const beds = sheet_(TAB.beds, BED_HEAD);
  const daily = sheet_(TAB.daily, DAILY_HEAD);
  const log = sheet_(TAB.log, LOG_HEAD);
  const stats = sheet_(TAB.stats, STATS_HEAD);
  const staff = sheet_(TAB.staff, STAFF_HEAD);
  const roster = sheet_(TAB.roster, ROSTER_HEAD);
  const docs = sheet_(TAB.docs, DOC_HEAD);
  const news = sheet_(TAB.news, NEWS_HEAD);
  const kpi = sheet_(TAB.kpi, KPI_HEAD);
  const kpiData = sheet_(TAB.kpiData, KPI_DATA_HEAD);
  const links = sheet_(TAB.links, LINK_HEAD);
  const shifts = sheet_(TAB.shifts, SHIFT_HEAD);

  if (beds.getLastRow() < 2) {
    const now = new Date();
    const names = [];
    for (let i = 1; i <= DEFAULT_BED_COUNT; i++) names.push('ICU-' + (i < 10 ? '0' : '') + i);
    const rows = names.map(function (b) {
      const r = BED_COLS.map(function () { return ''; });
      r[0] = b;
      r[1] = STATUS_TH.available;
      for (let i = 0; i < BED_BOOL_COUNT; i++) r[BED_BOOL_FROM - 1 + i] = false;
      for (let i = 0; i < BED_EXTRA_BOOL_COUNT; i++) r[BED_EXTRA_BOOL_FROM - 1 + i] = false;
      r[BED_COLS.indexOf('updatedAt')] = now;
      return r;
    });
    beds.getRange(2, 1, rows.length, BED_COLS.length).setValues(rows);
  }

  const maxRows = 20;
  // ใช้ data validation แบบ checkbox (insertCheckboxes() จะรีเซ็ตค่าเดิมเป็น false)
  beds.getRange(2, BED_BOOL_FROM, maxRows, BED_BOOL_COUNT).setDataValidation(
    SpreadsheetApp.newDataValidation().requireCheckbox().build());
  beds.getRange(2, BED_EXTRA_BOOL_FROM, maxRows, BED_EXTRA_BOOL_COUNT).setDataValidation(
    SpreadsheetApp.newDataValidation().requireCheckbox().build());
  beds.getRange(2, 2, maxRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(
      [STATUS_TH.available, STATUS_TH.occupied, STATUS_TH.cleaning], true).setAllowInvalid(true).build());
  beds.getRange(2, 4, maxRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(
      ['Critical', 'High', 'Moderate', 'Stable'], true).setAllowInvalid(true).build());
  beds.getRange(2, 5, maxRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(AGE_GROUPS, true).setAllowInvalid(true).build());
  beds.getRange(2, 6, maxRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['ชาย', 'หญิง', 'อื่นๆ'], true).setAllowInvalid(true).build());
  beds.getRange(2, 15, maxRows, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  beds.getRange(2, 17, maxRows, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  beds.setColumnWidth(16, 260);

  daily.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  daily.getRange('B2:M').setNumberFormat('0');
  daily.getRange('O2:P').setNumberFormat('0');
  daily.setColumnWidth(14, 240);

  log.getRange('A2:A').setNumberFormat('yyyy-mm-dd hh:mm');
  log.getRange('F2:F').setNumberFormat('yyyy-mm-dd hh:mm');
  log.setColumnWidth(7, 260);

  stats.getRange('A2:A').setNumberFormat('@'); // เก็บ yyyy-mm เป็นข้อความ ไม่ให้กลายเป็นวันที่
  stats.getRange('B2:E').setNumberFormat('0');
  stats.getRange('F2:G').setNumberFormat('0.00');
  stats.getRange('H2:H').setNumberFormat('0.00%');
  stats.getRange('I2:J').setNumberFormat('0.00');
  stats.setColumnWidth(11, 240);

  staff.getRange('A2:A').setNumberFormat('@');
  staff.getRange('F2:F').setNumberFormat('@');
  staff.getRange('E2:E300').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STAFF_GROUPS, true).setAllowInvalid(true).build());
  staff.getRange('J2:J300').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList([STAFF_ACTIVE, STAFF_INACTIVE], true).setAllowInvalid(true).build());
  staff.setColumnWidth(2, 200);
  staff.setColumnWidth(7, 240);

  roster.getRange('A2:B').setNumberFormat('@');
  roster.getRange(2, 4, roster.getMaxRows() - 1, ROSTER_DAYS).setNumberFormat('@').setHorizontalAlignment('center');
  roster.setFrozenColumns(3);
  roster.setColumnWidth(3, 180);
  for (let c = 4; c < 4 + ROSTER_DAYS; c++) roster.setColumnWidth(c, 44);

  docs.getRange('A2:A').setNumberFormat('@');
  docs.getRange('H2:H').setNumberFormat('@');
  docs.getRange('I2:J').setNumberFormat('yyyy-mm-dd');
  docs.getRange('O2:O').setNumberFormat('yyyy-mm-dd hh:mm');
  docs.getRange('E2:F').setWrap(true);
  const list = function (values) {
    return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(true).build();
  };
  docs.getRange('C2:C500').setDataValidation(list(DOC_CATEGORIES));
  docs.getRange('D2:D500').setDataValidation(list(DOC_TYPES));
  docs.getRange('M2:M500').setDataValidation(list(['ใช่']));
  docs.getRange('N2:N500').setDataValidation(list([DOC_ACTIVE, DOC_INACTIVE]));
  docs.setFrozenColumns(2);
  docs.setColumnWidth(2, 260);
  docs.setColumnWidth(5, 300);
  docs.setColumnWidth(6, 300);

  news.getRange('A2:A').setNumberFormat('@');
  news.getRange('E2:E').setNumberFormat('yyyy-mm-dd');
  news.getRange('K2:K').setNumberFormat('yyyy-mm-dd hh:mm');
  news.getRange('C2:C').setWrap(true);
  news.getRange('D2:D500').setDataValidation(list(NEWS_CATEGORIES));
  news.getRange('H2:H500').setDataValidation(list(['ใช่']));
  news.getRange('J2:J500').setDataValidation(list([NEWS_PUBLISHED, NEWS_HIDDEN]));
  news.setColumnWidth(2, 260);
  news.setColumnWidth(3, 360);

  kpi.getRange('A2:A').setNumberFormat('@');
  if (kpi.getLastRow() < 2) kpi.getRange(2, 1, KPI_SEED.length, KPI_COLS.length).setValues(KPI_SEED);
  kpi.getRange('G2:G200').setDataValidation(list(['≤', '≥']));
  kpi.getRange('I2:I200').setDataValidation(list(KPI_SOURCES));
  kpi.getRange('K2:K200').setDataValidation(list(KPI_SOURCES));
  kpi.getRange('N2:N200').setDataValidation(list([DOC_ACTIVE, DOC_INACTIVE]));
  kpi.setFrozenColumns(2);
  kpi.setColumnWidth(2, 300);

  kpiData.getRange('A2:B').setNumberFormat('@');
  kpiData.getRange('F2:F').setNumberFormat('yyyy-mm-dd hh:mm');

  links.getRange('A2:A').setNumberFormat('@');
  links.getRange('E2:E300').setDataValidation(list(LINK_CATEGORIES));
  links.getRange('G2:G300').setDataValidation(list([DOC_ACTIVE, DOC_INACTIVE]));
  links.setColumnWidth(2, 240);
  links.setColumnWidth(4, 320);

  shifts.getRange('A2:A').setNumberFormat('@');
  shifts.getRange('B2:B').setNumberFormat('yyyy-mm-dd');
  shifts.getRange('D2:D').setNumberFormat('yyyy-mm-dd hh:mm');
  shifts.setColumnWidth(5, 420);

  const first = ss.getSheets()[0];
  if (first && first.getName() !== TAB.beds && first.getLastRow() === 0 && ss.getSheets().length > 12) {
    ss.deleteSheet(first); // ลบ "Sheet1" ว่าง ๆ ที่ติดมากับไฟล์ใหม่
  }
}

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, header.length)
    .setValues([header])
    .setFontWeight('bold')
    .setBackground('#f5f5f7')
    .setFontColor('#1d1d1f');
  sh.setFrozenRows(1);
  return sh;
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

/**
 * parts = 'core' → เฉพาะข้อมูลที่เปลี่ยนบ่อย (เตียง/รายวัน/Log/Stats) · อื่น ๆ → รวมบุคลากร ตารางเวร เอกสาร ข่าว KPI ลิงก์
 * staff = true → ผ่านการตรวจรหัสแล้ว: แนบลิงก์ Google Sheet ไปด้วย
 */
function snapshot_(parts, staff) {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const beds = ss.getSheetByName(TAB.beds);
  const daily = ss.getSheetByName(TAB.daily);
  const log = ss.getSheetByName(TAB.log);
  const stats = ss.getSheetByName(TAB.stats);
  const staffSh = ss.getSheetByName(TAB.staff);
  const roster = ss.getSheetByName(TAB.roster);
  const docs = ss.getSheetByName(TAB.docs);
  const news = ss.getSheetByName(TAB.news);
  const kpi = ss.getSheetByName(TAB.kpi);
  const kpiData = ss.getSheetByName(TAB.kpiData);
  const links = ss.getSheetByName(TAB.links);
  const out = {
    spreadsheetId: staff ? ss.getId() : '',
    spreadsheetUrl: staff ? ss.getUrl() : '',
    title: ss.getName(),
    timeZone: tz,
    pinSet: pinSet_(),
    gids: {
      beds: beds.getSheetId(), daily: daily.getSheetId(), log: log.getSheetId(), stats: stats.getSheetId(),
      staff: staffSh.getSheetId(), roster: roster.getSheetId(), docs: docs.getSheetId(),
      news: news.getSheetId(), kpi: kpi.getSheetId(), kpiData: kpiData.getSheetId(), links: links.getSheetId(),
    },
    beds: readRows_(beds, BED_COLS, tz),
    daily: readRows_(daily, DAILY_COLS, tz),
    logs: readRows_(log, LOG_COLS, tz),
    stats: readRows_(stats, STATS_COLS, tz),
    serverTime: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss"),
  };
  if (parts !== 'core') {
    out.staff = readRows_(staffSh, STAFF_COLS, tz).map(function (r) {
      r.active = String(r.active).trim() !== STAFF_INACTIVE;
      return r;
    });
    out.roster = readRoster_(roster, tz);
    out.docs = readRows_(docs, DOC_COLS, tz);
    out.news = readRows_(news, NEWS_COLS, tz);
    out.kpis = readRows_(kpi, KPI_COLS, tz);
    out.kpiData = readRows_(kpiData, KPI_DATA_COLS, tz);
    out.links = readRows_(links, LINK_COLS, tz);
  }
  return out;
}

function readRoster_(sh, tz) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, 3 + ROSTER_DAYS).getDisplayValues();
  const out = [];
  values.forEach(function (r, i) {
    if (!r[0] || !(r[1] || r[2])) return;
    out.push({ row: i + 2, month: monthKey_(r[0], tz), staffId: r[1], name: r[2], days: r.slice(3) });
  });
  return out;
}

function monthKey_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM');
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) : s;
}

function readRows_(sh, cols, tz) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, cols.length).getValues();
  const out = [];
  values.forEach(function (r, i) {
    if (r[0] === '' || r[0] === null) return;
    const o = { row: i + 2 };
    cols.forEach(function (c, j) {
      let v = r[j];
      if (v instanceof Date) {
        v = DATE_ONLY[c]
          ? Utilities.formatDate(v, tz, 'yyyy-MM-dd')
          : c === 'month'
            ? Utilities.formatDate(v, tz, 'yyyy-MM')
            : Utilities.formatDate(v, tz, "yyyy-MM-dd'T'HH:mm:ss");
      }
      o[c] = v;
    });
    out.push(o);
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

function applyOp_(op) {
  if (op.type === 'upsertBed') return upsert_(TAB.beds, BED_COLS, 'bedNumber', toBedRow_(op.bed));
  if (op.type === 'upsertDaily') return upsertDaily_(op.record);
  if (op.type === 'appendLog') return appendLog_(op.entry);
  if (op.type === 'upsertStats') return upsertStats_(op.record);
  if (op.type === 'upsertStaff') return upsert_(TAB.staff, STAFF_COLS, 'id', toStaffRow_(op.staff));
  if (op.type === 'upsertRoster') return upsertRoster_(op.record);
  if (op.type === 'deleteStaff') return deleteStaff_(op.id, op.fromMonth);
  if (op.type === 'updateLog') return updateLog_(op.row, op.caseCode, op.bedNumber, op.patch);
  if (op.type === 'deleteLog') return deleteLog_(op.rows);
  if (op.type === 'uploadPhoto') return uploadPhoto_(op.staffId, op.dataUrl);
  if (op.type === 'upsertDoc') return upsert_(TAB.docs, DOC_COLS, 'id', toDocRow_(op.doc));
  if (op.type === 'uploadDoc') return uploadDoc_(op.docId, op.name, op.dataUrl);
  if (op.type === 'upsertNews') return upsert_(TAB.news, NEWS_COLS, 'id', toNewsRow_(op.news));
  if (op.type === 'uploadNewsFile') return uploadNewsFile_(op.newsId, op.field, op.name, op.dataUrl);
  if (op.type === 'upsertKpi') return upsert_(TAB.kpi, KPI_COLS, 'id', toActiveRow_(op.kpi, KPI_COLS));
  if (op.type === 'upsertKpiData') return upsertKpiData_(op.record);
  if (op.type === 'upsertLink') return upsert_(TAB.links, LINK_COLS, 'id', toActiveRow_(op.link, LINK_COLS));
  throw new Error('unknown op: ' + op.type);
}

function toBedRow_(bed) {
  const o = {};
  Object.keys(bed).forEach(function (k) {
    if (BED_COLS.indexOf(k) < 0) return;
    o[k] = k === 'status' ? (STATUS_TH[bed[k]] || bed[k]) : bed[k];
  });
  o.updatedAt = nowStr_();
  return o;
}

function upsertDaily_(record) {
  const sh = upsert_(TAB.daily, DAILY_COLS, 'date', record);
  const last = sh.getLastRow();
  if (last > 2) sh.getRange(2, 1, last - 1, DAILY_COLS.length).sort({ column: 1, ascending: true });
}

/** แก้รายการในทะเบียนย้อนหลัง (เวลา / หมายเหตุ) · ตรวจรหัสเคสและเตียงก่อน กันแก้ผิดแถว */
function updateLog_(row, caseCode, bedNumber, patch) {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.log);
  const r = Number(row);
  if (!(r >= 2) || r > sh.getLastRow()) throw new Error('ไม่พบรายการนี้ในทะเบียน กรุณารีเฟรชแล้วลองใหม่');
  const cur = sh.getRange(r, 1, 1, LOG_COLS.length).getDisplayValues()[0];
  const same = function (c, v) { return String(cur[LOG_COLS.indexOf(c)]).trim() === String(v || '').trim(); };
  if (!same('caseCode', caseCode) || !same('bedNumber', bedNumber)) {
    throw new Error('รายการในทะเบียนถูกแก้ไขในชีต กรุณารีเฟรชแล้วลองใหม่');
  }
  ['timestamp', 'admittedAt', 'note'].forEach(function (c) {
    if (patch && Object.prototype.hasOwnProperty.call(patch, c)) {
      sh.getRange(r, LOG_COLS.indexOf(c) + 1).setValue(toCell_(c, patch[c]));
    }
  });
}

/** ลบแถวในทะเบียน (ลบเคสที่บันทึกผิด) · ตรวจรหัสเคสและเตียงทุกแถวก่อน แล้วลบจากล่างขึ้นบน */
function deleteLog_(rows) {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.log);
  const list = (rows || []).slice().sort(function (a, b) { return Number(b.row) - Number(a.row); });
  const last = sh.getLastRow();
  list.forEach(function (x) {
    const r = Number(x.row);
    if (!(r >= 2) || r > last) throw new Error('ไม่พบรายการนี้ในทะเบียน กรุณารีเฟรชแล้วลองใหม่');
    const cur = sh.getRange(r, 1, 1, LOG_COLS.length).getDisplayValues()[0];
    if (String(cur[LOG_COLS.indexOf('caseCode')]).trim() !== String(x.caseCode || '').trim() ||
        String(cur[LOG_COLS.indexOf('bedNumber')]).trim() !== String(x.bedNumber || '').trim()) {
      throw new Error('รายการในทะเบียนถูกแก้ไขในชีต กรุณารีเฟรชแล้วลองใหม่');
    }
  });
  list.forEach(function (x) { sh.deleteRow(Number(x.row)); });
}

function appendLog_(entry) {
  const o = {};
  Object.keys(entry).forEach(function (k) {
    o[k] = k === 'event' ? (EVENT_TH[entry[k]] || entry[k]) : entry[k];
  });
  if (!o.timestamp) o.timestamp = nowStr_();
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.log);
  sh.appendRow(LOG_COLS.map(function (c) { return toCell_(c, o[c]); }));
}

function toStaffRow_(st) {
  const o = {};
  Object.keys(st).forEach(function (k) {
    if (STAFF_COLS.indexOf(k) < 0) return;
    let v = st[k];
    if (k === 'active') v = v === false ? STAFF_INACTIVE : STAFF_ACTIVE;
    if (k === 'skills' && Array.isArray(v)) v = v.join(', ');
    o[k] = v;
  });
  return o;
}

/** ตารางเวร: เขียนเฉพาะวันที่ส่งมา (คนอื่นแก้วันอื่นพร้อมกันได้ไม่ทับกัน) */
/** ลบบุคลากรออกจากแท็บ Staff ถาวร + ลบแถวตารางเวรตั้งแต่เดือน fromMonth (เดือนก่อนหน้าเก็บไว้เป็นประวัติ) */
function deleteStaff_(staffId, fromMonth) {
  const id = String(staffId || '').trim();
  if (!id) throw new Error('missing id');
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const st = ss.getSheetByName(TAB.staff);
  const last = st.getLastRow();
  if (last >= 2) {
    const ids = st.getRange(2, 1, last - 1, 1).getDisplayValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]).trim() === id) st.deleteRow(i + 2);
    }
  }
  const from = /^\d{4}-\d{2}$/.test(String(fromMonth || '')) ? String(fromMonth) : '';
  if (!from) return;
  const ro = ss.getSheetByName(TAB.roster);
  const rl = ro.getLastRow();
  if (rl < 2) return;
  const keys = ro.getRange(2, 1, rl - 1, 2).getDisplayValues();
  for (let i = keys.length - 1; i >= 0; i--) {
    if (String(keys[i][1]).trim() === id && monthKey_(keys[i][0], tz) >= from) ro.deleteRow(i + 2);
  }
}

function upsertRoster_(rec) {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const sh = ss.getSheetByName(TAB.roster);
  const month = monthKey_(rec.month, tz);
  const staffId = String(rec.staffId || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month) || !staffId) throw new Error('missing month/staffId');

  const last = sh.getLastRow();
  let rowNum = -1;
  if (last >= 2) {
    const keys = sh.getRange(2, 1, last - 1, 2).getDisplayValues();
    for (let i = 0; i < keys.length; i++) {
      if (monthKey_(keys[i][0], tz) === month && String(keys[i][1]).trim() === staffId) {
        rowNum = i + 2;
        break;
      }
    }
  }
  if (rowNum < 0) {
    rowNum = Math.max(last, 1) + 1;
    sh.getRange(rowNum, 1, 1, 2).setNumberFormat('@').setValues([[month, staffId]]);
    sh.getRange(rowNum, 4, 1, ROSTER_DAYS).setNumberFormat('@').setHorizontalAlignment('center');
  }
  if (rec.name) sh.getRange(rowNum, 3).setValue(rec.name);
  const days = rec.days || {};
  Object.keys(days).forEach(function (d) {
    const n = Number(d);
    if (n >= 1 && n <= ROSTER_DAYS) sh.getRange(rowNum, 3 + n).setValue(String(days[d] || ''));
  });
}

function photoFolder_() {
  return folderByName_(PHOTO_FOLDER);
}

/** บันทึกรูปบุคลากร (data URL) ลง Google Drive แล้วใส่ลิงก์ในแท็บ Staff */
function uploadPhoto_(staffId, dataUrl) {
  const id = String(staffId || '').trim();
  const m = String(dataUrl || '').match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!id || !m) throw new Error('invalid photo');
  const folder = photoFolder_();
  const name = id + '.jpg';
  const old = folder.getFilesByName(name);
  while (old.hasNext()) old.next().setTrashed(true);
  const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  upsert_(TAB.staff, STAFF_COLS, 'id', { id: id, photo: 'https://lh3.googleusercontent.com/d/' + file.getId() });
}

function toDocRow_(d) {
  const o = {};
  Object.keys(d).forEach(function (k) {
    if (DOC_COLS.indexOf(k) < 0) return;
    let v = d[k];
    if (k === 'pinned') v = v ? 'ใช่' : '';
    if (k === 'status') v = v === false || v === DOC_INACTIVE ? DOC_INACTIVE : DOC_ACTIVE;
    if (k === 'tags' && Array.isArray(v)) v = v.join(', ');
    o[k] = v;
  });
  o.updatedAt = nowStr_();
  return o;
}

/** บันทึกไฟล์คู่มือ (data URL) ลงโฟลเดอร์ใน Google Drive แล้วใส่ลิงก์ในแท็บ Docs */
function uploadDoc_(docId, name, dataUrl) {
  const id = String(docId || '').trim();
  const m = String(dataUrl || '').match(/^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/);
  if (!id || !m) throw new Error('invalid file');
  const folder = folderByName_(DOC_FOLDER);
  const fileName = id + ' - ' + String(name || 'document').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 120);
  const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], fileName));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  upsert_(TAB.docs, DOC_COLS, 'id', { id: id, link: 'https://drive.google.com/file/d/' + file.getId() + '/view', updatedAt: nowStr_() });
}

function toNewsRow_(n) {
  const o = {};
  Object.keys(n).forEach(function (k) {
    if (NEWS_COLS.indexOf(k) < 0) return;
    let v = n[k];
    if (k === 'pinned') v = v ? 'ใช่' : '';
    if (k === 'status') v = v === false || v === NEWS_HIDDEN ? NEWS_HIDDEN : NEWS_PUBLISHED;
    o[k] = v;
  });
  o.updatedAt = nowStr_();
  return o;
}

/** KPI / ลิงก์: active (true/false) → ใช้งาน / ยกเลิก */
function toActiveRow_(obj, cols) {
  const o = {};
  Object.keys(obj).forEach(function (k) {
    if (cols.indexOf(k) < 0) return;
    o[k] = k === 'active' ? (obj[k] === false || obj[k] === DOC_INACTIVE ? DOC_INACTIVE : DOC_ACTIVE) : obj[k];
  });
  return o;
}

/** ผล KPI รายเดือน: คีย์ = เดือน + รหัสตัวชี้วัด */
function upsertKpiData_(rec) {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const sh = ss.getSheetByName(TAB.kpiData);
  const month = monthKey_(rec.month, tz);
  const kpiId = String(rec.kpiId || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month) || !kpiId) throw new Error('missing month/kpiId');
  const last = sh.getLastRow();
  let rowNum = -1;
  if (last >= 2) {
    const keys = sh.getRange(2, 1, last - 1, 2).getDisplayValues();
    for (let i = 0; i < keys.length; i++) {
      if (monthKey_(keys[i][0], tz) === month && String(keys[i][1]).trim() === kpiId) {
        rowNum = i + 2;
        break;
      }
    }
  }
  if (rowNum < 0) rowNum = Math.max(last, 1) + 1;
  const num = function (v) { return v === '' || v === null || v === undefined || isNaN(Number(v)) ? '' : Number(v); };
  sh.getRange(rowNum, 1, 1, 2).setNumberFormat('@');
  sh.getRange(rowNum, 1, 1, KPI_DATA_COLS.length).setValues([[
    month, kpiId, num(rec.numerator), num(rec.denominator), rec.note || '', toCell_('updatedAt', nowStr_()),
  ]]);
}

/** รูปภาพ / ไฟล์แนบของข่าว → Google Drive แล้วใส่ลิงก์ในแท็บ News */
function uploadNewsFile_(newsId, field, name, dataUrl) {
  const id = String(newsId || '').trim();
  const m = String(dataUrl || '').match(/^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/);
  if (!id || !m || (field !== 'image' && field !== 'attachment')) throw new Error('invalid file');
  const folder = folderByName_(FILE_FOLDER);
  const fileName = id + ' - ' + String(name || field).replace(/[\\/:*?"<>|]/g, ' ').slice(0, 120);
  const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], fileName));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const link = field === 'image'
    ? 'https://lh3.googleusercontent.com/d/' + file.getId()
    : 'https://drive.google.com/file/d/' + file.getId() + '/view';
  const row = { id: id, updatedAt: nowStr_() };
  row[field] = link;
  upsert_(TAB.news, NEWS_COLS, 'id', row);
}

/* ------------------------------------------------------------------ */
/* สถานะเตียงรายชั่วโมง → รายงานประจำเวรย้อนหลัง                            */
/* ------------------------------------------------------------------ */

/** เมนูในชีต: ตั้งให้บันทึกทุกชั่วโมง (เรียกครั้งเดียว) */
function enableShiftSnapshots() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'saveShiftSnapshot') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('saveShiftSnapshot').timeBased().everyHours(1).create();
  saveShiftSnapshot();
  SpreadsheetApp.getUi().alert('เปิดแล้ว ✓ ระบบจะบันทึกสถานะเตียงทุกชั่วโมงในแท็บ ShiftReports\nรายงานเวรย้อนหลังบนเว็บจะใช้ข้อมูลนี้');
}

/** บันทึกสถานะเตียงตอนนี้ลงแถวของเวรปัจจุบัน (เรียกจากตัวตั้งเวลา) */
function saveShiftSnapshot() {
  ensureSetup_();
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const now = new Date();
  const hour = Number(Utilities.formatDate(now, tz, 'H'));
  const shift = hour < 8 ? 'N' : hour < 16 ? 'M' : 'A';
  const date = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const beds = readRows_(ss.getSheetByName(TAB.beds), BED_COLS, tz).map(function (r) {
    delete r.row;
    return r;
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    upsert_(TAB.shifts, SHIFT_COLS, 'key', {
      key: date + '-' + shift,
      date: date,
      shift: SHIFT_TH[shift],
      savedAt: nowStr_(),
      beds: JSON.stringify(beds),
    });
  } finally {
    lock.releaseLock();
  }
}

function readShift_(key) {
  const ss = SpreadsheetApp.getActive();
  const rows = readRows_(ss.getSheetByName(TAB.shifts), SHIFT_COLS, ss.getSpreadsheetTimeZone());
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i].key).trim() === key) return rows[i];
  }
  return null;
}

function folderByName_(name) {
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

/** Stats: เขียนเฉพาะช่องกรอก (A–E) และหมายเหตุ (K) — F–J เป็นสูตรของชีต */
function upsertStats_(rec) {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const sh = ss.getSheetByName(TAB.stats);
  const month = String(rec.month || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('missing month');

  const last = sh.getLastRow();
  let rowNum = -1;
  if (last >= 2) {
    const keys = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < keys.length; i++) {
      let k = keys[i][0];
      if (k instanceof Date) k = Utilities.formatDate(k, tz, 'yyyy-MM');
      if (String(k).trim() === month) {
        rowNum = i + 2;
        break;
      }
    }
  }
  if (rowNum < 0) rowNum = Math.max(last, 1) + 1;
  sh.getRange(rowNum, 1).setNumberFormat('@');
  sh.getRange(rowNum, 1, 1, STATS_INPUT.length).setValues([
    STATS_INPUT.map(function (c) {
      return c === 'month' ? month : Number(rec[c]) || 0;
    }),
  ]);
  if (Object.prototype.hasOwnProperty.call(rec, 'note')) sh.getRange(rowNum, STATS_COLS.length).setValue(rec.note || '');

  const lastRow = sh.getLastRow();
  if (lastRow > 2) {
    // เรียงตามเดือน เฉพาะคอลัมน์กรอก (สูตร F–J คำนวณตามแถวเอง)
    const inputs = sh.getRange(2, 1, lastRow - 1, STATS_INPUT.length).getValues();
    const notes = sh.getRange(2, STATS_COLS.length, lastRow - 1, 1).getValues();
    const rows = inputs.map(function (r, i) { return { r: r, n: notes[i] }; })
      .filter(function (x) { return x.r[0] !== ''; });
    const key = function (x) {
      return x.r[0] instanceof Date ? Utilities.formatDate(x.r[0], tz, 'yyyy-MM') : String(x.r[0]);
    };
    rows.sort(function (a, b) { return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0; });
    rows.forEach(function (x) { x.r[0] = key(x); });
    if (rows.length === lastRow - 1) {
      sh.getRange(2, 1, rows.length, STATS_INPUT.length).setValues(rows.map(function (x) { return x.r; }));
      sh.getRange(2, STATS_COLS.length, rows.length, 1).setValues(rows.map(function (x) { return x.n; }));
    }
  }
}

/** อัปเดตแถวตามคีย์ (เขียนเฉพาะช่องที่ส่งมา) หรือเพิ่มแถวใหม่ถ้ายังไม่มี */
function upsert_(tabName, cols, keyField, obj) {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const sh = ss.getSheetByName(tabName);
  const keyIdx = cols.indexOf(keyField);
  const key = String(obj[keyField] || '').trim();
  if (!key) throw new Error('missing ' + keyField);

  const last = sh.getLastRow();
  let rowNum = -1;
  let current = cols.map(function () { return ''; });
  if (last >= 2) {
    const values = sh.getRange(2, 1, last - 1, cols.length).getValues();
    for (let i = 0; i < values.length; i++) {
      let k = values[i][keyIdx];
      if (k instanceof Date) k = Utilities.formatDate(k, tz, 'yyyy-MM-dd');
      if (String(k).trim() === key) {
        rowNum = i + 2;
        current = values[i];
        break;
      }
    }
  }

  const next = cols.map(function (c, j) {
    return Object.prototype.hasOwnProperty.call(obj, c) ? toCell_(c, obj[c]) : current[j];
  });
  if (rowNum < 0) rowNum = Math.max(last, 1) + 1;
  sh.getRange(rowNum, 1, 1, cols.length).setValues([next]);
  return sh;
}

function toCell_(field, v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string' || v === '') return v;
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  if (DATE_ONLY[field] && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return Utilities.parseDate(v, tz, 'yyyy-MM-dd');
  }
  if (DATETIME_FIELDS[field] && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v)) {
    return Utilities.parseDate(v.replace('T', ' ').slice(0, 16), tz, 'yyyy-MM-dd HH:mm');
  }
  return v;
}

function nowStr_() {
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
}
