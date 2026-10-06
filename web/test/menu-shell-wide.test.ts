import { describe, expect, it } from 'vitest';
import { onCheckoutPath } from '@/layouts/MenuShell.tsx';

describe('the menu layout marks the checkout wide', () => {
  it('marks the checkout', () => {
    expect(onCheckoutPath('/checkout')).toBe(true);
    expect(onCheckoutPath('/checkout/')).toBe(true);
  });

  it('leaves browsing, the cart and the account on the compact column', () => {
    for (const path of ['/', '/c/x', '/p/101', '/cart', '/account/orders/X', '/checkoutx', '/payment/success']) {
      expect(onCheckoutPath(path), path).toBe(false);
    }
  });
});
