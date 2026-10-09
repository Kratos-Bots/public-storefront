import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPromptRoute, promptDecision, warehouseInForce, warehouseOrdering, type PromptInput } from '@/features/warehouses/prompt.ts';
import { hasChosenThisVisit, markChosenThisVisit, resetVisitMarker } from '@/features/warehouses/visit.ts';
import { ApiError } from '@/lib/errors.ts';
import type { Warehouse } from '@/types/warehouses.ts';

const MAIN: Warehouse = { id: 1, name: 'Main', country: 'CN', isDefault: true, orderingEnabled: true, orderingMessage: null };
const UK: Warehouse = { id: 2, name: 'UK', country: 'GB', isDefault: false, orderingEnabled: false, orderingMessage: 'Back Monday' };

const base: PromptInput = {
  promptOn: true, enabled: true, list: [MAIN, UK], failed: false, chosen: false, builder: false, pathname: '/',
};

describe('isPromptRoute', () => {
  it.each(['/', '/c/peptides', '/p/12', '/cart', '/pages/about'])('gates %s', (p) => expect(isPromptRoute(p)).toBe(true));
  it.each([
    '/checkout', '/checkout/review', '/order-placed', '/payment/abc', '/account', '/account/orders/ORD-1',
    '/login', '/reset-password', '/verify-email', '/tracking', '/verify', '/ref/ABC', '/auth/telegram/callback', '/__builder/x',
  ])('never gates %s', (p) => expect(isPromptRoute(p)).toBe(false));
});

describe('promptDecision', () => {
  it('shows on a catalogue route with a real choice and nothing chosen this visit', () => {
    expect(promptDecision(base)).toBe('show');
  });
  it('waits while the list is loading', () => {
    expect(promptDecision({ ...base, list: null })).toBe('wait');
  });
  it('passes when the toggle or the feature is off, in the builder, once chosen, and off catalogue routes', () => {
    expect(promptDecision({ ...base, promptOn: false })).toBe('pass');
    expect(promptDecision({ ...base, enabled: false })).toBe('pass');
    expect(promptDecision({ ...base, builder: true })).toBe('pass');
    expect(promptDecision({ ...base, chosen: true })).toBe('pass');
    expect(promptDecision({ ...base, pathname: '/account/orders/ORD-1' })).toBe('pass');
    expect(promptDecision({ ...base, pathname: '/payment/abc', list: null })).toBe('pass');
  });
  it('fails open: a failed list or fewer than two warehouses never blocks the shop', () => {
    expect(promptDecision({ ...base, failed: true, list: null })).toBe('pass');
    expect(promptDecision({ ...base, list: [MAIN] })).toBe('pass');
    expect(promptDecision({ ...base, list: [] })).toBe('pass');
  });
});

describe('warehouseInForce', () => {
  it('is the selected warehouse, else the default, else nothing', () => {
    expect(warehouseInForce([MAIN, UK], 2)).toBe(UK);
    expect(warehouseInForce([MAIN, UK], null)).toBe(MAIN);
    expect(warehouseInForce([MAIN, UK], 99)).toBe(MAIN);
    expect(warehouseInForce(null, 2)).toBeNull();
    expect(warehouseInForce([], null)).toBeNull();
  });
  it('works for a single-warehouse list (no picker is shown, the pause still applies)', () => {
    const only = { ...MAIN, orderingEnabled: false, orderingMessage: 'Closed' };
    expect(warehouseOrdering(warehouseInForce([only], null))).toEqual({ paused: true, message: 'Closed' });
  });
});

describe('warehouseOrdering', () => {
  it('is open for no warehouse, an open one, and one from an older backend without the field', () => {
    expect(warehouseOrdering(null)).toEqual({ paused: false, message: null });
    expect(warehouseOrdering(MAIN)).toEqual({ paused: false, message: null });
    expect(warehouseOrdering({ id: 3, name: 'Old', country: null, isDefault: false })).toEqual({ paused: false, message: null });
  });
  it('is paused with the message when the warehouse says so', () => {
    expect(warehouseOrdering(UK)).toEqual({ paused: true, message: 'Back Monday' });
    expect(warehouseOrdering({ ...UK, orderingMessage: null })).toEqual({ paused: true, message: null });
  });
});

describe('visit marker', () => {
  beforeEach(() => { sessionStorage.clear(); resetVisitMarker(); });
  afterEach(() => vi.restoreAllMocks());

  it('is unset, then set for the rest of the visit, under the documented key', () => {
    expect(hasChosenThisVisit()).toBe(false);
    markChosenThisVisit();
    expect(hasChosenThisVisit()).toBe(true);
    expect(sessionStorage.getItem('sf-warehouse-visit-v1')).toBe('1');
  });
  it('still holds within the page when sessionStorage throws (private mode, in-app browsers)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(hasChosenThisVisit()).toBe(false);
    markChosenThisVisit();
    expect(hasChosenThisVisit()).toBe(true);
  });
});

describe('ApiError.isWarehouseOrderingPaused', () => {
  it('is true only for 503 WAREHOUSE_ORDERING_PAUSED', () => {
    expect(new ApiError(503, 'WAREHOUSE_ORDERING_PAUSED').isWarehouseOrderingPaused).toBe(true);
    expect(new ApiError(503, 'STOREFRONT_DISABLED').isWarehouseOrderingPaused).toBe(false);
    expect(new ApiError(422, 'WAREHOUSE_ORDERING_PAUSED').isWarehouseOrderingPaused).toBe(false);
  });
});
