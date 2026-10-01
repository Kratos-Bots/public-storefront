import { describe, expect, expectTypeOf, it } from 'vitest';
import { createTextApi, DEFAULT_TEXT_LAYERS, textKey } from '@/text/runtime.tsx';
import type { ParamArgs, PluralKey, StringKey } from '@/text/registry.ts';

// Compile-time checks: `npm --prefix web run typecheck` fails if any @ts-expect-error line compiles.
function typeOnly() {
  const { t, tp } = createTextApi(DEFAULT_TEXT_LAYERS);
  t('common.actions.tryAgain');
  t('common.qty.more', { name: 'Oats' });
  tp('cart.summary.items', 2);
  // @ts-expect-error a missing param
  t('common.qty.more');
  // @ts-expect-error a misspelled param
  t('common.qty.more', { nmae: 'Oats' });
  // @ts-expect-error params on a key without placeholders
  t('common.actions.tryAgain', { x: 1 });
  // @ts-expect-error t() on a plural key
  t('cart.summary.items');
  // @ts-expect-error tp() on a string key
  tp('common.actions.tryAgain', 1);
  // @ts-expect-error not a key
  textKey('cart.nope');
  expectTypeOf<ParamArgs<'common.qty.more'>>().toEqualTypeOf<[params: { name: string | number }]>();
  expectTypeOf<ParamArgs<'cart.summary.items', 'count'>>().toEqualTypeOf<[]>();
  expectTypeOf<'cart.summary.items' extends PluralKey ? true : false>().toEqualTypeOf<true>();
  expectTypeOf<'common.actions.tryAgain' extends StringKey ? true : false>().toEqualTypeOf<true>();
}

describe('text API types', () => {
  it('compile (see typecheck)', () => expect(typeof typeOnly).toBe('function'));
});
