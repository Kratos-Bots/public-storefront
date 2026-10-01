import { describe, expect, it } from 'vitest';
import { categoriesFor, pluralCategory } from '@/text/plural.ts';

describe('pluralCategory', () => {
  it('English is `one` exactly when n === 1 (today\'s ternaries)', () => {
    expect([0, 1, 2, 1.5, 1000].map((n) => pluralCategory('en', n))).toEqual(['other', 'one', 'other', 'other', 'other']);
    for (const n of [0, 2, 3, 11, 21, 100, 1000]) expect(pluralCategory('en', n) === 'one').toBe(n === 1);
  });
  it('Polish has one / few / many', () => {
    expect([1, 2, 5, 22, 25].map((n) => pluralCategory('pl', n))).toEqual(['one', 'few', 'many', 'few', 'many']);
  });
  it('an invalid locale reads as English instead of throwing', () => {
    expect(pluralCategory('not a locale', 1)).toBe('one');
  });
});

describe('categoriesFor', () => {
  it('lists the locale\'s categories with other last', () => {
    expect(categoriesFor('en')).toEqual(['one', 'other']);
    expect(categoriesFor('pl')).toEqual(['one', 'few', 'many', 'other']);
  });
});
