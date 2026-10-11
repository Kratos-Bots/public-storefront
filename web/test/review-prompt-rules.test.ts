import { describe, expect, it } from 'vitest';
import {
  decideReminder, isDue, parseStored, recordShown, REMIND_EVERY_MS, shouldFetchReviewable, STORAGE_KEY,
  type DecideInputs,
} from '@/features/review-prompt/rules.ts';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const HOUR = 3_600_000;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const order = (reference: string, over: Record<string, string> = {}) => ({
  reference, eligibleSince: iso(-2 * 24 * HOUR), remindUntil: iso(5 * 24 * HOUR), ...over,
});

const base = (over: Partial<DecideInputs> = {}): DecideInputs => ({
  reviewsEnabled: true, customerId: 7, path: '/', builder: false, preview: false, refused: false,
  cartOpen: false, loginOpen: false, unpaid: 'clear', reviewable: [order('K4M2QP')], stored: {}, now: NOW, shownThisLoad: false,
  ...over,
});

describe('storage key', () => {
  it('is the contract key', () => expect(STORAGE_KEY).toBe('sf-review-reminder-v1'));
});

describe('shouldFetchReviewable', () => {
  it('asks only for a signed-in customer of a shop with reviews on, on a page where a pop-up may show', () => {
    expect(shouldFetchReviewable(base())).toBe(true);
    expect(shouldFetchReviewable(base({ reviewsEnabled: false }))).toBe(false);
    expect(shouldFetchReviewable(base({ customerId: null }))).toBe(false);
    expect(shouldFetchReviewable(base({ builder: true }))).toBe(false);
    expect(shouldFetchReviewable(base({ preview: true }))).toBe(false);
    expect(shouldFetchReviewable(base({ refused: true }))).toBe(false);
  });
  it.each(['/checkout', '/checkout/pay', '/login', '/order/ABC/key', '/payment/success', '/order-placed', '/account/orders/K4M2QP', '/auth/telegram/callback', '/__builder', '/reset-password', '/verify-email', '/verify', '/tracking/ABC'])(
    'never on %s', (path) => expect(shouldFetchReviewable(base({ path }))).toBe(false));
  it.each(['/', '/c/serums', '/p/12', '/cart', '/account/orders', '/account/profile', '/reviews', '/pages/about'])(
    'on %s', (path) => expect(shouldFetchReviewable(base({ path }))).toBe(true));
});

describe('isDue', () => {
  it('is due when never shown, or shown 24 hours ago or more; not before', () => {
    expect(isDue({}, 7, 'A', NOW)).toBe(true);
    expect(isDue({ 7: { A: iso(-REMIND_EVERY_MS) } }, 7, 'A', NOW)).toBe(true);
    expect(isDue({ 7: { A: iso(-REMIND_EVERY_MS - 1) } }, 7, 'A', NOW)).toBe(true);
    expect(isDue({ 7: { A: iso(-REMIND_EVERY_MS + 1) } }, 7, 'A', NOW)).toBe(false);
    expect(isDue({ 7: { A: iso(-HOUR) } }, 7, 'A', NOW)).toBe(false);
  });
  it('is per customer and per order', () => {
    const stored = { 7: { A: iso(-HOUR) } };
    expect(isDue(stored, 8, 'A', NOW)).toBe(true);
    expect(isDue(stored, 7, 'B', NOW)).toBe(true);
  });
  it('treats a time in the future (a clock that moved back) as just shown, and junk as never shown', () => {
    expect(isDue({ 7: { A: iso(+HOUR) } }, 7, 'A', NOW)).toBe(false);
    expect(isDue({ 7: { A: 'not a date' } }, 7, 'A', NOW)).toBe(true);
  });
});

