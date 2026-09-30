import { BLOCKS } from '@/builder/registry.ts';
import type { BlockCategory, StyleKey, StyleTarget } from '@/builder/define.ts';
import type { LayoutKind } from '@/builder/types.ts';

const ALL: LayoutKind[] = ['storefront', 'menu', 'webapp'];

export interface BlocksManifest {
  schemaVersion: 1;
  blocks: Array<{ name: string; category: BlockCategory; layouts: LayoutKind[]; routeBound: boolean; style: false | { target: StyleTarget; keys: StyleKey[] } }>;
}

/** What this release's storefront can render — emitted as web/dist/blocks.json (spec §8). */
export function blocksManifest(): BlocksManifest {
  return {
    schemaVersion: 1,
    blocks: Object.values(BLOCKS)
      .map((b) => ({
        name: b.name, category: b.category, layouts: b.layouts === 'all' ? [...ALL] : [...b.layouts], routeBound: b.routeBound,
        style: b.style ? { target: b.style.target, keys: [...b.style.keys] } : (false as const),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
