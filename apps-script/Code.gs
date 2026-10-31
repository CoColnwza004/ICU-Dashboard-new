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
 *
 * ครั้งแรกหลังวางโค้ดเวอร์ชันนี้: เลือกฟังก์ชัน authorize แล้วกด Run เพื่ออนุญาตให้บันทึกรูปลง Google Drive
 *
 * แก้ไขข้อมูลในชีตได้ตามปกติ เว็บจะดึงข้อมูลใหม่ภายในไม่กี่วินาที
 * และเมื่อแก้ไขบนเว็บ ข้อมูลจะถูกเขียนกลับมาที่ชีตนี้ทันที
 * (อย่าสลับลำดับคอลัมน์ — เพิ่มแถวได้ เช่น เพิ่มเตียง ICU-09 ในแท็บ Beds)
 */

// (ไม่บังคับ) ตั้งรหัสลับ แล้วใส่รหัสเดียวกันในหน้าเชื่อมต่อของเว็บ
const API_TOKEN = '';

const TAB = { beds: 'Beds', daily: 'Daily', log: 'Log', stats: 'Stats', staff: 'Staff', roster: 'Roster' };
const DEFAULT_BED_COUNT = 8;

const BED_COLS = [
  'bedNumber', 'status', 'caseCode', 'acuity', 'ageGroup', 'gender',
  'onVentilator', 'hasCLine', 'hasFoley', 'hasMdr', 'hasIvHl', 'hasPiHome', 'hasHapBundle', 'hasBradenUnder12',
  'admittedAt', 'clinicalGoals', 'updatedAt',
];
const BED_HEAD = [
  'เตียง', 'สถานะ', 'รหัสเคส', 'ระดับความรุนแรง', 'ช่วงอายุ', 'เพศ',
  'Ventilator', 'C-Line', 'Foley', 'MDR', 'IV/HL', 'PI_Home', 'HAP_Bundle', 'Braden < 12',
  'วันที่รับเข้า', 'เป้าหมาย / หมายเหตุ', 'อัปเดตล่าสุด',
];
const BED_BOOL_FROM = 7; // คอลัมน์ G
const BED_BOOL_COUNT = 8; // G..N

