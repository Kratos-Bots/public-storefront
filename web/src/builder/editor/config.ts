import { createElement, type ReactNode } from 'react';
import type { Config, Field, Fields } from '@puckeditor/core';
import { BLOCKS } from '@/builder/registry.ts';
import { parseBlockProps, type BlockCategory, type BlockDef } from '@/builder/define.ts';
import { containsType, offersPart, type PartFamily } from '@/builder/parts.ts';
import { allowedOn, blockDef, countBlocks } from '@/builder/rules.ts';
import { isCardKey, type ComponentData, type DocKey, type LayoutKind, type PuckDoc } from '@/builder/types.ts';
import { familiesOfDoc, insertableBlocks, isLockedOn, requiredPartsOn, ROUTE_BOUND } from '@/builder/editor/route-bound.ts';
import { STEP_TYPE } from '@/builder/family-checkout.ts';
import { scopeFields } from '@/builder/editor/derive-fields.ts';
import { EditorBlock } from '@/builder/editor/EditorBlock.tsx';
import { PageGround } from '@/builder/editor/page-ground.tsx';
import { limitedTextField } from '@/builder/editor/custom-fields/limited-text.tsx';
import { MAX_DESCRIPTION, MAX_TITLE } from '@/builder/editor/page-set.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBlock = BlockDef<any>;

export const ROOT_ZONE = 'root:default-zone';

export const CATEGORY_TITLES: Record<BlockCategory, string> = {
  content: 'Content',
  catalogue: 'Catalogue',
  shell: 'Header & footer',
  product: 'Product',
  commerce: 'Cart & account',
  'post-order': 'After the order',
  part: 'Parts',
};
/** Parts first: on a doc with a container they are what the owner arranges (spec §11). */
const CATEGORY_ORDER: BlockCategory[] = ['part', 'content', 'catalogue', 'shell', 'product', 'commerce', 'post-order'];
/** The drawer's parts group, named by the family whose container lives on the doc. */
export const PART_TITLES: Record<PartFamily, string> = {
  product: 'Product page parts', catalogue: 'Catalogue parts', 'card-tile': 'Card parts', 'card-row': 'Card parts',
  header: 'Header parts', cart: 'Cart parts', 'cart-summary': 'Cart summary parts', account: 'Account header parts', orders: 'Order history parts',
  order: 'Order parts', loyalty: 'Loyalty parts', referrals: 'Referral parts', profile: 'Profile parts', login: 'Sign-in parts',
  payment: 'Payment page parts', tracking: 'Tracking parts', verify: 'Verify parts',
  checkout: 'Checkout parts', 'order-status': 'Order status parts',
};

const FIELD_MODULES = import.meta.glob<{ fields: Fields }>('./fields/*.ts', { eager: true });
export const EDITOR_FIELDS: Record<string, Fields> = Object.fromEntries(
  Object.entries(FIELD_MODULES).map(([path, mod]) => [path.slice(path.lastIndexOf('/') + 1, -3), mod.fields]),
);

const ROOT_FIELDS: Fields = {
  // Capped at the backend's limits (page-set.ts MAX_TITLE / MAX_DESCRIPTION) as the owner types.
  title: limitedTextField('Page title (browser tab)', MAX_TITLE) as Field,
  description: limitedTextField('Search description', MAX_DESCRIPTION, { multiline: true }) as Field,
  chrome: { type: 'radio', label: 'Shop header and footer', options: [{ label: 'Show', value: 'shell' }, { label: 'Hide', value: 'none' }] },
};

const inLayout = (layout: LayoutKind): AnyBlock[] => Object.values(BLOCKS).filter((d) => d.layouts === 'all' || d.layouts.includes(layout));

const lockedOn = (docKey: DocKey): readonly string[] => {
  const entry = Object.hasOwn(ROUTE_BOUND, docKey) ? ROUTE_BOUND[docKey as keyof typeof ROUTE_BOUND] : undefined;
  return entry?.exactlyOne ? entry.blocks : [];
};

/**
 * The doc's exactly-one blocks that are already on it (nested ones included), plus the at-most-one
 * parts every container already shows. Pass the result to `blockMenu` / `buildEditorConfig` so a
 * present one isn't offered again, while a stored doc that lost it can still get it back. Memoise
 * on its sorted contents, not on the doc.
 */
export function lockedPresent(doc: PuckDoc, docKey: DocKey): Set<string> {
  const counts = countBlocks(doc);
  const out = new Set(lockedOn(docKey).filter((name) => (counts.get(name) ?? 0) > 0));
  for (const name of uniquePartsShown(doc.content)) out.add(name);
  return out;
}

/**
 * The at-most-one parts (`container.unique`; groups are never listed) that every container on the
 * doc already holds, hidden slots included: offering one again could only raise part-unique.
 * With no container, none — the palette then offers every part so the owner can see them.
 */