describe('decideReminder', () => {
  it('picks the first order in the list when none has been shown', () => {
    expect(decideReminder(base({ reviewable: [order('FIRST'), order('SECOND')] }))?.reference).toBe('FIRST');
  });
  it('skips an order shown less than 24 hours ago and picks the next due one', () => {
    const stored = { 7: { FIRST: iso(-HOUR) } };
    expect(decideReminder(base({ reviewable: [order('FIRST'), order('SECOND')], stored }))?.reference).toBe('SECOND');
  });
  it('shows an order again once 25 hours have passed', () => {
    expect(decideReminder(base({ stored: { 7: { K4M2QP: iso(-25 * HOUR) } } }))?.reference).toBe('K4M2QP');
  });
  it('shows nothing when the only order was shown an hour ago', () => {
    expect(decideReminder(base({ stored: { 7: { K4M2QP: iso(-HOUR) } } }))).toBeNull();
  });
  it('ignores an order whose remindUntil has passed on this clock, even if the server still lists it', () => {
    expect(decideReminder(base({ reviewable: [order('OLD', { remindUntil: iso(-1) }), order('NEW')] }))?.reference).toBe('NEW');
    expect(decideReminder(base({ reviewable: [order('OLD', { remindUntil: iso(0) })] }))).toBeNull();
  });
  it('is not on the reviewed order\'s own page', () => {
    expect(decideReminder(base({ path: '/account/orders/K4M2QP' }))).toBeNull();
  });
  it('is null while the list is loading or failed', () => {
    expect(decideReminder(base({ reviewable: null }))).toBeNull();
    expect(decideReminder(base({ reviewable: [] }))).toBeNull();
  });
  it('never when reviews are off, for a guest, in the builder or preview, when refused, or on a blocked page', () => {
    expect(decideReminder(base({ reviewsEnabled: false }))).toBeNull();
    expect(decideReminder(base({ customerId: null }))).toBeNull();
    expect(decideReminder(base({ builder: true }))).toBeNull();
    expect(decideReminder(base({ preview: true }))).toBeNull();
    expect(decideReminder(base({ refused: true }))).toBeNull();
    expect(decideReminder(base({ path: '/checkout' }))).toBeNull();
    expect(decideReminder(base({ path: '/login' }))).toBeNull();
  });
  it('never while the cart or the sign-in dialog is open', () => {
    expect(decideReminder(base({ cartOpen: true }))).toBeNull();
    expect(decideReminder(base({ loginOpen: true }))).toBeNull();
  });
  it('waits for the unpaid-order lookup, and stays away when the unpaid pop-up is in play', () => {
    expect(decideReminder(base({ unpaid: 'waiting' }))).toBeNull();
    expect(decideReminder(base({ unpaid: 'blocked' }))).toBeNull();
    expect(decideReminder(base({ unpaid: 'clear' }))?.reference).toBe('K4M2QP');
  });
  it('once per page load', () => {
    expect(decideReminder(base({ shownThisLoad: true }))).toBeNull();
  });
  it('another customer\'s stored times do not count', () => {
    expect(decideReminder(base({ stored: { 8: { K4M2QP: iso(-HOUR) } } }))?.reference).toBe('K4M2QP');
  });
});

describe('recordShown', () => {
  it('writes now for the customer and reference, keeps the others listed, and prunes references no longer listed', () => {
    const stored = { 7: { KEEP: iso(-HOUR), GONE: iso(-2 * HOUR) }, 8: { OTHER: iso(-3 * HOUR) } };
    const next = recordShown(stored, 7, 'NEW', ['KEEP', 'NEW'], NOW);
    expect(next).toEqual({ 7: { KEEP: iso(-HOUR), NEW: iso(0) }, 8: { OTHER: iso(-3 * HOUR) } });
    expect(stored[7]).toHaveProperty('GONE');
  });
  it('starts a map for a customer with none', () => {
    expect(recordShown({}, 7, 'A', ['A'], NOW)).toEqual({ 7: { A: iso(0) } });
  });
});

describe('parseStored', () => {
  it('reads what recordShown wrote', () => {
    expect(parseStored(JSON.stringify({ 7: { A: iso(0) } }))).toEqual({ 7: { A: iso(0) } });
  });
  it.each([null, '', 'not json', '[]', '"x"', '{"7":"x"}', '{"7":[]}'])('reads %s as nothing', (raw) => {
    expect(parseStored(raw)).toEqual({});
  });
  it('drops non-string times', () => {
    expect(parseStored('{"7":{"A":5,"B":"2026-10-11T00:00:00Z"}}')).toEqual({ 7: { B: '2026-10-11T00:00:00Z' } });
  });
});
