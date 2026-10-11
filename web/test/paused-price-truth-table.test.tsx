import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { StorefrontSettings } from '@/types/settings.ts';

const ordering = vi.hoisted(() => ({ on: true }));
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ currency: 'GBP', features: { ordering: ordering.on } }) as unknown as StorefrontSettings,
}));

// The guard is passed through: the real one refuses an Add part without a Price part (`requires` in card-containers.ts) and
// does not allow every shape below, but the compiler's own facts (cards.ts) are what is under test.
vi.mock('@/builder/guard.ts', async (orig) => ({
  ...((await orig()) as typeof import('@/builder/guard.ts')),
  validateDoc: (doc: unknown) => ({ doc, issues: [] }),
}));

import { compileCard } from '@/builder/cards.ts';
import { ProductCard, TILE_VIEWS } from '@/features/catalog/ProductCard.tsx';
import { ProductRow, ROW_VIEWS } from '@/features/catalog/ProductRow.tsx';
import { resetWarehouseStore, useWarehouseStore } from '@/features/warehouses/store.ts';
import { baseProduct } from './helpers/product-fixtures.ts';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';

// The real design compiler and real parts: what a published card design renders while the warehouse is paused.

const pause = (paused: boolean) =>
  useWarehouseStore.setState({
    warehouseId: paused ? 2 : null,
    ctx: {
      enabled: true, failed: false, carried: null,
      list: [{ id: 1, name: 'Main', country: 'GB', isDefault: true }, { id: 2, name: 'UK', country: 'GB', isDefault: false, orderingEnabled: false, orderingMessage: 'Back Monday' }],
    },
  });

type AddShape = 'everywhere' | 'mobile' | 'hiddenColumn' | 'none';
type Kind = 'tile' | 'row';
const NAMES = { tile: { frame: 'CardTile', name: 'CardTileName', price: 'CardTilePrice', add: 'CardTileAdd' }, row: { frame: 'CardRow', name: 'CardRowName', price: 'CardRowPrice', add: 'CardRowAdd' } } as const;

function design(kind: Kind, add: AddShape, price: boolean): PuckDoc {
  const n = NAMES[kind];
  const part = (type: string, id: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
  const content: ComponentData[] = [part(n.name, 'n')];
  if (price) content.push(part(n.price, 'p'));
  if (add === 'everywhere') content.push(part(n.add, 'a'));
  if (add === 'mobile') content.push(part(n.add, 'a', { blockStyle: { hide: 'mobile' } }));
  if (add === 'hiddenColumn') content.push({ type: 'Columns', props: { id: 'c', columns: '2', col1: [], col2: [], col3: [part(n.add, 'a')], col4: [] } });
  return { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [{ type: n.frame, props: { id: 'card', content } }] } as PuckDoc;
}

function mountDesign(kind: Kind, doc: PuckDoc) {
  const compiled = compileCard(doc, kind, 'storefront');
  expect(compiled, 'the design compiles').not.toBeNull();
  const data = { product: baseProduct(), eager: false, hasSiblingImages: true };
  return render(
    <MantineProvider env="test"><MemoryRouter>{compiled!.render(data, kind === 'tile' ? TILE_VIEWS : ROW_VIEWS)}</MemoryRouter></MantineProvider>,
  );
}

const prices = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('[data-sf-part="price"]')];
/** Does this price sit in the Add part's slot (the picker's gutter / the foot's Add box)? */
const inAddSlot = (el: HTMLElement) => !!el.closest('[class*="gutter"], [class*="addPrice"]');

beforeEach(() => { ordering.on = true; resetWarehouseStore(); });
afterEach(cleanup);

for (const kind of ['row', 'tile'] as const) {
  describe(`${kind}: the paused price, by the design's Add and Price parts`, () => {
    beforeEach(() => pause(true));

    it('Add everywhere, Price present: one price, in the Add slot', () => {
      const p = prices(mountDesign(kind, design(kind, 'everywhere', true)).container);
      expect(p).toHaveLength(1);
      expect(inAddSlot(p[0]!)).toBe(true);
    });
    it('Add everywhere, no Price: one price, in the Add slot', () => {
      const p = prices(mountDesign(kind, design(kind, 'everywhere', false)).container);
      expect(p).toHaveLength(1);
      expect(inAddSlot(p[0]!)).toBe(true);
    });
    it('Add hidden on phones, Price present: the Add slot draws none and the Price part draws the one price', () => {
      const { container } = mountDesign(kind, design(kind, 'mobile', true));
      const p = prices(container);
      expect(p).toHaveLength(1);
      expect(inAddSlot(p[0]!)).toBe(false);
      expect(container.querySelector('[class*="gutter"], [class*="addPrice"]')).toBeNull();
    });
    it('Add hidden on phones, no Price: the Add slot draws it, so it shows wherever the Add part shows', () => {
      const p = prices(mountDesign(kind, design(kind, 'mobile', false)).container);
      expect(p).toHaveLength(1);
      expect(inAddSlot(p[0]!)).toBe(true);
    });
    it('Add in a hidden column, no Price: nothing (the design shows no price and no Add part)', () => {
      expect(prices(mountDesign(kind, design(kind, 'hiddenColumn', false)).container)).toHaveLength(0);
    });
    it('Add in a hidden column, Price present: the Price part draws it', () => {
      const p = prices(mountDesign(kind, design(kind, 'hiddenColumn', true)).container);
      expect(p).toHaveLength(1);
      expect(inAddSlot(p[0]!)).toBe(false);
    });
    it('No Add, Price present: the Price part draws it', () => {
      const p = prices(mountDesign(kind, design(kind, 'none', true)).container);
      expect(p).toHaveLength(1);
      expect(inAddSlot(p[0]!)).toBe(false);
    });
    it('default card (no design): one price, in the picker\'s slot', () => {
      const { container } = render(
        <MantineProvider env="test"><MemoryRouter>
          {kind === 'tile' ? <ProductCard product={baseProduct()} /> : <ProductRow product={baseProduct()} onSelect={() => {}} />}
        </MemoryRouter></MantineProvider>,
      );
      const p = prices(container);
      expect(p).toHaveLength(1);
      expect(inAddSlot(p[0]!)).toBe(true);
    });
  });

  describe(`${kind}: with ordering on (warehouse open) nothing paused is drawn`, () => {
    beforeEach(() => pause(false));
    const shapes: Array<[AddShape, boolean]> = [['everywhere', true], ['everywhere', false], ['mobile', true], ['mobile', false], ['hiddenColumn', false], ['none', true]];
    it.each(shapes)('Add %s, Price %s: no price in an Add slot, and the Price part (when there is one) is in its own place', (add, price) => {
      const { container } = mountDesign(kind, design(kind, add, price));
      expect(container.querySelector('[class*="addPrice"], [class*="gutterPrice"]')).toBeNull();
      const p = prices(container);
      expect(p).toHaveLength(price ? 1 : 0);
      for (const el of p) expect(inAddSlot(el)).toBe(false);
    });
  });
}
