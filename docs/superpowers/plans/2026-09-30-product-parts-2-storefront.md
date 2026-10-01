# Product parts — storefront (stage 3 of "everything editable") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ProductDetail`, `ProductGrid` and `ProductList` become *containers* whose slots hold 18 new *part* blocks, a product-card designer (`PageSet.cards.tile` / `.row`, two frame blocks and 11 card parts) feeds every product card and row, the menu / web-app product sheet renders the layout's `product` document, and the editor can arrange, restore, reset and preview all of it — while with nothing published every page stays byte-identical to v0.7.0.

**Architecture:** A runtime-safe `web/src/builder/parts.ts` defines the container / part contract (`ContainerSpec`, `createFamily`, `PartHost`, `slotShows`, `containsType`, `partId`, `fixedSlot`); `families.ts` instantiates the four families and the sheet host context. `rules.ts` gains per-container-instance rules, `upgrade.ts` fills *absent* container slots in memory (guard, default table, editor load). Each container's lazily loaded feature component computes today's data and wraps its unchanged wrapper markup in `Family.Provider value={{ data, views }}`; each part block is a thin `PartHost` shell whose view (v0.7.0 JSX moved verbatim) arrives through context. Card designs are compiled once per document object (`cards.ts`) and provided by `CardDesignProvider` (mounted by `PuckShell` and the editor canvas); `ProductCard` / `ProductRow` render the compiled element tree, or their built-in composition of the same views.

**Tech Stack:** React 19, TypeScript 5.9, zod 4, react-router 7, TanStack Query 5, Mantine 7, Vite, Vitest + Testing Library (jsdom), Playwright (mocked backend, port 5199), `@puckeditor/core` 0.23.0 (editor only).

**Spec:** `docs/superpowers/specs/2026-09-30-product-parts-design.md` (binding), with `docs/superpowers/specs/2026-09-30-puck-editable-overview.md`. Read the whole spec before any task; each task names the sections it implements. Stages 1 (text) and 2 (block styling) are on the branch: read `docs/builder.md` → "Text layer" and "Block styling", and `web/src/builder/style/*`. **Start only after the stage-2 storefront e2e task has committed** (it is still running in this worktree when this plan is written).

## Global Constraints

- Work only in the `ecommerce-storefront/` worktree on `feature/puck-editable`. Never push, merge, or touch another checkout. The repo is **public**: fixtures, docs and screenshots use "Northbound Supply" / `shop.example`; no local paths, usernames, client names or credentials.
- House rules (`.superpowers/sdd/house-rules.md`): TDD (failing test first); commit **by explicit pathspec only** (`git add -- <paths>` then `git commit -m "…" -- <paths>`); never `git add -A`, `git stash`, reset or check out others' files; every commit message ends with the two lines
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4`.
- Any task touching React components or CSS loads the `frontend-design:frontend-design` skill first.
- Imports are `@/…` with `.ts` / `.tsx` extensions. `@puckeditor/core` **value** imports only under `web/src/builder/editor/**`. `web/src/builder/{parts,families,upgrade,cards,page-set-context}.ts` and `card-design.tsx` are shopper-bundle code (runtime-safe).
- **Parity (spec §12, overview rule 1):** with no published set, or a set that never touches these blocks, every page's DOM is byte-identical to v0.7.0. `e2e/dom-parity.spec.ts`, `e2e/templates-baseline*.spec.ts` and the golden files of Task 1 pass **without regenerating anything** (never `--update-snapshots`, never `UPDATE_GOLDEN=1` after Task 1). The rest of the Vitest and Playwright suites pass unedited, except the enumeration tables this plan names (block lists, style floors, route-bound tables, `blocks.json`).
- **Absent ≠ empty (spec §8):** a container slot whose key is `undefined` is filled from `defaultSlots`; a present slot (even `[]`) is never touched. No `?? []` on a container slot before `fillAbsentSlots` runs.
- Part ids: `` `${containerId.slice(0, 40)}-${key}` `` (≤ 64 chars); `key` is the part type, or `group-<kind>` for a group part (longest key 18 chars).
- **No new text key** (spec §2 #11). Moved JSX keeps its literal `t('…')` keys (the orphan test reads source literals). Every part lists its patterns in `BlockDef.text`; container `text` narrows per spec §9.
- **Every part and container declares `style` (spec §9).** BOX = `bg padTop padBottom padX marginTop marginBottom border borderColor borderStyle radius shadow maxWidth`; TEXT = `fg textSize align`; VIS = `hide`. Required parts never take `hide`; no part containing an input takes `textSize`. Unstyled ⇒ no attribute, no wrapper.
- Parts render only through `PartHost`; a part view never fetches, mutates or navigates on its own (reading cached queries the container already owns, settings, text and core options is fine). Part block files import **no** feature component (they stay in the main bundle); containers stay the only `lazy()` boundary.
- The source-scanning tests pin markup to files: `data-sf-part="product-card"`/`"price"` in `ProductCard.tsx`; `"product-row"`/`"price"` and `rowAnim(` in `ProductRow.tsx`; `"page-title"`/`"price"` and `FADE` in `ProductDetailPage.tsx`; `"price"`/`"sheet-title"` and `FADE` in `ProductDetailSheet.tsx`; `"page-title"` and `FADE` in `ProductGrid.tsx`; `"page-title"`/`"group-title"` and `FADE` in `ProductList.tsx`. Views therefore live in those files (see "Spec deviations").
- Template mobile rules: 44 × 44 tap targets, no horizontal overflow at 360 px, 16 px inputs, `prefers-reduced-motion`. Shop colours only via `--sf-*` tokens; editor UI via `--sfb-*`.
- Editor protocol stays `protocol: 1`; `cards` is the only new field. Never send `cards: null` — absent when there are no designs.
- Web tests: `npm --prefix web test -- <files>` from the storefront root; typecheck `npm --prefix web run typecheck`; build `npm --prefix web run build` (includes the builder-isolation check). Never run `npm run install:web`; use `npm ci` inside `web/` if dependencies are missing. **Only the task marked "Playwright owner" in a wave runs `npm run test:e2e`.**
- If a sibling task's file breaks typecheck/tests, wait a minute and re-run; never edit it. Blocked → report BLOCKED / NEEDS_CONTEXT.

## Review Focus

1. **An old (v0.7.0 / stage 1–2) product document opened in the editor and edited once** → the posted change carries full slots from `defaultSlots` (legacy toggles honoured), never `[]`, and never trips `part-required`. Test: Task 14 Step 1 (`docsFromPageSet` upgrade + `toPageSet` round trip) and Task 13 Step 1 (`prepareProps` keeps absent slots absent, drops legacy props only when every slot is present).
2. **The editor canvas and the shop disagreeing on a container's slot items** (Puck's slot function has no `items`; a stale read) → the canvas's `layoutNoImage` / `noNav` follow the stored slot arrays exactly as the shop's do. Test: Task 2 Step 1 (`EditorBlock` attaches `items` from `getItemById` for a slotted block).
3. **Hundreds of cards from one compiled design** → guard + compile run once per document object; each card shows its own product (element objects are shared, providers are not); a design that throws falls back to built-in for every list, logged once. Tests: Task 7 Step 1 (fakes, spies over 500 renders) and Task 11 Step 1 (real card parts, two distinct products).
4. **Sheet and page both naming the tab** → `document.title` is set by the page surface (page) or the sheet host (sheet) only, restored on close/unmount, never twice. Test: Task 9 Step 1 (`document.title` after opening, swapping and closing the sheet).
5. **Hostile or malformed `cards` in transit** (`null`, an array, a string, `{ tile: 'x' }`, `{ tile: { content: 'no' } }`, a `__proto__` or `grid` kind) → dropped alone by both `api/pages.ts` and the editor protocol, the rest of the set kept; a kind other than `tile` / `row` never reaches the store or an outbound change. Test: Task 6 Step 1.

---

## File Structure

**Create — runtime (shopper bundle)**
- `web/src/builder/parts.ts` — `PartFamily`, `ContainerSpec`, `PartViewProps`, `FamilyValue`, `Family`, `createFamily`, `slotShows`, `containsType`, `NO_SILENT`, `partId`, `part`, `group`, `fixedSlot`, `FAMILY_DOC`. Imports nothing from the registry.
- `web/src/builder/families.ts` — `ProductData`, `CatalogueData`, `CardData`, `ProductFamily`, `CatalogueFamily`, `CardTileFamily`, `CardRowFamily`, `ProductSlots`, `ProductHost`, `ProductHostContext`.
- `web/src/builder/upgrade.ts` — `fillAbsentSlots`, `upgradeItems`, `upgradeDoc`.
- `web/src/builder/page-set-context.ts` — `PageSetContext`, `usePageSetContext`.
- `web/src/builder/cards.ts` — `CardDesign`, `compileCard`.
- `web/src/builder/card-design.tsx` — `CardDesignProvider`, `useCardDesign`, `CardDesignBoundary`.
- `web/src/builder/blocks/_shared/product-container.ts`, `catalogue-container.ts`, `card-containers.ts` — the four `ContainerSpec`s and their `defaultSlots`.
- Part blocks (`web/src/builder/blocks/`): `ProductBreadcrumbs`, `ProductGallery`, `ProductTitle`, `ProductPrice`, `ProductStock`, `ProductAddToCart`, `ProductDescription`, `ProductBulkPricing`, `ProductProvenance`, `ProductAsk`, `ProductUpsells`, `ProductGroup`; `CatalogIntro`, `CatalogSearch`, `CatalogCategories`, `CatalogTitle`, `CatalogResults`, `CatalogEmpty`; frames `CardTile`, `CardRow`; `CardTileImage`, `CardTileGroup`, `CardTileName`, `CardTileFlags`, `CardTilePrice`, `CardTileAdd`, `CardRowGroup`, `CardRowName`, `CardRowMeta`, `CardRowPrice`, `CardRowAdd` (`.tsx` each; 31 files).
- `web/src/builder/editor/fields/<each of the 31>.ts`.
- `web/src/builder/defaults/groups/cards.ts`.
- `web/src/features/catalog/product-parts.tsx` — views shared by the page and sheet surfaces (`BreadcrumbsView`, `ProductGroupView`).
- `web/src/features/catalog/catalogue-parts.tsx` — views shared by grid and list (`CatalogSearchView`, `CatalogCategoriesView`, `CatalogEmptyView`).

**Create — editor**
- `web/src/builder/editor/container-parts.ts` (pure), `ContainerPanel.tsx`, `ContainerPanel.module.css` — Parts list, Add, Reset arrangement, notices, "Edit card design".
- `web/src/builder/editor/preview-product.ts`, `SheetStage.tsx`, `SheetStage.module.css` — Preview with, sheet canvas.
- `web/src/builder/editor/card-states.ts`, `CardStage.tsx`, `CardStage.module.css` — card designer canvas.

**Create — tests**
- `web/test/helpers/golden.ts`, `web/test/helpers/product-fixtures.ts`, `web/test/helpers/fake-parts.tsx`, `web/test/__golden__/*.html`.
- `web/test/golden-parity.test.tsx`, `builder-parts.test.tsx`, `builder-parts-rules.test.ts`, `builder-upgrade.test.ts`, `builder-cards.test.tsx`, `builder-card-parts.test.tsx`, `builder-product-parts.test.tsx`, `builder-catalogue-parts.test.tsx`, `builder-parts-contract.test.tsx`, `feature-root-attrs.test.tsx`, `builder-transport-cards.test.ts`, `builder-editor-parts-config.test.ts`, `builder-editor-parts-model.test.ts`, `builder-editor-container-panel.test.tsx`, `builder-editor-preview-product.test.tsx`, `builder-editor-card-stage.test.tsx`.
- `e2e/product-parts.spec.ts`.

**Modify**
- `web/src/builder/types.ts`, `define.ts`, `render.tsx`, `rules.ts`, `guard.ts`, `runtime.tsx`, `blocks-manifest.ts`, `defaults/index.ts`, `defaults/helpers.ts`, `web/public/blocks.json`.
- Blocks `ProductDetail.tsx`, `ProductGrid.tsx`, `ProductList.tsx`, `FeaturedProducts.tsx`, `_shared/catalogue.tsx`.
- Features `ProductDetailPage.tsx`, `ProductDetailSheet.tsx`, `ProductGrid.tsx`, `ProductList.tsx`, `ProductCard.tsx`, `ProductRow.tsx`, `Upsells.tsx`, `AddToCart.tsx`, `ProductImage.tsx`, `CategoryNav.tsx`, their `.module.css` (TEXT variables); `web/src/layouts/SearchField.tsx`; `web/src/components/EmptyState.tsx`; `web/src/api/pages.ts`.
- Editor `protocol.ts`, `page-set.ts`, `store.ts`, `page-catalog.ts`, `config.ts`, `derive-fields.ts`, `prepare.ts`, `insert-target.ts`, `route-bound.ts`, `EditorBlock.tsx`, `EditorHeader.tsx`, `EditorCanvas.tsx`, `ExactPreview.tsx`, `page-ground.tsx`, `fixtures.ts`, `fixture-api.ts`, `fixture-routes.tsx`, `text/BlockText.tsx`.
- Tests (enumeration tables only): `builder-editor-contract.test.ts`, `builder-style-contract.test.tsx`, `builder-defaults-complete.test.ts`, `builder-editor-fields.test.ts`, `blocks-manifest.test.ts` (none of their assertions about existing blocks change).
- e2e: `e2e/page-sets.ts`, `e2e/builder-editor.spec.ts` (additions only).
- Docs: `docs/builder.md`, `docs/templates.md`.

## Waves (parallel execution)

| Wave | Tasks (disjoint files within a wave) | Depends on |
|---|---|---|
| 1 | Task 1 (golden capture) ‖ Task 2 (core contract) | — |
| 2 | Task 3 (rules) ‖ Task 4 (upgrade, guard, defaults) ‖ Task 5 (feature root attrs) ‖ Task 6 (transport) ‖ Task 7 (card runtime) | 2 (Task 5 also 1) |
| 3 | Task 8 (product family, page surface) ‖ Task 10 (catalogue family) ‖ Task 11 (card family); Task 9 (sheet host) starts as soon as Task 8 commits, beside 10–11 | 8, 10, 11 ← 1,3,4,5,7 · 9 ← 8 |
| 4 | Task 12 (contract flip, manifest, docs, bundle gate) — **Playwright owner** (dom-parity + templates matrix) | 8–11 |
| 5 | Task 13 (editor config & canvas rules) ‖ Task 14 (editor model & page picker) | 12 |
| 6 | Task 15 (container panel) ‖ Task 16 (preview product & sheet canvas) | 13, 14 |
| 7 | Task 17 (card designer canvas) | 16 |
| 8 | Task 18 (e2e + full verification) — **Playwright owner** | all |

Task 9 edits only `ProductDetailSheet.tsx` (+ its CSS and test); it needs Task 8's part blocks and `product-parts.tsx`, and its files are disjoint from Tasks 10–11, so it runs as soon as Task 8 is committed. Wave 4 waits for all four.

**Known red between waves (do not "fix" in another task):** from Wave 3 until Task 12, `web/test/blocks-manifest.test.ts` (the committed `web/public/blocks.json` is stale) — Task 12 regenerates it. Everything else must stay green after every task.

---

### Task 1: Golden markup of v0.7.0 product surfaces (before any refactor)

**Depends on:** none. **Wave 1.** Spec §12 ("the first implementation task captures golden markup").

**Files:**
- Create: `web/test/helpers/golden.ts`, `web/test/helpers/product-fixtures.ts`, `web/test/golden-parity.test.tsx`, `web/test/__golden__/*.html` (generated, committed)

**Interfaces:**
- Consumes: today's `ProductDetailPage`, `ProductDetailSheet`, `ProductCard`, `ProductRow`, `ProductGrid`, `ProductList` (unchanged).
- Produces (later tasks import these and must keep this test green **without** `UPDATE_GOLDEN`):
  - `expectGolden(name: string, html: string): void` — compares `normalizeMarkup(html)` with `web/test/__golden__/<name>.html`; with `UPDATE_GOLDEN=1` it writes the file instead.
  - `normalizeMarkup(html: string): string` — Mantine / React ids → `ID`, one tag per line.
  - `product-fixtures.ts`: `SETTINGS: StorefrontSettings`, `CATEGORIES: Category[]`, `baseProduct(o?: Partial<Product>): Product`, `FULL: Product`, `MATE: Product`, `catalogOf(...p: Product[]): Catalog`, `CARD_MATRIX: Array<{ name: string; product: Product; props: { eager?: boolean; hasSiblingImages?: boolean; index?: number } }>`, `ROW_MATRIX: Array<{ name: string; product: Product; index?: number; ordering: boolean; showSku: boolean }>`, `LEGACY_TOGGLES: Array<{ gallery: boolean; bulkPricing: boolean; provenance: boolean; upsells: boolean }>` (all 16), `toggleName(t, photo: boolean): string` → e.g. `product-legacy-g1b0p1u1-photo`.

- [ ] **Step 1: Write the helpers**

`web/test/helpers/golden.ts`:

```ts
/// <reference types="node" />
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect } from 'vitest';

const DIR = resolve(__dirname, '../__golden__');

/** Ids React/Mantine derive from render order, then one tag per line so a diff reads. */
export function normalizeMarkup(html: string): string {
  return html
    .replace(/\b(id|for|aria-[a-z]+)="([^"]*)"/g, (_m, attr: string, val: string) =>
      `${attr}="${val.replace(/(mantine-)[a-z0-9]{5,}/gi, '$1ID').replace(/«r[0-9a-z]+»|:r[0-9a-z]+:|_r_[0-9a-z]+_/g, 'RID')}"`)
    .replace(/></g, '>\n<');
}

/**
 * v0.7.0's markup, captured once by Task 1 (UPDATE_GOLDEN=1) before any product surface was
 * refactored. Never regenerate after that: a difference is a parity regression (spec §12).
 */
export function expectGolden(name: string, html: string): void {
  const file = resolve(DIR, `${name}.html`);
  const got = normalizeMarkup(html);
  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(file, `${got}\n`);
    return;
  }
  expect(existsSync(file), `missing golden ${name}.html`).toBe(true);
  expect(got).toBe(readFileSync(file, 'utf8').replace(/\n$/, ''));
}
```

`web/test/helpers/product-fixtures.ts` (Northbound Supply only; every value invented):

```ts
import type { Catalog, Category, Product } from '@/types/catalog.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

export const SETTINGS = {
  currency: 'GBP', welcomeMessage: 'Packed to order', enabled: true, supportLinks: [], notices: [],
  brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: 'Small batches', links: { whatsapp: 'https://wa.me/440000000000', telegram: null } },
  features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: true },
} as unknown as StorefrontSettings;

export const CATEGORIES: Category[] = [
  { id: 1, name: 'Pantry', slug: 'pantry', parentId: null, sortOrder: 0, emoji: null },
  { id: 2, name: 'Oats', slug: 'oats', parentId: 1, sortOrder: 0, emoji: null },
];

export function baseProduct(o: Partial<Product> = {}): Product {
  return {
    id: 1, sku: 'NB-OAT-1', name: 'Trail Oats 1kg', displayName: 'Trail Oats 1kg', shortDisplayName: null, description: null,
    categoryId: 2, categoryName: 'Pantry > Oats', sortOrder: 0, price: 12, inStock: true, lowStockAlert: false,
    isActive: true, isPreorder: false, preorderEta: null, pricingTiers: [], upsellProductIds: [],
    excludedFromFreeShipping: false, imageProductId: null, provenance: null, minOrderQuantity: null, maxOrderQuantity: null, ...o,
  };
}

/** Every optional piece of the product page present. */
export const FULL = baseProduct({
  description: 'Rolled on Monday, packed on Tuesday.', pricingTiers: [{ id: 1, minQuantity: 5, price: 10 }],
  provenance: 'Milled at the **Northbound** mill.', upsellProductIds: [2], imageProductId: 1,
  isPreorder: true, preorderEta: '2026-10-12T00:00:00.000Z', minOrderQuantity: 2, lowStockAlert: true,
});
export const MATE = baseProduct({ id: 2, sku: 'NB-TIN-2', name: 'Trail Tin', displayName: 'Trail Tin', price: 14, imageProductId: 2 });

export const catalogOf = (...products: Product[]): Catalog => ({ products, categories: CATEGORIES });

export const LEGACY_TOGGLES = [false, true].flatMap((gallery) => [false, true].flatMap((bulkPricing) =>
  [false, true].flatMap((provenance) => [false, true].map((upsells) => ({ gallery, bulkPricing, provenance, upsells })))));
const b = (v: boolean) => (v ? 1 : 0);
export const toggleName = (t: (typeof LEGACY_TOGGLES)[number], photo: boolean) =>
  `product-legacy-g${b(t.gallery)}b${b(t.bulkPricing)}p${b(t.provenance)}u${b(t.upsells)}-${photo ? 'photo' : 'nophoto'}`;

/** Spec §12 card matrix: photo / no photo / sibling well, in / low / out, pre-order ± ETA, minimum, tiers, index. */
export const CARD_MATRIX = [
  { name: 'photo', product: baseProduct({ imageProductId: 1 }), props: { eager: true, index: 0 } },
  { name: 'well', product: baseProduct(), props: { hasSiblingImages: true, index: 3 } },
  { name: 'no-well', product: baseProduct(), props: { hasSiblingImages: false } },
  { name: 'low', product: baseProduct({ lowStockAlert: true }), props: {} },
  { name: 'out', product: baseProduct({ inStock: false }), props: { index: 1 } },
  { name: 'preorder', product: baseProduct({ isPreorder: true, inStock: false }), props: {} },
  { name: 'preorder-eta', product: baseProduct({ isPreorder: true, preorderEta: '2026-10-12T00:00:00.000Z' }), props: {} },
  { name: 'minimum-tiers', product: baseProduct({ minOrderQuantity: 3, pricingTiers: [{ id: 1, minQuantity: 5, price: 10 }, { id: 2, minQuantity: 10, price: 9 }] }), props: {} },
  { name: 'inactive', product: baseProduct({ isActive: false }), props: {} },
];
export const ROW_MATRIX = [
  { name: 'plain', product: baseProduct(), ordering: true, showSku: true },
  { name: 'index', product: baseProduct(), index: 2, ordering: true, showSku: true },
  { name: 'no-sku-plain', product: baseProduct(), ordering: true, showSku: false },
  { name: 'meta-all', product: baseProduct({ minOrderQuantity: 2, isPreorder: true, lowStockAlert: true, pricingTiers: [{ id: 1, minQuantity: 5, price: 10 }] }), ordering: true, showSku: true },
  { name: 'out', product: baseProduct({ inStock: false }), ordering: true, showSku: true },
  { name: 'inactive', product: baseProduct({ isActive: false }), ordering: true, showSku: true },
  { name: 'ordering-off', product: baseProduct(), ordering: false, showSku: true },
];
```

- [ ] **Step 2: Write the capture test**

`web/test/golden-parity.test.tsx` — renders today's components and compares with the golden files. After the refactor the same file proves the compatibility entry points (`ProductDetailPage sections=…`, `ProductDetailSheet`, `ProductCard`, `ProductRow`, `ProductGrid`, `ProductList`) still draw v0.7.0.

```tsx
import { afterEach, describe, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';
import type { Catalog } from '@/types/catalog.ts';
import type { StorefrontSettings } from '@/types/settings.ts';
import { CARD_MATRIX, catalogOf, FULL, LEGACY_TOGGLES, MATE, ROW_MATRIX, SETTINGS, toggleName, baseProduct } from './helpers/product-fixtures.ts';
import { expectGolden } from './helpers/golden.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings, catalog: undefined as Catalog | undefined, showSku: true, search: '' }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => ({ data: state.catalog, isPending: false, isError: false, refetch: () => {} }),
  useProduct: (id: number | null) => ({ data: id == null ? undefined : state.catalog?.products.find((p) => p.id === id), isPending: false, isError: false, refetch: () => {} }),
}));
vi.mock('@/templates/hooks.ts', async (orig) => {
  const real = await orig<typeof import('@/templates/hooks.ts')>();
  return { ...real, useCoreOptions: () => ({ ...real.useCoreOptions(), showSku: state.showSku }) };
});

import { ProductDetailPage } from '@/features/catalog/ProductDetailPage.tsx';
import { ProductDetailSheet } from '@/features/catalog/ProductDetailSheet.tsx';
import { ProductCard } from '@/features/catalog/ProductCard.tsx';
import { ProductRow } from '@/features/catalog/ProductRow.tsx';
import { ProductGrid } from '@/features/catalog/ProductGrid.tsx';
import { ProductList } from '@/features/catalog/ProductList.tsx';

afterEach(() => { cleanup(); state.showSku = true; });

function shell(path: string, route: string, element: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider env="test">
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<Outlet context={{ search: state.search ?? '', setSearch: () => {} }} />}>
              <Route path={route} element={element} />
            </Route>
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
}
```

Then the cases:

```tsx
describe('product page (v0.7.0, sections × photo)', () => {
  it.each(LEGACY_TOGGLES.flatMap((t) => [true, false].map((photo) => ({ t, photo }))))('$t.gallery $t.bulkPricing $t.provenance $t.upsells photo=$photo', ({ t, photo }) => {
    state.settings = SETTINGS;
    state.catalog = catalogOf(photo ? FULL : { ...FULL, imageProductId: null }, MATE);
    const { container } = shell('/p/1', '/p/:id', <ProductDetailPage sections={t} />);
    expectGolden(toggleName(t, photo), container.innerHTML);
  });
});

describe('product sheet (v0.7.0)', () => {
  it.each([
    { name: 'product-sheet-full', product: FULL, showSku: true },
    { name: 'product-sheet-plain-nosku', product: baseProduct(), showSku: false },
  ])('$name', ({ name, product, showSku }) => {
    state.settings = { ...SETTINGS, features: { ...SETTINGS.features, layout: 'menu' } } as StorefrontSettings;
    state.catalog = catalogOf(product, MATE);
    state.showSku = showSku;
    const { baseElement } = shell('/', '/', <ProductDetailSheet productId={product.id} onClose={() => {}} onSelect={() => {}} />);
    expectGolden(name, baseElement.querySelector('[data-sf-part="sheet"]')!.outerHTML);
  });
});

describe('cards (v0.7.0)', () => {
  it.each(CARD_MATRIX)('tile $name', ({ name, product, props }) => {
    state.settings = SETTINGS;
    state.catalog = catalogOf(product);
    const { container } = shell('/', '/', <ProductCard product={product} {...props} />);
    expectGolden(`card-tile-${name}`, container.innerHTML);
  });
  it.each(ROW_MATRIX)('row $name', ({ name, product, index, ordering, showSku }) => {
    state.settings = { ...SETTINGS, features: { ...SETTINGS.features, ordering } } as StorefrontSettings;
    state.catalog = catalogOf(product);
    state.showSku = showSku;
    const { container } = shell('/', '/', <ProductRow product={product} onSelect={() => {}} index={index} />);
    expectGolden(`card-row-${name}`, container.innerHTML);
  });
});

describe('catalogue pages (v0.7.0)', () => {
  const imageless = baseProduct({ id: 3, displayName: 'Plain Tin', sku: 'NB-P-3' });
  it.each([
    { name: 'grid-all', path: '/', route: '/', search: '', products: [FULL, MATE] },
    { name: 'grid-category', path: '/c/oats', route: '/c/:categorySlug', search: '', products: [FULL, MATE] },
    { name: 'grid-unknown', path: '/c/nope', route: '/c/:categorySlug', search: '', products: [FULL, MATE] },
    { name: 'grid-no-match', path: '/', route: '/', search: 'zzz', products: [FULL, MATE] },
    { name: 'grid-imageless', path: '/', route: '/', search: '', products: [imageless] },
    { name: 'grid-empty', path: '/', route: '/', search: '', products: [] },
  ])('$name', ({ name, path, route, search, products }) => {
    state.settings = SETTINGS; state.catalog = catalogOf(...products); state.search = search;
    const { container } = shell(path, route, <ProductGrid />);
    expectGolden(name, container.innerHTML);
  });
  it.each([
    { name: 'list-all', path: '/', route: '/', search: '' },
    { name: 'list-category', path: '/c/oats', route: '/c/:categorySlug', search: '' },
    { name: 'list-unknown', path: '/c/nope', route: '/c/:categorySlug', search: '' },
    { name: 'list-no-match', path: '/', route: '/', search: 'zzz' },
  ])('$name', ({ name, path, route, search }) => {
    state.settings = { ...SETTINGS, features: { ...SETTINGS.features, layout: 'menu' } } as StorefrontSettings;
    state.catalog = catalogOf(FULL, MATE); state.search = search;
    const { container } = shell(path, route, <ProductList />);
    expectGolden(name, container.innerHTML);
  });
});
```

Reset `state.search = ''` in `afterEach`. If `useShellSearch` does not read the outlet context in this tree, mirror how `test/product-grid.test.tsx` provides the search (read it first) — the capture must not depend on a mock that later tasks change.

- [ ] **Step 3: Run it to see it fail, then capture**

Run: `npm --prefix web test -- test/golden-parity.test.tsx`
Expected: FAIL — `missing golden product-legacy-…html` for every case.

Run: `UPDATE_GOLDEN=1 npm --prefix web test -- test/golden-parity.test.tsx` (PowerShell: `$env:UPDATE_GOLDEN='1'; npm --prefix web test -- test/golden-parity.test.tsx; Remove-Item Env:UPDATE_GOLDEN`)
Expected: PASS; `web/test/__golden__/` holds 32 `product-legacy-*`, 2 `product-sheet-*`, 9 `card-tile-*`, 7 `card-row-*`, 6 `grid-*`, 4 `list-*` files.

- [ ] **Step 4: Check the capture is meaningful, then re-run without the flag**

Open three files and confirm: `product-legacy-g1b1p1u1-photo.html` contains `bulk-heading`, `provenance-heading`, `ask-heading`, `upsells-heading` and a `media` div; `product-legacy-g0b0p0u0-photo.html` has none of those four ids except `ask-heading` and its layout div carries the `layoutNoImage` class; `product-sheet-full.html` contains `data-sf-part="sheet-title"` and `priceBand`. If any is empty or lacks these, fix the fixture/mocks (not the goldens by hand) and recapture.

Run: `npm --prefix web test -- test/golden-parity.test.tsx` — Expected: PASS (all 60).

- [ ] **Step 5: Record the entry-chunk baseline**

Run: `npm --prefix web run build`, then note the size of the largest `web/dist/assets/index-*.js` (bytes) and confirm `grep -c "bulk-heading" web/dist/assets/index-*.js` prints `0`. Put both numbers in the commit message body (Task 12 compares against them).

- [ ] **Step 6: Commit**

```bash
git add -- web/test/helpers/golden.ts web/test/helpers/product-fixtures.ts web/test/golden-parity.test.tsx web/test/__golden__
git commit -m "test(storefront): golden v0.7.0 markup of product page, sheet, cards, grid and list (stage 3 §12)

