/** โหมดเต็มจอของเบราว์เซอร์ (รวม Safari ที่ใช้คำสั่ง webkit) */
type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

export const fsElement = () => document.fullscreenElement ?? (document as FsDoc).webkitFullscreenElement ?? null;
export const canFullscreen = () => {
  const el = document.documentElement as FsEl;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
};
export const enterFullscreen = async () => {
  const el = document.documentElement as FsEl;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
  } catch {
    /* เบราว์เซอร์ไม่อนุญาต (เช่น iPhone) — ยังแสดงโหมดจอแสดงผลได้ตามปกติ */
  }
};
export const exitFullscreen = async () => {
  const d = document as FsDoc;
  try {
    if (document.exitFullscreen && document.fullscreenElement) await document.exitFullscreen();
    else if (d.webkitExitFullscreen && d.webkitFullscreenElement) await d.webkitExitFullscreen();
  } catch {
    /* ignore */
  }
};

