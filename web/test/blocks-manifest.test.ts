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
      style: { target: 'wrap', keys: ['bg', 'padTop', 'padBottom', 'padX', 'marginTop', 'marginBottom', 'border', 'borderColor', 'borderStyle', 'radius', 'shadow', 'maxWidth'] } });
    expect(m.blocks.find((b) => b.name === 'PageOutlet')!.style).toBe(false);
    expect(m.blocks.find((b) => b.name === 'Footer')!.layouts).toEqual(['storefront', 'menu']);
    expect(m.blocks.map((b) => b.name)).toEqual([...m.blocks.map((b) => b.name)].sort((a, b) => a.localeCompare(b)));
  });
  it('the committed web/public/blocks.json is current (UPDATE_BLOCKS_JSON=1 npm --prefix web test -- test/blocks-manifest.test.ts regenerates it)', () => {
    const expected = `${JSON.stringify(blocksManifest(), null, 2)}\n`;
    if (process.env.UPDATE_BLOCKS_JSON === '1') writeFileSync(FILE, expected);
    expect(readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n')).toBe(expected);
  });
});
