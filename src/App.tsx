import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BedPanel } from './components/BedPanel';
import { Indicators } from './components/Indicators';
import { Monthly } from './components/Monthly';
import { Overview } from './components/Overview';
import { Stats } from './components/Stats';
import { pdfFilename, PrintReport, type PrintJob } from './components/PrintReport';
import { exportPdf } from './lib/pdf';
import { SettingsPanel } from './components/SettingsPanel';
import { TopBar } from './components/TopBar';
import { WallView } from './components/WallView';
import { Toasts } from './components/ui';
import { HOSPITAL } from './lib/constants';
import { useHashView } from './lib/hooks';
import { StoreContext, useIcuStore } from './lib/store';

export default function App() {
  const store = useIcuStore();
  const [view, setView] = useHashView();
  const [bed, setBed] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const [pdfJob, setPdfJob] = useState<PrintJob | null>(null);

  const openAdmit = () => {
    const free = store.data.beds.find((b) => b.status === 'available') ?? store.data.beds.find((b) => b.status === 'cleaning');
    if (free) setBed(free.bedNumber);
  };

  // พิมพ์หลังจากรายงานถูก render แล้ว
  useEffect(() => {
    if (!printJob) return;
    const t = window.setTimeout(() => window.print(), 150);
    const done = () => setPrintJob(null);
    window.addEventListener('afterprint', done);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('afterprint', done);
    };
  }, [printJob]);

  const closeBed = useCallback(() => setBed(null), []);
  const closeSettings = useCallback(() => setSettings(false), []);

  if (view === 'wall') {
    return (
      <StoreContext.Provider value={store}>
        <div className="screen-only">
          <WallView onExit={() => setView('overview')} />
          <Toasts toasts={store.toasts} />
        </div>
      </StoreContext.Provider>
    );
  }

  return (
    <StoreContext.Provider value={store}>
      <div className="screen-only min-h-dvh">
        <div className="ambient" aria-hidden />
        <TopBar view={view} onView={setView} onSettings={() => setSettings(true)} />
        <main className="mx-auto max-w-[1120px] px-4 pb-32 sm:px-6 md:pb-24">
          {view === 'overview' && (
            <Overview onOpenBed={setBed} onAdmit={openAdmit} onView={setView} onSettings={() => setSettings(true)} />
          )}
          {view === 'indicators' && (
            <Indicators
              onPrint={(date) => setPrintJob({ kind: 'daily', date })}
              onPdf={(date) => setPdfJob({ kind: 'daily', date })}
              pdfBusy={!!pdfJob}
            />
          )}
          {view === 'stats' && (
            <Stats
              onPrint={(ym) => setPrintJob({ kind: 'stats', ym })}
              onPdf={(ym) => setPdfJob({ kind: 'stats', ym })}
              pdfBusy={!!pdfJob}
            />
          )}
          {view === 'monthly' && (
            <Monthly
              onPrint={(ym) => setPrintJob({ kind: 'monthly', ym })}
              onPdf={(ym) => setPdfJob({ kind: 'monthly', ym })}
              pdfBusy={!!pdfJob}
            />
          )}
        </main>
        <footer className="border-t border-line pb-24 md:pb-0">
          <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-2 px-4 py-6 text-[12px] text-ink-3 sm:px-6">
            <p>
              {HOSPITAL} · หอผู้ป่วยวิกฤต · ข้อมูลไม่ระบุตัวตนผู้ป่วย
            </p>
            <p>เชื่อมต่อ Google Sheets แบบเรียลไทม์</p>
          </div>
        </footer>
        <BedPanel bedNumber={bed} onClose={closeBed} />
        <SettingsPanel open={settings} onClose={closeSettings} />
        <Toasts toasts={store.toasts} />
      </div>
      {printJob && <PrintReport job={printJob} />}
      {pdfJob && <PdfExporter job={pdfJob} onDone={() => setPdfJob(null)} toast={store.toast} />}
    </StoreContext.Provider>
  );
}

/** สร้างรายงานนอกหน้าจอ (กว้างเท่า A4) แล้วบันทึกเป็นไฟล์ PDF */
function PdfExporter({
  job,
  onDone,
  toast,
}: {
  job: PrintJob;
  onDone: () => void;
  toast: (t: string, tone?: 'default' | 'error') => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const run = async () => {
      await new Promise((r) => window.setTimeout(r, 250)); // รอให้กราฟวาดเสร็จ
      try {
        await exportPdf(ref.current!, pdfFilename(job));
        toast('บันทึกไฟล์ PDF แล้ว');
      } catch (e) {
        console.error(e);
        toast('สร้าง PDF ไม่สำเร็จ ลองใช้ปุ่ม “พิมพ์” แทน', 'error');
      } finally {
        onDone();
      }
    };
    void run();
  }, [job, onDone, toast]);
  return createPortal(
    <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, width: 760, background: '#fff', pointerEvents: 'none' }}>
      <div ref={ref} style={{ width: 760, background: '#fff' }}>
        <PrintReport job={job} mode="pdf" />
      </div>
    </div>,
    document.body,
  );
}
