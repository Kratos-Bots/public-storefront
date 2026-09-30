import type { BlockDef } from '@/builder/define.ts';
import { BLOCK_TYPE_RE } from '@/builder/types.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBlock = BlockDef<any>;

/** One block per file: `blocks/<Name>.tsx` exporting `block` with `name === '<Name>'`. */
export function collectBlocks(modules: Record<string, { block?: AnyBlock }>): Record<string, AnyBlock> {
  const out: Record<string, AnyBlock> = {};
  for (const [path, mod] of Object.entries(modules)) {
    const file = path.slice(path.lastIndexOf('/') + 1).replace(/\.tsx$/, '');
    const def = mod.block;
    if (!def || def.name !== file) throw new Error(`[builder] ${path} must export \`block\` named "${file}"`);
    if (!BLOCK_TYPE_RE.test(def.name)) throw new Error(`[builder] block name "${def.name}" must match ${BLOCK_TYPE_RE}`);
    if (def.container && def.part) throw new Error(`[builder] block "${def.name}" declares both \`container\` and \`part\` (product-parts §3.2)`);
    out[def.name] = def;
  }
  return out;
}

/** Eager: block modules are thin wrappers — every heavy component inside them is lazy(). */
export const BLOCKS: Record<string, AnyBlock> = collectBlocks(
  import.meta.glob<{ block?: AnyBlock }>('./blocks/*.tsx', { eager: true }),
);
