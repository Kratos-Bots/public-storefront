import { describe, expect, it } from 'vitest';
import { partitionOrderItems, shownPayments, sideDraws, silentParts } from '@/features/account/order-layout.ts';

const b = (type: string, props: Record<string, unknown> = {}) => ({ type, props: { id: type, ...props } });
const order = { status: 'confirmed', outstandingBalance: 0, shippingAddress: null, shipments: [], payments: [] } as never;

describe('shownPayments', () => {
  const pay = (status: string, id: number) => ({ method: 'stripe', amount: 5, status, createdAt: `2026-01-0${id}T10:00:00Z` });
  it('drops only failed payments and keeps the order of the rest', () => {
    const all = ['pending', 'failed', 'completed', 'refunded', 'cancelled', 'expired', 'odd_state', 'failed'].map((s, i) => pay(s, i + 1));
    expect(shownPayments(all as never).map((p) => p.status)).toEqual(['pending', 'completed', 'refunded', 'cancelled', 'expired', 'odd_state']);
    expect(shownPayments([])).toEqual([]);
  });
  it('the payment card is silent when every payment failed, and not when one did not', () => {
    const withPayments = (payments: unknown[]) => silentParts({ ...(order as object), payments } as never).has('OrderPayments');
    expect(withPayments([pay('failed', 1), pay('failed', 2)])).toBe(true);
    expect(withPayments([pay('failed', 1), pay('pending', 2)])).toBe(false);
    expect(withPayments([])).toBe(true);
  });
});

describe('order page areas', () => {
  it('sorts parts into head, main and side, keeping their order', () => {
    const areas = partitionOrderItems([b('OrderPayments'), b('OrderHeading'), b('OrderItems'), b('OrderAddress'), b('OrderBalance'), b('OrderBackLink')]);
    expect(areas.head.map((i) => i.type)).toEqual(['OrderHeading', 'OrderBackLink']);
    expect(areas.main.map((i) => i.type)).toEqual(['OrderItems', 'OrderBalance']);
    expect(areas.side.map((i) => i.type)).toEqual(['OrderPayments', 'OrderAddress']);
  });
  it('a content block goes to the side only when every order part inside it is a side part', () => {
    const areas = partitionOrderItems([b('OrderBalance'), b('Section', { content: [b('OrderParcels')] }), b('Section', { content: [b('OrderParcels'), b('OrderItems')] }), b('RichText')]);
    expect(areas.side).toHaveLength(1);
    expect(areas.main).toHaveLength(3);
  });
  it('parcels join the items in the main column when the payment card is silent, and stay in the side when it is not', () => {
    const items = [b('OrderHeading'), b('OrderBalance'), b('OrderItems'), b('OrderAddress'), b('OrderParcels'), b('OrderPayments')];
    const paid = partitionOrderItems(items, silentParts(order));
    expect(paid.main.map((i) => i.type)).toEqual(['OrderBalance', 'OrderItems', 'OrderParcels']);
    expect(paid.side.map((i) => i.type)).toEqual(['OrderAddress', 'OrderPayments']);
    const owed = partitionOrderItems(items, silentParts({ ...(order as object), outstandingBalance: 5, status: 'pending' } as never));
    expect(owed.main.map((i) => i.type)).toEqual(['OrderBalance', 'OrderItems']);
    expect(owed.side.map((i) => i.type)).toEqual(['OrderAddress', 'OrderParcels', 'OrderPayments']);
  });
  it('a block holding only parcels follows them into the main column', () => {
    const items = [b('OrderBalance'), b('Section', { content: [b('OrderParcels')] })];
    expect(partitionOrderItems(items).side).toHaveLength(1);
    expect(partitionOrderItems(items, silentParts(order)).main).toHaveLength(2);
  });
  it('a balance part that is not placed draws nothing, so the parcels sit under the items even on an unpaid order', () => {
    const owed = silentParts({ ...(order as object), outstandingBalance: 5, status: 'pending' } as never);
    const without = partitionOrderItems([b('OrderItems'), b('OrderAddress'), b('OrderParcels')], owed);
    expect(without.main.map((i) => i.type)).toEqual(['OrderItems', 'OrderParcels']);
    const nested = partitionOrderItems([b('OrderItems'), b('Section', { content: [b('OrderBalance')] }), b('OrderParcels')], owed);
    expect(nested.side.map((i) => i.type)).toEqual(['OrderParcels']);
  });
  it('a block holding both the address and the parcels goes wholly to main on a paid order and to the side on an unpaid one', () => {
    const items = [b('OrderBalance'), b('Section', { content: [b('OrderAddress'), b('OrderParcels')] })];
    expect(partitionOrderItems(items, silentParts(order)).main).toHaveLength(2);
    const owed = silentParts({ ...(order as object), outstandingBalance: 5, status: 'pending' } as never);
    expect(partitionOrderItems(items, owed).side).toHaveLength(1);
  });
  it('a stored arrangement that dropped the parcels part opens no empty side column', () => {
    expect(sideDraws([b('OrderAddress'), b('OrderPayments')], silentParts(order))).toBe(false);
    expect(sideDraws([b('OrderAddress')], silentParts({ ...(order as object), shippingAddress: {} } as never))).toBe(true);
  });
  it('a content block in the side column counts as drawing unless everything inside it is silent', () => {
    expect(sideDraws([b('Section', { content: [b('OrderParcels')] })], silentParts(order))).toBe(false);
    expect(sideDraws([b('RichText')], silentParts(order))).toBe(true);
  });
  it('the balance is silent when nothing is owed, and when the order is closed with a balance on paper', () => {
    expect(silentParts({ ...(order as object), outstandingBalance: 5, status: 'pending' } as never).has('OrderBalance')).toBe(false);
    expect(silentParts({ ...(order as object), outstandingBalance: 5, status: 'cancelled' } as never).has('OrderBalance')).toBe(true);
    expect(silentParts({ ...(order as object), outstandingBalance: 5, status: 'refunded' } as never).has('OrderBalance')).toBe(true);
    expect(silentParts({ ...(order as object), outstandingBalance: 0, status: 'pending' } as never).has('OrderBalance')).toBe(true);
  });
});
