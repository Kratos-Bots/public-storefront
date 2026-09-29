import { blockDef } from '@/builder/rules.ts';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';

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

export function prepareProps(name: string, props: Props): Props {
  const fn = Object.hasOwn(PREPARE, name) ? PREPARE[name] : undefined;
  return fn ? fn(props) : props;
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