Entry chunk baseline: <bytes> bytes; bulk-heading occurrences in entry: 0.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/test/helpers/golden.ts web/test/helpers/product-fixtures.ts web/test/golden-parity.test.tsx web/test/__golden__
```

---

### Task 2: Core contract — types, `define.ts`, `parts.ts`, `families.ts`, slot `items`

**Depends on:** none. **Wave 1.** Spec §3.2, §3.3, §6.1 (types), §16.5.

**Files:**
- Create: `web/src/builder/parts.ts`, `web/src/builder/families.ts`, `web/test/builder-parts.test.tsx`, `web/test/helpers/fake-parts.tsx`
- Modify: `web/src/builder/types.ts`, `web/src/builder/define.ts`, `web/src/builder/render.tsx`, `web/src/builder/runtime.tsx` (`resolveDoc` only), `web/src/builder/editor/EditorBlock.tsx`, `web/src/builder/editor/config.ts` (`CATEGORY_TITLES` only), `web/src/builder/editor/ExactPreview.tsx` (`routeKeyFor` only), `web/test/builder-editor-contract.test.ts`, `web/test/builder-style-contract.test.tsx`

**Interfaces:**
- Consumes: `StyleAttrs`, `SlotRender` (define.ts), `ComponentData`, `isComponentLike`, `DocKey`, `LayoutKind` (types.ts).
- Produces:
  - `types.ts`: `CARD_KINDS = ['tile', 'row'] as const`, `type CardKind`, ``type CardKey = `card:${CardKind}` ``, `DocKey = RouteKey | 'shell' | CardKey`, `PageSet.cards?: Partial<Record<CardKind, PuckDoc>>`, `isCardKey(k: string): k is CardKey`, `cardKind(k: CardKey): CardKind`, `cardKey(kind: CardKind): CardKey`.
  - `define.ts`: `BlockCategory` gains `'part'`; `SlotRender = ((p?) => ReactNode) & { readonly items: readonly ComponentData[] }`; `BlockDef.container?: ContainerSpec`, `BlockDef.part?: { family: PartFamily }` (never both).
  - `parts.ts`: `type PartFamily = 'product' | 'catalogue' | 'card-tile' | 'card-row'`; `interface ContainerSpec` (spec §3.2 verbatim); `interface PartViewProps { props: Record<string, unknown>; styleAttrs?: StyleAttrs }`; `interface FamilyValue<Data> { data: Data; views: Readonly<Record<string, ComponentType<PartViewProps>>> }`; `interface Family<Data> { family: PartFamily; Provider: Provider<FamilyValue<Data> | null>; useData(): Data; PartHost(p: { name: string; props: Record<string, unknown>; styleAttrs?: StyleAttrs }): ReactNode }`; `createFamily<Data>(family): Family<Data>`; `slotShows(items, silent: ReadonlySet<string>): boolean`; `containsType(items, type): boolean`; `NO_SILENT: ReadonlySet<string>`; `partId(containerId: string, key: string): string`; `part(type: string, containerId: string, key?: string): ComponentData`; `group(type: string, containerId: string, kind: string, items: ComponentData[]): ComponentData`; `fixedSlot(children: ReactNode, items?: readonly ComponentData[]): SlotRender`; `FAMILY_DOC: Record<PartFamily, DocKey>` (`product→'product'`, `catalogue→'catalog'`, `card-tile→'card:tile'`, `card-row→'card:row'`).
  - `families.ts`: `ProductData { product: Product; trail: Category[]; fallbackTrail: string[]; onSelect?: (p: Product) => void }`; `CatalogueData` (below); `CardData { product: Product; index?: number; eager: boolean; hasSiblingImages: boolean; onSelect?: (p: Product) => void }`; `ProductFamily`, `CatalogueFamily`, `CardTileFamily`, `CardRowFamily`; `ProductSlots { top: SlotRender; media: SlotRender; main: SlotRender; below: SlotRender }`; `ProductHost { productId: number | null; onSelect: (p: Product) => void; surface: 'sheet'; SheetBody: ComponentType<{ slots: ProductSlots }> }`; `ProductHostContext: Context<ProductHost | null>`.
  - `render.tsx`: `slotRender(value: unknown, ctx: BlockRenderContext): SlotRender` (exported, attaches `items`), `slotRenders(slots: Readonly<Record<string, readonly ComponentData[]>>, ctx): Record<string, SlotRender>`, `defaultSlotRenders(type: string, layout: LayoutKind, props?: Record<string, unknown>): Record<string, SlotRender>`.
  - `test/helpers/fake-parts.tsx`: `FAKE_BLOCKS: Record<string, AnyBlock>` — a fake container `FakeBox` (family `product`, slots `a`, `b`; required `['FakeTitle', 'FakePrice']`; unique `['FakeTitle','FakePrice','FakeAdd','FakeNote']`; requires `[['FakeAdd','FakePrice']]`; `slotAccepts: { b: ['FakeNote'] }`; `legacyProps: ['showNote']`; `insertSlot: 'a'`), parts `FakeTitle`, `FakePrice`, `FakeAdd` (`layouts: ['storefront']`), `FakeNote` (VIS), `FakeGroup` (slot `items`, VIS), and `FakeFamily`; `withFakeBlocks()` — a `vi.mock` factory body (see Step 3).

`CatalogueData` (exact):

```ts
export interface CatalogueData {
  surface: 'grid' | 'list';
  products: Product[];
  tree: CategoryNode[];
  active: Category | undefined;
  unknownCategory: boolean;
  visible: Product[];
  /** List surface only ([] on the grid). */
  groups: CategoryGroup[];
  search: string;
  /** `search.trim()`. */
  query: string;
  setSearch: (value: string) => void;
  /** Grid: every visible product lacks a photo (the grid draws rows). */
  imageless: boolean;
  /** List: some category carries an emoji. */
  glyphs: boolean;
  /** Grid: navigate to /p/:id. List: open the sheet (`?p=`). */
  openProduct: (product: Product) => void;
}
```

(`CategoryGroup` is `import type { ProductGroup as CategoryGroup } from '@/features/catalog/group.ts'` — type-only, the name `ProductGroup` is the part block's.)

- [ ] **Step 1: Write the failing tests**

`web/test/builder-parts.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { CARD_KINDS, cardKey, cardKind, isCardKey, type ComponentData } from '@/builder/types.ts';
import { containsType, createFamily, FAMILY_DOC, fixedSlot, group, NO_SILENT, part, partId, slotShows } from '@/builder/parts.ts';
import { defaultSlotRenders, slotRender, slotRenders } from '@/builder/render.tsx';

const c = (type: string, id = type, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
const ctx = { editing: false, docKey: 'product' as const, layout: 'storefront' as const };

describe('card keys', () => {
  it('names the two kinds and their doc keys', () => {
    expect([...CARD_KINDS]).toEqual(['tile', 'row']);
    expect(cardKey('tile')).toBe('card:tile');
    expect(cardKind('card:row')).toBe('row');
    expect(['card:tile', 'card:row'].every(isCardKey)).toBe(true);
    expect(['card:grid', 'cards', 'card:', 'catalog', 'page:card'].some(isCardKey)).toBe(false);
  });
  it('maps every family to the doc its container lives on (spec §3.4)', () => {
    expect(FAMILY_DOC).toEqual({ product: 'product', catalogue: 'catalog', 'card-tile': 'card:tile', 'card-row': 'card:row' });
  });
});

describe('slotShows / containsType', () => {
  it('slotShows: true when something outside `silent` is there', () => {
    expect(slotShows([], NO_SILENT)).toBe(false);
    expect(slotShows([c('ProductGallery')], new Set(['ProductGallery']))).toBe(false);
    expect(slotShows([c('ProductGallery'), c('RichText')], new Set(['ProductGallery']))).toBe(true);
    expect(slotShows([c('ProductGallery')], NO_SILENT)).toBe(true);
  });
  it('containsType: depth-first through component arrays, not other props', () => {
    const tree = [c('Section', 's', { content: [c('Columns', 'k', { col1: [], col2: [c('CatalogCategories', 'cc')] })] })];
    expect(containsType(tree, 'CatalogCategories')).toBe(true);
    expect(containsType(tree, 'Heading')).toBe(false);
    // An array prop of plain rows (FAQ items) is never read as components.
    expect(containsType([c('FAQ', 'f', { items: [{ question: 'CatalogCategories', answerHtml: '' }] })], 'CatalogCategories')).toBe(false);
  });
});

describe('ids and default-slot helpers', () => {
  it('partId keeps ≤ 64 chars for the longest container id and key', () => {
    expect(partId('ProductDetail-default', 'ProductTitle')).toBe('ProductDetail-default-ProductTitle');
    expect(partId('x'.repeat(64), 'group-identityText').length).toBeLessThanOrEqual(64);
    expect(partId('x'.repeat(64), 'ProductBreadcrumbs').length).toBeLessThanOrEqual(64);
  });
  it('part / group build sparse components', () => {
    expect(part('ProductPrice', 'd')).toEqual({ type: 'ProductPrice', props: { id: 'd-ProductPrice' } });
    expect(group('ProductGroup', 'd', 'priceRow', [part('ProductPrice', 'd')])).toEqual({
      type: 'ProductGroup', props: { id: 'd-group-priceRow', kind: 'priceRow', items: [{ type: 'ProductPrice', props: { id: 'd-ProductPrice' } }] },
    });
  });
});

describe('createFamily', () => {
  const Fam = createFamily<{ name: string }>('product');
  const View = ({ props, styleAttrs }: { props: Record<string, unknown>; styleAttrs?: Record<string, string> }) => {
    const { name } = Fam.useData();
    return <p {...styleAttrs}>{`${name}:${String(props.kind ?? '')}`}</p>;
  };
  it('PartHost renders null with no container above it (spec §3.2)', () => {
    const { container } = render(<Fam.PartHost name="View" props={{}} />);
    expect(container.innerHTML).toBe('');
  });
  it('PartHost renders the view the container hands down, with the part props and style attributes', () => {
    const { container } = render(
      <Fam.Provider value={{ data: { name: 'Oats' }, views: { View } }}>
        <Fam.PartHost name="View" props={{ kind: 'x' }} styleAttrs={{ 'data-sf-style': 'View', 'data-sfs-bg': 'surface' }} />
        <Fam.PartHost name="Missing" props={{}} />
        <Fam.PartHost name="constructor" props={{}} />
      </Fam.Provider>,
    );
    expect(container.innerHTML).toBe('<p data-sf-style="View" data-sfs-bg="surface">Oats:x</p>');
  });
  it('useData throws outside a container', () => {
    const Bad = () => <>{Fam.useData().name}</>;
    expect(() => render(<Bad />)).toThrow(/outside its container/);
  });
});

describe('slot items (spec §3.2)', () => {
  it('slotRender attaches the stored items and still renders bare or with one wrapper', () => {
    const s = slotRender([c('Spacer', 'sp', { size: 'sm' })], ctx);
    expect(s.items.map((i) => i.props.id)).toEqual(['sp']);
    expect(slotRender(undefined, ctx).items).toEqual([]);
    const { container } = render(<>{s({ className: 'col' })}</>);
    expect(container.firstElementChild?.className).toBe('col');
  });
  it('slotRenders maps each slot', () => {
    const out = slotRenders({ a: [c('Spacer', 'x', { size: 'sm' })], b: [] }, ctx);
    expect(Object.keys(out)).toEqual(['a', 'b']);
    expect(out.a!.items).toHaveLength(1);
  });
  it('fixedSlot renders its children bare, or in one element', () => {
    const s = fixedSlot(createElement('i', null, 'x'));
    expect(s.items).toEqual([]);
    expect(render(<>{s()}</>).container.innerHTML).toBe('<i>x</i>');
    expect(render(<>{s({ className: 'w' })}</>).container.innerHTML).toBe('<div class="w"><i>x</i></div>');
  });
  it('defaultSlotRenders is empty for a block without a container', () => {
    expect(defaultSlotRenders('Heading', 'storefront')).toEqual({});
  });
});
```

Add to `web/test/builder-parts.test.tsx` the Review Focus 2 case for the editor canvas:

```tsx
import { vi } from 'vitest';
const puck = vi.hoisted(() => ({ item: null as ComponentData | null }));
vi.mock('@/builder/editor/use-puck.ts', () => ({
  usePuck: (sel: (s: { getItemById: (id: string) => unknown }) => unknown) => sel({ getItemById: () => puck.item }),
  useGetPuck: () => () => ({}),
}));
import { EditorBlock } from '@/builder/editor/EditorBlock.tsx';
import { defineBlock, slot, type SlotRender } from '@/builder/define.ts';
import { z } from 'zod';

describe('EditorBlock attaches stored slot items (Review Focus 2)', () => {
  it('a slotted block reads its slot arrays from Puck and hands them to render as `items`', () => {
    const seen: string[][] = [];
    const def = defineBlock<{ id: string; a: ComponentData[] }>({
      name: 'Probe', label: 'Probe', category: 'content', layouts: 'all', routeBound: false, slots: ['a'], style: false,
      schema: z.object({ a: slot() }), defaultProps: { a: [] },
      render: ({ a }) => { seen.push((a as SlotRender).items.map((i) => i.props.id)); return <>{a()}</>; },
    });
    puck.item = c('Probe', 'p1', { a: [c('Spacer', 's1'), c('Spacer', 's2')] });
    const puckSlot = () => null;
    render(<EditorBlock def={def} props={{ id: 'p1', a: puckSlot }} docKey="page:x" layout="storefront" />);
    expect(seen.at(-1)).toEqual(['s1', 's2']);
  });
  it('a block without slots never touches Puck (renders outside <Puck> in tests)', () => {
    puck.item = null;
    const def = defineBlock<{ id: string }>({
      name: 'Flat', label: 'Flat', category: 'content', layouts: 'all', routeBound: false, slots: [], style: false,
      schema: z.object({}), defaultProps: {}, render: () => <b>flat</b>,
    });
    expect(render(<EditorBlock def={def} props={{ id: 'f' }} docKey="page:x" layout="storefront" />).container.textContent).toContain('flat');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix web test -- test/builder-parts.test.tsx`
Expected: FAIL — cannot resolve `@/builder/parts.ts`; `CARD_KINDS` not exported from `types.ts`.

- [ ] **Step 3: Implement**

`web/src/builder/types.ts` — add after `DocKey`'s old line (replace it):

```ts
export const CARD_KINDS = ['tile', 'row'] as const;
export type CardKind = typeof CARD_KINDS[number];
/** A card design's editor / issue key (product-parts §6.1). Never a key of `pages` or `cards`. */
export type CardKey = `card:${CardKind}`;
export type DocKey = RouteKey | 'shell' | CardKey;

export const isCardKey = (k: string): k is CardKey => k === 'card:tile' || k === 'card:row';
export const cardKind = (k: CardKey): CardKind => k.slice(5) as CardKind;
export const cardKey = (kind: CardKind): CardKey => `card:${kind}`;
```

and extend `PageSet`: `…; text?: PageText; /** Card designs per kind (product-parts §6.1); absent kind = built-in design. */ cards?: Partial<Record<CardKind, PuckDoc>> }`.

`web/src/builder/parts.ts`:

```tsx
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

/** Where each family's container lives (spec §3.4). */
export const FAMILY_DOC: Record<PartFamily, DocKey> = { product: 'product', catalogue: 'catalog', 'card-tile': 'card:tile', 'card-row': 'card:row' };
```

`web/src/builder/families.ts`:

```ts
import { createContext, type ComponentType } from 'react';
import { createFamily } from '@/builder/parts.ts';
import type { SlotRender } from '@/builder/define.ts';
import type { Category, Product } from '@/types/catalog.ts';
import type { CategoryNode } from '@/features/catalog/category-tree.ts';
import type { ProductGroup as CategoryGroup } from '@/features/catalog/group.ts';

// Type-only feature imports: this module is in the shopper's entry bundle.

export interface ProductData {
  product: Product;
  /** The category trail from the catalogue (page breadcrumbs). */
  trail: Category[];
  /** The product's own flattened path, used while the catalogue lacks the category. */
  fallbackTrail: string[];
  /** Sheet surface: swaps the sheet's product in place (upsell rows). */
  onSelect?: (product: Product) => void;
}
export const ProductFamily = createFamily<ProductData>('product');

/** (paste `CatalogueData` exactly as in the Interfaces block) */
export const CatalogueFamily = createFamily<CatalogueData>('catalogue');

/** Exactly the props ProductCard / ProductRow take today (spec §5.3). Tiles always carry an index (default 0). */
export interface CardData { product: Product; index?: number; eager: boolean; hasSiblingImages: boolean; onSelect?: (product: Product) => void }
export const CardTileFamily = createFamily<CardData>('card-tile');
export const CardRowFamily = createFamily<CardData>('card-row');

export interface ProductSlots { top: SlotRender; media: SlotRender; main: SlotRender; below: SlotRender }

/**
 * Set by the menu / web-app product sheet around the layout's `product` document (spec §7.2). The
 * ProductDetail block renders `SheetBody` instead of the page when a host is present, so the sheet
 * needs no lazy chunk and no route.
 */
export interface ProductHost {
  productId: number | null;
  onSelect: (product: Product) => void;
  surface: 'sheet';
  SheetBody: ComponentType<{ slots: ProductSlots }>;
}
export const ProductHostContext = createContext<ProductHost | null>(null);
```

`web/src/builder/define.ts`:
- `import type { ContainerSpec, PartFamily } from '@/builder/parts.ts';` (type-only: no runtime cycle).
- `BlockCategory` adds `| 'part'`.
- Replace `SlotRender` with `export type SlotRender = ((p?: { className?: string; style?: CSSProperties; as?: ElementType }) => ReactNode) & { readonly items: readonly ComponentData[] };` and its comment: "`items` = the stored children, so a container can choose classes from what a slot holds without rendering it (spec §3.2)."
- In `BlockDef`, after `style`:

```ts
  /** A container (product-parts §3.2): owns data, its slots hold its family's parts. Never with `part`. */
  container?: ContainerSpec;
  /** A part (§3.2): renders one thing from its family's context; lives only inside that family's container. */
  part?: { family: PartFamily };
```

`web/src/builder/render.tsx`:

```tsx
/** A slot prop at render time, with the stored items attached (spec §3.2). */
export function slotRender(value: unknown, ctx: BlockRenderContext): SlotRender {
  const items = Array.isArray(value) ? (value as ComponentData[]) : [];
  const fn = (p?: Parameters<SlotRender>[0]) => {
    const children = renderItems(items, ctx);
    if (!p || (p.className === undefined && p.style === undefined && p.as === undefined)) return <>{children}</>;
    const As = p.as ?? 'div';
    return <As className={p.className} style={p.style}>{children}</As>;
  };
  return Object.assign(fn, { items });
}

export function slotRenders(slots: Readonly<Record<string, readonly ComponentData[]>>, ctx: BlockRenderContext): Record<string, SlotRender> {
  const out: Record<string, SlotRender> = {};
  for (const [name, items] of Object.entries(slots)) out[name] = slotRender(items, ctx);
  return out;
}

/**
 * A container's default arrangement as slot renders: the feature components' no-argument entry
 * points (tests, v0.7.0 call sites) draw exactly what the default document draws.
 */
export function defaultSlotRenders(type: string, layout: LayoutKind, props: Record<string, unknown> = {}): Record<string, SlotRender> {
  const def = blockDef(type);
  const spec = def?.container;
  if (!spec) return {};
  const id = `${type}-default`;
  return slotRenders(spec.defaultSlots(props, { layout, id }), { editing: false, docKey: FAMILY_DOC[spec.family], layout });
}
```

(import `FAMILY_DOC` from `@/builder/parts.ts`, `LayoutKind` from types.) Remove the old private `slotRender`; `BlockBody` keeps calling it.

`web/src/builder/runtime.tsx` — `resolveDoc`'s lookup only (cards never resolve here; Task 7 reads them):

```ts
const stored = !pageSet || isCardKey(docKey) ? undefined : docKey === 'shell' ? pageSet.shell : pageSet.pages[docKey];
```

`web/src/builder/editor/ExactPreview.tsx`: `const routeKeyFor = (docKey: DocKey): RouteKey => (docKey === 'shell' || isCardKey(docKey) ? 'catalog' : docKey);` (Task 16 refines it).

`web/src/builder/editor/config.ts`: add `part: 'Parts',` to `CATEGORY_TITLES` (Task 13 titles it per family) — nothing else.

`web/src/builder/editor/EditorBlock.tsx` — slot items for slotted blocks only (slot-less blocks never call Puck hooks, so they keep rendering outside `<Puck>`):

```tsx
import { usePuck } from '@/builder/editor/use-puck.ts';
import type { ComponentData } from '@/builder/types.ts';

/** Puck's slot functions carry no items: attach the stored arrays, read from Puck's own state (spec §3.2). */
function withItems(slots: Record<string, unknown>, stored: ComponentData | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(slots)) {
    const items = Array.isArray(stored?.props[name]) ? (stored!.props[name] as ComponentData[]) : [];
    out[name] = typeof fn === 'function' ? Object.assign((p?: unknown) => (fn as (p?: unknown) => unknown)(p), { items }) : fn;
  }
  return out;
}

function SlottedBody({ id, slots, children }: { id: unknown; slots: Record<string, unknown>; children: (slots: Record<string, unknown>) => ReactNode }) {
  const stored = usePuck((s) => (typeof id === 'string' ? (s.getItemById(id) as ComponentData | undefined) : undefined));
  return <>{children(withItems(slots, stored))}</>;
}
```

In `EditorBlock`, render `<BlockBody … props={{ ...settings, ...slots, id }} />` for `def.slots.length === 0`, and otherwise `<SlottedBody id={id} slots={slots}>{(s) => <BlockBody def={def} props={{ ...settings, ...s, id }} ctx={ctx} />}</SlottedBody>` inside the same boundary / Suspense / EmptyWatch.

`web/test/helpers/fake-parts.tsx`:

```tsx
import { z } from 'zod';
import { defineBlock, slot, type AnyBlock } from '@/builder/define.ts';
import { createFamily, part } from '@/builder/parts.ts';
import { BOX, styleSupport, VIS } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

export const FakeFamily = createFamily<{ label: string }>('product');
const shell = (name: string, extra: Partial<AnyBlock> = {}): AnyBlock => defineBlock<{ id: string }>({
  name, label: name.replace('Fake', ''), category: 'part', part: { family: 'product' }, layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX]), schema: z.object({}), defaultProps: {},
  render: (p) => <FakeFamily.PartHost name={name} props={p as Record<string, unknown>} styleAttrs={p.puck.style} />, ...extra,
} as AnyBlock);

export const FAKE_BLOCKS: Record<string, AnyBlock> = {
  FakeBox: defineBlock<{ id: string; a: ComponentData[]; b: ComponentData[]; showNote: boolean }>({
    name: 'FakeBox', label: 'Fake box', category: 'product', layouts: 'all', routeBound: false, slots: ['a', 'b'],
    style: styleSupport('wrap', [...BOX]),
    schema: z.object({ a: slot(), b: slot(), showNote: z.boolean() }), defaultProps: { a: [], b: [], showNote: true },
    container: {
      family: 'product', insertSlot: 'a', legacyProps: ['showNote'],
      required: ['FakeTitle', 'FakePrice'], unique: ['FakeTitle', 'FakePrice', 'FakeAdd', 'FakeNote'],
      requires: [['FakeAdd', 'FakePrice']], slotAccepts: { b: ['FakeNote'] },
      defaultSlots: (props, { id }) => ({
        a: [part('FakeTitle', id), part('FakePrice', id), part('FakeAdd', id)],
        b: props.showNote === false ? [] : [part('FakeNote', id)],
      }),
    },
    render: ({ a, b }) => <div data-fake-box="">{a()}{b()}</div>,
  }) as AnyBlock,
  FakeTitle: shell('FakeTitle'),
  FakePrice: shell('FakePrice'),
  FakeAdd: shell('FakeAdd', { layouts: ['storefront'] }),
  FakeNote: shell('FakeNote', { style: styleSupport('root', [...BOX, ...VIS]) }),
  FakeGroup: defineBlock<{ id: string; items: ComponentData[] }>({
    name: 'FakeGroup', label: 'Group', category: 'part', part: { family: 'product' }, layouts: 'all', routeBound: false, slots: ['items'],
    style: styleSupport('root', ['align', ...VIS]), schema: z.object({ items: slot() }), defaultProps: { items: [] },
    render: ({ items }) => <div data-fake-group="">{items()}</div>,
  }) as AnyBlock,
};

/** `vi.mock('@/builder/registry.ts', withFakeBlocks)` — the real blocks plus the fakes. */
export async function withFakeBlocks(importOriginal: () => Promise<unknown>) {
  const real = (await importOriginal()) as { BLOCKS: Record<string, AnyBlock> };
  return { ...real, BLOCKS: { ...real.BLOCKS, ...FAKE_BLOCKS } };
}
```

- [ ] **Step 4: Keep the enumeration tests part-aware**

These tests list every registered block; parts get their own contract test (Tasks 8–12), so exclude them here (no assertion about an existing block changes):
- `web/test/builder-editor-contract.test.ts`, "registers exactly the §7 blocks": `expect(Object.keys(BLOCKS).filter((n) => !BLOCKS[n]!.part).sort()).toEqual([...SPEC_BLOCKS].sort());`
- `web/test/builder-style-contract.test.tsx`: FLOOR coverage `expect(Object.keys(FLOOR).sort()).toEqual(Object.keys(BLOCKS).filter((n) => !BLOCKS[n]!.part).sort());`; in the fg/textSize test `if (!def.style || def.slots.length > 0 || def.part) continue;`; `stylable` becomes `Object.values(BLOCKS).filter((d) => d.style && !d.part)`.

- [ ] **Step 5: Run the tests and typecheck**

Run: `npm --prefix web test -- test/builder-parts.test.tsx test/builder-render.test.tsx test/builder-editor-style-canvas.test.tsx test/builder-editor-contract.test.ts test/builder-style-contract.test.tsx test/builder-runtime.test.tsx`
Expected: PASS.
Run: `npm --prefix web run typecheck` — Expected: no errors. If widening `DocKey` breaks another file, fix only that expression with `isCardKey` (as `resolveDoc` / `routeKeyFor`) and list it in your report.

- [ ] **Step 6: Commit**

```bash
git add -- web/src/builder/types.ts web/src/builder/define.ts web/src/builder/parts.ts web/src/builder/families.ts web/src/builder/render.tsx web/src/builder/runtime.tsx web/src/builder/editor/EditorBlock.tsx web/src/builder/editor/config.ts web/src/builder/editor/ExactPreview.tsx web/test/builder-parts.test.tsx web/test/helpers/fake-parts.tsx web/test/builder-editor-contract.test.ts web/test/builder-style-contract.test.tsx
git commit -m "feat(builder): container/part contract, families, card keys and slot items (stage 3 §3)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/types.ts web/src/builder/define.ts web/src/builder/parts.ts web/src/builder/families.ts web/src/builder/render.tsx web/src/builder/runtime.tsx web/src/builder/editor/EditorBlock.tsx web/src/builder/editor/config.ts web/src/builder/editor/ExactPreview.tsx web/test/builder-parts.test.tsx web/test/helpers/fake-parts.tsx web/test/builder-editor-contract.test.ts web/test/builder-style-contract.test.tsx
```

---

### Task 3: Rules — placement, per-container parts, card documents

**Depends on:** Task 2. **Wave 2.** Spec §3.4, §4.

**Files:**
- Modify: `web/src/builder/rules.ts`
- Create: `web/test/builder-parts-rules.test.ts`

**Interfaces:**
- Consumes: `FAMILY_DOC`, `PartFamily` (parts.ts), `isCardKey` (types.ts), `FAKE_BLOCKS` / `withFakeBlocks` (test helper).
- Produces:
  - `allowedOn(type, docKey)`: a part ⇔ `docKey === FAMILY_DOC[family]`; `CardTile` only on `card:tile`, `CardRow` only on `card:row` (PLACEMENT); on a card doc nothing else is allowed.
  - `EXACTLY_ONE` gains `'card:tile': ['CardTile']`, `'card:row': ['CardRow']`.
  - Rule ids (spec §4): `part-required:<Container>.<Part>`, `part-unique:<Container>.<Part>`, `part-requires:<Part>.<Needs>`, `part-placement:<Part>`, `slot-accepts:<Container>.<slot>`, `hidden-required:<Block>` (parts).
  - `export function requiredParts(type: string, layout: LayoutKind): string[]` — a container's required parts available in `layout` (editor locks, Task 13).
  - `export const FAMILY_NOUN: Record<PartFamily, string>` (`product page`, `catalogue`, `product card`, `product row`).

- [ ] **Step 1: Write the failing tests**

`web/test/builder-parts-rules.test.ts` (fake blocks; the real families add their own rule tests in Tasks 8, 10 and 11):

```ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/builder/registry.ts', async (orig) => (await import('./helpers/fake-parts.tsx')).withFakeBlocks(orig));
import { allowedOn, checkRules, requiredParts } from '@/builder/rules.ts';
import type { ComponentData, DocKey, PuckDoc } from '@/builder/types.ts';

const c = (type: string, id: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
const doc = (content: ComponentData[]): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content });
const box = (id: string, a: ComponentData[], b: ComponentData[] = [], extra: Record<string, unknown> = {}) => c('FakeBox', id, { a, b, ...extra });
const full = (id: string) => [c('FakeTitle', `${id}-t`), c('FakePrice', `${id}-p`), c('FakeAdd', `${id}-a`)];
const rules = (d: PuckDoc, key: DocKey = 'page:x', layout: 'storefront' | 'menu' = 'storefront') =>
  checkRules(d, key, layout).map((i) => i.rule).filter((r) => r.startsWith('part-') || r.startsWith('slot-accepts') || r.startsWith('hidden-required'));

describe('placement (spec §3.4)', () => {
  it('parts are allowed only on their family doc', () => {
    expect(allowedOn('FakeTitle', 'product')).toBe(true);
    for (const k of ['catalog', 'shell', 'page:x', 'card:tile', 'cart'] as DocKey[]) expect(allowedOn('FakeTitle', k), k).toBe(false);
  });
  it('card docs accept nothing but their frame and their parts', () => {
    for (const t of ['Heading', 'Section', 'RichText', 'FakeBox']) expect(allowedOn(t, 'card:tile'), t).toBe(false);
  });
  it('part-placement: a part at the root, or in a Section outside the container', () => {
    expect(rules(doc([box('b', full('b')), c('FakeNote', 'n')]), 'product')).toContain('part-placement:FakeNote');
    expect(rules(doc([box('b', full('b')), c('Section', 's', { content: [c('FakeNote', 'n')] })]), 'product')).toContain('part-placement:FakeNote');
  });
  it('content blocks may sit between a container and its parts', () => {
    const d = doc([box('b', [c('Columns', 'k', { columns: '2', col1: [c('FakeTitle', 't'), c('FakePrice', 'p')], col2: [c('FakeAdd', 'a')], col3: [], col4: [] })])]);
    expect(rules(d, 'product')).toEqual([]);
  });
});

describe('per container instance (spec §4)', () => {
  it('required: missing and doubled', () => {
    expect(rules(doc([box('b', [c('FakeTitle', 't')])]), 'product')).toContain('part-required:FakeBox.FakePrice');
    expect(rules(doc([box('b', [...full('b'), c('FakePrice', 'p2')])]), 'product')).toContain('part-required:FakeBox.FakePrice');
  });
  it('two containers are counted separately', () => {
    const d = doc([box('one', full('one')), box('two', [c('FakeTitle', 'two-t')])]);
    const found = checkRules(d, 'product', 'storefront').filter((i) => i.rule.startsWith('part-required'));
    expect(found.map((i) => [i.rule, i.blockId])).toEqual([['part-required:FakeBox.FakePrice', 'two']]);
  });
  it('a required part not available in the layout is skipped', () => {
    expect(requiredParts('FakeBox', 'menu')).toEqual(['FakeTitle', 'FakePrice']);
    expect(requiredParts('FakeBox', 'storefront')).toEqual(['FakeTitle', 'FakePrice']);
    expect(rules(doc([box('b', [c('FakeTitle', 't'), c('FakePrice', 'p')])]), 'product', 'menu')).toEqual([]);
  });
  it('unique and requires', () => {
    expect(rules(doc([box('b', full('b'), [c('FakeNote', 'n1'), c('FakeNote', 'n2')])]), 'product')).toContain('part-unique:FakeBox.FakeNote');
    expect(rules(doc([box('b', [c('FakeTitle', 't'), c('FakeAdd', 'a')])]), 'product')).toContain('part-requires:FakeAdd.FakePrice');
  });
  it('slot-accepts: a restricted slot, and route blocks / containers in any container slot', () => {
    expect(rules(doc([box('b', full('b'), [c('Heading', 'h')])]), 'product')).toContain('slot-accepts:FakeBox.b');
    expect(rules(doc([box('b', [...full('b'), c('ProductDetail', 'pd')])]), 'product')).toContain('slot-accepts:FakeBox.a');
    expect(rules(doc([box('b', [...full('b'), box('inner', full('inner'))])]), 'product')).toContain('slot-accepts:FakeBox.a');
  });
  it('a required part in a hidden Columns column is reported by part-required only', () => {
    const d = doc([box('b', [c('FakeTitle', 't'), c('FakeAdd', 'a'), c('Columns', 'k', { columns: '2', col1: [], col2: [], col3: [c('FakePrice', 'p')], col4: [] })])]);
    const found = rules(d, 'product');
    expect(found).toContain('part-required:FakeBox.FakePrice');
    expect(found.some((r) => r.startsWith('hidden-required'))).toBe(false);
    expect(found.some((r) => r.startsWith('part-placement'))).toBe(false);
  });
  it('hidden-required: a hidden block holding a required part', () => {
    const d = doc([box('b', [c('FakeTitle', 't'), c('FakeAdd', 'a'), c('Section', 's', { content: [c('FakePrice', 'p')], blockStyle: { hide: 'mobile' } })])]);
    const issue = checkRules(d, 'product', 'storefront').find((i) => i.rule === 'hidden-required:Section');
    expect(issue?.blockId).toBe('s');
    expect(issue?.message).toMatch(/holds the Price/);
  });
});
```

(`FakeBox` has no PLACEMENT entry, so these docs also raise no `placement:` issue for it — the filter keeps the assertions to this task's rules.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test -- test/builder-parts-rules.test.ts` — Expected: FAIL (`requiredParts` is not exported; no `part-*` rules).

- [ ] **Step 3: Implement in `rules.ts`**

Add imports `import { FAMILY_DOC, type PartFamily } from '@/builder/parts.ts';` and `isCardKey`. Then:

