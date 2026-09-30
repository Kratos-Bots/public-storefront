import { createContext, createElement, Fragment, useContext, type ComponentType, type Provider, type ReactNode } from 'react';
import type { SlotRender, StyleAttrs } from '@/builder/define.ts';
import { isComponentLike, isRecord, type ComponentData, type DocKey, type LayoutKind } from '@/builder/types.ts';

// Runtime-safe and registry-free: part blocks import this module while the registry is still loading.

export type PartFamily = 'product' | 'catalogue' | 'card-tile' | 'card-row'; // stages 4–5 add theirs

/** Product-parts spec §3.2. */
export interface ContainerSpec {
  family: PartFamily;
  /**
   * Default content for every slot. Called with the container's parsed props (legacy toggles
   * included), the layout and the container's id; returns fresh components with ids from `partId`.
   * Used by default documents, by upgrade (§8) and by the editor's "Reset arrangement".
   */
  defaultSlots(props: Record<string, unknown>, ctx: { layout: LayoutKind; id: string }): Record<string, ComponentData[]>;
  /** Exactly one per container instance (parts not available in the layout are skipped). */
  required: readonly string[];
  /** At most one per container instance. */
  unique: readonly string[];
  /** If `part` is present, `needs` must be too. */
  requires?: ReadonlyArray<readonly [part: string, needs: string]>;
  /** A slot restricted to these types only. */
  slotAccepts?: Readonly<Record<string, readonly string[]>>;
  /** Read only when slots are absent (§8); hidden in the editor, dropped on save. */
  legacyProps?: readonly string[];
  /** Where "Add block" puts a part when nothing inside the container is selected. */
  insertSlot: string;
}

export interface PartViewProps { props: Record<string, unknown>; styleAttrs?: StyleAttrs }
export interface FamilyValue<Data> { data: Data; views: Readonly<Record<string, ComponentType<PartViewProps>>> }
export interface Family<Data> {
  family: PartFamily;
  Provider: Provider<FamilyValue<Data> | null>;
  /** A view's data. Throws outside a container (a view never renders outside one). */
  useData(): Data;
  /** A part block's whole render: the container's view for `name`, or nothing without a container. */
  PartHost(p: { name: string; props: Record<string, unknown>; styleAttrs?: StyleAttrs }): ReactNode;
}

export function createFamily<Data>(family: PartFamily): Family<Data> {
  const Ctx = createContext<FamilyValue<Data> | null>(null);
  Ctx.displayName = `PartFamily(${family})`;
  function useData(): Data {
    const value = useContext(Ctx);
    if (!value) throw new Error(`[builder] a ${family} part view rendered outside its container`);
    return value.data;
  }
  function PartHost({ name, props, styleAttrs }: { name: string; props: Record<string, unknown>; styleAttrs?: StyleAttrs }): ReactNode {
    const value = useContext(Ctx);
    // Own-key lookup: a stored type like `constructor` must not resolve to Object.prototype.
    const View = value && Object.hasOwn(value.views, name) ? value.views[name] : undefined;
    return View ? createElement(View, { props, styleAttrs }) : null;
  }
  return { family, Provider: Ctx.Provider, useData, PartHost };
}

export const NO_SILENT: ReadonlySet<string> = new Set();

/** True when `items` holds something that will render: any type not in `silent`. */
export function slotShows(items: readonly ComponentData[], silent: ReadonlySet<string>): boolean {
  return items.some((i) => !silent.has(i.type));
}

const isComponentArray = (v: unknown): v is ComponentData[] => Array.isArray(v) && v.length > 0 && v.every(isComponentLike);

/**
 * Depth-first: does the subtree hold a block of `type`? Slots are the only props holding arrays of
 * `{ type, props }` (the backend reads such arrays as components; the defaults test forbids them
 * elsewhere), so every component-shaped array is followed — no registry needed.
 */
export function containsType(items: readonly ComponentData[], type: string): boolean {
  for (const item of items) {
    if (item.type === type) return true;
    if (!isRecord(item.props)) continue;
    for (const value of Object.values(item.props)) if (isComponentArray(value) && containsType(value, type)) return true;
  }
  return false;
}

/** `${containerId.slice(0, 40)}-${key}` — at most 40 + 1 + 18 chars with this stage's keys. */
export const partId = (containerId: string, key: string): string => `${containerId.slice(0, 40)}-${key}`;
export const part = (type: string, containerId: string, key: string = type): ComponentData => ({ type, props: { id: partId(containerId, key) } });
export const group = (type: string, containerId: string, kind: string, items: ComponentData[]): ComponentData =>
  ({ type, props: { id: partId(containerId, `group-${kind}`), kind, items } });

/** A SlotRender over fixed JSX (built-in compositions); `items` describes what it holds, if anything reads it. */
export function fixedSlot(children: ReactNode, items: readonly ComponentData[] = []): SlotRender {
  const fn = (p?: Parameters<SlotRender>[0]) => {
    if (!p || (p.className === undefined && p.style === undefined && p.as === undefined)) return createElement(Fragment, null, children);
    return createElement(p.as ?? 'div', { className: p.className, style: p.style }, children);
  };
  return Object.assign(fn, { items });
}

/**
 * The documents each family's container may live on (spec §3.4); the first is its home, used when a
 * caller renders a container's defaults without naming a document. Several per family from stage 4
 * (the account and payment families span routes).
 */
export const FAMILY_DOCS: Readonly<Record<PartFamily, readonly DocKey[]>> = {
  product: ['product'], catalogue: ['catalog'], 'card-tile': ['card:tile'], 'card-row': ['card:row'],
};

/** May `family`'s container live on `docKey`? Own-key lookup: an unguarded family string never hits the prototype. */
export function familyAllowedOn(family: PartFamily, docKey: DocKey): boolean {
  return Object.hasOwn(FAMILY_DOCS, family) && FAMILY_DOCS[family].includes(docKey);
}
