import { describe, expect, it } from 'vitest';
import { isWarehouseBarRoute } from '@/features/warehouses/bar-route.ts';

describe('isWarehouseBarRoute', () => {
  it('is true on the catalogue and the product page, with or without a trailing slash', () => {
    for (const path of ['/', '/c/peptides', '/c/peptides/', '/c/a-b_c', '/p/1', '/p/4/', '/p/some-slug']) {
      expect(isWarehouseBarRoute(path), path).toBe(true);
    }
  });

  it('is false everywhere the shopper is not browsing products', () => {
    for (const path of [
      '/cart', '/cart/', '/pages/about', '/pages/about/', '/checkout', '/checkout/', '/checkout/review', '/order-placed',
      '/payment/success', '/payment/cancel', '/account', '/account/orders', '/account/orders/A1', '/account/profile',
      '/login', '/reset-password', '/verify-email', '/verify', '/tracking', '/tracking/XYZ', '/order/A1/key',
      '/c', '/c/', '/p', '/p/', '/c/a/b', '/p/1/extra', '/checkout-help', '/cartoon', '/something-else',
    ]) {
      expect(isWarehouseBarRoute(path), path).toBe(false);
    }
  });
});
