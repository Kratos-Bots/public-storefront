import { describe, expect, it } from 'vitest';
import { customPageKey, FIXED_ROUTE_KEYS, isComponentLike, isFixedRouteKey } from '@/builder/types.ts';

describe('builder types', () => {
  it('lists the 16 fixed route keys from the spec', () => {
    expect(FIXED_ROUTE_KEYS).toHaveLength(18);
    expect(isFixedRouteKey('account.order')).toBe(true);
    expect(isFixedRouteKey('page:about')).toBe(false);
  });
  it('builds custom page keys only from valid slugs', () => {
    expect(customPageKey('our-story')).toBe('page:our-story');
    expect(customPageKey('Our-Story')).toBeNull();
    expect(customPageKey('')).toBeNull();
    expect(customPageKey('a'.repeat(61))).toBeNull();
  });
  it('recognises component-shaped values', () => {
    expect(isComponentLike({ type: 'Heading', props: { id: 'h1' } })).toBe(true);
    expect(isComponentLike({ type: 'Heading', props: {} })).toBe(false);
    expect(isComponentLike({ type: 'Heading', props: { id: 'x'.repeat(65) } })).toBe(false);
    expect(isComponentLike(null)).toBe(false);
  });
});
