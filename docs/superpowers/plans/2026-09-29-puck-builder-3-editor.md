# Puck page builder — Plan 3: storefront editor (`/__builder`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A lazy `/__builder` route in the storefront SPA that, framed by the admin, hosts `<Puck>` over the builder's block registry, edits one layout's page set with live catalogue data and fake "Northbound Supply" fixtures for session-bound blocks, and talks to the admin exclusively through the A6 postMessage protocol.

**Architecture:** A tiny, always-bundled gate (`app/builder-gate.ts`, `app/builder-route.tsx`) decides once per window whether this is a framed builder (`?sf-builder=1` on `/__builder`, `window.parent !== window`) and otherwise redirects to `/`. Everything else lives in `web/src/builder/editor/**`, loaded by one dynamic import: a zod protocol + message bridge, a pure page-set model with a zustand editor store, a fixture layer (an `api` client interceptor, in-memory persisted stores, no-op mutations), Puck fields derived from each block's zod schema plus custom fields, a per-doc Puck `Config`, and the editor UI (header override, canvas, read-only view). A Vite plugin fails the build if Puck, tiptap, dnd-kit or any `builder/editor/` module reaches the shopper entry graph.

**Tech Stack:** React 19, react-router 7 (data router, `useBlocker`, descendant `<Routes>`), `@puckeditor/core` pinned exactly `0.23.0`, zod 4 (`z.toJSONSchema`), zustand 5, TanStack Query 5, ky 1.14, Mantine notifications (toasts only), Vitest + jsdom, Playwright (mocked).

**Spec:** `docs/superpowers/specs/2026-09-29-puck-page-builder-design.md` — read §6, §7, §8, §10 and **all of §13** (A1, A2, A4, A6 and A7 are load-bearing here; §13 wins over §1–12).

**Depends on:** Plan 2 (`2026-09-29-puck-builder-2-renderer.md`) merged into this worktree first. Everything under `web/src/builder/` except `editor/` is Plan 2's; this plan only *reads* it (Task 1 adds at most two small, additive exports if Plan 2 did not provide them).

## Global Constraints

