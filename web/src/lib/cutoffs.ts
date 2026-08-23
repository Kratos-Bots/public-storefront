import type { Cutoffs, DayKey } from '@/types/settings.ts';

export interface NextCutoff { day: DayKey; at: Date; msRemaining: number; shipsOn: string; cutoff: string; isToday: boolean }
const DAYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Wall-clock parts of `date` in `timeZone`. */
function zoned(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = get('weekday').toLowerCase().slice(0, 3) as DayKey;
  return { weekday, y: +get('year'), m: +get('month'), d: +get('day'), h: +get('hour') % 24, min: +get('minute'), s: +get('second') };
}

/** Offset (ms) of `timeZone` at `date`, computed from the formatted wall-clock. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const z = zoned(date, timeZone);
  const asUtc = Date.UTC(z.y, z.m - 1, z.d, z.h, z.min, z.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant of `HH:mm` on the calendar day that is `dayOffset` days after `now`'s day in `timeZone`. */
function instantAt(now: Date, dayOffset: number, hhmm: string, timeZone: string): Date {
  const z = zoned(now, timeZone);
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const naive = Date.UTC(z.y, z.m - 1, z.d + dayOffset, h, m, 0);
  // Two-pass: use the offset in force at the target instant (handles DST transitions).
  const guess = new Date(naive - tzOffsetMs(now, timeZone));
  return new Date(naive - tzOffsetMs(guess, timeZone));
}

export function nextCutoff(cutoffs: Cutoffs, serverTime: string, clientNowAtFetch: number, clientNow: number): NextCutoff | null {
  const server = Date.parse(serverTime);
  if (Number.isNaN(server)) return null;
  const now = new Date(server + (clientNow - clientNowAtFetch));
  const tz = cutoffs.timezone || 'UTC';
  const todayIdx = DAYS.indexOf(zoned(now, tz).weekday);
  for (let offset = 0; offset < 8; offset++) {
    const day = DAYS[(todayIdx + offset) % 7]!;
    const cfg = cutoffs.days[day];
    if (!cfg?.enabled) continue;
    const at = instantAt(now, offset, cfg.cutoff, tz);
    if (at.getTime() <= now.getTime()) continue;
    return { day, at, msRemaining: at.getTime() - now.getTime(), shipsOn: cfg.shipsOn, cutoff: cfg.cutoff, isToday: offset === 0 };
  }
  return null;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
