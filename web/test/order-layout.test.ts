import { describe, expect, it } from 'vitest';
import { partitionOrderItems, sideDraws, silentParts } from '@/features/account/order-layout.ts';

const b = (type: string, props: Record<string, unknown> = {}) => ({ type, props: { id: type, ...props } });
const order = { status: 'confirmed', outstandingBalance: 0, shippingAddress: null, shipments: [], payments: [] } as never;

describe('order page areas', () => {
  it('sorts parts into head, main and side, keeping their order', () => {
    const areas = partitionOrderItems([b('OrderPayments'), b('OrderHeading'), b('OrderItems'), b('OrderAddress'), b('OrderBalance'), b('OrderBackLink')]);
    expect(areas.head.map((i) => i.type)).toEqual(['OrderHeading', 'OrderBackLink']);
    expect(areas.main.map((i) => i.type)).toEqual(['OrderItems', 'OrderBalance']);
    expect(areas.side.map((i) => i.type)).toEqual(['OrderPayments', 'OrderAddress']);
  });
  it('a content block goes to the side only when every order part inside it is a side part', () => {
    const areas = partitionOrderItems([b('Section', { content: [b('OrderParcels')] }), b('Section', { content: [b('OrderParcels'), b('OrderItems')] }), b('RichText')]);
    expect(areas.side).toHaveLength(1);
    expect(areas.main).toHaveLength(2);
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
