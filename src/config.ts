/**
 * Google Sheet ที่เว็บเชื่อมต่อโดยอัตโนมัติ (Apps Script Web app ของชีต "ICU dashboard")
 * ทุกเครื่องที่เปิดเว็บจะเชื่อมกับชีตนี้ทันที ไม่ต้องวางลิงก์เอง
 * เปลี่ยนชีตได้ 2 ทาง: แก้ค่านี้ หรือตั้ง VITE_SHEETS_API_URL ตอน deploy (มีผลก่อนค่านี้)
 */
export const DEFAULT_SHEETS_API_URL =
  'https://script.google.com/macros/s/AKfycbywe8qltl6iKiA8Gz_JV-R7VVaZ7KJEQ_v2Y_GPZ1r2VRRZkQCqYL5jIFtEYXQCghHg/exec';
