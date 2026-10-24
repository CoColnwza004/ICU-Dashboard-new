/**
 * บันทึกรายงานเป็นไฟล์ PDF ลงเครื่อง (ไม่ต้องผ่านหน้าพิมพ์)
 * แปลงหน้ารายงานเป็นภาพความละเอียดสูง แล้วแบ่งหน้า A4 ตรงรอยต่อของแถว/หัวข้อ ไม่ให้ตัดกลางบรรทัด
 * โหลดไลบรารีเฉพาะตอนกดปุ่ม เพื่อไม่ให้หน้าเว็บช้าลง
 */
export async function exportPdf(node: HTMLElement, filename: string) {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  await document.fonts.ready;

  const scale = 2;
  const canvas = await toCanvas(node, { pixelRatio: scale, backgroundColor: '#ffffff', cacheBust: true });

  // ตำแหน่งที่ตัดหน้าได้อย่างปลอดภัย (ขอบบน/ล่างของแถวตาราง หัวข้อ และกล่องต่าง ๆ)
  const top = node.getBoundingClientRect().top;
  const safe = new Set<number>();
  node.querySelectorAll('tr, section, header, footer, [data-pdf-break]').forEach((el) => {
    const r = el.getBoundingClientRect();
    safe.add(Math.round(r.top - top));
    safe.add(Math.round(r.bottom - top));
  });
  const breaks = [...safe].sort((a, b) => a - b);

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const margin = 12;
  const footer = 6;
  const contentW = 210 - margin * 2;
  const contentH = 297 - margin * 2 - footer;
  const pxPerMm = node.offsetWidth / contentW;
  const pagePx = Math.floor(contentH * pxPerMm);
  const total = node.scrollHeight;

  let y = 0;
  let pages = 0;
  while (y < total - 2) {
    let end = Math.min(total, y + pagePx);
    if (end < total) {
      const ok = breaks.filter((b) => b > y + pagePx * 0.4 && b <= end);
      if (ok.length) end = ok[ok.length - 1];
    }
    const h = end - y;
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.ceil(h * scale);
    const ctx = slice.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, Math.round(y * scale), canvas.width, slice.height, 0, 0, slice.width, slice.height);
    if (pages > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, contentW, h / pxPerMm);
    pages += 1;
    y = end;
  }

  pdf.setFontSize(8);
  pdf.setTextColor(120);
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.text(`${i} / ${pages}`, 210 - margin, 297 - margin + 2, { align: 'right' });
  }
  const url = URL.createObjectURL(pdf.output('blob'));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
