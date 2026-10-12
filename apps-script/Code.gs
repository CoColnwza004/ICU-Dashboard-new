/**
 * ICU Dashboard — Google Sheets API
 * --------------------------------------------------------------
 * วางโค้ดนี้ใน Google Sheet: ส่วนขยาย (Extensions) › Apps Script
 * แล้ว Deploy เป็น Web app (Execute as: Me, Who has access: Anyone)
 * นำลิงก์ที่ลงท้ายด้วย /exec ไปวางในหน้า "เชื่อมต่อ Google Sheet" ของเว็บ
 *
 * ชีตจะถูกสร้างให้อัตโนมัติ 3 แท็บ:
 *   Beds  — สถานะเตียงปัจจุบัน (1 แถว = 1 เตียง)
 *   Daily — 12 ตัวชี้วัดรายวัน (1 แถว = 1 วัน)
 *   Log   — ทะเบียนรับเข้า / จำหน่าย
 *
 * แก้ไขข้อมูลในชีตได้ตามปกติ เว็บจะดึงข้อมูลใหม่ภายในไม่กี่วินาที
 * และเมื่อแก้ไขบนเว็บ ข้อมูลจะถูกเขียนกลับมาที่ชีตนี้ทันที
 * (อย่าสลับลำดับคอลัมน์ — เพิ่มแถวได้ เช่น เพิ่มเตียง ICU-05 ในแท็บ Beds)
 */

// (ไม่บังคับ) ตั้งรหัสลับ แล้วใส่รหัสเดียวกันในหน้าเชื่อมต่อของเว็บ
const API_TOKEN = '';

const TAB = { beds: 'Beds', daily: 'Daily', log: 'Log' };

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

const STATUS_TH = { available: 'ว่าง', occupied: 'มีผู้ป่วย', cleaning: 'ทำความสะอาด' };
const EVENT_TH = {
  admit: 'รับเข้า', home: 'จำหน่ายกลับบ้าน', ward: 'ย้ายวอร์ด', refer: 'ส่งต่อ (Refer)', expired: 'เสียชีวิต',
};
const DATETIME_FIELDS = { admittedAt: true, updatedAt: true, timestamp: true };

/* ------------------------------------------------------------------ */
/* Web app entry points                                                */
/* ------------------------------------------------------------------ */

function doGet(e) {
  return respond_(function () {
    checkToken_(e && e.parameter && e.parameter.token);
    ensureSetup_();
    return snapshot_();
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

function ensureSetup_(force) {
  const ss = SpreadsheetApp.getActive();
  const existed = {
    beds: !!ss.getSheetByName(TAB.beds),
    daily: !!ss.getSheetByName(TAB.daily),
    log: !!ss.getSheetByName(TAB.log),
  };
  if (!force && existed.beds && existed.daily && existed.log) return;

  const beds = sheet_(TAB.beds, BED_HEAD);
  const daily = sheet_(TAB.daily, DAILY_HEAD);
  const log = sheet_(TAB.log, LOG_HEAD);

  if (beds.getLastRow() < 2) {
    const now = new Date();
    const rows = ['ICU-01', 'ICU-02', 'ICU-03', 'ICU-04'].map(function (b) {
      const r = BED_COLS.map(function () { return ''; });
      r[0] = b;
      r[1] = STATUS_TH.available;
      for (let i = 0; i < BED_BOOL_COUNT; i++) r[BED_BOOL_FROM - 1 + i] = false;
      r[BED_COLS.length - 1] = now;
      return r;
    });
    beds.getRange(2, 1, rows.length, BED_COLS.length).setValues(rows);
  }

  const maxRows = 60;
  // ใช้ data validation แบบ checkbox (insertCheckboxes() จะรีเซ็ตค่าเดิมเป็น false)
  beds.getRange(2, BED_BOOL_FROM, maxRows, BED_BOOL_COUNT).setDataValidation(
    SpreadsheetApp.newDataValidation().requireCheckbox().build());
  beds.getRange(2, 2, maxRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(
      [STATUS_TH.available, STATUS_TH.occupied, STATUS_TH.cleaning], true).setAllowInvalid(true).build());
  beds.getRange(2, 4, maxRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(
      ['Critical', 'High', 'Moderate', 'Stable'], true).setAllowInvalid(true).build());
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

  const first = ss.getSheets()[0];
  if (first && first.getName() !== TAB.beds && first.getLastRow() === 0 && ss.getSheets().length > 3) {
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

function snapshot_() {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const beds = ss.getSheetByName(TAB.beds);
  const daily = ss.getSheetByName(TAB.daily);
  const log = ss.getSheetByName(TAB.log);
  return {
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    title: ss.getName(),
    timeZone: tz,
    gids: { beds: beds.getSheetId(), daily: daily.getSheetId(), log: log.getSheetId() },
    beds: readRows_(beds, BED_COLS, tz),
    daily: readRows_(daily, DAILY_COLS, tz),
    logs: readRows_(log, LOG_COLS, tz),
    serverTime: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss"),
  };
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
