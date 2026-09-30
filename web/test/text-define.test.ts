import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineTextArea, hasBadBrace, placeholdersIn, placeholdersOf, type ParamsOf } from '@/text/define.ts';
import { isLocale, isTextValue, KEY_RE } from '@/text/types.ts';

const area = defineTextArea('cart', {
  'drawer.title': { en: 'Your cart', note: 'Heading of the slide-out cart' },
  'summary.items': { en: { one: '{count} item', other: '{count} items' } },
  'errors.stock': { en: 'Only {available} left of {name}', max: 80 },
  'units': { en: { one: 'line', other: 'lines' } },
});

describe('defineTextArea', () => {
  it('prefixes every key with the area', () => {
    expect(area.area).toBe('cart');
    expect(Object.keys(area.entries)).toEqual(['cart.drawer.title', 'cart.summary.items', 'cart.errors.stock', 'cart.units']);
    expect(area.entries['cart.errors.stock'].max).toBe(80);
  });
  it('infers full keys and placeholder names at the type level', () => {
    expectTypeOf<keyof typeof area.entries>().toEqualTypeOf<'cart.drawer.title' | 'cart.summary.items' | 'cart.errors.stock' | 'cart.units'>();
    expectTypeOf<ParamsOf<'Only {available} left'>>().toEqualTypeOf<{ available: string | number }>();
    expectTypeOf<ParamsOf<'No holes'>>().toEqualTypeOf<{}>();
  });
});

describe('placeholders', () => {
  it('lists unique names in order', () => {
    expect(placeholdersIn('{a} and {b} and {a}')).toEqual(['a', 'b']);
    expect(placeholdersIn('none')).toEqual([]);
  });
  it('a plural key always accepts count, even when no form uses it', () => {
    expect([...placeholdersOf(area.entries['cart.units'])]).toEqual(['count']);
    expect([...placeholdersOf(area.entries['cart.errors.stock'])]).toEqual(['available', 'name']);
  });
  it('flags braces that are not placeholders', () => {
    expect(hasBadBrace('{ok}')).toBe(false);
    expect(hasBadBrace('a { b')).toBe(true);
    expect(hasBadBrace('{1bad}')).toBe(true);
    expect(hasBadBrace('}{')).toBe(true);
  });
});

describe('shapes', () => {
  it('accepts canonical locales only', () => {
    for (const ok of ['en', 'de', 'pt-BR', 'zh-Hant', 'es-419']) expect(isLocale(ok), ok).toBe(true);
    for (const bad of ['EN', 'en_GB', 'en-gb', 'english', '', 'zh-hant']) expect(isLocale(bad), bad).toBe(false);
  });
  it('accepts strings and plural objects with other', () => {
    expect(isTextValue('x')).toBe(true);
    expect(isTextValue({ one: 'a', other: 'b' })).toBe(true);
    expect(isTextValue({ one: 'a' })).toBe(false);
    expect(isTextValue({ other: 'b', lots: 'c' })).toBe(false);
    expect(isTextValue({ other: 3 })).toBe(false);
    expect(isTextValue(['a'])).toBe(false);
  });
  it('key shape', () => {
    for (const ok of ['cart.drawer.title', 'templates.cyber-brutalism.footer.status', 'a.b']) expect(KEY_RE.test(ok), ok).toBe(true);
    for (const bad of ['cart', 'Cart.title', 'cart..x', 'cart.-x', 'a.b.c.d.e.f.g', 'cart.title ']) expect(KEY_RE.test(bad), bad).toBe(false);
  });
});
