/**
 * บันทึกรายงานเป็นไฟล์ PDF ลงเครื่อง (ไม่ต้องผ่านหน้าพิมพ์)
 * แปลงหน้ารายงานเป็นภาพความละเอียดสูง แล้วแบ่งหน้า A4 ตรงรอยต่อของแถว/หัวข้อ ไม่ให้ตัดกลางบรรทัด
 * โหลดไลบรารีเฉพาะตอนกดปุ่ม เพื่อไม่ให้หน้าเว็บช้าลง
 */
export async function exportPdf(node: HTMLElement, filename: string, landscape = false, opts: { onePage?: boolean } = {}) {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  await document.fonts.ready;

  const scale = 2;
  // รายงานที่จัดเป็นหน้า ๆ ไว้แล้ว (data-pdf-page): 1 หน้า = กระดาษ 1 แผ่น ไม่ตัดข้ามหน้า · ตัวอักษรเท่ากันทุกหน้า
  const pageEls = [...node.querySelectorAll<HTMLElement>('[data-pdf-page]')];
  if (pageEls.length) {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait', compress: true });
    const pageW = landscape ? 297 : 210;
    const pageH = landscape ? 210 : 297;
    const margin = landscape ? 8 : 10;
    const contentW = pageW - margin * 2;
    const contentH = pageH - margin * 2 - 4;
    // ภาพทุกหน้าก่อน (หาใหม่ทุกหน้า: ระหว่างสร้าง PDF หน้าเว็บอาจวาดรายงานใหม่ ทำให้องค์ประกอบเดิมหลุด)
    const shots: HTMLCanvasElement[] = [];
    for (let i = 0; i < pageEls.length; i++) {
      const el = node.querySelectorAll<HTMLElement>('[data-pdf-page]')[i] ?? pageEls[i];
      const c = await toCanvas(el, { pixelRatio: scale, backgroundColor: '#ffffff', cacheBust: true });
      if (c.width && c.height) shots.push(c);
    }
    // ย่อทุกหน้าด้วยอัตราเดียวกัน (อัตราของหน้าที่ต้องย่อมากที่สุด) → ตัวอักษรขนาดเท่ากันทุกหน้า
    const k = Math.min(1, ...shots.map((c) => contentH / ((c.height / c.width) * contentW)));
    shots.forEach((c, i) => {
      const w = contentW * k;
      const h = (c.height / c.width) * w;
      if (i > 0) pdf.addPage();
      pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', margin + (contentW - w) / 2, margin, w, h);
    });
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    for (let i = 1; i <= pdf.getNumberOfPages(); i++) {
      pdf.setPage(i);
      pdf.text(`${i} / ${pdf.getNumberOfPages()}`, pageW - margin, pageH - margin + 3, { align: 'right' });
    }
    save(pdf.output('blob'), filename);
    return;
  }

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

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait', compress: true });
  const pageW = landscape ? 297 : 210;
  const pageH = landscape ? 210 : 297;
  const margin = landscape ? 8 : 12;
  const footer = 6;
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin * 2 - footer;
  const pxPerMm = node.offsetWidth / contentW;
  const pagePx = Math.floor(contentH * pxPerMm);
  const total = node.scrollHeight;

  let y = 0;
  let pages = 0;
  // รายงานหน้าเดียว (เช่น รายงานประจำเวร): ย่อให้พอดีกระดาษ 1 แผ่นเสมอ
  if (opts.onePage) {
    const wMm = Math.min(contentW, (contentH * node.offsetWidth) / total);
    const hMm = (total / node.offsetWidth) * wMm;
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin + (contentW - wMm) / 2, margin, wMm, hMm);
    pages = 1;
    y = total;
  }
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
    pdf.text(`${i} / ${pages}`, pageW - margin, pageH - margin + 2, { align: 'right' });
  }
  save(pdf.output('blob'), filename);
}

const save = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
};

/** บันทึกเป็นรูปภาพ PNG (ความละเอียด 2 เท่า) */
export async function exportPng(node: HTMLElement, filename: string) {
  const { toBlob } = await import('html-to-image');
  await document.fonts.ready;
  const blob = await toBlob(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
  if (!blob) throw new Error('สร้างรูปภาพไม่สำเร็จ');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
