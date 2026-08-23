import { describe, expect, it } from 'vitest';
import {
  REFRESH_COOLDOWN_MS,
  allTerminal,
  formatRelative,
  furthestStage,
  partitionEvents,
  refreshReadyAt,
} from '@/features/tracking/status.ts';
import type { ParcelTracking, TrackedEvent, TrackedParcel } from '@/types/tracking.ts';

function event(code: string, occurredAt: string | null = null, text = code): TrackedEvent {
  return { code, occurredAt, place: null, text };
}

function tracking(patch: Partial<ParcelTracking> = {}): ParcelTracking {
  return {
    outcome: 'ok',
    status: 'IN_TRANSIT',
    courierNumber: null,
    destination: null,
    lastEventAt: null,
    deliveredAt: null,
    events: [],
    lastMile: null,
    lastMileNumber: null,
    checkedAt: null,
    errorCode: null,
    ...patch,
  };
}

function parcel(patch: Partial<TrackedParcel> = {}): TrackedParcel {
  return {
    trackingNumber: 'AA123456789GB',
    shipmentStatus: 'shipped',
    shippedAt: null,
    deliveredAt: null,
    fallbackDescription: null,
    tracking: tracking(),
    ...patch,
  };
}

describe('furthestStage', () => {
  it('is -1 with no events at all', () => {
    expect(furthestStage([])).toBe(-1);
  });

  it('is -1 when nothing maps to a stage', () => {
    // IN_TRANSIT / EXCEPTION / RETURNED deliberately carry no stage: they say
    // something is happening, not where on the route it is happening.
    expect(furthestStage([event('IN_TRANSIT'), event('EXCEPTION'), event('WHAT_IS_THIS')])).toBe(-1);
  });

  it('takes the furthest stage, not the newest event', () => {
    // The scan order couriers actually send: a delivery scan followed by an
    // interleaved in-transit one. Reading the head would under-report by six.
    expect(furthestStage([event('DELIVERED'), event('IN_TRANSIT'), event('PICKED_UP')])).toBe(6);
  });

  it('maps the middle of the route', () => {
    expect(furthestStage([event('INFO_RECEIVED'), event('PICKED_UP'), event('CUSTOMS_CLEARING')])).toBe(3);
    expect(furthestStage([event('INFO_RECEIVED')])).toBe(0);
    expect(furthestStage([event('OUT_FOR_DELIVERY')])).toBe(5);
  });

  it('ignores unmapped codes mixed in with mapped ones', () => {
    expect(furthestStage([event('FLIGHT_DEPARTED'), event('UNKNOWN')])).toBe(2);
  });
});

describe('partitionEvents', () => {
  it('returns dated events newest first, whatever order they arrive in', () => {
    const { newestFirst } = partitionEvents([
      event('PICKED_UP', '2026-08-01T09:00:00.000Z'),
      event('DELIVERED', '2026-08-04T11:30:00.000Z'),
      event('FLIGHT_ARRIVED', '2026-08-02T20:15:00.000Z'),
    ]);
    expect(newestFirst.map((e) => e.code)).toEqual(['DELIVERED', 'FLIGHT_ARRIVED', 'PICKED_UP']);
  });

  it('keeps same-second scans in the order the API sent them', () => {
    const { newestFirst } = partitionEvents([
      event('ARRIVED_ORIGIN_FACILITY', '2026-08-01T09:00:00.000Z', 'first'),
      event('DEPARTED_ORIGIN_FACILITY', '2026-08-01T09:00:00.000Z', 'second'),
    ]);
    expect(newestFirst.map((e) => e.text)).toEqual(['first', 'second']);
  });

  it('separates undated events instead of sorting them somewhere arbitrary', () => {
    const { newestFirst, undated } = partitionEvents([
      event('INFO_RECEIVED', null, 'no date A'),
      event('DELIVERED', '2026-08-04T11:30:00.000Z'),
      event('CUSTOMS_HELD', null, 'no date B'),
    ]);
    expect(newestFirst.map((e) => e.code)).toEqual(['DELIVERED']);
    expect(undated.map((e) => e.text)).toEqual(['no date A', 'no date B']);
  });

  it('handles an all-undated history', () => {
    const { newestFirst, undated } = partitionEvents([event('INFO_RECEIVED'), event('PICKED_UP')]);
    expect(newestFirst).toEqual([]);
    expect(undated).toHaveLength(2);
  });

  it('handles no history at all', () => {
    expect(partitionEvents([])).toEqual({ newestFirst: [], undated: [] });
  });
});

