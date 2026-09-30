// web/test/builder-editor-text-catalog.test.ts
import { describe, expect, it } from 'vitest';
import { TEXT } from '@/text/registry.ts';
import {
  allRows, blockTextRows, isFixedKey, isForTemplate, labelFromKey, matchesPattern, placeholdersOf, rowFor, rowMatches,
  textGroups, SITE_WIDE_GROUP,
} from '@/builder/editor/text/catalog.ts';
import { defaultOf, fixedKey, placeholderKey, plainKey, pluralKey } from './helpers/text-keys.ts';

describe('text catalogue', () => {
  it('has one row per non-fixed registry key, in registry order', () => {
    const keys = Object.keys(TEXT);
    const rows = allRows();
    expect(rows.map((r) => r.key)).toEqual(keys.filter((k) => !isFixedKey(k)));
    expect(rowFor(fixedKey())).toBeNull();
    expect(rowFor('nope.nope')).toBeNull();
  });

  it('a row carries default, area, max, plural and placeholders', () => {
    const plain = rowFor(plainKey())!;
    expect(plain.def).toBe(defaultOf(plain.key));
    expect(plain.area).toBe(plain.key.split('.')[0]);
    expect(plain.max).toBeGreaterThanOrEqual((plain.def as string).length);
    expect(plain.plural).toBe(false);
    expect(plain.placeholders).toEqual([]);
    const { key, name } = placeholderKey();
    expect(rowFor(key)!.placeholders).toContain(name);
    const plural = rowFor(pluralKey())!;
    expect(plural.plural).toBe(true);
    expect(plural.placeholders).toContain('count');
  });

  it('placeholders are the union over forms; a plural always takes count', () => {
    expect(placeholdersOf({ one: 'One {thing}', other: '{count} {thing}s by {who}' }, true)).toEqual(['count', 'thing', 'who']);
    expect(placeholdersOf({ one: 'One', other: 'Many' }, true)).toEqual(['count']);
    expect(placeholdersOf('Hi {name}', false)).toEqual(['name']);
  });

  it('labels come from the last key segment', () => {
    expect(labelFromKey('checkout.errors.paymentMissing')).toBe('Payment missing');
    expect(labelFromKey('cart.drawer.title')).toBe('Title');
  });

  it('patterns: exact keys and area.part.* prefixes', () => {
    expect(matchesPattern('cart.summary.items', 'cart.summary.*')).toBe(true);
    expect(matchesPattern('cart.summaryx.items', 'cart.summary.*')).toBe(false);
    expect(matchesPattern('cart.summary', 'cart.summary.*')).toBe(false);
    expect(matchesPattern('cart.drawer.title', 'cart.drawer.title')).toBe(true);
    expect(matchesPattern('cart.drawer.titles', 'cart.drawer.title')).toBe(false);
  });

  it('template keys show only for the active template, plus the built-in default slots', () => {
    expect(isForTemplate('templates.bento.heroTitle', 'bento')).toBe(true);
    expect(isForTemplate('templates.bento.heroTitle', 'modern')).toBe(false);
    expect(isForTemplate('cart.drawer.title', 'modern')).toBe(true);
    // Plan 2: templates.default.* are the built-in slots every template without its own slot renders.
    expect(isForTemplate('templates.default.footer.support', 'modern')).toBe(true);
    expect(isForTemplate('templates.default.footer.support', 'bento')).toBe(true);
  });

  it('groups: Site-wide first, then areas; no key twice; only the active template', () => {
    const groups = textGroups('modern');
    const keys = groups.flatMap((g) => g.rows.map((r) => r.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => isForTemplate(k, 'modern'))).toBe(true);
    if (groups.some((g) => g.id === SITE_WIDE_GROUP)) expect(groups[0]!.id).toBe(SITE_WIDE_GROUP);
    expect(groups.every((g) => g.rows.length > 0 && g.title !== '')).toBe(true);
  });

  it('block rows follow the block definition patterns (unknown block → none)', () => {
    expect(blockTextRows('NoSuchBlock', 'modern')).toEqual([]);
  });

  it('search matches key, label, note, default and extra values, case-insensitively', () => {
    const row = rowFor(plainKey())!;
    expect(rowMatches(row, '')).toBe(true);
    expect(rowMatches(row, row.key.toUpperCase())).toBe(true);
    expect(rowMatches(row, (row.def as string).slice(0, 4).toLowerCase())).toBe(true);
    expect(rowMatches(row, 'zzqq-no-such')).toBe(false);
    expect(rowMatches(row, 'northbound', ['Northbound wording'])).toBe(true);
  });
});
