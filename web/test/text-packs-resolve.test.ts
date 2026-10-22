import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineTextArea } from '@/text/define.ts';
import { loadPack, type Pack } from '@/text/packs/index.ts';
import { createResolver } from '@/text/resolve.ts';
import { createTextApi } from '@/text/snapshot.ts';

const entries = {
  ...defineTextArea('cart', {
    'drawer.title': { en: 'Your cart' },
    'summary.items': { en: { one: '{count} item', other: '{count} items' } },
    'errors.stock': { en: 'Only {available} left', max: 20 },
  }).entries,
  ...defineTextArea('closed', { eyebrow: { en: 'Currently closed', fixed: true } }).entries,
};
const FR = {
  'cart.drawer.title': 'Votre panier',
  'cart.summary.items': { one: '{count} article', other: '{count} articles' },
  'cart.errors.stock': 'Plus que {available}',
  'closed.eyebrow': 'Ferme',
} as unknown as Pack;
afterEach(() => vi.restoreAllMocks());

describe('resolution chain with a pack', () => {
  it('layout, then shared, then pack, then English, per key', () => {
    const { resolveText } = createResolver(entries, () => FR);
    const r = resolveText({ layout: { 'cart.drawer.title': 'Mon panier' }, shared: { 'cart.drawer.title': 'Panier', 'cart.errors.stock': 'Peu' } }, 'fr');
    expect(r.value('cart.drawer.title')).toBe('Mon panier');
    expect(r.value('cart.errors.stock')).toBe('Peu');
    expect(r.value('cart.summary.items')).toEqual({ one: '{count} article', other: '{count} articles' });
    expect(resolveText({ layout: {}, shared: {} }, 'fr').value('cart.drawer.title')).toBe('Votre panier');
  });
  it('fixed keys and invalid pack values fall through to English', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { resolveText } = createResolver(entries, () => ({ ...FR, 'cart.errors.stock': 'x'.repeat(40) }) as unknown as Pack);
    const r = resolveText({ layout: {}, shared: {} }, 'fr');
    expect(r.value('closed.eyebrow')).toBe('Currently closed');
    expect(r.value('cart.errors.stock')).toBe('Only {available} left');
    expect(r.rulesLocale('cart.errors.stock')).toBe('en');
    expect(warn).toHaveBeenCalled();
  });
  it('rulesLocale: stored and pack values use the store locale, only the English fallback uses en', () => {
    const { resolveText } = createResolver(entries, () => ({ 'cart.summary.items': { one: '{count} article', other: '{count} articles' } }) as unknown as Pack);
    const r = resolveText({ layout: {}, shared: { 'cart.drawer.title': 'Panier' } }, 'fr');
    expect(r.rulesLocale('cart.drawer.title')).toBe('fr');
    expect(r.rulesLocale('cart.summary.items')).toBe('fr');
    expect(r.rulesLocale('cart.errors.stock')).toBe('en');
  });
  it('the memo does not reuse a resolution made before the pack loaded', () => {
    let pack: Pack | undefined;
    const { resolveText } = createResolver(entries, () => pack);
    const layers = { layout: {}, shared: {} }; // one identity throughout, as the app layers are
    const before = resolveText(layers, 'fr');
    expect(before.value('cart.drawer.title')).toBe('Your cart');
    expect(resolveText(layers, 'fr')).toBe(before);
    pack = FR;
    const after = resolveText(layers, 'fr');
    expect(after).not.toBe(before);
    expect(after.value('cart.drawer.title')).toBe('Votre panier');
  });
});

describe('createTextApi with the real fr pack', () => {
  it('picks a pack plural form with the store locale rules (0 is one in French); the English fallback keeps en rules', async () => {
    await loadPack('fr');
    const fr = createTextApi({ locale: 'fr', formatLocale: '', shared: {}, layout: {} });
    const de = createTextApi({ locale: 'de', formatLocale: '', shared: {}, layout: {} }); // no pack: English fallback
    expect(fr.tp('shell.header.cartAriaLabel', 0)).toBe('Panier, 0 article'); // fr rules: 0 is `one`
    expect(fr.tp('shell.header.cartAriaLabel', 2)).toBe('Panier, 2 articles');
    expect(de.tp('shell.header.cartAriaLabel', 0)).toBe('Cart, 0 items');
  });
  it('languages defaults to [locale] and reflects the layers', () => {
    expect(createTextApi({ locale: 'fr', formatLocale: '', shared: {}, layout: {} }).languages).toEqual(['fr']);
    expect(createTextApi({ locale: 'fr', formatLocale: '', shared: {}, layout: {}, languages: ['fr', 'en'] }).languages).toEqual(['fr', 'en']);
  });
});
