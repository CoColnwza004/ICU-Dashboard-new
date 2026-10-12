import {
  Ambulance,
  ArrowRightLeft,
  Bandage,

  Droplet,
  Flame,
  HeartCrack,
  HeartPulse,
  House,
  LogIn,
  ShieldAlert,
  ShieldCheck,
  Syringe,
  UserPlus,
  Users,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import type { DailyKey, DeviceKey, LogEvent } from '../types';

export const DEVICE_ICON: Record<DeviceKey, LucideIcon> = {
  onVentilator: Wind,
  hasCLine: HeartPulse,
  hasFoley: Droplet,
  hasMdr: ShieldAlert,
  hasIvHl: Syringe,
  hasPiHome: Bandage,
  hasHapBundle: ShieldCheck,
  hasBradenUnder12: Flame,
};

export const INDICATOR_ICON: Record<DailyKey, LucideIcon> = {
  admittedNew: UserPlus,
  totalInWard: Users,
  referCount: Ambulance,
  deathCount: HeartCrack,
  ventilatorCount: Wind,
  cLineCount: HeartPulse,
  foleyCount: Droplet,
  mdrCount: ShieldAlert,
  ivHlCount: Syringe,
  piHomeCount: Bandage,
  hapBundleCount: ShieldCheck,
  bradenUnder12Count: Flame,
};

export const EVENT_ICON: Record<LogEvent, LucideIcon> = {
  admit: LogIn,
  home: House,
  ward: ArrowRightLeft,
  refer: Ambulance,
  expired: HeartCrack,
};

