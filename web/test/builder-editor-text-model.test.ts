import { describe, expect, it } from 'vitest';
import {
  cleanInput, emptyPageText, emptySiteText, hasStrings, isPostable, normalizeValue, postablePageText, postableSiteText,
  valueStrings, withValue,
} from '@/builder/editor/text/model.ts';

describe('text model', () => {
  it('empty docs', () => {
    expect(emptySiteText()).toEqual({ schemaVersion: 1, language: { locale: 'en', formatLocale: '' }, strings: {} });
    expect(emptyPageText()).toEqual({ strings: {} });
    expect(emptySiteText()).not.toBe(emptySiteText());
  });

  it('cleanInput drops control characters, keeps newlines, turns tabs into spaces', () => {
    expect(cleanInput('a\u0000b\tc\nd\u007F')).toBe('ab c\nd');
  });

  it('normalizeValue: empty string and empty forms reset', () => {
    expect(normalizeValue('')).toBeNull();
    expect(normalizeValue(null)).toBeNull();
    expect(normalizeValue('Your basket')).toBe('Your basket');
    expect(normalizeValue({ one: '', other: '' })).toBeNull();
    expect(normalizeValue({ other: '{count} items', one: '' })).toEqual({ other: '{count} items' });
    expect(Object.keys(normalizeValue({ other: 'x', one: 'y', few: 'z' }) as object)).toEqual(['one', 'few', 'other']);
    expect(normalizeValue({ one: '1 item' })).toEqual({ one: '1 item' });
  });

  it('withValue sets, replaces and resets, dropping empty locale maps; unchanged returns the same object', () => {
    const a = {};
    const b = withValue(a, 'en', 'cart.drawer.title', 'Your basket');
    expect(b).toEqual({ en: { 'cart.drawer.title': 'Your basket' } });
    expect(withValue(b, 'en', 'cart.drawer.title', 'Your basket')).toBe(b);
    const c = withValue(b, 'de', 'cart.drawer.title', 'Warenkorb');
    expect(c).toEqual({ en: { 'cart.drawer.title': 'Your basket' }, de: { 'cart.drawer.title': 'Warenkorb' } });
    expect(withValue(c, 'en', 'cart.drawer.title', '')).toEqual({ de: { 'cart.drawer.title': 'Warenkorb' } });
    expect(withValue(a, 'en', 'cart.drawer.title', null)).toBe(a);
  });

  it('isPostable mirrors the backend structural rules', () => {
    expect(isPostable('Only {available} left')).toBe(true);
    expect(isPostable('Line one\nLine two')).toBe(true);
    expect(isPostable('')).toBe(false);
    expect(isPostable('x'.repeat(1000))).toBe(true);
    expect(isPostable('x'.repeat(1001))).toBe(false);
    expect(isPostable('Only {avail')).toBe(false);
    expect(isPostable('Braces } alone')).toBe(false);
    expect(isPostable('{1bad}')).toBe(false);
    expect(isPostable(`{${'a'.repeat(33)}}`)).toBe(false);
    expect(isPostable('tab\there')).toBe(false);
    const eleven = Array.from({ length: 11 }, (_, i) => `{p${i}}`).join(' ');
    expect(isPostable(eleven)).toBe(false);
    expect(isPostable({ one: '{count} item', other: '{count} items' })).toBe(true);
    expect(isPostable({ one: '{count} item' })).toBe(false);
    expect(isPostable({ other: 'x', lots: 'y' })).toBe(false);
    expect(isPostable({ other: '' })).toBe(false);
    expect(isPostable(42)).toBe(false);
    const six = (p: string) => Array.from({ length: 6 }, (_, i) => `{${p}${i}}`).join(' ');
    expect(isPostable({ one: six('a'), other: six('b') })).toBe(false);
    expect(isPostable({ one: six('a'), other: six('a') })).toBe(true);
    expect(isPostable({ other: 5 })).toBe(false);
  });

  it('postable docs leave out what the backend would refuse, and keep other locales', () => {
    const doc = {
      schemaVersion: 1 as const,
      language: { locale: 'de', formatLocale: 'de-AT' as const },
      strings: { en: { 'a.b': 'Hi' }, de: { 'a.b': 'Hallo {nam', 'a.c': 'Gut' } },
    };
    expect(postableSiteText(doc)).toEqual({ schemaVersion: 1, language: { locale: 'de', formatLocale: 'de-AT' }, strings: { en: { 'a.b': 'Hi' }, de: { 'a.c': 'Gut' } } });
    expect(postablePageText({ strings: { en: { 'a.b': '{' } } })).toBeUndefined();
    expect(postablePageText({ strings: { en: { 'a.b': 'Ok' } } })).toEqual({ strings: { en: { 'a.b': 'Ok' } } });
    expect(hasStrings({ en: {} })).toBe(false);
  });

  it('treats prototype-ish keys as data', () => {
    const s = { en: { a: 'x' } };
    expect(withValue(s, 'en', 'constructor', null)).toBe(s);
    expect(withValue(s, 'constructor', 'a.b', null)).toBe(s);
    const j = JSON.parse('{"en":{"__proto__":"x"}}');
    expect(Object.keys(withValue(j, 'en', 'a.b', 'y').en)).toEqual(['__proto__', 'a.b']);
    expect(Object.keys(postableSiteText({ schemaVersion: 1, language: { locale: 'en', formatLocale: '' }, strings: j }).strings.en)).toEqual(['__proto__']);
  });

  it('valueStrings flattens a value for search', () => {
    expect(valueStrings(undefined)).toEqual([]);
    expect(valueStrings('a')).toEqual(['a']);
    expect(valueStrings({ one: 'x', other: 'y' })).toEqual(['x', 'y']);
  });
});
