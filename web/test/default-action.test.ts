import { describe, expect, it } from 'vitest';
import { defaultPrimaryAction } from '@/features/webapp/default-action.ts';

const base = { pathname: '/', count: 2, subtotalLabel: '£24.00', checkoutTo: '/checkout', ordering: true, blocked: false };

describe('defaultPrimaryAction', () => {
  it('offers the cart from the catalogue once something is in it', () => {
    expect(defaultPrimaryAction(base)).toEqual({ label: 'View cart · £24.00', to: '/cart', disabled: false });
  });

  it('offers the cart from a category and from a product sheet', () => {
    expect(defaultPrimaryAction({ ...base, pathname: '/c/tea' })?.to).toBe('/cart');
    expect(defaultPrimaryAction({ ...base, pathname: '/account/orders' })?.to).toBe('/cart');
  });

  it('inside Telegram, offers the cart on the catalogue and category listings only', () => {
    const tg = { ...base, browseOnCatalogOnly: true };
    expect(defaultPrimaryAction(tg)?.to).toBe('/cart');
    expect(defaultPrimaryAction({ ...tg, pathname: '/c/tea' })?.to).toBe('/cart');
    for (const pathname of ['/account', '/account/orders', '/p/sample-tea', '/reviews', '/support', '/login']) {
      expect(defaultPrimaryAction({ ...tg, pathname })).toBeNull();
    }
  });

  it('inside Telegram, /cart still offers checkout', () => {
    expect(defaultPrimaryAction({ ...base, pathname: '/cart', browseOnCatalogOnly: true })?.label).toBe('Checkout · £24.00');
  });

  it('offers checkout from the cart, to wherever checkout lives for this shopper', () => {
    expect(defaultPrimaryAction({ ...base, pathname: '/cart', checkoutTo: '/login?returnTo=%2Fcheckout' }))
      .toEqual({ label: 'Checkout · £24.00', to: '/login?returnTo=%2Fcheckout', disabled: false });
  });

  it('holds checkout while a line is flagged', () => {
    expect(defaultPrimaryAction({ ...base, pathname: '/cart', blocked: true })?.disabled).toBe(true);
  });

  it('stands down on checkout — the page registers its own action', () => {
    expect(defaultPrimaryAction({ ...base, pathname: '/checkout' })).toBeNull();
  });

  it('has nothing to offer with an empty cart or ordering off', () => {
    expect(defaultPrimaryAction({ ...base, count: 0 })).toBeNull();
    expect(defaultPrimaryAction({ ...base, pathname: '/cart', count: 0 })).toBeNull();
    expect(defaultPrimaryAction({ ...base, ordering: false })).toBeNull();
  });

  it('never points at the page the shopper is already on', () => {
    expect(defaultPrimaryAction({ ...base, pathname: '/login' })?.to).toBe('/cart');
    expect(defaultPrimaryAction({ ...base, pathname: '/order-placed' })).toBeNull();
  });
});
