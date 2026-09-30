import { BLOCKS } from '@/builder/registry.ts';
import { EMPTY_ROOT, type ComponentData, type DocKey, type LayoutKind, type PageRootProps, type PuckDoc } from '@/builder/types.ts';

export interface DefaultEntry { docKey: DocKey; layouts: readonly LayoutKind[] | 'all'; doc: PuckDoc }

/** A component with the block's full default props; ids are stable so React keeps state across routes. */
export function block(type: string, props: Record<string, unknown> = {}, id = `${type}-default`): ComponentData {
  const def = BLOCKS[type];
  if (!def) throw new Error(`[builder] a default document uses the unknown block "${type}"`);
  const base = structuredClone(def.defaultProps) as Record<string, unknown>;
  // A container's slots come from its defaultSlots for the entry's layout (defaults/index.ts).
  if (def.container) for (const key of [...def.slots, ...(def.container.legacyProps ?? [])]) delete base[key];
  return { type, props: { ...base, ...props, id } };
}

export function doc(content: ComponentData[], root: Partial<PageRootProps> = {}): PuckDoc {
  return { root: { props: { ...EMPTY_ROOT, ...root } }, content, zones: {} };
}
