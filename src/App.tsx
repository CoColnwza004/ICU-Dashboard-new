import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AdminPage } from './components/AdminPage';
import { BedPanel } from './components/BedPanel';
import { DocsPage, DownloadsPage } from './components/DocsPage';
import { FormsPage } from './components/FormsPage';
import { HomePage } from './components/HomePage';
import { Indicators } from './components/Indicators';
import { KpiPage } from './components/KpiPage';
import { MenuSheet } from './components/Menu';
import { Monthly } from './components/Monthly';
import { NewsPage } from './components/NewsPage';
import { Overview } from './components/Overview';
import { isLandscape, pdfFilename, PrintReport, type PrintJob } from './components/PrintReport';
import { RosterPage } from './components/RosterPage';
import { SettingsPanel } from './components/SettingsPanel';
import { StaffPage } from './components/StaffPage';
import { Stats } from './components/Stats';
import { DashboardNav, TopBar } from './components/TopBar';
import { Popup } from './components/ui';
import { enterFullscreen, WallView } from './components/WallView';
import { HOSPITAL } from './lib/constants';
import { exportPdf } from './lib/pdf';
import { sectionOf, useHashView, type Intent, type View } from './lib/hooks';
import { StoreContext, useIcuStore } from './lib/store';

export default function App() {
  const store = useIcuStore();
  const { view, intent, go, clearIntent } = useHashView();
  const [bed, setBed] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [menu, setMenu] = useState(false);
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const [pdfJob, setPdfJob] = useState<PrintJob | null>(null);
  const { isStaff } = store;

  const navigate = useCallback(
    (v: View, i: Intent | null = null) => {
      if (v === 'wall') void enterFullscreen();
      go(v, i);
    },
    [go],
  );

  const openAdmit = useCallback(() => {
    const free = store.data.beds.find((b) => b.status === 'available') ?? store.data.beds.find((b) => b.status === 'cleaning');
    if (free) setBed(free.bedNumber);
    else store.toast('ไม่มีเตียงว่าง', 'error', 'ทุกเตียงมีผู้ป่วยอยู่');
  }, [store]);

  // มาจากหน้าเจ้าหน้าที่: “รับผู้ป่วย” → เปิดหน้าต่างรับผู้ป่วยทันที
  useEffect(() => {
    if (view === 'overview' && intent === 'admit') {
      if (isStaff) openAdmit();
      clearIntent();
    }
  }, [view, intent, isStaff, openAdmit, clearIntent]);

  // ออกจากระบบ → ปิดหน้าต่างแก้ไขที่เปิดค้าง
  useEffect(() => {
    if (!isStaff) {
      setBed(null);
      setSettings(false);
    }
  }, [isStaff]);

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
  const openSettings = isStaff ? () => setSettings(true) : undefined;
  const started = intent ? clearIntent : undefined;

  const popup = <Popup notice={store.notice} onClose={store.dismissNotice} />;

  if (view === 'wall') {
    return (
      <StoreContext.Provider value={store}>
        <div className="screen-only">
          <WallView onExit={() => go('home')} />
        </div>
        {popup}
      </StoreContext.Provider>
    );
  }

  return (
    <StoreContext.Provider value={store}>
      <div className="screen-only min-h-dvh">
        <div className="ambient" aria-hidden />
        <TopBar view={view} onView={(v) => navigate(v)} onSettings={openSettings} onMenu={() => setMenu(true)} />
        <main className="mx-auto max-w-[1120px] px-4 pb-32 sm:px-6 md:pb-24">
          {sectionOf(view) === 'dashboard' && <DashboardNav view={view} onView={(v) => navigate(v)} />}
          {view === 'home' && <HomePage onGo={(v) => navigate(v)} />}
          {view === 'admin' && <AdminPage onGo={navigate} onSettings={() => setSettings(true)} />}
          {view === 'news' && <NewsPage startNew={intent === 'new'} onStarted={started} />}
          {view === 'kpi' && <KpiPage startEntry={intent === 'entry'} onStarted={started} />}
          {view === 'forms' && <FormsPage startNew={intent === 'new'} onStarted={started} />}
          {view === 'downloads' && <DownloadsPage startNew={intent === 'new'} onStarted={started} />}
          {view === 'docs' && <DocsPage scope="manuals" startNew={intent === 'new'} onStarted={started} />}
          {view === 'guidelines' && <DocsPage scope="guidelines" startNew={intent === 'new'} onStarted={started} />}
          {view === 'roster' && (
            <RosterPage
              onPrint={(ym) => setPrintJob({ kind: 'roster', ym })}
              onPdf={(ym) => setPdfJob({ kind: 'roster', ym })}
              pdfBusy={!!pdfJob}
              startEdit={intent === 'entry'}
              onStarted={started}
            />
          )}
          {view === 'staff' && <StaffPage startNew={intent === 'new'} onStarted={started} />}
          {view === 'overview' && (
            <Overview onOpenBed={setBed} onAdmit={openAdmit} onView={(v) => navigate(v)} onSettings={openSettings} />
          )}
          {view === 'indicators' && (
            <Indicators
              onPrint={(date) => setPrintJob({ kind: 'daily', date })}
              onPdf={(date) => setPdfJob({ kind: 'daily', date })}
              pdfBusy={!!pdfJob}
              startEdit={intent === 'entry'}
              onStarted={started}
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
            <p>{HOSPITAL} · หอผู้ป่วยวิกฤต · ข้อมูลไม่ระบุตัวตนผู้ป่วย</p>
            <button type="button" onClick={() => navigate('admin')} className="hover:text-ink">
              {isStaff ? 'เจ้าหน้าที่ ICU · เข้าสู่ระบบแล้ว' : 'สำหรับเจ้าหน้าที่ ICU'}
            </button>
          </div>
        </footer>
        <MenuSheet open={menu} onClose={() => setMenu(false)} onGo={(v) => navigate(v)} />
        {isStaff && <BedPanel bedNumber={bed} onClose={closeBed} />}
        {isStaff && <SettingsPanel open={settings} onClose={closeSettings} />}
      </div>
      {popup}
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
