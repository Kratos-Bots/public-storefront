import type { ParcelTracking, TrackedEvent, TrackedParcel } from '@/types/tracking.ts';

// Ported from `ecommerce-menu/web/src/features/tracking/status.ts`. The stage
// table, the label/tone maps and the time helpers are verbatim — they encode
// what the courier API means, which has not changed. The only thing dropped is
// that app's Tailwind class maps: here a tone is a name and each surface maps it
// to `--sf-*` tokens in its own stylesheet. `orderStatusLabel` is not re-declared
// either; the order page already owns that table and both surfaces must agree.

// ------------------------------------------------------------------
// Stepper stages (§6 of TRACKING_API.MD)
// ------------------------------------------------------------------

export const STAGES = [
  'Ordered',
  'Collected',
  'In flight',
  'Customs',
  'Local carrier',
  'Out for delivery',
  'Delivered',
] as const;

const STAGE_BY_CODE: Record<string, number> = {
  INFO_RECEIVED: 0,
  PICKED_UP: 1,
  ARRIVED_ORIGIN_FACILITY: 1,
  DEPARTED_ORIGIN_FACILITY: 1,
  ORIGIN_CUSTOMS_CLEARING: 1,
  ORIGIN_CUSTOMS_CLEARED: 1,
  FLIGHT_SCHEDULED: 2,
  FLIGHT_DEPARTED: 2,
  FLIGHT_ARRIVED: 2,
  ARRIVED_DESTINATION_COUNTRY: 3,
  CUSTOMS_CLEARING: 3,
  CUSTOMS_CLEARED: 3,
  CUSTOMS_HELD: 3,
  HANDED_TO_LAST_MILE: 4,
  ARRIVED_DESTINATION_FACILITY: 4,
  OUT_FOR_DELIVERY: 5,
  AVAILABLE_FOR_PICKUP: 5,
  DELIVERED: 6,
};

/** -1 for codes with no stage (IN_TRANSIT, EXCEPTION, RETURNED, UNKNOWN, anything new). */
export function stageOfCode(code: string): number {
  return STAGE_BY_CODE[code] ?? -1;
}

/**
 * Furthest stage reached across ALL events, not the newest one — couriers
 * interleave scans, so the newest event routinely under-reports progress.
 * Returns -1 when nothing maps.
 */
export function furthestStage(events: TrackedEvent[]): number {
  let max = -1;
  for (const e of events) {
    const s = stageOfCode(e.code);
    if (s > max) max = s;
  }
  return max;
}

// ------------------------------------------------------------------
// Labels and tones
// ------------------------------------------------------------------

/** Accent role, resolved to a theme token by whatever renders it. */
export type Tone = 'neutral' | 'info' | 'warn' | 'success' | 'danger';

export const PARCEL_LABEL: Record<string, string> = {
  PRE_TRANSIT: 'Label created',
  IN_TRANSIT: 'In transit',
  CUSTOMS: 'In customs',
  OUT_FOR_DELIVERY: 'Out for delivery',
  AVAILABLE_FOR_PICKUP: 'Ready for pickup',
  DELIVERED: 'Delivered',
  EXCEPTION: 'Needs attention',
  RETURNED: 'Returned to sender',
  UNKNOWN: 'Status unavailable',
};

export const PARCEL_TONE: Record<string, Tone> = {
  PRE_TRANSIT: 'neutral',
  IN_TRANSIT: 'info',
  CUSTOMS: 'warn',
  OUT_FOR_DELIVERY: 'info',
  AVAILABLE_FOR_PICKUP: 'info',
  DELIVERED: 'success',
  EXCEPTION: 'danger',
  RETURNED: 'danger',
  UNKNOWN: 'neutral',
};

/** Default case is mandatory: new statuses ship without a client release. */
export function parcelLabel(status: string | null): string {
  return (status && PARCEL_LABEL[status]) || 'Status unavailable';
}

export function parcelTone(status: string | null): Tone {
  return (status && PARCEL_TONE[status]) || 'neutral';
}

export const isTerminalParcel = (status: string | null): boolean =>
  status === 'DELIVERED' || status === 'RETURNED';

// ------------------------------------------------------------------
// Links and events
// ------------------------------------------------------------------

/** The local carrier only knows the parcel after handover; before that its page
 *  reports "not found", so the link stays hidden. */
export function hasHandover(tracking: ParcelTracking | null): boolean {
  return !!tracking?.events.some((e) => e.code === 'HANDED_TO_LAST_MILE');
}

/**
 * Dated events newest first, and dateless events kept separate. The dateless
 * ones are placeholders, not history: mixed into the list they would sort
 * somewhere arbitrary, so they render as their own group below the trail rather
 * than displacing the latest scan from the top.
 */
export function partitionEvents(events: TrackedEvent[]): {
  newestFirst: TrackedEvent[];
  undated: TrackedEvent[];
} {
  const dated = events.filter((e) => e.occurredAt !== null);
  return {
    // Sorted rather than trusted: the API documents newest-first, but the top
    // row carries the live head marker, so "latest" has to be true and not
    // merely conventional. Stable, so same-second scans keep the API's order.
    newestFirst: dated.sort((a, b) => Date.parse(b.occurredAt!) - Date.parse(a.occurredAt!)),
    undated: events.filter((e) => e.occurredAt === null),
  };
}

// ------------------------------------------------------------------
// Time
// ------------------------------------------------------------------

const stampFmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** Null-safe: occurredAt is nullable on every event. */
export function formatStamp(iso: string | null): string {
  if (!iso) return 'Date unknown';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Date unknown' : stampFmt.format(d);
}

/** "just now" / "12 min ago" / "2h ago" / "3 days ago". Empty string for null. */
export function formatRelative(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const mins = Math.floor((now - t) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

// ------------------------------------------------------------------
// Refresh cooldown
// ------------------------------------------------------------------

/** A forced refresh costs seconds upstream and 1 of the 30 lookups an IP gets
 *  every 15 minutes; on a public page an uncooled button is a cost amplifier. */
export const REFRESH_COOLDOWN_MS = 10 * 60_000;

/** Epoch ms at which Refresh becomes available, or null when it already is. */
export function refreshReadyAt(checkedAt: string | null, now = Date.now()): number | null {
  if (!checkedAt) return null;
  const t = Date.parse(checkedAt);
  if (Number.isNaN(t)) return null;
  const ready = t + REFRESH_COOLDOWN_MS;
  return ready > now ? ready : null;
}

/** True when every parcel that has tracking is in a terminal state. */
export function allTerminal(parcels: TrackedParcel[]): boolean {
  const tracked = parcels.filter((p) => p.tracking?.outcome === 'ok');
  return tracked.length > 0 && tracked.every((p) => isTerminalParcel(p.tracking!.status));
}
