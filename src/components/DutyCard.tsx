import { ChevronRight, Star } from 'lucide-react';
import { fmtDateLong } from '../lib/date';
import { occupied } from '../lib/logic';
import { currentDuty, hasRoster, isNurse, ratioText, SHIFT_BY_KEY, shortName } from '../lib/roster';
import { useNow } from '../lib/hooks';
import { useStore } from '../lib/store';
import { Avatar } from './Avatar';

/** ทีมที่อยู่เวรตอนนี้ + อัตราส่วนพยาบาล : ผู้ป่วย */
export function DutyCard({ onOpenRoster, compact }: { onOpenRoster?: () => void; compact?: boolean }) {
  const { data } = useStore();
  const now = useNow(60_000);
  const { shift, date, team } = currentDuty(data, new Date(now));
  const def = SHIFT_BY_KEY[shift];
  const nurses = team.filter(isNurse).length;
  const patients = occupied(data.beds).length;
  const lead = team.find((t) => t.lead);

  if (!hasRoster(data, date.slice(0, 7))) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <p className="eyebrow">ทีมเวรนี้ · {def.label}</p>
          <p className="mt-1 text-[15px] text-ink-2">ยังไม่มีตารางเวรของเดือนนี้</p>
        </div>
        {onOpenRoster && (
          <button type="button" onClick={onOpenRoster} className="link inline-flex items-center text-[14px]">
            จัดตารางเวร <ChevronRight className="size-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={compact ? 'card flex flex-col p-[1.8vmin]' : 'card p-6 sm:p-7'}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <p className={compact ? 'text-[clamp(12px,1.5vmin,20px)] font-semibold text-ink-2' : 'eyebrow'}>
            ทีมเวรนี้ · {def.label} {def.time}
          </p>
          {!compact && <p className="mt-1 text-[13px] text-ink-3">{fmtDateLong(date)}</p>}
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className={compact ? 'text-[clamp(10px,1.2vmin,16px)] text-ink-3' : 'text-[12px] text-ink-3'}>พยาบาล : ผู้ป่วย</p>
            <p className={compact ? 'num text-[clamp(16px,2.4vmin,34px)] font-semibold' : 'num text-[24px] font-semibold'}>
              {ratioText(nurses, patients)}
            </p>
          </div>
          {onOpenRoster && !compact && (
            <button type="button" onClick={onOpenRoster} className="link inline-flex items-center text-[14px]">
              ตารางเวร <ChevronRight className="size-4" />
            </button>
          )}
        </div>
      </div>

      {team.length === 0 ? (
        <p className="mt-4 text-[14px] text-ink-3">ไม่มีผู้อยู่เวรนี้ในตารางเวร</p>
      ) : (
        compact ? (
          <ul className="mt-[1vmin] flex min-h-0 flex-wrap gap-[0.7vmin] overflow-hidden">
            {team.map((t, i) => (
              <li key={`${t.name}-${i}`} className="well inline-flex items-center gap-1.5 rounded-full py-[0.4vmin] pr-[1.1vmin] pl-[0.4vmin]">
                <Avatar staff={t.staff} name={t.name} size={30} />
                <span className="text-[clamp(11px,1.4vmin,18px)] font-medium">{shortName(t.staff, t.name)}</span>
                {t.lead && <Star className="size-3 fill-warn text-warn" aria-label="หัวหน้าเวร" />}
              </li>
            ))}
          </ul>
        ) : (
        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-4">
          {team.map((t, i) => (
            <li key={`${t.name}-${i}`} className="flex w-[72px] flex-col items-center text-center">
              <Avatar staff={t.staff} name={t.name} size={52} ring={t.lead} />
              <span className="mt-1.5 w-full truncate text-[12px] font-medium">{shortName(t.staff, t.name)}</span>
              <span className="flex items-center gap-0.5 truncate text-[10px] text-ink-3">
                {t.lead && <Star className="size-2.5 fill-warn text-warn" />}
                {t.lead ? 'หัวหน้าเวร' : t.staff?.group ?? ''}
              </span>
            </li>
          ))}
        </ul>
        )
      )}
      {lead && !compact && (
        <p className="mt-4 text-[12px] text-ink-3">
          หัวหน้าเวร: <span className="text-ink-2">{lead.staff?.name ?? lead.name}</span>
        </p>
      )}
    </div>
  );
}
