import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { HomePage } from './components/HomePage';
import { MenuSheet } from './components/Menu';
import type { PrintJob } from './components/PrintReport';
import { SiteFooter } from './components/SiteFooter';
import { DashboardNav, TopBar } from './components/TopBar';
import { Popup } from './components/ui';
import { enterFullscreen } from './lib/fullscreen';
import { sectionOf, useHashView, type Intent, type View } from './lib/hooks';
import { StoreContext, SyncContext, useIcuStore } from './lib/store';
import { nextPref, useApplyTheme, useThemePref } from './lib/theme';

/* หน้าอื่น ๆ โหลดเมื่อใช้ (หน้าแรกเปิดเร็วขึ้น) แล้วโหลดล่วงหน้าตอนเครื่องว่าง → เปลี่ยนหน้าได้ทันที */
const pages = {
  overview: () => import('./components/Overview'),
  indicators: () => import('./components/Indicators'),
  stats: () => import('./components/Stats'),
  monthly: () => import('./components/Monthly'),
  roster: () => import('./components/RosterPage'),
  staff: () => import('./components/StaffPage'),
  docs: () => import('./components/DocsPage'),
  news: () => import('./components/NewsPage'),
  kpi: () => import('./components/KpiPage'),
  forms: () => import('./components/FormsPage'),
  admin: () => import('./components/AdminPage'),
  wall: () => import('./components/WallView'),
  bed: () => import('./components/BedPanel'),
  settings: () => import('./components/SettingsPanel'),
  print: () => import('./components/PrintReport'),
  pdf: () => import('./components/PdfExporter'),
};
const Overview = lazy(() => pages.overview().then((m) => ({ default: m.Overview })));
const Indicators = lazy(() => pages.indicators().then((m) => ({ default: m.Indicators })));
const Stats = lazy(() => pages.stats().then((m) => ({ default: m.Stats })));
const Monthly = lazy(() => pages.monthly().then((m) => ({ default: m.Monthly })));
const RosterPage = lazy(() => pages.roster().then((m) => ({ default: m.RosterPage })));
const StaffPage = lazy(() => pages.staff().then((m) => ({ default: m.StaffPage })));
const DocsPage = lazy(() => pages.docs().then((m) => ({ default: m.DocsPage })));
const DownloadsPage = lazy(() => pages.docs().then((m) => ({ default: m.DownloadsPage })));
const NewsPage = lazy(() => pages.news().then((m) => ({ default: m.NewsPage })));
const KpiPage = lazy(() => pages.kpi().then((m) => ({ default: m.KpiPage })));
const FormsPage = lazy(() => pages.forms().then((m) => ({ default: m.FormsPage })));
const AdminPage = lazy(() => pages.admin().then((m) => ({ default: m.AdminPage })));
const WallView = lazy(() => pages.wall().then((m) => ({ default: m.WallView })));
const BedPanel = lazy(() => pages.bed().then((m) => ({ default: m.BedPanel })));
const SettingsPanel = lazy(() => pages.settings().then((m) => ({ default: m.SettingsPanel })));
const PrintReport = lazy(() => pages.print().then((m) => ({ default: m.PrintReport })));
const PdfExporter = lazy(() => pages.pdf().then((m) => ({ default: m.PdfExporter })));

const usePrefetchPages = () => {
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const run = () => Object.values(pages).forEach((load) => void load().catch(() => {}));
    if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 });
    else window.setTimeout(run, 2500);
  }, []);
};

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="กำลังโหลด">
      <span className="animate-spin-slow size-7 rounded-full border-[3px] border-fill border-t-accent" />
    </div>
  );
}

const Lazy = ({ children }: { children: ReactNode }) => <Suspense fallback={<PageFallback />}>{children}</Suspense>;

export default function App() {
  const { store, sync } = useIcuStore();
  usePrefetchPages();
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

  // เปลี่ยนหน้า → ขึ้นบนสุดทันที (ไม่ใช้ smooth: Safari จะยกเลิกการเลื่อนเมื่อความสูงหน้าเปลี่ยน แล้วค้างอยู่ด้านล่าง)
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  // ธีม: หน้าแรกพื้นดำเสมอ · หน้าอื่นตามที่เลือก (ตามเครื่อง / สว่าง / มืด)
  const apple = view === 'home';
  const [theme, setTheme] = useThemePref();
  useApplyTheme(theme, apple);

  // พิมพ์หลังจากรายงานถูก render แล้ว
  useEffect(() => {
    if (!printJob) return;
    let t = 0;
    let cancelled = false;
    // รอให้โค้ดรายงานโหลดและแสดงผลก่อน แล้วค่อยเปิดหน้าต่างพิมพ์
    void pages.print().then(() => {
      if (!cancelled) t = window.setTimeout(() => window.print(), 300);
    });
    const done = () => setPrintJob(null);
    window.addEventListener('afterprint', done);
    return () => {
      cancelled = true;
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
        <SyncContext.Provider value={sync}>
          <div className="screen-only">
            <Lazy>
              <WallView onExit={() => go('home')} />
            </Lazy>
          </div>
          {popup}
        </SyncContext.Provider>
      </StoreContext.Provider>
    );
  }

  return (
    <StoreContext.Provider value={store}>
      <SyncContext.Provider value={sync}>
      <div className="screen-only min-h-dvh">
        <TopBar
          view={view}
          onView={(v) => navigate(v)}
          onSettings={openSettings}
          onMenu={() => setMenu(true)}
          theme={theme}
          onTheme={apple ? undefined : () => setTheme(nextPref(theme))}
        />
        {apple && (
          <main>
            <HomePage onGo={(v) => navigate(v)} />
          </main>
        )}
        {!apple && (
          <main className="mx-auto max-w-[1080px] px-4 pb-20 sm:px-6 sm:pb-28">
            <Lazy>
            {sectionOf(view) === 'dashboard' && <DashboardNav view={view} onView={(v) => navigate(v)} />}
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
            </Lazy>
          </main>
        )}
        <SiteFooter onGo={(v) => navigate(v)} />
        <MenuSheet open={menu} onClose={() => setMenu(false)} onGo={(v) => navigate(v)} />
        <Suspense fallback={null}>
          {isStaff && <BedPanel bedNumber={bed} onClose={closeBed} />}
          {isStaff && settings && <SettingsPanel open={settings} onClose={closeSettings} />}
        </Suspense>
      </div>
      {popup}
      <Suspense fallback={null}>
        {printJob && <PrintReport job={printJob} />}
        {pdfJob && <PdfExporter job={pdfJob} onDone={() => setPdfJob(null)} toast={store.toast} />}
      </Suspense>
      </SyncContext.Provider>
    </StoreContext.Provider>
  );
}
