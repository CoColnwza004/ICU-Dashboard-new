import { HOSPITAL } from '../lib/constants';
import type { View } from '../lib/hooks';
import { useStore } from '../lib/store';
import { MENU_GROUPS } from './Menu';

/** ท้ายหน้าแบบเว็บไซต์ Apple: สารบัญลิงก์ทุกหน้า (ใช้ทุกหน้า ตามโหมดสว่าง/มืด) */
export function SiteFooter({ onGo }: { onGo: (v: View) => void }) {
  const { isStaff } = useStore();
  return (
    <footer className="bg-[var(--footer-bg)] pb-24 text-[12px] text-ink-3 md:pb-0">
      <div className="mx-auto max-w-[1024px] px-4 py-10 sm:px-6">
        <p className="border-b border-line pb-4 leading-relaxed">
          ข้อมูลในเว็บไซต์นี้ไม่ระบุตัวตนผู้ป่วย · ผู้เข้าชมทั่วไปดูข้อมูลได้อย่างเดียว · เจ้าหน้าที่ ICU เข้าสู่ระบบเพื่อแก้ไขข้อมูล
        </p>
        <nav aria-label="สารบัญเว็บไซต์" className="grid grid-cols-2 gap-6 py-6 sm:grid-cols-4">
          {MENU_GROUPS.map((g) => (
            <div key={g.title}>
              <p className="mb-2 font-semibold text-ink">{g.title}</p>
              <ul className="space-y-2">
                {g.items.map((m) => (
                  <li key={m.view}>
                    <button type="button" onClick={() => onGo(m.view)} className="text-left hover:text-ink hover:underline">
                      {m.view === 'admin' && isStaff ? 'เจ้าหน้าที่ ICU (เข้าสู่ระบบแล้ว)' : m.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <p className="border-t border-line pt-4">ICU Smart Center · หอผู้ป่วยวิกฤต {HOSPITAL}</p>
      </div>
    </footer>
  );
}