- `@puckeditor/core` is pinned **exactly** `0.23.0` in `web/package.json` (no `^`/`~`).
- `@puckeditor/core` is value-imported **only** under `web/src/builder/editor/`; `import type` is allowed anywhere. Nothing outside `web/src/builder/editor/` may import from `web/src/builder/editor/` except the single `lazy(() => import('@/builder/editor/EditorApp.tsx'))` in `web/src/app/builder-route.tsx`.
- Import style: `@/…` aliases **with** `.ts`/`.tsx` extensions; no `../../` relative imports inside `web/src`.
- Tests live in `web/test/*.test.ts(x)` (flat); e2e in `e2e/*.spec.ts` against `e2e/mocks.ts`.
- The repo is **public**: fixtures, copy and screenshots use "Northbound Supply" / `shop.example` only — never real customer data, client brands or credentials.
- The builder gate is `?sf-builder=1` **and** `window.parent !== window`, decided once per window and cached exactly like `isPreviewMode()`; otherwise `/__builder` redirects to `/`.
- Protocol (A6), verbatim: admin → storefront `sf-builder-load { protocol: 1, layout, pageSet | null, theme, readOnly }`, `sf-builder-theme { theme }`, `sf-builder-select-page { docKey }`, `sf-builder-upload-result { requestId, url | null, error | null }`; storefront → admin `sf-builder-ready { protocol: 1 }` (targetOrigin `'*'`), `sf-builder-change { pageSet, issues }` (debounced 500 ms, also once right after load), `sf-builder-upload-request { requestId, file }`, `sf-builder-viewport { width: 360 | 768 | 1280 | null }` (coordinator addition to A6: sent immediately whenever the viewport toggle changes, and once right after every load; `null` = fill the available width; the admin resizes the iframe element itself, centred and scrollable, so media queries and `useMediaQuery` follow it). Only `event.source === window.parent` is accepted; `targetOrigin` for everything but `ready` is the origin of the first accepted `sf-builder-load`.
- `pageSet: null` on load ⇒ start from default docs; the first change carries a sparse set containing only `shell`. `readOnly: true` disables editing and suppresses `sf-builder-change`.
- Theme drafts drop `customCss` (the saved, backend-sanitised custom CSS keeps applying), exactly as preview mode does. A builder frame never writes the first-paint theme payload, `sf-session-v1` or `sf-cart-v1`.
- `<Puck>` runs with `iframe={{ enabled: false }}` and its canvas always fills 100% of the frame (Puck's own viewport controls hidden); the header's viewport toggle (Fit / 360 / 768 / 1280) only posts `sf-builder-viewport` — the admin sizes the frame.
- Fixture mode: "Preview as" `signed-out` / `signed-in` / `signed-in-orders` × `empty` / `items`; every mutation (add to cart, place order, login, redeem, payment, lookups) is a no-op with a toast; fixture data lives in `web/src/builder/editor/fixtures.ts`.
- Richtext props end in `Html` and use Puck's native `richtext` field (A2). Backend contract (Plan 1): every `*Html` value in an emitted `sf-builder-change` is an HTML **string** at any depth (the backend 400s anything else); a non-slot array item never carries both `type` and `props` keys (the backend reads such items as components); link-ish props (keys ending `url`/`Url`/`URL`/`href`/`Href`/`src`/`Src`) hold only `https:`, `mailto:`, `tel:`, a site-relative `/…` path (not `//host` or `/\host`), `/media/storefront-pages/media/<key>`, or `''` — **no `#anchor`**.
- Every UI task: **Implementer: load the `frontend-design:frontend-design` skill before writing UI code.**
- Nothing is merged or pushed without the user's OK. Commit per task on `feature/puck-builder`.

## Review Focus

1. **The editor frame is same-origin with the live shop.** Fixture sign-ins, fixture carts and draft themes must never land in the admin's own `localStorage` for that storefront (`sf-session-v1`, `sf-cart-v1`, the first-paint theme payload), or the next real visit to the shop in that browser is signed in as a fake customer. Pinned in Task 2 (theme) and Task 7 (stores).
2. **A fixture 401 must not sign the fixture out.** The api client clears the session on any 401; in fixture mode that would silently flip "signed in" to "signed out". Pinned in Task 7.
3. **Messages from the wrong window or origin.** A message whose `source` is not the parent, a load from an opaque (`"null"`) origin, or a second load from a different origin must be ignored, and an upload result for an unknown `requestId` must not resolve anything. Pinned in Task 4.
4. **Browsing is not editing.** Opening a page in the picker, or Puck's own mount-time `onChange`, must not add that page to the sparse set; editing a page back to its default must remove it again. Pinned in Task 5.
5. **Leaving the editor by accident.** A `<Link>` click, a block's programmatic `navigate()` or an external `<a href>` inside the canvas must not navigate the frame away from `/__builder`. Pinned in Task 11.

---

## File map

| File | Task | Responsibility |
|---|---|---|
| `web/package.json` | 1 | pin `@puckeditor/core@0.23.0` |
| `web/src/builder/mode.ts` (Plan 2's; additive only) | 1 | `BuilderModeProvider` if missing |
| `web/test/builder-editor-contract.test.ts` | 1 | A7 names + §7 block list present |
| `web/src/app/builder-gate.ts` | 2 | `isBuilderMode()`, builder theme/layout overrides |
| `web/src/app/builder-route.tsx` | 2 | gate + lazy editor route element |
| `web/src/app/routes.tsx` | 2 | register `/__builder/*` outside the shell (Plan 2 moved the route table here) |
| `web/src/app/document-theme.ts` | 2 | builder theme wins, never persisted |
| `web/src/app/layout.ts` | 2 | builder layout override |
| `web/src/app/App.tsx` | 2 | skip boot-cart + closed gate in builder mode |
| `web/src/builder/editor/EditorApp.tsx` | 2 (stub), 11 | editor root (default export) |
| `web/src/api/client.ts` | 3 | `setApiInterceptor()` |
| `web/src/builder/editor/protocol.ts` | 4 | zod shapes of A6 |
| `web/src/builder/editor/bridge.ts` | 4 | message bridge, debounce, uploads |
| `web/src/builder/editor/page-set.ts` | 5 | pure sparse page-set model |
| `web/src/builder/editor/route-bound.ts` | 5 | which block belongs/locks where |
| `web/src/builder/editor/page-catalog.ts` | 5 | page picker groups + labels |
| `web/src/builder/editor/store.ts` | 5 | zustand editor store |
| `web/vite-plugins/builder-isolation.ts`, `web/vite.config.ts` | 6 | §8 bundle check |
| `docs/builder.md` | 6 | editor section |
| `web/src/builder/editor/fixtures.ts` | 7 | Northbound Supply fixture data |
| `web/src/builder/editor/fixture-api.ts` | 7 | api interceptor for fixture mode |
| `web/src/builder/editor/fixture-mode.ts` | 7 | in-memory stores, no-op mutations, Preview-as |
| `web/src/builder/editor/custom-fields/*` | 8 | routeLink, image, paletteToken, product/category pickers |
| `web/src/builder/editor/derive-fields.ts` | 9 | zod schema → Puck fields |
| `web/src/builder/editor/fields/<BlockName>.ts` ×45 | 9 | per-block fields |
| `web/src/builder/editor/config.ts` | 10 | per-doc Puck `Config`, block menu |
| `web/src/builder/editor/EditorBlock.tsx` | 10 | block render wrapper + boundary |
| `web/src/builder/editor/session.ts` | 10 | wires bridge ⇄ store ⇄ fixtures |
| `web/src/builder/editor/{EditorCanvas,EditorHeader,PagePicker,fixture-routes,use-puck,use-issues,viewports}.ts(x)`, `Editor.module.css` | 11 | editor UI |
| `e2e/builder-editor.spec.ts` | 12 | framed editor e2e |

## Parallelisation map

Shared worktree — tasks in one wave touch disjoint files. Max 5 concurrent.

| Wave | Tasks (parallel) | Waits for |
|---|---|---|
| 0 | **1** | Plan 2 merged |
| 1 | **2, 3, 4, 6** | 1 |
| 2 | **5** | 4 (imports `isDocKey` / `ViewportWidth` from `protocol.ts`) |
| 3 | **7, 8** | 7 needs 3 + 5; 8 needs 4 + 5 |
| 4 | **9** | 8 |
| 5 | **10** | 4, 5, 7, 9 |
| 6 | **11** | 10 (and 2) |
| 7 | **12** | 11 |

---

### Task 1: Contract probe and Puck dependency

**Files:**
- Modify: `web/package.json`, `web/package-lock.json` (via npm)
- Modify (only if missing, additive): `web/src/builder/mode.ts`
- Test: `web/test/builder-editor-contract.test.ts`

**Interfaces:**
- Consumes (Plan 2, spec A7): `defineBlock`, `BlockDef`, `BlockCategory`, `BlockRenderContext`, `SlotRender` from `@/builder/define.ts`; `BLOCKS` from `@/builder/registry.ts`; `checkRules` from `@/builder/rules.ts`; `validateDoc` from `@/builder/guard.ts`; `defaultDoc` from `@/builder/defaults/index.ts`; `RenderDoc` from `@/builder/render.tsx`; `usePageSet`, `PuckShell`, `PuckPage`, `PageSetOverrideProvider` from `@/builder/runtime.tsx`; `useBuilderMode`, `PreviewAs` from `@/builder/mode.ts`; `sanitizeRichtext`, `RICHTEXT_ALLOWED_TAGS` from `@/builder/sanitize.ts`; `FIXED_ROUTE_KEYS` and the A4 types from `@/builder/types.ts`.
- Produces: `BuilderModeProvider(p: { value: { editing: boolean; previewAs: PreviewAs | null }; children: ReactNode })` exported from `@/builder/mode.ts`; `@puckeditor/core@0.23.0` installed.

- [ ] **Step 1: Write the failing contract test**

```ts
// web/test/builder-editor-contract.test.ts
import { describe, expect, it } from 'vitest';
import * as define from '@/builder/define.ts';
import { BLOCKS } from '@/builder/registry.ts';
import { checkRules } from '@/builder/rules.ts';
import { validateDoc } from '@/builder/guard.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { RenderDoc } from '@/builder/render.tsx';
import * as runtime from '@/builder/runtime.tsx';
import * as mode from '@/builder/mode.ts';
import { sanitizeRichtext, RICHTEXT_ALLOWED_TAGS } from '@/builder/sanitize.ts';
import { FIXED_ROUTE_KEYS } from '@/builder/types.ts';
import pkg from '../package.json';

/** Spec §7, in category order. The editor's fields, menus and locks are keyed by these names. */
export const SPEC_BLOCKS = [
  'PageOutlet', 'Header', 'NavLinks', 'Footer', 'TopBar', 'NoticeBanners', 'CutoffBar', 'ContactStrip', 'MobileCartBar',
  'CatalogHero', 'CategoryNav', 'SearchField', 'ProductGrid', 'ProductList', 'WholesaleTable', 'FeaturedProducts', 'Upsells',
  'ProductDetail',
  'CartContents', 'CartSummary', 'CheckoutFlow', 'LoginOptions', 'AccountNav', 'OrdersList', 'OrderDetail', 'Loyalty', 'Referrals', 'Profile',
  'OrderStatus', 'PaymentSuccess', 'PaymentCancel', 'OrderPlaced', 'VerifyForm', 'TrackingLookup',
  'Heading', 'RichText', 'Image', 'Button', 'Columns', 'Section', 'Spacer', 'Divider', 'FAQ', 'Testimonial', 'Video',
] as const;

describe('Plan 2 contract the editor builds on (spec §13 A7)', () => {
  it('exposes every A7 value', () => {
    expect(typeof define.defineBlock).toBe('function');
    expect(typeof checkRules).toBe('function');
    expect(typeof validateDoc).toBe('function');
    expect(typeof defaultDoc).toBe('function');
    expect(typeof RenderDoc).toBe('function');
    expect(typeof runtime.usePageSet).toBe('function');
    expect(typeof runtime.PuckShell).toBe('function');
    expect(typeof runtime.PuckPage).toBe('function');
    expect(typeof runtime.PageSetOverrideProvider).toBe('function');
    expect(typeof mode.useBuilderMode).toBe('function');
    expect(typeof mode.BuilderModeProvider).toBe('function');
    expect(typeof sanitizeRichtext).toBe('function');
    expect(RICHTEXT_ALLOWED_TAGS.length).toBeGreaterThan(0);
    expect(FIXED_ROUTE_KEYS).toHaveLength(16);
  });

  it('registers exactly the §7 blocks, each under its own name', () => {
    expect(Object.keys(BLOCKS).sort()).toEqual([...SPEC_BLOCKS].sort());
    for (const [key, def] of Object.entries(BLOCKS)) expect(def.name).toBe(key);
  });

  it('has a default doc for the shell and every fixed route of the storefront layout', () => {
    expect(defaultDoc('shell', 'storefront')).not.toBeNull();
    for (const key of FIXED_ROUTE_KEYS) expect(defaultDoc(key, 'storefront'), key).not.toBeNull();
    expect(defaultDoc('page:about', 'storefront')).toBeNull();
  });

  it('pins @puckeditor/core exactly to 0.23.0', () => {
    expect((pkg as { dependencies: Record<string, string> }).dependencies['@puckeditor/core']).toBe('0.23.0');
  });
});
```

- [ ] **Step 2: Run it and read the failures**

Run: `npm --prefix web test -- builder-editor-contract`
Expected: FAIL on at least `BuilderModeProvider` and/or the `@puckeditor/core` pin. Any *other* failure (a missing A7 name, a block list mismatch, a missing default doc) is a Plan 2 gap: **stop and report it** — do not paper over it here.

- [ ] **Step 3: Pin Puck**

Run: `npm --prefix web install --save-exact @puckeditor/core@0.23.0`
Then confirm `web/package.json` reads `"@puckeditor/core": "0.23.0"` (no caret).

- [ ] **Step 4: Add `BuilderModeProvider` if Plan 2 did not export it**

Open `web/src/builder/mode.ts`. If it already exports a provider or setter that lets a subtree set `{ editing, previewAs }`, rename nothing — re-export it as `BuilderModeProvider` with the signature above and skip the rest of this step. If `useBuilderMode()` currently just returns the constant `{ editing: false, previewAs: null }`, append:

```ts
import { createContext, createElement, useContext, type ReactNode } from 'react';

export interface BuilderModeValue { editing: boolean; previewAs: PreviewAs | null }

const BuilderModeContext = createContext<BuilderModeValue>({ editing: false, previewAs: null });

/** The editor chunk wraps the canvas in this; shoppers never render it, so the default applies. */
export function BuilderModeProvider({ value, children }: { value: BuilderModeValue; children: ReactNode }) {
  return createElement(BuilderModeContext.Provider, { value }, children);
}
```

and replace the body of `useBuilderMode()` with `return useContext(BuilderModeContext);`. If `useBuilderMode()` is implemented any other way (a store, reading the URL), stop and report — do not guess.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix web test -- builder-editor-contract`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add web/package.json web/package-lock.json web/src/builder/mode.ts web/test/builder-editor-contract.test.ts
git commit -m "feat(builder): pin @puckeditor/core 0.23.0 and probe the renderer contract"
```

---

### Task 2: The builder gate and the `/__builder` route

**Files:**
- Create: `web/src/app/builder-gate.ts`, `web/src/app/builder-route.tsx`, `web/src/builder/editor/EditorApp.tsx` (stub; Task 11 replaces it)
- Modify: `web/src/app/routes.tsx`, `web/src/app/document-theme.ts`, `web/src/app/layout.ts`, `web/src/app/App.tsx`
- Test: `web/test/builder-gate.test.ts`, `web/test/builder-route.test.tsx`, `web/test/document-theme.test.tsx` (add cases), `web/test/effective-layout.test.ts` (add cases)

**Interfaces:**
- Produces:
  - `BUILDER_PARAM = 'sf-builder'`, `BUILDER_PATH = '/__builder'`
  - `isBuilderMode(win?: Window): boolean` — cached per window
  - `builderOverrides` — zustand store `{ theme: Theme | null; layout: LayoutKind | null }`; `useBuilderTheme(): Theme | null`; `useBuilderLayout(): LayoutKind | null`
  - `effectiveLayout(chosen, inTelegram, override?: LayoutKind | null)` — override wins
  - `BuilderRoute()` — route element for `/__builder/*`
  - `web/src/builder/editor/EditorApp.tsx` default export (stub)

- [ ] **Step 1: Write the failing gate test**

```ts
// web/test/builder-gate.test.ts
import { describe, expect, it } from 'vitest';
import { builderOverrides, isBuilderMode } from '@/app/builder-gate.ts';

function fakeWindow(search: string, pathname = '/__builder', framed = true) {
  const win = { location: { search, pathname }, parent: {} } as unknown as Window;
  if (!framed) (win as unknown as { parent: unknown }).parent = win;
  return win;
}

describe('builder gate', () => {
  it('is on only for ?sf-builder=1 on /__builder inside a frame', () => {
    expect(isBuilderMode(fakeWindow('?sf-builder=1'))).toBe(true);
    expect(isBuilderMode(fakeWindow('?sf-builder=1', '/__builder/doc/cart'))).toBe(true);
    expect(isBuilderMode(fakeWindow('?sf-builder=1', '/__builder', false))).toBe(false);
    expect(isBuilderMode(fakeWindow(''))).toBe(false);
    expect(isBuilderMode(fakeWindow('?sf-builder=1', '/'))).toBe(false);
    expect(isBuilderMode(fakeWindow('?sf-preview=1'))).toBe(false);
  });

  it('decides once per window, so the first in-frame navigation keeps builder mode', () => {
    const win = fakeWindow('?sf-builder=1');
    expect(isBuilderMode(win)).toBe(true);
    (win.location as { search: string }).search = '';
    (win.location as { pathname: string }).pathname = '/__builder/doc/cart';
    expect(isBuilderMode(win)).toBe(true);
  });

  it('never throws on a hostile location', () => {
    const win = { get location() { throw new Error('cross-origin'); }, parent: {} } as unknown as Window;
    expect(isBuilderMode(win)).toBe(false);
  });

  it('holds no overrides until the editor sets them', () => {
    expect(builderOverrides.getState()).toEqual({ theme: null, layout: null });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- builder-gate`
Expected: FAIL — cannot resolve `@/app/builder-gate.ts`.

- [ ] **Step 3: Implement the gate**

```ts
// web/src/app/builder-gate.ts
import { create } from 'zustand';
import type { LayoutKind, Theme } from '@/types/settings.ts';

export const BUILDER_PARAM = 'sf-builder';
export const BUILDER_PATH = '/__builder';

function detectBuilderMode(win: Window): boolean {
  try {
    const { search, pathname } = win.location;
    return (
      new URLSearchParams(search).get(BUILDER_PARAM) === '1' &&
      (pathname === BUILDER_PATH || pathname.startsWith(`${BUILDER_PATH}/`)) &&
      win.parent !== win
    );
  } catch {
    return false;
  }
}

const builderModeByWindow = new WeakMap<Window, boolean>();

/**
 * The admin's Pages tab frames the storefront at /__builder?sf-builder=1. Decided once per
 * window on first evaluation, exactly like isPreviewMode(): the editor's own in-frame
 * navigation drops the query string, and a frame that forgot it was the builder would start
 * persisting fixture sessions and draft themes into the real visitor's storage.
 */
export function isBuilderMode(win: Window = window): boolean {
  let mode = builderModeByWindow.get(win);
  if (mode === undefined) {
    mode = detectBuilderMode(win);
    builderModeByWindow.set(win, mode);
  }
  return mode;
}

// Primed at module load, before the router can navigate away from the param.
if (typeof window !== 'undefined') isBuilderMode(window);

interface BuilderOverrides {
  /** The admin's draft theme (customCss already dropped). */
  theme: Theme | null;
  /** The layout being edited — may differ from the one the store serves to browsers. */
  layout: LayoutKind | null;
}

/** Written only by the editor chunk; read by the always-bundled theme and layout hooks. */
export const builderOverrides = create<BuilderOverrides>()(() => ({ theme: null, layout: null }));

export const useBuilderTheme = (): Theme | null => builderOverrides((s) => s.theme);
export const useBuilderLayout = (): LayoutKind | null => builderOverrides((s) => s.layout);
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- builder-gate`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing theme, layout and route tests**

Append to `web/test/document-theme.test.tsx` (inside the existing `describe('useDocumentTheme', …)`; add `import { builderOverrides } from '@/app/builder-gate.ts';` at the top):

```tsx
  it('in the builder frame: the builder theme wins, keeps the saved customCss, and writes nothing', () => {
    const listeners: Array<(e: MessageEvent) => void> = [];
    const win = {
      location: { search: '?sf-builder=1', pathname: '/__builder' },
      parent: { postMessage: vi.fn() },
      addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
      removeEventListener: () => undefined,
    } as unknown as Window;
    act(() => builderOverrides.setState({ theme: { ...stored, colors: { ...stored.colors, bg: '#202020' }, customCss: '' } }));
    const { result } = renderHook(() => useDocumentTheme(settings, win));
    expect(result.current.colors.bg).toBe('#202020');
    expect(result.current.customCss).toBe('.saved{}');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    act(() => builderOverrides.setState({ theme: null }));
  });
```

Append to `web/test/effective-layout.test.ts`:

```ts
  it('the builder override wins over the store and over Telegram', () => {
    expect(effectiveLayout('storefront', false, 'menu')).toBe('menu');
    expect(effectiveLayout('storefront', true, 'storefront')).toBe('storefront');
    expect(effectiveLayout('menu', false, null)).toBe('menu');
  });
```

Create `web/test/builder-route.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { BuilderRoute } from '@/app/builder-route.tsx';

describe('BuilderRoute', () => {
  it.each(['/__builder', '/__builder?sf-builder=1', '/__builder/doc/cart'])(
    'outside a builder frame, %s redirects to /',
    async (entry) => {
      const router = createMemoryRouter(
        [
          { path: '/__builder/*', element: <BuilderRoute /> },
          { path: '/', element: <p>shop home</p> },
        ],
        { initialEntries: [entry] },
      );
      render(<RouterProvider router={router} />);
      expect(await screen.findByText('shop home')).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/');
    },
  );
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npm --prefix web test -- document-theme effective-layout builder-route`
Expected: FAIL — builder theme ignored; `effectiveLayout` ignores its third argument; `@/app/builder-route.tsx` unresolved.

- [ ] **Step 7: Implement theme, layout, route and App changes**

`web/src/app/document-theme.ts` — read the current file first; the change is:

```ts
import { isBuilderMode, useBuilderTheme } from '@/app/builder-gate.ts';
// …
export function useDocumentTheme(settings: StorefrontSettings, win: Window = window): ResolvedTheme {
  const { brand } = settings;
  const builder = useBuilderTheme();
  const preview = usePreviewTheme(win);
  // The builder's draft (Pages tab) or the Appearance preview's — never with draft CSS.
  const draft = builder ?? preview;
  const theme = draft ? { ...draft, customCss: settings.theme.customCss } : settings.theme;
  const themeKey = JSON.stringify({ theme, brand });
  const resolved = useMemo(() => resolveTheme(theme, lookupManifest), [themeKey]);
  useEffect(() => {
    // Neither a preview frame nor the builder may overwrite the real visitor payload.
    applyDocumentTheme(resolved, brand, { persist: !isPreviewMode(win) && !isBuilderMode(win) });
  }, [themeKey, win]);
  return resolved;
}
```

`web/src/app/layout.ts`:

```ts
import { useSettings } from '@/app/settings.ts';
import { useBuilderLayout } from '@/app/builder-gate.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import type { LayoutKind } from '@/types/settings.ts';

/**
 * The layout actually on screen. The page builder's layout (the one being edited) wins over
 * everything; inside Telegram it is always the web app; otherwise the store's choice.
 */
export function effectiveLayout(chosen: LayoutKind | undefined, inTelegram: boolean, override: LayoutKind | null = null): LayoutKind {
  if (override) return override;
  if (inTelegram) return 'webapp';
  return chosen ?? 'storefront';
}

export function useEffectiveLayout(): LayoutKind {
  const { features } = useSettings();
  const override = useBuilderLayout();
  return effectiveLayout(features?.layout, isTelegramWebApp(), override);
}
```

`web/src/app/builder-route.tsx`:

```tsx
import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';

// The only import of the editor chunk anywhere in the app (spec §8, A1).
const EditorApp = lazy(() => import('@/builder/editor/EditorApp.tsx'));

/** /__builder: the page builder inside the admin's frame; anyone else goes home. */
export function BuilderRoute() {
  if (!isBuilderMode()) return <Navigate to="/" replace />;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditorApp />
    </Suspense>
  );
}
```

`web/src/builder/editor/EditorApp.tsx` (stub, replaced in Task 11):

```tsx
/** Placeholder until Task 11 — keeps the lazy import resolvable. */
export default function EditorApp() {
  return null;
}
```

`web/src/app/routes.tsx` (Plan 2 Task 14 moved the route table here; `router.tsx` is now just `createBrowserRouter(routes)` and is not touched) — add the import and make this the **first** entry of the exported `routes: RouteObject[]` array (outside the shell route, which Plan 2 renders with `PuckShell`):

```tsx
import { BuilderRoute } from '@/app/builder-route.tsx';
// …
export const routes: RouteObject[] = [
  // The page builder (spec §6): outside the shell — it renders its own canvas.
  { path: '/__builder/*', element: <BuilderRoute /> },
  // …existing entries unchanged…
];
```

`web/src/app/App.tsx` — two one-line guards (add `import { isBuilderMode } from '@/app/builder-gate.ts';`):

```tsx
// in useBootCart's effect, first line after `started.current = true;`
    // The builder runs on fixtures; the admin's own shopper cart must not be fetched into it.
    if (isBuilderMode()) return;
```

```tsx
// in ClosedGate
  // The owner may build pages while the shop is closed (e.g. before launch).
  const exempt = isClosedExemptPath(window.location.pathname) || isBuilderMode();
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm --prefix web test -- builder-gate builder-route document-theme effective-layout closed-gate`
Expected: PASS (existing cases unchanged).

- [ ] **Step 9: Typecheck and commit**

Run: `npm --prefix web run typecheck` — Expected: no errors.

```bash
git add web/src/app/builder-gate.ts web/src/app/builder-route.tsx web/src/app/routes.tsx web/src/app/document-theme.ts web/src/app/layout.ts web/src/app/App.tsx web/src/builder/editor/EditorApp.tsx web/test/builder-gate.test.ts web/test/builder-route.test.tsx web/test/document-theme.test.tsx web/test/effective-layout.test.ts
git commit -m "feat(builder): gate /__builder to the admin frame and route it outside the shell"
```

---

### Task 3: An interceptor seam in the api client

**Files:**
- Modify: `web/src/api/client.ts`
- Test: `web/test/api-interceptor.test.ts`

**Interfaces:**
- Produces: `type ApiInterceptor = (request: Request) => Response | Request | void | Promise<Response | Request | void>`; `setApiInterceptor(fn: ApiInterceptor | null): () => void` — returns an `off()` that only removes *its own* interceptor. The interceptor runs **after** the Authorization header is set. Returning a `Response` short-circuits the network (ky still applies its `ok` check, so a 4xx becomes an `ApiError`); returning a `Request` replaces the request.

- [ ] **Step 1: Write the failing test**

```ts
// web/test/api-interceptor.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, setApiInterceptor, unwrap } from '@/api/client.ts';
import { useSessionStore } from '@/stores/session.ts';

const envelope = (data: unknown, status = 200) =>
  new Response(JSON.stringify(status < 400 ? { success: true, data, error: null } : { success: false, data: null, error: data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('api interceptor', () => {
  beforeEach(() => useSessionStore.getState().clear());
  afterEach(() => { vi.restoreAllMocks(); setApiInterceptor(null); });

  it('answers without touching the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    setApiInterceptor(() => envelope({ from: 'fixture' }));
    await expect(unwrap(api.get('storefront/profile'))).resolves.toEqual({ from: 'fixture' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sees the Authorization header and can rewrite the request', async () => {
    useSessionStore.getState().setSession('tok', { id: 1, nickname: null });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(envelope({ ok: true }));
    let seen: string | null = null;
    setApiInterceptor((request) => {
      seen = request.headers.get('authorization');
      request.headers.delete('authorization');
      return new Request(request.url.replace('/api/storefront/catalog', '/api/catalog'), { headers: request.headers });
    });
    await unwrap(api.get('storefront/catalog'));
    expect(seen).toBe('Bearer tok');
    const sent = fetchSpy.mock.calls[0]![0] as Request;
    expect(new URL(sent.url).pathname).toBe('/api/catalog');
    expect(sent.headers.get('authorization')).toBeNull();
  });

  it('turns a fixture 4xx into an ApiError', async () => {
    setApiInterceptor(() => envelope('Preview only', 400));
    await expect(unwrap(api.post('storefront/checkout'))).rejects.toMatchObject({ status: 400, message: 'Preview only' });
  });

  it('off() removes only its own interceptor', async () => {
    const offA = setApiInterceptor(() => envelope('a'));
    setApiInterceptor(() => envelope('b'));
    offA();
    await expect(unwrap(api.get('storefront/settings'))).resolves.toBe('b');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- api-interceptor`
Expected: FAIL — `setApiInterceptor` is not exported.

- [ ] **Step 3: Implement**

In `web/src/api/client.ts`, above `export const api = ky.create(...)`:

```ts
/**
 * A seam for the page builder's fixture mode (spec §6), which must answer session-bound
 * calls with fake data and never let a fake token or a mutation reach the backend. Runs after
 * the Authorization header is set. Nothing in the shopper bundle ever installs one.
 */
export type ApiInterceptor = (request: Request) => Response | Request | void | Promise<Response | Request | void>;

let interceptor: ApiInterceptor | null = null;

export function setApiInterceptor(fn: ApiInterceptor | null): () => void {
  interceptor = fn;
  return () => {
    if (interceptor === fn) interceptor = null;
  };
}
```

and extend the `beforeRequest` array:

```ts
    beforeRequest: [
      (request) => {
        const token = useSessionStore.getState().token;
        if (token) request.headers.set('Authorization', `Bearer ${token}`);
      },
      (request) => interceptor?.(request),
    ],
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix web test -- api-interceptor api-client`
Expected: PASS (new 4 + existing unchanged).

- [ ] **Step 5: Commit**

```bash
git add web/src/api/client.ts web/test/api-interceptor.test.ts
git commit -m "feat(api): interceptor seam for the builder's fixture mode"
```

---

### Task 4: Editor protocol and message bridge

**Files:**
- Create: `web/src/builder/editor/protocol.ts`, `web/src/builder/editor/bridge.ts`
- Test: `web/test/builder-editor-protocol.test.ts`, `web/test/builder-editor-bridge.test.ts`

**Interfaces:**
- Consumes: `themeSchema` from `@/templates/theme-schema.ts`; `FIXED_ROUTE_KEYS`, `DocKey`, `Issue`, `LayoutKind`, `PageSet` from `@/builder/types.ts`.
- Produces (`protocol.ts`): `BUILDER_PROTOCOL = 1`; `isDocKey(k: string): k is DocKey`; `LoadMessage = { type: 'sf-builder-load'; protocol: 1; layout: LayoutKind; pageSet: PageSet | null; theme: Theme; readOnly: boolean }`; `Inbound` (union of the four admin → storefront messages, theme already mapped to `Theme` with `customCss: ''`); `Outbound` (includes `{ type: 'sf-builder-viewport'; width: ViewportWidth | null }`); `VIEWPORT_WIDTHS = [360, 768, 1280] as const`; `type ViewportWidth`; `parseInbound(data: unknown): Inbound | null`; `UPLOAD_URL_RE`.
- Produces (`bridge.ts`): `CHANGE_DEBOUNCE_MS = 500`, `UPLOAD_TIMEOUT_MS = 60_000`; `interface BridgeHandlers { onLoad(msg: LoadMessage): void; onTheme(theme: Theme): void; onSelectPage(docKey: DocKey): void }`; `interface Bridge { postChange(pageSet: PageSet, issues: Issue[]): void; flushChange(): void; requestUpload(file: File): Promise<string>; postViewport(width: ViewportWidth | null): void; dispose(): void }`; `createBridge(win: Window, handlers: BridgeHandlers): Bridge`; `setActiveBridge(b: Bridge | null): void`; `getActiveBridge(): Bridge | null`.

- [ ] **Step 1: Write the failing protocol test**

```ts
// web/test/builder-editor-protocol.test.ts
import { describe, expect, it } from 'vitest';
import { isDocKey, parseInbound } from '@/builder/editor/protocol.ts';

export const THEME = {
  template: 'modern', preset: 'default', options: {},
  scheme: 'dark', colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: null, body: null, mono: null }, radius: 'none', density: 'comfortable', customCss: 'body{background:url(https://evil.example/x)}',
};
const doc = { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [{ type: 'Heading', props: { id: 'Heading-1', text: 'Hi' } }] };

describe('builder protocol', () => {
  it('accepts a load with a page set and drops draft CSS', () => {
    const msg = parseInbound({ type: 'sf-builder-load', protocol: 1, layout: 'menu', pageSet: { schemaVersion: 1, shell: doc, pages: { catalog: doc, 'page:about': doc } }, theme: THEME, readOnly: false });
    expect(msg?.type).toBe('sf-builder-load');
    if (msg?.type !== 'sf-builder-load') throw new Error('unreachable');
    expect(msg.layout).toBe('menu');
    expect(Object.keys(msg.pageSet!.pages)).toEqual(['catalog', 'page:about']);
    expect(msg.theme.customCss).toBe('');
  });

  it('accepts a null page set', () => {
    expect(parseInbound({ type: 'sf-builder-load', protocol: 1, layout: 'storefront', pageSet: null, theme: THEME, readOnly: true })).toMatchObject({ pageSet: null, readOnly: true });
  });

  it('drops page keys that are not route keys', () => {
    const msg = parseInbound({ type: 'sf-builder-load', protocol: 1, layout: 'storefront', pageSet: { schemaVersion: 1, shell: doc, pages: { catalog: doc, 'page:Bad Slug': doc, shell: doc, nope: doc } }, theme: THEME, readOnly: false });
    if (msg?.type !== 'sf-builder-load') throw new Error('unreachable');
    expect(Object.keys(msg.pageSet!.pages)).toEqual(['catalog']);
  });

  it.each([
    ['wrong protocol', { type: 'sf-builder-load', protocol: 2, layout: 'storefront', pageSet: null, theme: THEME, readOnly: false }],
    ['unknown layout', { type: 'sf-builder-load', protocol: 1, layout: 'kiosk', pageSet: null, theme: THEME, readOnly: false }],
    ['bad theme', { type: 'sf-builder-theme', theme: { ...THEME, colors: { bg: 'red' } } }],
    ['bad doc key', { type: 'sf-builder-select-page', docKey: 'page:' }],
    ['upload url off-site', { type: 'sf-builder-upload-result', requestId: 'r1', url: 'javascript:alert(1)', error: null }],
    ['unknown type', { type: 'sf-preview-theme', theme: THEME }],
    ['a string', 'sf-builder-load'],
    ['null', null],
  ])('ignores %s', (_label, data) => {
    expect(parseInbound(data)).toBeNull();
  });

  it('accepts both upload result url forms', () => {
    expect(parseInbound({ type: 'sf-builder-upload-result', requestId: 'r1', url: `/media/storefront-pages/media/${'a'.repeat(32)}.png`, error: null })).not.toBeNull();
    expect(parseInbound({ type: 'sf-builder-upload-result', requestId: 'r1', url: 'https://cdn.shop.example/x.png', error: null })).not.toBeNull();
    expect(parseInbound({ type: 'sf-builder-upload-result', requestId: 'r1', url: null, error: 'Too big' })).not.toBeNull();
  });

  it('knows doc keys', () => {
    expect(isDocKey('shell')).toBe(true);
    expect(isDocKey('account.order')).toBe(true);
    expect(isDocKey('page:spring-sale-2026')).toBe(true);
    expect(isDocKey('page:Spring')).toBe(false);
    expect(isDocKey(`page:${'a'.repeat(61)}`)).toBe(false);
    expect(isDocKey('home')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- builder-editor-protocol`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the protocol**

```ts
// web/src/builder/editor/protocol.ts
import { z } from 'zod';
import { themeSchema } from '@/templates/theme-schema.ts';
import { FIXED_ROUTE_KEYS, type DocKey, type Issue, type LayoutKind, type PageSet, type PuckDoc } from '@/builder/types.ts';
import type { Theme } from '@/types/settings.ts';

/** Spec §13 A6. The admin mirrors these shapes in features/storefront-settings/pages/protocol.ts. */
export const BUILDER_PROTOCOL = 1 as const;

const CUSTOM_KEY_RE = /^page:[a-z0-9-]{1,60}$/;
/** What the admin may hand back as an uploaded image (spec A3), or an https: URL. */
export const UPLOAD_URL_RE = /^(?:\/media\/storefront-pages\/media\/[a-f0-9]{32}\.(?:png|jpg|webp|gif)|https:\/\/\S+)$/;

export function isDocKey(key: string): key is DocKey {
  return key === 'shell' || (FIXED_ROUTE_KEYS as readonly string[]).includes(key) || CUSTOM_KEY_RE.test(key);
}

const layoutSchema = z.enum(['storefront', 'menu', 'webapp']);
const docKeySchema = z.custom<DocKey>((v) => typeof v === 'string' && isDocKey(v));

// Structural only: the guard (validateDoc) is what decides whether a doc renders.
const componentSchema = z.looseObject({ type: z.string(), props: z.looseObject({ id: z.string() }) });
const docSchema = z.looseObject({
  root: z.looseObject({ props: z.record(z.string(), z.unknown()) }),
  content: z.array(componentSchema),
  zones: z.record(z.string(), z.array(componentSchema)).optional(),
});
const pageSetSchema = z.object({
  schemaVersion: z.literal(1),
  shell: docSchema,
  pages: z.record(z.string(), docSchema),
});

const loadSchema = z.object({
  type: z.literal('sf-builder-load'),
  protocol: z.literal(BUILDER_PROTOCOL),
  layout: layoutSchema,
  pageSet: pageSetSchema.nullable(),
  theme: themeSchema,
  readOnly: z.boolean(),
});
const themeMessageSchema = z.object({ type: z.literal('sf-builder-theme'), theme: themeSchema });
const selectSchema = z.object({ type: z.literal('sf-builder-select-page'), docKey: docKeySchema });
const uploadResultSchema = z.object({
  type: z.literal('sf-builder-upload-result'),
  requestId: z.string().min(1).max(100),
  url: z.string().regex(UPLOAD_URL_RE).nullable(),
  error: z.string().max(500).nullable(),
});

const inboundSchema = z.discriminatedUnion('type', [loadSchema, themeMessageSchema, selectSchema, uploadResultSchema]);

export interface LoadMessage {
  type: 'sf-builder-load';
  protocol: 1;
  layout: LayoutKind;
  pageSet: PageSet | null;
  theme: Theme;
  readOnly: boolean;
}
export type Inbound =
  | LoadMessage
  | { type: 'sf-builder-theme'; theme: Theme }
  | { type: 'sf-builder-select-page'; docKey: DocKey }
  | { type: 'sf-builder-upload-result'; requestId: string; url: string | null; error: string | null };

export type Outbound =
  | { type: 'sf-builder-ready'; protocol: 1 }
  | { type: 'sf-builder-change'; pageSet: PageSet; issues: Issue[] }
  | { type: 'sf-builder-upload-request'; requestId: string; file: File }
  | { type: 'sf-builder-viewport'; width: ViewportWidth | null };

/** Widths the admin sizes the frame to; null = fill the available width. */
export const VIEWPORT_WIDTHS = [360, 768, 1280] as const;
export type ViewportWidth = (typeof VIEWPORT_WIDTHS)[number];

/** Draft CSS never applies in a frameable page (see preview-listener.ts). */
function toTheme(theme: z.infer<typeof themeSchema>): Theme {
  return { ...theme, customCss: '' } as Theme;
}

function toPageSet(raw: z.infer<typeof pageSetSchema>): PageSet {
  const pages: PageSet['pages'] = {};
  for (const [key, doc] of Object.entries(raw.pages)) {
    if (key !== 'shell' && isDocKey(key)) pages[key as keyof PageSet['pages']] = doc as unknown as PuckDoc;
  }
  return { schemaVersion: 1, shell: raw.shell as unknown as PuckDoc, pages };
}

/** Anything that is not exactly one of the four admin messages is ignored (null). */
export function parseInbound(data: unknown): Inbound | null {
  const parsed = inboundSchema.safeParse(data);
  if (!parsed.success) return null;
  const msg = parsed.data;
  switch (msg.type) {
    case 'sf-builder-load':
      return { ...msg, protocol: BUILDER_PROTOCOL, theme: toTheme(msg.theme), pageSet: msg.pageSet ? toPageSet(msg.pageSet) : null };
    case 'sf-builder-theme':
      return { type: msg.type, theme: toTheme(msg.theme) };
    default:
      return msg;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- builder-editor-protocol`
Expected: PASS.

- [ ] **Step 5: Write the failing bridge test**

```ts
// web/test/builder-editor-bridge.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANGE_DEBOUNCE_MS, createBridge, UPLOAD_TIMEOUT_MS } from '@/builder/editor/bridge.ts';
import { THEME } from './builder-editor-protocol.test.ts';
import type { PageSet } from '@/builder/types.ts';

const ADMIN = 'https://admin.shop.example';
const PAGE_SET: PageSet = { schemaVersion: 1, shell: { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [] }, pages: {} };
const LOAD = { type: 'sf-builder-load', protocol: 1, layout: 'storefront', pageSet: null, theme: THEME, readOnly: false };

function fakeWindow() {
  const listeners: Array<(e: MessageEvent) => void> = [];
  const parent = { postMessage: vi.fn() };
  const win = {
    parent,
    addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.splice(listeners.indexOf(fn), 1),
  } as unknown as Window;
  const send = (data: unknown, opts: { source?: unknown; origin?: string } = {}) =>
    listeners.forEach((fn) => fn({ data, source: opts.source ?? parent, origin: opts.origin ?? ADMIN } as unknown as MessageEvent));
  return { win, parent, send, listeners };
}

function handlers() {
  return { onLoad: vi.fn(), onTheme: vi.fn(), onSelectPage: vi.fn() };
}

describe('builder bridge', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("announces readiness to '*' and nothing else before a load", () => {
    const { win, parent } = fakeWindow();
    const bridge = createBridge(win, handlers());
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'sf-builder-ready', protocol: 1 }, '*');
    bridge.postChange(PAGE_SET, []);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS * 2);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
  });

  it('locks the target origin to the first load and debounces changes to it', () => {
    const { win, parent, send } = fakeWindow();
    const h = handlers();
    const bridge = createBridge(win, h);
    send(LOAD);
    expect(h.onLoad).toHaveBeenCalledTimes(1);
    bridge.postChange(PAGE_SET, []);
    bridge.postChange(PAGE_SET, [{ docKey: 'cart', rule: 'cart.contents', message: 'Missing CartContents' }]);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS - 1);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(parent.postMessage).toHaveBeenLastCalledWith(
      { type: 'sf-builder-change', pageSet: PAGE_SET, issues: [{ docKey: 'cart', rule: 'cart.contents', message: 'Missing CartContents' }] },
      ADMIN,
    );
    expect(parent.postMessage).toHaveBeenCalledTimes(2);
  });

  it('flushChange sends a pending change immediately', () => {
    const { win, parent, send } = fakeWindow();
    const bridge = createBridge(win, handlers());
    send(LOAD);
    bridge.postChange(PAGE_SET, []);
    bridge.flushChange();
    expect(parent.postMessage).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    expect(parent.postMessage).toHaveBeenCalledTimes(2);
  });

  it('ignores messages not from the parent, from an opaque origin, or from a second origin', () => {
    const { win, send } = fakeWindow();
    const h = handlers();
    createBridge(win, h);
    send(LOAD, { source: { not: 'parent' } });
    send(LOAD, { origin: 'null' });
    expect(h.onLoad).not.toHaveBeenCalled();
    send(LOAD);
    send(LOAD, { origin: 'https://evil.example' });
    send({ type: 'sf-builder-select-page', docKey: 'cart' }, { origin: 'https://evil.example' });
    expect(h.onLoad).toHaveBeenCalledTimes(1);
    expect(h.onSelectPage).not.toHaveBeenCalled();
    send({ type: 'sf-builder-select-page', docKey: 'cart' });
    expect(h.onSelectPage).toHaveBeenCalledWith('cart');
  });

  it('ignores page selection before the first load', () => {
    const { win, send } = fakeWindow();
    const h = handlers();
    createBridge(win, h);
    send({ type: 'sf-builder-select-page', docKey: 'cart' });
    expect(h.onSelectPage).not.toHaveBeenCalled();
  });

  it('forwards themes with draft CSS dropped', () => {
    const { win, send } = fakeWindow();
    const h = handlers();
    createBridge(win, h);
    send({ type: 'sf-builder-theme', theme: THEME });
    expect(h.onTheme.mock.calls[0]![0].customCss).toBe('');
  });

  it('round-trips an upload through the parent, and ignores unknown request ids', async () => {
    const { win, parent, send } = fakeWindow();
    const bridge = createBridge(win, handlers());
    send(LOAD);
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    const pending = bridge.requestUpload(file);
    const request = parent.postMessage.mock.calls.at(-1)!;
    expect(request[0]).toMatchObject({ type: 'sf-builder-upload-request', file });
    expect(request[1]).toBe(ADMIN);
    const url = `/media/storefront-pages/media/${'b'.repeat(32)}.png`;
    send({ type: 'sf-builder-upload-result', requestId: 'someone-else', url, error: null });
    send({ type: 'sf-builder-upload-result', requestId: request[0].requestId, url, error: null });
    await expect(pending).resolves.toBe(url);
  });

  it('rejects an upload with the admin error, on timeout, and before any load', async () => {
    const { win, parent, send } = fakeWindow();
    const bridge = createBridge(win, handlers());
    await expect(bridge.requestUpload(new File(['x'], 'x.png'))).rejects.toThrow('not connected');
    send(LOAD);
    const failed = bridge.requestUpload(new File(['x'], 'x.png'));
    const id = parent.postMessage.mock.calls.at(-1)![0].requestId;
    send({ type: 'sf-builder-upload-result', requestId: id, url: null, error: 'Too big' });
    await expect(failed).rejects.toThrow('Too big');
    const slow = bridge.requestUpload(new File(['x'], 'x.png'));
    vi.advanceTimersByTime(UPLOAD_TIMEOUT_MS);
    await expect(slow).rejects.toThrow('timed out');
  });

  it('posts viewport changes at once to the admin origin, and nothing before a load', () => {
    const { win, parent, send } = fakeWindow();
    const bridge = createBridge(win, handlers());
    bridge.postViewport(360);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    send(LOAD);
    bridge.postViewport(768);
    bridge.postViewport(null);
    expect(parent.postMessage.mock.calls.slice(1)).toEqual([
      [{ type: 'sf-builder-viewport', width: 768 }, ADMIN],
      [{ type: 'sf-builder-viewport', width: null }, ADMIN],
    ]);
  });

  it('dispose removes the listener and cancels a pending change', () => {
    const { win, parent, send, listeners } = fakeWindow();
    const bridge = createBridge(win, handlers());
    send(LOAD);
    bridge.postChange(PAGE_SET, []);
    bridge.dispose();
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    expect(listeners).toHaveLength(0);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm --prefix web test -- builder-editor-bridge`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement the bridge**

```ts
// web/src/builder/editor/bridge.ts
import { BUILDER_PROTOCOL, parseInbound, type LoadMessage, type Outbound, type ViewportWidth } from '@/builder/editor/protocol.ts';
import type { DocKey, Issue, PageSet } from '@/builder/types.ts';
import type { Theme } from '@/types/settings.ts';

export const CHANGE_DEBOUNCE_MS = 500;
export const UPLOAD_TIMEOUT_MS = 60_000;

export interface BridgeHandlers {
  onLoad(msg: LoadMessage): void;
  onTheme(theme: Theme): void;
  onSelectPage(docKey: DocKey): void;
}

export interface Bridge {
  /** Debounced 500 ms; only the newest change is sent. */
  postChange(pageSet: PageSet, issues: Issue[]): void;
  /** Send a pending change now. */
  flushChange(): void;
  /** The admin performs the authenticated upload; resolves to the stored URL. */
  requestUpload(file: File): Promise<string>;
  /** Not debounced: the admin resizes the frame to this width (null = fill). No-op before a load. */
  postViewport(width: ViewportWidth | null): void;
  dispose(): void;
}

/** A real origin we can target; sandboxed/opaque frames report the string "null". */
const TARGETABLE_ORIGIN = /^https?:\/\/[^/\s]+$/;

export function createBridge(win: Window, handlers: BridgeHandlers): Bridge {
  let adminOrigin: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Outbound | null = null;
  let seq = 0;
  const uploads = new Map<string, { resolve: (url: string) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  const post = (msg: Outbound) => {
    if (adminOrigin) win.parent.postMessage(msg, adminOrigin);
  };

  const flushChange = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (pending) post(pending);
    pending = null;
  };

  const onMessage = (event: MessageEvent) => {
    if (event.source !== win.parent) return;
    const msg = parseInbound(event.data);
    if (!msg) return;
    // Once a load has fixed the admin's origin, nobody else speaks for it.
    if (adminOrigin !== null && event.origin !== adminOrigin) return;
    switch (msg.type) {
      case 'sf-builder-load':
        if (!TARGETABLE_ORIGIN.test(event.origin)) return;
        adminOrigin = event.origin;
        handlers.onLoad(msg);
        return;
      case 'sf-builder-theme':
        handlers.onTheme(msg.theme);
        return;
      case 'sf-builder-select-page':
        if (adminOrigin) handlers.onSelectPage(msg.docKey);
        return;
      case 'sf-builder-upload-result': {
        const entry = uploads.get(msg.requestId);
        if (!entry) return;
        uploads.delete(msg.requestId);
        clearTimeout(entry.timer);
        if (msg.url) entry.resolve(msg.url);
        else entry.reject(new Error(msg.error ?? 'Upload failed'));
        return;
      }
    }
  };

  win.addEventListener('message', onMessage);
  // Carries nothing, so it may go to '*': the admin answers with a load, whose origin we then pin.
  win.parent.postMessage({ type: 'sf-builder-ready', protocol: BUILDER_PROTOCOL } satisfies Outbound, '*');

  return {
    postChange(pageSet, issues) {
      pending = { type: 'sf-builder-change', pageSet, issues };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flushChange, CHANGE_DEBOUNCE_MS);
    },
    flushChange,
    requestUpload(file) {
      if (!adminOrigin) return Promise.reject(new Error('The editor is not connected to the admin yet.'));
      seq += 1;
      const requestId = `upload-${Date.now().toString(36)}-${seq}`;
      return new Promise<string>((resolve, reject) => {
        const t = setTimeout(() => {
          uploads.delete(requestId);
          reject(new Error('The upload timed out.'));
        }, UPLOAD_TIMEOUT_MS);
        uploads.set(requestId, { resolve, reject, timer: t });
        post({ type: 'sf-builder-upload-request', requestId, file });
      });
    },
    postViewport(width) {
      post({ type: 'sf-builder-viewport', width });
    },
    dispose() {
      win.removeEventListener('message', onMessage);
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
      for (const entry of uploads.values()) clearTimeout(entry.timer);
      uploads.clear();
    },
  };
}

let active: Bridge | null = null;
/** The image field reaches the bridge through this; set by session.ts. */
export function setActiveBridge(bridge: Bridge | null): void {
  active = bridge;
}
export function getActiveBridge(): Bridge | null {
  return active;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm --prefix web test -- builder-editor-protocol builder-editor-bridge`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add web/src/builder/editor/protocol.ts web/src/builder/editor/bridge.ts web/test/builder-editor-protocol.test.ts web/test/builder-editor-bridge.test.ts
git commit -m "feat(builder): A6 editor protocol and parent-frame bridge"
```

---

### Task 5: Page-set model, route-bound rules, page catalogue, editor store

**Files:**
- Create: `web/src/builder/editor/page-set.ts`, `web/src/builder/editor/route-bound.ts`, `web/src/builder/editor/page-catalog.ts`, `web/src/builder/editor/store.ts`
- Test: `web/test/builder-editor-page-set.test.ts`, `web/test/builder-editor-route-bound.test.ts`, `web/test/builder-editor-store.test.ts`

**Interfaces:**
- Consumes: `defaultDoc`, `validateDoc`, `checkRules`, `BLOCKS`, `PreviewAs`, A4 types; `isDocKey` (Task 4).
- Produces (`page-set.ts`): `type DocMap = Partial<Record<DocKey, PuckDoc>>`; `CUSTOM_SLUG_RE`; `MAX_CUSTOM_PAGES = 50`; `isFixedRouteKey`, `isCustomKey`; `normalizeDoc(doc: unknown, docKey: DocKey): PuckDoc`; `stableStringify(v: unknown): string`; `sameDoc(a: PuckDoc, b: PuckDoc): boolean`; `docsFromPageSet(pageSet: PageSet | null, layout): DocMap`; `toPageSet(docs, layout): PageSet`; `docFor(docs, docKey, layout): PuckDoc`; `withDoc(docs, docKey, doc, layout): DocMap`; `withoutDoc(docs, docKey, layout): DocMap`; `collectIssues(docs, layout): Issue[]`; `customPageKeys(docs): Array<\`page:${string}\`>`; `newCustomPage(docs, slug, title): { docs: DocMap; docKey: \`page:${string}\` } | { error: string }`; `forEachComponent(content: ComponentData[], visit: (c: ComponentData) => void): void`.
- Produces (`route-bound.ts`): `ROUTE_BOUND: Record<'shell' | FixedRouteKey, { blocks: readonly string[]; exactlyOne: boolean }>`; `homeDocKeys(name: string): DocKey[]`; `isLockedOn(name: string, docKey: DocKey): boolean`; `insertableBlocks(docKey: DocKey, layout: LayoutKind): string[]`.
- Produces (`page-catalog.ts`): `DOC_LABELS`; `LAYOUT_LABELS`; `pageOptions(docs, layout): Array<{ label: string; options: Array<{ docKey: DocKey; label: string }> }>`; `docLabel(docKey, docs): string`.
- Produces (`store.ts`): `DEFAULT_PREVIEW_AS: PreviewAs = { session: 'signed-in-orders', cart: 'items' }`; `useEditorStore` (zustand) with state `{ status: 'waiting' | 'ready'; layout; readOnly; docs: DocMap; docKey: DocKey; epoch: number; previewAs: PreviewAs; viewport: ViewportWidth | null }` and actions `load({ layout, pageSet, readOnly })`, `selectDoc(docKey)`, `updateDoc(docKey, raw: unknown)`, `resetDoc(docKey)`, `createPage(slug, title): string | null` (error or null), `setPreviewAs(patch: Partial<PreviewAs>)`, `setViewport(width: ViewportWidth | null)`.

- [ ] **Step 1: Write the failing page-set test**

```ts
// web/test/builder-editor-page-set.test.ts
import { describe, expect, it } from 'vitest';
import { defaultDoc } from '@/builder/defaults/index.ts';
import {
  collectIssues, customPageKeys, docFor, docsFromPageSet, MAX_CUSTOM_PAGES, newCustomPage, normalizeDoc,
  sameDoc, toPageSet, withDoc, withoutDoc, type DocMap,
} from '@/builder/editor/page-set.ts';
import type { PuckDoc } from '@/builder/types.ts';

const L = 'storefront' as const;
const shell = () => normalizeDoc(defaultDoc('shell', L), 'shell');
const heading = (id: string) => ({ type: 'Heading', props: { id } });

describe('page-set model', () => {
  it('starts a null set from the default shell only', () => {
    const docs = docsFromPageSet(null, L);
    expect(Object.keys(docs)).toEqual(['shell']);
    expect(toPageSet(docs, L)).toEqual({ schemaVersion: 1, shell: shell(), pages: {} });
  });

  it('round-trips a stored set', () => {
    const catalog = normalizeDoc(defaultDoc('catalog', L), 'catalog');
    const edited: PuckDoc = { ...catalog, content: [...catalog.content, heading('Heading-x')] };
    const stored = { schemaVersion: 1 as const, shell: shell(), pages: { catalog: edited } };
    expect(toPageSet(docsFromPageSet(stored, L), L)).toEqual(stored);
  });

  it('browsing a page does not add it; Puck echoing the same doc does not add it', () => {
    const docs = docsFromPageSet(null, L);
    const shown = docFor(docs, 'cart', L);
    expect(withDoc(docs, 'cart', normalizeDoc(JSON.parse(JSON.stringify(shown)), 'cart'), L)).toBe(docs);
  });

  it('an edit adds the page; editing it back to the default removes it again', () => {
    const docs = docsFromPageSet(null, L);
    const base = docFor(docs, 'catalog', L);
    const edited = withDoc(docs, 'catalog', { ...base, content: [...base.content, heading('Heading-1')] }, L);
    expect(Object.keys(edited)).toEqual(['shell', 'catalog']);
    const reverted = withDoc(edited, 'catalog', base, L);
    expect(Object.keys(reverted)).toEqual(['shell']);
  });

  it('compares docs regardless of key order and empty zones', () => {
    const a: PuckDoc = { root: { props: { title: 'T', description: '', chrome: 'shell' } }, content: [{ type: 'Heading', props: { id: 'h', text: 'x', level: 2 } }] };
    const b = { content: [{ props: { level: 2, text: 'x', id: 'h' }, type: 'Heading' }], root: { props: { chrome: 'shell', description: '', title: 'T' } }, zones: {} };
    expect(sameDoc(a, normalizeDoc(b, 'catalog'))).toBe(true);
  });

  it('turns any non-string *Html prop into an HTML string, at any depth (backend contract)', () => {
    const node = { $$typeof: Symbol.for('react.element'), type: 'p', props: {} };
    const doc = normalizeDoc({
      root: { props: {} },
      content: [
        { type: 'RichText', props: { id: 'r1', bodyHtml: node } },
        { type: 'FAQ', props: { id: 'f1', items: [{ question: 'Q', answerHtml: 42 }, { question: 'Q2', answerHtml: '<p>ok</p>' }] } },
        { type: 'Section', props: { id: 's1', children: [{ type: 'RichText', props: { id: 'r2', bodyHtml: null } }] } },
      ],
    }, 'page:about');
    const json = JSON.parse(JSON.stringify(doc));
    expect(json.content[0].props.bodyHtml).toBe('');
    expect(json.content[1].props.items.map((i: { answerHtml: unknown }) => i.answerHtml)).toEqual(['', '<p>ok</p>']);
    expect(json.content[2].props.children[0].props.bodyHtml).toBe('');
  });

  it('normalises root props and never lets the shell go chromeless', () => {
    expect(normalizeDoc({ root: { props: { chrome: 'none', title: 3 } }, content: 'x' }, 'shell')).toEqual({
      root: { props: { title: '', description: '', chrome: 'shell' } }, content: [],
    });
    expect(normalizeDoc({ root: { props: { chrome: 'none' } }, content: [] }, 'order-status').root.props.chrome).toBe('none');
  });

  it('reset: a fixed page returns to default, the shell to the default shell, a custom page is deleted', () => {
    let docs: DocMap = docsFromPageSet(null, L);
    const base = docFor(docs, 'cart', L);
    docs = withDoc(docs, 'cart', { ...base, content: [...base.content, heading('Heading-2')] }, L);
    docs = withDoc(docs, 'shell', { ...docs.shell!, content: [...docs.shell!.content, heading('Heading-3')] }, L);
    const created = newCustomPage(docs, 'about', 'About us');
    if ('error' in created) throw new Error(created.error);
    docs = created.docs;
    expect(Object.keys(withoutDoc(docs, 'cart', L))).not.toContain('cart');
    expect(withoutDoc(docs, 'shell', L).shell).toEqual(shell());
    expect(Object.keys(withoutDoc(docs, 'page:about', L))).not.toContain('page:about');
  });

  it('creates custom pages with validation', () => {
    const docs = docsFromPageSet(null, L);
    const ok = newCustomPage(docs, 'spring-sale', '  Spring sale  ');
    expect(ok).toMatchObject({ docKey: 'page:spring-sale' });
    if ('error' in ok) throw new Error('unreachable');
    expect(ok.docs['page:spring-sale']).toEqual({ root: { props: { title: 'Spring sale', description: '', chrome: 'shell' } }, content: [] });
    expect(newCustomPage(ok.docs, 'spring-sale', 'Again')).toEqual({ error: 'A page with that address already exists.' });
    expect(newCustomPage(docs, 'Spring Sale', 'x')).toEqual({ error: 'Use 1–60 lowercase letters, digits or hyphens.' });
    expect(newCustomPage(docs, 'ok', '   ')).toEqual({ error: 'Give the page a title.' });
    expect(newCustomPage(docs, 'ok', 'x'.repeat(121))).toEqual({ error: 'Keep the title to 120 characters.' });
    let many: DocMap = docs;
    for (let i = 0; i < MAX_CUSTOM_PAGES; i += 1) {
      const r = newCustomPage(many, `p${i}`, `P${i}`);
      if ('error' in r) throw new Error(r.error);
      many = r.docs;
    }
    expect(customPageKeys(many)).toHaveLength(MAX_CUSTOM_PAGES);
    expect(newCustomPage(many, 'one-more', 'x')).toEqual({ error: 'A layout can have at most 50 custom pages.' });
  });

  it('reports no issues for defaults and an issue for a broken required page', () => {
    const docs = docsFromPageSet(null, L);
    expect(collectIssues(docs, L)).toEqual([]);
    const broken = withDoc(docs, 'checkout', { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [] }, L);
    const issues = collectIssues(broken, L);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.docKey === 'checkout')).toBe(true);
  });
});
```

> Note for the implementer: `heading()` builds a Heading with only an id; if Plan 2's Heading schema makes that invalid, `collectIssues` is not asserted on those docs, so the tests stay valid.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- builder-editor-page-set`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `page-set.ts`**

```ts
// web/src/builder/editor/page-set.ts
import { defaultDoc } from '@/builder/defaults/index.ts';
import { validateDoc } from '@/builder/guard.ts';
import { isDocKey } from '@/builder/editor/protocol.ts';
import {
  FIXED_ROUTE_KEYS, type ComponentData, type DocKey, type FixedRouteKey, type Issue, type LayoutKind,
  type PageRootProps, type PageSet, type PuckDoc,
} from '@/builder/types.ts';

export type DocMap = Partial<Record<DocKey, PuckDoc>>;
export type CustomKey = `page:${string}`;

export const CUSTOM_SLUG_RE = /^[a-z0-9-]{1,60}$/;
export const MAX_CUSTOM_PAGES = 50;
const MAX_TITLE = 120;

export const isFixedRouteKey = (key: string): key is FixedRouteKey => (FIXED_ROUTE_KEYS as readonly string[]).includes(key);
export const isCustomKey = (key: string): key is CustomKey => key.startsWith('page:') && isDocKey(key);

/** Puck hands back whatever it holds; this is the one shape we store and compare. */
export function normalizeDoc(doc: unknown, docKey: DocKey): PuckDoc {
  const d = (doc ?? {}) as { root?: { props?: Record<string, unknown> }; content?: unknown; zones?: Record<string, ComponentData[]> };
  const p = d.root?.props ?? {};
  const props: PageRootProps = {
    title: typeof p.title === 'string' ? p.title : '',
    description: typeof p.description === 'string' ? p.description : '',
    chrome: docKey !== 'shell' && p.chrome === 'none' ? 'none' : 'shell',
  };
  const content = Array.isArray(d.content) ? (d.content as ComponentData[]).map(stringifyRichtext) : [];
  const zones = d.zones && Object.keys(d.zones).length > 0 ? d.zones : undefined;
  return zones ? { root: { props }, content, zones } : { root: { props }, content };
}

/**
 * Backend contract: every `*Html` prop is an HTML string (a non-string is a 400). Puck stores
 * richtext as a string, but hands blocks a React node while editing — if one ever leaks into
 * the data, it is unrecoverable as HTML, so it becomes '' (with one warning) rather than
 * poisoning every later autosave. Applies at any depth: slots, arrays and objects.
 */
function stringifyRichtext<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stringifyRichtext) as T;
  if (!value || typeof value !== 'object' || !isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (key.endsWith('Html') && typeof v !== 'string') {
      console.warn(`[builder] ${key} was not an HTML string; cleared`);
      out[key] = '';
    } else {
      out[key] = stringifyRichtext(v);
    }
  }
  return out as T;
}

const isPlainObject = (v: object): boolean => {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export const sameDoc = (a: PuckDoc, b: PuckDoc): boolean => stableStringify(a) === stableStringify(b);

function defaultFor(docKey: DocKey, layout: LayoutKind): PuckDoc | null {
  const d = defaultDoc(docKey, layout);
  return d ? normalizeDoc(d, docKey) : null;
}

export function docsFromPageSet(pageSet: PageSet | null, layout: LayoutKind): DocMap {
  if (!pageSet) return { shell: defaultFor('shell', layout)! };
  const docs: DocMap = { shell: normalizeDoc(pageSet.shell, 'shell') };
  for (const [key, doc] of Object.entries(pageSet.pages)) {
    if (doc && isDocKey(key) && key !== 'shell') docs[key] = normalizeDoc(doc, key);
  }
  return docs;
}

export function toPageSet(docs: DocMap, layout: LayoutKind): PageSet {
  const pages: PageSet['pages'] = {};
  for (const [key, doc] of Object.entries(docs)) {
    if (key !== 'shell' && doc) pages[key as keyof PageSet['pages']] = doc;
  }
  return { schemaVersion: 1, shell: docs.shell ?? defaultFor('shell', layout)!, pages };
}

const EMPTY_PAGE: PuckDoc = { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [] };

/** What the canvas shows for a key: the edited doc, else the built-in default. */
export function docFor(docs: DocMap, docKey: DocKey, layout: LayoutKind): PuckDoc {
  return docs[docKey] ?? defaultFor(docKey, layout) ?? EMPTY_PAGE;
}

/**
 * Store an edit, keeping the set sparse: a fixed page equal to its default is not stored.
 * Returns the same object when nothing changed so subscribers can skip work.
 */
export function withDoc(docs: DocMap, docKey: DocKey, doc: PuckDoc, layout: LayoutKind): DocMap {
  const current = docs[docKey];
  if (isFixedRouteKey(docKey)) {
    const def = defaultFor(docKey, layout);
    if (def && sameDoc(doc, def)) {
      if (!current) return docs;
      const next = { ...docs };
      delete next[docKey];
      return next;
    }
  }
  if (current && sameDoc(current, doc)) return docs;
  return { ...docs, [docKey]: doc };
}

/** "Reset page to default" — and, for a custom page, delete it. */
export function withoutDoc(docs: DocMap, docKey: DocKey, layout: LayoutKind): DocMap {
  if (docKey === 'shell') return { ...docs, shell: defaultFor('shell', layout)! };
  if (!(docKey in docs)) return docs;
  const next = { ...docs };
  delete next[docKey];
  return next;
}

export function collectIssues(docs: DocMap, layout: LayoutKind): Issue[] {
  const issues: Issue[] = [];
  const keys = Object.keys(docs) as DocKey[];
  keys.sort((a, b) => (a === 'shell' ? -1 : b === 'shell' ? 1 : 0));
  for (const key of keys) issues.push(...validateDoc(docs[key], key, layout).issues);
  return issues;
}

export const customPageKeys = (docs: DocMap): CustomKey[] => Object.keys(docs).filter(isCustomKey);

export function newCustomPage(docs: DocMap, slug: string, title: string): { docs: DocMap; docKey: CustomKey } | { error: string } {
  const trimmed = title.trim();
  if (!CUSTOM_SLUG_RE.test(slug)) return { error: 'Use 1–60 lowercase letters, digits or hyphens.' };
  const docKey: CustomKey = `page:${slug}`;
  if (docs[docKey]) return { error: 'A page with that address already exists.' };
  if (!trimmed) return { error: 'Give the page a title.' };
  if (trimmed.length > MAX_TITLE) return { error: 'Keep the title to 120 characters.' };
  if (customPageKeys(docs).length >= MAX_CUSTOM_PAGES) return { error: 'A layout can have at most 50 custom pages.' };
  return { docKey, docs: { ...docs, [docKey]: { root: { props: { title: trimmed, description: '', chrome: 'shell' } }, content: [] } } };
}

/** Depth-first over a content array and every slot inside it (slot = array of component data). */
export function forEachComponent(content: ComponentData[], visit: (c: ComponentData) => void): void {
  for (const item of content) {
    visit(item);
    for (const value of Object.values(item.props)) {
      if (Array.isArray(value) && value.every((v) => v && typeof v === 'object' && 'type' in v && 'props' in v)) {
        forEachComponent(value as ComponentData[], visit);
      }
    }
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- builder-editor-page-set`
Expected: PASS. If "reports no issues for defaults" fails, a Plan 2 default doc fails its own rules — report it, do not change the assertion.

- [ ] **Step 5: Write the failing route-bound test**

```ts
// web/test/builder-editor-route-bound.test.ts
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '@/builder/registry.ts';
import { checkRules } from '@/builder/rules.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { homeDocKeys, insertableBlocks, isLockedOn, ROUTE_BOUND } from '@/builder/editor/route-bound.ts';
import type { ComponentData, DocKey, FixedRouteKey, PuckDoc } from '@/builder/types.ts';

function strip(content: ComponentData[], names: ReadonlySet<string>): ComponentData[] {
  return content
    .filter((c) => !names.has(c.type))
    .map((c) => ({
      ...c,
      props: Object.fromEntries(Object.entries(c.props).map(([k, v]) => [k, Array.isArray(v) && v.every((x) => x && typeof x === 'object' && 'type' in x) ? strip(v as ComponentData[], names) : v])) as ComponentData['props'],
    }));
}

describe('route-bound table mirrors the renderer', () => {
  it('names exactly the blocks Plan 2 flags routeBound', () => {
    const inTable = new Set(Object.values(ROUTE_BOUND).flatMap((e) => e.blocks));
    const flagged = new Set(Object.values(BLOCKS).filter((d) => d.routeBound).map((d) => d.name));
    expect([...inTable].sort()).toEqual([...flagged].sort());
  });

  it.each(Object.entries(ROUTE_BOUND))('%s: removing its required blocks breaks the rules', (key, entry) => {
    const layout = 'storefront'; // the only layout with every fixed route (product is storefront-only)
    const doc = defaultDoc(key as DocKey, layout)!;
    expect(checkRules(doc, key as DocKey, layout)).toEqual([]);
    const broken: PuckDoc = { ...doc, content: strip(doc.content, new Set(entry.blocks)) };
    expect(checkRules(broken, key as DocKey, layout).length).toBeGreaterThan(0);
  });

  it('a custom page may not hold any route-bound block', () => {
    for (const name of Object.values(ROUTE_BOUND).flatMap((e) => e.blocks)) {
      const doc: PuckDoc = { root: { props: { title: 'x', description: '', chrome: 'shell' } }, content: [{ type: name, props: { id: `${name}-1`, ...BLOCKS[name]!.defaultProps } }] };
      expect(checkRules(doc, 'page:about', 'storefront').length, name).toBeGreaterThan(0);
    }
  });
});

describe('editor placement rules', () => {
  it('locks exactly-one blocks on their own route only', () => {
    expect(isLockedOn('CheckoutFlow', 'checkout')).toBe(true);
    expect(isLockedOn('CartContents', 'cart')).toBe(true);
    expect(isLockedOn('PageOutlet', 'shell')).toBe(true);
    expect(isLockedOn('ProductGrid', 'catalog')).toBe(false);
    expect(isLockedOn('Heading', 'checkout')).toBe(false);
  });

  it('offers route-bound blocks only on their home route', () => {
    expect(homeDocKeys('OrderDetail')).toEqual(['account.order']);
    expect(insertableBlocks('checkout', 'storefront')).toContain('CheckoutFlow');
    expect(insertableBlocks('cart', 'storefront')).not.toContain('CheckoutFlow');
    expect(insertableBlocks('page:about', 'storefront')).not.toContain('ProductGrid');
    expect(insertableBlocks('page:about', 'storefront')).toContain('Heading');
    expect(insertableBlocks('catalog', 'storefront')).not.toContain('PageOutlet');
  });

  it('respects block layouts', () => {
    for (const layout of ['storefront', 'menu', 'webapp'] as const) {
      for (const name of insertableBlocks('page:about', layout)) {
        const l = BLOCKS[name]!.layouts;
        expect(l === 'all' || l.includes(layout), `${name}@${layout}`).toBe(true);
      }
    }
  });

  it('covers the shell and every fixed route', () => {
    const keys: Array<'shell' | FixedRouteKey> = ['shell', 'catalog', 'product', 'cart', 'checkout', 'login', 'account.orders', 'account.order', 'account.loyalty', 'account.referrals', 'account.profile', 'order-status', 'payment-success', 'payment-cancel', 'order-placed', 'verify', 'tracking'];
    expect(Object.keys(ROUTE_BOUND).sort()).toEqual(keys.sort());
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm --prefix web test -- builder-editor-route-bound`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `route-bound.ts`**

```ts
// web/src/builder/editor/route-bound.ts
import { BLOCKS } from '@/builder/registry.ts';
import type { DocKey, FixedRouteKey, LayoutKind } from '@/builder/types.ts';

/**
 * Spec §5.3's required-block table, from the editor's side: where each route-bound block
 * lives, and whether it is "exactly one" (locked against delete/duplicate on its own route).
 * The catalogue's "≥ 1 of" rule is not locked — the issues list reports its absence instead.
 * The route-bound test cross-checks this table against Plan 2's checkRules() and BLOCKS.
 */
export const ROUTE_BOUND: Record<'shell' | FixedRouteKey, { blocks: readonly string[]; exactlyOne: boolean }> = {
  shell: { blocks: ['PageOutlet'], exactlyOne: true },
  catalog: { blocks: ['ProductGrid', 'ProductList', 'WholesaleTable'], exactlyOne: false },
  product: { blocks: ['ProductDetail'], exactlyOne: true },
  cart: { blocks: ['CartContents', 'CartSummary'], exactlyOne: true },
  checkout: { blocks: ['CheckoutFlow'], exactlyOne: true },
  login: { blocks: ['LoginOptions'], exactlyOne: true },
  'account.orders': { blocks: ['OrdersList'], exactlyOne: true },
  'account.order': { blocks: ['OrderDetail'], exactlyOne: true },
  'account.loyalty': { blocks: ['Loyalty'], exactlyOne: true },
  'account.referrals': { blocks: ['Referrals'], exactlyOne: true },
  'account.profile': { blocks: ['Profile'], exactlyOne: true },
  'order-status': { blocks: ['OrderStatus'], exactlyOne: true },
  'payment-success': { blocks: ['PaymentSuccess'], exactlyOne: true },
  'payment-cancel': { blocks: ['PaymentCancel'], exactlyOne: true },
  'order-placed': { blocks: ['OrderPlaced'], exactlyOne: true },
  verify: { blocks: ['VerifyForm'], exactlyOne: true },
  tracking: { blocks: ['TrackingLookup'], exactlyOne: true },
};

export function homeDocKeys(name: string): DocKey[] {
  return (Object.entries(ROUTE_BOUND) as Array<[DocKey, { blocks: readonly string[] }]>)
    .filter(([, e]) => e.blocks.includes(name))
    .map(([key]) => key);
}

export function isLockedOn(name: string, docKey: DocKey): boolean {
  const entry = (ROUTE_BOUND as Partial<Record<DocKey, { blocks: readonly string[]; exactlyOne: boolean }>>)[docKey];
  return !!entry && entry.exactlyOne && entry.blocks.includes(name);
}

/** Blocks the "Add block" menu and drawer offer on this doc. */
export function insertableBlocks(docKey: DocKey, layout: LayoutKind): string[] {
  return Object.values(BLOCKS)
    .filter((d) => d.layouts === 'all' || d.layouts.includes(layout))
    .filter((d) => (d.routeBound ? homeDocKeys(d.name).includes(docKey) : true))
    .map((d) => d.name);
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npm --prefix web test -- builder-editor-route-bound`
Expected: PASS. A failure in "names exactly the blocks Plan 2 flags routeBound" means Plan 2 and §5.3 disagree (e.g. `AccountNav` flagged routeBound): report it and resolve against the spec with the coordinator before editing either side.

- [ ] **Step 9: Implement `page-catalog.ts` and the store, test-first**

```ts
// web/test/builder-editor-store.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { DEFAULT_PREVIEW_AS, useEditorStore } from '@/builder/editor/store.ts';
import { pageOptions } from '@/builder/editor/page-catalog.ts';
import { docFor, normalizeDoc } from '@/builder/editor/page-set.ts';

const reset = () => useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null });

describe('editor store', () => {
  beforeEach(reset);

  it('load: ready, default shell, catalog selected, epoch bumped', () => {
    useEditorStore.getState().load({ layout: 'menu', pageSet: null, readOnly: false });
    const s = useEditorStore.getState();
    expect(s.status).toBe('ready');
    expect(s.layout).toBe('menu');
    expect(s.docs.shell).toEqual(normalizeDoc(defaultDoc('shell', 'menu'), 'shell'));
    expect(s.docKey).toBe('catalog');
    expect(s.epoch).toBe(1);
  });

  it('keeps the selected page across a reload when it still exists', () => {
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: false });
    useEditorStore.getState().selectDoc('cart');
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: true });
    expect(useEditorStore.getState().docKey).toBe('cart');
  });

  it('ignores selecting an unknown custom page and invalid keys', () => {
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: false });
    useEditorStore.getState().selectDoc('page:nope');
    useEditorStore.getState().selectDoc('bogus' as never);
    expect(useEditorStore.getState().docKey).toBe('catalog');
  });

  it('updateDoc is ignored in read-only mode', () => {
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: true });
    const before = useEditorStore.getState().docs;
    useEditorStore.getState().updateDoc('catalog', { root: { props: {} }, content: [] });
    expect(useEditorStore.getState().docs).toBe(before);
  });

  it('createPage selects the new page; resetDoc on it deletes it and returns to the catalogue', () => {
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: false });
    expect(useEditorStore.getState().createPage('about', 'About')).toBeNull();
    expect(useEditorStore.getState().docKey).toBe('page:about');
    expect(useEditorStore.getState().createPage('about', 'Again')).toBe('A page with that address already exists.');
    useEditorStore.getState().resetDoc('page:about');
    expect(useEditorStore.getState().docKey).toBe('catalog');
    expect(useEditorStore.getState().docs['page:about']).toBeUndefined();
  });

  it('page options hide the product page outside the storefront layout and list custom pages', () => {
    useEditorStore.getState().load({ layout: 'menu', pageSet: null, readOnly: false });
    useEditorStore.getState().createPage('about', 'About');
    const s = useEditorStore.getState();
    const keys = pageOptions(s.docs, 'menu').flatMap((g) => g.options.map((o) => o.docKey));
    expect(keys).not.toContain('product');
    expect(keys).toContain('page:about');
    expect(pageOptions(s.docs, 'storefront').flatMap((g) => g.options.map((o) => o.docKey))).toContain('product');
    expect(docFor(s.docs, 'page:about', 'menu').root.props.title).toBe('About');
  });
});
```

Run: `npm --prefix web test -- builder-editor-store` → Expected: FAIL (modules missing).

```ts
// web/src/builder/editor/page-catalog.ts
import { customPageKeys, type DocMap } from '@/builder/editor/page-set.ts';
import type { DocKey, FixedRouteKey, LayoutKind } from '@/builder/types.ts';

export const LAYOUT_LABELS: Record<LayoutKind, string> = { storefront: 'Storefront', menu: 'Menu', webapp: 'Telegram web app' };

export const DOC_LABELS: Record<'shell' | FixedRouteKey, string> = {
  shell: 'Header & footer (every page)',
  catalog: 'Catalogue',
  product: 'Product page',
  cart: 'Cart',
  checkout: 'Checkout',
  login: 'Sign in',
  'account.orders': 'Account — orders',
  'account.order': 'Account — order detail',
  'account.loyalty': 'Account — loyalty',
  'account.referrals': 'Account — referrals',
  'account.profile': 'Account — profile',
  'order-status': 'Order status link',
  'payment-success': 'Payment received',
  'payment-cancel': 'Payment cancelled',
  'order-placed': 'Order placed',
  verify: 'Verify a product',
  tracking: 'Track an order',
};

const GROUPS: Array<{ label: string; keys: Array<'shell' | FixedRouteKey> }> = [
  { label: 'Every page', keys: ['shell'] },
  { label: 'Browse', keys: ['catalog', 'product'] },
  { label: 'Buy', keys: ['cart', 'checkout', 'login'] },
  { label: 'Account', keys: ['account.orders', 'account.order', 'account.loyalty', 'account.referrals', 'account.profile'] },
  { label: 'After the order', keys: ['order-status', 'payment-success', 'payment-cancel', 'order-placed'] },
  { label: 'Tools', keys: ['verify', 'tracking'] },
];

export function docLabel(docKey: DocKey, docs: DocMap): string {
  if (docKey.startsWith('page:')) {
    const title = docs[docKey]?.root.props.title;
    return `${title || docKey.slice(5)} (/pages/${docKey.slice(5)})`;
  }
  return DOC_LABELS[docKey as 'shell' | FixedRouteKey];
}

export function pageOptions(docs: DocMap, layout: LayoutKind): Array<{ label: string; options: Array<{ docKey: DocKey; label: string }> }> {
  const edited = (key: DocKey) => (key !== 'shell' && docs[key] ? ' · edited' : '');
  const groups = GROUPS.map((g) => ({
    label: g.label,
    // The product page exists only in the storefront layout; menu/webapp open a sheet (spec §3).
    options: g.keys.filter((k) => k !== 'product' || layout === 'storefront').map((k) => ({ docKey: k as DocKey, label: `${DOC_LABELS[k]}${edited(k)}` })),
  }));
  const custom = customPageKeys(docs).sort();
  if (custom.length) groups.push({ label: 'Custom pages', options: custom.map((k) => ({ docKey: k, label: docLabel(k, docs) })) });
  return groups;
}
```

```ts
// web/src/builder/editor/store.ts
import { create } from 'zustand';
import type { PreviewAs } from '@/builder/mode.ts';
import { isDocKey, type ViewportWidth } from '@/builder/editor/protocol.ts';
import { docsFromPageSet, isCustomKey, newCustomPage, normalizeDoc, withDoc, withoutDoc, type DocMap } from '@/builder/editor/page-set.ts';
import type { DocKey, LayoutKind, PageSet } from '@/builder/types.ts';

export const DEFAULT_PREVIEW_AS: PreviewAs = { session: 'signed-in-orders', cart: 'items' };

export interface EditorState {
  status: 'waiting' | 'ready';
  layout: LayoutKind;
  readOnly: boolean;
  /** The sparse set being edited: always `shell`, plus every touched page. */
  docs: DocMap;
  docKey: DocKey;
  /** Bumped whenever the canvas must remount from the store (load, reset, new page). */
  epoch: number;
  previewAs: PreviewAs;
  /** The frame width the admin should give us; null = fill. Survives reloads of the set. */
  viewport: ViewportWidth | null;
  load(input: { layout: LayoutKind; pageSet: PageSet | null; readOnly: boolean }): void;
  selectDoc(docKey: DocKey): void;
  updateDoc(docKey: DocKey, raw: unknown): void;
  resetDoc(docKey: DocKey): void;
  createPage(slug: string, title: string): string | null;
  setPreviewAs(patch: Partial<PreviewAs>): void;
  setViewport(width: ViewportWidth | null): void;
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  status: 'waiting',
  layout: 'storefront',
  readOnly: false,
  docs: {},
  docKey: 'catalog',
  epoch: 0,
  previewAs: DEFAULT_PREVIEW_AS,
  viewport: null,

  load({ layout, pageSet, readOnly }) {
    const docs = docsFromPageSet(pageSet, layout);
    const current = get().docKey;
    const keep = !(isCustomKey(current) && !docs[current]) && !(current === 'product' && layout !== 'storefront');
    set((s) => ({ status: 'ready', layout, readOnly, docs, docKey: keep ? current : 'catalog', epoch: s.epoch + 1 }));
  },

  selectDoc(docKey) {
    if (!isDocKey(docKey)) return;
    if (isCustomKey(docKey) && !get().docs[docKey]) return;
    set({ docKey });
  },

  updateDoc(docKey, raw) {
    const s = get();
    if (s.readOnly || s.status !== 'ready') return;
    const docs = withDoc(s.docs, docKey, normalizeDoc(raw, docKey), s.layout);
    if (docs !== s.docs) set({ docs });
  },

  resetDoc(docKey) {
    const s = get();
    if (s.readOnly) return;
    set({
      docs: withoutDoc(s.docs, docKey, s.layout),
      docKey: isCustomKey(docKey) ? 'catalog' : s.docKey,
      epoch: s.epoch + 1,
    });
  },

  createPage(slug, title) {
    const s = get();
    if (s.readOnly) return 'This version is read-only.';
    const result = newCustomPage(s.docs, slug, title);
    if ('error' in result) return result.error;
    set({ docs: result.docs, docKey: result.docKey, epoch: s.epoch + 1 });
    return null;
  },

  setPreviewAs(patch) {
    set((s) => ({ previewAs: { ...s.previewAs, ...patch } }));
  },

  setViewport(viewport) {
    if (viewport !== get().viewport) set({ viewport });
  },
}));
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npm --prefix web test -- builder-editor-page-set builder-editor-route-bound builder-editor-store`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add web/src/builder/editor/page-set.ts web/src/builder/editor/route-bound.ts web/src/builder/editor/page-catalog.ts web/src/builder/editor/store.ts web/test/builder-editor-page-set.test.ts web/test/builder-editor-route-bound.test.ts web/test/builder-editor-store.test.ts
git commit -m "feat(builder): sparse page-set model, route-bound rules and editor store"
```

---

### Task 6: Bundle isolation check and editor docs

**Files:**
- Create: `web/vite-plugins/builder-isolation.ts`
- Modify: `web/vite.config.ts`, `docs/builder.md` (append a section; create the file if Plan 2 did not)
- Test: `web/test/builder-isolation-plugin.test.ts`

**Interfaces:**
- Produces: `findLeaks(bundle: Record<string, BundleEntry>): string[]`; `builderIsolation(): Plugin` (build-only; `this.error` on any leak).

- [ ] **Step 1: Write the failing test**

```ts
// web/test/builder-isolation-plugin.test.ts
import { describe, expect, it } from 'vitest';
import { findLeaks } from '../vite-plugins/builder-isolation.ts';

const chunk = (fileName: string, opts: { isEntry?: boolean; imports?: string[]; dynamicImports?: string[]; moduleIds?: string[] }) => ({
  type: 'chunk' as const, fileName, isEntry: opts.isEntry ?? false, imports: opts.imports ?? [], dynamicImports: opts.dynamicImports ?? [], moduleIds: opts.moduleIds ?? [],
});

describe('builder isolation', () => {
  it('passes when Puck lives only behind a dynamic import', () => {
    const bundle = {
      'index.js': chunk('index.js', { isEntry: true, imports: ['vendor.js'], dynamicImports: ['EditorApp.js'], moduleIds: ['/w/src/main.tsx'] }),
      'vendor.js': chunk('vendor.js', { moduleIds: ['/w/node_modules/react/index.js'] }),
      'EditorApp.js': chunk('EditorApp.js', { moduleIds: ['/w/src/builder/editor/EditorApp.tsx', '/w/node_modules/@puckeditor/core/dist/index.mjs'] }),
      'style.css': { type: 'asset' as const, fileName: 'style.css' },
    };
    expect(findLeaks(bundle)).toEqual([]);
  });

  it.each([
    ['@puckeditor/core', '/w/node_modules/@puckeditor/core/dist/chunk-X.mjs'],
    ['tiptap', 'C:\\w\\node_modules\\@tiptap\\core\\dist\\index.js'],
    ['dnd-kit', '/w/node_modules/@dnd-kit/react/index.js'],
    ['an editor module', '/w/src/builder/editor/protocol.ts'],
  ])('fails when %s is statically reachable from the entry', (_label, id) => {
    const bundle = {
      'index.js': chunk('index.js', { isEntry: true, imports: ['shared.js'] }),
      'shared.js': chunk('shared.js', { moduleIds: [id] }),
    };
    expect(findLeaks(bundle)).toEqual([`shared.js: ${id}`]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- builder-isolation-plugin`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the plugin and register it**

```ts
// web/vite-plugins/builder-isolation.ts
import type { Plugin } from 'vite';

/** Editor-only code (spec §2.3, §8, A1): Puck and what it drags in, plus our own editor folder. */
const FORBIDDEN = /[\\/]node_modules[\\/](?:@puckeditor[\\/]core|@tiptap|@dnd-kit)[\\/]/;
const EDITOR_SRC = /[\\/]src[\\/]builder[\\/]editor[\\/]/;

export type BundleEntry =
  | { type: 'chunk'; fileName: string; isEntry: boolean; imports: string[]; dynamicImports: string[]; moduleIds: string[] }
  | { type: 'asset'; fileName: string };

/** Every module in a chunk statically reachable from an entry that belongs to the editor. */
export function findLeaks(bundle: Record<string, BundleEntry>): string[] {
  const chunks = new Map<string, Extract<BundleEntry, { type: 'chunk' }>>();
  for (const entry of Object.values(bundle)) if (entry.type === 'chunk') chunks.set(entry.fileName, entry);
  const reachable = new Set<string>();
  const stack = [...chunks.values()].filter((c) => c.isEntry).map((c) => c.fileName);
  while (stack.length) {
    const name = stack.pop()!;
    if (reachable.has(name)) continue;
    reachable.add(name);
    // Static imports only: the /__builder chunk is a dynamic import and may hold anything.
    stack.push(...(chunks.get(name)?.imports ?? []));
  }
  const leaks: string[] = [];
  for (const name of reachable) {
    for (const id of chunks.get(name)?.moduleIds ?? []) {
      if (FORBIDDEN.test(id) || EDITOR_SRC.test(id)) leaks.push(`${name}: ${id}`);
    }
  }
  return leaks;
}

export function builderIsolation(): Plugin {
  return {
    name: 'sf-builder-isolation',
    apply: 'build',
    generateBundle(_options, bundle) {
      const leaks = findLeaks(bundle as unknown as Record<string, BundleEntry>);
      if (leaks.length) this.error(`Page-builder editor code reached the shopper bundle:\n${leaks.join('\n')}`);
    },
  };
}
```

`web/vite.config.ts` — add the import and append to `plugins` (keep whatever Plan 2 added):

```ts
import { builderIsolation } from './vite-plugins/builder-isolation.ts';
// …
  plugins: [react(), templatesCatalog(), builderIsolation()],
```

- [ ] **Step 4: Run the test and a build**

Run: `npm --prefix web test -- builder-isolation-plugin` → Expected: PASS.
Run: `npm --prefix web run build` → Expected: build succeeds (the editor chunk is still the Task 2 stub; a real Puck chunk is checked again in Task 12).

- [ ] **Step 5: Write the editor section of `docs/builder.md`**

Append (create the file with a `# Page builder` title first if Plan 2 did not):

```markdown
## The editor (`/__builder`)

The editor is a lazy chunk of the storefront, framed by the admin's **Storefront → Pages** tab
at `/__builder?sf-builder=1`. It boots only when that parameter is present **and** the page is
inside a frame (decided once per window, like the Appearance preview); anything else redirects
to `/`. The build fails if `@puckeditor/core`, tiptap, dnd-kit or any `src/builder/editor/`
module is statically reachable from the shopper entry (`vite-plugins/builder-isolation.ts`).

### Protocol (spec §13 A6)

| Direction | Message |
|---|---|
| admin → storefront | `sf-builder-load { protocol: 1, layout, pageSet \| null, theme, readOnly }` |
| admin → storefront | `sf-builder-theme { theme }` · `sf-builder-select-page { docKey }` |
| admin → storefront | `sf-builder-upload-result { requestId, url \| null, error \| null }` |
| storefront → admin | `sf-builder-ready { protocol: 1 }` (to `'*'`) |
| storefront → admin | `sf-builder-change { pageSet, issues }` (500 ms debounce; once after load; never when read-only) |
| storefront → admin | `sf-builder-upload-request { requestId, file }` |
| storefront → admin | `sf-builder-viewport { width: 360 \| 768 \| 1280 \| null }` (on every toggle change and after every load) |

Only messages whose `source` is the parent frame are read; the first valid load pins the admin
origin (it must be an `http(s)` origin), and later messages from any other origin are ignored.
Draft themes never carry custom CSS into the frame.

### Preview width

Puck's own canvas iframe is disabled (the app's theme variables live on the document root), and
its canvas always fills the frame. The header's **Fit / Phone / Tablet / Desktop** toggle posts
`sf-builder-viewport`; the admin resizes the iframe element to that width (centred, scrollable),
so CSS media queries and `useMediaQuery` respond exactly as they would on a real device width.

### Fixture mode

Blocks that need a session, a cart or an order render against built-in **Northbound Supply**
fixtures (`src/builder/editor/fixtures.ts`), chosen with **Preview as** (signed out / signed in /
signed in with orders × empty cart / cart with items). In the editor the api client is
intercepted: the catalogue and settings come from the live public API (without any token),
session routes are answered from fixtures, and every mutation or lookup is refused with a
"Preview only" toast. The session and cart stores write to memory, never to the shop's
`localStorage`, and navigation away from `/__builder` is blocked.

### Fields

Each block's Puck fields live in `src/builder/editor/fields/<Block>.ts` and are derived from the
block's zod schema (`derive-fields.ts`), by prop name first:

| Prop name | Field |
|---|---|
| ends in `Html` | Puck `richtext` (stored as an HTML string, sanitised on save and render) |
| `href` / ends in `Href` | route link: a fixed page, a custom page (`/pages/<slug>`), or an `https:` / `mailto:` / `tel:` address |
| `src` / ends in `Src` | image uploaded through the admin (PNG, JPEG, WebP, GIF, ≤ 5 MB) |
| ends in `Token` (enum) | palette swatches (`var(--sf-<token>)`) |
| `productId` / ends in `ProductId` | product picker over the live catalogue |
| `categoryId` / ends in `CategoryId` | category picker over the live catalogue |
| a slot | Puck `slot` |

Otherwise the JSON-schema type decides: enum → radio (≤ 3 options) or select, boolean → On/Off,
number → number (with min/max), string → text (textarea above 200 chars), array of objects →
array, object → object. A test fails if any schema key of any block has no field.
```

- [ ] **Step 6: Commit**

```bash
git add web/vite-plugins/builder-isolation.ts web/vite.config.ts web/test/builder-isolation-plugin.test.ts docs/builder.md
git commit -m "build(builder): fail the build if editor code reaches the shopper bundle; document the editor"
```

---

### Task 7: Fixture mode

**Files:**
- Create: `web/src/builder/editor/fixtures.ts`, `web/src/builder/editor/fixture-api.ts`, `web/src/builder/editor/fixture-mode.ts`
- Test: `web/test/builder-editor-fixture-api.test.ts`, `web/test/builder-editor-fixture-mode.test.ts`

**Interfaces:**
- Consumes: `ApiInterceptor`, `setApiInterceptor`, `api`, `unwrap` (Task 3); `useSessionStore`, `useCartStore`, `LocalLine`, `SessionCustomer`; `PreviewAs` (Plan 2).
- Produces (`fixtures.ts`): `FIXTURE_TOKEN`, `FIXTURE_CUSTOMER`, `FIXTURE_ORDER_REF = 'NB0977'`, `FIXTURE_ACCESS_KEY = 'preview'`, `FIXTURE_CART_LINES: LocalLine[]`, `FIXTURE_QUOTE: Quote`, `FIXTURE_ORDERS: OrderSummary[]`, `FIXTURE_ORDER_DETAIL: OrderDetail`, `FIXTURE_PUBLIC_ORDER: PublicOrder`, `FIXTURE_REDEEM: RedeemOptions`, `fixtureProfile(p: PreviewAs): Profile`, `fixtureServerCart(p: PreviewAs): ServerCart`.
- Produces (`fixture-api.ts`): `createFixtureInterceptor(getPreviewAs: () => PreviewAs, notify?: () => void): ApiInterceptor`.
- Produces (`fixture-mode.ts`): `PREVIEW_ONLY_MESSAGE`; `notifyPreviewOnly(): void`; `enterFixtureMode(): void` (idempotent); `applyPreviewAs(p: PreviewAs, client: QueryClient): void`.

- [ ] **Step 1: Write the fixtures**

```ts
// web/src/builder/editor/fixtures.ts
// Built-in fake data for the page builder's "Preview as" (spec §6). This repo is public:
// everything here is invented for "Northbound Supply" on shop.example — never real data.
import type { PreviewAs } from '@/builder/mode.ts';
import type { LocalLine } from '@/stores/cart.ts';
import type { SessionCustomer } from '@/stores/session.ts';
import type { ServerCart } from '@/types/cart.ts';
import type { Quote } from '@/types/checkout.ts';
import type { OrderDetail, OrderSummary } from '@/types/orders.ts';
import type { Profile, RedeemOptions } from '@/types/profile.ts';
import type { PublicOrder } from '@/types/public-order.ts';

export const FIXTURE_TOKEN = 'sf-builder-fixture-token';
export const FIXTURE_CUSTOMER: SessionCustomer = { id: 900001, nickname: 'Morgan' };
export const FIXTURE_ORDER_REF = 'NB0977';
export const FIXTURE_ACCESS_KEY = 'preview';

export const FIXTURE_CART_LINES: LocalLine[] = [
  {
    productId: 900101, displayName: 'Northbound Field Kit', sku: 'NB-FK-01', unitPrice: 48, basePrice: 48,
    pricingTiers: [], quantity: 1, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
  },
  {
    productId: 900102, displayName: 'Northbound Trail Tin', sku: 'NB-TT-02', unitPrice: 12.5, basePrice: 14,
    pricingTiers: [{ id: 1, minQuantity: 3, price: 12.5 }], quantity: 3, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
  },
];

export const FIXTURE_QUOTE: Quote = {
  items: [
    { productId: 900101, name: 'Northbound Field Kit', sku: 'NB-FK-01', quantity: 1, unitPrice: 48, lineTotal: 48, tierApplied: false, isPreorder: false },
    { productId: 900102, name: 'Northbound Trail Tin', sku: 'NB-TT-02', quantity: 3, unitPrice: 12.5, lineTotal: 37.5, tierApplied: true, isPreorder: false },
  ],
  subtotal: 85.5,
  coupon: null,
  shippingOptions: [
    { id: 1, name: 'Tracked 48', courier: 'Royal Mail', price: 4.95, freeShipping: false },
    { id: 2, name: 'Tracked 24', courier: 'Royal Mail', price: 6.95, freeShipping: false },
  ],
  selectedShippingOptionId: 1,
  shippingAmount: 4.95,
  storeCredit: { balance: 0, applied: 0, remaining: 0 },
  grandTotal: 90.45,
  amountDue: 90.45,
  paymentMethods: [
    { slot: 'card', method: 'card', displayName: 'Card payment', type: 'gateway', details: null, feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 90.45 },
    { slot: 'manual', method: 'bank_transfer', displayName: 'Bank transfer', type: 'offline', details: null, feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 90.45 },
  ],
  contactModes: { phoneMode: 'optional', emailMode: 'required', defaultPhoneCountry: null },
};

export const FIXTURE_ORDERS: OrderSummary[] = [
  { reference: 'NB1042', status: 'pending', createdAt: '2026-09-20T12:30:00.000Z', totalAmount: 90.45, outstandingBalance: 90.45 },
  { reference: FIXTURE_ORDER_REF, status: 'shipped', createdAt: '2026-09-02T10:15:00.000Z', totalAmount: 64.9, outstandingBalance: 0 },
];

export const FIXTURE_ORDER_DETAIL: OrderDetail = {
  reference: FIXTURE_ORDER_REF,
  status: 'shipped',
  createdAt: '2026-09-02T10:15:00.000Z',
  items: [
    { name: 'Northbound Field Kit', quantity: 1, unitPrice: 48, lineTotal: 48 },
    { name: 'Northbound Trail Tin', quantity: 1, unitPrice: 14, lineTotal: 14 },
  ],
  subtotal: 62,
  shippingAmount: 2.9,
  discountAmount: 0,
  totalAmount: 64.9,
  payments: [{ method: 'card', amount: 64.9, status: 'completed', createdAt: '2026-09-02T10:16:00.000Z' }],
  outstandingBalance: 0,
  shipments: [{
    status: 'in_transit', carrier: 'Royal Mail', trackingNumber: 'NB000977GB', trackingUrl: 'https://shop.example/track/NB000977GB',
    trackingStatusDescription: 'In transit', shippedAt: '2026-09-03T08:00:00.000Z', deliveredAt: null,
  }],
  publicUrl: `https://shop.example/order/${FIXTURE_ORDER_REF}/${FIXTURE_ACCESS_KEY}`,
};

export const FIXTURE_PUBLIC_ORDER: PublicOrder = {
  reference: FIXTURE_ORDER_REF,
  status: 'shipped',
  createdAt: '2026-09-02T10:15:00.000Z',
  deliveredAt: null,
  isPreorder: false,
  currency: 'GBP',
  items: [
    { productName: 'Northbound Field Kit', quantity: 1, unitPrice: 48, totalPrice: 48, isPreorder: false },
    { productName: 'Northbound Trail Tin', quantity: 1, unitPrice: 14, totalPrice: 14, isPreorder: false },
  ],
  totals: { subtotal: 62, shippingAmount: 2.9, discountAmount: 0, taxAmount: 0, totalAmount: 64.9 },
  shippingAddress: {
    firstName: 'Morgan', surname: 'Reed', addressLine1: '1 Harbour Row', addressLine2: null, addressLine3: null,
    city: 'Northbound', county: null, zip: 'NB1 0AA', country: 'GB',
  },
  shipments: [{
    status: 'in_transit', carrier: 'Royal Mail', trackingNumber: 'NB000977GB', trackingUrl: 'https://shop.example/track/NB000977GB',
    trackingStatusDescription: 'In transit', shippedAt: '2026-09-03T08:00:00.000Z', deliveredAt: null,
  }],
  payment: { canPay: false, payBy: null, activePayment: null },
};

export const FIXTURE_REDEEM: RedeemOptions = {
  loyaltyPoints: 860,
  options: [
    { id: 1, label: '5.00 off', pointsCost: 500, creditValue: 5, affordable: true },
    { id: 2, label: '25.00 off', pointsCost: 2000, creditValue: 25, affordable: false },
  ],
};

export function fixtureProfile(p: PreviewAs): Profile {
  const orders = p.session === 'signed-in-orders';
  return {
    loyaltyPoints: 860, storeCreditBalance: 5, referralCode: 'NB-MORGAN-2041', referralsCount: 2, referredPeopleCount: 1,
    hasReferrer: false, referrerNickname: null, totalOrders: orders ? 2 : 0, totalSpend: orders ? 155.35 : 0,
    memberSince: '2026-03-02T09:00:00.000Z', nickname: 'Morgan', identities: { telegram: false, whatsapp: true, email: true },
  };
}

export function fixtureServerCart(p: PreviewAs): ServerCart {
  const lines = p.cart === 'items' ? FIXTURE_CART_LINES : [];
  const items = lines.map((l) => ({
    productId: l.productId, name: l.displayName, quantity: l.quantity, unitPrice: l.unitPrice,
    lineTotal: Math.round(l.unitPrice * l.quantity * 100) / 100, imageUrl: null, isPreorder: l.isPreorder,
    outOfStock: false, priceChanged: false, inactive: false, belowMin: false, aboveMax: false,
    minOrderQuantity: null, maxOrderQuantity: null,
  }));
  return {
    items,
    subtotal: Math.round(items.reduce((sum, i) => sum + i.lineTotal, 0) * 100) / 100,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
  };
}
```

- [ ] **Step 2: Write the failing interceptor test**

```ts
// web/test/builder-editor-fixture-api.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createFixtureInterceptor } from '@/builder/editor/fixture-api.ts';
import { FIXTURE_ACCESS_KEY, FIXTURE_ORDER_REF } from '@/builder/editor/fixtures.ts';
import type { PreviewAs } from '@/builder/mode.ts';

const ORIGIN = 'http://localhost:3000';
const req = (path: string, method = 'GET') => new Request(`${ORIGIN}/api/${path}`, { method, headers: { Authorization: 'Bearer sf-builder-fixture-token' } });

async function call(as: PreviewAs, path: string, method = 'GET') {
  const notify = vi.fn();
  const request = req(path, method);
  const result = await createFixtureInterceptor(() => as, notify)(request);
  return { result, request, notify };
}
const body = async (r: unknown) => (await (r as Response).json()) as { success: boolean; data: unknown; error: string | null; meta?: unknown };

const IN_ORDERS: PreviewAs = { session: 'signed-in-orders', cart: 'items' };
const IN_EMPTY: PreviewAs = { session: 'signed-in', cart: 'empty' };
const OUT: PreviewAs = { session: 'signed-out', cart: 'empty' };

describe('fixture interceptor', () => {
  it('lets settings and the public catalogue through with no token', async () => {
    for (const path of ['storefront/settings', 'catalog', 'catalog/products/101']) {
      const { result, request } = await call(IN_ORDERS, path);
      expect(result).toBeUndefined();
      expect(request.headers.get('authorization')).toBeNull();
    }
  });

  it('rewrites the personalised catalogue to the public one', async () => {
    const { result } = await call(IN_ORDERS, 'storefront/catalog/products/7');
    expect(result).toBeInstanceOf(Request);
    expect(new URL((result as Request).url).pathname).toBe('/api/catalog/products/7');
    expect((result as Request).headers.get('authorization')).toBeNull();
  });

  it('answers session routes from fixtures when signed in, 401 when signed out', async () => {
    expect((await body((await call(IN_ORDERS, 'storefront/profile')).result)).data).toMatchObject({ nickname: 'Morgan', totalOrders: 2 });
    expect((await call(OUT, 'storefront/profile')).result).toMatchObject({ status: 401 });
    expect((await body((await call(IN_ORDERS, 'storefront/cart')).result)).data).toMatchObject({ itemCount: 4 });
    expect((await body((await call(IN_EMPTY, 'storefront/cart')).result)).data).toMatchObject({ itemCount: 0 });
  });

  it('lists fixture orders only for "has orders", with page meta', async () => {
    const withOrders = await body((await call(IN_ORDERS, 'storefront/orders?page=1&limit=10')).result);
    expect(withOrders.data).toHaveLength(2);
    expect(withOrders.meta).toMatchObject({ page: 1, hasNextPage: false });
    expect((await body((await call(IN_EMPTY, 'storefront/orders')).result)).data).toEqual([]);
    expect((await body((await call(IN_ORDERS, `storefront/orders/${FIXTURE_ORDER_REF}`)).result)).data).toMatchObject({ reference: FIXTURE_ORDER_REF });
    expect((await call(IN_EMPTY, `storefront/orders/${FIXTURE_ORDER_REF}`)).result).toMatchObject({ status: 404 });
  });

  it('serves the fixture order-status link and nothing else under orders/', async () => {
    expect((await body((await call(OUT, `orders/${FIXTURE_ORDER_REF}/${FIXTURE_ACCESS_KEY}`)).result)).data).toMatchObject({ status: 'shipped' });
    expect((await call(OUT, 'orders/REAL1/KEY')).result).toMatchObject({ status: 404 });
  });

  it('quotes from fixtures without a toast', async () => {
    const { result, notify } = await call(IN_ORDERS, 'storefront/checkout/quote', 'POST');
    expect((await body(result)).data).toMatchObject({ grandTotal: 90.45 });
    expect(notify).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', 'storefront/checkout'],
    ['POST', 'storefront/checkout/guest'],
    ['PUT', 'storefront/cart'],
    ['POST', 'storefront/auth/whatsapp/start'],
    ['POST', 'storefront/profile/redeem'],
    ['POST', `orders/${FIXTURE_ORDER_REF}/${FIXTURE_ACCESS_KEY}/payment-method`],
    ['POST', 'storefront/tracking'],
    ['GET', 'verify/ABC/123'],
    ['DELETE', 'storefront/anything-new'],
  ])('refuses %s %s with a toast and never lets it out', async (method, path) => {
    const { result, notify } = await call(IN_ORDERS, path, method);
    expect(result).toMatchObject({ status: 400 });
    expect((await body(result)).error).toBe('Preview only — nothing was sent.');
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm --prefix web test -- builder-editor-fixture-api`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `fixture-mode.ts` (message + toast) and `fixture-api.ts`**

```ts
// web/src/builder/editor/fixture-mode.ts
import type { QueryClient } from '@tanstack/react-query';
import { createJSONStorage, type StateStorage } from 'zustand/middleware';
import { notifications } from '@mantine/notifications';
import { useCartStore, type LocalLine } from '@/stores/cart.ts';
import { useSessionStore, type SessionCustomer } from '@/stores/session.ts';
import type { PreviewAs } from '@/builder/mode.ts';
import { FIXTURE_CART_LINES, FIXTURE_CUSTOMER, FIXTURE_TOKEN } from '@/builder/editor/fixtures.ts';

export const PREVIEW_ONLY_MESSAGE = 'Preview only — nothing was sent.';

export function notifyPreviewOnly(): void {
  notifications.show({ id: 'sf-builder-preview-only', message: PREVIEW_ONLY_MESSAGE });
}

function memoryStorage(): StateStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

let entered = false;

/**
 * The editor frame shares the live shop's origin, so the persisted stores would otherwise write
 * fixture sessions and carts into the admin's own storage for that shop. From here on they
 * persist to memory, and every action a block can trigger is inert.
 */
export function enterFixtureMode(): void {
  if (entered) return;
  entered = true;
  useSessionStore.persist.setOptions({
    storage: createJSONStorage<{ token: string | null; customer: SessionCustomer | null }>(memoryStorage),
  });
  useCartStore.persist.setOptions({ storage: createJSONStorage<{ lines: LocalLine[] }>(memoryStorage) });
  // clear() is also what the api client calls on any 401 — a fixture 401 must not sign out.
  useSessionStore.setState({ setSession: () => undefined, clear: () => undefined, setReturnTo: () => undefined });
  useCartStore.setState({
    add: notifyPreviewOnly,
    setQuantity: notifyPreviewOnly,
    remove: notifyPreviewOnly,
    clear: notifyPreviewOnly,
    replaceFromServer: () => undefined,
    setMode: () => undefined,
  });
}

/** Queries that hold live, shopper-independent data; everything else is fixture-backed. */
const LIVE_QUERY_ROOTS = new Set(['settings', 'catalog', 'product']);

export function applyPreviewAs(p: PreviewAs, client: QueryClient): void {
  useSessionStore.setState(
    p.session === 'signed-out' ? { token: null, customer: null } : { token: FIXTURE_TOKEN, customer: FIXTURE_CUSTOMER },
  );
  // Always a local cart: a server-mode cart would schedule PUTs on every render path.
  useCartStore.setState({ mode: 'local', lines: p.cart === 'items' ? FIXTURE_CART_LINES.map((l) => ({ ...l })) : [] });
  void client.resetQueries({ predicate: (q) => !LIVE_QUERY_ROOTS.has(String(q.queryKey[0])) });
}
```

```ts
// web/src/builder/editor/fixture-api.ts
import type { ApiInterceptor } from '@/api/client.ts';
import type { PreviewAs } from '@/builder/mode.ts';
import { notifyPreviewOnly, PREVIEW_ONLY_MESSAGE } from '@/builder/editor/fixture-mode.ts';
import {
  FIXTURE_ACCESS_KEY, FIXTURE_ORDER_DETAIL, FIXTURE_ORDER_REF, FIXTURE_ORDERS, FIXTURE_PUBLIC_ORDER, FIXTURE_QUOTE,
  FIXTURE_REDEEM, fixtureProfile, fixtureServerCart,
} from '@/builder/editor/fixtures.ts';

function respond(status: number, dataOrError: unknown, meta?: unknown): Response {
  const envelope = status < 400
    ? { success: true, data: dataOrError, error: null, ...(meta === undefined ? {} : { meta }) }
    : { success: false, data: null, error: dataOrError };
  return new Response(JSON.stringify(envelope), { status, headers: { 'content-type': 'application/json' } });
}

/** Live, shopper-independent reads the editor must show for real (spec §6). */
const LIVE_GET = /^(?:storefront\/settings|catalog|catalog\/products\/\d+|storefront\/pages\/[a-z]+)$/;
const PUBLIC_ORDER = /^orders\/([^/]+)\/([^/]+)(?:\/(.+))?$/;
const ACCOUNT_ORDER = /^storefront\/orders\/([^/]+)$/;

/**
 * The api client's interceptor while the editor is open. No token ever leaves the frame; no
 * mutation or lookup ever reaches the backend. Unknown routes are refused, not passed through.
 */
export function createFixtureInterceptor(getPreviewAs: () => PreviewAs, notify: () => void = notifyPreviewOnly): ApiInterceptor {
  return (request) => {
    request.headers.delete('Authorization');
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\//, '');
    const method = request.method.toUpperCase();
    const as = getPreviewAs();
    const signedIn = as.session !== 'signed-out';
    const refuse = () => {
      notify();
      return respond(400, PREVIEW_ONLY_MESSAGE);
    };

    if (method === 'GET' && (path === 'storefront/catalog' || path.startsWith('storefront/catalog/'))) {
      const rewritten = new URL(request.url);
      rewritten.pathname = `/api/${path.slice('storefront/'.length)}`;
      return new Request(rewritten, { method: 'GET', headers: request.headers });
    }
    if (method === 'GET' && LIVE_GET.test(path)) return undefined;

    if (method === 'POST' && (path === 'storefront/checkout/quote' || path === 'storefront/checkout/guest/quote')) {
      return respond(200, FIXTURE_QUOTE);
    }

    if (method === 'GET') {
      if (path === 'storefront/cart') return signedIn ? respond(200, fixtureServerCart(as)) : respond(401, 'Unauthorized');
      if (path === 'storefront/profile') return signedIn ? respond(200, fixtureProfile(as)) : respond(401, 'Unauthorized');
      if (path === 'storefront/profile/redeem-options') return signedIn ? respond(200, FIXTURE_REDEEM) : respond(401, 'Unauthorized');
      if (path === 'storefront/orders') {
        if (!signedIn) return respond(401, 'Unauthorized');
        const orders = as.session === 'signed-in-orders' ? FIXTURE_ORDERS : [];
        return respond(200, orders, { page: 1, limit: 10, totalItems: orders.length, totalPages: 1, hasNextPage: false, hasPrevPage: false });
      }
      const accountOrder = ACCOUNT_ORDER.exec(path);
      if (accountOrder) {
        if (!signedIn) return respond(401, 'Unauthorized');
        return as.session === 'signed-in-orders' && decodeURIComponent(accountOrder[1]!) === FIXTURE_ORDER_REF
          ? respond(200, FIXTURE_ORDER_DETAIL)
          : respond(404, 'Order not found');
      }
      const publicOrder = PUBLIC_ORDER.exec(path);
      if (publicOrder) {
        const [, ref, key, tail] = publicOrder;
        if (ref !== FIXTURE_ORDER_REF || key !== FIXTURE_ACCESS_KEY) return respond(404, 'Order not found');
        if (!tail) return respond(200, FIXTURE_PUBLIC_ORDER);
        if (tail === 'payment-options') return respond(200, FIXTURE_QUOTE.paymentMethods);
        return respond(404, 'Not found');
      }
      if (/^storefront\/auth\/attempts\/[^/]+$/.test(path)) return respond(200, { status: 'pending' });
    }

    return refuse();
  };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm --prefix web test -- builder-editor-fixture-api`
Expected: PASS.

- [ ] **Step 6: Write the failing fixture-mode test**

```ts
// web/test/builder-editor-fixture-mode.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { api, setApiInterceptor, unwrap } from '@/api/client.ts';
import { useCartStore } from '@/stores/cart.ts';
import { useSessionStore } from '@/stores/session.ts';
import { applyPreviewAs, enterFixtureMode } from '@/builder/editor/fixture-mode.ts';
import { createFixtureInterceptor } from '@/builder/editor/fixture-api.ts';
import { FIXTURE_CUSTOMER, FIXTURE_TOKEN } from '@/builder/editor/fixtures.ts';
import type { PreviewAs } from '@/builder/mode.ts';

describe('fixture mode', () => {
  beforeEach(() => localStorage.clear());

  it('never writes the session or cart to the shop origin, and ignores the admin\'s own stored shopper', () => {
    localStorage.setItem('sf-session-v1', JSON.stringify({ state: { token: 'real-shopper', customer: { id: 7, nickname: 'Real' } }, version: 0 }));
    const before = localStorage.getItem('sf-session-v1');
    enterFixtureMode();
    applyPreviewAs({ session: 'signed-in-orders', cart: 'items' }, new QueryClient());
    expect(useSessionStore.getState()).toMatchObject({ token: FIXTURE_TOKEN, customer: FIXTURE_CUSTOMER });
    expect(useCartStore.getState().lines).toHaveLength(2);
    expect(localStorage.getItem('sf-session-v1')).toBe(before);
    expect(localStorage.getItem('sf-cart-v1')).toBeNull();
  });

  it('makes cart and session actions inert', () => {
    enterFixtureMode();
    applyPreviewAs({ session: 'signed-in', cart: 'items' }, new QueryClient());
    useCartStore.getState().remove(900101);
    useCartStore.getState().clear();
    useSessionStore.getState().clear();
    expect(useCartStore.getState().lines).toHaveLength(2);
    expect(useSessionStore.getState().token).toBe(FIXTURE_TOKEN);
  });

  it('a fixture 401 does not sign the fixture out', async () => {
    enterFixtureMode();
    let as: PreviewAs = { session: 'signed-in', cart: 'empty' };
    applyPreviewAs(as, new QueryClient());
    const off = setApiInterceptor(createFixtureInterceptor(() => as, vi.fn()));
    as = { session: 'signed-out', cart: 'empty' };
    await expect(unwrap(api.get('storefront/profile'))).rejects.toMatchObject({ status: 401 });
    as = { session: 'signed-in', cart: 'empty' };
    expect(useSessionStore.getState().token).toBe(FIXTURE_TOKEN);
    off();
  });

  it('switching Preview as resets fixture-backed queries but keeps live ones', () => {
    const client = new QueryClient();
    client.setQueryData(['settings'], { live: true });
    client.setQueryData(['catalog', null], { live: true });
    client.setQueryData(['profile'], { fixture: true });
    enterFixtureMode();
    applyPreviewAs({ session: 'signed-out', cart: 'empty' }, client);
    expect(client.getQueryData(['settings'])).toEqual({ live: true });
    expect(client.getQueryData(['catalog', null])).toEqual({ live: true });
    expect(client.getQueryData(['profile'])).toBeUndefined();
    expect(useSessionStore.getState().token).toBeNull();
    expect(useCartStore.getState().lines).toEqual([]);
  });
});
```

- [ ] **Step 7: Run it; it should pass against Step 4's code**

Run: `npm --prefix web test -- builder-editor-fixture-mode builder-editor-fixture-api`
Expected: PASS. If "never writes the session…" fails because `setOptions` did not swap storage, check `node_modules/zustand/middleware/persist.d.ts` (`setOptions` at line ~81) and fix the storage generic — do not relax the assertion.

- [ ] **Step 8: Commit**

```bash
git add web/src/builder/editor/fixtures.ts web/src/builder/editor/fixture-api.ts web/src/builder/editor/fixture-mode.ts web/test/builder-editor-fixture-api.test.ts web/test/builder-editor-fixture-mode.test.ts
git commit -m "feat(builder): Northbound Supply fixture mode — intercepted api, in-memory stores, inert mutations"
```

---

### Task 8: Custom fields (route link, image, palette token, pickers)

> **Implementer: load the `frontend-design:frontend-design` skill before writing UI code.** The editor chrome is the *admin's* tool, not the shop: use a neutral, compact look from `custom-fields/fields.module.css` with its own `--sfb-*` custom properties — never the store's `--sf-*` palette (except inside the palette swatches themselves, which must show the shop's colours). Every control ≥ 32 px tall, visible focus ring, labels tied to inputs.

**Files:**
- Create: `web/src/builder/editor/custom-fields/route-link-model.ts`, `route-link.tsx`, `image.tsx`, `palette-token.tsx`, `pickers.ts`, `fields.module.css`
- Test: `web/test/builder-editor-custom-fields.test.tsx`

**Interfaces:**
- Consumes: `useEditorStore`, `customPageKeys` (Task 5); `getActiveBridge` (Task 4); `fetchCatalog`; `CATALOG_KEY`.
- Produces:
  - `route-link-model.ts`: `LINKABLE_ROUTES: ReadonlyArray<{ path: string; label: string }>`; `type LinkMode = 'route' | 'page' | 'url'`; `linkModeOf(v: string): LinkMode`; `isAllowedExternal(v: string): boolean`; `pagePath(slug: string): string`.
  - `routeLinkField(label: string): CustomField<string>`
  - `imageField(label: string): CustomField<string>`; `IMAGE_TYPES`; `MAX_IMAGE_BYTES`; `checkImageFile(f: File): string | null`
  - `paletteTokenField(label: string, options: string[]): CustomField<string>`
  - `configureCatalogSource(client: QueryClient | null): void`; `productPickerField(label: string): ExternalField<number>`; `categoryPickerField(label: string): ExternalField<number>`
  - `humanizeValue(v: string): string` (exported from `palette-token.tsx`, reused by Task 9)

No value import of `@puckeditor/core` in this task (types only) — labels are rendered by our own markup, so these modules stay testable without loading Puck.

- [ ] **Step 1: Write the failing test**

```tsx
// web/test/builder-editor-custom-fields.test.tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { isAllowedExternal, LINKABLE_ROUTES, linkModeOf } from '@/builder/editor/custom-fields/route-link-model.ts';
import { routeLinkField } from '@/builder/editor/custom-fields/route-link.tsx';
import { checkImageFile, imageField } from '@/builder/editor/custom-fields/image.tsx';
import { paletteTokenField } from '@/builder/editor/custom-fields/palette-token.tsx';
import { categoryPickerField, configureCatalogSource, productPickerField } from '@/builder/editor/custom-fields/pickers.ts';
import { setActiveBridge, type Bridge } from '@/builder/editor/bridge.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import type { Catalog } from '@/types/catalog.ts';

function renderField(field: { render: (p: never) => React.ReactElement }, value: string, onChange = vi.fn()) {
  render(field.render({ field, name: 'x', id: 'field-x', value, onChange, readOnly: false } as never));
  return onChange;
}

describe('route link model', () => {
  it.each([['/', 'route'], ['/cart', 'route'], ['/pages/about', 'page'], ['https://shop.example', 'url'], ['mailto:hi@shop.example', 'url'], ['tel:+441234', 'url']] as const)(
    '%s is a %s link', (v, mode) => expect(linkModeOf(v)).toBe(mode),
  );
  it.each(['https://shop.example/x', 'mailto:hi@shop.example', 'tel:+44 1234 567'])('allows %s', (v) => expect(isAllowedExternal(v)).toBe(true));
  it.each(['http://shop.example', 'javascript:alert(1)', 'https://', 'ftp://x', '//shop.example', '/\\shop.example', 'data:text/html,x', 'mailto:', '#top', '/cart#top'])('refuses %s', (v) => expect(isAllowedExternal(v)).toBe(false));
  it('offers only site-relative paths without anchors as shop pages', () => {
    for (const r of LINKABLE_ROUTES) expect(r.path).toMatch(/^\/(?![/\\])[^#]*$/);
  });
});

describe('route link field', () => {
  beforeEach(() => {
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: false });
    useEditorStore.getState().createPage('about', 'About');
  });

  it('picks a fixed page', () => {
    const onChange = renderField(routeLinkField('Link'), '/');
    fireEvent.change(screen.getByLabelText('Page'), { target: { value: '/cart' } });
    expect(onChange).toHaveBeenCalledWith('/cart');
  });

  it('picks a custom page', () => {
    const onChange = renderField(routeLinkField('Link'), '/');
    fireEvent.click(screen.getByRole('button', { name: 'Custom page' }));
    fireEvent.change(screen.getByLabelText('Custom page'), { target: { value: '/pages/about' } });
    expect(onChange).toHaveBeenCalledWith('/pages/about');
  });

  it('accepts only https/mailto/tel addresses', () => {
    const onChange = renderField(routeLinkField('Link'), '/');
    fireEvent.click(screen.getByRole('button', { name: 'Web address' }));
    const input = screen.getByLabelText('Address');
    fireEvent.change(input, { target: { value: 'javascript:alert(1)' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('https:');
    fireEvent.change(input, { target: { value: 'https://shop.example/about' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('https://shop.example/about');
  });
});

describe('image field', () => {
  it.each([
    [new File(['x'], 'a.svg', { type: 'image/svg+xml' }), 'Use a PNG, JPEG, WebP or GIF image.'],
    [new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' }), 'Images must be 5 MB or smaller.'],
    [new File(['x'], 'a.webp', { type: 'image/webp' }), null],
  ])('checks %#', (file, expected) => expect(checkImageFile(file)).toBe(expected));

  it('uploads through the parent bridge and stores the returned url', async () => {
    const url = `/media/storefront-pages/media/${'c'.repeat(32)}.png`;
    const requestUpload = vi.fn().mockResolvedValue(url);
    setActiveBridge({ requestUpload } as unknown as Bridge);
    const onChange = renderField(imageField('Image'), '');
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Upload image'), { target: { files: [file] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(url));
    expect(requestUpload).toHaveBeenCalledWith(file);
    setActiveBridge(null);
  });

  it('shows the upload error and keeps the old value', async () => {
    setActiveBridge({ requestUpload: vi.fn().mockRejectedValue(new Error('Too big')) } as unknown as Bridge);
    const onChange = renderField(imageField('Image'), '/media/old.png');
    fireEvent.change(screen.getByLabelText('Upload image'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Too big');
    expect(onChange).not.toHaveBeenCalled();
    setActiveBridge(null);
  });
});

describe('palette token field', () => {
  it('renders one pressed swatch per option and reports the choice', () => {
    const onChange = renderField(paletteTokenField('Background', ['none', 'surface', 'primary']), 'surface');
    expect(screen.getByRole('button', { name: 'Surface' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Primary' }));
    expect(onChange).toHaveBeenCalledWith('primary');
    expect(screen.getByRole('button', { name: 'None' })).toBeInTheDocument();
  });
});

describe('catalogue pickers', () => {
  const catalog = {
    products: [
      { id: 1, displayName: 'Northbound Field Kit', sku: 'NB-FK-01', categoryName: 'Kits', isActive: true },
      { id: 2, displayName: 'Northbound Trail Tin', sku: 'NB-TT-02', categoryName: 'Tins', isActive: true },
      { id: 3, displayName: 'Retired Thing', sku: 'NB-OLD', categoryName: null, isActive: false },
    ],
    categories: [{ id: 10, name: 'Kits', slug: 'kits', parentId: null, sortOrder: 1, emoji: null }],
  } as unknown as Catalog;

  it('searches active products by name or SKU and stores the id', async () => {
    const client = new QueryClient();
    client.setQueryData(['catalog', null], catalog);
    configureCatalogSource(client);
    const field = productPickerField('Product');
    expect((await field.fetchList({ query: 'tt-02', filters: {} }))!.map((p: { id: number }) => p.id)).toEqual([2]);
    expect((await field.fetchList({ query: '', filters: {} }))!.map((p: { id: number }) => p.id)).toEqual([1, 2]);
    expect(field.mapProp!(catalog.products[0])).toBe(1);
    expect(field.getItemSummary!(2)).toBe('Northbound Trail Tin');
    expect(field.getItemSummary!(99)).toBe('Product #99');
    const cat = categoryPickerField('Category');
    expect((await cat.fetchList({ query: 'kit', filters: {} }))!.length).toBe(1);
    expect(cat.getItemSummary!(10)).toBe('Kits');
    configureCatalogSource(null);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- builder-editor-custom-fields`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the model and pickers**

```ts
// web/src/builder/editor/custom-fields/route-link-model.ts
/** Pages a link can point at without parameters (spec §6 routeLink). */
export const LINKABLE_ROUTES: ReadonlyArray<{ path: string; label: string }> = [
  { path: '/', label: 'Catalogue' },
  { path: '/cart', label: 'Cart' },
  { path: '/checkout', label: 'Checkout' },
  { path: '/login', label: 'Sign in' },
  { path: '/account/orders', label: 'Account — orders' },
  { path: '/account/loyalty', label: 'Account — loyalty' },
  { path: '/account/referrals', label: 'Account — referrals' },
  { path: '/account/profile', label: 'Account — profile' },
  { path: '/verify', label: 'Verify a product' },
  { path: '/tracking', label: 'Track an order' },
];

export type LinkMode = 'route' | 'page' | 'url';

export const pagePath = (slug: string): string => `/pages/${slug}`;

export function linkModeOf(value: string): LinkMode {
  if (value.startsWith('/pages/')) return 'page';
  if (/^(?:https:|mailto:|tel:)/i.test(value)) return 'url';
  return 'route';
}

/** Mirrors the backend's rule for *Href props: https:, mailto:, tel: (site paths come from the pickers). */
export function isAllowedExternal(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol === 'https:') return u.hostname.length > 0;
    return (u.protocol === 'mailto:' || u.protocol === 'tel:') && u.pathname.trim().length > 0;
  } catch {
    return false;
  }
}
```

```ts
// web/src/builder/editor/custom-fields/pickers.ts
import type { QueryClient } from '@tanstack/react-query';
import type { ExternalField } from '@puckeditor/core';
import { fetchCatalog } from '@/api/catalog.ts';
import { CATALOG_KEY } from '@/features/catalog/use-catalog.ts';
import type { Catalog, Category, Product } from '@/types/catalog.ts';

let client: QueryClient | null = null;
/** Set by the editor session so pickers read the same cached public catalogue as the canvas. */
export function configureCatalogSource(next: QueryClient | null): void {
  client = next;
}

const PUBLIC_CATALOG_KEY = [...CATALOG_KEY, null] as const;
const cached = (): Catalog | undefined => client?.getQueryData<Catalog>(PUBLIC_CATALOG_KEY);
async function load(): Promise<Catalog | null> {
  if (!client) return null;
  return client.fetchQuery({ queryKey: PUBLIC_CATALOG_KEY, queryFn: () => fetchCatalog(false), staleTime: 60_000 });
}
const has = (q: string, ...texts: Array<string | null>) => texts.some((t) => !!t && t.toLowerCase().includes(q));

export function productPickerField(label: string): ExternalField<number> {
  return {
    type: 'external',
    label,
    placeholder: 'Choose a product',
    showSearch: true,
    fetchList: async ({ query }) => {
      const q = query.trim().toLowerCase();
      return ((await load())?.products ?? []).filter((p) => p.isActive && (!q || has(q, p.displayName, p.sku))).slice(0, 100);
    },
    mapRow: (p: Product) => ({ Name: p.displayName, SKU: p.sku, Category: p.categoryName ?? '—' }),
    mapProp: (p: Product) => p.id,
    getItemSummary: (id: number) => cached()?.products.find((p) => p.id === id)?.displayName ?? `Product #${id}`,
  };
}

export function categoryPickerField(label: string): ExternalField<number> {
  return {
    type: 'external',
    label,
    placeholder: 'Choose a category',
    showSearch: true,
    fetchList: async ({ query }) => {
      const q = query.trim().toLowerCase();
      return ((await load())?.categories ?? []).filter((c) => !q || has(q, c.name, c.slug));
    },
    mapRow: (c: Category) => ({ Name: `${c.emoji ? `${c.emoji} ` : ''}${c.name}`, Address: c.slug ? `/c/${c.slug}` : '—' }),
    mapProp: (c: Category) => c.id,
    getItemSummary: (id: number) => cached()?.categories.find((c) => c.id === id)?.name ?? `Category #${id}`,
  };
}
```

- [ ] **Step 4: Implement the three custom-field components**

Use the structure below; refine only the CSS per the frontend-design skill (keep the accessible names the test relies on: `Page`, `Custom page`, `Web address`, `Address`, `Upload image`, swatch names from `humanizeValue`, `role="alert"` on errors).

```tsx
// web/src/builder/editor/custom-fields/palette-token.tsx
import type { CustomField } from '@puckeditor/core';
import styles from '@/builder/editor/custom-fields/fields.module.css';

export function humanizeValue(value: string): string {
  if (value === '' || value === 'none') return 'None';
  const words = value.replace(/[-_]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function paletteTokenField(label: string, options: string[]): CustomField<string> {
  return {
    type: 'custom',
    label,
    render: ({ id, value, onChange, readOnly }) => (
      <fieldset className={styles.field} id={id} disabled={readOnly}>
        <legend className={styles.label}>{label}</legend>
        <div className={styles.swatches}>
          {options.map((token) => (
            <button
              key={token}
              type="button"
              aria-pressed={value === token}
              aria-label={humanizeValue(token)}
              title={humanizeValue(token)}
              className={styles.swatch}
              data-empty={token === '' || token === 'none' ? '' : undefined}
              style={token === '' || token === 'none' ? undefined : { background: `var(--sf-${token})` }}
              onClick={() => onChange(token)}
            />
          ))}
        </div>
      </fieldset>
    ),
  };
}
```

```tsx
// web/src/builder/editor/custom-fields/route-link.tsx
import { useState } from 'react';
import type { CustomField } from '@puckeditor/core';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/builder/editor/store.ts';
import { customPageKeys } from '@/builder/editor/page-set.ts';
import { isAllowedExternal, LINKABLE_ROUTES, linkModeOf, pagePath, type LinkMode } from '@/builder/editor/custom-fields/route-link-model.ts';
import styles from '@/builder/editor/custom-fields/fields.module.css';

const MODES: Array<{ mode: LinkMode; label: string }> = [
  { mode: 'route', label: 'Shop page' },
  { mode: 'page', label: 'Custom page' },
  { mode: 'url', label: 'Web address' },
];

function RouteLinkInput({ label, id, value, onChange, readOnly }: { label: string; id: string; value: string; onChange: (v: string) => void; readOnly?: boolean }) {
  const current = value ?? '';
  const [mode, setMode] = useState<LinkMode>(linkModeOf(current));
  const [draft, setDraft] = useState(linkModeOf(current) === 'url' ? current : '');
  const [error, setError] = useState<string | null>(null);
  const pages = useEditorStore(useShallow((s) => customPageKeys(s.docs).map((k) => ({ path: pagePath(k.slice(5)), title: s.docs[k]?.root.props.title || k.slice(5) }))));

  return (
    <fieldset className={styles.field} id={id} disabled={readOnly}>
      <legend className={styles.label}>{label}</legend>
      <div className={styles.segmented} role="group" aria-label={`${label} type`}>
        {MODES.map((m) => (
          <button key={m.mode} type="button" aria-pressed={mode === m.mode} onClick={() => { setMode(m.mode); setError(null); }}>
            {m.label}
          </button>
        ))}
      </div>
      {mode === 'route' && (
        <label className={styles.row}>
          <span className={styles.sub}>Page</span>
          <select aria-label="Page" value={LINKABLE_ROUTES.some((r) => r.path === current) ? current : ''} onChange={(e) => onChange(e.target.value)}>
            <option value="" disabled>Choose a page…</option>
            {LINKABLE_ROUTES.map((r) => <option key={r.path} value={r.path}>{r.label}</option>)}
          </select>
        </label>
      )}
      {mode === 'page' && (
        pages.length === 0
          ? <p className={styles.hint}>No custom pages yet — add one with “New page”.</p>
          : (
            <label className={styles.row}>
              <span className={styles.sub}>Custom page</span>
              <select aria-label="Custom page" value={pages.some((p) => p.path === current) ? current : ''} onChange={(e) => onChange(e.target.value)}>
                <option value="" disabled>Choose a page…</option>
                {pages.map((p) => <option key={p.path} value={p.path}>{p.title} ({p.path})</option>)}
              </select>
            </label>
          )
      )}
      {mode === 'url' && (
        <label className={styles.row}>
          <span className={styles.sub}>Address</span>
          <input
            aria-label="Address"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              const v = draft.trim();
              if (!isAllowedExternal(v)) { setError('Use an https:, mailto: or tel: address.'); return; }
              setError(null);
              onChange(v);
            }}
          />
        </label>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </fieldset>
  );
}

export function routeLinkField(label: string): CustomField<string> {
  return { type: 'custom', label, render: (p) => <RouteLinkInput label={label} id={p.id} value={p.value} onChange={p.onChange} readOnly={p.readOnly} /> };
}
```

```tsx
// web/src/builder/editor/custom-fields/image.tsx
import { useId, useState } from 'react';
import type { CustomField } from '@puckeditor/core';
import { getActiveBridge } from '@/builder/editor/bridge.ts';
import styles from '@/builder/editor/custom-fields/fields.module.css';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function checkImageFile(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return 'Use a PNG, JPEG, WebP or GIF image.';
  if (file.size > MAX_IMAGE_BYTES) return 'Images must be 5 MB or smaller.';
  return null;
}

function ImageInput({ label, id, value, onChange, readOnly }: { label: string; id: string; value: string; onChange: (v: string) => void; readOnly?: boolean }) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const problem = checkImageFile(file);
    if (problem) { setError(problem); return; }
    const bridge = getActiveBridge();
    if (!bridge) { setError('The editor is not connected to the admin.'); return; }
    setBusy(true);
    setError(null);
    try {
      onChange(await bridge.requestUpload(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className={styles.field} id={id} disabled={readOnly || busy}>
      <legend className={styles.label}>{label}</legend>
      {value ? <img className={styles.thumb} src={value} alt="" /> : <div className={styles.thumbEmpty}>No image</div>}
      <div className={styles.actions}>
        <label className={styles.button} htmlFor={inputId}>{busy ? 'Uploading…' : value ? 'Replace image' : 'Upload image'}</label>
        <input id={inputId} aria-label="Upload image" className={styles.visuallyHidden} type="file" accept={IMAGE_TYPES.join(',')} onChange={(e) => void upload(e.target.files?.[0])} />
        {value && <button type="button" className={styles.buttonQuiet} onClick={() => onChange('')}>Remove</button>}
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </fieldset>
  );
}

export function imageField(label: string): CustomField<string> {
  return { type: 'custom', label, render: (p) => <ImageInput label={label} id={p.id} value={p.value} onChange={p.onChange} readOnly={p.readOnly} /> };
}
```

`web/src/builder/editor/custom-fields/fields.module.css` — define `.field`, `.label`, `.sub`, `.row`, `.segmented`, `.swatches`, `.swatch` (`[aria-pressed='true']` ring, `[data-empty]` checkerboard), `.thumb`, `.thumbEmpty`, `.actions`, `.button`, `.buttonQuiet`, `.hint`, `.error`, `.visuallyHidden`, all on neutral `--sfb-*` tokens declared on `.field` (e.g. `--sfb-ink: #1d2433; --sfb-line: #d9dde5; --sfb-accent: #3355ff; --sfb-danger: #c0392b`), ≥ 32 px controls, `:focus-visible` outlines, `@media (prefers-reduced-motion: reduce)` disabling transitions.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix web test -- builder-editor-custom-fields`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/builder/editor/custom-fields web/test/builder-editor-custom-fields.test.tsx
git commit -m "feat(builder): route-link, image, palette and catalogue picker fields"
```

---

### Task 9: Schema-derived fields and the 45 per-block field files

**Files:**
- Create: `web/src/builder/editor/derive-fields.ts`, `web/src/builder/editor/fields/<BlockName>.ts` × 45
- Test: `web/test/builder-editor-derive-fields.test.ts`, `web/test/builder-editor-fields.test.ts`

**Interfaces:**
- Consumes: Task 8 factories; `BLOCKS`, `BlockDef`.
- Produces: `humanizeKey(key: string): string`; `fieldFor(key: string, schema: JsonSchema): Field | null`; `deriveFields(def: BlockDef<any>): { fields: Fields; uncovered: string[] }`; `blockFields(name: string, overrides?: Fields): Fields`; `schemaKeys(def: BlockDef<any>): string[]`; each `fields/<Name>.ts` exports `fields: Fields`.

- [ ] **Step 1: Write the failing derivation test**

```ts
// web/test/builder-editor-derive-fields.test.ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { deriveFields, humanizeKey } from '@/builder/editor/derive-fields.ts';
import type { BlockDef } from '@/builder/define.ts';

function def(schema: z.ZodType, slots: string[] = []): BlockDef<Record<string, unknown>> {
  return { name: 'Probe', label: 'Probe', category: 'content', layouts: 'all', routeBound: false, slots, schema, defaultProps: {}, render: () => null } as unknown as BlockDef<Record<string, unknown>>;
}

describe('deriveFields', () => {
  it('maps prop names to the custom fields first', () => {
    const { fields, uncovered } = deriveFields(def(z.object({
      bodyHtml: z.string(), href: z.string(), ctaHref: z.string(), src: z.string(), heroSrc: z.string(),
      backgroundToken: z.enum(['none', 'surface', 'primary']), productId: z.number(), featuredCategoryId: z.number().nullable(),
    })));
    expect(uncovered).toEqual([]);
    expect(fields.bodyHtml).toMatchObject({ type: 'richtext', label: 'Body' });
    expect(fields.href).toMatchObject({ type: 'custom', label: 'Link' });
    expect(fields.ctaHref).toMatchObject({ type: 'custom', label: 'Cta' });
    expect(fields.src).toMatchObject({ type: 'custom', label: 'Image' });
    expect(fields.backgroundToken).toMatchObject({ type: 'custom', label: 'Background' });
    expect(fields.productId).toMatchObject({ type: 'external', label: 'Product' });
    expect(fields.featuredCategoryId).toMatchObject({ type: 'external', label: 'Featured category' });
  });

  it('maps JSON-schema types', () => {
    const { fields, uncovered } = deriveFields(def(z.object({
      title: z.string().max(120), body: z.string().max(2000), level: z.number().int().min(1).max(4),
      sticky: z.boolean(), sku: z.enum(['inherit', 'show', 'hide']), padding: z.enum(['none', 'sm', 'md', 'lg', 'xl']),
      items: z.array(z.object({ question: z.string(), answerHtml: z.string() })),
      meta: z.object({ caption: z.string() }),
    }), ['children']));
    expect(uncovered).toEqual([]);
    expect(fields.title).toMatchObject({ type: 'text' });
    expect(fields.body).toMatchObject({ type: 'textarea' });
    expect(fields.level).toMatchObject({ type: 'number', min: 1, max: 4 });
    expect(fields.sticky).toMatchObject({ type: 'radio', options: [{ label: 'On', value: true }, { label: 'Off', value: false }] });
    expect(fields.sku).toMatchObject({ type: 'radio', options: [{ label: 'Inherit', value: 'inherit' }, { label: 'Show', value: 'show' }, { label: 'Hide', value: 'hide' }] });
    expect(fields.padding).toMatchObject({ type: 'select' });
    expect(fields.items).toMatchObject({ type: 'array', arrayFields: { question: { type: 'text' }, answerHtml: { type: 'richtext' } }, defaultItemProps: { question: '', answerHtml: '' } });
    expect(fields.meta).toMatchObject({ type: 'object', objectFields: { caption: { type: 'text' } } });
    expect(fields.children).toEqual({ type: 'slot', label: 'Children' });
  });

  it('reports keys it cannot map instead of guessing', () => {
    const { uncovered } = deriveFields(def(z.object({
      ids: z.array(z.number()),
      when: z.date(),
      // Would be read as components by the backend (items with both `type` and `props`).
      cards: z.array(z.object({ type: z.string(), props: z.object({ label: z.string() }) })),
    })));
    expect(uncovered.sort()).toEqual(['cards', 'ids', 'when']);
  });

  it('humanises keys', () => {
    expect(humanizeKey('showSku')).toBe('Show sku');
    expect(humanizeKey('answerHtml')).toBe('Answer');
    expect(humanizeKey('href')).toBe('Link');
    expect(humanizeKey('src')).toBe('Image');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- builder-editor-derive-fields`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `derive-fields.ts`**

```ts
// web/src/builder/editor/derive-fields.ts
import { z } from 'zod';
import type { Field, Fields } from '@puckeditor/core';
import { BLOCKS } from '@/builder/registry.ts';
import type { BlockDef } from '@/builder/define.ts';
import { routeLinkField } from '@/builder/editor/custom-fields/route-link.tsx';
import { imageField } from '@/builder/editor/custom-fields/image.tsx';
import { humanizeValue, paletteTokenField } from '@/builder/editor/custom-fields/palette-token.tsx';
import { categoryPickerField, productPickerField } from '@/builder/editor/custom-fields/pickers.ts';

export interface JsonSchema {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  default?: unknown;
}

const SPECIAL_LABELS: Record<string, string> = { href: 'Link', src: 'Image' };

export function humanizeKey(key: string): string {
  if (SPECIAL_LABELS[key]) return SPECIAL_LABELS[key];
  const base = key.replace(/(Html|Href|Src|Token|Id)$/, '') || key;
  const words = base.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `X | null` → X; everything else unchanged. */
function unwrapNullable(s: JsonSchema): JsonSchema {
  const alts = s.anyOf ?? s.oneOf;
  if (alts) {
    const rest = alts.filter((a) => a.type !== 'null');
    if (rest.length === 1) return { ...rest[0]!, default: s.default ?? rest[0]!.default };
  }
  if (Array.isArray(s.type)) {
    const rest = s.type.filter((t) => t !== 'null');
    if (rest.length === 1) return { ...s, type: rest[0] };
  }
  return s;
}

function enumValues(s: JsonSchema): Array<string | number | boolean> | null {
  if (Array.isArray(s.enum)) return s.enum as Array<string | number | boolean>;
  const alts = s.anyOf ?? s.oneOf;
  if (alts && alts.length > 0 && alts.every((a) => 'const' in a)) return alts.map((a) => a.const as string | number | boolean);
  return null;
}

function defaultValue(s: JsonSchema): unknown {
  const u = unwrapNullable(s);
  if (u.default !== undefined) return u.default;
  const values = enumValues(u);
  if (values) return values[0];
  switch (u.type) {
    case 'string': return '';
    case 'number': case 'integer': return u.minimum ?? 0;
    case 'boolean': return false;
    case 'array': return [];
    case 'object': return Object.fromEntries(Object.entries(u.properties ?? {}).map(([k, v]) => [k, defaultValue(v)]));
    default: return null;
  }
}

function objectFields(s: JsonSchema): Fields | null {
  const out: Fields = {};
  for (const [key, prop] of Object.entries(s.properties ?? {})) {
    const f = fieldFor(key, prop);
    if (!f) return null;
    out[key] = f;
  }
  return out;
}

/** Prop name first (spec §6 custom fields, A2 richtext), then JSON-schema type. null = no safe mapping. */
export function fieldFor(key: string, raw: JsonSchema): Field | null {
  const s = unwrapNullable(raw);
  const label = humanizeKey(key);
  const values = enumValues(s);
  if (key.endsWith('Html')) return { type: 'richtext', label };
  if (key === 'href' || key.endsWith('Href')) return routeLinkField(label) as Field;
  if (key === 'src' || key.endsWith('Src')) return imageField(label) as Field;
  if (key.endsWith('Token') && values) return paletteTokenField(label, values.map(String)) as Field;
  if (key === 'productId' || key.endsWith('ProductId')) return productPickerField(label) as Field;
  if (key === 'categoryId' || key.endsWith('CategoryId')) return categoryPickerField(label) as Field;
  if (values) {
    const options = values.map((v) => ({ label: typeof v === 'boolean' ? (v ? 'On' : 'Off') : humanizeValue(String(v)), value: v }));
    return values.length <= 3 ? { type: 'radio', label, options } : { type: 'select', label, options };
  }
  switch (s.type) {
    case 'boolean':
      return { type: 'radio', label, options: [{ label: 'On', value: true }, { label: 'Off', value: false }] };
    case 'number':
    case 'integer':
      return { type: 'number', label, ...(s.minimum !== undefined ? { min: s.minimum } : {}), ...(s.maximum !== undefined ? { max: s.maximum } : {}) };
    case 'string':
      return (s.maxLength ?? 0) > 200 ? { type: 'textarea', label } : { type: 'text', label };
    case 'array': {
      const item = s.items ? unwrapNullable(s.items) : null;
      if (!item || item.type !== 'object') return null;
      // Backend contract: array items carrying both `type` and `props` are read as components
      // (slots). A non-slot array shaped like that must be reported, not edited.
      if (item.properties && 'type' in item.properties && 'props' in item.properties) return null;
      const arrayFields = objectFields(item);
      if (!arrayFields) return null;
      const firstText = Object.entries(item.properties ?? {}).find(([, p]) => unwrapNullable(p).type === 'string')?.[0];
      return {
        type: 'array',
        label,
        arrayFields,
        defaultItemProps: defaultValue(item) as Record<string, unknown>,
        getItemSummary: (row: Record<string, unknown>, i?: number) =>
          (firstText && typeof row[firstText] === 'string' && (row[firstText] as string).trim()) || `Item ${(i ?? 0) + 1}`,
      } as Field;
    }
    case 'object': {
      const sub = objectFields(s);
      return sub ? ({ type: 'object', label, objectFields: sub } as Field) : null;
    }
    default:
      return null;
  }
}

function toJson(def: BlockDef<any>): JsonSchema {
  return z.toJSONSchema(def.schema, { unrepresentable: 'any', io: 'input' }) as JsonSchema;
}

export const schemaKeys = (def: BlockDef<any>): string[] => Object.keys(toJson(def).properties ?? {});

export function deriveFields(def: BlockDef<any>): { fields: Fields; uncovered: string[] } {
  const fields: Fields = {};
  const uncovered: string[] = [];
  for (const [key, prop] of Object.entries(toJson(def).properties ?? {})) {
    const f = fieldFor(key, prop);
    if (f) fields[key] = f;
    else uncovered.push(key);
  }
  for (const slot of def.slots) fields[slot] = { type: 'slot', label: humanizeKey(slot) };
  return { fields, uncovered };
}

/** Used by every fields/<Block>.ts: derived fields, with that block's overrides on top. */
export function blockFields(name: string, overrides: Fields = {}): Fields {
  const def = BLOCKS[name];
  if (!def) throw new Error(`Unknown block ${name}`);
  return { ...deriveFields(def).fields, ...overrides };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- builder-editor-derive-fields`
Expected: PASS. If a `toMatchObject` on `number` min/max fails, print `z.toJSONSchema(z.number().int().min(1).max(4))` and adapt `fieldFor` to the keys zod 4 emits (e.g. `exclusiveMinimum`) — do not weaken the test.

- [ ] **Step 5: Generate the 45 field files**

Write this generator to your scratchpad (not the repo) and run it once from the repo root:

```js
// scratchpad/gen-fields.mjs
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
const names = ['PageOutlet','Header','NavLinks','Footer','TopBar','NoticeBanners','CutoffBar','ContactStrip','MobileCartBar',
  'CatalogHero','CategoryNav','SearchField','ProductGrid','ProductList','WholesaleTable','FeaturedProducts','Upsells',
  'ProductDetail','CartContents','CartSummary','CheckoutFlow','LoginOptions','AccountNav','OrdersList','OrderDetail','Loyalty','Referrals','Profile',
  'OrderStatus','PaymentSuccess','PaymentCancel','OrderPlaced','VerifyForm','TrackingLookup',
  'Heading','RichText','Image','Button','Columns','Section','Spacer','Divider','FAQ','Testimonial','Video'];
const dir = 'web/src/builder/editor/fields';
mkdirSync(dir, { recursive: true });
for (const name of names) {
  const file = `${dir}/${name}.ts`;
  if (existsSync(file)) continue;
  writeFileSync(file, `import { blockFields } from '@/builder/editor/derive-fields.ts';\n\n/** ${name}: fields derived from the block's zod schema; put overrides in the second argument. */\nexport const fields = blockFields('${name}');\n`);
}
```

Run: `node <scratchpad>/gen-fields.mjs` → 45 files, LF line endings.

- [ ] **Step 6: Write the coverage test**

```ts
// web/test/builder-editor-fields.test.ts
import { describe, expect, it } from 'vitest';
import type { Fields } from '@puckeditor/core';
import { BLOCKS } from '@/builder/registry.ts';
import { schemaKeys } from '@/builder/editor/derive-fields.ts';

const modules = import.meta.glob<{ fields: Fields }>('../src/builder/editor/fields/*.ts', { eager: true });
const byName = Object.fromEntries(Object.entries(modules).map(([path, m]) => [path.slice(path.lastIndexOf('/') + 1, -3), m.fields]));

describe('per-block editor fields', () => {
  it('has exactly one fields file per registered block', () => {
    expect(Object.keys(byName).sort()).toEqual(Object.keys(BLOCKS).sort());
  });

  it.each(Object.keys(BLOCKS))('%s: every schema key and slot has a field', (name) => {
    const def = BLOCKS[name]!;
    for (const key of [...schemaKeys(def), ...def.slots]) expect(byName[name], `${name}.${key}`).toHaveProperty(key);
  });

  it.each(Object.keys(BLOCKS))('%s: slots are slot fields', (name) => {
    for (const slot of BLOCKS[name]!.slots) expect(byName[name]![slot]).toMatchObject({ type: 'slot' });
  });
});
```

- [ ] **Step 7: Run it and close every gap with an override**

Run: `npm --prefix web test -- builder-editor-fields`
Expected on first run: possibly FAIL for keys `deriveFields` cannot map (e.g. a `number[]` of product ids). For each failing `Block.key`, add an override in *that block's* file using an existing factory or a Puck built-in — never by loosening the test. Example for a hypothetical `FeaturedProducts.productIds: number[]`:

```ts
// web/src/builder/editor/fields/Video.ts  (hypothetical: a `provider` prop typed as z.string() instead of an enum)
import { blockFields } from '@/builder/editor/derive-fields.ts';

export const fields = blockFields('Video', {
  provider: { type: 'radio', label: 'Provider', options: [{ label: 'YouTube', value: 'youtube' }, { label: 'Vimeo', value: 'vimeo' }] },
});
```

A plain id list (`productIds: number[]`) is the one shape no override should paper over: Puck's `array` field needs object items and the spec wants product pickers to be `external` fields. Report it to the coordinator so Plan 2 stores `items: Array<{ productId: number }>` — which `deriveFields` maps to an array of product pickers with no override. Re-run until PASS.

- [ ] **Step 8: Typecheck and commit**

Run: `npm --prefix web run typecheck` → no errors.

```bash
git add web/src/builder/editor/derive-fields.ts web/src/builder/editor/fields web/test/builder-editor-derive-fields.test.ts web/test/builder-editor-fields.test.ts
git commit -m "feat(builder): derive Puck fields from block schemas; one fields file per block"
```

---

### Task 10: Puck config, block wrapper, editor session

> **Implementer: load the `frontend-design:frontend-design` skill before writing UI code** (the outlet placeholder and the block error/loading states are UI).

**Files:**
- Create: `web/src/builder/editor/config.ts`, `web/src/builder/editor/EditorBlock.tsx`, `web/src/builder/editor/EditorBlock.module.css`, `web/src/builder/editor/session.ts`
- Test: `web/test/builder-editor-config.test.ts`, `web/test/builder-editor-session.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 5, 7, 8, 9; `BLOCKS`, `BlockCategory`, `BlockRenderContext`; `builderOverrides` (Task 2).
- Produces:
  - `config.ts`: `ROOT_ZONE = 'root:default-zone'`; `CATEGORY_TITLES: Record<BlockCategory, string>`; `EDITOR_FIELDS: Record<string, Fields>`; `blockMenu(docKey, layout): Array<{ category: BlockCategory; title: string; blocks: Array<{ name: string; label: string }> }>`; `buildEditorConfig(docKey: DocKey, layout: LayoutKind): Config`.
  - `EditorBlock.tsx`: `EditorBlock(p: { def: BlockDef<any>; props: Record<string, unknown>; docKey: DocKey; layout: LayoutKind }): ReactElement`.
  - `session.ts`: `startBuilderSession(win: Window, client: QueryClient): () => void`.

- [ ] **Step 1: Write the failing config test**

```ts
// web/test/builder-editor-config.test.ts
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '@/builder/registry.ts';
import { blockMenu, buildEditorConfig, EDITOR_FIELDS } from '@/builder/editor/config.ts';

describe('editor config', () => {
  it('registers every block valid for the layout, with its fields and defaults', () => {
    const config = buildEditorConfig('catalog', 'storefront');
    for (const def of Object.values(BLOCKS)) {
      if (def.layouts !== 'all' && !def.layouts.includes('storefront')) continue;
      expect(config.components[def.name], def.name).toMatchObject({ label: def.label, defaultProps: def.defaultProps, fields: EDITOR_FIELDS[def.name] });
    }
  });

  it('locks exactly-one blocks on their own route', () => {
    expect(buildEditorConfig('checkout', 'storefront').components.CheckoutFlow!.permissions).toEqual({ delete: false, duplicate: false });
    expect(buildEditorConfig('cart', 'storefront').components.CheckoutFlow!.permissions).toBeUndefined();
    expect(buildEditorConfig('shell', 'storefront').components.PageOutlet!.permissions).toEqual({ delete: false, duplicate: false });
  });

  it('offers only insertable blocks in the drawer and hides the rest', () => {
    const config = buildEditorConfig('page:about', 'storefront');
    const offered = Object.values(config.categories ?? {}).flatMap((c) => (c.visible === false ? [] : c.components ?? []));
    expect(offered).toContain('Heading');
    expect(offered).not.toContain('CheckoutFlow');
    expect(offered).not.toContain('PageOutlet');
    expect(config.categories?.other).toEqual({ visible: false });
  });

  it('menus group by category in a stable order', () => {
    const menu = blockMenu('catalog', 'storefront');
    expect(menu[0]!.category).toBe('content');
    expect(menu.flatMap((g) => g.blocks.map((b) => b.name))).toContain('ProductGrid');
    expect(menu.every((g) => g.blocks.length > 0)).toBe(true);
  });

  it('gives page docs title/description/chrome fields and the shell none', () => {
    expect(Object.keys(buildEditorConfig('cart', 'storefront').root!.fields ?? {})).toEqual(['title', 'description', 'chrome']);
    expect(buildEditorConfig('shell', 'storefront').root!.fields).toEqual({});
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- builder-editor-config`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `EditorBlock.tsx` and `config.ts`**

```tsx
// web/src/builder/editor/EditorBlock.tsx
import { Component, Suspense, type ReactNode } from 'react';
import type { BlockDef, BlockRenderContext } from '@/builder/define.ts';
import type { DocKey, LayoutKind } from '@/builder/types.ts';
import styles from '@/builder/editor/EditorBlock.module.css';

class BlockBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn(`[builder] ${this.props.name} failed to render in the editor`, error);
  }
  render() {
    if (this.state.failed) {
      return <div className={styles.notice} data-sf-builder-block-error="">{this.props.name} couldn’t render here. Check its settings.</div>;
    }
    return this.props.children;
  }
}

/** Rendered as its own component so the block's hooks and throws stay inside the boundary. */
function BlockBody({ def, props, ctx }: { def: BlockDef<any>; props: Record<string, unknown>; ctx: BlockRenderContext }) {
  return <>{def.render({ ...props, puck: ctx } as never)}</>;
}

export function EditorBlock({ def, props, docKey, layout }: { def: BlockDef<any>; props: Record<string, unknown>; docKey: DocKey; layout: LayoutKind }) {
  if (def.name === 'PageOutlet') {
    return <div className={styles.outlet} data-sf-builder-outlet="">Page content appears here</div>;
  }
  // Puck adds its own context under `puck` and an `editMode` flag; blocks get ours instead.
  const rest: Record<string, unknown> = { ...props };
  delete rest.puck;
  delete rest.editMode;
  const ctx: BlockRenderContext = { editing: true, docKey, layout };
  return (
    <BlockBoundary name={def.name}>
      <Suspense fallback={<div className={styles.loading} aria-busy="true" />}>
        <BlockBody def={def} props={rest} ctx={ctx} />
      </Suspense>
    </BlockBoundary>
  );
}
```

`EditorBlock.module.css`: `.outlet` (dashed neutral box, min-height 160px, centred label), `.notice` (small neutral warning box), `.loading` (min-height 48px shimmer disabled under `prefers-reduced-motion`). Neutral `--sfb-*` tokens as in Task 8.

```ts
// web/src/builder/editor/config.ts
import { createElement } from 'react';
import type { ComponentConfig, Config, Fields } from '@puckeditor/core';
import { BLOCKS } from '@/builder/registry.ts';
import type { BlockCategory } from '@/builder/define.ts';
import type { DocKey, LayoutKind } from '@/builder/types.ts';
import { insertableBlocks, isLockedOn } from '@/builder/editor/route-bound.ts';
import { EditorBlock } from '@/builder/editor/EditorBlock.tsx';

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

const inLayout = (layout: LayoutKind) => Object.values(BLOCKS).filter((d) => d.layouts === 'all' || d.layouts.includes(layout));

export function blockMenu(docKey: DocKey, layout: LayoutKind) {
  const insertable = new Set(insertableBlocks(docKey, layout));
  return CATEGORY_ORDER.map((category) => ({
    category,
    title: CATEGORY_TITLES[category],
    blocks: inLayout(layout).filter((d) => d.category === category && insertable.has(d.name)).map((d) => ({ name: d.name, label: d.label })),
  })).filter((g) => g.blocks.length > 0);
}

/** One config per (doc, layout): locks and the drawer depend on which page is open. */
export function buildEditorConfig(docKey: DocKey, layout: LayoutKind): Config {
  const components: Record<string, Omit<ComponentConfig, 'type'>> = {};
  for (const def of inLayout(layout)) {
    components[def.name] = {
      label: def.label,
      fields: EDITOR_FIELDS[def.name] ?? {},
      defaultProps: def.defaultProps,
      ...(isLockedOn(def.name, docKey) ? { permissions: { delete: false, duplicate: false } } : {}),
      render: (props: Record<string, unknown>) => createElement(EditorBlock, { def, props, docKey, layout }),
    };
  }
  const categories: NonNullable<Config['categories']> = {};
  for (const group of blockMenu(docKey, layout)) categories[group.category] = { title: group.title, components: group.blocks.map((b) => b.name) };
  // Registered but not insertable here (another route's blocks): renderable, never offered.
  categories.other = { visible: false };
  return {
    components,
    categories,
    root: {
      fields: docKey === 'shell' ? {} : ROOT_FIELDS,
      defaultProps: { title: '', description: '', chrome: 'shell' },
      render: ({ children }: { children: React.ReactNode }) => createElement('div', { 'data-sf-builder-canvas': '', style: { display: 'contents' } }, children),
    },
  } as Config;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix web test -- builder-editor-config`
Expected: PASS.

- [ ] **Step 5: Write the failing session test**

```ts
// web/test/builder-editor-session.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { startBuilderSession } from '@/builder/editor/session.ts';
import { DEFAULT_PREVIEW_AS, useEditorStore } from '@/builder/editor/store.ts';
import { builderOverrides } from '@/app/builder-gate.ts';
import { CHANGE_DEBOUNCE_MS, getActiveBridge } from '@/builder/editor/bridge.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { THEME } from './builder-editor-protocol.test.ts';

const ADMIN = 'https://admin.shop.example';

function fakeWindow() {
  const listeners: Array<(e: MessageEvent) => void> = [];
  const parent = { postMessage: vi.fn() };
  const win = {
    parent,
    addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.splice(listeners.indexOf(fn), 1),
  } as unknown as Window;
  const send = (data: unknown) => listeners.forEach((fn) => fn({ data, source: parent, origin: ADMIN } as unknown as MessageEvent));
  const changes = () => parent.postMessage.mock.calls.filter(([m]) => m.type === 'sf-builder-change');
  return { win, parent, send, changes };
}
const load = (extra: Record<string, unknown> = {}) => ({ type: 'sf-builder-load', protocol: 1, layout: 'menu', pageSet: null, theme: THEME, readOnly: false, ...extra });

describe('builder session', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null });
    builderOverrides.setState({ theme: null, layout: null });
  });

  it('reports the viewport after every load and whenever the toggle changes', () => {
    const { win, parent, send } = fakeWindow();
    const viewports = () => parent.postMessage.mock.calls.filter(([m]) => m.type === 'sf-builder-viewport').map(([m, o]) => [m.width, o]);
    const stop = startBuilderSession(win, new QueryClient());
    useEditorStore.getState().setViewport(768);
    expect(viewports()).toEqual([]);
    send(load());
    expect(viewports()).toEqual([[768, ADMIN]]);
    useEditorStore.getState().setViewport(360);
    useEditorStore.getState().setViewport(360);
    useEditorStore.getState().setViewport(null);
    expect(viewports()).toEqual([[768, ADMIN], [360, ADMIN], [null, ADMIN]]);
    send(load({ readOnly: true }));
    expect(viewports().at(-1)).toEqual([null, ADMIN]);
    stop();
  });
  afterEach(() => vi.useRealTimers());

  it('announces ready, then answers a null load at once with the default shell and no issues', () => {
    const { win, parent, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'sf-builder-ready', protocol: 1 }, '*');
    send(load());
    expect(changes()).toHaveLength(1);
    const [msg, origin] = changes()[0]!;
    expect(origin).toBe(ADMIN);
    expect(msg.pageSet.pages).toEqual({});
    expect(msg.pageSet.shell.content).toEqual(defaultDoc('shell', 'menu')!.content);
    expect(msg.issues).toEqual([]);
    expect(builderOverrides.getState()).toMatchObject({ layout: 'menu', theme: { customCss: '' } });
    expect(getActiveBridge()).not.toBeNull();
    stop();
    expect(getActiveBridge()).toBeNull();
  });

  it('posts a debounced change after an edit', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load());
    useEditorStore.getState().createPage('about', 'About');
    expect(changes()).toHaveLength(1);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    expect(changes()).toHaveLength(2);
    expect(Object.keys(changes()[1]![0].pageSet.pages)).toEqual(['page:about']);
    stop();
  });

  it('never posts changes in read-only mode', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load({ readOnly: true }));
    useEditorStore.getState().createPage('about', 'About');
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS * 2);
    expect(changes()).toHaveLength(0);
    stop();
  });

  it('follows theme updates and page selection from the admin', () => {
    const { win, send } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load());
    send({ type: 'sf-builder-theme', theme: { ...THEME, colors: { ...THEME.colors, bg: '#123456' } } });
    expect(builderOverrides.getState().theme?.colors.bg).toBe('#123456');
    send({ type: 'sf-builder-select-page', docKey: 'checkout' });
    expect(useEditorStore.getState().docKey).toBe('checkout');
    stop();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm --prefix web test -- builder-editor-session`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `session.ts`**

```ts
// web/src/builder/editor/session.ts
import type { QueryClient } from '@tanstack/react-query';
import { setApiInterceptor } from '@/api/client.ts';
import { builderOverrides } from '@/app/builder-gate.ts';
import { createBridge, setActiveBridge } from '@/builder/editor/bridge.ts';
import { createFixtureInterceptor } from '@/builder/editor/fixture-api.ts';
import { applyPreviewAs, enterFixtureMode } from '@/builder/editor/fixture-mode.ts';
import { configureCatalogSource } from '@/builder/editor/custom-fields/pickers.ts';
import { collectIssues, toPageSet } from '@/builder/editor/page-set.ts';
import { useEditorStore } from '@/builder/editor/store.ts';

/**
 * Everything the editor needs outside React: fixture mode, the api interceptor, the parent
 * bridge and the store → admin change feed. Returns a cleanup (StrictMode runs it twice).
 */
export function startBuilderSession(win: Window, client: QueryClient): () => void {
  enterFixtureMode();
  configureCatalogSource(client);
  const offApi = setApiInterceptor(createFixtureInterceptor(() => useEditorStore.getState().previewAs));

  const bridge = createBridge(win, {
    onLoad(msg) {
      builderOverrides.setState({ theme: msg.theme, layout: msg.layout });
      useEditorStore.getState().load({ layout: msg.layout, pageSet: msg.pageSet, readOnly: msg.readOnly });
      // A6: the first change goes out right after load (the subscription below queued it).
      if (!msg.readOnly) bridge.flushChange();
      // The admin (re)builds its frame on load; tell it which width we are showing.
      bridge.postViewport(useEditorStore.getState().viewport);
    },
    onTheme(theme) {
      builderOverrides.setState({ theme });
    },
    onSelectPage(docKey) {
      useEditorStore.getState().selectDoc(docKey);
    },
  });
  setActiveBridge(bridge);
  applyPreviewAs(useEditorStore.getState().previewAs, client);

  const offStore = useEditorStore.subscribe((s, prev) => {
    if (s.previewAs !== prev.previewAs) applyPreviewAs(s.previewAs, client);
    // Media queries only follow a real frame width, so the admin resizes the iframe itself.
    if (s.viewport !== prev.viewport) bridge.postViewport(s.viewport);
    if (s.docs === prev.docs || s.readOnly || s.status !== 'ready') return;
    bridge.postChange(toPageSet(s.docs, s.layout), collectIssues(s.docs, s.layout));
  });

  return () => {
    offStore();
    offApi();
    setActiveBridge(null);
    configureCatalogSource(null);
    bridge.dispose();
  };
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm --prefix web test -- builder-editor-config builder-editor-session`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add web/src/builder/editor/config.ts web/src/builder/editor/EditorBlock.tsx web/src/builder/editor/EditorBlock.module.css web/src/builder/editor/session.ts web/test/builder-editor-config.test.ts web/test/builder-editor-session.test.ts
git commit -m "feat(builder): per-doc Puck config with route locks, block wrapper, editor session"
```

---

### Task 11: Editor UI — canvas, header, read-only view, navigation lock

> **Implementer: load the `frontend-design:frontend-design` skill before writing UI code.** The header is a dense single-row toolbar that wraps to two rows under ~1100 px; neutral `--sfb-*` palette (Task 8), never the store's `--sf-*`; native `<select>`/`<button>`/`<dialog>`; every control has an accessible name (the e2e and tests use `Page`, `Add block`, `New page`, `Undo`, `Redo`, `Fit`/`Phone`/`Tablet`/`Desktop` (group `Preview width`), `Preview as — session`, `Preview as — cart`, `Reset page to default`/`Delete page`, `Issues`); lock and issue badges are icon + text, not colour alone.

**Files:**
- Create: `web/src/builder/editor/use-puck.ts`, `use-issues.ts`, `viewports.ts`, `fixture-routes.tsx`, `PagePicker.tsx`, `EditorHeader.tsx`, `EditorCanvas.tsx`, `Editor.module.css`
- Replace: `web/src/builder/editor/EditorApp.tsx`
- Test: `web/test/builder-editor-navigation.test.tsx`

**Interfaces:**
- Consumes: everything above; `Puck`, `createUsePuck`, `useGetPuck` from `@puckeditor/core`; `RenderDoc`, `validateDoc`, `defaultDoc`, `BuilderModeProvider`; `useCatalog`.
- Produces: `usePuck` (typed selector hook); `useIssues(): Issue[]`; `VIEWPORT_OPTIONS`, `PUCK_VIEWPORTS: Viewports`; `ViewportToggle()` (exported from `EditorHeader.tsx`, no Puck hooks); `fixtureLocation(docKey, productId): { pattern: string; path: string }`; `FixtureRoutes({ children })`; `useNavigationLock(): void`; `PagePicker()`; `EditorHeader(p: { actions: ReactNode; children: ReactNode })`; `EditorCanvas()`; default export `EditorApp()`.

- [ ] **Step 1: Write the failing navigation test**

```tsx
// web/test/builder-editor-navigation.test.tsx
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, Link, RouterProvider, useNavigate } from 'react-router';
import { fixtureLocation, useNavigationLock } from '@/builder/editor/fixture-routes.tsx';
import { FIXTURE_ACCESS_KEY, FIXTURE_ORDER_REF } from '@/builder/editor/fixtures.ts';

function Harness() {
  useNavigationLock();
  const navigate = useNavigate();
  return (
    <div data-sf-builder-canvas="">
      <button onClick={() => navigate('/cart')}>leave</button>
      <button onClick={() => navigate('/__builder/doc/cart')}>stay</button>
      <Link to="/checkout">link out</Link>
      <a href="https://shop.example/elsewhere">external</a>
    </div>
  );
}

function setup() {
  const router = createMemoryRouter(
    [{ path: '/__builder/*', element: <Harness /> }, { path: '*', element: <p>left the editor</p> }],
    { initialEntries: ['/__builder/doc/catalog'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('editor navigation lock', () => {
  it('blocks programmatic navigation out of /__builder but allows it within', async () => {
    const router = setup();
    await act(async () => fireEvent.click(screen.getByText('leave')));
    expect(router.state.location.pathname).toBe('/__builder/doc/catalog');
    await act(async () => fireEvent.click(screen.getByText('stay')));
    expect(router.state.location.pathname).toBe('/__builder/doc/cart');
  });

  it('swallows link clicks inside the canvas', async () => {
    const router = setup();
    await act(async () => { expect(fireEvent.click(screen.getByText('link out'))).toBe(false); });
    expect(router.state.location.pathname).toBe('/__builder/doc/catalog');
    expect(fireEvent.click(screen.getByText('external'))).toBe(false);
  });
});

describe('fixture locations', () => {
  it('gives param routes fixture params and everything else a stable path', () => {
    expect(fixtureLocation('product', 101)).toEqual({ pattern: 'p/:id', path: 'p/101' });
    expect(fixtureLocation('product', null)).toEqual({ pattern: 'p/:id', path: 'p/0' });
    expect(fixtureLocation('account.order', null)).toEqual({ pattern: 'account/orders/:ref', path: `account/orders/${FIXTURE_ORDER_REF}` });
    expect(fixtureLocation('order-status', null)).toEqual({ pattern: 'order/:ref/:accessKey', path: `order/${FIXTURE_ORDER_REF}/${FIXTURE_ACCESS_KEY}` });
    expect(fixtureLocation('page:about', null)).toEqual({ pattern: 'doc/:docKey', path: 'doc/page-about' });
    expect(fixtureLocation('account.orders', null)).toEqual({ pattern: 'doc/:docKey', path: 'doc/account.orders' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix web test -- builder-editor-navigation`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `fixture-routes.tsx` and the small hooks**

```tsx
// web/src/builder/editor/fixture-routes.tsx
import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useBlocker, useLocation } from 'react-router';
import { notifications } from '@mantine/notifications';
import { BUILDER_PATH } from '@/app/builder-gate.ts';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { FIXTURE_ACCESS_KEY, FIXTURE_ORDER_REF } from '@/builder/editor/fixtures.ts';
import type { DocKey } from '@/builder/types.ts';

/** Where under /__builder a doc is shown, so blocks reading route params get fixture params. */
export function fixtureLocation(docKey: DocKey, productId: number | null): { pattern: string; path: string } {
  switch (docKey) {
    case 'product':
      return { pattern: 'p/:id', path: `p/${productId ?? 0}` };
    case 'account.order':
      return { pattern: 'account/orders/:ref', path: `account/orders/${FIXTURE_ORDER_REF}` };
    case 'order-status':
      return { pattern: 'order/:ref/:accessKey', path: `order/${FIXTURE_ORDER_REF}/${FIXTURE_ACCESS_KEY}` };
    default:
      return { pattern: 'doc/:docKey', path: `doc/${docKey.replace(':', '-')}` };
  }
}

export function FixtureRoutes({ children }: { children: ReactNode }) {
  const docKey = useEditorStore((s) => s.docKey);
  const { data: catalog } = useCatalog();
  const location = useLocation();
  const { pattern, path } = fixtureLocation(docKey, catalog?.products[0]?.id ?? null);
  const target = `${BUILDER_PATH}/${path}`;
  if (location.pathname !== target) return <Navigate to={target} replace />;
  return (
    <Routes>
      <Route path={pattern} element={children} />
    </Routes>
  );
}

/** Nothing inside the editor may take the frame away from /__builder (spec §6, Review Focus 5). */
export function useNavigationLock(): void {
  const blocker = useBlocker(({ nextLocation }) => !nextLocation.pathname.startsWith(BUILDER_PATH));
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    blocker.reset();
    notifications.show({ id: 'sf-builder-nav', message: 'Links don’t navigate while you edit — pick a page from the Page menu.' });
  }, [blocker]);
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.('[data-sf-builder-canvas] a[href]')) event.preventDefault();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
}
```

```ts
// web/src/builder/editor/use-puck.ts
import { createUsePuck } from '@puckeditor/core';

export const usePuck = createUsePuck();
export { useGetPuck } from '@puckeditor/core';
```

```ts
// web/src/builder/editor/use-issues.ts
import { useMemo } from 'react';
import { collectIssues } from '@/builder/editor/page-set.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import type { Issue } from '@/builder/types.ts';

export function useIssues(): Issue[] {
  const docs = useEditorStore((s) => s.docs);
  const layout = useEditorStore((s) => s.layout);
  return useMemo(() => collectIssues(docs, layout), [docs, layout]);
}
```

```ts
// web/src/builder/editor/viewports.ts
import type { Viewports } from '@puckeditor/core';
import type { ViewportWidth } from '@/builder/editor/protocol.ts';

/**
 * The header toggle. Choosing one posts sf-builder-viewport and the admin resizes the iframe,
 * so CSS media queries and useMediaQuery see a real width — Puck's canvas never narrows itself.
 */
export const VIEWPORT_OPTIONS: ReadonlyArray<{ width: ViewportWidth | null; label: string }> = [
  { width: null, label: 'Fit' },
  { width: 360, label: 'Phone' },
  { width: 768, label: 'Tablet' },
  { width: 1280, label: 'Desktop' },
];

/** Puck's own viewport: always the whole frame. */
export const PUCK_VIEWPORTS: Viewports = [{ width: '100%', height: 'auto', label: 'Frame' }];
```

Run: `npm --prefix web test -- builder-editor-navigation` → Expected: PASS.

- [ ] **Step 4: Implement `PagePicker.tsx`**

```tsx
// web/src/builder/editor/PagePicker.tsx
import { useMemo } from 'react';
import { useEditorStore } from '@/builder/editor/store.ts';
import { pageOptions } from '@/builder/editor/page-catalog.ts';
import type { DocKey } from '@/builder/types.ts';
import styles from '@/builder/editor/Editor.module.css';

/** No Puck hooks here: the read-only view uses it outside <Puck>. */
export function PagePicker() {
  const docKey = useEditorStore((s) => s.docKey);
  const docs = useEditorStore((s) => s.docs);
  const layout = useEditorStore((s) => s.layout);
  const groups = useMemo(() => pageOptions(docs, layout), [docs, layout]);
  return (
    <label className={styles.control}>
      <span className={styles.caption}>Page</span>
      <select aria-label="Page" value={docKey} onChange={(e) => useEditorStore.getState().selectDoc(e.target.value as DocKey)}>
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => <option key={o.docKey} value={o.docKey}>{o.label}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 5: Implement `EditorHeader.tsx`**

```tsx
// web/src/builder/editor/EditorHeader.tsx
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useEditorStore } from '@/builder/editor/store.ts';
import { usePuck, useGetPuck } from '@/builder/editor/use-puck.ts';
import { useIssues } from '@/builder/editor/use-issues.ts';
import { blockMenu, ROOT_ZONE } from '@/builder/editor/config.ts';
import { docLabel, LAYOUT_LABELS } from '@/builder/editor/page-catalog.ts';
import { isCustomKey } from '@/builder/editor/page-set.ts';
import { PagePicker } from '@/builder/editor/PagePicker.tsx';
import { VIEWPORT_OPTIONS } from '@/builder/editor/viewports.ts';
import type { PreviewAs } from '@/builder/mode.ts';
import styles from '@/builder/editor/Editor.module.css';

function NewPage() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = useEditorStore.getState().createPage(slug.trim(), title);
    if (problem) { setError(problem); return; }
    setSlug(''); setTitle(''); setError(null);
    dialog.current?.close();
  };
  return (
    <>
      <button type="button" className={styles.button} onClick={() => dialog.current?.showModal()}>New page</button>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="sfb-new-page-title">
        <form onSubmit={submit}>
          <h2 id="sfb-new-page-title">New page</h2>
          <label className={styles.stack}>
            <span>Address</span>
            <span className={styles.prefixed}><span aria-hidden="true">/pages/</span><input aria-label="Page address" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="about-us" required /></span>
          </label>
          <label className={styles.stack}>
            <span>Title</span>
            <input aria-label="Page title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
          </label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.dialogActions}>
            <button type="button" className={styles.buttonQuiet} onClick={() => dialog.current?.close()}>Cancel</button>
            <button type="submit" className={styles.buttonPrimary}>Create page</button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function AddBlock() {
  const docKey = useEditorStore((s) => s.docKey);
  const layout = useEditorStore((s) => s.layout);
  const dispatch = usePuck((s) => s.dispatch);
  const getPuck = useGetPuck();
  const groups = useMemo(() => blockMenu(docKey, layout), [docKey, layout]);
  return (
    <select
      aria-label="Add block"
      className={styles.select}
      value=""
      onChange={(e) => {
        const componentType = e.target.value;
        if (!componentType) return;
        const { appState } = getPuck();
        const sel = appState.ui.itemSelector;
        // After the selected block (in its own slot), or at the end of the page.
        dispatch({
          type: 'insert',
          componentType,
          destinationIndex: sel ? sel.index + 1 : appState.data.content.length,
          destinationZone: sel?.zone ?? ROOT_ZONE,
        });
      }}
    >
      <option value="">Add block…</option>
      {groups.map((g) => (
        <optgroup key={g.category} label={g.title}>
          {g.blocks.map((b) => <option key={b.name} value={b.name}>{b.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

function History() {
  const back = usePuck((s) => s.history.back);
  const forward = usePuck((s) => s.history.forward);
  const hasPast = usePuck((s) => s.history.hasPast);
  const hasFuture = usePuck((s) => s.history.hasFuture);
  return (
    <>
      <button type="button" className={styles.iconButton} aria-label="Undo" disabled={!hasPast} onClick={() => back()}>↶</button>
      <button type="button" className={styles.iconButton} aria-label="Redo" disabled={!hasFuture} onClick={() => forward()}>↷</button>
    </>
  );
}

/** No Puck hooks: also used by the read-only view. The admin does the actual resizing. */
export function ViewportToggle() {
  const viewport = useEditorStore((s) => s.viewport);
  return (
    <div className={styles.segmented} role="group" aria-label="Preview width">
      {VIEWPORT_OPTIONS.map((v) => (
        <button
          key={String(v.width)}
          type="button"
          aria-pressed={viewport === v.width}
          title={v.width ? `${v.width} px wide` : 'Fill the available width'}
          onClick={() => useEditorStore.getState().setViewport(v.width)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

function PreviewAsControls() {
  const previewAs = useEditorStore((s) => s.previewAs);
  const set = (patch: Partial<PreviewAs>) => useEditorStore.getState().setPreviewAs(patch);
  return (
    <div className={styles.control} role="group" aria-label="Preview as">
      <span className={styles.caption}>Preview as</span>
      <select aria-label="Preview as — session" value={previewAs.session} onChange={(e) => set({ session: e.target.value as PreviewAs['session'] })}>
        <option value="signed-out">Signed out</option>
        <option value="signed-in">Signed in</option>
        <option value="signed-in-orders">Signed in, has orders</option>
      </select>
      <select aria-label="Preview as — cart" value={previewAs.cart} onChange={(e) => set({ cart: e.target.value as PreviewAs['cart'] })}>
        <option value="empty">Empty cart</option>
        <option value="items">Cart with items</option>
      </select>
    </div>
  );
}

function ResetPage() {
  const docKey = useEditorStore((s) => s.docKey);
  const touched = useEditorStore((s) => docKey in s.docs);
  const [confirming, setConfirming] = useState(false);
  const custom = isCustomKey(docKey);
  const label = custom ? 'Delete page' : 'Reset page to default';
  if (!confirming) {
    return <button type="button" className={styles.buttonQuiet} disabled={!touched} onClick={() => setConfirming(true)}>{label}</button>;
  }
  return (
    <span className={styles.confirm} role="group" aria-label={label}>
      <button type="button" className={styles.buttonDanger} onClick={() => { useEditorStore.getState().resetDoc(docKey); setConfirming(false); }}>
        {custom ? 'Delete it' : 'Reset it'}
      </button>
      <button type="button" className={styles.buttonQuiet} onClick={() => setConfirming(false)}>Keep</button>
    </span>
  );
}

function IssuesMenu() {
  const issues = useIssues();
  const docs = useEditorStore((s) => s.docs);
  const docKey = useEditorStore((s) => s.docKey);
  const dispatch = usePuck((s) => s.dispatch);
  const getPuck = useGetPuck();
  return (
    <details className={styles.issues} data-count={issues.length}>
      <summary aria-label="Issues">{issues.length === 0 ? 'No issues' : `${issues.length} issue${issues.length === 1 ? '' : 's'} — publishing is blocked`}</summary>
      {issues.length > 0 && (
        <ul>
          {issues.map((issue, i) => (
            <li key={`${issue.docKey}-${issue.rule}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  if (issue.docKey !== docKey) { useEditorStore.getState().selectDoc(issue.docKey); return; }
                  const selector = issue.blockId ? getPuck().getSelectorForId(issue.blockId) : undefined;
                  if (selector) dispatch({ type: 'setUi', ui: { itemSelector: selector } });
                }}
              >
                <strong>{docLabel(issue.docKey, docs)}</strong> {issue.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

/** Replaces Puck's header (no Publish: the admin publishes). Rendered inside <Puck>. */
export function EditorHeader(_props: { actions: ReactNode; children: ReactNode }) {
  const layout = useEditorStore((s) => s.layout);
  return (
    <header className={styles.bar} data-sf-builder-header="">
      <div className={styles.group}>
        <span className={styles.badge}>{LAYOUT_LABELS[layout]} layout</span>
        <PagePicker />
        <NewPage />
      </div>
      <div className={styles.group}>
        <AddBlock />
        <History />
      </div>
      <div className={styles.group}>
        <ViewportToggle />
        <PreviewAsControls />
      </div>
      <div className={styles.group}>
        <ResetPage />
        <IssuesMenu />
      </div>
    </header>
  );
}
```

- [ ] **Step 6: Implement `EditorCanvas.tsx` and `EditorApp.tsx`**

```tsx
// web/src/builder/editor/EditorCanvas.tsx
import { useMemo, type ReactNode } from 'react';
import { Puck, type Data } from '@puckeditor/core';
import '@puckeditor/core/puck.css';
import { RenderDoc } from '@/builder/render.tsx';
import { validateDoc } from '@/builder/guard.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { buildEditorConfig } from '@/builder/editor/config.ts';
import { docFor } from '@/builder/editor/page-set.ts';
import { isLockedOn } from '@/builder/editor/route-bound.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { useIssues } from '@/builder/editor/use-issues.ts';
import { EditorHeader, ViewportToggle } from '@/builder/editor/EditorHeader.tsx';
import { PagePicker } from '@/builder/editor/PagePicker.tsx';
import { PUCK_VIEWPORTS } from '@/builder/editor/viewports.ts';
import styles from '@/builder/editor/Editor.module.css';

function BlockOverlay({ children, componentId, componentType }: { children: ReactNode; hover: boolean; isSelected: boolean; componentId: string; componentType: string }) {
  const docKey = useEditorStore((s) => s.docKey);
  const issues = useIssues();
  const flagged = issues.some((i) => i.docKey === docKey && i.blockId === componentId);
  const locked = isLockedOn(componentType, docKey);
  return (
    <>
      {children}
      {(locked || flagged) && (
        <span className={styles.overlayBadge} data-kind={flagged ? 'issue' : 'lock'}>
          {flagged ? '⚠ Needs attention' : '🔒 Required on this page'}
        </span>
      )}
    </>
  );
}

const OVERRIDES = { header: EditorHeader, componentOverlay: BlockOverlay };
// The canvas always fills the frame; the admin sizes the frame (sf-builder-viewport).
const INITIAL_UI = { viewports: { current: { width: '100%' as const, height: 'auto' as const }, controlsVisible: false, options: PUCK_VIEWPORTS } };

function ReadOnlyView() {
  const docKey = useEditorStore((s) => s.docKey);
  const layout = useEditorStore((s) => s.layout);
  const docs = useEditorStore((s) => s.docs);
  const doc = useMemo(() => {
    const raw = docFor(docs, docKey, layout);
    return validateDoc(raw, docKey, layout).doc ?? defaultDoc(docKey, layout) ?? raw;
  }, [docs, docKey, layout]);
  return (
    <div className={styles.readOnly}>
      <header className={styles.bar}>
        <div className={styles.group}>
          <span className={styles.badge}>Published version · read only</span>
          <PagePicker />
        </div>
        <div className={styles.group}>
          <ViewportToggle />
        </div>
      </header>
      <div data-sf-builder-canvas="" className={styles.readOnlyCanvas}>
        <RenderDoc doc={doc} docKey={docKey} layout={layout} />
      </div>
    </div>
  );
}

export function EditorCanvas() {
  const docKey = useEditorStore((s) => s.docKey);
  const layout = useEditorStore((s) => s.layout);
  const epoch = useEditorStore((s) => s.epoch);
  const readOnly = useEditorStore((s) => s.readOnly);
  const config = useMemo(() => buildEditorConfig(docKey, layout), [docKey, layout]);
  // Puck's `data` is initial state: read the store once per (doc, epoch) and let Puck own it after.
  const data = useMemo(() => {
    const s = useEditorStore.getState();
    return docFor(s.docs, s.docKey, s.layout) as unknown as Data;
  }, [docKey, layout, epoch]);

  if (readOnly) return <ReadOnlyView />;
  return (
    <Puck
      key={`${docKey}|${epoch}`}
      config={config}
      data={data}
      onChange={(next) => useEditorStore.getState().updateDoc(docKey, next)}
      iframe={{ enabled: false }}
      viewports={PUCK_VIEWPORTS}
      ui={INITIAL_UI}
      overrides={OVERRIDES}
      height="100dvh"
    />
  );
}
```

```tsx
// web/src/builder/editor/EditorApp.tsx
import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BuilderModeProvider } from '@/builder/mode.ts';
import { startBuilderSession } from '@/builder/editor/session.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { FixtureRoutes, useNavigationLock } from '@/builder/editor/fixture-routes.tsx';
import { EditorCanvas } from '@/builder/editor/EditorCanvas.tsx';
import styles from '@/builder/editor/Editor.module.css';

/** The /__builder chunk (spec §6). Default export for the route's lazy import. */
export default function EditorApp() {
  const client = useQueryClient();
  useEffect(() => startBuilderSession(window, client), [client]);
  useNavigationLock();
  const status = useEditorStore((s) => s.status);
  const previewAs = useEditorStore((s) => s.previewAs);
  const mode = useMemo(() => ({ editing: true, previewAs }), [previewAs]);

  if (status === 'waiting') {
    return (
      <div className={styles.waiting} role="status">
        <p>Waiting for the admin to open the page builder…</p>
      </div>
    );
  }
  return (
    <BuilderModeProvider value={mode}>
      <FixtureRoutes>
        <EditorCanvas />
      </FixtureRoutes>
    </BuilderModeProvider>
  );
}
```

`Editor.module.css`: `.bar` (sticky, neutral surface, `display:flex; flex-wrap:wrap; gap`), `.group`, `.control`, `.caption`, `.select`, `.badge`, `.button`, `.buttonQuiet`, `.buttonPrimary`, `.buttonDanger`, `.iconButton` (≥ 32 × 32), `.segmented` (`[aria-pressed='true']`), `.confirm`, `.issues` (`[data-count='0']` muted, otherwise warning tone; `ul` popover positioned under the summary, max-height with scroll), `.dialog`, `.dialogActions`, `.stack`, `.prefixed`, `.error`, `.overlayBadge` (`[data-kind='issue']` / `[data-kind='lock']`, positioned top-left of the overlay, `pointer-events:none`), `.waiting`, `.readOnly`, `.readOnlyCanvas`. Declare the `--sfb-*` tokens on `.bar, .dialog, .waiting, .readOnly`. `@media (prefers-reduced-motion: reduce)` removes transitions.

- [ ] **Step 7: Typecheck, unit tests, build**

Run: `npm --prefix web run typecheck` → no errors. (If Puck's `ui`/`overrides` generic types reject a literal, annotate with `Partial<UiState>` / `Partial<Overrides>` imported as types from `@puckeditor/core` — do not use `any`.)
Run: `npm --prefix web test` → all green.
Run: `npm --prefix web run build` → succeeds; the isolation plugin passes. Then confirm Puck landed only in the editor chunk:

Run: `grep -l "puckeditor\|@dnd-kit\|tiptap" web/dist/assets/*.js`
Expected: only chunk file(s) whose name starts with `EditorApp` (or chunks imported solely by it). If the index chunk is listed, the plugin should already have failed — investigate before continuing.

- [ ] **Step 8: Commit**

```bash
git add web/src/builder/editor web/test/builder-editor-navigation.test.tsx
git commit -m "feat(builder): /__builder editor UI — Puck canvas, header, read-only view, navigation lock"
```

---

### Task 12: Framed-editor e2e and full verification

**Files:**
- Create: `e2e/builder-editor.spec.ts`

**Interfaces:**
- Consumes: `installMocks`, `ORIGIN` from `e2e/mocks.ts`; the settings fixture's `theme`.

- [ ] **Step 1: Write the e2e spec**

```ts
// e2e/builder-editor.spec.ts
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { installMocks, ORIGIN } from './mocks.ts';

/** A stand-in for the admin: a page on another origin that frames the editor and records its messages. */
const ADMIN = 'http://admin.shop.example';
const PARENT_HTML = `<!doctype html><html><body style="margin:0">
<iframe id="sf" src="${ORIGIN}/__builder?sf-builder=1" style="width:1440px;height:900px;border:0"></iframe>
<script>
  window.__msgs = [];
  window.addEventListener('message', function (e) {
    if (e.source !== document.getElementById('sf').contentWindow || e.origin !== '${ORIGIN}') return;
    window.__msgs.push(e.data);
  });
  window.__post = function (msg) { document.getElementById('sf').contentWindow.postMessage(msg, '${ORIGIN}'); };
</script></body></html>`;

const settings = JSON.parse(readFileSync(new URL('./fixtures/settings.storefront.json', import.meta.url), 'utf8')) as { theme: unknown };

type Msg = { type: string; pageSet?: { schemaVersion: number; shell: unknown; pages: Record<string, unknown> }; issues?: unknown[] };
const messages = (page: Page, type: string) =>
  page.evaluate((t) => (window as unknown as { __msgs: Msg[] }).__msgs.filter((m) => m.type === t), type);
const post = (page: Page, msg: unknown) => page.evaluate((m) => (window as unknown as { __post: (x: unknown) => void }).__post(m), msg);
const load = (extra: Record<string, unknown> = {}) => ({ type: 'sf-builder-load', protocol: 1, layout: 'storefront', pageSet: null, theme: settings.theme, readOnly: false, ...extra });

async function openFramed(page: Page) {
  await installMocks(page);
  // Registered after installMocks' catch-all abort, so it takes precedence for the admin origin.
  await page.route(`${ADMIN}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: PARENT_HTML }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${ADMIN}/pages`);
  await expect.poll(async () => (await messages(page, 'sf-builder-ready')).length, { timeout: 30_000 }).toBeGreaterThan(0);
  return page.frameLocator('#sf');
}

test.describe('page builder editor', () => {
  test('a load is answered with the default shell, and adding a Heading reports a change', async ({ page }) => {
    const frame = await openFramed(page);
    await post(page, load());

    await expect.poll(async () => (await messages(page, 'sf-builder-change')).length).toBeGreaterThan(0);
    const first = (await messages(page, 'sf-builder-change'))[0]!;
    expect(first.pageSet).toMatchObject({ schemaVersion: 1, pages: {} });
    expect(first.pageSet!.shell).toBeTruthy();
    expect(first.issues).toEqual([]);

    await expect(frame.getByLabel('Page', { exact: true })).toHaveValue('catalog');
    await frame.getByLabel('Add block').selectOption('Heading');

    await expect
      .poll(async () => JSON.stringify((await messages(page, 'sf-builder-change')).at(-1)?.pageSet?.pages.catalog ?? null))
      .toContain('"type":"Heading"');
  });

  test('a read-only load renders the page and never reports changes', async ({ page }) => {
    const frame = await openFramed(page);
    await post(page, load({ readOnly: true }));
    await expect(frame.getByText('Published version · read only')).toBeVisible();
    await page.waitForTimeout(1_500);
    expect(await messages(page, 'sf-builder-change')).toHaveLength(0);
  });

  test('the width toggle asks the admin to resize the frame', async ({ page }) => {
    const frame = await openFramed(page);
    await post(page, load());
    // Once right after load, with the current choice (Fit = null).
    await expect.poll(async () => (await messages(page, 'sf-builder-viewport')).map((m) => (m as { width: unknown }).width)).toEqual([null]);
    await frame.getByRole('group', { name: 'Preview width' }).getByRole('button', { name: 'Phone' }).click();
    await expect.poll(async () => (await messages(page, 'sf-builder-viewport')).at(-1)).toEqual({ type: 'sf-builder-viewport', width: 360 });
    await expect(frame.getByRole('button', { name: 'Phone' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('the admin can switch the page being edited', async ({ page }) => {
    const frame = await openFramed(page);
    await post(page, load());
    await post(page, { type: 'sf-builder-select-page', docKey: 'cart' });
    await expect(frame.getByLabel('Page', { exact: true })).toHaveValue('cart');
  });
});

test.describe('page builder gate', () => {
  for (const path of ['/__builder', '/__builder?sf-builder=1']) {
    test(`${path} outside a frame redirects to /`, async ({ page }) => {
      await installMocks(page);
      await page.goto(path);
      await expect(page).toHaveURL(`${ORIGIN}/`);
    });
  }
});
```

- [ ] **Step 2: Run the new spec**

Run: `npx playwright test -c e2e/playwright.config.ts builder-editor`
Expected: 6 passed. If the Heading test times out on `selectOption`, open the trace (`e2e/test-results/**/trace.zip`) — the common causes are the frame still on the waiting screen (the load message was posted before `ready`; the helper already waits) or `Add block` rendered outside the frame's viewport (the iframe is 1440 wide; the header wraps below ~1100 px).

- [ ] **Step 3: Full verification**

Run each and record the result in the task report:
- `npm --prefix web run typecheck` → no errors
- `npm --prefix web test` → all pass
- `npm --prefix web run build` → succeeds (isolation plugin green)
- `npm run test:e2e` → the **whole** mocked suite passes, including every pre-existing spec (the editor must not change any shopper page)

- [ ] **Step 4: Commit**

```bash
git add e2e/builder-editor.spec.ts
git commit -m "test(builder): framed editor e2e — load, add a Heading, read-only, page select, gate"
```

---

## Self-review notes

- **Spec coverage.** §6 gate → Task 2; messages in/out, origin pinning, debounce, upload via parent → Task 4 + 10; `<Puck>` with iframe disabled, header overrides (page picker grouped as §3, custom pages, New page, layout badge, viewport toggle, Reset page, issues list), lock on route-bound blocks → Tasks 5, 10, 11; live catalogue + fixture mode with Preview as and no-op mutations, fixtures only in the editor chunk → Task 7; fields (built-ins + paletteToken, routeLink, image, product/category external pickers, richtext `*Html`) → Tasks 8–9; §7 categories → Task 10; §8 bundle check → Task 6; §10 editor e2e + non-framed redirect → Task 12; A6 null load ⇒ shell-only first change, readOnly suppression → Tasks 5, 10, 12.
- **Not in this plan (owned elsewhere):** `blocks.json`, the `0.7.0` version bump and README release note (Plan 2 / release), the admin side of the protocol (Plan 4).
- **Type consistency checked:** `DocMap`, `docFor`, `withDoc`, `withoutDoc`, `collectIssues`, `toPageSet`, `isLockedOn`, `insertableBlocks`, `blockMenu`, `ROOT_ZONE`, `buildEditorConfig`, `startBuilderSession`, `createBridge`/`getActiveBridge`/`setActiveBridge`, `createFixtureInterceptor`, `enterFixtureMode`, `applyPreviewAs`, `fixtureLocation`, `useNavigationLock` are spelled identically in every task that uses them.
