import { createElement, type ReactNode } from 'react';
import type { Config, Fields } from '@puckeditor/core';
import { BLOCKS } from '@/builder/registry.ts';
import type { BlockCategory, BlockDef } from '@/builder/define.ts';
import { blockDef, countBlocks } from '@/builder/rules.ts';
import type { ComponentData, DocKey, LayoutKind, PuckDoc } from '@/builder/types.ts';
import { insertableBlocks, isLockedOn, ROUTE_BOUND } from '@/builder/editor/route-bound.ts';
import { scopeFields } from '@/builder/editor/derive-fields.ts';
import { EditorBlock } from '@/builder/editor/EditorBlock.tsx';

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
};
const CATEGORY_ORDER: BlockCategory[] = ['content', 'catalogue', 'shell', 'product', 'commerce', 'post-order'];

const FIELD_MODULES = import.meta.glob<{ fields: Fields }>('./fields/*.ts', { eager: true });
export const EDITOR_FIELDS: Record<string, Fields> = Object.fromEntries(
  Object.entries(FIELD_MODULES).map(([path, mod]) => [path.slice(path.lastIndexOf('/') + 1, -3), mod.fields]),
);

const ROOT_FIELDS: Fields = {
  title: { type: 'text', label: 'Page title (browser tab)' },
  description: { type: 'textarea', label: 'Search description' },
  chrome: { type: 'radio', label: 'Shop header and footer', options: [{ label: 'Show', value: 'shell' }, { label: 'Hide', value: 'none' }] },
};

const inLayout = (layout: LayoutKind): AnyBlock[] => Object.values(BLOCKS).filter((d) => d.layouts === 'all' || d.layouts.includes(layout));

const lockedOn = (docKey: DocKey): readonly string[] => {
  const entry = Object.hasOwn(ROUTE_BOUND, docKey) ? ROUTE_BOUND[docKey as keyof typeof ROUTE_BOUND] : undefined;
  return entry?.exactlyOne ? entry.blocks : [];
};

/**
 * The doc's exactly-one blocks that are already on it (nested ones included). Pass the result to
 * `blockMenu` / `buildEditorConfig` so a present one isn't offered again, while a stored doc that
 * lost it can still get it back. Memoise on its sorted contents, not on the doc.
 */
export function lockedPresent(doc: PuckDoc, docKey: DocKey): Set<string> {
  const counts = countBlocks(doc);
  return new Set(lockedOn(docKey).filter((name) => (counts.get(name) ?? 0) > 0));
}

/**
 * `present` = the exactly-one blocks already on the doc (`lockedPresent(doc, docKey)`): those are
 * not offered again, while a required block missing from the doc is offered so it can be put back.
 */
export function blockMenu(docKey: DocKey, layout: LayoutKind, present: ReadonlySet<string>) {
  const insertable = new Set(insertableBlocks(docKey, layout));
  for (const name of lockedOn(docKey)) if (present.has(name)) insertable.delete(name);
  return CATEGORY_ORDER.map((category) => ({
    category,
    title: CATEGORY_TITLES[category],
    blocks: inLayout(layout).filter((d) => d.category === category && insertable.has(d.name)).map((d) => ({ name: d.name, label: d.label })),
  })).filter((g) => g.blocks.length > 0);
}

// Emitted / previewed props live in prepare.ts (EditorBlock needs them; config imports EditorBlock).
export { prepareDoc, prepareProps } from '@/builder/editor/prepare.ts';

type Props = Record<string, unknown>;

// ── hints ────────────────────────────────────────────────────────────────────

/** Advice, not an issue: never sent to the admin and never blocks Publish. */
export interface EditorHint {
  id: 'double-intro' | 'category-nav-roots' | 'title-overrides-item' | 'cart-summary-outside';
  message: string;
  blockId?: string;
}

const LIST_BLOCKS = new Set(['ProductGrid', 'ProductList', 'WholesaleTable']);
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

export function editorHints(doc: PuckDoc, docKey: DocKey): EditorHint[] {
  const hints: EditorHint[] = [];
  let customHero: ComponentData | undefined;
  let listWithIntro = false;
  let categoryNav: ComponentData | undefined;
  walk(doc.content, (c) => {
    if (c.type === 'CatalogHero' && c.props.variant === 'custom') customHero ??= c;
    if (LIST_BLOCKS.has(c.type) && c.props.intro !== 'hide') listWithIntro = true;
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

/**
 * One config per (doc, layout): locks, slot allow lists and the drawer depend on which page is
 * open. `present` as for `blockMenu`.
 */
/** What a shopper's page stands on (global.css paints it on body); the canvas paints it itself. */
export const PAGE_GROUND = {
  background: 'var(--sf-bg)',
  color: 'var(--sf-text)',
  fontFamily: 'var(--sf-font-body)',
  minHeight: '100%',
} as const;

export function buildEditorConfig(docKey: DocKey, layout: LayoutKind, present: ReadonlySet<string>): Config {
  const components: Config['components'] = {};
  for (const def of inLayout(layout)) {
    components[def.name] = {
      label: def.label,
      fields: scopeFields(def.name, EDITOR_FIELDS[def.name] ?? {}, docKey, layout),
      defaultProps: def.defaultProps,
      // A required route block can't be deleted or copied; the canvas is one doc, so it can't leave its route either.
      ...(isLockedOn(def.name, docKey) ? { permissions: { ...LOCKED } } : {}),
      render: (props: Props) => createElement(EditorBlock, { def, props, docKey, layout }),
    };
  }
  const categories: NonNullable<Config['categories']> = {};
  for (const group of blockMenu(docKey, layout, present)) {
    categories[group.category] = { title: group.title, components: group.blocks.map((b) => b.name) };
  }
  // Registered but not insertable here (another route's blocks): renderable, never offered.
  categories.other = { visible: false };
  return {
    components,
    categories,
    root: {
      fields: docKey === 'shell' ? {} : ROOT_FIELDS,
      defaultProps: { title: '', description: '', chrome: 'shell' },
      // The shop's own ground and ink: Puck's canvas is white, and a dark theme's text would vanish on it.
      render: ({ children }: { children: ReactNode }) =>
        createElement('div', { 'data-sf-builder-canvas': '', style: PAGE_GROUND }, children),
    },
  };
}