const DAILY_COLS = [
  'date', 'admittedNew', 'totalInWard', 'referCount', 'deathCount',
  'ventilatorCount', 'cLineCount', 'foleyCount', 'mdrCount', 'ivHlCount',
  'piHomeCount', 'hapBundleCount', 'bradenUnder12Count', 'notes',
];
const DAILY_HEAD = [
  'วันที่', 'รับใหม่', 'ผู้ป่วยในวอร์ด', 'Refer', 'เสียชีวิต',
  'Ventilator', 'C-Line', 'Foley', 'MDR', 'IV/HL',
  'PI_Home', 'HAP_Bundle', 'Braden < 12', 'หมายเหตุ',
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

const STATUS_TH = { available: 'ว่าง', occupied: 'มีผู้ป่วย', cleaning: 'ทำความสะอาด' };
const EVENT_TH = {
  admit: 'รับเข้า', home: 'จำหน่ายกลับบ้าน', ward: 'ย้ายวอร์ด', refer: 'ส่งต่อ (Refer)', expired: 'เสียชีวิต', move: 'ย้ายเตียง',
};
const DATETIME_FIELDS = { admittedAt: true, updatedAt: true, timestamp: true };

/* ------------------------------------------------------------------ */
/* Web app entry points                                                */
/* ------------------------------------------------------------------ */

function doGet(e) {
  return respond_(function () {
    checkToken_(e && e.parameter && e.parameter.token);
    ensureSetup_();
    return snapshot_(e && e.parameter && e.parameter.parts);
  });
}

function doPost(e) {
  return respond_(function () {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkToken_(body.token);
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      ensureSetup_();
      (body.ops || []).forEach(applyOp_);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
    return snapshot_();
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
/* Menu & setup                                                        */
/* ------------------------------------------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ICU Dashboard')
    .addItem('ตั้งค่า / ซ่อมแซมแท็บ', 'setup')
    .addToUi();
}

function setup() {
  ensureSetup_(true);
}

/** กด Run ฟังก์ชันนี้ 1 ครั้งในหน้า Apps Script เพื่ออนุญาตให้สคริปต์บันทึกรูปบุคลากรลง Google Drive */
function authorize() {
  SpreadsheetApp.getActive().getName();
  photoFolder_();
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
  };
  if (!force && existed.beds && existed.daily && existed.log && existed.stats && existed.staff && existed.roster) return;

  const beds = sheet_(TAB.beds, BED_HEAD);
  const daily = sheet_(TAB.daily, DAILY_HEAD);
  const log = sheet_(TAB.log, LOG_HEAD);
  const stats = sheet_(TAB.stats, STATS_HEAD);
  const staff = sheet_(TAB.staff, STAFF_HEAD);
  const roster = sheet_(TAB.roster, ROSTER_HEAD);

  if (beds.getLastRow() < 2) {
    const now = new Date();
    const names = [];
    for (let i = 1; i <= DEFAULT_BED_COUNT; i++) names.push('ICU-' + (i < 10 ? '0' : '') + i);
    const rows = names.map(function (b) {
      const r = BED_COLS.map(function () { return ''; });
      r[0] = b;
      r[1] = STATUS_TH.available;
      for (let i = 0; i < BED_BOOL_COUNT; i++) r[BED_BOOL_FROM - 1 + i] = false;
      r[BED_COLS.length - 1] = now;
      return r;
    });
    beds.getRange(2, 1, rows.length, BED_COLS.length).setValues(rows);
  }

  const maxRows = 20;
  // ใช้ data validation แบบ checkbox (insertCheckboxes() จะรีเซ็ตค่าเดิมเป็น false)
  beds.getRange(2, BED_BOOL_FROM, maxRows, BED_BOOL_COUNT).setDataValidation(
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

  const first = ss.getSheets()[0];
  if (first && first.getName() !== TAB.beds && first.getLastRow() === 0 && ss.getSheets().length > 6) {
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

/** parts = 'core' → เฉพาะข้อมูลที่เปลี่ยนบ่อย (เตียง/รายวัน/Log/Stats) · อื่น ๆ → รวมบุคลากรและตารางเวร */
function snapshot_(parts) {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const beds = ss.getSheetByName(TAB.beds);
  const daily = ss.getSheetByName(TAB.daily);
  const log = ss.getSheetByName(TAB.log);
  const stats = ss.getSheetByName(TAB.stats);
  const staff = ss.getSheetByName(TAB.staff);
  const roster = ss.getSheetByName(TAB.roster);
  const out = {
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    title: ss.getName(),
    timeZone: tz,
    gids: {
      beds: beds.getSheetId(), daily: daily.getSheetId(), log: log.getSheetId(), stats: stats.getSheetId(),
      staff: staff.getSheetId(), roster: roster.getSheetId(),
    },
    beds: readRows_(beds, BED_COLS, tz),
    daily: readRows_(daily, DAILY_COLS, tz),
    logs: readRows_(log, LOG_COLS, tz),
    stats: readRows_(stats, STATS_COLS, tz),
    serverTime: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss"),
  };
  if (parts !== 'core') {
    out.staff = readRows_(staff, STAFF_COLS, tz).map(function (r) {
      r.active = String(r.active).trim() !== STAFF_INACTIVE;
      return r;
    });
    out.roster = readRoster_(roster, tz);
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
        v = c === 'date'
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
  if (op.type === 'uploadPhoto') return uploadPhoto_(op.staffId, op.dataUrl);
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
  const it = DriveApp.getFoldersByName(PHOTO_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(PHOTO_FOLDER);
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
  if (field === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
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
