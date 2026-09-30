// web/test/builder-editor-text-languages.test.ts
import { describe, expect, it } from 'vitest';
import {
  LANGUAGES, canonicalTag, fillExample, formatOptions, isStoreLocale, nativeName, pluralFormsFor, sampleCount, variantLabel,
} from '@/builder/editor/text/languages.ts';

const RTL = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'yi', 'dv', 'sd', 'ug', 'ckb']);

describe('store languages', () => {
  it('offers ~40 left-to-right languages, every tag in canonical store form', () => {
    expect(LANGUAGES.length).toBeGreaterThanOrEqual(38);
    expect(LANGUAGES[0]!.code).toBe('en');
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const l of LANGUAGES) {
      expect(RTL.has(l.code.split('-')[0]!)).toBe(false);
      expect(isStoreLocale(l.code), l.code).toBe(true);
      for (const r of l.regions) {
        expect(isStoreLocale(r), r).toBe(true);
        expect(r.startsWith(`${l.code}-`), r).toBe(true);
      }
    }
  });

  it('validates tags like the backend: shape and canonical form', () => {
    expect(isStoreLocale('en')).toBe(true);
    expect(isStoreLocale('pt-BR')).toBe(true);
    expect(isStoreLocale('zh-Hant')).toBe(true);
    expect(isStoreLocale('es-419')).toBe(true);
    expect(isStoreLocale('en-gb')).toBe(false);
    expect(isStoreLocale('EN')).toBe(false);
    expect(isStoreLocale('en-GB-oxendict')).toBe(false);
    expect(isStoreLocale('')).toBe(false);
    expect(canonicalTag(' en-gb ')).toBe('en-GB');
    expect(canonicalTag('zh-hant-tw')).toBe('zh-Hant-TW');
    expect(canonicalTag('not a tag')).toBeNull();
    expect(canonicalTag('en-GB-oxendict')).toBeNull();
  });

  it('names languages in themselves', () => {
    expect(nativeName('de')).toBe('Deutsch');
    expect(nativeName('en')).toBe('English');
    expect(nativeName('fr')).toBe('Français');
    expect(variantLabel('de-AT')).toMatch(/^Deutsch \(Österreich\)/);
  });

  it('format options start with the built-in choice', () => {
    const opts = formatOptions('de');
    expect(opts[0]).toEqual({ value: '', label: 'Built-in for Deutsch' });
    expect(opts.map((o) => o.value)).toContain('de-AT');
    expect(formatOptions('xx')).toEqual([{ value: '', label: 'Built-in for xx' }]);
  });

  it('plural forms per locale, other last, with a live example count', () => {
    expect(pluralFormsFor('en')).toEqual(['one', 'other']);
    expect(pluralFormsFor('pl')).toEqual(['one', 'few', 'many', 'other']);
    expect(sampleCount('en', 'one')).toBe(1);
    expect(sampleCount('en', 'other')).toBe(5);
    expect(sampleCount('pl', 'many')).toBe(5);
    expect(sampleCount('pl', 'few')).toBe(2);
    expect(fillExample('{count} items', 5)).toBe('5 items');
    expect(fillExample('{count} of {count}', 1000)).toBe('1000 of 1000');
  });
});
