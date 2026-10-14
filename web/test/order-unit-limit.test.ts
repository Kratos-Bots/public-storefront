import { describe, expect, it } from 'vitest';
import { cappedCeiling, orderUnitLimit } from '@/features/cart/order-unit-limit.ts';

describe('orderUnitLimit', () => {
  it('is never over without a limit (absent on an older backend, or null)', () => {
    for (const max of [undefined, null, 0, -1, 1.5]) {
      expect(orderUnitLimit(max, 99)).toEqual({ max: null, units: 99, over: false, excess: 0, remaining: null });
    }
  });
  it('is not over at the limit and has no headroom left', () => {
    expect(orderUnitLimit(2, 2)).toEqual({ max: 2, units: 2, over: false, excess: 0, remaining: 0 });
  });
  it('is over above the limit and reports how many to remove', () => {
    expect(orderUnitLimit(2, 3)).toEqual({ max: 2, units: 3, over: true, excess: 1, remaining: 0 });
  });
});

describe('cappedCeiling', () => {
  it('is the product max when there is no order limit, and null when neither exists', () => {
    expect(cappedCeiling(1, 15, orderUnitLimit(null, 4))).toBe(15);
    expect(cappedCeiling(1, null, orderUnitLimit(null, 4))).toBeNull();
  });
  it('is the line quantity plus the remaining headroom', () => {
    expect(cappedCeiling(1, null, orderUnitLimit(5, 3))).toBe(3);
  });
  it('takes the lower of the product max and the headroom', () => {
    expect(cappedCeiling(1, 2, orderUnitLimit(10, 3))).toBe(2);
  });
  it('never drops below the current quantity, so an over-limit line can still be stepped down', () => {
    expect(cappedCeiling(3, null, orderUnitLimit(2, 3))).toBe(3);
  });
});
