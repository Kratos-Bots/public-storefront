import { describe, expect, it } from 'vitest';
import { isClosedExemptPath } from '@/app/closed-gate.ts';

describe('isClosedExemptPath', () => {
  it.each([
    ['/order/K7M2QP/ab12cd34', true],
    ['/order/x/y', true],
    ['/payment/success', true],
    ['/payment/cancel', true],
    ['/order-placed', true],
    ['/', false],
    ['/checkout', false],
    ['/account', false],
    ['/orders', false],
    ['/order', false],
  ])('%s -> exempt=%s', (pathname, exempt) => {
    expect(isClosedExemptPath(pathname)).toBe(exempt);
  });
});
