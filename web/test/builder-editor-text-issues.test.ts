import { describe, expect, it } from 'vitest';
import { countWarnings, resolveCell, ruleFor, textIssueMessage, textIssues, unusedEntries } from '@/builder/editor/text/issues.ts';
import { rowFor } from '@/builder/editor/text/catalog.ts';
import { defaultOf, fixedKey, placeholderKey, plainKey, pluralKey } from './helpers/text-keys.ts';

describe('text issues', () => {
  const plain = plainKey();
  const { key: withPh, name } = placeholderKey();
  const plural = pluralKey();

  it('valid values raise nothing', () => {
    expect(ruleFor(plain, 'Northbound wording')).toBeNull();
    expect(ruleFor(plain, 'Two\nlines')).toBeNull();
    expect(ruleFor(withPh, `Only {${name}}`)).toBeNull();
    expect(ruleFor(withPh, 'Dropped the placeholder')).toBeNull();
    expect(ruleFor(plural, { one: '{count} thing', other: '{count} things' })).toBeNull();
  });

  it('flags every rule the editor can meet', () => {
    expect(ruleFor(plain, 'Hi {nope}')).toBe('unknown-placeholder');
    expect(ruleFor(plain, 'Hi {')).toBe('bad-brace');
    expect(ruleFor(plain, 'x'.repeat(rowFor(plain)!.max + 1))).toBe('too-long');
    expect(ruleFor(plain, { one: 'a', other: 'b' })).toBe('type-mismatch');
    expect(ruleFor(plural, 'just a string')).toBe('type-mismatch');
    expect(ruleFor(plural, { one: '{count} thing' })).toBe('empty');
    expect(ruleFor('zz.never.registered', 'x')).toBe('unknown-key');
    expect(ruleFor(fixedKey(), 'x')).toBe('fixed');
  });

  it('flags control characters the backend refuses, in strings and plural forms', () => {
    expect(ruleFor(plain, 'Tab\there')).toBe('control-char');
    expect(ruleFor(plain, 'Nul\u0000')).toBe('control-char');
    expect(ruleFor(plural, { one: '{count} a', other: '{count}\u007F b' })).toBe('control-char');
    expect(textIssueMessage('control-char', plain, 'x')).toContain('control characters');
  });

  it('warns (non-blocking) when a non-one plural form drops {count}', () => {
    expect(countWarnings(plural, { one: 'A thing', other: '{count} things' })).toEqual([]);
    expect(countWarnings(plural, { one: '{count} thing', other: 'Many things' })).toEqual(['other']);
    expect(countWarnings(plain, 'x')).toEqual([]);
  });

  it('messages name the placeholders an owner may use', () => {
    expect(textIssueMessage('unknown-placeholder', withPh, 'Hi {nope}')).toContain('{nope}');
    expect(textIssueMessage('unknown-placeholder', withPh, 'Hi {nope}')).toContain(`{${name}}`);
    expect(textIssueMessage('unknown-placeholder', plain, 'Hi {nope}')).toContain('takes no placeholders');
    expect(textIssueMessage('too-long', plain, '')).toBe(`Keep this line to ${rowFor(plain)!.max} characters.`);
    expect(textIssueMessage('empty', plural, { one: 'a' })).toContain('“other” form');
  });

  it('the empty message names the plural form that is actually empty (admin-facing textIssues)', () => {
    expect(textIssueMessage('empty', plural, { one: '  ', other: '{count} crates' })).toBe('Fill in the “one” form, or clear it to use “other”.');
    expect(textIssueMessage('empty', plural, { zero: '', one: ' ', other: '{count} crates' }))
      .toBe('Fill in the “zero” and “one” forms, or clear them to use “other”.');
    expect(textIssueMessage('empty', plural, { one: 'a', other: ' ' })).toContain('“other” form');
    const [issue] = textIssues({ shared: null, layout: { [plural]: { one: ' ', other: '{count} crates' } } });
    expect(issue?.message).toContain('“one” form');
  });

  it('textIssues: shared first, unknown keys never block, null shared is skipped', () => {
    const issues = textIssues({ shared: { [plain]: 'Hi {', 'zz.never.registered': 'x' }, layout: { [plain]: 'Hi {nope}' } });
    expect(issues.map((i) => [i.scope, i.key, i.rule])).toEqual([
      ['shared', plain, 'bad-brace'],
      ['layout', plain, 'unknown-placeholder'],
    ]);
    expect(issues.every((i) => i.message.length > 0)).toBe(true);
    expect(textIssues({ shared: null, layout: {} })).toEqual([]);
  });

  it('resolveCell: first valid of layout → shared → default, per key', () => {
    expect(resolveCell(plain, {})).toEqual({ value: defaultOf(plain), from: 'default' });
    expect(resolveCell(plain, { shared: 'Shared' })).toEqual({ value: 'Shared', from: 'shared' });
    expect(resolveCell(plain, { shared: 'Shared', layout: 'Mine' })).toEqual({ value: 'Mine', from: 'layout' });
    expect(resolveCell(plain, { shared: 'Shared', layout: 'Bad {nope}' })).toEqual({ value: 'Shared', from: 'shared' });
  });

  it('unusedEntries lists unknown and fixed stored keys with their scope', () => {
    const fixed = fixedKey();
    expect(unusedEntries({ shared: { 'zz.never.registered': 'x', [plain]: 'ok' }, layout: { [fixed]: 'y' } })).toEqual([
      { scope: 'shared', key: 'zz.never.registered', rule: 'unknown-key', value: 'x' },
      { scope: 'layout', key: fixed, rule: 'fixed', value: 'y' },
    ]);
  });
});
