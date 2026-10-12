import { useCallback, useEffect, useState } from 'react';
import { BedPanel } from './components/BedPanel';
import { Indicators } from './components/Indicators';
import { Monthly } from './components/Monthly';
import { Overview } from './components/Overview';
import { PrintReport, type PrintJob } from './components/PrintReport';
import { SettingsPanel } from './components/SettingsPanel';
import { TopBar } from './components/TopBar';
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

  return (
    <StoreContext.Provider value={store}>
      <div className="screen-only min-h-dvh">
        <TopBar view={view} onView={setView} onSettings={() => setSettings(true)} />
        <main className="mx-auto max-w-[1120px] px-4 pb-24 sm:px-6">
          {view === 'overview' && (
            <Overview onOpenBed={setBed} onAdmit={openAdmit} onView={setView} onSettings={() => setSettings(true)} />
          )}
          {view === 'indicators' && <Indicators onPrint={(date) => setPrintJob({ kind: 'daily', date })} />}
          {view === 'monthly' && <Monthly onPrint={(ym) => setPrintJob({ kind: 'monthly', ym })} />}
        </main>
        <footer className="border-t border-line">
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
    </StoreContext.Provider>
  );
}
