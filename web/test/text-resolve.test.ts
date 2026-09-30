import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineTextArea } from '@/text/define.ts';
import { createResolver } from '@/text/resolve.ts';

const entries = {
  ...defineTextArea('cart', {
    'drawer.title': { en: 'Your cart' },
    'summary.items': { en: { one: '{count} item', other: '{count} items' } },
    'errors.stock': { en: 'Only {available} left', max: 20 },
  }).entries,
  ...defineTextArea('closed', { 'eyebrow': { en: 'Currently closed', fixed: true } }).entries,
};
const { checkValue, resolveText } = createResolver(entries);
const none = {};
afterEach(() => vi.restoreAllMocks());

describe('checkValue', () => {
  it.each([
    ['nope.key', 'x', 'unknown-key'],
    ['cart.drawer.title', { one: 'a', other: 'b' }, 'type-mismatch'],
    ['cart.summary.items', 'items', 'type-mismatch'],
    ['cart.summary.items', { one: 'a' }, 'type-mismatch'],
    ['cart.errors.stock', 'Only {count} left', 'unknown-placeholder'],
    ['cart.errors.stock', 'Only { left', 'bad-brace'],
    ['cart.errors.stock', 'x'.repeat(21), 'too-long'],
    ['cart.drawer.title', '', 'empty'],
    ['cart.drawer.title', '   ', 'empty'],
    ['cart.summary.items', { one: '', other: 'x' }, 'empty'],
    ['closed.eyebrow', 'Back soon', 'fixed'],
  ])('%s = %j → %s', (key, value, rule) => {
    const r = checkValue(key, value);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.rule).toBe(rule); expect(r.message.length).toBeGreaterThan(0); }
  });
  it('accepts a dropped placeholder and a plural without count', () => {
    expect(checkValue('cart.errors.stock', 'Nearly gone')).toEqual({ ok: true });
    expect(checkValue('cart.summary.items', { one: 'one thing', other: 'several things' })).toEqual({ ok: true });
  });
});

describe('resolveText', () => {
  it('prefers the layout override, then shared, then the default', () => {
    const r = resolveText({ layout: { 'cart.drawer.title': 'Menu basket' }, shared: { 'cart.drawer.title': 'Basket', 'cart.errors.stock': 'Few left' } }, 'en');
    expect(r.value('cart.drawer.title')).toBe('Menu basket');
    expect(r.value('cart.errors.stock')).toBe('Few left');
    expect(r.value('cart.summary.items')).toEqual({ one: '{count} item', other: '{count} items' });
  });
  it('builtIn tells a release default from a stored value (a rejected one counts as default)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = resolveText({ layout: { 'cart.drawer.title': 'Basket', 'cart.summary.items': 'not plural' }, shared: {} }, 'fr');
    expect(r.builtIn('cart.drawer.title')).toBe(false);
    expect(r.builtIn('cart.summary.items')).toBe(true);
    expect(r.builtIn('cart.errors.stock')).toBe(true);
  });
  it('falls back per key: a bad override yields the shared value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = resolveText({ layout: { 'cart.errors.stock': 'Only {oops} left' }, shared: { 'cart.errors.stock': 'Few left' } }, 'en');
    expect(r.value('cart.errors.stock')).toBe('Few left');
    r.value('cart.errors.stock');
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('ignores stored values for fixed keys and unknown keys (one warning each per load)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = resolveText({ layout: {}, shared: { 'closed.eyebrow': 'Open!', 'gone.key': 'x' } }, 'en');
    expect(r.value('closed.eyebrow')).toBe('Currently closed');
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('gone.key'))).toHaveLength(1);
  });
  it('is memoised per layers object and locale', () => {
    const layers = { layout: none, shared: none };
    expect(resolveText(layers, 'en')).toBe(resolveText(layers, 'en'));
    expect(resolveText(layers, 'de')).not.toBe(resolveText(layers, 'en'));
  });
});
