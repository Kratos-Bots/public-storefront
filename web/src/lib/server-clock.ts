import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '@/app/settings.ts';
import { nextCutoff } from '@/lib/cutoffs.ts';
import { settingsFetchedAt } from '@/lib/settings-anchor.ts';
import type { DayKey } from '@/types/settings.ts';

/** serverTime plus the client clock at the moment that response was fetched. */
function useServerAnchor(): { serverTime: string; fetchedAt: number } {
  const { serverTime } = useSettings();
  const fallback = useRef<{ serverTime: string; at: number } | null>(null);
  const recorded = settingsFetchedAt(serverTime);
  if (recorded !== undefined) return { serverTime, fetchedAt: recorded };
  // No recorded fetch (component tests that mock useSettings): anchor at first render.
  if (fallback.current?.serverTime !== serverTime) fallback.current = { serverTime, at: Date.now() };
  return { serverTime, fetchedAt: fallback.current.at };
}

function useTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** The server's "now", advancing every `intervalMs`, immune to a skewed device clock. */
export function useServerClock(intervalMs = 1000): Date {
  const { serverTime, fetchedAt } = useServerAnchor();
  const now = useTick(intervalMs);
  const server = Date.parse(serverTime);
  return new Date(Number.isNaN(server) ? now : server + (now - fetchedAt));
}

export interface CutoffInfo {
  timezone: string;
  next: { day: DayKey; cutoff: string; shipsOn: string; isToday: boolean; at: Date; msRemaining: number } | null;
}

/** The next dispatch cut-off, re-evaluated every 30 s. The single implementation — CutoffBar reads it too. */
export function useCutoffInfo(): CutoffInfo {
  const { cutoffs } = useSettings();
  const { serverTime, fetchedAt } = useServerAnchor();
  const now = useTick(30_000);
  return useMemo(() => {
    const n = nextCutoff(cutoffs, serverTime, fetchedAt, now);
    return {
      timezone: cutoffs.timezone || 'UTC',
      next: n ? { day: n.day, cutoff: n.cutoff, shipsOn: n.shipsOn, isToday: n.isToday, at: n.at, msRemaining: n.msRemaining } : null,
    };
  }, [cutoffs, serverTime, fetchedAt, now]);
}