describe('refreshReadyAt', () => {
  const now = Date.parse('2026-08-23T12:00:00.000Z');

  it('is null when nothing has been checked yet', () => {
    expect(refreshReadyAt(null, now)).toBeNull();
  });

  it('is null when the stamp is unreadable', () => {
    expect(refreshReadyAt('not a date', now)).toBeNull();
  });

  it('is null once the cooldown has run out', () => {
    const long = new Date(now - REFRESH_COOLDOWN_MS - 1000).toISOString();
    expect(refreshReadyAt(long, now)).toBeNull();
  });

  it('is null at the exact moment the cooldown expires', () => {
    const exact = new Date(now - REFRESH_COOLDOWN_MS).toISOString();
    expect(refreshReadyAt(exact, now)).toBeNull();
  });

  it('returns the epoch ms the button unlocks at', () => {
    const checked = new Date(now - 60_000).toISOString();
    expect(refreshReadyAt(checked, now)).toBe(now - 60_000 + REFRESH_COOLDOWN_MS);
  });

  it('runs a ten-minute cooldown', () => {
    expect(REFRESH_COOLDOWN_MS).toBe(600_000);
  });
});

describe('allTerminal', () => {
  it('is false with no parcels', () => {
    expect(allTerminal([])).toBe(false);
  });

  it('is false when no parcel resolved tracking — nothing is known, let alone settled', () => {
    expect(allTerminal([parcel({ tracking: null }), parcel({ tracking: tracking({ outcome: 'error' }) })])).toBe(false);
  });

  it('is false while one tracked parcel is still moving', () => {
    expect(
      allTerminal([
        parcel({ tracking: tracking({ status: 'DELIVERED' }) }),
        parcel({ tracking: tracking({ status: 'OUT_FOR_DELIVERY' }) }),
      ]),
    ).toBe(false);
  });

  it('counts returned as settled alongside delivered', () => {
    expect(
      allTerminal([
        parcel({ tracking: tracking({ status: 'DELIVERED' }) }),
        parcel({ tracking: tracking({ status: 'RETURNED' }) }),
      ]),
    ).toBe(true);
  });

  it('judges only the parcels that resolved', () => {
    // A parcel the carrier never answered for cannot hold the Refresh button
    // hostage — but it cannot vote for hiding it either.
    expect(
      allTerminal([
        parcel({ tracking: tracking({ status: 'DELIVERED' }) }),
        parcel({ tracking: tracking({ outcome: 'not_found', status: null }) }),
      ]),
    ).toBe(true);
  });
});

describe('formatRelative', () => {
  const now = Date.parse('2026-08-23T12:00:00.000Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('is empty for nothing to say', () => {
    expect(formatRelative(null, now)).toBe('');
    expect(formatRelative('not a date', now)).toBe('');
  });

  it('reads "just now" under a minute', () => {
    expect(formatRelative(ago(0), now)).toBe('just now');
    expect(formatRelative(ago(59_000), now)).toBe('just now');
  });

  it('counts minutes up to the hour', () => {
    expect(formatRelative(ago(60_000), now)).toBe('1 min ago');
    expect(formatRelative(ago(12 * 60_000), now)).toBe('12 min ago');
    expect(formatRelative(ago(59 * 60_000), now)).toBe('59 min ago');
  });

  it('counts hours up to the day', () => {
    expect(formatRelative(ago(60 * 60_000), now)).toBe('1h ago');
    expect(formatRelative(ago(23 * 60 * 60_000), now)).toBe('23h ago');
  });

  it('counts days, singular at one', () => {
    expect(formatRelative(ago(24 * 60 * 60_000), now)).toBe('1 day ago');
    expect(formatRelative(ago(3 * 24 * 60 * 60_000), now)).toBe('3 days ago');
  });
});
