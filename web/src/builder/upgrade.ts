import { parseBlockProps, type AnyBlock } from '@/builder/define.ts';
import { blockDef } from '@/builder/rules.ts';
import { isComponentLike, type ComponentData, type DocKey, type LayoutKind, type PuckDoc } from '@/builder/types.ts';

/**
 * Product-parts spec §8. A container whose slot key is ABSENT (`undefined`) gets that slot's default
 * content, derived from its parsed props (legacy toggles included) and the layout. A present slot —
 * even `[]` — is never touched. Pure; the same object when nothing was absent.
 */
export function fillAbsentSlots(def: AnyBlock, props: Record<string, unknown>, layout: LayoutKind): Record<string, unknown> {
  const spec = def.container;
  if (!spec) return props;
  const absent = def.slots.filter((s) => props[s] === undefined);
  if (absent.length === 0) return props;
  const defaults = spec.defaultSlots(parseBlockProps(def, props), { layout, id: String(props.id) });
  const out: Record<string, unknown> = { ...props };
  for (const s of absent) out[s] = defaults[s] ?? [];
  return out;
}

function upgradeItem(item: ComponentData, layout: LayoutKind): ComponentData {
  const def = blockDef(item.type);
  if (!def) return item;
  let props = fillAbsentSlots(def, item.props, layout);
  for (const s of def.slots) {
    const children = props[s];
    if (!Array.isArray(children)) continue;
    const next = upgradeItems(children as ComponentData[], layout);
    if (next !== children) props = { ...props, [s]: next };
  }
  return props === item.props ? item : { ...item, props: props as ComponentData['props'] };
}

/** Every container in `items` (at any depth) with its absent slots filled; the same array when unchanged. */
export function upgradeItems(items: readonly ComponentData[], layout: LayoutKind): ComponentData[] {
  let changed = false;
  const out = items.map((item) => {
    if (!isComponentLike(item)) return item;
    const next = upgradeItem(item, layout);
    if (next !== item) changed = true;
    return next;
  });
  return changed ? out : (items as ComponentData[]);
}

/** In-memory only: no stored document is rewritten (spec §8). `docKey` is reserved for per-doc upgrades. */
export function upgradeDoc(doc: PuckDoc, _docKey: DocKey, layout: LayoutKind): PuckDoc {
  const content = Array.isArray(doc.content) ? upgradeItems(doc.content, layout) : doc.content;
  let zones = doc.zones;
  if (zones) {
    let changed = false;
    const next: Record<string, ComponentData[]> = {};
    for (const [key, list] of Object.entries(zones)) {
      next[key] = Array.isArray(list) ? upgradeItems(list, layout) : list;
      if (next[key] !== list) changed = true;
    }
    if (changed) zones = next;
  }
  return content === doc.content && zones === doc.zones ? doc : { ...doc, content, ...(zones ? { zones } : {}) };
}
