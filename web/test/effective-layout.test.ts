import { describe, expect, it } from 'vitest';
import { effectiveLayout } from '@/app/layout.ts';

describe('effectiveLayout', () => {
  it.each([
    ['storefront', false, 'storefront'],
    ['menu', false, 'menu'],
    ['webapp', false, 'webapp'],
  ] as const)('browser, store picked %s → %s', (chosen, inTelegram, expected) => {
    expect(effectiveLayout(chosen, inTelegram)).toBe(expected);
  });

  it.each(['storefront', 'menu', 'webapp'] as const)('inside Telegram, store picked %s → webapp', (chosen) => {
    expect(effectiveLayout(chosen, true)).toBe('webapp');
  });

  it('falls back to storefront when an old backend sends no layout', () => {
    expect(effectiveLayout(undefined, false)).toBe('storefront');
  });
});
