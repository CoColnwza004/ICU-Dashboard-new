import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { exportPdf } from '../lib/pdf';
import { isLandscape, pdfFilename, PrintReport, type PrintJob } from './PrintReport';

/** สร้างรายงานนอกหน้าจอ (กว้างเท่า A4) แล้วบันทึกเป็นไฟล์ PDF */
export function PdfExporter({
  job,
  onDone,
  toast,
}: {
  job: PrintJob;
  onDone: () => void;
  toast: (t: string, tone?: 'default' | 'error', detail?: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const W = isLandscape(job) ? 1100 : 760;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const run = async () => {
      await new Promise((r) => window.setTimeout(r, 250)); // รอให้กราฟวาดเสร็จ
      try {
        await exportPdf(ref.current!, pdfFilename(job), isLandscape(job));
        toast('บันทึกไฟล์ PDF แล้ว');
      } catch (e) {
        console.error(e);
        toast('สร้าง PDF ไม่สำเร็จ', 'error', 'ลองใช้ปุ่ม “พิมพ์” แทน');
      } finally {
        onDone();
      }
    };
    void run();
  }, [job, onDone, toast]);
  return createPortal(
    <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, width: W, background: '#fff', pointerEvents: 'none' }}>
      <div ref={ref} style={{ width: W, background: '#fff' }}>
        <PrintReport job={job} mode="pdf" />
      </div>
    </div>,
    document.body,
  );
}
