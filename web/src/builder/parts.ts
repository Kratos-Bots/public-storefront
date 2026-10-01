import { createContext, createElement, Fragment, useContext, type ComponentType, type Provider, type ReactNode } from 'react';
import type { SlotRender, StyleAttrs } from '@/builder/define.ts';
import { isComponentLike, isRecord, type ComponentData, type DocKey, type LayoutKind } from '@/builder/types.ts';

// Runtime-safe and registry-free: part blocks import this module while the registry is still loading.

export type PartFamily = 'product' | 'catalogue' | 'card-tile' | 'card-row'
  | 'header' | 'cart' | 'cart-summary' | 'account' | 'orders' | 'order' | 'loyalty'
  | 'referrals' | 'profile' | 'login' | 'payment' | 'tracking' | 'verify' | 'checkout' | 'order-status';

/** `"<Block>.<slot>"`: a slot of a container or of a part with its own slots. */
export type SlotRef = `${string}.${string}`;

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
  /** Parts of the family this container accepts (default: all of them). */
  offers?: readonly string[];
  /** Containers (by block name) its slots may hold, at any depth: they own their own parts. */
  nests?: readonly string[];
  /** A slot never holding these types, at any depth (the area is never shown there). */
  slotRejects?: Readonly<Record<string, readonly string[]>>;
  /** Read only when slots are absent (§8); hidden in the editor, dropped on save. */
  legacyProps?: readonly string[];
  /** Where each listed part of the family may live: the nearest family ancestor (container or slotted part) and its slot, through content blocks. */
  homes?: Readonly<Record<string, readonly SlotRef[]>>;
  /** Editor reason appended to a part-home message, e.g. "no prices exist there yet". */
  homeWhy?: Readonly<Record<string, string>>;
  /** Arrangement check over the stored slots; returns the problem, or null. */
  order?: (slots: Readonly<Record<string, readonly ComponentData[]>>, props: Record<string, unknown>) => { message: string; blockId?: string } | null;
  /** Parts that may never sit under a hidden block (required parts are always included). */
  noHide?: readonly string[];
  /** Every non-part block inside must have category 'content'. */
  contentOnly?: boolean;
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

/** Every block type in the subtree, depth-first pre-order, through every component-shaped prop array. */
export function flattenTypes(items: readonly ComponentData[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    out.push(item.type);
    if (!isRecord(item.props)) continue;
    for (const value of Object.values(item.props)) if (isComponentArray(value)) out.push(...flattenTypes(value));
  }
  return out;
}

/** Depth-first: the first block of `type` in the subtree, or undefined (same walk as `containsType`). */
export function findComponent(items: readonly ComponentData[], type: string): ComponentData | undefined {
  for (const item of items) {
    if (item.type === type) return item;
    if (!isRecord(item.props)) continue;
    for (const value of Object.values(item.props)) {
      if (!isComponentArray(value)) continue;
      const found = findComponent(value, type);
      if (found) return found;
    }
  }
  return undefined;
}

/** Does `spec` accept the part `type`? Omitted `offers` means every part of the family. */
export function offersPart(spec: ContainerSpec, type: string): boolean {
  return !spec.offers || spec.offers.includes(type);
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
  header: ['shell'], cart: ['cart'], 'cart-summary': ['cart'],
  account: ['account.orders', 'account.order', 'account.loyalty', 'account.referrals', 'account.profile'],
  orders: ['account.orders'], order: ['account.order'], loyalty: ['account.loyalty'], referrals: ['account.referrals'],
  profile: ['account.profile'], login: ['login'], payment: ['payment-success', 'payment-cancel', 'order-placed'],
  tracking: ['tracking'], verify: ['verify'], checkout: ['checkout'], 'order-status': ['order-status'],
};

/** May `family`'s container live on `docKey`? Own-key lookup: an unguarded family string never hits the prototype. */
export function familyAllowedOn(family: PartFamily, docKey: DocKey): boolean {
  return Object.hasOwn(FAMILY_DOCS, family) && FAMILY_DOCS[family].includes(docKey);
}
