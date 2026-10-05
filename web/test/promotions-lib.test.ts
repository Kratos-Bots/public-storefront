import { describe, expect, it } from 'vitest';
import {
  badgeParts, basketPromotions, lineFigures, nudgeSentence, otherDiscount, snapshotMatchesLines,
} from '@/lib/promotions.ts';
import { createTextApi, DEFAULT_TEXT_LAYERS } from '@/text/snapshot.ts';
import type { Nudge, ServerCart } from '@/types/cart.ts';

// Fixed 'en' text and a hand-rolled money formatter: nothing here depends on the machine's locale.
const text = createTextApi(DEFAULT_TEXT_LAYERS);
const money = (n: number) => `£${n.toFixed(2)}`;

describe('badgeParts', () => {
  it('is null for no promotions, a missing list, or blank labels', () => {
    expect(badgeParts(undefined)).toBeNull();
    expect(badgeParts(null)).toBeNull();
    expect(badgeParts([])).toBeNull();
    expect(badgeParts([{ id: 1, label: '  ' }])).toBeNull();
  });
  it('leads with the first label and counts the rest', () => {
    expect(badgeParts([{ id: 1, label: '3 for 2 on all teas' }])).toEqual({ label: '3 for 2 on all teas', extra: 0, all: ['3 for 2 on all teas'] });
    const many = badgeParts([{ id: 1, label: 'A' }, { id: 2, label: 'B' }, { id: 3, label: 'C' }]);
    expect(many).toMatchObject({ label: 'A', extra: 2, all: ['A', 'B', 'C'] });
  });
});

describe('lineFigures', () => {
  it('is untouched without a discount (absent, 0)', () => {
    expect(lineFigures(37.5, undefined)).toEqual({ net: 37.5, discounted: false, free: false });
    expect(lineFigures(37.5, 0)).toEqual({ net: 37.5, discounted: false, free: false });
  });
  it('takes the server discount off the line total', () => {
    expect(lineFigures(37.5, 12.5)).toEqual({ net: 25, discounted: true, free: false });
  });
  it('reads a fully discounted line as free, and never goes below zero', () => {
    expect(lineFigures(12.5, 12.5)).toEqual({ net: 0, discounted: true, free: true });
    expect(lineFigures(12.5, 13)).toMatchObject({ net: 0, free: true });
  });
  it('does not leave float dust', () => {
    expect(lineFigures(0.3, 0.1).net).toBe(0.2);
    expect(lineFigures(0.1 * 3, 0.1).net).toBe(0.2);
  });
});

describe('otherDiscount', () => {
  it('is the whole discount when no promotion applied (absent field = 0)', () => {
    expect(otherDiscount(5, undefined)).toBe(5);
    expect(otherDiscount(5, 0)).toBe(5);
  });
  it('is what is left after the promotion part, so the rows add up', () => {
    expect(otherDiscount(17.5, 12.5)).toBe(5);
    expect(otherDiscount(12.5, 12.5)).toBe(0);
  });
  it('survives float dust and never goes negative', () => {
    expect(otherDiscount(0.3, 0.1)).toBe(0.2);
    expect(otherDiscount(1, 1.01)).toBe(0);
  });
});

describe('nudgeSentence', () => {
  it('quantity / buy: add N more to get the deal', () => {
    const n: Nudge = { promotionId: 1, label: '3 for 2 on all teas', kind: 'quantity', missing: 2, target: 'buy' };
    expect(nudgeSentence(n, text, money)).toBe('Add 2 more to get 3 for 2 on all teas');
  });
  it('quantity / get: singular and plural eligible items', () => {
    const one: Nudge = { promotionId: 1, label: 'Free mug', kind: 'quantity', missing: 1, target: 'get' };
    expect(nudgeSentence(one, text, money)).toBe('Add 1 more eligible item to claim Free mug');
    expect(nudgeSentence({ ...one, missing: 3 }, text, money)).toBe('Add 3 more eligible items to claim Free mug');
  });
  it('spend: formats the gap with the supplied money formatter', () => {
    const n: Nudge = { promotionId: 2, label: '5% off orders over £100', kind: 'spend', missing: 27.5 };
    expect(nudgeSentence(n, text, money)).toBe('Spend £27.50 more to get 5% off orders over £100');
  });
});

const CART: ServerCart = {
  items: [
    { productId: 1, quantity: 3 } as ServerCart['items'][number],
    { productId: 2, quantity: 1 } as ServerCart['items'][number],
  ],
  subtotal: 85.5, itemCount: 4,
};

describe('basketPromotions', () => {
  it('is null without a cart', () => {
    expect(basketPromotions(null)).toBeNull();
    expect(basketPromotions(undefined)).toBeNull();
  });
  it('reads a backend that predates promotions as none: [] / 0 / null, total = subtotal', () => {
    expect(basketPromotions(CART)).toEqual({ promotions: [], discount: 0, total: 85.5, nudge: null });
  });
  it('carries the server figures through', () => {
    const nudge: Nudge = { promotionId: 1, label: 'x', kind: 'spend', missing: 5 };
    const got = basketPromotions({ ...CART, promotionDiscount: 12.5, promotions: [{ id: 1, label: '3 for 2', amount: 12.5 }], total: 73, nudge });
    expect(got).toEqual({ promotions: [{ id: 1, label: '3 for 2', amount: 12.5 }], discount: 12.5, total: 73, nudge });
  });
});

describe('snapshotMatchesLines', () => {
  it('matches the same products at the same quantities, in any order', () => {
    expect(snapshotMatchesLines(CART, [{ productId: 2, quantity: 1 }, { productId: 1, quantity: 3 }])).toBe(true);
  });
  it('stops matching the moment a line is edited, added or removed', () => {
    expect(snapshotMatchesLines(CART, [{ productId: 1, quantity: 4 }, { productId: 2, quantity: 1 }])).toBe(false);
    expect(snapshotMatchesLines(CART, [{ productId: 1, quantity: 3 }])).toBe(false);
    expect(snapshotMatchesLines(CART, [{ productId: 1, quantity: 3 }, { productId: 3, quantity: 1 }])).toBe(false);
  });
  it('never matches without a snapshot', () => {
    expect(snapshotMatchesLines(null, [])).toBe(false);
  });
});

describe('the editor fixtures carry a consistent sample promotion', () => {
  it('the sample quote adds up and the sample cart matches its lines', async () => {
    const { FIXTURE_QUOTE, FIXTURE_CART_LINES, FIXTURE_PRODUCT, fixtureServerCart } = await import('@/builder/editor/fixtures.ts');
    expect(FIXTURE_PRODUCT.promotions?.length).toBeGreaterThan(0);
    const q = FIXTURE_QUOTE;
    expect(q.promotionDiscount).toBe(q.promotions!.reduce((s, p) => s + p.amount, 0));
    expect(Math.round((q.subtotal - q.promotionDiscount! + q.shippingAmount) * 100) / 100).toBe(q.grandTotal);
    const cart = fixtureServerCart({ session: 'signed-in', cart: 'items' });
    expect(snapshotMatchesLines(cart, FIXTURE_CART_LINES)).toBe(true);
    expect(cart.total).toBe(Math.round((cart.subtotal - cart.promotionDiscount!) * 100) / 100);
    expect(fixtureServerCart({ session: 'signed-in', cart: 'empty' }).nudge).toBeNull();
  });
});