function uniquePartsShown(content: readonly ComponentData[]): string[] {
  const containers: ComponentData[] = [];
  walk(content, (c) => { if (blockDef(c.type)?.container) containers.push(c); });
  let shared: string[] | null = null;
  for (const c of containers) {
    const def = blockDef(c.type)!;
    const slots = def.slots.map((s) => c.props[s]).filter((v): v is ComponentData[] => Array.isArray(v));
    const here = def.container!.unique.filter((u) => slots.some((items) => containsType(items, u)));
    shared = shared === null ? here : shared.filter((u) => here.includes(u));
  }
  return shared ?? [];
}

/**
 * `present` = the exactly-one blocks already on the doc (`lockedPresent(doc, docKey)`): those are
 * not offered again, while a required block missing from the doc is offered so it can be put back.
 */
export function blockMenu(docKey: DocKey, layout: LayoutKind, present: ReadonlySet<string>) {
  const insertable = new Set(insertableBlocks(docKey, layout));
  for (const name of present) insertable.delete(name);
  const containers = inLayout(layout).filter((d) => d.container && allowedOn(d.name, docKey));
  const groups: Array<{ category: BlockCategory; key: string; title: string; blocks: Array<{ name: string; label: string }> }> = [];
  for (const category of CATEGORY_ORDER) {
    const candidates = inLayout(layout).filter((d) => d.category === category && insertable.has(d.name));
    if (category !== 'part') {
      groups.push({ category, key: category, title: CATEGORY_TITLES[category], blocks: candidates.map((d) => ({ name: d.name, label: d.label })) });
      continue;
    }
    // One group per family of the doc, listing the family's parts some container of it offers.
    for (const family of familiesOfDoc(docKey)) {
      const owners = containers.filter((c) => c.container!.family === family);
      const blocks = candidates
        .filter((d) => d.part?.family === family && owners.some((c) => offersPart(c.container!, d.name)))
        .map((d) => ({ name: d.name, label: d.label }));
      groups.push({ category, key: `part:${family}`, title: PART_TITLES[family], blocks });
    }
  }
  return groups.filter((g) => g.blocks.length > 0);
}

// Emitted / previewed props live in prepare.ts (EditorBlock needs them; config imports EditorBlock).
export { prepareDoc, prepareProps } from '@/builder/editor/prepare.ts';

type Props = Record<string, unknown>;

// ── hints ────────────────────────────────────────────────────────────────────

/** Advice, not an issue: never sent to the admin and never blocks Publish. */
export interface EditorHint {
  id: 'double-intro' | 'category-nav-roots' | 'title-overrides-item' | 'cart-summary-outside' | 'content-before-payment';
  message: string;
  blockId?: string;
}

/** The catalogue containers: their intro is the `CatalogIntro` part (spec §11). */
const LIST_CONTAINERS = new Set(['ProductGrid', 'ProductList']);

/** Does this list show its own intro? A container through its `CatalogIntro` part; slots not stored yet = the default arrangement, which has one. */
function showsListIntro(c: ComponentData): boolean {
  if (c.props.intro === 'hide') return false;
  if (c.type === 'WholesaleTable') return true;
  if (!LIST_CONTAINERS.has(c.type)) return false;
  const slots = (blockDef(c.type)?.slots ?? []).map((s) => c.props[s]);
  if (slots.every((v) => !Array.isArray(v))) return true;
  return slots.some((v) => Array.isArray(v) && containsType(v as ComponentData[], 'CatalogIntro'));
}
/** Pages whose tab title names the product or order on show; a root title replaces it. */
const ITEM_TITLE_DOCS: ReadonlySet<DocKey> = new Set<DocKey>(['product', 'order-status']);

function walk(items: readonly ComponentData[], visit: (c: ComponentData) => void): void {
  for (const item of items) {
    visit(item);
    for (const slot of blockDef(item.type)?.slots ?? []) {
      const children = item.props[slot];
      if (Array.isArray(children)) walk(children as ComponentData[], visit);
    }
  }
}

/** The first block of the order page's action column (not a part) that sits above its Payment part. */
function contentBeforePayment(content: readonly ComponentData[]): ComponentData | undefined {
  let found: ComponentData | undefined;
  walk(content, (c) => {
    if (found || c.type !== 'OrderStatus' || !Array.isArray(c.props.action)) return;
    const action = c.props.action as ComponentData[];
    const pay = action.findIndex((x) => containsType([x], 'OrderStatusPayment'));
    found = pay < 0 ? undefined : action.slice(0, pay).find((x) => !blockDef(x.type)?.part);
  });
  return found;
}

