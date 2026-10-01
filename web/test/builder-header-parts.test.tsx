/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { legacyHeaderSlots } from '@/layouts/header-parts.tsx';
import { HEADER_CONTAINER } from '@/builder/blocks/_shared/header-container.ts';
import type { ComponentData } from '@/builder/types.ts';

type Variant = 'storefront' | 'menu' | 'webapp';

describe('header-parts: legacyHeaderSlots vs HEADER_CONTAINER.defaultSlots', () => {
  /**
   * Extract part type names from a slot render or component data array.
   * For legacyHeaderSlots, we traverse the PartHost elements.
   * For defaultSlots, we read the type directly from ComponentData.
   */
  const extractPartTypes = (slot: any): string[] => {
    // If it's a slot render function, we need to call it and inspect JSX children
    if (typeof slot === 'function') {
      const result = slot();
      if (result && Array.isArray(result?.props?.children)) {
        return result.props.children
          .filter((child: any) => child && typeof child === 'object')
          .map((child: any) => child.props?.name ?? '');
      }
      // Single child
      if (result && typeof result === 'object' && result.props?.name) {
        return [result.props.name];
      }
      return [];
    }
    // If it's already component data array
    if (Array.isArray(slot)) {
      return slot.map((item: ComponentData) => item.type);
    }
    return [];
  };

  it.each<[Variant, Record<string, any>]>([
    ['storefront', { variant: 'storefront', search: true }],
    ['storefront', { variant: 'storefront', search: false }],
    ['menu', { variant: 'menu', search: true }],
    ['menu', { variant: 'menu', search: false }],
    ['webapp', { variant: 'webapp', search: true }],
    ['webapp', { variant: 'webapp', search: false }],
    ['storefront', { variant: 'storefront', search: true, cartIcon: 'hide' }],
  ])('produces the same slot arrangement: %s with %O', (variant: Variant, props: any) => {
    const layout = variant === 'webapp' ? 'webapp' : variant;
    const search = props.search !== false;

    // Get legacyHeaderSlots output
    const legacySlots = legacyHeaderSlots(variant, search, null);

    // Get defaultSlots output
    const defaultSlots = HEADER_CONTAINER.defaultSlots(
      { ...props, accountIcon: undefined, cartIcon: props.cartIcon ?? undefined },
      { layout, id: 'test-header' },
    );

    // Extract and compare part types for each slot
    const slots = ['start', 'nav', 'middle', 'end'] as const;
    for (const slotName of slots) {
      const legacyParts = extractPartTypes(legacySlots[slotName]);
      const defaultParts = extractPartTypes(defaultSlots[slotName]);

      expect(legacyParts, `${slotName} slot for ${variant} with search=${search}`).toEqual(defaultParts);
    }
  });
});
