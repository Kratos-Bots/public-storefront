import { blockDef } from '@/builder/rules.ts';
import { parseBlockStyle, type BlockStyle } from '@/builder/style/model.ts';
import type { ComponentData, DocKey, PuckDoc } from '@/builder/types.ts';
import type { DocMap } from '@/builder/editor/page-set.ts';

type Props = Record<string, unknown>;

/**
 * Per-block clean-up applied to what the canvas previews and what the session emits — never to
 * Puck's own state. A FeaturedProducts row the admin hasn't picked yet (`{}`) would fail the block
 * schema, so it is left out until it holds a product. (Not a Puck `resolveData`: Puck writes
 * resolved props back into its state, which would delete the new row before it could be picked.)
 */
const PREPARE: Record<string, (props: Props) => Props> = {
  FeaturedProducts(props) {
    if (!Array.isArray(props.items)) return props;
    const picked = props.items.filter((row) => {
      const id = (row as { productId?: unknown } | null)?.productId;
      return typeof id === 'number' && Number.isInteger(id) && id > 0;
    });
    return picked.length === props.items.length ? props : { ...props, items: picked };
  },
};

/** Same keys, same order, same values: the stored style is already what the guard would keep. */
function sameStyle(raw: unknown, style: BlockStyle): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const a = Object.entries(raw);
  const b = Object.entries(style);
  return a.length === b.length && a.every(([k, v], i) => b[i]![0] === k && b[i]![1] === v);
}

/**
 * Block-styling spec §9.2: drop unknown / disallowed / invalid keys, canonical order, `{}` or
 * `undefined` → the key is removed. The same object when nothing changes (no spurious change).
 */
function prepareStyle(name: string, props: Props): Props {
  if (!Object.hasOwn(props, 'blockStyle')) return props;
  const def = blockDef(name);
  // An unregistered type never reaches the admin (the guard drops it); leave its props alone.
  if (!def) return props;
  const { style } = parseBlockStyle(def.style, props.blockStyle);
  if (style && sameStyle(props.blockStyle, style)) return props;
  const next: Props = { ...props };
  if (style) next.blockStyle = style;
  else delete next.blockStyle;
  return next;
}

/**
 * Product-parts spec §8: legacy toggles are read only while slots are absent; once every slot is
 * stored they go. Never adds or empties a slot; the same object when nothing changes.
 */
function prepareLegacy(name: string, props: Props): Props {
  const def = blockDef(name);
  const legacy = def?.container?.legacyProps;
  if (!def || !legacy || !def.slots.every((s) => Array.isArray(props[s]))) return props;
  if (!legacy.some((k) => Object.hasOwn(props, k))) return props;
  const next: Props = { ...props };
  for (const k of legacy) delete next[k];
  return next;
}

export function prepareProps(name: string, props: Props): Props {
  const fn = Object.hasOwn(PREPARE, name) ? PREPARE[name] : undefined;
  return prepareStyle(name, prepareLegacy(name, fn ? fn(props) : props));
}

function prepareList(items: ComponentData[]): ComponentData[] {
  let changed = false;
  const out = items.map((item) => {
    const next = prepareComponent(item);
    if (next !== item) changed = true;
    return next;
  });
  return changed ? out : items;
}

function prepareComponent(item: ComponentData): ComponentData {
  let props = prepareProps(item.type, item.props) as ComponentData['props'];
  for (const slot of blockDef(item.type)?.slots ?? []) {
    const children = props[slot];
    if (!Array.isArray(children)) continue;
    const next = prepareList(children as ComponentData[]);
    if (next !== children) props = { ...props, [slot]: next };
  }
  return props === item.props ? item : { ...item, props };
}

/** `prepareProps` over every block in the doc (slots and zones included); the same object when nothing changed. */
export function prepareDoc(doc: PuckDoc): PuckDoc {
  const content = prepareList(doc.content);
  let zones = doc.zones;
  if (zones) {
    let changed = false;
    const next: Record<string, ComponentData[]> = {};
    for (const [key, list] of Object.entries(zones)) {
      next[key] = prepareList(list);
      if (next[key] !== list) changed = true;
    }
    if (changed) zones = next;
  }
  return content === doc.content && zones === doc.zones ? doc : { ...doc, content, ...(zones ? { zones } : {}) };
}

/**
 * `prepareDoc` over a whole set: exactly what the session emits to the admin. The header's issue
 * list is computed from this too, so the editor and the admin always agree on what blocks Publish.
 */
export function prepareDocs(docs: DocMap): DocMap {
  const out: DocMap = {};
  for (const [key, doc] of Object.entries(docs)) if (doc) out[key as DocKey] = prepareDoc(doc);
  return out;
}
