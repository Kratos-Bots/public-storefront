import { BLOCKS } from '@/builder/registry.ts';
import type { BlockCategory, StyleKey, StyleTarget } from '@/builder/define.ts';
import type { PartFamily } from '@/builder/parts.ts';
import type { LayoutKind } from '@/builder/types.ts';

const ALL: LayoutKind[] = ['storefront', 'menu', 'webapp'];

export interface BlocksManifest {
  schemaVersion: 1;
  blocks: Array<{
    name: string; category: BlockCategory; layouts: LayoutKind[]; routeBound: boolean; style: false | { target: StyleTarget; keys: StyleKey[] };
    /** Present only on a part (product-parts spec §3.2). */
    part?: { family: PartFamily };
    /** Present only on a container: its family, slots and the part rules the admin mirrors. */
    container?: { family: PartFamily; slots: string[]; required: string[]; unique: string[]; insertSlot: string };
  }>;
}

/** What this release's storefront can render — emitted as web/dist/blocks.json (spec §8). */
export function blocksManifest(): BlocksManifest {
  return {
    schemaVersion: 1,
    blocks: Object.values(BLOCKS)
      .map((b) => ({
        name: b.name, category: b.category, layouts: b.layouts === 'all' ? [...ALL] : [...b.layouts], routeBound: b.routeBound,
        style: b.style ? { target: b.style.target, keys: [...b.style.keys] } : (false as const),
        ...(b.part ? { part: { family: b.part.family } } : {}),
        ...(b.container ? { container: { family: b.container.family, slots: [...b.slots], required: [...b.container.required], unique: [...b.container.unique], insertSlot: b.container.insertSlot } } : {}),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
