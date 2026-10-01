/// <reference types="node" />
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { blocksManifest } from '@/builder/blocks-manifest.ts';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(testDir, '../public/blocks.json');

describe('blocks.json', () => {
  it('lists every block with its category, layouts and route binding', () => {
    const m = blocksManifest();
    expect(m.schemaVersion).toBe(1);
    expect(m.blocks.find((b) => b.name === 'CheckoutFlow')).toEqual({ name: 'CheckoutFlow', category: 'commerce', layouts: ['storefront', 'menu', 'webapp'], routeBound: true,
      style: { target: 'wrap', keys: ['bg', 'padTop', 'padBottom', 'padX', 'marginTop', 'marginBottom', 'border', 'borderColor', 'borderStyle', 'radius', 'shadow', 'maxWidth'] },
      // Stage 5: a container. The manifest carries structure only (no homes / order / noHide / contentOnly / defaultSlots).
      container: {
        family: 'checkout', slots: ['head', 'lead', 'steps', 'after', 'aside'], insertSlot: 'steps',
        required: ['CheckoutHeading', 'CheckoutContact', 'CheckoutAddress', 'CheckoutShipping', 'CheckoutPayment', 'CheckoutReview', 'CheckoutSummary'],
        unique: ['CheckoutHeading', 'CheckoutProgress', 'CheckoutContact', 'CheckoutAddress', 'CheckoutShipping', 'CheckoutPayment', 'CheckoutReview', 'CheckoutCoupon', 'CheckoutNotes', 'CheckoutSummary'],
      } });
    expect(m.blocks.find((b) => b.name === 'PageOutlet')!.style).toBe(false);
    expect(m.blocks.find((b) => b.name === 'Footer')!.layouts).toEqual(['storefront', 'menu']);
    expect(m.blocks.map((b) => b.name)).toEqual([...m.blocks.map((b) => b.name)].sort((a, b) => a.localeCompare(b)));
  });
  it('carries part and container fields only where a block has them (stage 3 §9, §13)', () => {
    const m = blocksManifest();
    const by = (n: string) => m.blocks.find((b) => b.name === n)!;
    expect(by('ProductPrice').part).toEqual({ family: 'product' });
    expect(by('ProductPrice').container).toBeUndefined();
    expect(by('ProductDetail').container!.family).toBe('product');
    expect(by('ProductDetail').container!.required).toEqual(['ProductTitle', 'ProductPrice', 'ProductAddToCart']);
    expect(by('ProductDetail').part).toBeUndefined();
    expect('part' in by('Heading') || 'container' in by('Heading')).toBe(false);
    for (const b of m.blocks) if (b.container) expect(b.container.slots).toContain(b.container.insertSlot);
  });
  it('the committed web/public/blocks.json is current (UPDATE_BLOCKS_JSON=1 npm --prefix web test -- test/blocks-manifest.test.ts regenerates it)', () => {
    const expected = `${JSON.stringify(blocksManifest(), null, 2)}\n`;
    if (process.env.UPDATE_BLOCKS_JSON === '1') writeFileSync(FILE, expected);
    expect(readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n')).toBe(expected);
  });
});
