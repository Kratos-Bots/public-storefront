import { parseBlockProps } from '@/builder/define.ts';
import { blockDef, requiredParts } from '@/builder/rules.ts';
import { BLOCKS } from '@/builder/registry.ts';
import { containsType, partId } from '@/builder/parts.ts';
import type { CardKey, ComponentData, LayoutKind } from '@/builder/types.ts';

/** One row of the container panel's Parts list (spec §11). */
export interface PartState { type: string; label: string; present: boolean; required: boolean }

const isGroup = (type: string) => (blockDef(type)?.slots.length ?? 0) > 0;
const asItems = (v: unknown): ComponentData[] => (Array.isArray(v) ? (v as ComponentData[]) : []);
const slotsOf = (c: ComponentData): readonly string[] => blockDef(c.type)?.slots ?? [];

/** Depth-first types of a default slot, groups left out (they are wrappers, not pieces). */
function flatTypes(items: readonly ComponentData[]): string[] {
  const out: string[] = [];
  for (const c of items) {
    if (!isGroup(c.type)) out.push(c.type);
    for (const s of slotsOf(c)) out.push(...flatTypes(asItems(c.props[s])));
  }
  return out;
}

/** How many wrappers deep `type` sits in `items` (0 = directly in the slot), or -1. */
function depthOf(items: readonly ComponentData[], type: string, depth = 0): number {
  for (const c of items) {
    if (c.type === type) return depth;
    for (const s of slotsOf(c)) {
      const d = depthOf(asItems(c.props[s]), type, depth + 1);
      if (d >= 0) return d;
    }
  }
  return -1;
}

function defaultsOf(item: ComponentData, layout: LayoutKind): Record<string, ComponentData[]> {
  const def = blockDef(item.type)!;
  return def.container!.defaultSlots(parseBlockProps(def, item.props), { layout, id: String(item.props.id) });
}

const inLayout = (layouts: 'all' | readonly LayoutKind[], layout: LayoutKind) => layouts === 'all' || layouts.includes(layout);

/** Every part of the container's family available in `layout`, in default order, groups excluded. */
export function partStates(item: ComponentData, layout: LayoutKind): PartState[] {
  const def = blockDef(item.type);
  if (!def?.container) return [];
  const required = new Set(requiredParts(def.name, layout));
  const inside = def.slots.flatMap((s) => asItems(item.props[s]));
  const defaults = defaultsOf(item, layout);
  const order = def.slots.flatMap((s) => flatTypes(defaults[s] ?? []));
  const family = Object.values(BLOCKS)
    .filter((b) => b.part?.family === def.container!.family && !isGroup(b.name) && inLayout(b.layouts, layout))
    .map((b) => b.name);
  const rank = (t: string) => (order.includes(t) ? order.indexOf(t) : order.length);
  return family.sort((a, b) => rank(a) - rank(b)).map((type) => ({
    type, label: blockDef(type)!.label, present: containsType(inside, type), required: required.has(type),
  }));
}

/**
 * `items` with `node` inserted after the first `anchor` found anywhere below. `depth` is how many
 * wrappers deep the default arrangement puts the new part: an anchor nested deeper places it after
 * the anchor's wrapper at that depth (Description re-added after the price row, not inside it).
 */
function insertAfter(items: readonly ComponentData[], anchor: string, node: ComponentData, depth: number): ComponentData[] | null {
  const after = (i: number) => [...items.slice(0, i + 1), node, ...items.slice(i + 1)];
  for (let i = 0; i < items.length; i += 1) {
    const c = items[i]!;
    if (c.type === anchor) return after(i);
    for (const s of slotsOf(c)) {
      const inner = asItems(c.props[s]);
      if (!containsType(inner, anchor)) continue;
      if (depth <= 0) return after(i);
      const next = insertAfter(inner, anchor, node, depth - 1);
      if (next) return items.map((x, j) => (j === i ? { ...x, props: { ...x.props, [s]: next } } : x));
    }
  }
  return null;
}

const withSlot = (item: ComponentData, slot: string, items: ComponentData[]): ComponentData => ({ ...item, props: { ...item.props, [slot]: items } });

/**
 * The container with part `type` added where the default arrangement puts it: after the nearest
 * default predecessor present (anywhere in the container), else at the start of its default slot.
 * Its id is `partId(container, type)`, suffixed `-2`, `-3`… while taken.
 */
export function withPartAdded(item: ComponentData, type: string, layout: LayoutKind, taken: ReadonlySet<string>): ComponentData {
  const def = blockDef(item.type)!;
  const defaults = defaultsOf(item, layout);
  const home = def.slots.find((s) => flatTypes(defaults[s] ?? []).includes(type)) ?? def.container!.insertSlot;
  const order = flatTypes(defaults[home] ?? []);
  const depth = Math.max(0, depthOf(defaults[home] ?? [], type));
  const base = partId(String(item.props.id), type);
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  const node: ComponentData = { type, props: { id } };
  for (let i = order.indexOf(type) - 1; i >= 0; i -= 1) {
    for (const s of def.slots) {
      const next = insertAfter(asItems(item.props[s]), order[i]!, node, depth);
      if (next) return withSlot(item, s, next);
    }
  }
  return withSlot(item, home, [node, ...asItems(item.props[home])]);
}

/** The container with every slot back to `defaultSlots`; every other prop kept. */
export function withDefaultArrangement(item: ComponentData, layout: LayoutKind): ComponentData {
  return { ...item, props: { ...item.props, ...defaultsOf(item, layout) } };
}

/** "Edit card design" links (spec §11): which card documents each block's products are drawn with. */
export const CARD_LINKS: Record<string, ReadonlyArray<{ key: CardKey; label: string }>> = {
  ProductGrid: [{ key: 'card:tile', label: 'Edit card design' }, { key: 'card:row', label: 'Edit row design' }],
  ProductList: [{ key: 'card:row', label: 'Edit row design' }],
  FeaturedProducts: [{ key: 'card:tile', label: 'Edit card design' }],
  ProductUpsells: [{ key: 'card:tile', label: 'Edit card design' }, { key: 'card:row', label: 'Edit row design' }],
  Upsells: [{ key: 'card:tile', label: 'Edit card design' }, { key: 'card:row', label: 'Edit row design' }],
};