export function editorHints(doc: PuckDoc, docKey: DocKey): EditorHint[] {
  const hints: EditorHint[] = [];
  let customHero: ComponentData | undefined;
  let listWithIntro = false;
  let categoryNav: ComponentData | undefined;
  walk(doc.content, (c) => {
    if (c.type === 'CatalogHero' && c.props.variant === 'custom') customHero ??= c;
    if (showsListIntro(c)) listWithIntro = true;
    if (c.type === 'CategoryNav') categoryNav ??= c;
  });
  if (docKey === 'catalog' && customHero && listWithIntro) {
    hints.push({
      id: 'double-intro',
      message: 'The catalogue shows two intros: your custom one and the list’s own. Set the list’s Intro to Hide to keep just yours.',
      blockId: customHero.props.id,
    });
  }
  if (ITEM_TITLE_DOCS.has(docKey) && doc.root.props.title.trim() !== '') {
    hints.push({
      id: 'title-overrides-item',
      message: 'This page title replaces the tab title that names each product or order. Leave it empty to keep those.',
    });
  }
  const summaryAtTop = docKey === 'cart' ? doc.content.find((c) => c.type === 'CartSummary') : undefined;
  if (summaryAtTop) {
    const contents = doc.content.find((c) => c.type === 'CartContents');
    const slot = contents?.props.summary;
    if (contents && (!Array.isArray(slot) || slot.length === 0)) {
      hints.push({
        id: 'cart-summary-outside',
        message: 'Order summary sits outside Cart lines. Move it into the Summary area of Cart lines so it sits beside the lines and follows the cart’s checkout state.',
        blockId: summaryAtTop.props.id,
      });
    }
  }
  const early = docKey === 'order-status' ? contentBeforePayment(doc.content) : undefined;
  if (early) {
    hints.push({
      id: 'content-before-payment',
      message: 'Customers who still owe payment see this before how to pay.',
      blockId: early.props.id,
    });
  }
  if (categoryNav) {
    hints.push({
      id: 'category-nav-roots',
      message: 'On phones, Categories shows top-level categories only. Subcategories show in the side rail on wider screens.',
      blockId: categoryNav.props.id,
    });
  }
  return hints;
}

// ── config ───────────────────────────────────────────────────────────────────

const LOCKED = { delete: false, duplicate: false } as const;
/** The five checkout steps are moved with the Step order control, never dragged (their order has four legal forms). */
const STEP_TYPES: ReadonlySet<string> = new Set(Object.values(STEP_TYPE));
const LOCKED_STEP = { ...LOCKED, drag: false } as const;

/**
 * One config per (doc, layout): locks, slot allow lists and the drawer depend on which page is
 * open. `present` as for `blockMenu`.
 */
export function buildEditorConfig(docKey: DocKey, layout: LayoutKind, present: ReadonlySet<string>): Config {
  const components: Config['components'] = {};
  const required = requiredPartsOn(docKey, layout);
  for (const def of inLayout(layout)) {
    const container = def.container;
    components[def.name] = {
      label: def.label,
      fields: scopeFields(def.name, EDITOR_FIELDS[def.name] ?? {}, docKey, layout),
      defaultProps: def.defaultProps,
      // A required route block or part can't be deleted or copied; the canvas is one doc, so it can't
      // leave its route either. Any other part shows at most once (spec §11), so it can't be copied.
      ...(STEP_TYPES.has(def.name) ? { permissions: { ...LOCKED_STEP } }
        : isLockedOn(def.name, docKey) || required.has(def.name) ? { permissions: { ...LOCKED } }
        : def.part ? { permissions: { duplicate: false } } : {}),
      // A container dropped from the drawer arrives with empty slots: give it its default arrangement once.
      ...(container ? {
        resolveData: (data: { props: Props }, params: { trigger: string }) => (params.trigger === 'insert'
          ? { ...data, props: { ...data.props, ...container.defaultSlots(parseBlockProps(def, data.props), { layout, id: String(data.props.id) }) } }
          : data),
      } : {}),
      render: (props: Props) => createElement(EditorBlock, { def, props, docKey, layout }),
    };
  }
  const categories: NonNullable<Config['categories']> = {};
  for (const group of blockMenu(docKey, layout, present)) {
    categories[group.key] = { title: group.title, components: group.blocks.map((b) => b.name) };
  }
  // Registered but not insertable here (another route's blocks): renderable, never offered.
  categories.other = { visible: false };
  return {
    components,
    categories,
    root: {
      // No page of its own: the shell, a card design, and the product sheet outside the storefront.
      fields: docKey === 'shell' || isCardKey(docKey) || (docKey === 'product' && layout !== 'storefront') ? {} : ROOT_FIELDS,
      defaultProps: { title: '', description: '', chrome: 'shell' },
      // The shop's ground, ink and content column (page-ground.tsx): what a shopper's page stands on.
      render: ({ children }: { children: ReactNode }) => createElement(PageGround, { docKey, layout, children }),
    },
  };
}