```ts
// PLACEMENT gains:
  CardTile: ['card:tile'],
  CardRow: ['card:row'],
// EXACTLY_ONE gains:
  'card:tile': ['CardTile'],
  'card:row': ['CardRow'],

export const FAMILY_NOUN: Record<PartFamily, string> = { product: 'product page', catalogue: 'catalogue', 'card-tile': 'product card', 'card-row': 'product row' };
const FAMILY_HOME: Record<PartFamily, string> = { product: 'Product detail', catalogue: 'product grid or product list', 'card-tile': 'product card', 'card-row': 'product row' };
const REQUIRES_MESSAGE: Record<string, string> = {
  'CardTileAdd.CardTilePrice': 'A product card with an add button must also show the price.',
  'CardRowAdd.CardRowPrice': 'A product row with an add button must also show the price.',
};

const inLayout = (type: string, layout: LayoutKind): boolean => {
  const def = blockDef(type);
  return !!def && (def.layouts === 'all' || def.layouts.includes(layout));
};

/** A container's required parts that exist in `layout` (spec §4: parts not available are skipped). */
export function requiredParts(type: string, layout: LayoutKind): string[] {
  return (blockDef(type)?.container?.required ?? []).filter((t) => inLayout(t, layout));
}
```

`allowedOn` (replace the body's start):

```ts
export function allowedOn(type: string, docKey: DocKey): boolean {
  const def = blockDef(type);
  if (!def) return false;
  if (def.part) return FAMILY_DOC[def.part.family] === docKey;
  const bound = own(PLACEMENT, type);
  if (bound) return bound.includes(docKey);
  // A card design repeats once per product: only its frame and its parts (spec §3.4).
  if (isCardKey(docKey)) return false;
  if (SHELL_ONLY.includes(type)) return docKey === 'shell';
  if (docKey === 'shell') return def.category === 'shell' || def.category === 'content';
  return true;
}
```

Per-container checks (new functions; call both from `checkRules` just before its hidden-required block):

```ts
/** Every part must have a container of its family as its nearest container ancestor (all slots, hidden ones too). */
function checkPartPlacement(items: readonly ComponentData[], family: PartFamily | null, docKey: DocKey, flagged: Set<string>, issues: Issue[]): void {
  for (const c of items) {
    const def = blockDef(c.type);
    if (!def) continue;
    if (def.part && def.part.family !== family && !flagged.has(`part-placement:${c.type}`)) {
      flagged.add(`part-placement:${c.type}`);
      issues.push({ docKey, rule: `part-placement:${c.type}`, message: `${label(c.type)} can only sit inside the ${FAMILY_HOME[def.part.family]}.`, blockId: c.props.id });
    }
    const next = def.container ? def.container.family : family;
    for (const s of def.slots) {
      const children = c.props[s];
      if (Array.isArray(children)) checkPartPlacement(children as ComponentData[], next, docKey, flagged, issues);
    }
  }
}

/** Spec §4 for one container instance: counts through visible slots, stopping at a nested container. */
function containerIssues(item: ComponentData, def: AnyBlock, docKey: DocKey, layout: LayoutKind): Issue[] {
  const spec = def.container!;
  const issues: Issue[] = [];
  const noun = FAMILY_NOUN[spec.family];
  const blockId = item.props.id;
  const required = new Set(requiredParts(def.name, layout));
  const counts = new Map<string, number>();
  const hiddenHolders: Array<{ holder: ComponentData; part: string }> = [];
  const visit = (items: readonly ComponentData[], hidden: ComponentData | null) => {
    for (const c of items) {
      counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
      if (hidden && required.has(c.type)) hiddenHolders.push({ holder: hidden, part: c.type });
      const d = blockDef(c.type);
      if (!d || d.container) continue;
      const nextHidden = hidden ?? (hiddenAs(d, c.props) ? c : null);
      for (const s of shownSlots(d, c.props)) {
        const children = c.props[s];
        if (Array.isArray(children)) visit(children as ComponentData[], nextHidden);
      }
    }
  };
  for (const s of shownSlots(def, item.props)) {
    const children = item.props[s];
    if (Array.isArray(children)) visit(children as ComponentData[], null);
  }
  for (const r of required) {
    const n = counts.get(r) ?? 0;
    if (n !== 1) issues.push({ docKey, rule: `part-required:${def.name}.${r}`, blockId,
      message: n === 0 ? `The ${noun} needs its ${label(r)}.` : `The ${noun} can show its ${label(r)} only once.` });
  }
  for (const u of spec.unique) {
    if (!required.has(u) && (counts.get(u) ?? 0) > 1) issues.push({ docKey, rule: `part-unique:${def.name}.${u}`, blockId, message: `The ${noun} can show its ${label(u)} only once.` });
  }
  for (const [p, needs] of spec.requires ?? []) {
    if ((counts.get(p) ?? 0) > 0 && (counts.get(needs) ?? 0) === 0) {
      issues.push({ docKey, rule: `part-requires:${p}.${needs}`, blockId, message: REQUIRES_MESSAGE[`${p}.${needs}`] ?? `${label(p)} needs the ${label(needs)} beside it.` });
    }
  }
  for (const { holder, part } of hiddenHolders) {
    const hide = hiddenAs(blockDef(holder.type)!, holder.props);
    issues.push({ docKey, rule: `hidden-required:${holder.type}`, blockId: holder.props.id,
      message: `${label(holder.type)} is hidden ${hide === 'mobile' ? 'below' : 'from'} 992 px but holds the ${label(part)}, which every shopper must see.` });
  }
  for (const s of def.slots) {
    const children = item.props[s];
    if (!Array.isArray(children)) continue;
    const only = spec.slotAccepts && Object.hasOwn(spec.slotAccepts, s) ? spec.slotAccepts[s]! : null;
    const bad = (children as ComponentData[]).find((c) => {
      if (only) return !only.includes(c.type);
      const d = blockDef(c.type);
      return !!d && (d.routeBound || !!d.container);
    });
    if (bad) {
      issues.push({ docKey, rule: `slot-accepts:${def.name}.${s}`, blockId: bad.props.id,
        message: only ? `${label(bad.type)} can't sit there: that area of the ${noun} holds only ${only.map(label).join(', ')}.` : `${label(bad.type)} can't sit inside the ${label(def.name)}.` });
    }
  }
  return issues;
}
```

In `checkRules`, after the counts block and before the doc-level hidden-required walk:

```ts
  checkPartPlacement(doc.content, null, docKey, flagged, issues);
  walk(doc.content, (c) => {
    const def = blockDef(c.type);
    if (def?.container) issues.push(...containerIssues(c, def, docKey, layout));
  });
```

(`AnyBlock` is `BlockDef<any>` — import the type from define.ts. `shownSlots` and `hiddenAs` already exist in this file.)

- [ ] **Step 4: Run tests**

Run: `npm --prefix web test -- test/builder-parts-rules.test.ts test/builder-rules.test.ts test/builder-editor-route-bound.test.ts test/builder-guard.test.ts test/builder-visible-slots.test.ts`
Expected: PASS (existing rule tests unchanged: no existing block is a part or container yet).

- [ ] **Step 5: Commit**

```bash
git add -- web/src/builder/rules.ts web/test/builder-parts-rules.test.ts
git commit -m "feat(builder): part placement and per-container part rules; card documents (stage 3 §4)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/rules.ts web/test/builder-parts-rules.test.ts
```

---

### Task 4: In-memory upgrade — `upgrade.ts`, guard, default table

**Depends on:** Task 2. **Wave 2.** Spec §8, §16.2.

**Files:**
- Create: `web/src/builder/upgrade.ts`, `web/test/builder-upgrade.test.ts`
- Modify: `web/src/builder/guard.ts`, `web/src/builder/defaults/index.ts`, `web/src/builder/defaults/helpers.ts`

**Interfaces:**
- Consumes: `blockDef` (rules.ts), `parseBlockProps` (define.ts), `ContainerSpec` (parts.ts), fake blocks.
- Produces:
  - `fillAbsentSlots(def: AnyBlock, props: Record<string, unknown>, layout: LayoutKind): Record<string, unknown>` — same object when nothing is absent.
  - `upgradeItems(items: readonly ComponentData[], layout: LayoutKind): ComponentData[]` — same array when unchanged; skips non-component entries untouched.
  - `upgradeDoc(doc: PuckDoc, docKey: DocKey, layout: LayoutKind): PuckDoc` — same object when unchanged; `content` and every `zones[*]`.
  - Guard: container slots are filled before they are cleaned. Default table: every entry is `upgradeDoc`'d per layout. `defaults/helpers.ts` `block()` leaves a container's slot keys and `legacyProps` **absent**.

- [ ] **Step 1: Write the failing tests**

`web/test/builder-upgrade.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/builder/registry.ts', async (orig) => (await import('./helpers/fake-parts.tsx')).withFakeBlocks(orig));
import { fillAbsentSlots, upgradeDoc, upgradeItems } from '@/builder/upgrade.ts';
import { validateDoc } from '@/builder/guard.ts';
import { BLOCKS } from '@/builder/registry.ts';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';

const box = (props: Record<string, unknown> = {}): ComponentData => ({ type: 'FakeBox', props: { id: 'bx', ...props } });
const doc = (content: ComponentData[]): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content });

describe('fillAbsentSlots (spec §8)', () => {
  it('fills an absent slot from defaultSlots, with derived ids', () => {
    const out = fillAbsentSlots(BLOCKS.FakeBox!, box().props, 'storefront');
    expect((out.a as ComponentData[]).map((c) => c.props.id)).toEqual(['bx-FakeTitle', 'bx-FakePrice', 'bx-FakeAdd']);
    expect((out.b as ComponentData[]).map((c) => c.type)).toEqual(['FakeNote']);
  });
  it('never touches a present slot, even []', () => {
    const props = box({ a: [], b: undefined }).props;
    const out = fillAbsentSlots(BLOCKS.FakeBox!, props, 'storefront');
    expect(out.a).toBe(props.a);
    expect(out.b).toHaveLength(1);
  });
  it('reads legacy toggles only while filling', () => {
    expect(fillAbsentSlots(BLOCKS.FakeBox!, box({ showNote: false }).props, 'storefront').b).toEqual([]);
  });
  it('returns the same object when nothing is absent, and for a non-container', () => {
    const props = box({ a: [], b: [] }).props;
    expect(fillAbsentSlots(BLOCKS.FakeBox!, props, 'storefront')).toBe(props);
    const h = { id: 'h', text: 'x' };
    expect(fillAbsentSlots(BLOCKS.Heading!, h, 'storefront')).toBe(h);
  });
});

describe('upgradeDoc', () => {
  it('is idempotent and identity-preserving', () => {
    const d = doc([box()]);
    const once = upgradeDoc(d, 'product', 'storefront');
    expect(once).not.toBe(d);
    expect(upgradeDoc(once, 'product', 'storefront')).toBe(once);
    expect(upgradeDoc(doc([{ type: 'Heading', props: { id: 'h' } }]), 'page:x', 'storefront').content).toHaveLength(1);
  });
  it('reaches a container nested in a Section and in zones', () => {
    const nested = doc([{ type: 'Section', props: { id: 's', content: [box()] } }]);
    const out = upgradeDoc({ ...nested, zones: { 'x:y': [box({ id: 'z' })] } }, 'product', 'storefront');
    expect(((out.content[0]!.props.content as ComponentData[])[0]!.props.a as unknown[]).length).toBe(3);
    expect((out.zones!['x:y']![0]!.props.a as unknown[]).length).toBe(3);
  });
  it('leaves malformed entries alone', () => {
    expect(upgradeItems([null as unknown as ComponentData, box()], 'storefront')[0]).toBeNull();
  });
});

describe('guard (spec §8: before the slots are cleaned)', () => {
  it('fills absent slots, then de-duplicates their ids like any other', () => {
    const d = doc([box(), box()]);
    const { doc: clean, issues } = validateDoc(d, 'product', 'storefront');
    expect(issues.filter((i) => !i.rule.startsWith('drop:') && !i.rule.startsWith('placement'))).toEqual([]);
    const ids = JSON.stringify(clean).match(/"id":"[^"]+"/g)!;
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('a present empty slot stays empty and trips part-required', () => {
    const { issues } = validateDoc(doc([box({ a: [], b: [] })]), 'product', 'storefront');
    expect(issues.map((i) => i.rule)).toContain('part-required:FakeBox.FakeTitle');
  });
});
```

(`FakeBox` in a product doc also raises `exactly-one:ProductDetail`; assertions filter to the rules under test. If `validateDoc` returns `doc: null` for that reason, read the de-duplication off `upgradeDoc` + `cleanItems` via a custom page key `page:x` instead — pick whichever keeps the assertion about ids; do not weaken it.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test -- test/builder-upgrade.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`web/src/builder/upgrade.ts`:

```ts
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
```

`guard.ts` — in `cleanItems`, replace the two lines building `props` and cleaning slots:

```ts
    // Spec §8: an absent container slot takes its default content BEFORE cleaning, so the filled
    // parts get the same id de-duplication, budget and checks. Never `?? []` here (Review Focus 1).
    const source = def.container ? fillAbsentSlots(def, raw.props, w.layout) : raw.props;
    const props: Record<string, unknown> = { ...source };
    for (const s of def.slots) props[s] = cleanItems(source[s], { ...w, depth: w.depth + 1 });
```

`defaults/helpers.ts` — `block()` leaves container slots and legacy props absent so the table's upgrade fills them per layout:

```ts
export function block(type: string, props: Record<string, unknown> = {}, id = `${type}-default`): ComponentData {
  const def = BLOCKS[type];
  if (!def) throw new Error(`[builder] a default document uses the unknown block "${type}"`);
  const base = structuredClone(def.defaultProps) as Record<string, unknown>;
  // A container's slots come from its defaultSlots for the entry's layout (defaults/index.ts).
  if (def.container) for (const key of [...def.slots, ...(def.container.legacyProps ?? [])]) delete base[key];
  return { type, props: { ...base, ...props, id } };
}
```

`defaults/index.ts` — in `buildDefaultTable`: `table.set(key, upgradeDoc(entry.doc, entry.docKey, layout));` (import from `@/builder/upgrade.ts`).

- [ ] **Step 4: Run tests**

Run: `npm --prefix web test -- test/builder-upgrade.test.ts test/builder-guard.test.ts test/builder-defaults-table.test.ts test/builder-defaults-complete.test.ts test/builder-catalogue.test.tsx test/golden-parity.test.tsx`
Expected: PASS (no real block is a container yet, so defaults are unchanged).

- [ ] **Step 5: Commit**

```bash
git add -- web/src/builder/upgrade.ts web/src/builder/guard.ts web/src/builder/defaults/index.ts web/src/builder/defaults/helpers.ts web/test/builder-upgrade.test.ts
git commit -m "feat(builder): in-memory upgrade of absent container slots in guard and defaults (stage 3 §8)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/upgrade.ts web/src/builder/guard.ts web/src/builder/defaults/index.ts web/src/builder/defaults/helpers.ts web/test/builder-upgrade.test.ts
```

---

### Task 5: Root attributes on shared feature components

**Depends on:** Tasks 1, 2. **Wave 2.** Spec §9 ("a shared feature component that is a part's root gains an optional `rootAttrs`").

**Files:**
- Modify: `web/src/features/catalog/AddToCart.tsx`, `ProductImage.tsx`, `Upsells.tsx`, `CategoryNav.tsx`; `web/src/layouts/SearchField.tsx`; `web/src/components/EmptyState.tsx`
- Create: `web/test/feature-root-attrs.test.tsx`

**Interfaces:**
- Produces (all optional; `undefined` adds nothing):
  - `AddToCartProps.rootAttrs?: StyleAttrs` → spread last on the `<button>`.
  - `ProductImageProps.rootAttrs?: StyleAttrs` → on the well `<span>`.
  - `UpsellsProps.rootAttrs?: StyleAttrs` → on the `<section>`.
  - `CategoryNavProps.navAttrs?: StyleAttrs` → on **both** `<nav>`s (chips and rail).
  - `SearchFieldProps.rootAttrs?: StyleAttrs` → Mantine `wrapperProps={rootAttrs}` (lands on the root wrapper, not the `<input>`).
  - `EmptyStateProps.rootAttrs?: StyleAttrs` → on the root `<div>`.

- [ ] **Step 1: Load `frontend-design:frontend-design`, then write the failing test**

`web/test/feature-root-attrs.test.tsx` (settings and use-catalog mocked exactly as in `golden-parity.test.tsx`; `state.settings = SETTINGS`):

```tsx
const ATTRS = { 'data-sf-style': 'X', 'data-sfs-bg': 'surface' } as const;
const STRIP = ' data-sf-style="X" data-sfs-bg="surface"';
function wrap(node: ReactNode) {
  return render(<MantineProvider env="test"><MemoryRouter>{node}</MemoryRouter></MantineProvider>);
}
/** Same markup with and without the attributes (once stripped), and the attributes on `selector`. */
function check(make: (attrs?: typeof ATTRS) => ReactNode, selector: string, count = 1) {
  const plain = wrap(make()).container.innerHTML;
  cleanup();
  const { container } = wrap(make(ATTRS));
  const hits = container.querySelectorAll(`${selector}[data-sf-style="X"][data-sfs-bg="surface"]`);
  expect(hits).toHaveLength(count);
  expect(container.innerHTML.replaceAll(STRIP, '')).toBe(plain);
}

describe('rootAttrs (spec §9)', () => {
  const product = baseProduct({ imageProductId: 1, upsellProductIds: [2] });
  beforeEach(() => { state.catalog = catalogOf(product, MATE); });
  it('AddToCart → the button', () => check((a) => <AddToCart product={product} rootAttrs={a} />, 'button'));
  it('ProductImage → the well span', () => check((a) => <ProductImage productId={1} alt="x" rootAttrs={a} />, 'span'));
  it('Upsells → the section', () => check((a) => <Upsells product={product} rootAttrs={a} />, 'section[aria-labelledby="upsells-heading"]'));
  it('CategoryNav → both navs', () => check((a) => <CategoryNav tree={buildCategoryTree(CATEGORIES, new Map([[2, 1]]))} total={1} activeId={null} navAttrs={a} />, 'nav', 2));
  it('SearchField → the root wrapper, never the input', () => {
    check((a) => <SearchField value="" onChange={() => {}} rootAttrs={a} />, 'div');
    expect(document.querySelector('input[data-sf-style]')).toBeNull();
  });
  it('EmptyState → its root', () => check((a) => <EmptyState title="Nothing" rootAttrs={a} />, 'div'));
});
```

(Adjust `buildCategoryTree`'s second argument to the real `categoryCounts` shape — read `category-tree.ts`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test -- test/feature-root-attrs.test.tsx` — Expected: FAIL (attributes absent).

- [ ] **Step 3: Implement**

Each component: add the prop to its props interface with the doc comment `/** A page-builder part's style attributes (stage 2), spread on the root; undefined adds nothing. */`, destructure it, spread it **last** on the named element (after `data-sf-part` / `data-variant` / `aria-*`). `StyleAttrs` is a type-only import from `@/builder/define.ts`. SearchField: `wrapperProps={rootAttrs}` on `<TextInput>`. CategoryNav: `{...navAttrs}` on both `<nav>` elements.

- [ ] **Step 4: Run tests**

Run: `npm --prefix web test -- test/feature-root-attrs.test.tsx test/golden-parity.test.tsx test/add-to-cart.test.tsx test/product-card.test.tsx test/product-grid.test.tsx test/product-list.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- web/src/features/catalog/AddToCart.tsx web/src/features/catalog/ProductImage.tsx web/src/features/catalog/Upsells.tsx web/src/features/catalog/CategoryNav.tsx web/src/layouts/SearchField.tsx web/src/components/EmptyState.tsx web/test/feature-root-attrs.test.tsx
git commit -m "feat(storefront): optional root style attributes on part-root feature components (stage 3 §9)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/features/catalog/AddToCart.tsx web/src/features/catalog/ProductImage.tsx web/src/features/catalog/Upsells.tsx web/src/features/catalog/CategoryNav.tsx web/src/layouts/SearchField.tsx web/src/components/EmptyState.tsx web/test/feature-root-attrs.test.tsx
```

---

### Task 6: Transport — `cards` through `api/pages.ts` and the editor protocol

**Depends on:** Task 2. **Wave 2.** Spec §10.3, §16.3; backend plan's cross-plan section.

**Files:**
- Modify: `web/src/api/pages.ts`, `web/src/builder/editor/protocol.ts`
- Create: `web/test/builder-transport-cards.test.ts`

**Interfaces:**
- Consumes: `CARD_KINDS`, `isCardKey` (types.ts).
- Produces:
  - `api/pages.ts`: `export function cardsOf(raw: unknown): PageSet['cards'] | undefined` — keeps only `tile` / `row` whose value is `{ content: array, … }` (a record); none left ⇒ `undefined`. `toPageSet` returns the set with `cards` cleaned, or without the key (a malformed `cards` never drops the set).
  - `protocol.ts`: `isDocKey` accepts `card:tile` / `card:row`; the load's `pageSet.cards` is read per kind (structural `docSchema.safeParse`); `pages` never takes a card key; `changeMessage` sends `cards` (each kind through `outboundDoc`) only when at least one kind is present, never `null` or `{}`.

- [ ] **Step 1: Write the failing test** (`web/test/builder-transport-cards.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { toPageSet as fromPublic } from '@/api/pages.ts';
import { changeMessage, isDocKey, parseInbound } from '@/builder/editor/protocol.ts';
import type { PageSet, PuckDoc } from '@/builder/types.ts';

const d = (id = 'CardTile-1'): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content: [{ type: 'CardTile', props: { id } }] });
const set = (extra: Record<string, unknown>) => ({ schemaVersion: 1, shell: d('s'), pages: {}, ...extra });
const THEME = /* copy the minimal valid theme object used in test/builder-editor-protocol.test.ts */ {} as never;
const load = (pageSet: unknown) => parseInbound({ type: 'sf-builder-load', protocol: 1, loadId: 'l1', layout: 'storefront', pageSet, theme: THEME, readOnly: false });

describe('public read (api/pages.ts)', () => {
  it('passes a valid cards through', () => {
    expect(fromPublic({ data: set({ cards: { tile: d(), row: d('CardRow-1') } }) })!.cards).toEqual({ tile: d(), row: d('CardRow-1') });
  });
  it.each([
    ['null', null], ['an array', [d()]], ['a string', 'x'], ['a bad kind value', { tile: 'x' }],
    ['a doc without content', { tile: { root: {} } }], ['unknown kinds only', JSON.parse('{"__proto__":{"content":[]},"grid":{"content":[]}}')],
  ])('drops %s alone, keeping the set', (_l, cards) => {
    const out = fromPublic({ data: set({ cards }) });
    expect(out).not.toBeNull();
    expect('cards' in out!).toBe(false);
  });
  it('keeps the good kind when the other is bad', () => {
    expect(fromPublic({ data: set({ cards: { tile: d(), row: 7 } }) })!.cards).toEqual({ tile: d() });
  });
});

describe('editor protocol', () => {
  it('card keys are doc keys; nothing else card-shaped is', () => {
    expect(isDocKey('card:tile') && isDocKey('card:row')).toBe(true);
    expect(isDocKey('card:grid') || isDocKey('cards')).toBe(false);
  });
  it('a load keeps valid cards, drops bad kinds, and never files a card key under pages', () => {
    const msg = load(set({ cards: { tile: d(), row: { nope: 1 }, grid: d() }, pages: { 'card:tile': d(), catalog: d('g') } }));
    expect(msg && msg.type === 'sf-builder-load' && msg.pageSet).toBeTruthy();
    const ps = (msg as { pageSet: PageSet }).pageSet;
    expect(ps.cards).toEqual({ tile: d() });
    expect(Object.keys(ps.pages)).toEqual(['catalog']);
  });
  it('a malformed cards does not drop the load', () => {
    expect(load(set({ cards: 'x' }))).not.toBeNull();
  });
  it('changeMessage sends cards only when a kind is present, never null or {}', () => {
    const base: PageSet = { schemaVersion: 1, shell: d('s'), pages: {} };
    expect('cards' in changeMessage('l', base, []).pageSet).toBe(false);
    expect('cards' in changeMessage('l', { ...base, cards: {} }, []).pageSet).toBe(false);
    expect(changeMessage('l', { ...base, cards: { row: d('CardRow-1') } }, []).pageSet.cards).toEqual({ row: d('CardRow-1') });
  });
});
```

(Replace `THEME` with the same valid theme fixture the existing protocol test uses — read `test/builder-editor-protocol.test.ts` first.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test -- test/builder-transport-cards.test.ts` — Expected: FAIL (`cards` kept raw / stripped; `isDocKey('card:tile')` false).

- [ ] **Step 3: Implement**

`api/pages.ts`:

```ts
import { CARD_KINDS, isRecord, type LayoutKind, type PageSet, type PuckDoc } from '@/builder/types.ts';

/** Product-parts §10.3: only `tile` / `row` whose value is a doc shape; a malformed `cards` is dropped alone. */
export function cardsOf(raw: unknown): PageSet['cards'] | undefined {
  if (!isRecord(raw)) return undefined;
  const out: NonNullable<PageSet['cards']> = {};
  for (const kind of CARD_KINDS) {
    const doc = Object.hasOwn(raw, kind) ? raw[kind] : undefined;
    if (isRecord(doc) && Array.isArray(doc.content)) out[kind] = doc as unknown as PuckDoc;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function toPageSet(body: unknown): PageSet | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  const set = body.data;
  if (set.schemaVersion !== 1 || !isRecord(set.shell) || !isRecord(set.pages)) return null;
  const { cards, ...rest } = set;
  const clean = cardsOf(cards);
  return { ...(rest as unknown as PageSet), ...(clean ? { cards: clean } : {}) };
}
```

`protocol.ts`:
- `isDocKey`: `return key === 'shell' || isCardKey(key) || (FIXED_ROUTE_KEYS as readonly string[]).includes(key) || CUSTOM_KEY_RE.test(key);`
- `pageSetSchema` gains `// Product-parts §10.3: without this the strict schema would strip every card design on load.` `cards: z.unknown().optional(),` (read per kind below, so a malformed `cards` never drops the load).
- `toPageSet`: pages loop condition `key !== 'shell' && isDocKey(key) && !isCardKey(key)`; then

```ts
  const cards = cardsFrom(raw.cards);
  return { schemaVersion: 1, shell: …, pages, ...(text ? { text } : {}), ...(cards ? { cards } : {}) };
```

with

```ts
function cardsFrom(raw: unknown): PageSet['cards'] | undefined {
  if (!isRecord(raw)) return undefined;
  const out: NonNullable<PageSet['cards']> = {};
  for (const kind of CARD_KINDS) {
    const parsed = Object.hasOwn(raw, kind) ? docSchema.safeParse(raw[kind]) : null;
    if (parsed?.success) out[kind] = parsed.data as unknown as PuckDoc;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
```

- `changeMessage`: after `pages`,

```ts
  const cards: NonNullable<PageSet['cards']> = {};
  for (const kind of CARD_KINDS) { const doc = pageSet.cards?.[kind]; if (doc) cards[kind] = outboundDoc(doc); }
  if (Object.keys(cards).length > 0) out.cards = cards;
```

- [ ] **Step 4: Run tests**

Run: `npm --prefix web test -- test/builder-transport-cards.test.ts test/builder-editor-protocol.test.ts test/builder-editor-protocol-text.test.ts test/builder-fetch-page-set.test.ts test/text-fetch-published.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- web/src/api/pages.ts web/src/builder/editor/protocol.ts web/test/builder-transport-cards.test.ts
git commit -m "feat(builder): carry PageSet.cards through the public read and the editor protocol (stage 3 §10.3)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/api/pages.ts web/src/builder/editor/protocol.ts web/test/builder-transport-cards.test.ts
```

---

### Task 7: Card design runtime — `compileCard`, provider, boundary, `PuckShell` mount

**Depends on:** Task 2. **Wave 2.** Spec §6.2, §6.3, §16.6.

**Files:**
- Create: `web/src/builder/cards.ts`, `web/src/builder/card-design.tsx`, `web/src/builder/page-set-context.ts`, `web/test/builder-cards.test.tsx`
- Modify: `web/src/builder/runtime.tsx` (`PuckShell` only)

**Interfaces:**
- Consumes: `validateDoc` (guard.ts), `blockDef` (rules.ts), `renderBlock` (style/apply.tsx), `CardTileFamily` / `CardRowFamily` / `CardData` (families.ts), `cardKey` (types.ts).
- Produces:
  - `cards.ts`: `interface CardDesign { kind: CardKind; element: ReactNode; render(data: CardData, views: FamilyValue<CardData>['views']): ReactNode }`; `compileCard(doc: unknown, kind: CardKind, layout: LayoutKind): CardDesign | null` (memoised per `(doc object, layout)` in a `WeakMap`).
  - `card-design.tsx`: `CardDesignProvider({ cards, layout, children })`; `useCardDesign(kind: CardKind): CardDesign | null`; `CardDesignBoundary({ kind, children })`.
  - `page-set-context.ts`: `interface PageSetContextValue { pageSet: PageSet | null; layout: LayoutKind }`; `PageSetContext`; `usePageSetContext(): PageSetContextValue | null`.
  - `PuckShell` wraps its frame in `<PageSetContext.Provider value={{ pageSet, layout }}><CardDesignProvider cards={pageSet?.cards} layout={layout}>…`.

- [ ] **Step 1: Write the failing test** (`web/test/builder-cards.test.tsx`) — fakes only (the real card parts arrive in Task 11):

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { z } from 'zod';
import { defineBlock, slot, type AnyBlock } from '@/builder/define.ts';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';

const guard = vi.hoisted(() => ({ calls: 0, fail: false }));
vi.mock('@/builder/guard.ts', () => ({ validateDoc: (doc: PuckDoc) => { guard.calls += 1; return guard.fail ? { doc: null, issues: [] } : { doc, issues: [] }; } }));
vi.mock('@/builder/registry.ts', async (orig) => {
  const real = (await orig()) as { BLOCKS: Record<string, AnyBlock> };
  const { CardTileFamily } = await import('@/builder/families.ts');
  const frame = defineBlock<{ id: string; content: ComponentData[] }>({
    name: 'TestFrame', label: 'Frame', category: 'catalogue', layouts: 'all', routeBound: true, slots: ['content'], style: false,
    schema: z.object({ content: slot() }), defaultProps: { content: [] },
    render: (p) => <CardTileFamily.PartHost name="TestFrame" props={p as Record<string, unknown>} />,
  });
  const name = defineBlock<{ id: string }>({
    name: 'TestName', label: 'Name', category: 'part', part: { family: 'card-tile' }, layouts: 'all', routeBound: false, slots: [], style: false,
    schema: z.object({}), defaultProps: {}, render: (p) => <CardTileFamily.PartHost name="TestName" props={p as Record<string, unknown>} />,
  });
  return { ...real, BLOCKS: { ...real.BLOCKS, TestFrame: frame as AnyBlock, TestName: name as AnyBlock } };
});

import { compileCard } from '@/builder/cards.ts';
import { CardDesignBoundary, CardDesignProvider, useCardDesign } from '@/builder/card-design.tsx';
import { CardTileFamily, type CardData } from '@/builder/families.ts';
import { baseProduct } from './helpers/product-fixtures.ts';

const tileDoc = (): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content: [
  { type: 'TestFrame', props: { id: 'f', content: [{ type: 'TestName', props: { id: 'n' } }] } },
] });
const VIEWS = {
  TestFrame: ({ props }: { props: Record<string, unknown> }) => <article>{(props.content as () => unknown)() as never}</article>,
  TestName: () => <h3>{CardTileFamily.useData().product.displayName}</h3>,
};
const data = (id: number, name: string): CardData => ({ product: baseProduct({ id, displayName: name }), eager: false, hasSiblingImages: true, index: 0 });

afterEach(() => { cleanup(); guard.calls = 0; guard.fail = false; });

describe('compileCard (spec §6.3)', () => {
  it('guards and compiles once per document object and layout, however many cards render', () => {
    const doc = tileDoc();
    const design = compileCard(doc, 'tile', 'storefront')!;
    for (let i = 0; i < 500; i += 1) expect(compileCard(doc, 'tile', 'storefront')).toBe(design);
    expect(guard.calls).toBe(1);
    const { container } = render(<>{Array.from({ length: 500 }, (_, i) => <div key={i}>{design.render(data(i, `P${i}`), VIEWS)}</div>)}</>);
    expect(container.querySelectorAll('article')).toHaveLength(500);
    expect(guard.calls).toBe(1);
  });
  it('each card shows its own product (shared elements, distinct providers — Review Focus 3)', () => {
    const design = compileCard(tileDoc(), 'tile', 'storefront')!;
    const { container } = render(<>{design.render(data(1, 'Oats'), VIEWS)}{design.render(data(2, 'Tin'), VIEWS)}</>);
    expect([...container.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Oats', 'Tin']);
  });
  it('a new document object compiles again; a guard failure is null', () => {
    compileCard(tileDoc(), 'tile', 'storefront');
    compileCard(tileDoc(), 'tile', 'storefront');
    expect(guard.calls).toBe(2);
    guard.fail = true;
    expect(compileCard(tileDoc(), 'tile', 'storefront')).toBeNull();
    expect(compileCard('not a doc', 'tile', 'storefront')).toBeNull();
  });
});

function Consumer({ throwing = false }: { throwing?: boolean }) {
  const design = useCardDesign('tile');
  const Boom = () => { throw new Error('boom'); };
  return design ? <>{design.render(data(1, 'Oats'), throwing ? { ...VIEWS, TestName: Boom } : VIEWS)}</> : <p>built-in</p>;
}

describe('CardDesignProvider / CardDesignBoundary', () => {
  it('no cards ⇒ no design; a card doc ⇒ its design', () => {
    expect(render(<CardDesignProvider cards={undefined} layout="storefront"><Consumer /></CardDesignProvider>).container.textContent).toBe('built-in');
    cleanup();
    expect(render(<CardDesignProvider cards={{ tile: tileDoc() }} layout="storefront"><Consumer /></CardDesignProvider>).container.textContent).toBe('Oats');
  });
  it('a design that throws falls back to built-in for every list, logged once', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <CardDesignProvider cards={{ tile: tileDoc() }} layout="storefront">
        <CardDesignBoundary kind="tile"><Consumer throwing /></CardDesignBoundary>
        <CardDesignBoundary kind="tile"><Consumer /></CardDesignBoundary>
      </CardDesignProvider>,
    );
    expect(container.textContent).toBe('built-inbuilt-in');
    expect(error.mock.calls.filter((c) => String(c[0]).includes('[builder] card design')).length).toBe(1);
    error.mockRestore();
  });
  it('useCardDesign outside a provider is null', () => {
    expect(render(<Consumer />).container.textContent).toBe('built-in');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test -- test/builder-cards.test.tsx` — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`web/src/builder/cards.ts`:

```tsx
import { createElement, Fragment, type ReactNode } from 'react';
import { validateDoc } from '@/builder/guard.ts';
import { blockDef } from '@/builder/rules.ts';
import { renderBlock } from '@/builder/style/apply.tsx';
import { CardRowFamily, CardTileFamily, type CardData } from '@/builder/families.ts';
import type { BlockRenderContext, SlotRender } from '@/builder/define.ts';
import type { FamilyValue } from '@/builder/parts.ts';
import { cardKey, isRecord, type CardKind, type ComponentData, type LayoutKind } from '@/builder/types.ts';

export interface CardDesign {
  kind: CardKind;
  /** The compiled tree: the same element objects for every card (spec §6.3). */
  element: ReactNode;
  /** One card: its own context provider around the shared elements. `views` come from the caller's chunk. */
  render(data: CardData, views: FamilyValue<CardData>['views']): ReactNode;
}

const memo = new WeakMap<object, Map<LayoutKind, CardDesign | null>>();

function staticSlot(children: ReactNode[], items: readonly ComponentData[]): SlotRender {
  const fn = (p?: Parameters<SlotRender>[0]) => {
    if (!p || (p.className === undefined && p.style === undefined && p.as === undefined)) return createElement(Fragment, null, children);
    return createElement(p.as ?? 'div', { className: p.className, style: p.style }, children);
  };
  return Object.assign(fn, { items });
}

/** Block renders are pure (the contract forbids hooks), so calling them once here is safe. */
function build(items: readonly ComponentData[], ctx: BlockRenderContext): ReactNode[] {
  return items.map((item) => {
    const def = blockDef(item.type)!;
    const props: Record<string, unknown> = { ...item.props };
    for (const s of def.slots) {
      const children = Array.isArray(item.props[s]) ? (item.props[s] as ComponentData[]) : [];
      props[s] = staticSlot(build(children, ctx), children);
    }
    return createElement(Fragment, { key: `${item.type}:${item.props.id}` }, renderBlock(def, props, ctx));
  });
}

/**
 * Spec §6.3: guard once (memoised per document object), build a static element tree once, memoise
 * per (doc object, layout). null ⇒ the built-in design. Never runs per card.
 */
export function compileCard(doc: unknown, kind: CardKind, layout: LayoutKind): CardDesign | null {
  if (!isRecord(doc)) return null;
  let perDoc = memo.get(doc);
  if (perDoc?.has(layout)) return perDoc.get(layout)!;
  const docKey = cardKey(kind);
  const { doc: clean } = validateDoc(doc, docKey, layout);
  let design: CardDesign | null = null;
  if (clean) {
    const element = build(clean.content, { editing: false, docKey, layout });
    const Family = kind === 'tile' ? CardTileFamily : CardRowFamily;
    design = { kind, element, render: (data, views) => createElement(Family.Provider, { value: { data, views } }, element) };
  }
  if (!perDoc) { perDoc = new Map(); memo.set(doc, perDoc); }
  perDoc.set(layout, design);
  return design;
}
```

`web/src/builder/page-set-context.ts`:

```ts
import { createContext, useContext } from 'react';
import type { LayoutKind, PageSet } from '@/builder/types.ts';

export interface PageSetContextValue { pageSet: PageSet | null; layout: LayoutKind }
/** Set by PuckShell: the page set on screen (published, or the editor's draft) — read by the product sheet. */
export const PageSetContext = createContext<PageSetContextValue | null>(null);
export const usePageSetContext = (): PageSetContextValue | null => useContext(PageSetContext);
```

`web/src/builder/card-design.tsx`:

```tsx
import { Component, createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { compileCard, type CardDesign } from '@/builder/cards.ts';
import type { CardKind, LayoutKind, PageSet } from '@/builder/types.ts';

interface CardDesignState { tile: CardDesign | null; row: CardDesign | null; fail(kind: CardKind): void }
const Ctx = createContext<CardDesignState | null>(null);
const logged = new Set<CardKind>();

/** Spec §6.2: the layout's card designs, compiled once; a kind that threw stays built-in for this page load. */
export function CardDesignProvider({ cards, layout, children }: { cards: PageSet['cards'] | undefined; layout: LayoutKind; children: ReactNode }) {
  const [failed, setFailed] = useState<ReadonlySet<CardKind>>(() => new Set());
  const fail = useCallback((kind: CardKind) => setFailed((s) => (s.has(kind) ? s : new Set([...s, kind]))), []);
  const tile = cards?.tile && !failed.has('tile') ? compileCard(cards.tile, 'tile', layout) : null;
  const row = cards?.row && !failed.has('row') ? compileCard(cards.row, 'row', layout) : null;
  const value = useMemo(() => ({ tile, row, fail }), [tile, row, fail]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The compiled design for `kind`, or null (no design, invalid, failed, or no provider) ⇒ built-in. */
export function useCardDesign(kind: CardKind): CardDesign | null {
  return useContext(Ctx)?.[kind] ?? null;
}

interface BoundaryProps { kind: CardKind; active: boolean; fail: (kind: CardKind) => void; children: ReactNode }
class Boundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  /** Once the provider has dropped the design, try again: the children now render the built-in card. */
  static getDerivedStateFromProps(props: BoundaryProps, state: { failed: boolean }) { return state.failed && !props.active ? { failed: false } : null; }
  componentDidCatch(error: unknown) {
    if (!logged.has(this.props.kind)) {
      logged.add(this.props.kind);
      console.error(`[builder] card design "${this.props.kind}" failed to render — showing the built-in card`, error);
    }
    this.props.fail(this.props.kind);
  }
  render() { return this.state.failed ? null : this.props.children; }
}

/** One per card list (spec §6.3). Adds no DOM. */
export function CardDesignBoundary({ kind, children }: { kind: CardKind; children: ReactNode }) {
  const state = useContext(Ctx);
  if (!state) return <>{children}</>;
  return <Boundary kind={kind} active={state[kind] !== null} fail={state.fail}>{children}</Boundary>;
}
```

(Export a test hook `resetCardDesignLog()` that clears `logged`, and call it in the test's `afterEach`.)

`runtime.tsx` `PuckShell` — around the returned `<ShellStateContext.Provider>` content:

```tsx
  const setValue = useMemo(() => ({ pageSet, layout }), [pageSet, layout]);
  …
  return (
    <PageSetContext.Provider value={setValue}>
      <CardDesignProvider cards={pageSet?.cards} layout={layout}>
        <ShellStateContext.Provider value={shellState}>…</ShellStateContext.Provider>
      </CardDesignProvider>
    </PageSetContext.Provider>
  );
```

(`useMemo` must sit above the early `isLoading` return with the other hooks.)

- [ ] **Step 4: Run tests**

Run: `npm --prefix web test -- test/builder-cards.test.tsx test/builder-runtime.test.tsx test/builder-shell.test.tsx test/builder-shell-fallback.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- web/src/builder/cards.ts web/src/builder/card-design.tsx web/src/builder/page-set-context.ts web/src/builder/runtime.tsx web/test/builder-cards.test.tsx
git commit -m "feat(builder): compile card designs once; CardDesignProvider and boundary in PuckShell (stage 3 §6)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/cards.ts web/src/builder/card-design.tsx web/src/builder/page-set-context.ts web/src/builder/runtime.tsx web/test/builder-cards.test.tsx
```

---

### Task 8: Product family — 12 parts, the `ProductDetail` container, the page surface

**Depends on:** Tasks 1, 3, 4, 5, 7. **Wave 3.** Spec §5.1 (page surface), §8 (ProductDetail legacy toggles), §9, §12, §13 (rules with real parts).

**Files:**
- Create: `web/src/builder/blocks/ProductBreadcrumbs.tsx`, `ProductGallery.tsx`, `ProductTitle.tsx`, `ProductPrice.tsx`, `ProductStock.tsx`, `ProductAddToCart.tsx`, `ProductDescription.tsx`, `ProductBulkPricing.tsx`, `ProductProvenance.tsx`, `ProductAsk.tsx`, `ProductUpsells.tsx`, `ProductGroup.tsx`; `web/src/builder/blocks/_shared/product-container.ts`; `web/src/builder/editor/fields/<same 12 names>.ts`; `web/src/features/catalog/product-parts.tsx`; `web/test/builder-product-parts.test.tsx`
- Modify: `web/src/builder/blocks/ProductDetail.tsx`, `web/src/features/catalog/ProductDetailPage.tsx`, `ProductDetailPage.module.css`, `web/src/features/catalog/Upsells.tsx` (card boundaries only)

**Interfaces:**
- Consumes: `ProductFamily`, `ProductData`, `ProductSlots`, `ProductHostContext` (families.ts); `part`, `group`, `partId`, `slotShows`, `NO_SILENT`, `PartViewProps` (parts.ts); `defaultSlotRenders` (render.tsx); `CardDesignBoundary` (card-design.tsx); `rootAttrs` props (Task 5); `SETTINGS`, `FULL`, `MATE`, `LEGACY_TOGGLES`, `toggleName`, `expectGolden` (Task 1).
- Produces:
  - `PRODUCT_CONTAINER: ContainerSpec` (`_shared/product-container.ts`) — `family: 'product'`, `required: ['ProductTitle', 'ProductPrice', 'ProductAddToCart']`, `unique:` every product part except `ProductGroup`, `legacyProps: ['gallery', 'bulkPricing', 'provenance', 'upsells']`, `insertSlot: 'main'`, `defaultSlots` (Step 3).
  - `ProductDetail` block: slots `top`, `media`, `main`, `below`; render → `ProductDetailBody` (host ⇒ `host.SheetBody`, else the lazy `ProductDetailPage`).
  - `ProductDetailPage({ sections?, slots? })` — the page-surface container (the no-`slots` form draws the default arrangement from `sections`, exactly v0.7.0).
  - `product-parts.tsx`: `productData(product: Product, categories: Category[], onSelect?: (p: Product) => void): ProductData`; `BreadcrumbsView`; `groupClassMap(fade: string): Record<'priceRow' | 'identity' | 'identityText', string>`; `makeGroupView(classOf: Record<string, string>): ComponentType<PartViewProps>`.
  - `PAGE_VIEWS: FamilyValue<ProductData>['views']` (ProductDetailPage.tsx).

- [ ] **Step 1: Load `frontend-design:frontend-design`; write the failing tests**

`web/test/builder-product-parts.test.tsx` — mocks as in `golden-parity.test.tsx` (settings, use-catalog, `useCoreOptions`), plus a render helper:

```tsx
function renderDoc(doc: PuckDoc, path = '/p/1') {
  return render(
    <QueryClientProvider client={new QueryClient()}><MantineProvider env="test"><MemoryRouter initialEntries={[path]}><Routes>
      <Route path="/p/:id" element={<Suspense fallback={null}><RenderDoc doc={doc} docKey="product" layout="storefront" /></Suspense>} />
    </Routes></MemoryRouter></MantineProvider></QueryClientProvider>,
  );
}
const legacyDoc = (t: Record<string, boolean>): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } },
  content: [{ type: 'ProductDetail', props: { id: 'ProductDetail-default', ...t, sku: 'inherit' } }] });
```

Cases (each a separate `it`):
1. **Golden legacy (spec §12):** for every `LEGACY_TOGGLES` × photo: `validateDoc(legacyDoc(t), 'product', 'storefront').doc` rendered through `renderDoc`, `await screen.findByRole('heading', { level: 1 })`, then `expectGolden(toggleName(t, photo), container.innerHTML)`.
2. **Default doc = golden:** `defaultDoc('product', 'storefront')` renders `product-legacy-g1b1p1u1-photo`.
3. **Defaults pass their own rules:** `checkRules(defaultDoc('product', l)!, 'product', l)` is `[]` for all three layouts; the menu default holds no `ProductAddToCart` and no `ProductBreadcrumbs`.
4. **Rules with real parts:** remove `ProductAddToCart` from the storefront default's `main` → `part-required:ProductDetail.ProductAddToCart`; a second `ProductPrice` in `main` → `part-required:ProductDetail.ProductPrice`; a second `ProductDescription` → `part-unique:ProductDetail.ProductDescription`; a `Section` with `blockStyle: { hide: 'mobile' }` holding the `ProductPrice` inside `main` → `hidden-required:Section`; the price moved into a `Columns` (2 columns) `col3` → `part-required:ProductDetail.ProductPrice` and no `hidden-required`; a `ProductPrice` at the document root → `part-placement:ProductPrice`; a menu document holding a `ProductAddToCart` → the guard reports `drop:layout` and the doc still renders.
5. **Arrangement:** a doc whose `main` is `[Description, Title, Group(priceRow)[Price, Stock], AddToCart, RichText('<p>Between</p>'), BulkPricing]` and `below: []` renders `.description` before the `h1`, the RichText text between the add button and `#bulk-heading`, and no `#upsells-heading`.
6. **Media column follows the slot (spec §5.1):** `media: [RichText]` with a photo-less product → a `.media` div exists and `.layout` lacks `layoutNoImage`; `media: [ProductGallery]` with a photo-less product → no `.media`, `layoutNoImage` present.
7. **Style per part:** `ProductPrice` with `blockStyle: { fg: 'primary', textSize: 'lg' }` → `p[data-sf-part="price"][data-sf-style="ProductPrice"][data-sfs-fg="primary"][data-sfs-text="lg"]`; `ProductGallery` with `{ hide: 'mobile' }` → the well `span` carries `data-sfs-hide="mobile"`; `ProductAddToCart` with `{ padTop: 'sm' }` → on the `button`; `ProductStock` with `{ bg: 'surface' }` → on `.flags`. `ProductTitle`, `ProductPrice`, `ProductAddToCart` `style.keys` exclude `hide`.
8. **No-argument entry point still v0.7.0:** `golden-parity.test.tsx` stays green (run it; do not edit it).

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test -- test/builder-product-parts.test.tsx` — Expected: FAIL (unknown blocks / no slots).

- [ ] **Step 3: Container spec and part blocks**

`web/src/builder/blocks/_shared/product-container.ts`:

```ts
import { group, part, type ContainerSpec } from '@/builder/parts.ts';
import type { ComponentData } from '@/builder/types.ts';

const PARTS = ['ProductBreadcrumbs', 'ProductGallery', 'ProductTitle', 'ProductPrice', 'ProductStock', 'ProductAddToCart',
  'ProductDescription', 'ProductBulkPricing', 'ProductProvenance', 'ProductAsk', 'ProductUpsells'] as const;

/** Spec §5.1 default arrangement; the storefront one honours the v0.7.0 toggles (§8), the sheet ignores them. */
function defaultSlots(props: Record<string, unknown>, { layout, id }: { layout: string; id: string }): Record<string, ComponentData[]> {
  const p = (type: string) => part(type, id);
  const g = (kind: string, items: ComponentData[]) => group('ProductGroup', id, kind, items);
  if (layout !== 'storefront') {
    return {
      top: [], media: [],
      main: [g('identity', [g('identityText', [p('ProductTitle'), p('ProductStock')]), p('ProductGallery')]),
        p('ProductPrice'), p('ProductDescription'), p('ProductBulkPricing'), p('ProductProvenance'), p('ProductAsk')],
      below: [p('ProductUpsells')],
    };
  }
  const on = (k: string) => props[k] !== false;
  return {
    top: [p('ProductBreadcrumbs')],
    media: on('gallery') ? [p('ProductGallery')] : [],
    main: [p('ProductTitle'), g('priceRow', [p('ProductPrice'), p('ProductStock')]), p('ProductAddToCart'), p('ProductDescription'),
      ...(on('bulkPricing') ? [p('ProductBulkPricing')] : []), ...(on('provenance') ? [p('ProductProvenance')] : []), p('ProductAsk')],
    below: on('upsells') ? [p('ProductUpsells')] : [],
  };
}

export const PRODUCT_CONTAINER: ContainerSpec = {
  family: 'product',
  defaultSlots,
  required: ['ProductTitle', 'ProductPrice', 'ProductAddToCart'],
  // ProductGroup is a wrapper: the sheet's default uses two (spec §5.1), so groups are not unique.
  unique: PARTS,
  legacyProps: ['gallery', 'bulkPricing', 'provenance', 'upsells'],
  insertSlot: 'main',
};
```

Every product part block file follows this template exactly (name, label, layouts, style and text from the table below):

```tsx
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ProductFamily } from '@/builder/families.ts';
import { BOX, styleSupport, TEXT, VIS } from '@/builder/style/model.ts';

/** <one line: what it renders, from spec §5.1> */
export const block = defineBlock<{ id: string }>({
  name: 'ProductPrice', label: 'Price', category: 'part', part: { family: 'product' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['product.sheet.unit'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ProductFamily.PartHost name="ProductPrice" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
```

| Block | label | layouts | style (`styleSupport('root', …)`) | text |
|---|---|---|---|---|
| `ProductBreadcrumbs` | Breadcrumbs | all | BOX, TEXT, VIS | `product.detail.breadcrumb`, `product.detail.shop` |
| `ProductGallery` | Photo | all | BOX, VIS | — (omit `text`) |
| `ProductTitle` | Title | all | BOX, TEXT | — |
| `ProductPrice` | Price | all | BOX, TEXT | `product.sheet.unit` |
| `ProductStock` | Stock and limits | all | BOX, TEXT, VIS | `product.stock.*`, `product.detail.preorderShips`, `product.sheet.ships`, `common.product.preorder`, `product.limit.min` |
| `ProductAddToCart` | Add to cart button | `['storefront']` | BOX | `product.add.*`, `common.product.*` |
| `ProductDescription` | Description | all | BOX, TEXT, VIS | `product.sheet.description` |
| `ProductBulkPricing` | Bulk pricing | all | BOX, TEXT, VIS | `product.bulk.*` |
| `ProductProvenance` | Provenance | all | BOX, TEXT, VIS | `product.provenance.*` |
| `ProductAsk` | Ask a question | all | BOX, TEXT, VIS | `product.ask.*`, `common.contact.*` |
| `ProductUpsells` | Goes with | all | BOX, VIS | `product.upsells.*`, `...PRODUCT_CARD_TEXT` |

`ProductGroup` differs (a slot and a `kind`):

```tsx
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { ProductFamily } from '@/builder/families.ts';
import { BOX, styleSupport, VIS } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

/** A wrapper the two surfaces use: side by side (price row), text beside thumbnail, text column. */
export const block = defineBlock<{ id: string; kind: 'priceRow' | 'identity' | 'identityText'; items: ComponentData[] }>({
  name: 'ProductGroup', label: 'Group', category: 'part', part: { family: 'product' }, layouts: 'all', routeBound: false, slots: ['items'],
  style: styleSupport('root', [...BOX, 'align', ...VIS]),
  schema: z.object({ kind: z.enum(['priceRow', 'identity', 'identityText']), items: slot() }),
  defaultProps: { kind: 'priceRow', items: [] },
  render: (p) => <ProductFamily.PartHost name="ProductGroup" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
```

Fields: `web/src/builder/editor/fields/<Name>.ts` = `export const fields = blockFields('<Name>');` for each, except `ProductGroup.ts`:

```ts
import { blockFields } from '@/builder/editor/derive-fields.ts';

/** ProductGroup: the kind names what the wrapper looks like, not its CSS class. */
export const fields = blockFields('ProductGroup', {
  kind: { type: 'radio', label: 'Arrangement', options: [
    { label: 'Side by side', value: 'priceRow' }, { label: 'Text beside thumbnail', value: 'identity' }, { label: 'Text column', value: 'identityText' },
  ] },
});
```

`web/src/builder/blocks/ProductDetail.tsx`:

```tsx
import { lazy, useContext } from 'react';
import { z } from 'zod';
import { boolOverride, compactScope, defineBlock, override, slot, type Override } from '@/builder/define.ts';
import { CoreOptionsScope } from '@/builder/blocks/_shared/CoreOptionsScope.tsx';
import { PRODUCT_CONTAINER } from '@/builder/blocks/_shared/product-container.ts';
import { ProductHostContext, type ProductSlots } from '@/builder/families.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

const ProductDetailPage = lazy(() => import('@/features/catalog/ProductDetailPage.tsx').then((m) => ({ default: m.ProductDetailPage })));

type Props = {
  id: string; top: ComponentData[]; media: ComponentData[]; main: ComponentData[]; below: ComponentData[];
  /** Legacy (v0.7.0) toggles: read only while the slots are absent (spec §8). */
  gallery: boolean; bulkPricing: boolean; provenance: boolean; upsells: boolean; sku: Override;
};

/** Inside the menu / web-app sheet the host draws the sheet surface; elsewhere the page (spec §7.2). */
function ProductDetailBody({ slots }: { slots: ProductSlots }) {
  const host = useContext(ProductHostContext);
  return host ? <host.SheetBody slots={slots} /> : <ProductDetailPage slots={slots} />;
}

/** The product page (storefront) or the product sheet's body (menu, web app): a container of product parts. */
export const block = defineBlock<Props>({
  name: 'ProductDetail', label: 'Product detail', category: 'product', layouts: 'all', routeBound: true,
  slots: ['top', 'media', 'main', 'below'],
  style: styleSupport('wrap', [...BOX]),
  text: ['product.detail.product', 'product.detail.notFoundTitle', 'product.detail.notFoundDetail', 'product.detail.browse',
    'product.sheet.loadFailed', 'common.actions.tryAgain', 'common.status.loading'],
  container: PRODUCT_CONTAINER,
  schema: z.object({ top: slot(), media: slot(), main: slot(), below: slot(),
    gallery: z.boolean(), bulkPricing: z.boolean(), provenance: z.boolean(), upsells: z.boolean(), sku: override() }),
  defaultProps: { top: [], media: [], main: [], below: [], gallery: true, bulkPricing: true, provenance: true, upsells: true, sku: 'inherit' },
  render: ({ top, media, main, below, sku }) => (
    <CoreOptionsScope value={compactScope({ showSku: boolOverride(sku) })}>
      <ProductDetailBody slots={{ top, media, main, below }} />
    </CoreOptionsScope>
  ),
});
```

- [ ] **Step 4: Views and the page-surface container**

`web/src/features/catalog/product-parts.tsx`:

```tsx
import type { ComponentType } from 'react';
import { Link } from 'react-router';
import { categoryPath } from '@/features/catalog/CategoryNav.tsx';
import { ancestorChain } from '@/features/catalog/category-tree.ts';
import { ProductFamily, type ProductData } from '@/builder/families.ts';
import type { PartViewProps } from '@/builder/parts.ts';
import type { SlotRender } from '@/builder/define.ts';
import type { Category, Product } from '@/types/catalog.ts';
import { useText } from '@/text/runtime.tsx';
import pageClasses from '@/features/catalog/ProductDetailPage.module.css';
import sheetClasses from '@/features/catalog/ProductDetailSheet.module.css';

/** The container's data: the product and its category trail (the catalogue may not carry the category yet). */
export function productData(product: Product, categories: Category[], onSelect?: (p: Product) => void): ProductData {
  const trail = ancestorChain(categories, product.categoryId);
  // Before the catalogue arrives (or for a category it doesn't carry) fall back to
  // the flattened path the product itself came with, as plain text.
  const fallbackTrail = trail.length === 0 && product.categoryName ? product.categoryName.split('>').map((s) => s.trim()) : [];
  return onSelect ? { product, trail, fallbackTrail, onSelect } : { product, trail, fallbackTrail };
}

/** ProductBreadcrumbs — the same nav on both surfaces (spec §5.1). */
export function BreadcrumbsView({ styleAttrs }: PartViewProps) {
  const { trail, fallbackTrail } = ProductFamily.useData();
  const { t } = useText();
  return (
    <nav className={pageClasses.crumbs} aria-label={t('product.detail.breadcrumb')} {...styleAttrs}>
      <Link to="/" className={pageClasses.crumb}>
        {t('product.detail.shop')}
      </Link>
      {trail.map((step) => (
        <span key={step.id} className={pageClasses.step}>
          <span className={pageClasses.slash} aria-hidden>
            /
          </span>
          <Link to={categoryPath(step)} className={pageClasses.crumb}>
            {step.name}
          </Link>
        </span>
      ))}
      {fallbackTrail.map((name) => (
        <span key={name} className={pageClasses.step}>
          <span className={pageClasses.slash} aria-hidden>
            /
          </span>
          <span className={pageClasses.crumb}>{name}</span>
        </span>
      ))}
    </nav>
  );
}

/** The three group wrappers, the same on both surfaces (spec §5.1). `fade` is lib/motion's FADE. */
export function groupClassMap(fade: string): Record<'priceRow' | 'identity' | 'identityText', string> {
  return { priceRow: pageClasses.priceRow, identity: `${sheetClasses.identity} ${fade}`, identityText: sheetClasses.identityText };
}

export function makeGroupView(classOf: Record<string, string>): ComponentType<PartViewProps> {
  return function ProductGroupView({ props, styleAttrs }: PartViewProps) {
    const kind = typeof props.kind === 'string' && Object.hasOwn(classOf, props.kind) ? props.kind : 'priceRow';
    return <div className={classOf[kind]} {...styleAttrs}>{(props.items as SlotRender)()}</div>;
  };
}
```

`web/src/features/catalog/ProductDetailPage.tsx` — replace the component with the container and page views (keep `ProductDetailSections`, `ALL_SECTIONS`, `NotFound` unchanged). Every view body is the v0.7.0 JSX for that piece, with `{...styleAttrs}` (or `rootAttrs={styleAttrs}`) added last on its root element:

```tsx
const GroupView = makeGroupView(groupClassMap(FADE));
const GALLERY_SILENT: ReadonlySet<string> = new Set(['ProductGallery']);

function PageGallery({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  if (product.imageProductId === null) return null;
  return <ProductImage productId={product.imageProductId} variant="web" alt={product.displayName} eager rootAttrs={styleAttrs} />;
}

function PageTitle({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { showSku } = useCoreOptions();
  return (
    <header className={classes.head} {...styleAttrs}>
      <h1 className={classes.name} data-sf-part="page-title">{product.displayName}</h1>
      {showSku ? <p className={classes.sku}>{product.sku}</p> : null}
    </header>
  );
}

function PagePrice({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { currency } = useSettings();
  return <p className={classes.price} data-sf-part="price" {...styleAttrs}>{formatMoney(product.price, currency)}</p>;
}

function PageStock({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { t } = useText();
  const status = deriveStockStatus(product.inStock, product.lowStockAlert);
  const eta = product.isPreorder && product.preorderEta ? formatDate(new Date(product.preorderEta).toISOString()) : '';
  return (
    <div className={classes.flags} {...styleAttrs}>
      <StockChip status={status} />
      {product.isPreorder ? (
        <span className={classes.preorder}>{eta ? t('product.detail.preorderShips', { eta }) : t('common.product.preorder')}</span>
      ) : null}
      {product.minOrderQuantity != null ? (
        <span className={classes.limit}>{t('product.limit.min', { min: product.minOrderQuantity })}</span>
      ) : null}
    </div>
  );
}

function PageAddToCart({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  return <AddToCart product={product} size="lg" rootAttrs={styleAttrs} />;
}

function PageDescription({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  return product.description ? <p className={classes.description} {...styleAttrs}>{product.description}</p> : null;
}

function PageBulkPricing({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { t } = useText();
  if (product.pricingTiers.length === 0) return null;
  return (
    <section className={classes.section} aria-labelledby="bulk-heading" {...styleAttrs}>
      <h2 id="bulk-heading" className={classes.sectionHead}>
        {t('product.bulk.heading')}
      </h2>
      <BulkPricing tiers={product.pricingTiers} price={product.price} />
    </section>
  );
}

function PageProvenance({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { t } = useText();
  if (!product.provenance) return null;
  return (
    <section className={classes.section} aria-labelledby="provenance-heading" {...styleAttrs}>
      <h2 id="provenance-heading" className={classes.sectionHead}>
        {t('product.provenance.heading')}
      </h2>
      <Provenance markdown={product.provenance} />
    </section>
  );
}

function PageAsk({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { brand } = useSettings();
  const { t } = useText();
  if (!(brand.links.whatsapp || brand.links.telegram)) return null;
  return (
    <section className={classes.ask} aria-labelledby="ask-heading" {...styleAttrs}>
      <h2 id="ask-heading" className={classes.sectionHead}>
        {t('product.ask.heading')}
      </h2>
      <p className={classes.askText}>
        {t('product.ask.text', { name: product.displayName })}
      </p>
      <ContactLinks prefill={t('product.ask.prefill', { name: product.displayName, sku: product.sku })} />
    </section>
  );
}

function PageUpsells({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  return <Upsells product={product} rootAttrs={styleAttrs} />;
}

export const PAGE_VIEWS: FamilyValue<ProductData>['views'] = {
  ProductBreadcrumbs: BreadcrumbsView, ProductGallery: PageGallery, ProductTitle: PageTitle, ProductPrice: PagePrice,
  ProductStock: PageStock, ProductAddToCart: PageAddToCart, ProductDescription: PageDescription,
  ProductBulkPricing: PageBulkPricing, ProductProvenance: PageProvenance, ProductAsk: PageAsk,
  ProductUpsells: PageUpsells, ProductGroup: GroupView,
};

/**
 * The product page — the ProductDetail container's page surface (spec §5.1). `slots` come from the
 * block; without them (tests, v0.7.0 call sites) the default arrangement is drawn from `sections`.
 */
export function ProductDetailPage({ sections, slots }: { sections?: Partial<ProductDetailSections>; slots?: ProductSlots }) {
  const gallery = sections?.gallery; const bulkPricing = sections?.bulkPricing;
  const provenance = sections?.provenance; const upsells = sections?.upsells;
  const legacy = useMemo(
    () => (slots ? null : (defaultSlotRenders('ProductDetail', 'storefront', { ...ALL_SECTIONS, ...compact({ gallery, bulkPricing, provenance, upsells }) }) as unknown as ProductSlots)),
    [slots, gallery, bulkPricing, provenance, upsells],
  );
  const s = slots ?? legacy!;
  const { brand } = useSettings();
  const { id } = useParams();
  const productId = Number(id);
  const query = useProduct(productId);
  const catalog = useCatalog();
  const product = query.data;
  const data = useMemo(() => (product ? productData(product, catalog.data?.categories ?? []) : null), [product, catalog.data]);

  // (keep the v0.7.0 document.title effect and its comment verbatim)

  if (Number.isNaN(productId)) return <NotFound />;
  if (query.isPending) return <PageSkeleton inline />;
  if (query.isError || !product || !data) return <NotFound retry={() => void query.refetch()} />;

  // Today's hasImage rule, read from the slot: no media column when nothing in it would render.
  const mediaShows = slotShows(s.media.items, product.imageProductId === null ? GALLERY_SILENT : NO_SILENT);
  return (
    <ProductFamily.Provider value={{ data, views: PAGE_VIEWS }}>
      <article className={`${classes.page} ${FADE}`}>
        {s.top()}
        <div className={mediaShows ? classes.layout : `${classes.layout} ${classes.layoutNoImage}`}>
          {mediaShows ? s.media({ className: classes.media }) : null}
          {s.main({ className: classes.detail })}
        </div>
        {s.below()}
      </article>
    </ProductFamily.Provider>
  );
}
```

(`compact` drops `undefined` values so `ALL_SECTIONS` defaults survive: `const compact = (o: Record<string, boolean | undefined>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));`. Remove imports that became unused — `ancestorChain`, `categoryPath`, `Link` stays for `NotFound`.)

`Upsells.tsx`: wrap the rows `<ul>` in `<CardDesignBoundary kind="row">` and the cards `<div className={classes.row}>` in `<CardDesignBoundary kind="tile">` (import from `@/builder/card-design.tsx`; the boundary adds no DOM).

`ProductDetailPage.module.css` — TEXT support (spec §9: computes to today's values when unset). Change exactly these declarations:
- `.crumbs` `font-size: 10px` → `calc(10px * var(--sf-text-scale, 1))`; `.crumb` `color: var(--sf-faint)` → `var(--sf-block-fg, var(--sf-faint))`.
- `.name` `font-size: 1.5rem` → `calc(1.5rem * var(--sf-text-scale, 1))`; `color: var(--sf-text)` → `var(--sf-block-fg, var(--sf-text))`.
- `.sku`: size `calc(10px * …)`, colour `var(--sf-block-fg, var(--sf-faint))`.
- `.price`: `calc(1.75rem * …)`, `var(--sf-block-fg, var(--sf-text))`.
- `.preorder`, `.limit`: size `calc(10px * …)`; colours `var(--sf-block-fg, var(--sf-primary))` / `var(--sf-block-fg, var(--sf-muted))`.
- `.description`: `calc(0.9375rem * …)`, `var(--sf-block-fg, var(--sf-muted))`.
- `.sectionHead`: `calc(10px * …)`, `var(--sf-block-fg, var(--sf-faint))`; `.askText`: `calc(0.875rem * …)`, `var(--sf-block-fg, var(--sf-muted))`.

- [ ] **Step 5: Run the tests**

Run: `npm --prefix web test -- test/builder-product-parts.test.tsx test/golden-parity.test.tsx test/product-detail-page.test.tsx test/product-detail-sku.test.tsx test/builder-routes.test.tsx test/builder-defaults-complete.test.ts test/builder-editor-fields.test.ts test/text-registry.test.ts test/templates-parts.test.ts test/motion-usage.test.ts test/builder-style-contract.test.tsx`
Expected: PASS (`blocks-manifest.test.ts` is known red until Task 12). Then `npm --prefix web run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add -- web/src/builder/blocks/ProductBreadcrumbs.tsx web/src/builder/blocks/ProductGallery.tsx web/src/builder/blocks/ProductTitle.tsx web/src/builder/blocks/ProductPrice.tsx web/src/builder/blocks/ProductStock.tsx web/src/builder/blocks/ProductAddToCart.tsx web/src/builder/blocks/ProductDescription.tsx web/src/builder/blocks/ProductBulkPricing.tsx web/src/builder/blocks/ProductProvenance.tsx web/src/builder/blocks/ProductAsk.tsx web/src/builder/blocks/ProductUpsells.tsx web/src/builder/blocks/ProductGroup.tsx web/src/builder/blocks/_shared/product-container.ts web/src/builder/blocks/ProductDetail.tsx web/src/builder/editor/fields/ProductBreadcrumbs.ts web/src/builder/editor/fields/ProductGallery.ts web/src/builder/editor/fields/ProductTitle.ts web/src/builder/editor/fields/ProductPrice.ts web/src/builder/editor/fields/ProductStock.ts web/src/builder/editor/fields/ProductAddToCart.ts web/src/builder/editor/fields/ProductDescription.ts web/src/builder/editor/fields/ProductBulkPricing.ts web/src/builder/editor/fields/ProductProvenance.ts web/src/builder/editor/fields/ProductAsk.ts web/src/builder/editor/fields/ProductUpsells.ts web/src/builder/editor/fields/ProductGroup.ts web/src/features/catalog/product-parts.tsx web/src/features/catalog/ProductDetailPage.tsx web/src/features/catalog/ProductDetailPage.module.css web/src/features/catalog/Upsells.tsx web/test/builder-product-parts.test.tsx
git commit -m "feat(storefront): product page as a container of 12 parts, default arrangement = v0.7.0 (stage 3 §5.1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- <the same paths>
```

---

### Task 9: The menu / web-app product sheet renders the layout's `product` document

**Depends on:** Task 8. **Wave 3** (starts when Task 8 commits). Spec §5.1 (sheet surface), §7.2, §7.3, §16.7.

**Files:**
- Modify: `web/src/features/catalog/ProductDetailSheet.tsx`, `ProductDetailSheet.module.css`
- Create: `web/test/builder-product-sheet.test.tsx`

**Interfaces:**
- Consumes: `ProductHostContext`, `ProductHost`, `ProductSlots`, `ProductFamily` (families.ts); `usePageSetContext` (Task 7); `validateDoc`, `defaultDoc`, `RenderDoc`, `DocBoundary`; `productData`, `BreadcrumbsView`, `groupClassMap`, `makeGroupView` (Task 8).
- Produces: `ProductDetailSheet({ productId, onClose, onSelect })` — props unchanged; `ProductSheetBody({ slots }: { slots: ProductSlots })` (the sheet surface, used as `ProductHost.SheetBody`); `SHEET_VIEWS`; `SheetLoading` (exported for the editor's sheet stage).

- [ ] **Step 1: Load `frontend-design:frontend-design`; write the failing test**

`web/test/builder-product-sheet.test.tsx` (mocks as in `golden-parity.test.tsx`; render inside `<PageSetContext.Provider value={{ pageSet, layout: 'menu' }}>` where a case needs a published set):
1. With no `PageSetContext` the sheet body equals `product-sheet-full` / `product-sheet-plain-nosku` (`expectGolden`), rendered **synchronously** — assert right after `render()` without `await` that `getByRole('heading', { level: 2, name: FULL.displayName })` exists (the product-detail-sku test does exactly this).
2. A published menu `product` doc with `main: [ProductBulkPricing, Group(identity)[Group(identityText)[Title, Stock], Gallery], Price, Description, Provenance, Ask]` → inside `.body`, `h3` "Bulk pricing" precedes `[data-sf-part="sheet-title"]`; the footer still holds the add button (`[data-sf-part="sheet"] button[data-variant="filled"]` inside the footer element).
3. Root content blocks of the menu product doc render in the sheet body around the container (a `Heading` before `ProductDetail` shows before the title).
4. A published doc that breaks a rule (no `ProductPrice`) → the default sheet body (golden `product-sheet-full`).
5. **Review Focus 4 — one owner of the tab title:** `document.title = 'Shop'`; open the sheet on product 1 → `"Trail Oats 1kg — Northbound Supply"`; rerender with productId 2 → `"Trail Tin — Northbound Supply"`; rerender with `productId={null}` → `'Northbound Supply'` (brand.title); a `vi.spyOn(document, 'title', 'set')` records exactly one write per change (never a second write from the container).
6. In the storefront layout (`PageSetContext` layout `storefront`) the sheet ignores the storefront `product` document (a page doc with breadcrumbs does **not** add `.crumbs` to the sheet).

Case 5 in code (the others follow the same mount helper):

```tsx
it('one owner of the tab title (Review Focus 4)', () => {
  state.settings = { ...SETTINGS, features: { ...SETTINGS.features, layout: 'menu' } } as StorefrontSettings;
  state.catalog = catalogOf(FULL, MATE);
  document.title = 'Shop';
  const writes: string[] = [];
  const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'title')!;
  const spy = vi.spyOn(document, 'title', 'set').mockImplementation((v: string) => { writes.push(v); desc.set!.call(document, v); });
  const sheet = (id: number | null) => <ProductDetailSheet productId={id} onClose={() => {}} onSelect={() => {}} />;
  const { rerender } = shell('/', '/', sheet(1));
  expect(document.title).toBe('Trail Oats 1kg — Northbound Supply');
  expect(writes).toEqual(['Trail Oats 1kg — Northbound Supply']);
  rerender(wrapShell(sheet(2)));
  expect(document.title).toBe('Trail Tin — Northbound Supply');
  rerender(wrapShell(sheet(null)));
  expect(document.title).toBe('Northbound Supply');
  // cleanup + new title per change, never a second writer (the container's sheet surface sets none)
  expect(writes).toEqual(['Trail Oats 1kg — Northbound Supply', 'Northbound Supply', 'Trail Tin — Northbound Supply', 'Northbound Supply']);
  spy.mockRestore();
});
```

(`wrapShell(node)` returns the same provider tree `shell()` renders, for `rerender`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test -- test/builder-product-sheet.test.tsx` — Expected: FAIL (cases 2, 3, 5-spy, 6).

- [ ] **Step 3: Implement**

Keep `categoryTrail`, `ProductDetailSheetProps`, the header / footer / `Sheet` chrome and the title effect exactly as today. Replace the body and `Detail`:

```tsx
export function ProductDetailSheet({ productId, onClose, onSelect }: ProductDetailSheetProps) {
  // … unchanged: brand, t, query, catalog, product, opened, trail, the document.title effect …
  const host = useMemo<ProductHost>(() => ({ productId, onSelect, surface: 'sheet', SheetBody: ProductSheetBody }), [productId, onSelect]);
  return (
    <Sheet /* … unchanged props, header and footer … */>
      <div className={classes.body}>
        <ProductHostContext.Provider value={host}>
          <SheetDocument />
        </ProductHostContext.Provider>
      </div>
    </Sheet>
  );
}

/**
 * The layout's `product` document drives the sheet body (spec §7.2); guarded, else the built-in one.
 * The storefront layout's product document is a page, so a list placed there keeps the built-in sheet.
 */
function SheetDocument() {
  const ctx = usePageSetContext();
  const layout = ctx?.layout ?? 'menu';
  const docLayout: LayoutKind = layout === 'storefront' ? 'menu' : layout;
  const fallback = defaultDoc('product', docLayout)!;
  const stored = layout === 'storefront' ? undefined : ctx?.pageSet?.pages.product;
  const guarded = stored ? validateDoc(stored, 'product', docLayout).doc : null;
  if (!guarded) return <RenderDoc doc={fallback} docKey="product" layout={docLayout} />;
  return (
    <DocBoundary docKey="product" fallback={<RenderDoc doc={fallback} docKey="product" layout={docLayout} />}>
      <RenderDoc doc={guarded} docKey="product" layout={docLayout} />
    </DocBoundary>
  );
}

/** The ProductDetail container's sheet surface: today's loading / failed states, then the parts. Never sets the title. */
export function ProductSheetBody({ slots }: { slots: ProductSlots }) {
  const host = useContext(ProductHostContext)!;
  const { t } = useText();
  const query = useProduct(host.productId);
  const catalog = useCatalog();
  const product = query.data;
  const data = useMemo(() => (product ? productData(product, catalog.data?.categories ?? [], host.onSelect) : null), [product, catalog.data, host.onSelect]);
  return (
    <>
      {query.isPending ? <SheetLoading /> : null}
      {query.isError ? (
        <div className={classes.failed}>
          <p className={classes.failedText}>{t('product.sheet.loadFailed')}</p>
          <Button variant="default" size="sm" onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        </div>
      ) : null}
      {data ? (
        <ProductFamily.Provider value={{ data, views: SHEET_VIEWS }}>
          {slots.top()}{slots.media()}{slots.main()}{slots.below()}
        </ProductFamily.Provider>
      ) : null}
    </>
  );
}
```

Sheet views (v0.7.0 `Detail` JSX split per part; `Block` gains `attrs`):

```tsx
function Block({ label, attrs, children }: { label: string; attrs?: StyleAttrs; children: ReactNode }) {
  return (
    <section className={classes.block} {...attrs}>
      <h3 className={classes.blockHead}>{label}</h3>
      {children}
    </section>
  );
}
function SheetGallery({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  if (product.imageProductId === null) return null;
  return <ProductImage productId={product.imageProductId} variant="web" alt={product.displayName} eager className={classes.thumb} rootAttrs={styleAttrs} />;
}
function SheetTitle({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  return <h2 className={classes.name} data-sf-part="sheet-title" {...styleAttrs}>{product.displayName}</h2>;
}
function SheetPrice({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { currency } = useSettings();
  const { t } = useText();
  // The one number the shopper came for, on its own rule.
  return (
    <div className={classes.priceBand} {...styleAttrs}>
      <span className={classes.priceLabel}>{t('product.sheet.unit')}</span>
      <span className={classes.price} data-sf-part="price">{formatMoney(product.price, currency)}</span>
    </div>
  );
}
function SheetStock({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { showSku } = useCoreOptions();
  const { t } = useText();
  const status = deriveStockStatus(product.inStock, product.lowStockAlert);
  const eta = product.isPreorder && product.preorderEta ? formatDate(new Date(product.preorderEta).toISOString()) : '';
  return (
    <p className={classes.flags} {...styleAttrs}>
      {showSku ? <span className={classes.sku}>{product.sku}</span> : null}
      <StockChip status={status} />
      {product.isPreorder ? (
        <span className={classes.preorder}>{eta ? t('product.sheet.ships', { eta }) : t('common.product.preorder')}</span>
      ) : null}
      {product.minOrderQuantity != null ? (
        <span className={classes.limit}>{t('product.limit.min', { min: product.minOrderQuantity })}</span>
      ) : null}
    </p>
  );
}
function SheetDescription({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { t } = useText();
  return product.description ? (
    <Block label={t('product.sheet.description')} attrs={styleAttrs}>
      <p className={classes.description}>{product.description}</p>
    </Block>
  ) : null;
}
function SheetBulkPricing({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { t } = useText();
  return product.pricingTiers.length > 0 ? (
    <Block label={t('product.bulk.heading')} attrs={styleAttrs}>
      <BulkPricing tiers={product.pricingTiers} price={product.price} />
    </Block>
  ) : null;
}
function SheetProvenance({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { t } = useText();
  return product.provenance ? (
    <Block label={t('product.provenance.heading')} attrs={styleAttrs}>
      <Provenance markdown={product.provenance} />
    </Block>
  ) : null;
}
function SheetAsk({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { brand } = useSettings();
  const { t } = useText();
  return brand.links.whatsapp || brand.links.telegram ? (
    <Block label={t('product.ask.heading')} attrs={styleAttrs}>
      <p className={classes.askText}>
        {t('product.ask.text', { name: product.displayName })}
      </p>
      <ContactLinks prefill={t('product.ask.prefill', { name: product.displayName, sku: product.sku })} />
    </Block>
  ) : null;
}
function SheetUpsells({ styleAttrs }: PartViewProps) {
  const { product, onSelect } = ProductFamily.useData();
  return <Upsells product={product} onSelect={onSelect} rootAttrs={styleAttrs} />;
}
/** The add button is pinned to the sheet footer (spec §7.2); a stored one never renders here. */
const SheetAddToCart = () => null;

export const SHEET_VIEWS: FamilyValue<ProductData>['views'] = {
  ProductBreadcrumbs: BreadcrumbsView, ProductGallery: SheetGallery, ProductTitle: SheetTitle, ProductPrice: SheetPrice,
  ProductStock: SheetStock, ProductAddToCart: SheetAddToCart, ProductDescription: SheetDescription,
  ProductBulkPricing: SheetBulkPricing, ProductProvenance: SheetProvenance, ProductAsk: SheetAsk,
  ProductUpsells: SheetUpsells, ProductGroup: makeGroupView(groupClassMap(FADE)),
};
```

Rename `Loading` to `export function SheetLoading()` (markup unchanged). `ProductDetailSheet.module.css` TEXT support, same pattern as Task 8: `.name` (1.5rem, `--sf-text`), `.sku, .preorder, .limit` (10px, `--sf-faint`), `.preorder` colour (`--sf-warn`), `.priceLabel` (10px, `--sf-faint`), `.price` (1.75rem, `--sf-text`), `.blockHead` (10px, `--sf-faint`), `.description, .askText` (0.9375rem, `--sf-muted`).

- [ ] **Step 4: Run tests**

Run: `npm --prefix web test -- test/builder-product-sheet.test.tsx test/golden-parity.test.tsx test/product-detail-sku.test.tsx test/product-list.test.tsx test/templates-parts.test.ts test/motion-usage.test.ts test/text-registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- web/src/features/catalog/ProductDetailSheet.tsx web/src/features/catalog/ProductDetailSheet.module.css web/test/builder-product-sheet.test.tsx
git commit -m "feat(storefront): the product sheet renders the layout's product document (stage 3 §7.2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/features/catalog/ProductDetailSheet.tsx web/src/features/catalog/ProductDetailSheet.module.css web/test/builder-product-sheet.test.tsx
```

---

### Task 10: Catalogue family — 6 parts, `ProductGrid` and `ProductList` containers

**Depends on:** Tasks 1, 3, 4, 5, 7. **Wave 3.** Spec §5.2, §7.1, §9, §12.

**Files:**
- Create: `web/src/builder/blocks/CatalogIntro.tsx`, `CatalogSearch.tsx`, `CatalogCategories.tsx`, `CatalogTitle.tsx`, `CatalogResults.tsx`, `CatalogEmpty.tsx`; `web/src/builder/blocks/_shared/catalogue-container.ts`; `web/src/builder/editor/fields/<same 6>.ts`; `web/src/features/catalog/catalogue-parts.tsx`; `web/test/builder-catalogue-parts.test.tsx`
- Modify: `web/src/builder/blocks/ProductGrid.tsx`, `ProductList.tsx`, `_shared/catalogue.tsx`; `web/src/builder/families.ts` (add `GridSlots`, `ListSlots`); `web/src/features/catalog/ProductGrid.tsx`, `ProductGrid.module.css`, `ProductList.tsx`, `ProductList.module.css`; `web/src/components/EmptyState.module.css`

**Interfaces:**
- Consumes: `CatalogueFamily`, `CatalogueData` (families.ts); `slotShows`, `containsType`, `NO_SILENT`, `part` (parts.ts); `defaultSlotRenders`; `CardDesignBoundary`; `rootAttrs` / `navAttrs` (Task 5).
- Produces:
  - `families.ts`: `GridSlots { top: SlotRender; rail: SlotRender; main: SlotRender }`, `ListSlots { content: SlotRender }`.
  - `GRID_CONTAINER`, `LIST_CONTAINER: ContainerSpec` — `family: 'catalogue'`, `required: ['CatalogTitle', 'CatalogResults', 'CatalogEmpty']`, `unique:` all six; grid `slotAccepts: { rail: ['CatalogCategories'] }`, `insertSlot: 'main'`; list `insertSlot: 'content'`.
  - `ProductGrid({ slots?: GridSlots })`, `ProductList({ slots?: ListSlots })` (no-`slots` form = default arrangement); `CatalogueBody({ body, overrides, slots? })`.
  - `catalogue-parts.tsx`: `CatalogSearchView`, `CatalogCategoriesView`, `CatalogEmptyView`.

- [ ] **Step 1: Load `frontend-design:frontend-design`; write the failing tests**

`web/test/builder-catalogue-parts.test.tsx` — mocks as in `golden-parity.test.tsx`; render docs with `RenderDoc docKey="catalog"` under an `Outlet` search context and `Suspense`, `await` the page title:
1. **Defaults = golden:** `defaultDoc('catalog', 'storefront')` renders `grid-all` (and at `/c/oats`, `/c/nope`, the no-match search: `grid-category`, `grid-unknown`, `grid-no-match`); `defaultDoc('catalog', 'menu')` renders `list-all`, `list-category`, `list-unknown`, `list-no-match` (compare `container.innerHTML` via `expectGolden`).
2. **v0.7.0-shaped docs:** `[{ type: 'ProductGrid', props: { id: 'g', categoryPicker: 'inherit', pageTitle: 'inherit', intro: 'inherit', sku: 'inherit' } }]` through `validateDoc` renders `grid-all`.
3. **Rearranged grid:** `top: [CatalogIntro]`, `rail: []`, `main: [CatalogSearch, CatalogTitle, CatalogEmpty, CatalogResults]` → the `.layout` div has the `noNav` class; the search input sits inside `.column`; no `FilterDrawer` (no `CatalogCategories` anywhere).
4. **Rail rules:** a `Heading` in `rail` → `slot-accepts:ProductGrid.rail`; two `ProductGrid`s on one catalogue, the second without `CatalogResults` → exactly one `part-required:ProductGrid.CatalogResults` with the second grid's `blockId`.
5. **List without intro:** `content: [CatalogTitle, CatalogEmpty, CatalogResults]` renders no hero and still the sheet + filter sheet after the sections.
6. **Wholesale (spec §7.1):** `features.wholesale: true` → the grid container renders the trade list and none of its parts (a `RichText` inside `main` is absent), while a `Heading` beside the container at the root still renders.
7. **Style per part:** `CatalogTitle` with `{ fg: 'primary' }` → on the `head` div; `CatalogEmpty` with `{ bg: 'surface' }` on an unknown category → on the EmptyState root; `CatalogCategories` with `{ padTop: 'sm' }` → on both `nav`s; `CatalogSearch` with `{ hide: 'mobile' }` → on the Mantine root wrapper; `CatalogResults` with `{ padTop: 'sm' }` → one marked wrapper `div` around the grid. `CatalogSearch.style.keys` lacks `textSize`; the three required parts lack `hide`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test -- test/builder-catalogue-parts.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Container specs, blocks, fields**

`_shared/catalogue-container.ts`:

```ts
import { part, type ContainerSpec } from '@/builder/parts.ts';

const PARTS = ['CatalogIntro', 'CatalogSearch', 'CatalogCategories', 'CatalogTitle', 'CatalogResults', 'CatalogEmpty'] as const;
const REQUIRED = ['CatalogTitle', 'CatalogResults', 'CatalogEmpty'] as const;

/** Spec §5.2. CatalogEmpty and CatalogResults never render together: the order reproduces v0.7.0's one conditional. */
export const GRID_CONTAINER: ContainerSpec = {
  family: 'catalogue', required: REQUIRED, unique: PARTS, insertSlot: 'main',
  // The rail is a grid track whose child the grid CSS positions (sticky, align-self: start).
  slotAccepts: { rail: ['CatalogCategories'] },
  defaultSlots: (_props, { id }) => ({
    top: [part('CatalogIntro', id), part('CatalogSearch', id)],
    rail: [part('CatalogCategories', id)],
    main: [part('CatalogTitle', id), part('CatalogEmpty', id), part('CatalogResults', id)],
  }),
};

export const LIST_CONTAINER: ContainerSpec = {
  family: 'catalogue', required: REQUIRED, unique: PARTS, insertSlot: 'content',
  defaultSlots: (_props, { id }) => ({
    content: [part('CatalogTitle', id), part('CatalogIntro', id), part('CatalogEmpty', id), part('CatalogResults', id)],
  }),
};
```

Part blocks follow Task 8's template with `CatalogueFamily` and `part: { family: 'catalogue' }`:

| Block | label | style | text |
|---|---|---|---|
| `CatalogIntro` | Intro | `styleSupport('wrap', [...BOX, ...VIS])` | `HERO_TEXT` |
| `CatalogSearch` | Search | `styleSupport('root', [...BOX, ...VIS])` | `catalog.search.*` |
| `CatalogCategories` | Categories | `styleSupport('pass', [...BOX, ...VIS])` | `catalog.nav.*` |
| `CatalogTitle` | Title and count | `styleSupport('root', [...BOX, ...TEXT])` | `catalog.list.allProducts`, `catalog.list.count`, `catalog.list.matching`, `catalog.list.unit`, `catalog.list.of`, `...SECTION_LABEL_TEXT` |
| `CatalogResults` | Products | `styleSupport('wrap', [...BOX])` | `catalog.group.*`, `...PRODUCT_CARD_TEXT`, `...SECTION_LABEL_TEXT` |
| `CatalogEmpty` | Empty and not-found states | `styleSupport('root', [...BOX, ...TEXT])` | `catalog.list.eyebrowCatalogue`, `catalog.list.eyebrowCategory`, `catalog.list.eyebrowSearch`, `catalog.list.categoryMissingDetail`, `catalog.list.noMatchesDetail`, `catalog.list.emptyCategoryDetail`, `catalog.list.showAll`, `common.list.*`, `common.actions.tryAgain` |

Fields: `blockFields('<Name>')` for each.

`blocks/ProductGrid.tsx`:

```tsx
type Props = { id: string; top: ComponentData[]; rail: ComponentData[]; main: ComponentData[] } & CatalogueOverrides;
export const block = defineBlock<Props>({
  name: 'ProductGrid', label: 'Product grid', category: 'catalogue', layouts: 'all', routeBound: true, slots: ['top', 'rail', 'main'],
  style: styleSupport('wrap', [...BOX]),
  text: ['catalog.list.eyebrowCatalogue', 'common.list.loadFailed', 'catalog.list.loadFailedDetail', 'common.actions.tryAgain', 'common.status.loading', 'catalog.filter.*'],
  container: GRID_CONTAINER,
  schema: z.object({ ...catalogueOverrideShape, top: slot(), rail: slot(), main: slot() }),
  defaultProps: { ...CATALOGUE_OVERRIDE_DEFAULTS, top: [], rail: [], main: [] },
  render: ({ categoryPicker, pageTitle, intro, sku, top, rail, main }) => (
    <CatalogueBody body="grid" overrides={{ categoryPicker, pageTitle, intro, sku }} slots={{ top, rail, main }} />
  ),
});
```

`blocks/ProductList.tsx`: the same shape with `slots: ['content']`, `LIST_CONTAINER`, `content: slot()`, `defaultProps … content: []`, `text` = the grid's list plus `'product.detail.product', 'common.actions.close'`, render `slots={{ content }}`.

`_shared/catalogue.tsx`: `CatalogueBody({ body, overrides, slots }: { …; slots?: GridSlots | ListSlots })` renders `<ProductGrid slots={slots as GridSlots | undefined} />` / `<ProductList slots={slots as ListSlots | undefined} />`; wholesale keeps rendering `<WholesaleCatalogPage />` and ignores `slots` (spec §7.1).

- [ ] **Step 4: Views and containers**

`web/src/features/catalog/catalogue-parts.tsx`:

```tsx
import { Button } from '@mantine/core';
import { Link } from 'react-router';
import { CatalogueFamily } from '@/builder/families.ts';
import type { PartViewProps } from '@/builder/parts.ts';
import { CategoryNav } from '@/features/catalog/CategoryNav.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';
import { SearchField } from '@/layouts/SearchField.tsx';
import { useCoreOptions } from '@/templates/hooks.ts';
import { useText } from '@/text/runtime.tsx';
import gridClasses from '@/features/catalog/ProductGrid.module.css';

export function CatalogSearchView({ styleAttrs }: PartViewProps) {
  const { search, setSearch } = CatalogueFamily.useData();
  return <SearchField className={gridClasses.search} value={search} onChange={setSearch} rootAttrs={styleAttrs} />;
}

/** Nothing when the category picker is off (spec §5.2). */
export function CatalogCategoriesView({ styleAttrs }: PartViewProps) {
  const { tree, products, active } = CatalogueFamily.useData();
  const { showCategoryPicker } = useCoreOptions();
  return showCategoryPicker ? <CategoryNav tree={tree} total={products.length} activeId={active?.id ?? null} navAttrs={styleAttrs} /> : null;
}

/** Unknown category / no matches / empty category — nothing otherwise. The list tests its groups, the grid its products. */
export function CatalogEmptyView({ styleAttrs }: PartViewProps) {
  const { unknownCategory, visible, groups, surface, query, setSearch } = CatalogueFamily.useData();
  const { t } = useText();
  if (unknownCategory) {
    return (
      <EmptyState
        rootAttrs={styleAttrs}
        eyebrow={t('catalog.list.eyebrowCategory')}
        title={t('common.list.categoryMissing')}
        description={t('catalog.list.categoryMissingDetail')}
        action={
          <Button component={Link} to="/" variant="default" size="sm">
            {t('catalog.list.showAll')}
          </Button>
        }
      />
    );
  }
  if ((surface === 'list' ? groups.length : visible.length) > 0) return null;
  return query ? (
    <EmptyState
      rootAttrs={styleAttrs}
      eyebrow={t('catalog.list.eyebrowSearch')}
      title={t('common.list.noMatches', { query })}
      description={t('catalog.list.noMatchesDetail')}
      action={
        <Button variant="default" size="sm" onClick={() => setSearch('')}>
          {t('common.list.clearSearch')}
        </Button>
      }
    />
  ) : (
    <EmptyState
      rootAttrs={styleAttrs}
      eyebrow={t('catalog.list.eyebrowCatalogue')}
      title={t('common.list.emptyCategory')}
      description={t('catalog.list.emptyCategoryDetail')}
    />
  );
}
```

(The prop order on `EmptyState` does not reach the DOM; keep the v0.7.0 order of the other props.)

`web/src/features/catalog/ProductGrid.tsx` — keep every hook and the pending / error returns exactly as today; add `slots`, the data object, the views and the new return:

```tsx
const CATEGORIES_SILENT: ReadonlySet<string> = new Set(['CatalogCategories']);

function GridIntro() {
  const { products, tree } = CatalogueFamily.useData();
  const { brand, welcomeMessage } = useSettings();
  return <Slot name="CatalogHero" surface="grid" tagline={brand.tagline} welcomeMessage={welcomeMessage} productCount={products.length} categoryCount={tree.length} />;
}

function GridTitle({ styleAttrs }: PartViewProps) {
  const { active, visible, query } = CatalogueFamily.useData();
  const { showPageTitle } = useCoreOptions();
  const { t } = useText();
  // The page-title core option hides the whole heading block (its label and count
  // too), leaving the h1 in the accessibility tree only.
  return (
    <>
      {showPageTitle ? <Slot name="SectionLabel" index={1} title={active ? active.name : t('catalog.list.allProducts')} level="page" /> : null}
      <div className={showPageTitle ? classes.head : undefined} {...styleAttrs}>
        <h1 className={showPageTitle ? classes.title : 'sf-visually-hidden'} data-sf-part="page-title">{active ? active.name : t('catalog.list.allProducts')}</h1>
        {showPageTitle ? (
          <p className={classes.result}>
            {query ? t('catalog.list.matching', { count: visible.length }) : t('catalog.list.count', { count: visible.length })}
          </p>
        ) : null}
      </div>
    </>
  );
}

function GridResults() {
  const { visible, unknownCategory, imageless, openProduct } = CatalogueFamily.useData();
  if (unknownCategory || visible.length === 0) return null;
  return imageless ? (
    <CardDesignBoundary kind="row">
      <ul className={classes.rows}>
        {visible.map((product, i) => (
          <li key={product.id} {...rowAnim(i)}>
            <ProductRow product={product} onSelect={openProduct} />
          </li>
        ))}
      </ul>
    </CardDesignBoundary>
  ) : (
    <CardDesignBoundary kind="tile">
      <div className={classes.grid} data-sf-part="product-grid">
        {visible.map((product, i) => (
          <ProductCard key={product.id} product={product} eager={i < EAGER_CARDS} hasSiblingImages index={i} />
        ))}
      </div>
    </CardDesignBoundary>
  );
}

const GRID_VIEWS: FamilyValue<CatalogueData>['views'] = {
  CatalogIntro: GridIntro, CatalogSearch: CatalogSearchView, CatalogCategories: CatalogCategoriesView,
  CatalogTitle: GridTitle, CatalogResults: GridResults, CatalogEmpty: CatalogEmptyView,
};

export function ProductGrid({ slots }: { slots?: GridSlots }) {
  const legacy = useMemo(() => (slots ? null : (defaultSlotRenders('ProductGrid', 'storefront') as unknown as GridSlots)), [slots]);
  // … every v0.7.0 hook, unchanged (search, categorySlug, catalog, core options, t, products, categories, tree,
  //   active, unknownCategory, visible, navigate, imageless); drop `brand` / `welcomeMessage` (GridIntro reads them) …
  if (catalog.isPending) return <PageSkeleton inline />;
  if (catalog.isError) { /* unchanged */ }
  const s = slots ?? legacy!;
  const query = search.trim();
  const data: CatalogueData = {
    surface: 'grid', products, tree, active, unknownCategory, visible, groups: [], search, query, setSearch, imageless, glyphs: false,
    openProduct: (p) => navigate(`/p/${p.id}`),
  };
  const all = [...s.top.items, ...s.rail.items, ...s.main.items];
  // Today's rule, from the slot: without a rail that would render, the column takes the full width.
  const railShows = slotShows(s.rail.items, showCategoryPicker ? NO_SILENT : CATEGORIES_SILENT);
  return (
    <CatalogueFamily.Provider value={{ data, views: GRID_VIEWS }}>
      <div className={`${classes.page} ${FADE}`}>
        {s.top()}
        <div className={railShows ? classes.layout : `${classes.layout} ${classes.noNav}`}>
          {railShows ? s.rail() : null}
          {s.main({ className: classes.column })}
        </div>
        {showCategoryPicker && containsType(all, 'CatalogCategories') ? <FilterDrawer tree={tree} total={products.length} activeId={active?.id ?? null} /> : null}
      </div>
    </CatalogueFamily.Provider>
  );
}
```

(`useMemo` for `legacy` sits with the other hooks, before the early returns.)

`web/src/features/catalog/ProductList.tsx` — same approach; views `ListTitle` (the v0.7.0 heading fragment with the tally, `null` on an unknown category — keep the two v0.7.0 comments), `ListIntro` (`unknownCategory ? null : <Slot name="CatalogHero" surface="list" …/>`), `ListResults` (`unknownCategory || groups.length === 0 ? null : <CardDesignBoundary kind="row">{groups.map(… the v0.7.0 section with `data-sf-part="group-title"`, rows get `onSelect={openProduct} index={i}` …)}</CardDesignBoundary>`), plus the shared Search / Categories / Empty views. Container return:

```tsx
  return (
    <CatalogueFamily.Provider value={{ data, views: LIST_VIEWS }}>
      <div className={`${classes.page} ${FADE}`}>
        {s.content()}
        <ProductDetailSheet productId={selectedId} onClose={closeProduct} onSelect={(product) => showProduct(product, true)} />
        {showCategoryPicker ? <FilterSheet tree={tree} total={products.length} activeId={active?.id ?? null} /> : null}
      </div>
    </CatalogueFamily.Provider>
  );
```

with `data = { surface: 'list', …, groups, glyphs: treeHasEmoji(tree), imageless: false, openProduct: (p) => showProduct(p) }` and `legacy = defaultSlotRenders('ProductList', 'menu')`.

CSS (TEXT support, pattern as Task 8): `ProductGrid.module.css` `.title` (1rem, `--sf-text`), `.result` (10px, `--sf-faint`); `ProductList.module.css` `.title` (1.375rem, `--sf-text`), `.tally` (10px, `--sf-faint`), `.shown` (`--sf-text`); `EmptyState.module.css` `.title`, `.description`, `.eyebrow` — read the file and wrap each colour / font-size the same way.

- [ ] **Step 5: Run the tests**

Run: `npm --prefix web test -- test/builder-catalogue-parts.test.tsx test/golden-parity.test.tsx test/product-grid.test.tsx test/product-list.test.tsx test/core-options-views.test.tsx test/builder-catalogue.test.tsx test/builder-catalogue-extras.test.tsx test/builder-editor-fields.test.ts test/text-registry.test.ts test/templates-parts.test.ts test/motion-usage.test.ts test/builder-style-contract.test.tsx`
Expected: PASS. Then `npm --prefix web run typecheck`.

- [ ] **Step 6: Commit** (all files above, pathspec as in Task 8)

```bash
git commit -m "feat(storefront): catalogue grid and list as containers of 6 parts (stage 3 §5.2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- <the paths listed in Files>
```

---

### Task 11: Card family — frames, 11 card parts, built-in cards from the same views

**Depends on:** Tasks 1, 3, 4, 5, 7. **Wave 3.** Spec §5.3, §6, §12 (card parity), §13 (cards).

**Files:**
- Create: `web/src/builder/blocks/CardTile.tsx`, `CardTileImage.tsx`, `CardTileGroup.tsx`, `CardTileName.tsx`, `CardTileFlags.tsx`, `CardTilePrice.tsx`, `CardTileAdd.tsx`, `CardRow.tsx`, `CardRowGroup.tsx`, `CardRowName.tsx`, `CardRowMeta.tsx`, `CardRowPrice.tsx`, `CardRowAdd.tsx`; `web/src/builder/blocks/_shared/card-containers.ts`; `web/src/builder/editor/fields/<same 13>.ts`; `web/src/builder/defaults/groups/cards.ts`; `web/test/builder-card-parts.test.tsx`
- Modify: `web/src/features/catalog/ProductCard.tsx`, `ProductCard.module.css`, `ProductRow.tsx`, `ProductRow.module.css`; `web/src/builder/blocks/FeaturedProducts.tsx` (boundary); `web/src/builder/editor/route-bound.ts` (card entries); tests `builder-editor-contract.test.ts` (`SPEC_BLOCKS` += frames), `builder-style-contract.test.tsx` (FLOOR += frames; frames out of the page-sample list), `builder-defaults-complete.test.ts` (`ROUTE_BLOCKS` += frames)

**Interfaces:**
- Consumes: `CardTileFamily`, `CardRowFamily`, `CardData` (families.ts); `fixedSlot`, `part`, `group` (parts.ts); `useCardDesign`, `CardDesignProvider`, `compileCard` (Task 7); `CARD_MATRIX`, `ROW_MATRIX`, `expectGolden` (Task 1).
- Produces:
  - `TILE_CONTAINER`, `ROW_CONTAINER: ContainerSpec` — tile: `required: ['CardTileName']`, `unique: ['CardTileImage', 'CardTileName', 'CardTileFlags', 'CardTilePrice', 'CardTileAdd']`, `requires: [['CardTileAdd', 'CardTilePrice']]`, `insertSlot: 'content'`; row: `required: ['CardRowName']`, `unique: ['CardRowName', 'CardRowMeta', 'CardRowPrice', 'CardRowAdd']`, `requires: [['CardRowAdd', 'CardRowPrice']]`, `insertSlot: 'content'`.
  - Frames `CardTile` / `CardRow`: `category: 'catalogue'`, `routeBound: true`, slot `content`, root BOX, render through their family's `PartHost` (spec deviation 3).
  - `TILE_VIEWS` (ProductCard.tsx), `ROW_VIEWS` (ProductRow.tsx): `FamilyValue<CardData>['views']`.
  - `ProductCard(props)` / `ProductRow(props)`: names and props unchanged; with a design they return `design.render(data, VIEWS)`, else the built-in composition.
  - Default docs: `defaultDoc('card:tile' | 'card:row', layout)` for every layout.
  - `ROUTE_BOUND` gains `'card:tile': { blocks: ['CardTile'], exactlyOne: true }`, `'card:row': { blocks: ['CardRow'], exactlyOne: true }` (type widened to `Record<'shell' | FixedRouteKey | CardKey, Entry>`).

- [ ] **Step 1: Load `frontend-design:frontend-design`; write the failing tests**

`web/test/builder-card-parts.test.tsx` (mocks as in `golden-parity.test.tsx`):
1. **Built-in = golden** is already `golden-parity.test.tsx` (must stay green).
2. **Compiled default = built-in (spec §12):** for every `CARD_MATRIX` case, `<CardDesignProvider cards={{ tile: defaultDoc('card:tile', 'storefront')! }} layout="storefront"><ProductCard …/></CardDesignProvider>` → `expectGolden(`card-tile-${name}`, html)`; the same for every `ROW_MATRIX` case with `row` → `card-row-${name}` (ordering off and SKU off included, index given and omitted).
3. **Two products, one design (Review Focus 3):** two `ProductCard`s under one provider show their own names and prices; `compileCard(doc, 'tile', 'storefront')` returns the same object before and after rendering 500 cards.
4. **Rules on card documents:** a tile doc with `CardTileAdd` and no `CardTilePrice` → `part-requires:CardTileAdd.CardTilePrice` and `compileCard` returns `null` → the grid shows the built-in card (golden); two frames → `exactly-one:CardTile`; a `Heading` inside the frame → `placement:Heading`; a frame without `CardTileName` → `part-required:CardTile.CardTileName`; `checkRules(defaultDoc(k, l)!, k, l)` is `[]` for both keys × three layouts.
5. **Custom tile design:** `content: [Group(body)[Price, Name, Group(foot)[Add]], Image]` (price above name, no flags) → in a card the price precedes the name link, no `.flags`, the image comes last.
6. **FeaturedProducts uses the design:** a published tile design renders inside a `FeaturedProducts` block (picked product) — the price-first order shows.
7. **Timing (logged, not gated):** render 500 compiled default tiles and 500 built-in tiles, `console.info` both durations.

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test -- test/builder-card-parts.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Containers, frames, parts, defaults, fields**

`_shared/card-containers.ts`:

```ts
import { group, part, type ContainerSpec } from '@/builder/parts.ts';

/** Spec §5.3: tile `content` [Image, Group(body)[Name, Flags, Group(foot)[Price, Add]]]. */
export const TILE_CONTAINER: ContainerSpec = {
  family: 'card-tile', insertSlot: 'content',
  required: ['CardTileName'],
  unique: ['CardTileImage', 'CardTileName', 'CardTileFlags', 'CardTilePrice', 'CardTileAdd'],
  requires: [['CardTileAdd', 'CardTilePrice']],
  defaultSlots: (_props, { id }) => ({
    content: [part('CardTileImage', id), group('CardTileGroup', id, 'body', [
      part('CardTileName', id), part('CardTileFlags', id), group('CardTileGroup', id, 'foot', [part('CardTilePrice', id), part('CardTileAdd', id)]),
    ])],
  }),
};

/** Row `content` [Group(text)[Name, Meta], Price, Add]. */
export const ROW_CONTAINER: ContainerSpec = {
  family: 'card-row', insertSlot: 'content',
  required: ['CardRowName'],
  unique: ['CardRowName', 'CardRowMeta', 'CardRowPrice', 'CardRowAdd'],
  requires: [['CardRowAdd', 'CardRowPrice']],
  defaultSlots: (_props, { id }) => ({
    content: [group('CardRowGroup', id, 'text', [part('CardRowName', id), part('CardRowMeta', id)]), part('CardRowPrice', id), part('CardRowAdd', id)],
  }),
};
```

`blocks/CardTile.tsx` (`CardRow.tsx` is the same with `CardRow`, `CardRowFamily`, `ROW_CONTAINER`, label "Product row", comment "the row frame"):

```tsx
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { CardTileFamily } from '@/builder/families.ts';
import { TILE_CONTAINER } from '@/builder/blocks/_shared/card-containers.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

/**
 * The tile frame: root of a `card:tile` document, locked (spec §5.3). Compiled once and rendered
 * per card under that card's context, so it renders through the family's PartHost like a part.
 */
export const block = defineBlock<{ id: string; content: ComponentData[] }>({
  name: 'CardTile', label: 'Product card', category: 'catalogue', layouts: 'all', routeBound: true, slots: ['content'],
  style: styleSupport('root', [...BOX]),
  container: TILE_CONTAINER,
  schema: z.object({ content: slot() }), defaultProps: { content: [] },
  render: (p) => <CardTileFamily.PartHost name="CardTile" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
```

Part blocks follow Task 8's template with the card family (`part: { family: 'card-tile' | 'card-row' }`):

| Block | label | style (`root`) | text | slot / schema |
|---|---|---|---|---|
| `CardTileImage` | Photo | BOX, VIS | — | — |
| `CardTileGroup` | Group | BOX, `align`, VIS | — | `kind: z.enum(['body', 'foot'])`, `items: slot()`; default `{ kind: 'body', items: [] }` |
| `CardTileName` | Name | BOX, TEXT | — | — |
| `CardTileFlags` | Flags | BOX, TEXT, VIS | `product.limit.min`, `common.product.preorder`, `product.stock.*` | — |
| `CardTilePrice` | Price | BOX, TEXT, VIS | — | — |
| `CardTileAdd` | Add button | BOX, VIS | `product.add.*`, `common.product.*` | — |
| `CardRowGroup` | Group | BOX, `align`, VIS | — | `kind: z.enum(['text'])`, `items: slot()`; default `{ kind: 'text', items: [] }` |
| `CardRowName` | Name | BOX, TEXT | — | — |
| `CardRowMeta` | Details | BOX, TEXT, VIS | `product.limit.min`, `common.product.preorder`, `product.stock.*` | — |
| `CardRowPrice` | Price | BOX, TEXT, VIS | — | — |
| `CardRowAdd` | Add control | BOX, VIS | `product.add.*`, `product.row.*`, `common.qty.*`, `common.product.preorder` | — |

Fields: `blockFields('<Name>')`; the group fields override `kind` with a radio labelled "Arrangement" (`body` → "Card body", `foot` → "Card foot"; `text` → "Text column").

`defaults/groups/cards.ts`:

```ts
import { block, doc, type DefaultEntry } from '@/builder/defaults/helpers.ts';

// Product-parts §6.1: the built-in card designs, as documents (the editor's starting point).
export const DEFAULTS: DefaultEntry[] = [
  { docKey: 'card:tile', layouts: 'all', doc: doc([block('CardTile')]) },
  { docKey: 'card:row', layouts: 'all', doc: doc([block('CardRow')]) },
];
```

- [ ] **Step 4: Views and built-in compositions**

`ProductCard.tsx` (keep `ProductCardProps` and the component doc comment):

```tsx
const NONE: Record<string, unknown> = {};
const tileData = ({ product, eager = false, hasSiblingImages = true, index = 0 }: ProductCardProps): CardData => ({ product, eager, hasSiblingImages, index });

function TileFrame({ props, styleAttrs }: PartViewProps) {
  const { index = 0 } = CardTileFamily.useData();
  const anim = rowAnim(index);
  return (
    <article className={`${classes.card} ${anim.className}`} style={anim.style} data-sf-part="product-card" {...styleAttrs}>
      {(props.content as SlotRender)()}
    </article>
  );
}
function TileImage({ styleAttrs }: PartViewProps) {
  const { product, eager, hasSiblingImages } = CardTileFamily.useData();
  if (product.imageProductId !== null) {
    return <ProductImage productId={product.imageProductId} variant="thumbnail" alt={product.displayName} eager={eager} className={classes.media} rootAttrs={styleAttrs} />;
  }
  return hasSiblingImages ? (
    <span className={`${imageClasses.well} ${classes.media}`} aria-hidden {...styleAttrs}>
      <span className={imageClasses.rule} />
    </span>
  ) : null;
}
const TILE_GROUP: Record<string, string> = { body: classes.body, foot: classes.foot };
function TileGroup({ props, styleAttrs }: PartViewProps) {
  const kind = typeof props.kind === 'string' && Object.hasOwn(TILE_GROUP, props.kind) ? props.kind : 'body';
  return <div className={TILE_GROUP[kind]} {...styleAttrs}>{(props.items as SlotRender)()}</div>;
}
function TileName({ styleAttrs }: PartViewProps) {
  const { product } = CardTileFamily.useData();
  return (
    <h3 className={classes.name} {...styleAttrs}>
      <Link to={`/p/${product.id}`} className={classes.link}>
        {product.displayName}
      </Link>
    </h3>
  );
}
function TileFlags({ styleAttrs }: PartViewProps) {
  const { product } = CardTileFamily.useData();
  const { t } = useText();
  const status = deriveStockStatus(product.inStock, product.lowStockAlert);
  if (!(product.isPreorder || status !== 'in' || product.minOrderQuantity != null)) return null;
  return (
    <div className={classes.flags} {...styleAttrs}>
      {product.minOrderQuantity != null ? (
        <span className={classes.limit}>{t('product.limit.min', { min: product.minOrderQuantity })}</span>
      ) : null}
      {product.isPreorder ? <span className={classes.preorder}>{t('common.product.preorder')}</span> : null}
      {status !== 'in' ? <StockChip status={status} /> : null}
    </div>
  );
}
function TilePrice({ styleAttrs }: PartViewProps) {
  const { product } = CardTileFamily.useData();
  const { currency } = useSettings();
  const best = bestTier(product);
  return (
    <p className={classes.prices} {...styleAttrs}>
      <span className={classes.price} data-sf-part="price">{formatMoney(product.price, currency)}</span>
      {best ? (
        <span className={classes.tier}>
          {best.minQuantity}+ {formatMoney(best.price, currency)}
        </span>
      ) : null}
    </p>
  );
}
function TileAdd({ styleAttrs }: PartViewProps) {
  const { product } = CardTileFamily.useData();
  return (
    <div className={classes.add} {...styleAttrs}>
      <AddToCart product={product} size="sm" showPrice={false} />
    </div>
  );
}

export const TILE_VIEWS: FamilyValue<CardData>['views'] = {
  CardTile: TileFrame, CardTileImage: TileImage, CardTileGroup: TileGroup, CardTileName: TileName,
  CardTileFlags: TileFlags, CardTilePrice: TilePrice, CardTileAdd: TileAdd,
};

/** The built-in tile: today's composition, drawn from the same views (spec §6.3). */
function BuiltInTile({ data }: { data: CardData }) {
  return (
    <CardTileFamily.Provider value={{ data, views: TILE_VIEWS }}>
      <TileFrame props={{ content: fixedSlot(<>
        <TileImage props={NONE} />
        <TileGroup props={{ kind: 'body', items: fixedSlot(<>
          <TileName props={NONE} />
          <TileFlags props={NONE} />
          <TileGroup props={{ kind: 'foot', items: fixedSlot(<>
            <TilePrice props={NONE} />
            <TileAdd props={NONE} />
          </>) }} />
        </>) }} />
      </>) }} />
    </CardTileFamily.Provider>
  );
}

export function ProductCard(props: ProductCardProps) {
  const design = useCardDesign('tile');
  const data = tileData(props);
  return design ? <>{design.render(data, TILE_VIEWS)}</> : <BuiltInTile data={data} />;
}
```

`bestTier(product)` is the v0.7.0 `reduce` (lowest-price tier or `null`) as a module function. `ProductRow.tsx` gets the same structure: `rowData({ product, onSelect, index }) → { product, onSelect, index, eager: false, hasSiblingImages: true }`; views `RowFrame` (the v0.7.0 root `div` with `index === undefined ? classes.row : \`${classes.row} ${rowAnim(index).className}\``, `style={index === undefined ? undefined : rowAnim(index).style}`, `data-sf-part="product-row"`, `{...styleAttrs}`), `RowGroup` (`kind` `text` → `classes.text`), `RowName` (`h3` + `button.open` calling `onSelect?.(product)`), `RowMeta` (the v0.7.0 `hasMeta` rule and `p.meta`), `RowPrice` (`p.price` with `data-sf-part="price"`), `RowAdd` (the v0.7.0 `features.ordering ? <div className={classes.gutter}>…</div> : null`, with `useCartStore`, floor / ceiling logic inside it; `{...styleAttrs}` on the gutter); `ROW_VIEWS`; `BuiltInRow` = `RowFrame(content: [RowGroup(text)[RowName, RowMeta], RowPrice, RowAdd])`; `ProductRow` = `useCardDesign('row')` or `BuiltInRow`. Move each v0.7.0 JSX fragment verbatim.

`ProductCard.module.css` / `ProductRow.module.css` TEXT support (pattern of Task 8): tile `.name` (0.875rem, `--sf-text`), `.preorder` (10px, `--sf-primary`), `.limit` (10px, `--sf-muted`), `.price` (0.9375rem, `--sf-text`), `.tier` (10px, `--sf-faint`); row `.name` (0.9375rem font-size) and `.open` colour (`--sf-text`), `.sku, .tier, .preorder, .limit` (10px, `--sf-faint`), `.tier, .limit` colour (`--sf-muted`), `.preorder` colour (`--sf-warn`), `.price` (0.9375rem, `--sf-text`).

`FeaturedProducts.tsx`: wrap the `.grid` div's children map in `<CardDesignBoundary kind="tile">…</CardDesignBoundary>` (inside the div; no DOM change).

Enumeration tables: add `'CardTile', 'CardRow'` to `SPEC_BLOCKS` and to `ROUTE_BLOCKS`; FLOOR gains `CardTile: { target: 'root', keys: [...BOX] }, CardRow: { target: 'root', keys: [...BOX] }`; `owned` in the marker test excludes the frames (`&& !['CardTile', 'CardRow'].includes(d.name)`), because a frame renders only inside a card context (its marker is asserted in this task's test 5 via `data-sf-style="CardTile"` on a styled frame).

- [ ] **Step 5: Run the tests**

Run: `npm --prefix web test -- test/builder-card-parts.test.tsx test/builder-cards.test.tsx test/golden-parity.test.tsx test/product-card.test.tsx test/product-row.test.tsx test/builder-featured.test.tsx test/builder-editor-route-bound.test.ts test/builder-editor-contract.test.ts test/builder-style-contract.test.tsx test/builder-defaults-complete.test.ts test/builder-editor-fields.test.ts test/text-registry.test.ts test/templates-parts.test.ts test/motion-usage.test.ts test/wholesale-row.test.tsx`
Expected: PASS (drop `wholesale-row` if no such unit test exists). Then `npm --prefix web run typecheck`.

- [ ] **Step 6: Commit** (all paths in Files)

```bash
git commit -m "feat(storefront): card frames and parts; built-in cards and compiled designs share one set of views (stage 3 §5.3, §6)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- <the paths listed in Files>
```

---

### Task 12: Contract flip, manifest, docs, bundle gate, DOM parity — Playwright owner

**Depends on:** Tasks 8–11. **Wave 4.** Spec §9 (contract), §12 (gates), §13 (contract), §14 (docs), §16.9.

**Files:**
- Create: `web/test/builder-parts-contract.test.tsx`
- Modify: `web/src/builder/blocks-manifest.ts`, `web/public/blocks.json`, `web/test/blocks-manifest.test.ts`, `web/test/builder-editor-contract.test.ts`, `docs/builder.md`, `docs/templates.md`

**Interfaces:**
- Produces: `BlocksManifest.blocks[i]` gains `part?: { family: PartFamily }` and `container?: { family: PartFamily; slots: string[]; required: string[]; unique: string[]; insertSlot: string }` (present only when the block has one).

- [ ] **Step 1: Write the failing contract test**

`web/test/builder-parts-contract.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BLOCKS } from '@/builder/registry.ts';
import { checkRules } from '@/builder/rules.ts';
import { FAMILY_DOC, type PartFamily } from '@/builder/parts.ts';
import { BOX, TEXT, VIS, type StyleKey, type StyleTarget } from '@/builder/style/model.ts';
import type { ComponentData, LayoutKind, PuckDoc } from '@/builder/types.ts';
import { cssRules } from './helpers/css-rules.ts';

const T = (target: StyleTarget, ...groups: ReadonlyArray<readonly StyleKey[]>) => ({ target, keys: groups.flat() });
/** Spec §9, exactly. Keys may be added later, never removed. */
const PARTS: Record<string, { family: PartFamily; style: { target: StyleTarget; keys: readonly StyleKey[] } }> = {
  ProductBreadcrumbs: { family: 'product', style: T('root', BOX, TEXT, VIS) },
  ProductGallery: { family: 'product', style: T('root', BOX, VIS) },
  ProductTitle: { family: 'product', style: T('root', BOX, TEXT) },
  ProductPrice: { family: 'product', style: T('root', BOX, TEXT) },
  ProductStock: { family: 'product', style: T('root', BOX, TEXT, VIS) },
  ProductAddToCart: { family: 'product', style: T('root', BOX) },
  ProductDescription: { family: 'product', style: T('root', BOX, TEXT, VIS) },
  ProductBulkPricing: { family: 'product', style: T('root', BOX, TEXT, VIS) },
  ProductProvenance: { family: 'product', style: T('root', BOX, TEXT, VIS) },
  ProductAsk: { family: 'product', style: T('root', BOX, TEXT, VIS) },
  ProductUpsells: { family: 'product', style: T('root', BOX, VIS) },
  ProductGroup: { family: 'product', style: T('root', BOX, ['align'], VIS) },
  CatalogIntro: { family: 'catalogue', style: T('wrap', BOX, VIS) },
  CatalogSearch: { family: 'catalogue', style: T('root', BOX, VIS) },
  CatalogCategories: { family: 'catalogue', style: T('pass', BOX, VIS) },
  CatalogTitle: { family: 'catalogue', style: T('root', BOX, TEXT) },
  CatalogResults: { family: 'catalogue', style: T('wrap', BOX) },
  CatalogEmpty: { family: 'catalogue', style: T('root', BOX, TEXT) },
  CardTileImage: { family: 'card-tile', style: T('root', BOX, VIS) },
  CardTileGroup: { family: 'card-tile', style: T('root', BOX, ['align'], VIS) },
  CardTileName: { family: 'card-tile', style: T('root', BOX, TEXT) },
  CardTileFlags: { family: 'card-tile', style: T('root', BOX, TEXT, VIS) },
  CardTilePrice: { family: 'card-tile', style: T('root', BOX, TEXT, VIS) },
  CardTileAdd: { family: 'card-tile', style: T('root', BOX, VIS) },
  CardRowGroup: { family: 'card-row', style: T('root', BOX, ['align'], VIS) },
  CardRowName: { family: 'card-row', style: T('root', BOX, TEXT) },
  CardRowMeta: { family: 'card-row', style: T('root', BOX, TEXT, VIS) },
  CardRowPrice: { family: 'card-row', style: T('root', BOX, TEXT, VIS) },
  CardRowAdd: { family: 'card-row', style: T('root', BOX, VIS) },
};
const CONTAINERS = ['ProductDetail', 'ProductGrid', 'ProductList', 'CardTile', 'CardRow'];
/** Where each TEXT-offering part's view reads the variables. */
const PART_CSS: Record<string, string[]> = {
  ProductBreadcrumbs: ['ProductDetailPage'], ProductTitle: ['ProductDetailPage', 'ProductDetailSheet'], ProductPrice: ['ProductDetailPage', 'ProductDetailSheet'],
  ProductStock: ['ProductDetailPage', 'ProductDetailSheet'], ProductDescription: ['ProductDetailPage', 'ProductDetailSheet'],
  ProductBulkPricing: ['ProductDetailPage', 'ProductDetailSheet'], ProductProvenance: ['ProductDetailPage', 'ProductDetailSheet'], ProductAsk: ['ProductDetailPage', 'ProductDetailSheet'],
  CatalogTitle: ['ProductGrid', 'ProductList'], CatalogEmpty: ['../../components/EmptyState'],
  CardTileName: ['ProductCard'], CardTileFlags: ['ProductCard'], CardTilePrice: ['ProductCard'],
  CardRowName: ['ProductRow'], CardRowMeta: ['ProductRow'], CardRowPrice: ['ProductRow'],
};
const sameKeys = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join();

describe('parts contract (spec §9, §13)', () => {
  it('the part table covers exactly the registered parts', () => {
    expect(Object.values(BLOCKS).filter((d) => d.part).map((d) => d.name).sort()).toEqual(Object.keys(PARTS).sort());
  });
  it.each(Object.keys(PARTS))('%s: family, target and keys', (name) => {
    const def = BLOCKS[name]!;
    expect(def.part).toEqual({ family: PARTS[name]!.family });
    expect(def.container).toBeUndefined();
    expect(def.category).toBe('part');
    expect(def.style && def.style.target).toBe(PARTS[name]!.style.target);
    expect(sameKeys(def.style ? def.style.keys : [], PARTS[name]!.style.keys)).toBe(true);
  });
  it('required parts accept no hide; no part holding an input accepts textSize', () => {
    for (const c of CONTAINERS) for (const r of BLOCKS[c]!.container!.required) expect((BLOCKS[r]!.style || { keys: [] }).keys, r).not.toContain('hide');
    for (const n of ['CatalogSearch', 'ProductAddToCart', 'CardTileAdd', 'CardRowAdd']) expect((BLOCKS[n]!.style || { keys: [] }).keys, n).not.toContain('textSize');
  });
  it('TEXT parts read --sf-block-fg and --sf-text-scale in their views\' CSS', () => {
    for (const [name, files] of Object.entries(PART_CSS)) {
      const rules = files.flatMap((f) => cssRules(readFileSync(resolve(__dirname, `../src/features/catalog/${f}.module.css`), 'utf8')));
      expect(rules.some((r) => /color:\s*var\(--sf-block-fg,/.test(r.body)), `${name} fg`).toBe(true);
      expect(rules.some((r) => /font-size:\s*calc\([^;]*var\(--sf-text-scale, 1\)/.test(r.body)), `${name} textSize`).toBe(true);
    }
  });
  it.each(CONTAINERS)('%s: a ContainerSpec whose defaults pass its own rules in every layout', (name) => {
    const def = BLOCKS[name]!;
    expect(def.container).toBeDefined();
    expect(def.part).toBeUndefined();
    for (const layout of ['storefront', 'menu', 'webapp'] as LayoutKind[]) {
      const id = `${name}-contract`;
      const item: ComponentData = { type: name, props: { id, ...def.container!.defaultSlots({}, { layout, id }) } };
      const doc: PuckDoc = { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [item] };
      expect(checkRules(doc, FAMILY_DOC[def.container!.family], layout), `${name} ${layout}`).toEqual([]);
      const ids = JSON.stringify(item).match(/"id":"([^"]+)"/g)!.map((s) => s.slice(6, -1));
      expect(ids.every((i) => i.length <= 64)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it('every part and every container slot is reachable: legacy props are schema keys', () => {
    const pd = BLOCKS.ProductDetail!;
    for (const k of pd.container!.legacyProps ?? []) expect(Object.keys((pd.schema as unknown as { shape: object }).shape)).toContain(k);
  });
});
```

(`cssRules` resolves the `EmptyState` path relative to `features/catalog/`; the `'../../components/EmptyState'` entry reaches `src/components/EmptyState.module.css`.)

Add to `builder-editor-contract.test.ts`: `export const PART_BLOCKS = [/* the 29 part names */] as const;` and `it('registers exactly the stage-3 parts', () => expect(Object.values(BLOCKS).filter((d) => d.part).map((d) => d.name).sort()).toEqual([...PART_BLOCKS].sort()));`

- [ ] **Step 2: Run to verify what fails**

Run: `npm --prefix web test -- test/builder-parts-contract.test.tsx test/blocks-manifest.test.ts`
Expected: the parts contract passes if Tasks 8–11 followed the tables (fix any real mismatch **in the owning block file**, noting it in the report); `blocks-manifest` FAILS (stale json, and the manifest lacks `part` / `container`).

- [ ] **Step 3: Manifest**

`blocks-manifest.ts`: extend the entry type and map:

```ts
      .map((b) => ({
        name: b.name, category: b.category, layouts: …, routeBound: b.routeBound, style: …,
        ...(b.part ? { part: { family: b.part.family } } : {}),
        ...(b.container ? { container: { family: b.container.family, slots: [...b.slots], required: [...b.container.required], unique: [...b.container.unique], insertSlot: b.container.insertSlot } } : {}),
      }))
```

Add a manifest test case: `ProductPrice` carries `part: { family: 'product' }`; `ProductDetail` carries `container.required` `['ProductTitle', 'ProductPrice', 'ProductAddToCart']`. Regenerate: `UPDATE_BLOCKS_JSON=1 npm --prefix web test -- test/blocks-manifest.test.ts` (PowerShell: set the env var as in Task 1), then run it again without the flag — PASS.

- [ ] **Step 4: Docs**

`docs/builder.md` — new section "## Containers and parts" after "Block styling": the pattern (spec §3.1–3.3: container owns data, parts are `PartHost` shells, views travel through context, the container is the only lazy boundary; name the files `parts.ts`, `families.ts`, the `*-container.ts` specs and the view files), placement and rules (§3.4, §4 table with rule ids), the three per-family tables (§5.1–5.3, as implemented), "Old documents" (§8: absent vs `[]`, guard + editor load + default table, legacy props), the menu / web-app sheet (§7.2, including "the storefront layout keeps the built-in sheet"), wholesale (§7.1), and a checklist "Adding a part" (block file from the template, view in the surface file(s), `ContainerSpec` defaults, fields file, `text`, `style`, contract table, golden unchanged). New section "## Card designs": `PageSet.cards`, `card:tile` / `card:row`, frames, compile-once and `CardDesignBoundary`, where designs apply (§6.2), and the parity guarantee. `docs/templates.md` gains, where structural selectors are discussed: "Structural selectors inside product surfaces (for example bento's `[data-sf-part="product-card"] > :first-child`) assume the default arrangement; degrade gracefully when an owner changes it."

- [ ] **Step 5: Bundle gate (Review Focus / spec §16.9)**

Run: `npm --prefix web run build` — Expected: success (isolation check included). Then compare the largest `web/dist/assets/index-*.js` with Task 1's baseline (commit message of Task 1): report both sizes and the delta; `grep -c "bulk-heading\|provenance-heading\|priceBand" web/dist/assets/index-*.js` must print `0` for each entry file (views stayed in lazy chunks). A delta above +12 KB (uncompressed) is a finding to report, not to paper over.

- [ ] **Step 6: Full unit suite, then DOM parity and the templates matrix (Playwright owner)**

Run: `npm --prefix web test` — Expected: all green.
Run: `npm run test:e2e -- e2e/dom-parity.spec.ts e2e/templates-baseline.spec.ts e2e/templates-baseline-imageless.spec.ts e2e/templates.spec.ts` — Expected: PASS with **no** snapshot written. If any fails: find the leak (spec §16.1 list), fix it in the owning file, never `--update-snapshots`. Then run the whole suite once: `npm run test:e2e` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -- web/test/builder-parts-contract.test.tsx web/src/builder/blocks-manifest.ts web/public/blocks.json web/test/blocks-manifest.test.ts web/test/builder-editor-contract.test.ts docs/builder.md docs/templates.md
git commit -m "test(builder): parts contract, manifest with container/part fields, docs (stage 3 §9, §14)

Entry chunk: <before> -> <after> bytes. dom-parity and templates matrix green, no snapshot written.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/test/builder-parts-contract.test.tsx web/src/builder/blocks-manifest.ts web/public/blocks.json web/test/blocks-manifest.test.ts web/test/builder-editor-contract.test.ts docs/builder.md docs/templates.md
```

---

### Task 13: Editor — parts palette, allow lists, locks, insert, legacy props

**Depends on:** Task 12. **Wave 5.** Spec §8 (editor side of legacy props), §11 (palette, allow lists, locks, "Add block", root fields, double-intro hint).

**Files:**
- Modify: `web/src/builder/editor/config.ts`, `derive-fields.ts`, `prepare.ts`, `insert-target.ts`, `route-bound.ts`; `web/test/builder-editor-fields.test.ts` (legacy exemption; `slotAllowFor(name, slot)`)
- Create: `web/test/builder-editor-parts-config.test.ts`

**Interfaces:**
- Consumes: `requiredParts`, `allowedOn` (rules.ts); `FAMILY_DOC`, `PartFamily` (parts.ts); `parseBlockProps` (define.ts); `isCardKey` (types.ts).
- Produces:
  - `route-bound.ts`: `familyOfDoc(docKey: DocKey): PartFamily | null`; `requiredPartsOn(docKey: DocKey, layout: LayoutKind): ReadonlySet<string>`.
  - `config.ts`: `PART_TITLES: Record<PartFamily, string>` (`Product page parts`, `Catalogue parts`, `Card parts`, `Card parts`); `blockMenu` titles the `part` group by the doc's family and lists it first; `buildEditorConfig` adds per-slot allow lists, part locks, container `resolveData` on insert, and root fields `{}` for card docs and for `product` outside the storefront layout.
  - `derive-fields.ts`: `deriveFields` skips `container.legacyProps`; `slotAllowFor(name: string, slot?: string): string[]`; `scopeFields` narrows container slots.
  - `prepare.ts`: `prepareProps` drops a container's `legacyProps` once every slot is an array; never adds or empties a slot.
  - `insert-target.ts`: a part inserted with no usable selection lands at the end of its family container's `insertSlot`.

- [ ] **Step 1: Write the failing tests**

`web/test/builder-editor-parts-config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Config } from '@puckeditor/core';
import { blockMenu, buildEditorConfig, editorHints, lockedPresent } from '@/builder/editor/config.ts';
import { prepareProps } from '@/builder/editor/prepare.ts';
import { insertTarget, type InsertApi } from '@/builder/editor/insert-target.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import type { ComponentData, DocKey } from '@/builder/types.ts';

const cfg = (docKey: DocKey, layout: 'storefront' | 'menu' = 'storefront') => buildEditorConfig(docKey, layout, lockedPresent(defaultDoc(docKey, layout)!, docKey));
const allow = (c: Config, type: string, slot: string) => (c.components[type]!.fields as Record<string, { allow?: string[] }>)[slot]!.allow!;

describe('palette (spec §11)', () => {
  it('parts show only on the doc where their family container lives, titled per family, first', () => {
    const product = blockMenu('product', 'storefront', new Set(['ProductDetail']));
    expect(product[0]).toMatchObject({ category: 'part', title: 'Product page parts' });
    expect(product[0]!.blocks.map((b) => b.name)).toContain('ProductPrice');
    expect(blockMenu('catalog', 'storefront', new Set()).find((g) => g.category === 'part')!.title).toBe('Catalogue parts');
    expect(blockMenu('page:about', 'storefront', new Set()).some((g) => g.category === 'part')).toBe(false);
    expect(blockMenu('card:tile', 'storefront', new Set(['CardTile']))[0]!.title).toBe('Card parts');
    expect(blockMenu('card:tile', 'storefront', new Set(['CardTile'])).flatMap((g) => g.blocks.map((b) => b.name)).every((n) => n.startsWith('CardTile'))).toBe(true);
  });
  it('ProductAddToCart is not offered in the menu layout', () => {
    expect(blockMenu('product', 'menu', new Set(['ProductDetail'])).flatMap((g) => g.blocks.map((b) => b.name))).not.toContain('ProductAddToCart');
  });
});

describe('allow lists (spec §11, §3.4)', () => {
  it('container slots take the family parts and content, never route blocks or containers', () => {
    const main = allow(cfg('product'), 'ProductDetail', 'main');
    expect(main).toEqual(expect.arrayContaining(['ProductPrice', 'ProductGroup', 'RichText', 'Section', 'Upsells', 'FeaturedProducts']));
    expect(main).not.toContain('ProductDetail');
    expect(main).not.toContain('CardTileName');
  });
  it('the grid rail takes only CatalogCategories', () => {
    expect(allow(cfg('catalog'), 'ProductGrid', 'rail')).toEqual(['CatalogCategories']);
  });
  it('a Section on the product doc accepts product parts too', () => {
    expect(allow(cfg('product'), 'Section', 'content')).toContain('ProductPrice');
  });
  it('card docs: frame and group slots take only the family parts', () => {
    const c = cfg('card:tile');
    expect(allow(c, 'CardTile', 'content').every((n) => n.startsWith('CardTile') && n !== 'CardTile')).toBe(true);
    expect(allow(c, 'CardTileGroup', 'items')).not.toContain('Heading');
  });
});

describe('locks and root fields', () => {
  it('required parts cannot be deleted or duplicated; optional parts cannot be duplicated', () => {
    const c = cfg('product');
    expect(c.components.ProductPrice!.permissions).toEqual({ delete: false, duplicate: false });
    expect(c.components.ProductAddToCart!.permissions).toEqual({ delete: false, duplicate: false });
    expect(c.components.ProductDescription!.permissions).toEqual({ duplicate: false });
    expect(cfg('product', 'menu').components.ProductTitle!.permissions).toEqual({ delete: false, duplicate: false });
    expect(cfg('card:tile').components.CardTileName!.permissions).toEqual({ delete: false, duplicate: false });
    expect(cfg('card:tile').components.CardTile!.permissions).toEqual({ delete: false, duplicate: false });
  });
  it('card docs and the menu product sheet have no page settings', () => {
    expect(cfg('card:tile').root!.fields).toEqual({});
    expect(cfg('product', 'menu').root!.fields).toEqual({});
    expect(Object.keys(cfg('product').root!.fields!)).toEqual(['title', 'description', 'chrome']);
  });
  it('a container inserted from the drawer gets its default arrangement', async () => {
    const resolve = cfg('catalog').components.ProductGrid!.resolveData!;
    const out = await resolve({ props: { id: 'g9', top: [], rail: [], main: [] } } as never, { trigger: 'insert' } as never);
    expect(((out as { props: Record<string, unknown> }).props.main as ComponentData[]).map((c) => c.type)).toEqual(['CatalogTitle', 'CatalogEmpty', 'CatalogResults']);
    const kept = await resolve({ props: { id: 'g9', top: [], rail: [], main: [] } } as never, { trigger: 'load' } as never);
    expect((kept as { props: Record<string, unknown> }).props.main).toEqual([]);
  });
});

describe('fields and emitted props (spec §8)', () => {
  it('legacy props are not fields', () => {
    expect(Object.keys(cfg('product').components.ProductDetail!.fields!)).not.toContain('gallery');
  });
  it('prepareProps drops legacy props only once every slot is present, and never touches slots', () => {
    const partial = { id: 'd', gallery: false, main: [] };
    expect(prepareProps('ProductDetail', partial)).toBe(partial);
    const full = { id: 'd', gallery: false, bulkPricing: true, top: [], media: [], main: [], below: [] };
    expect(prepareProps('ProductDetail', full)).toEqual({ id: 'd', top: [], media: [], main: [], below: [] });
    const clean = { id: 'd', top: [], media: [], main: [], below: [] };
    expect(prepareProps('ProductDetail', clean)).toBe(clean);
  });
});

describe('Add block with nothing selected inside the container (spec §11)', () => {
  const grid: ComponentData = { type: 'ProductGrid', props: { id: 'g', top: [], rail: [], main: [{ type: 'CatalogTitle', props: { id: 't' } }] } };
  const api = (sel: InsertApi['appState']['ui']['itemSelector']): InsertApi => ({
    config: cfg('catalog'),
    appState: { ui: { itemSelector: sel }, data: { content: [{ type: 'Heading', props: { id: 'h' } }, grid] } },
    getItemById: (id: string) => (id === 'g' ? grid : undefined),
    getParentById: () => undefined,
    getSelectorForId: (id: string) => (id === 'h' ? { index: 0, zone: 'root:default-zone' } : { index: 1, zone: 'root:default-zone' }),
  } as unknown as InsertApi);
  it('nothing selected → end of the container insert slot', () => {
    expect(insertTarget(api(null), 'CatalogSearch')).toEqual({ zone: 'g:main', index: 1, nested: true });
  });
  it('a root block selected → still the container, never the root', () => {
    expect(insertTarget(api({ index: 0, zone: 'root:default-zone' }), 'CatalogSearch')).toEqual({ zone: 'g:main', index: 1, nested: true });
  });
  it('a content block keeps today\'s behaviour', () => {
    expect(insertTarget(api(null), 'Heading')).toEqual({ zone: 'root:default-zone', index: 2, nested: false });
  });
});

describe('hints', () => {
  it('double intro looks for a CatalogIntro part in a list container whose intro is not hidden', () => {
    const doc = { root: { props: { title: '', description: '', chrome: 'shell' as const } }, content: [
      { type: 'CatalogHero', props: { id: 'h', variant: 'custom' } },
      { type: 'ProductList', props: { id: 'l', intro: 'inherit', content: [{ type: 'CatalogTitle', props: { id: 't' } }] } },
    ] };
    expect(editorHints(doc, 'catalog').some((h) => h.id === 'double-intro')).toBe(false);
    (doc.content[1]!.props.content as ComponentData[]).push({ type: 'CatalogIntro', props: { id: 'i' } });
    expect(editorHints(doc, 'catalog').some((h) => h.id === 'double-intro')).toBe(true);
  });
});
```

Also in `builder-editor-fields.test.ts`: "every schema key and slot has a field" skips `def.container?.legacyProps ?? []`; the static allow-list test compares `field(name, slot).allow` with `slotAllowFor(name, slot)`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test -- test/builder-editor-parts-config.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

`route-bound.ts`: widen `ROUTE_BOUND` already done in Task 11; add

```ts
export function familyOfDoc(docKey: DocKey): PartFamily | null {
  for (const [family, key] of Object.entries(FAMILY_DOC) as Array<[PartFamily, DocKey]>) if (key === docKey) return family;
  return null;
}

/** Required parts of every container that lives on `docKey` (locked against delete/duplicate there). */
export function requiredPartsOn(docKey: DocKey, layout: LayoutKind): ReadonlySet<string> {
  const out = new Set<string>();
  for (const def of Object.values(BLOCKS)) {
    if (def.container && FAMILY_DOC[def.container.family] === docKey) for (const r of requiredParts(def.name, layout)) out.add(r);
  }
  return out;
}
```

`derive-fields.ts`:
- `deriveFields`: `const legacy = new Set(def.container?.legacyProps ?? []);` and `if (slots.has(key) || legacy.has(key)) continue;`.
- Container slot filter shared by the static and scoped lists:

```ts
/** Spec §3.4: a container slot takes its family's parts, content and non-route blocks — `slotAccepts` narrows it. */
function containerSlotAllow(def: AnyBlock, slot: string, candidates: readonly string[]): string[] {
  const only = def.container?.slotAccepts && Object.hasOwn(def.container.slotAccepts, slot) ? def.container.slotAccepts[slot]! : null;
  return candidates.filter((n) => (only ? only.includes(n) : !BLOCKS[n]!.routeBound && !BLOCKS[n]!.container));
}
```

- `slotAllowFor(name, slot?)`: after computing `acceptedOnAll(docs, layouts)`, return `def.container && slot ? containerSlotAllow(def, slot, list) : list`; `blockFields` calls `slotAllowFor(name, slot)` per slot.
- `scopeFields`: per slot, `const list = def.container ? containerSlotAllow(def, slot, allow) : isCardKey(docKey) ? allow.filter((n) => !BLOCKS[n]!.routeBound && !BLOCKS[n]!.container) : allow;`.

`prepare.ts` — before `prepareStyle` in `prepareProps`:

```ts
/** Spec §8: legacy toggles are read only while slots are absent; once every slot is stored, they go. */
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
```

`config.ts`:
- `CATEGORY_ORDER` = `['part', 'content', 'catalogue', 'shell', 'product', 'commerce', 'post-order']`; `export const PART_TITLES: Record<PartFamily, string> = { product: 'Product page parts', catalogue: 'Catalogue parts', 'card-tile': 'Card parts', 'card-row': 'Card parts' };` In `blockMenu`, `title: category === 'part' ? PART_TITLES[familyOfDoc(docKey) ?? 'product'] : CATEGORY_TITLES[category]`.
- In `buildEditorConfig`, compute `const required = requiredPartsOn(docKey, layout);` and per component:

```ts
      ...(isLockedOn(def.name, docKey) || required.has(def.name) ? { permissions: { ...LOCKED } } : def.part ? { permissions: { duplicate: false } } : {}),
      // A container dropped from the drawer arrives with empty slots: give it its default arrangement once.
      ...(def.container ? { resolveData: (data: { props: Props }, params: { trigger: string }) => (params.trigger === 'insert'
        ? { ...data, props: { ...data.props, ...def.container!.defaultSlots(parseBlockProps(def, data.props), { layout, id: String(data.props.id) }) } }
        : data) } : {}),
```

- Root fields: `fields: docKey === 'shell' || isCardKey(docKey) || (docKey === 'product' && layout !== 'storefront') ? {} : ROOT_FIELDS`.
- `editorHints` double intro: replace the `LIST_BLOCKS` check with: a `ProductGrid` / `ProductList` whose `intro !== 'hide'` and whose slots contain `CatalogIntro` (`containsType` over its slot arrays), or a `WholesaleTable` whose `intro !== 'hide'`.

`insert-target.ts` — at the top of `insertTarget`:

```ts
  const def = blockDef(type);
  if (def?.part) {
    const sel = api.appState.ui.itemSelector;
    const zone = sel?.zone;
    if (sel && zone && zone !== ROOT_ZONE && slotAccepts(api, zone, type)) return { zone, index: sel.index + 1, nested: true };
    const home = findContainer(api.appState.data.content as ComponentData[], def.part.family);
    if (home) {
      const slot = blockDef(home.type)!.container!.insertSlot;
      const items = Array.isArray(home.props[slot]) ? (home.props[slot] as unknown[]) : [];
      return { zone: `${home.props.id}:${slot}`, index: items.length, nested: true };
    }
  }
```

with `findContainer(items, family)` a depth-first search over component-shaped arrays for the first block whose `container.family === family` (import `blockDef` from rules.ts).

- [ ] **Step 4: Run tests**

Run: `npm --prefix web test -- test/builder-editor-parts-config.test.ts test/builder-editor-config.test.ts test/builder-editor-fields.test.ts test/builder-editor-route-bound.test.ts test/builder-editor-style-prepare.test.ts test/builder-editor-ui.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- web/src/builder/editor/config.ts web/src/builder/editor/derive-fields.ts web/src/builder/editor/prepare.ts web/src/builder/editor/insert-target.ts web/src/builder/editor/route-bound.ts web/test/builder-editor-parts-config.test.ts web/test/builder-editor-fields.test.ts
git commit -m "feat(editor): parts palette, container allow lists, part locks, insert rules, legacy props (stage 3 §11)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/editor/config.ts web/src/builder/editor/derive-fields.ts web/src/builder/editor/prepare.ts web/src/builder/editor/insert-target.ts web/src/builder/editor/route-bound.ts web/test/builder-editor-parts-config.test.ts web/test/builder-editor-fields.test.ts
```

---

### Task 14: Editor model — upgrade on load, card documents, product sheet, page picker

**Depends on:** Task 12. **Wave 5.** Spec §6.1, §8 (editor load), §10.3, §11 (page picker labels), §16.2, §16.3.

**Files:**
- Modify: `web/src/builder/editor/page-set.ts`, `store.ts`, `page-catalog.ts`
- Create: `web/test/builder-editor-parts-model.test.ts`

**Interfaces:**
- Consumes: `upgradeDoc` (Task 4), `isCardKey`, `cardKey`, `cardKind`, `CARD_KINDS` (types.ts), `isDocKey` (protocol.ts).
- Produces:
  - `docsFromPageSet(pageSet, layout)`: pages (never `shell` or a card key) and `cards.tile` / `cards.row` (as `card:tile` / `card:row`), each `normalizeDoc` then `upgradeDoc`; `product` kept in every layout.
  - `toPageSet(docs, layout, text?)`: card docs go to `set.cards` (absent when none), never to `pages`.
  - `withDoc`: a card doc equal to its default is not stored (absent = built-in design).
  - `isShownIn(docKey, layout)` returns `true` for every doc key (the product sheet and card docs exist in every layout).
  - `store.ts`: `previewProductId: number | null` (initial `null`, kept across loads) and `setPreviewProduct(id: number | null): void`.
  - `page-catalog.ts`: `DOC_LABELS` stays; `docLabel(docKey, docs, layout?)` — `product` outside the storefront → "Product sheet"; `card:tile` → "Product card"; `card:row` → "Product row"; `pageOptions` lists `product` in every layout (label per layout) and a group "Product cards" with both card keys.

- [ ] **Step 1: Write the failing test** (`web/test/builder-editor-parts-model.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { collectIssues, docFor, docsFromPageSet, toPageSet, withDoc } from '@/builder/editor/page-set.ts';
import { prepareDocs } from '@/builder/editor/prepare.ts';
import { docLabel, pageOptions } from '@/builder/editor/page-catalog.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import type { ComponentData, PageSet, PuckDoc } from '@/builder/types.ts';

const d = (content: ComponentData[]): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content });
const oldProduct = d([{ type: 'ProductDetail', props: { id: 'pd', gallery: false, bulkPricing: true, provenance: true, upsells: false, sku: 'inherit' } }]);
const set = (extra: Partial<PageSet> = {}): PageSet => ({ schemaVersion: 1, shell: defaultDoc('shell', 'storefront')!, pages: { product: oldProduct }, ...extra });

describe('upgrade on load (spec §8, Review Focus 1)', () => {
  it('fills an old product doc from its legacy toggles before Puck sees it', () => {
    const docs = docsFromPageSet(set(), 'storefront');
    const pd = docs.product!.content[0]!.props;
    expect(pd.media).toEqual([]);
    expect(pd.below).toEqual([]);
    expect((pd.main as ComponentData[]).map((c) => c.type)).toContain('ProductAddToCart');
  });
  it('the emitted set carries full slots, no legacy props and no issue', () => {
    const docs = docsFromPageSet(set(), 'storefront');
    const out = toPageSet(prepareDocs(docs), 'storefront');
    const pd = out.pages.product!.content[0]!.props;
    for (const s of ['top', 'media', 'main', 'below']) expect(Array.isArray(pd[s])).toBe(true);
    expect(pd.gallery).toBeUndefined();
    expect(collectIssues(prepareDocs(docs), 'storefront')).toEqual([]);
  });
  it('the menu layout keeps its product document (the sheet) and upgrades it to the sheet default', () => {
    const docs = docsFromPageSet(set(), 'menu');
    expect((docs.product!.content[0]!.props.main as ComponentData[])[0]!.type).toBe('ProductGroup');
  });
});

describe('card documents (spec §6.1)', () => {
  const tile = d([{ type: 'CardTile', props: { id: 'CardTile-x', content: [{ type: 'CardTileName', props: { id: 'n' } }] } }]);
  it('load: cards.tile → card:tile; a card key under pages is ignored', () => {
    const docs = docsFromPageSet({ ...set(), cards: { tile }, pages: { ...set().pages, ['card:row' as never]: tile } }, 'storefront');
    expect(docs['card:tile']).toBeDefined();
    expect(docs['card:row']).toBeUndefined();
  });
  it('save: card docs go to cards, never to pages; none ⇒ no cards key', () => {
    const docs = docsFromPageSet({ ...set(), cards: { tile } }, 'storefront');
    const out = toPageSet(docs, 'storefront');
    expect(Object.keys(out.cards!)).toEqual(['tile']);
    expect(Object.keys(out.pages).some((k) => k.startsWith('card:'))).toBe(false);
    expect('cards' in toPageSet(docsFromPageSet(set(), 'storefront'), 'storefront')).toBe(false);
  });
  it('a card doc equal to the built-in design is not stored', () => {
    const docs = docsFromPageSet(set(), 'storefront');
    expect(withDoc(docs, 'card:tile', docFor(docs, 'card:tile', 'storefront'), 'storefront')).toBe(docs);
  });
  it('issues on a card doc carry its key', () => {
    const bad = d([{ type: 'CardTile', props: { id: 'f', content: [{ type: 'CardTileName', props: { id: 'n' } }, { type: 'CardTileAdd', props: { id: 'a' } }] } }]);
    const issues = collectIssues({ ...docsFromPageSet(set(), 'storefront'), 'card:tile': bad }, 'storefront');
    expect(issues.find((i) => i.rule === 'part-requires:CardTileAdd.CardTilePrice')?.docKey).toBe('card:tile');
  });
});

describe('page picker (spec §11)', () => {
  it('labels', () => {
    expect(docLabel('product', {}, 'menu')).toBe('Product sheet');
    expect(docLabel('product', {}, 'storefront')).toBe('Product page');
    expect(docLabel('card:tile', {})).toBe('Product card');
    expect(docLabel('card:row', {})).toBe('Product row');
  });
  it('every layout lists the product doc and a Product cards group', () => {
    for (const layout of ['storefront', 'menu', 'webapp'] as const) {
      const groups = pageOptions({}, layout);
      expect(groups.flatMap((g) => g.options.map((o) => o.docKey))).toContain('product');
      expect(groups.find((g) => g.label === 'Product cards')!.options.map((o) => o.docKey)).toEqual(['card:tile', 'card:row']);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test -- test/builder-editor-parts-model.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

`page-set.ts`:

```ts
export const isShownIn = (_docKey: DocKey, _layout: LayoutKind): boolean => true; // stage 3: the product sheet and card docs exist in every layout

const loaded = (doc: unknown, key: DocKey, layout: LayoutKind): PuckDoc => upgradeDoc(normalizeDoc(doc, key), key, layout);

export function docsFromPageSet(pageSet: PageSet | null, layout: LayoutKind): DocMap {
  if (!pageSet) return { shell: defaultFor('shell', layout)! };
  let docs: DocMap = { shell: loaded(pageSet.shell, 'shell', layout) };
  for (const [key, doc] of Object.entries(pageSet.pages)) {
    if (doc && isDocKey(key) && key !== 'shell' && !isCardKey(key)) docs = withDoc(docs, key, loaded(doc, key, layout), layout);
  }
  for (const kind of CARD_KINDS) {
    const doc = pageSet.cards?.[kind];
    if (doc) docs = withDoc(docs, cardKey(kind), loaded(doc, cardKey(kind), layout), layout);
  }
  return docs;
}

export function toPageSet(docs: DocMap, layout: LayoutKind, text?: PageText): PageSet {
  const pages: PageSet['pages'] = {};
  const cards: NonNullable<PageSet['cards']> = {};
  for (const [key, doc] of Object.entries(docs) as Array<[DocKey, PuckDoc | undefined]>) {
    if (!doc || key === 'shell') continue;
    if (isCardKey(key)) cards[cardKind(key)] = doc;
    else pages[key] = doc;
  }
  const set: PageSet = { schemaVersion: 1, shell: docs.shell ?? defaultFor('shell', layout)!, pages };
  if (Object.keys(cards).length > 0) set.cards = cards;
  if (text && Object.values(text.strings).some((m) => Object.keys(m).length > 0)) set.text = text;
  return set;
}
```

`withDoc`: the sparse check applies when `isFixedRouteKey(docKey) || isCardKey(docKey)`. `defaultFor` also upgrades nothing (the table is already upgraded).

`store.ts`: add `previewProductId: null` to the initial state and `setPreviewProduct(id) { set({ previewProductId: id }); }` (declared on `EditorState` with the doc comment "Preview with (spec §11): the product the product page, sheet and card designer show; null = the default pick."). `load` does not reset it.

`page-catalog.ts`:

```ts
const CARD_LABELS: Record<CardKey, string> = { 'card:tile': 'Product card', 'card:row': 'Product row' };

export function docLabel(docKey: DocKey, docs: DocMap, layout: LayoutKind = 'storefront'): string {
  if (docKey.startsWith('page:')) { /* unchanged */ }
  if (isCardKey(docKey)) return CARD_LABELS[docKey];
  if (docKey === 'product' && layout !== 'storefront') return 'Product sheet';
  return DOC_LABELS[docKey as 'shell' | FixedRouteKey];
}
```

`pageOptions`: drop the `k !== 'product' || layout === 'storefront'` filter, label each option with `docLabel(k, docs, layout)` plus the ` · edited` suffix, and push `{ label: 'Product cards', options: (['card:tile', 'card:row'] as const).map((k) => ({ docKey: k, label: `${CARD_LABELS[k]}${edited(k)}` })) }` after the fixed groups, before custom pages. Update `docLabel` callers that know the layout (the issues menu in `EditorHeader.tsx` is Task 16's file — leave it; the default `'storefront'` keeps it compiling).

- [ ] **Step 4: Run tests**

Run: `npm --prefix web test -- test/builder-editor-parts-model.test.ts test/builder-editor-page-set.test.ts test/builder-editor-store.test.ts test/builder-editor-session.test.ts test/builder-editor-navigation.test.tsx test/builder-editor-ui.test.tsx`
Expected: PASS. Existing assertions that the menu layout hides the product page change meaning by design (spec §7.2, §11): where such an assertion exists, update it to the new behaviour and say so in the report — never loosen an unrelated assertion.

- [ ] **Step 5: Commit**

```bash
git add -- web/src/builder/editor/page-set.ts web/src/builder/editor/store.ts web/src/builder/editor/page-catalog.ts web/test/builder-editor-parts-model.test.ts
git commit -m "feat(editor): upgrade documents on load, card documents in the set, product sheet and card entries in the picker (stage 3 §8, §11)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/editor/page-set.ts web/src/builder/editor/store.ts web/src/builder/editor/page-catalog.ts web/test/builder-editor-parts-model.test.ts
```

(Add any existing test file you had to update to both pathspecs.)

---

### Task 15: Container panel — Parts list, Add, Reset arrangement, notices, card links

**Depends on:** Tasks 13, 14. **Wave 6.** Spec §7.1 (notice), §11 (Container panel, notices, "Edit card design").

**Files:**
- Create: `web/src/builder/editor/container-parts.ts`, `ContainerPanel.tsx`, `ContainerPanel.module.css`, `web/test/builder-editor-container-panel.test.tsx`
- Modify: `web/src/builder/editor/text/BlockText.tsx` (`FieldsWithText` renders `<ContainerPanel />` after the fields, before "Text in this block")

**Interfaces:**
- Consumes: `blockDef`, `requiredParts` (rules.ts); `parseBlockProps`; `partId`, `containsType`; `useEditorStore` (`selectDoc`, `layout`, `docKey`); `usePuck`, `useGetPuck`; `ROOT_ZONE`.
- Produces (pure, `container-parts.ts`):
  - `interface PartState { type: string; label: string; present: boolean; required: boolean }`
  - `partStates(item: ComponentData, layout: LayoutKind): PartState[]` — every part of the container's family available in `layout`, in default order, groups excluded.
  - `withPartAdded(item: ComponentData, type: string, layout: LayoutKind, taken: ReadonlySet<string>): ComponentData` — inserts after the nearest default predecessor present (anywhere in the container), else at the start of the part's default slot; id `partId(item.props.id, type)`, suffixed `-2`, `-3`… if taken.
  - `withDefaultArrangement(item: ComponentData, layout: LayoutKind): ComponentData` — slots replaced by `defaultSlots`, every other prop kept.
  - `CARD_LINKS: Record<string, ReadonlyArray<{ key: CardKey; label: string }>>` — `ProductGrid` → tile + row, `ProductList` → row, `FeaturedProducts` → tile, `ProductUpsells` → tile + row, `Upsells` → tile + row; labels "Edit card design" (tile) / "Edit row design" (row).

- [ ] **Step 1: Load `frontend-design:frontend-design`; write the failing tests**

`web/test/builder-editor-container-panel.test.tsx`:
- **Pure functions** (no Puck): take `defaultDoc('product', 'storefront')!.content[0]`; remove `ProductDescription` and `ProductBulkPricing` from `main`; `partStates` marks both `present: false`, `ProductTitle` `required: true`, excludes `ProductGroup`, and in `menu` excludes `ProductAddToCart`; `withPartAdded(…, 'ProductBulkPricing')` puts it right after `ProductAddToCart` (its nearest present predecessor, since Description is missing); `withPartAdded(…, 'ProductDescription')` then lands between AddToCart and BulkPricing; removing `ProductBreadcrumbs` and re-adding puts it at the start of `top`; an id already taken gets `-2`; `withDefaultArrangement` restores the four slots and keeps `sku: 'hide'`.
- **Component** (Puck mocked via `vi.mock('@/builder/editor/use-puck.ts')` returning a `selectedItem`, a `dispatch` spy and `getSelectorForId`): selecting a container renders a "Parts" list (`role="list"` labelled "Parts") with each part's label and state; clicking **Add** on a removed part dispatches exactly one `{ type: 'replace', destinationIndex, destinationZone: 'root:default-zone', data }` whose `data` equals `withPartAdded(...)`; **Reset arrangement** dispatches one `replace` with `withDefaultArrangement(...)`; a required part has no Add button and reads "Required"; selecting a non-container renders nothing.
- **Notices:** with `features.wholesale` on and a `ProductGrid` selected → "Wholesale mode is on: shoppers see the trade list here. This arrangement shows when wholesale mode is off."; with `ProductDetail` selected in the `menu` layout → "In the menu and web app the add to cart button is pinned to the sheet's footer, within thumb reach, so it isn't part of this arrangement."
- **Card links:** selecting `ProductGrid` shows "Edit card design" and "Edit row design"; clicking the first calls `useEditorStore.getState().selectDoc('card:tile')`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test -- test/builder-editor-container-panel.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement**

`container-parts.ts`:

```ts
import { parseBlockProps } from '@/builder/define.ts';
import { blockDef, requiredParts } from '@/builder/rules.ts';
import { BLOCKS } from '@/builder/registry.ts';
import { containsType, partId } from '@/builder/parts.ts';
import type { CardKey, ComponentData, LayoutKind } from '@/builder/types.ts';

export interface PartState { type: string; label: string; present: boolean; required: boolean }

const isGroup = (type: string) => (blockDef(type)?.slots.length ?? 0) > 0;
const asItems = (v: unknown): ComponentData[] => (Array.isArray(v) ? (v as ComponentData[]) : []);

/** Depth-first types of a default slot, groups left out (they are wrappers, not pieces). */
function flatTypes(items: readonly ComponentData[]): string[] {
  const out: string[] = [];
  for (const c of items) {
    if (!isGroup(c.type)) out.push(c.type);
    for (const s of blockDef(c.type)?.slots ?? []) out.push(...flatTypes(asItems(c.props[s])));
  }
  return out;
}

function defaultsOf(item: ComponentData, layout: LayoutKind): Record<string, ComponentData[]> {
  const def = blockDef(item.type)!;
  return def.container!.defaultSlots(parseBlockProps(def, item.props), { layout, id: item.props.id });
}

export function partStates(item: ComponentData, layout: LayoutKind): PartState[] {
  const def = blockDef(item.type);
  if (!def?.container) return [];
  const required = new Set(requiredParts(def.name, layout));
  const inside = def.slots.flatMap((s) => asItems(item.props[s]));
  const defaults = defaultsOf(item, layout);
  const order = def.slots.flatMap((s) => flatTypes(defaults[s] ?? []));
  const family = Object.values(BLOCKS).filter((b) => b.part?.family === def.container!.family && !isGroup(b.name)
    && (b.layouts === 'all' || b.layouts.includes(layout))).map((b) => b.name);
  const rank = (t: string) => (order.includes(t) ? order.indexOf(t) : order.length);
  return family.sort((a, b) => rank(a) - rank(b)).map((type) => ({
    type, label: blockDef(type)!.label, present: containsType(inside, type), required: required.has(type),
  }));
}

function insertAfter(items: readonly ComponentData[], anchor: string, node: ComponentData): ComponentData[] | null {
  for (let i = 0; i < items.length; i += 1) {
    const c = items[i]!;
    if (c.type === anchor) return [...items.slice(0, i + 1), node, ...items.slice(i + 1)];
    for (const s of blockDef(c.type)?.slots ?? []) {
      const next = insertAfter(asItems(c.props[s]), anchor, node);
      if (next) return items.map((x, j) => (j === i ? { ...x, props: { ...x.props, [s]: next } } : x));
    }
  }
  return null;
}

const withSlot = (item: ComponentData, slot: string, items: ComponentData[]): ComponentData => ({ ...item, props: { ...item.props, [slot]: items } });

export function withPartAdded(item: ComponentData, type: string, layout: LayoutKind, taken: ReadonlySet<string>): ComponentData {
  const def = blockDef(item.type)!;
  const defaults = defaultsOf(item, layout);
  const home = def.slots.find((s) => flatTypes(defaults[s] ?? []).includes(type)) ?? def.container!.insertSlot;
  const order = flatTypes(defaults[home] ?? []);
  const base = partId(item.props.id, type);
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  const node: ComponentData = { type, props: { id } };
  for (let i = order.indexOf(type) - 1; i >= 0; i -= 1) {
    for (const s of def.slots) {
      const next = insertAfter(asItems(item.props[s]), order[i]!, node);
      if (next) return withSlot(item, s, next);
    }
  }
  return withSlot(item, home, [node, ...asItems(item.props[home])]);
}

export function withDefaultArrangement(item: ComponentData, layout: LayoutKind): ComponentData {
  return { ...item, props: { ...item.props, ...defaultsOf(item, layout) } };
}

export const CARD_LINKS: Record<string, ReadonlyArray<{ key: CardKey; label: string }>> = {
  ProductGrid: [{ key: 'card:tile', label: 'Edit card design' }, { key: 'card:row', label: 'Edit row design' }],
  ProductList: [{ key: 'card:row', label: 'Edit row design' }],
  FeaturedProducts: [{ key: 'card:tile', label: 'Edit card design' }],
  ProductUpsells: [{ key: 'card:tile', label: 'Edit card design' }, { key: 'card:row', label: 'Edit row design' }],
  Upsells: [{ key: 'card:tile', label: 'Edit card design' }, { key: 'card:row', label: 'Edit row design' }],
};
```

`ContainerPanel.tsx`: reads `usePuck((s) => s.selectedItem)`, `useGetPuck()`, `usePuck((s) => s.dispatch)`, the store's `layout` / `docKey`, `useSettings().features.wholesale`. For a container: a `<section aria-labelledby>` titled "Parts" with a `<ul role="list" aria-label="Parts">`, one `<li>` per `PartState` (label; state text "On the page" / "Removed" / "Required"; an **Add** `<button>` only for removed optional parts), then a **Reset arrangement** button (`aria-describedby` hint "Puts every part back where it starts. Your content blocks inside are removed; settings are kept.") — both dispatch one `replace`:

```ts
const commit = (next: ComponentData) => {
  const sel = getPuck().getSelectorForId(next.props.id);
  if (!sel) return;
  dispatch({ type: 'replace', destinationIndex: sel.index, destinationZone: sel.zone ?? ROOT_ZONE, data: next });
};
```

(`taken` for `withPartAdded` = every id in the current doc: walk `getPuck().appState.data.content` with `forEachComponent` from page-set.ts.) Notices use the exact copy from Step 1 (editor-only strings; `role="note"`). The card links render for `CARD_LINKS[selected.type]` as buttons calling `useEditorStore.getState().selectDoc(key)`. All buttons ≥ 44 px tall, `--sfb-*` colours, `:focus-visible` ring, no motion beyond the editor's existing transitions (respect `prefers-reduced-motion`).

`text/BlockText.tsx`: `FieldsWithText` returns `<>{children}<ContainerPanel />{rows.length > 0 && …}</>`.

- [ ] **Step 4: Run tests**

Run: `npm --prefix web test -- test/builder-editor-container-panel.test.tsx test/builder-editor-text-panel.test.tsx test/builder-editor-text-placement.test.tsx test/builder-editor-ui.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- web/src/builder/editor/container-parts.ts web/src/builder/editor/ContainerPanel.tsx web/src/builder/editor/ContainerPanel.module.css web/src/builder/editor/text/BlockText.tsx web/test/builder-editor-container-panel.test.tsx
git commit -m "feat(editor): container Parts panel with Add, Reset arrangement, notices and card links (stage 3 §11)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/editor/container-parts.ts web/src/builder/editor/ContainerPanel.tsx web/src/builder/editor/ContainerPanel.module.css web/src/builder/editor/text/BlockText.tsx web/test/builder-editor-container-panel.test.tsx
```

---

### Task 16: Preview product, sheet canvas, exact preview of the sheet

**Depends on:** Tasks 13, 14. **Wave 6.** Spec §11 (Preview product, Sheet canvas, exact preview).

**Files:**
- Create: `web/src/builder/editor/preview-product.ts`, `SheetStage.tsx`, `SheetStage.module.css`, `web/test/builder-editor-preview-product.test.tsx`
- Modify: `web/src/builder/editor/fixtures.ts`, `fixture-api.ts`, `fixture-routes.tsx`, `ExactPreview.tsx`, `EditorHeader.tsx`, `page-ground.tsx`

**Interfaces:**
- Consumes: `previewProductId`, `setPreviewProduct` (Task 14); `ProductHostContext`; `ProductSheetBody`, `SheetLoading` (Task 9); `AddToCart`; `useCatalog`.
- Produces:
  - `fixtures.ts`: `FIXTURE_PRODUCT: Product` — id `900201`, "Northbound Trail Oats 1kg", SKU `NB-TO-01`, price 12, description, one tier, provenance, `imageProductId: null`, category null.
  - `preview-product.ts`: `pickPreviewProduct(products: readonly Product[], chosen: number | null): Product` (chosen → first with a photo → first → `FIXTURE_PRODUCT`); `usePreviewProduct(): Product`.
  - `fixtureLocation(docKey, productId, layout)`: `{ pattern, path, params?: Record<string, string> }` — `product` outside the storefront → `doc/product` plus `{ p: String(productId) }`; card keys → `doc/card-tile` / `doc/card-row`.
  - `SheetStage({ children })`: the menu / web-app `product` canvas.
  - `EditorHeader`: `PreviewProductPicker` (a native `<select>` labelled "Preview with") on `product` and card docs.

- [ ] **Step 1: Load `frontend-design:frontend-design`; write the failing tests**

`web/test/builder-editor-preview-product.test.tsx`:
- `pickPreviewProduct([], null)` is `FIXTURE_PRODUCT`; with `[a (no photo), b (photo)]` and `null` → `b`; chosen `a.id` → `a`; a chosen id no longer in the catalogue → `b`.
- `fixtureLocation('product', 7, 'storefront')` → `{ pattern: 'p/:id', path: 'p/7' }`; `fixtureLocation('product', 7, 'menu')` → `{ pattern: 'doc/:docKey', path: 'doc/product', params: { p: '7' } }`; `fixtureLocation('card:tile', 7, 'menu').path` → `doc/card-tile`.
- The fixture interceptor answers `GET /api/catalog/products/900201` and `/api/storefront/catalog/products/900201` with `FIXTURE_PRODUCT` (200) without touching the network.
- `SheetStage` (store in `menu`, catalogue mocked with one product) renders a 420 px column: an `inert` header copy (eyebrow text, close icon), the children inside a `ProductHostContext` whose `productId` is the preview product and whose `SheetBody` is `ProductSheetBody`, and an `inert` footer copy holding the add button; `ProductAddToCart` inside the doc renders nothing.
- `PreviewProductPicker` lists the catalogue products (and "Northbound Trail Oats 1kg (sample)" when empty); choosing one calls `setPreviewProduct(id)`; it is absent on the `catalog` doc.
- `ExactRuntime` for `product` in `menu` resolves the `catalog` route key (the catalogue opens with `?p=`).

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test -- test/builder-editor-preview-product.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement**

`preview-product.ts`:

```ts
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { FIXTURE_PRODUCT } from '@/builder/editor/fixtures.ts';
import type { Product } from '@/types/catalog.ts';

/** Spec §11 "Preview with": the chosen product, else the first with a photo, else the first, else the sample. */
export function pickPreviewProduct(products: readonly Product[], chosen: number | null): Product {
  return (chosen !== null ? products.find((p) => p.id === chosen) : undefined)
    ?? products.find((p) => p.imageProductId !== null) ?? products[0] ?? FIXTURE_PRODUCT;
}

export function usePreviewProduct(): Product {
  const chosen = useEditorStore((s) => s.previewProductId);
  const { data } = useCatalog();
  return pickPreviewProduct(data?.products ?? [], chosen);
}
```

`fixture-api.ts` — first check in the interceptor:

```ts
    const FIXTURE_PRODUCT_PATH = `catalog/products/${FIXTURE_PRODUCT.id}`;
    if (method === 'GET' && (path === FIXTURE_PRODUCT_PATH || path === `storefront/${FIXTURE_PRODUCT_PATH}`)) return respond(200, FIXTURE_PRODUCT);
```

`fixture-routes.tsx`: `fixtureLocation(docKey, productId, layout)` per the Interfaces (`case 'product': return layout === 'storefront' ? { pattern: 'p/:id', path: \`p/${productId ?? 0}\` } : { pattern: 'doc/:docKey', path: 'doc/product', params: { p: String(productId ?? 0) } };`); `FixtureRoutes` reads `layout` from the store and `usePreviewProduct().id`, and builds the target search from `location.search` with `p` set from `params.p` or deleted when there is none (so leaving the sheet doc drops `?p=`).

`ExactPreview.tsx`: `routeKeyFor(docKey, layout)` → `'catalog'` for `shell`, card keys and `product` outside the storefront; else `docKey`.

`SheetStage.tsx`:

```tsx
/**
 * The menu / web-app product sheet on the canvas (spec §11): the editable document in a 420 px
 * column between non-interactive copies of the sheet's header and pinned add-to-cart footer.
 */
export function SheetStage({ children }: { children: ReactNode }) {
  const product = usePreviewProduct();
  const host = useMemo<ProductHost>(() => ({ productId: product.id, onSelect: () => {}, surface: 'sheet', SheetBody: ProductSheetBody }), [product.id]);
  return (
    <div className={styles.stage} data-sf-builder-sheet="">
      <div className={styles.sheet}>
        <div className={styles.chrome} inert aria-hidden="true">{/* eyebrow: product.categoryName or 'Product'; a close icon */}</div>
        <div className={sheetClasses.body}>
          <ProductHostContext.Provider value={host}>{children}</ProductHostContext.Provider>
        </div>
        <div className={styles.chrome} inert aria-hidden="true"><AddToCart product={product} size="lg" /></div>
      </div>
    </div>
  );
}
```

(`sheetClasses` = `ProductDetailSheet.module.css`; `.sheet` is `width: min(420px, 100%)`, centred, `--sfb-*` frame colours, no horizontal overflow at 360 px.) The eyebrow reuses `ProductDetailSheet.module.css` `.head` / `.eyebrow` / `.close` classes with `useText().t('product.detail.product')` as the fallback text (shop text, so through the text layer).

`page-ground.tsx`: `if (docKey === 'product' && layout !== 'storefront') return <div data-sf-builder-canvas="" className={styles.ground} data-layout={layout}><SheetStage>{children}</SheetStage></div>;` before the existing return.

`EditorHeader.tsx`: `PreviewProductPicker` (native `<select>` with a visible "Preview with" label, `aria-label="Preview with"`, options from `useCatalog()` — `displayName`, or the sample's name + " (sample)" when the catalogue is empty; value `usePreviewProduct().id`; `onChange` → `setPreviewProduct(Number(value))`), rendered in the header's end group when `docKey === 'product' || isCardKey(docKey)`. Pass `layout` to `docLabel` where the issues menu labels a doc.

- [ ] **Step 4: Run tests**

Run: `npm --prefix web test -- test/builder-editor-preview-product.test.tsx test/builder-editor-fixture-api.test.ts test/builder-editor-fixture-mode.test.ts test/builder-editor-exact-preview.test.tsx test/builder-editor-navigation.test.tsx test/builder-editor-ui.test.tsx test/builder-editor-page-ground.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- web/src/builder/editor/preview-product.ts web/src/builder/editor/SheetStage.tsx web/src/builder/editor/SheetStage.module.css web/src/builder/editor/fixtures.ts web/src/builder/editor/fixture-api.ts web/src/builder/editor/fixture-routes.tsx web/src/builder/editor/ExactPreview.tsx web/src/builder/editor/EditorHeader.tsx web/src/builder/editor/page-ground.tsx web/test/builder-editor-preview-product.test.tsx
git commit -m "feat(editor): Preview with, the product sheet canvas and its exact preview (stage 3 §11)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/editor/preview-product.ts web/src/builder/editor/SheetStage.tsx web/src/builder/editor/SheetStage.module.css web/src/builder/editor/fixtures.ts web/src/builder/editor/fixture-api.ts web/src/builder/editor/fixture-routes.tsx web/src/builder/editor/ExactPreview.tsx web/src/builder/editor/EditorHeader.tsx web/src/builder/editor/page-ground.tsx web/test/builder-editor-preview-product.test.tsx
```

---

### Task 17: Card designer canvas — card stage, state copies, drafts on the canvas

**Depends on:** Task 16. **Wave 7.** Spec §6.2 (canvas provider), §11 (card designer), §16.10.

**Files:**
- Create: `web/src/builder/editor/card-states.ts`, `CardStage.tsx`, `CardStage.module.css`, `web/test/builder-editor-card-stage.test.tsx`
- Modify: `web/src/builder/editor/page-ground.tsx` (card branch), `web/src/builder/editor/EditorCanvas.tsx` (draft `CardDesignProvider`)

**Interfaces:**
- Consumes: `usePreviewProduct` (Task 16); `CardDesignProvider` (Task 7); `CardTileFamily`, `CardRowFamily`, `CardData`; `TILE_VIEWS`, `ProductCard` (ProductCard.tsx), `ROW_VIEWS`, `ProductRow` (ProductRow.tsx); `prepareDoc` / `prepareDocs`; `cardKind`.
- Produces:
  - `card-states.ts`: `cardStates(product: Product): Array<{ label: string; product: Product }>` — "Out of stock" (`inStock: false, isPreorder: false`), "Pre-order, minimum 3" (`isPreorder: true, preorderEta: <product's or a fixed ISO date>, minOrderQuantity: 3`), "No photo" (`imageProductId: null`); clones, never saved.
  - `CardStage({ kind, children })`.
  - `draftCards(docs: DocMap): PageSet['cards'] | undefined` (EditorCanvas helper, exported for tests).

- [ ] **Step 1: Load `frontend-design:frontend-design`; write the failing test**

`web/test/builder-editor-card-stage.test.tsx`:
- `cardStates(p)` returns three clones with exactly those fields flipped and `p` untouched.
- `CardStage kind="tile"` (store on `card:tile`, one catalogue product with a photo) renders `[data-sf-part="product-grid"]` whose first child is the editable card (the children, inside a `CardTileFamily` provider carrying the preview product with `index: 0`, `eager: true`, `hasSiblingImages: true`) followed by three `inert` copies labelled by their state (`aria-label` on a `display: contents` wrapper); the "Out of stock" copy shows the out-of-stock chip; the "No photo" copy shows the empty well.
- With a draft `card:tile` doc (price above name) in the store and `draftCards` feeding `CardDesignProvider`, the copies render the compiled draft (price precedes name); after the draft becomes invalid (add without price), the copies fall back to the built-in card.
- `CardStage kind="row"` renders a `ul` with the rows list class and `li` children.
- `draftCards({ shell, 'card:row': doc })` → `{ row: prepared doc }`; no card docs → `undefined`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix web test -- test/builder-editor-card-stage.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement**

`CardStage.tsx`:

```tsx
/**
 * The card designer's canvas (spec §11): the one editable card for the preview product, then
 * compiled, inert copies for derived states, inside the real grid (tiles) or rows list (rows), so
 * the active template's grid rules apply.
 */
export function CardStage({ kind, children }: { kind: CardKind; children: ReactNode }) {
  const product = usePreviewProduct();
  const states = useMemo(() => cardStates(product), [product]);
  const data = useMemo<CardData>(() => ({ product, index: 0, eager: true, hasSiblingImages: true, onSelect: () => {} }), [product]);
  if (kind === 'tile') {
    return (
      <div className={gridClasses.grid} data-sf-part="product-grid">
        <CardTileFamily.Provider value={{ data, views: TILE_VIEWS }}>{children}</CardTileFamily.Provider>
        {states.map((s, i) => (
          <div key={s.label} inert aria-label={s.label} className={styles.copy}>
            <ProductCard product={s.product} index={i + 1} hasSiblingImages />
          </div>
        ))}
      </div>
    );
  }
  return (
    <ul className={listClasses.rows}>
      <li><CardRowFamily.Provider value={{ data, views: ROW_VIEWS }}>{children}</CardRowFamily.Provider></li>
      {states.map((s) => (
        <li key={s.label} inert aria-label={s.label}><ProductRow product={s.product} onSelect={() => {}} /></li>
      ))}
    </ul>
  );
}
```

(`.copy { display: contents; }`; `gridClasses` = `ProductGrid.module.css`, `listClasses` = `ProductList.module.css`.) The copies are `ProductCard` / `ProductRow`, so they read the draft design from the canvas `CardDesignProvider` and fall back to built-in exactly as the shop does.

`page-ground.tsx`: `if (isCardKey(docKey)) return <div data-sf-builder-canvas="" className={styles.ground} data-layout={layout}><div className={styles.column} data-sf-builder-column=""><CardStage kind={cardKind(docKey)}>{children}</CardStage></div></div>;`.

`EditorCanvas.tsx`:

```tsx
export function draftCards(docs: DocMap): PageSet['cards'] | undefined {
  const cards: NonNullable<PageSet['cards']> = {};
  for (const kind of CARD_KINDS) { const doc = docs[cardKey(kind)]; if (doc) cards[kind] = prepareDoc(doc); }
  return Object.keys(cards).length > 0 ? cards : undefined;
}
```

In `EditorCanvas` and `ReadOnlyView`: `const docs = useEditorStore((s) => s.docs); const cards = useMemo(() => draftCards(docs), [docs]);` and wrap the Puck host (and the read-only `DocBoundary`) in `<CardDesignProvider cards={cards} layout={layout}>`. (The exact preview already gets the draft through `PuckShell`.)

- [ ] **Step 4: Run tests**

Run: `npm --prefix web test -- test/builder-editor-card-stage.test.tsx test/builder-editor-ui.test.tsx test/builder-editor-page-ground.test.ts test/builder-editor-exact-preview.test.tsx`
Expected: PASS. Then the full unit suite `npm --prefix web test` and `npm --prefix web run build` (isolation check).

- [ ] **Step 5: Commit**

```bash
git add -- web/src/builder/editor/card-states.ts web/src/builder/editor/CardStage.tsx web/src/builder/editor/CardStage.module.css web/src/builder/editor/page-ground.tsx web/src/builder/editor/EditorCanvas.tsx web/test/builder-editor-card-stage.test.tsx
git commit -m "feat(editor): card designer canvas with derived-state copies; draft designs on the canvas (stage 3 §11)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- web/src/builder/editor/card-states.ts web/src/builder/editor/CardStage.tsx web/src/builder/editor/CardStage.module.css web/src/builder/editor/page-ground.tsx web/src/builder/editor/EditorCanvas.tsx web/test/builder-editor-card-stage.test.tsx
```

---

### Task 18: End-to-end — product parts, card designs, editor; full verification — Playwright owner

**Depends on:** all. **Wave 8.** Spec §13 (e2e), §12 (gates), overview "Gates per stage".

**Files:**
- Create: `e2e/product-parts.spec.ts`
- Modify: `e2e/page-sets.ts` (additions only), `e2e/builder-editor.spec.ts` (additions only), `docs/builder.md` (editor subsection)

**Interfaces:**
- Consumes: `installMocks({ layout, pages, tweakSettings })`, the e2e catalogue fixture (read `e2e/fixtures/catalog.json` for product ids with / without photos and with tiers), the templates list the templates specs iterate.
- Produces (`e2e/page-sets.ts`): `productPartsSet(layout)`, `menuSheetSet()`, `gridArrangedSet()`, `listNoIntroSet()`, `tileDesignSet(layout)`, `rowDesignSet(layout)`, `brokenTileSet(layout)`, `legacyProductSet()`, `wholesaleArrangedSet()`.

- [ ] **Step 1: Page sets**

Add to `e2e/page-sets.ts` (reuse the file's `c`, `doc`, `shell` helpers):

```ts
const p = (type: string, id = `${type}-e2e`, props: Record<string, unknown> = {}) => c(type, props, id);
const g = (kind: string, items: ComponentData[], type = 'ProductGroup', id = `${type}-${kind}-e2e`) => c(type, { kind, items }, id);

/** Description above the price, a RichText between add to cart and bulk pricing, upsells removed. */
export function productPartsSet(layout: Layout): PageSet {
  return { schemaVersion: 1, shell: shell(layout, c('Footer')), pages: { product: doc([c('ProductDetail', {
    top: [p('ProductBreadcrumbs')], media: [p('ProductGallery')],
    main: [p('ProductTitle'), p('ProductDescription'), g('priceRow', [p('ProductPrice'), p('ProductStock')]), p('ProductAddToCart'),
      c('RichText', { bodyHtml: '<p>Packed to order at Northbound Supply.</p>' }, 'between-rt'), p('ProductBulkPricing'), p('ProductProvenance'), p('ProductAsk')],
    below: [],
  }, 'pd-e2e')]) } };
}
/** A product document without the add button: must render the default page. */
export function productWithoutAddSet(): PageSet {
  const set = productPartsSet('storefront');
  const pd = set.pages.product!.content[0]!;
  const main = (pd.props.main as ComponentData[]).filter((x) => x.type !== 'ProductAddToCart');
  return { ...set, pages: { product: doc([{ ...pd, props: { ...pd.props, main } }]) } };
}
/** The menu sheet with bulk pricing first; the add button stays in the footer. */
export function menuSheetSet(layout: 'menu' | 'webapp' = 'menu'): PageSet {
  return { schemaVersion: 1, shell: shell(layout, c('Footer')), pages: { product: doc([c('ProductDetail', {
    top: [], media: [], below: [p('ProductUpsells')],
    main: [p('ProductBulkPricing'), g('identity', [g('identityText', [p('ProductTitle'), p('ProductStock')]), p('ProductGallery')]), p('ProductPrice'), p('ProductDescription')],
  }, 'pd-sheet-e2e')]) } };
}
/** Search moved into main, rail removed (noNav). */
export function gridArrangedSet(): PageSet {
  return { schemaVersion: 1, shell: shell('storefront', c('Footer')), pages: { catalog: doc([c('ProductGrid', {
    top: [p('CatalogIntro')], rail: [], main: [p('CatalogSearch'), p('CatalogTitle'), p('CatalogEmpty'), p('CatalogResults')],
  }, 'grid-arr-e2e')]) } };
}
export function listNoIntroSet(layout: 'menu' | 'webapp' = 'menu'): PageSet {
  return { schemaVersion: 1, shell: shell(layout, c('Footer')), pages: { catalog: doc([c('ProductList', {
    content: [p('CatalogTitle'), p('CatalogEmpty'), p('CatalogResults')] }, 'list-e2e')]) } };
}
/** Price above name, flags removed; used by the grid, FeaturedProducts on a custom page and page upsells. */
export function tileDesignSet(layout: Layout): PageSet {
  const tile = doc([c('CardTile', { content: [p('CardTileImage', 't-img'), g('body', [
    p('CardTilePrice', 't-price'), p('CardTileName', 't-name'), g('foot', [p('CardTileAdd', 't-add')], 'CardTileGroup', 't-foot'),
  ], 'CardTileGroup', 't-body')] }, 'tile-e2e')]);
  return { ...storySet(layout), pages: { ...storySet(layout).pages,
    'page:featured': doc([c('FeaturedProducts', { title: 'Featured', source: 'category', categoryId: null, limit: 4, items: [] }, 'feat-e2e')], 'Featured · Northbound Supply') },
    cards: { tile } };
}
/** A row design (price first) for the list and the sheet's upsells. */
export function rowDesignSet(layout: 'menu' | 'webapp' = 'menu'): PageSet {
  const row = doc([c('CardRow', { content: [p('CardRowPrice', 'r-price'), g('text', [p('CardRowName', 'r-name')], 'CardRowGroup', 'r-text'), p('CardRowAdd', 'r-add')] }, 'row-e2e')]);
  return { schemaVersion: 1, shell: shell(layout, c('Footer')), pages: {}, cards: { row } };
}
/** Add button without price: must fall back to the built-in card. */
export function brokenTileSet(layout: Layout): PageSet {
  const tile = doc([c('CardTile', { content: [p('CardTileName', 'b-name'), p('CardTileAdd', 'b-add')] }, 'tile-broken-e2e')]);
  return { schemaVersion: 1, shell: shell(layout, c('Footer')), pages: {}, cards: { tile } };
}
/** A v0.7.0-shaped product document: no slots, gallery off, upsells off. */
export function legacyProductSet(): PageSet {
  return { schemaVersion: 1, shell: shell('storefront', c('Footer')), pages: { product: doc([c('ProductDetail', { gallery: false, upsells: false }, 'pd-legacy')]) } };
}
```

- [ ] **Step 2: `e2e/product-parts.spec.ts`**

One `test` per case, each with `installMocks(page, { layout, pages: { [layout]: set } })`, then `page.goto(...)`; use a product id from the catalogue fixture that has a photo, tiers, provenance and a curated upsell (read the fixture; name it `P` at the top of the spec). Assertions:
1. **Rearranged product page** (`productPartsSet`, `/p/P`): the description's bounding box top < the price's; the text "Packed to order at Northbound Supply." sits after the add button and before `#bulk-heading` in DOM order (`page.evaluate` compareDocumentPosition); no `#upsells-heading`.
2. **Missing add button** (`productWithoutAddSet`): the default page renders (upsells heading present, the RichText absent).
3. **Menu sheet** (`menuSheetSet('menu')`, `/?p=P`): inside `[data-sf-part="sheet"]`, the "Bulk pricing" block precedes `[data-sf-part="sheet-title"]`; click the footer add button → the cart count becomes 1 (as `storefront.spec.ts` asserts a cart add).
4. **Grid arrangement** (`gridArrangedSet`, `/`): `.layout` has the `noNav` class (match `[class*="noNav"]`), the search input is inside the grid's column, no category rail.
5. **List without intro** (`listNoIntroSet('menu')`): no hero slot (`[data-sf-slot="CatalogHero"]` count 0), groups render.
6. **Tile design** (`tileDesignSet('storefront')`): in `[data-sf-part="product-grid"]` the first card's price precedes its name link and it has no flags element; the same on `/pages/featured` and in the product page's upsells (`/p/P`).
7. **Row design** (`rowDesignSet('menu')`): list rows show the price before the name; the sheet's upsell rows too.
8. **Broken tile** (`brokenTileSet('storefront')`): cards show the built-in order (name before price).
9. **Legacy product doc** (`legacyProductSet`, `/p/P`): no `.media` column (`[class*="layoutNoImage"]` present), no `#upsells-heading`.
10. **Wholesale ignores the arrangement** (`gridArrangedSet` + `tweakSettings: (s) => { s.features.wholesale = true; }`): the trade list renders, no `[data-sf-part="product-grid"]`.
11. **No overflow at 360 px under every built-in template:** for each of the cases 1, 3, 4, 6, 7 and every template id the templates spec uses (read `e2e/template-theme.ts` / `templates.spec.ts` for how a template is selected in mocks), at viewport 360×800: `document.documentElement.scrollWidth <= 360`.

- [ ] **Step 3: `e2e/builder-editor.spec.ts` additions**

Using the spec's existing editor harness (read its first tests: how it loads a page set into `/__builder` and reads the posted `sf-builder-change`):
1. Parts appear only in the product page's drawer: the "Product page parts" group is present on `product` and absent on a custom page.
2. Drag (or use the outline) to move `ProductDescription` above `ProductPrice`; the next posted change's `product` doc has `ProductDescription` before the price group in `main`.
3. `ProductPrice` selected: no delete action in its action bar.
4. Remove `ProductBulkPricing`; the Parts list shows it "Removed"; **Add** restores it after `ProductAddToCart` / `ProductDescription` (its default place) in the next change.
5. **Reset arrangement** restores the four default slots in one change; one Undo brings the previous arrangement back.
6. A `ProductPrice` dropped at the document root (drag onto the root zone) shows the `part-placement:ProductPrice` issue highlighted, and the posted change carries it in `issues`.
7. Card designer: pick "Product card" in the page picker; drag `CardTilePrice` above `CardTileName`; the three state copies update to the new order; switch to "Catalogue": the canvas grid shows price-first cards; the posted change has `pageSet.cards.tile` and no `pages['card:tile']`.
8. Load the `legacyProductSet()` set, open "Product page", change the Title part's style once: the posted `product` doc has array `top` / `media` / `main` / `below` (none `[]` except `media` and `below`, which the legacy toggles empty) and no `gallery` / `upsells` keys.

- [ ] **Step 4: Docs**

`docs/builder.md` → "The editor (`/__builder`)": a subsection "Parts and card designs" (palette per family; allow lists; locks; Parts panel Add / Reset; notices; Preview with; sheet canvas; card designer and state copies; the canvas `CardDesignProvider`).

- [ ] **Step 5: Full verification**

Run, in order, and paste the tail of each into the report:
- `npm --prefix web run typecheck`
- `npm --prefix web test` — all green.
- `npm --prefix web run build` — success; re-check Task 12's entry-chunk grep (`bulk-heading`, `provenance-heading`, `priceBand` absent from `index-*.js`).
- `npm run test:e2e` — the whole suite green, including `dom-parity.spec.ts`, `templates-baseline*.spec.ts`, `product-parts.spec.ts`, `builder-editor.spec.ts`; **no snapshot written** (`git status --short e2e/` shows only the two edited specs, `page-sets.ts` and the new spec).

- [ ] **Step 6: Commit**

```bash
git add -- e2e/product-parts.spec.ts e2e/page-sets.ts e2e/builder-editor.spec.ts docs/builder.md
git commit -m "test(e2e): product parts, card designs and the parts editor; stage 3 full verification

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015prWiSdK9Tgbwfp2fhZsB4" -- e2e/product-parts.spec.ts e2e/page-sets.ts e2e/builder-editor.spec.ts docs/builder.md
```

---

## Spec deviations (for the reviewer)

1. **Where views live.** The spec names `product-parts.tsx`, `catalogue-parts.tsx`, `card-parts.tsx` as the view homes. Existing source-scanning tests (`templates-parts.test.ts`, `motion-usage.test.ts`) pin `data-sf-part`, `rowAnim(` and `FADE` to `ProductDetailPage.tsx`, `ProductDetailSheet.tsx`, `ProductGrid.tsx`, `ProductList.tsx`, `ProductCard.tsx`, `ProductRow.tsx` and must pass unedited, so each surface's views live in its v0.7.0 file; `product-parts.tsx` and `catalogue-parts.tsx` hold only the views shared by two surfaces. There is no `card-parts.tsx`.
2. **One views map per surface**, not per family: the page and the sheet (and the grid and the list) hand down different view maps under the same family context.
3. **Card frames render through their family's `PartHost`**, not a lazy container view: a compiled design is built once and each card supplies the context (spec §6.3), so the frame must render from that context like a part.
4. **`CardDesign.render(data, views)`** takes the views (they live in the lazy feature chunks; `cards.ts` is in the entry bundle). The spec wrote `design.render(props)`.
5. **`ProductHost.SheetBody`.** The host context carries the sheet surface component, so the sheet renders synchronously (no lazy product-page chunk, no Suspense flash) and the existing synchronous sheet tests pass unedited.
6. **Groups are not `unique`** (`ProductGroup`, `CardTileGroup`, `CardRowGroup`): the sheet default uses two `ProductGroup`s and the tile default two `CardTileGroup`s (spec §4 says "every part").
7. **`slot-accepts` also refuses route blocks and containers in any container slot** — the spec's §3.4 editor rule made enforceable for stored documents.
8. **In the storefront layout a `ProductList`'s sheet keeps the built-in sheet document**: the storefront `product` document is a page (breadcrumbs, add button) and must not leak into a sheet.
9. **`containsType` follows component-shaped arrays** instead of registered slots, keeping `parts.ts` registry-free (part blocks import it while the registry is still loading). Equivalent for guarded documents.

## Cross-plan contract assumptions

- `PageSet.cards?: { tile?: PuckDoc; row?: PuckDoc }` exactly as the backend plan (strict, kinds `tile` / `row` only). The storefront sends `cards` only when a kind is present — never `null`, never `{}` — and accepts `{}` / absent alike on read.
- Editor doc keys and issue `docKey`s for designs are `card:tile` / `card:row`; `sf-builder-select-page` accepts them (`isDocKey`). Editor picker labels "Product card" / "Product row" and group "Product cards" match the admin labels.
- Card-document issue rules and messages the admin may show: `part-requires:CardTileAdd.CardTilePrice` — "A product card with an add button must also show the price." (and the row twin); `exactly-one:CardTile` / `exactly-one:CardRow`; `part-required:CardTile.CardTileName`; `part-placement:<Part>`.
- Protocol stays `1`; `cards` is the only new field in `sf-builder-load` / `sf-builder-change`. Card document root props are sent as the backend fills them and ignored by the storefront.
- The editor posts upgraded documents (full slots, no legacy props) in the baseline change after every load, so an owner-edited v0.7.0 product / catalogue document shows once as changed in the admin's publish diff even without an edit (rendering unchanged). Untouched pages stay absent (sparse).
- The menu / web-app `product` document is now editable and published like any page (backend and admin need no change: it was already a valid route key in every layout).
