# Storefront design language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the new storefront (`web/`) the old ecommerce-menu look by default — Inter typography with an Inter "mono voice", gradient chassis with glass chrome, sharp corners, entrance/sheet/press motion, the old button/input vocabulary, and an image-less catalog that renders as a dense list.

**Architecture:** A shared design layer added to the existing Mantine 9 app: three new global stylesheets (`chassis.css`, `motion.css`, `mantine.css`), new defaults in `theme-bridge.ts` (fonts, radius `none`, Mantine `components` overrides), a tiny `lib/motion.ts` helper, and per-feature one-line class additions. Nothing structural moves; the 55 CSS modules keep consuming the same `--sf-*` tokens.

**Tech Stack:** React 19, Vite 7, Mantine 9.5 (`Button.extend` / `Drawer.extend` theme components), CSS modules, `@fontsource-variable/inter` 5.x, vitest 4 + Testing Library, react-router 7.

**Spec:** `docs/superpowers/specs/2026-08-27-storefront-design-language-design.md`

## Global Constraints

- All paths below are relative to `T:\Projects\ecommerce\ecommerce-storefront\web` unless prefixed with `../` (repo root). Run `npm` commands from `web/`.
- Imports use the `@/` alias with explicit `.ts`/`.tsx` extensions (e.g. `from '@/lib/motion.ts'`). Never relative `../../`.
- Typeface stack, verbatim: `"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
- Mono voice rule: `--sf-font-mono` (and Mantine `fontFamilyMonospace`) = the **body** face unless `theme.fonts.mono` is set, in which case `"<name>", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.
- Radius scale: `'none' | 'sm' | 'md' | 'lg' | 'xl'`; `none` → Mantine `defaultRadius: 0`.
- Motion values, verbatim from the spec: row enter `0.4s cubic-bezier(0.2, 0.8, 0.2, 1)` with delay `min(index, 14) × 25ms`; fade `0.3s ease`; stagger `min(index, 4) × 60ms`; sheet slide `300ms cubic-bezier(0.22, 1, 0.36, 1)`; modal pop `200ms cubic-bezier(0.2, 0.8, 0.2, 1)`; button press `scale(0.98)`, icon button `scale(0.97)`, transitions `150ms ease`.
- Gradient body, verbatim: `radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in srgb, var(--sf-surface-3) 35%, transparent), transparent 65%), radial-gradient(ellipse 60% 40% at 50% 100%, color-mix(in srgb, var(--sf-bg-deep) 50%, transparent), transparent 70%)` with `background-attachment: fixed`.
- Glass chrome: `background: color-mix(in srgb, var(--sf-bg) 85%, transparent); backdrop-filter: blur(12px)` (+ `-webkit-` prefix) + `transform: translateZ(0)`; soft variant 80 % / `blur(8px)`.
- `prefers-reduced-motion: reduce` must neutralise every new animation; `.anim-fade-stagger` must become `animation: none` (not merely shortened).
- Every task ends with `npm test` (vitest, all files green) and `npm run typecheck` passing. Task 8 additionally runs `npm run build`.
- Commit trailers on every commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_017mSv2DDn5QZPBHwUF4bkKc`.
- Work directly on `main` (user decision). Do not push; do not tag. Task 8 stops before the release step and reports.
- The repo's frontend-design conventions apply: no drop shadows on cards, hairline borders, tracked micro-caps eyebrows, tabular figures on digits.

---

### Task 1: Inter, self-hosted, as the default face; Inter mono voice

**Files:**
- Modify: `package.json` (dependency)
- Modify: `src/main.tsx:1-3`
- Modify: `src/app/theme-bridge.ts:6-10,20-36,39-63`
- Modify: `src/styles/global.css:1-3`
- Test: `test/theme-bridge.test.ts`

**Interfaces:**
- Produces: `theme-bridge.ts` exports unchanged in name (`buildMantineTheme`, `cssVariablesFor`, `googleFontsHref`, `applyDocumentTheme`, `mix`, `THEME_STORAGE_KEY`); new exported constant `INTER: string` (the stack above) and `fontStacks(fonts: Theme['fonts']): { body: string; heading: string; mono: string }` used by both builders. Task 2 edits the same file (radius); Task 4 adds a `components` block to `buildMantineTheme`.

- [ ] **Step 1: Install the font package**

Run: `npm install @fontsource-variable/inter@^5.3.0`
Expected: `package.json` gains `"@fontsource-variable/inter": "^5.3.0"` under `dependencies`; `node_modules/@fontsource-variable/inter/index.css` exists and `ls node_modules/@fontsource-variable/inter/files | grep wght-normal` lists one `inter-<subset>-wght-normal.woff2` per subset (latin, latin-ext, cyrillic, greek, vietnamese).

- [ ] **Step 2: Write the failing tests**

Append to `test/theme-bridge.test.ts` (keep the existing three tests; note the existing first test asserts `t.fontFamily` contains `'Inter'` — still true):

```ts
import { fontStacks, INTER } from '@/app/theme-bridge.ts';

describe('font defaults', () => {
  const none = { heading: null, body: null, mono: null };

  it('falls back to the self-hosted Inter stack for body and heading', () => {
    const s = fontStacks(none);
    expect(s.body).toBe(INTER);
    expect(s.heading).toBe(INTER);
    expect(INTER.startsWith('"Inter Variable", Inter,')).toBe(true);
  });

  it('uses the body face as the mono voice unless a mono font is configured', () => {
    expect(fontStacks(none).mono).toBe(INTER);
    expect(fontStacks({ heading: null, body: 'Space Grotesk', mono: null }).mono).toBe(`"Space Grotesk", ${INTER}`);
    expect(fontStacks({ heading: null, body: null, mono: 'JetBrains Mono' }).mono).toBe('"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace');
  });

  it('feeds the same stacks to Mantine and the --sf-font-* variables', () => {
    const t = buildMantineTheme({ ...theme, fonts: none });
    const v = cssVariablesFor({ ...theme, fonts: none }, brand);
    expect(t.fontFamily).toBe(INTER);
    expect(t.fontFamilyMonospace).toBe(INTER);
    expect(t.headings?.fontFamily).toBe(INTER);
    expect(v['--sf-font-body']).toBe(INTER);
    expect(v['--sf-font-heading']).toBe(INTER);
    expect(v['--sf-font-mono']).toBe(INTER);
  });
});
```

Put the new `import` line next to the existing import at the top of the file (ES imports must precede code).

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/theme-bridge.test.ts`
Expected: FAIL — `fontStacks`/`INTER` are not exported (`SyntaxError`/`undefined is not a function`).

- [ ] **Step 4: Implement the font defaults**

`src/app/theme-bridge.ts` — replace lines 6-10 (`SYSTEM_SANS`, `SYSTEM_MONO`, `THEME_STORAGE_KEY`, `family`) with:

```ts
/** The storefront's own face, self-hosted via @fontsource-variable/inter (imported in main.tsx). */
export const INTER = '"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SYSTEM_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export const THEME_STORAGE_KEY = 'sf-theme-v1';

function family(name: string | null, fallback: string): string { return name ? `"${name}", ${fallback}` : fallback; }

/** Body, heading and "mono voice" stacks. The mono voice is the body face with
 *  tabular figures (the ecommerce-menu idiom) unless the store picks a real mono font. */
export function fontStacks(fonts: Theme['fonts']): { body: string; heading: string; mono: string } {
  const body = family(fonts.body, INTER);
  return {
    body,
    heading: family(fonts.heading ?? fonts.body, INTER),
    mono: fonts.mono ? family(fonts.mono, SYSTEM_MONO) : body,
  };
}
```

In `buildMantineTheme`, replace the three font lines with:
```ts
    fontFamily: fontStacks(theme.fonts).body,
    fontFamilyMonospace: fontStacks(theme.fonts).mono,
    headings: { fontFamily: fontStacks(theme.fonts).heading, fontWeight: '600' },
```

In `cssVariablesFor`, replace the three `--sf-font-*` lines with:
```ts
    '--sf-font-heading': fontStacks(theme.fonts).heading,
    '--sf-font-body': fontStacks(theme.fonts).body,
    '--sf-font-mono': fontStacks(theme.fonts).mono,
```

`src/main.tsx` — insert as the **first** line: `import '@fontsource-variable/inter/index.css';` (before the Mantine CSS imports; order: fontsource, mantine core, notifications, global).

`src/styles/global.css` line 1 — inside the `:root { … }` block replace the three font fallbacks:
```
--sf-font-heading:"Inter Variable",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; --sf-font-body:"Inter Variable",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; --sf-font-mono:"Inter Variable",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
```
and extend line 3 (`body { font-family: var(--sf-font-body); }`) to:
```css
html, body { font-feature-settings: 'cv11', 'ss01', 'ss03'; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
body { font-family: var(--sf-font-body); }
```

- [ ] **Step 5: Run the tests, typecheck, and check the font ships**

Run: `npx vitest run && npm run typecheck && npx vite build && ls -l dist/assets | grep -i "wght-normal"`
Expected: all tests pass; typecheck exits 0; `dist/assets` contains the `inter-*-wght-normal-*.woff2` files. Vite copies every subset the CSS references (latin, latin-ext, cyrillic, greek, vietnamese) — browsers download only the subsets a page needs (`unicode-range`), so the size budget applies to `latin` + `latin-ext` only: their two files together must be ≤ 130 KB. Report all file sizes in the task report.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/main.tsx src/app/theme-bridge.ts src/styles/global.css test/theme-bridge.test.ts
git commit -m "feat(web): self-hosted Inter as the default face; mono voice = body face

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017mSv2DDn5QZPBHwUF4bkKc"
```

---

### Task 2: Radius `none` in the web app; sheet keeps its rounded lip

**Files:**
- Modify: `src/types/settings.ts:22`
- Modify: `src/app/theme-bridge.ts` (`defaultRadius` line in `buildMantineTheme`)
- Modify: `src/components/Sheet.module.css:4-10,39-47`
- Test: `test/theme-bridge.test.ts`

**Interfaces:**
- Consumes: `buildMantineTheme` from Task 1.
- Produces: `Theme['radius']` union including `'none'`; Mantine `defaultRadius` is `0` (number) for `none`, else the string passthrough. Every `var(--mantine-radius-default)` in the CSS modules then resolves to `0rem`.

- [ ] **Step 1: Write the failing test**

Append to `test/theme-bridge.test.ts` inside the existing `describe('theme bridge')`:

```ts
  it('maps radius none to 0 and passes the named sizes through', () => {
    expect(buildMantineTheme({ ...theme, radius: 'none' }).defaultRadius).toBe(0);
    expect(buildMantineTheme({ ...theme, radius: 'md' }).defaultRadius).toBe('md');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/theme-bridge.test.ts`
Expected: FAIL — TypeScript/vitest reports `'none'` not assignable (or the assertion gets `'none'` instead of `0`).

- [ ] **Step 3: Implement**

`src/types/settings.ts` line 22 — replace `  radius: 'sm' | 'md' | 'lg' | 'xl';` with `  radius: 'none' | 'sm' | 'md' | 'lg' | 'xl';`.

`src/app/theme-bridge.ts` in `buildMantineTheme` — replace `    defaultRadius: theme.radius,` with `    defaultRadius: theme.radius === 'none' ? 0 : theme.radius,`.

`src/components/Sheet.module.css` — the bottom sheet keeps a real lip whatever the token says. Replace the `.content` `border-radius` line (line 9) with:
```css
  border-radius: 16px 16px 0 0; /* the lip stays whatever the store's radius token is */
```
(the `@media (min-width: 62em)` block already sets `border-radius: 0` for the side panel — leave it).

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/types/settings.ts src/app/theme-bridge.ts src/components/Sheet.module.css test/theme-bridge.test.ts
git commit -m "feat(web): radius 'none' — sharp corners everywhere but the sheet lip

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017mSv2DDn5QZPBHwUF4bkKc"
```

---

### Task 3: Chassis — gradient ground, glass chrome, selection, scrollbar

**Files:**
- Create: `src/styles/chassis.css`
- Modify: `src/main.tsx` (import)
- Modify: `src/layouts/StorefrontShell.module.css:4-24`
- Modify: `src/layouts/MenuShell.module.css:4-25`
- Modify: `src/layouts/Chromeless.module.css:3-8`
- Modify: `src/components/ContactLinks.module.css:49-55,66-70`
- Modify: `src/features/cart/MobileCartBar.module.css:4-12`
- Modify: `src/components/Sheet.module.css:32-37`
- Modify: `src/features/checkout/CheckoutPage.module.css:234-240`
- Test: `test/chassis.test.ts` (create)

**Interfaces:**
- Produces: global stylesheet `src/styles/chassis.css` (body gradient, `#root` stacking, selection, scrollbar, `.hr`/`.hr-strong` utilities). Ruling: the spec's `.glass`/`.glass-soft` utility classes are realised as declarations inside the affected CSS modules (no TSX edits needed); the utilities are still defined in `chassis.css` for future use.

- [ ] **Step 1: Write the failing test**

Create `test/chassis.test.ts` — a source-text guard (CSS is not executed in jsdom, so assert the declarations exist):

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/chassis.css', import.meta.url), 'utf8');
const shells = ['StorefrontShell', 'MenuShell', 'Chromeless'].map((n) =>
  readFileSync(new URL(`../src/layouts/${n}.module.css`, import.meta.url), 'utf8'),
);

describe('chassis.css', () => {
  it('paints the two-layer gradient ground, fixed', () => {
    expect(css).toMatch(/radial-gradient\(ellipse 80% 60% at 50% 0%, color-mix\(in srgb, var\(--sf-surface-3\) 35%, transparent\), transparent 65%\)/);
    expect(css).toMatch(/radial-gradient\(ellipse 60% 40% at 50% 100%, color-mix\(in srgb, var\(--sf-bg-deep\) 50%, transparent\), transparent 70%\)/);
    expect(css).toContain('background-attachment: fixed');
  });
  it('defines the glass utilities and hairlines', () => {
    expect(css).toMatch(/\.glass\s*\{[^}]*color-mix\(in srgb, var\(--sf-bg\) 85%, transparent\)[^}]*backdrop-filter: blur\(12px\)/s);
    expect(css).toMatch(/\.glass-soft\s*\{[^}]*80%[^}]*blur\(8px\)/s);
    expect(css).toMatch(/\.hr\s*\{ height: 1px; background: var\(--sf-line\); \}/);
  });
  it('lets the gradient show through every shell', () => {
    for (const shell of shells) expect(shell).not.toMatch(/\.shell\s*\{[^}]*background: var\(--sf-bg\);/s);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/chassis.test.ts`
Expected: FAIL — `ENOENT` for `chassis.css`.

- [ ] **Step 3: Create `src/styles/chassis.css`**

```css
/* Chassis — the ground every page sits on. Two radial layers built from the
   palette tokens so the admin's colours still drive it: a glow at the top, a
   vignette at the foot. Fixed so it does not scroll with long lists. */
body {
  min-height: 100dvh;
  background-color: var(--sf-bg);
  background-image:
    radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in srgb, var(--sf-surface-3) 35%, transparent), transparent 65%),
    radial-gradient(ellipse 60% 40% at 50% 100%, color-mix(in srgb, var(--sf-bg-deep) 50%, transparent), transparent 70%);
  background-attachment: fixed;
}

#root { position: relative; z-index: 1; }

::selection { background: var(--sf-primary); color: var(--sf-bg); }

* { scrollbar-width: thin; scrollbar-color: var(--sf-line-strong) transparent; }
*::-webkit-scrollbar { width: 4px; height: 4px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background: var(--sf-line-strong); border-radius: 2px; }

/* Glass chrome for sticky bars and pinned feet. `translateZ(0)` forces iOS
   Safari to repaint a sticky + backdrop-filter element during momentum scroll. */
.glass {
  background: color-mix(in srgb, var(--sf-bg) 85%, transparent);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  transform: translateZ(0);
}
.glass-soft {
  background: color-mix(in srgb, var(--sf-bg) 80%, transparent);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}

/* True 1px rules — crisper than a border on retina. */
.hr { height: 1px; background: var(--sf-line); }
.hr-strong { height: 1px; background: var(--sf-line-strong); }
```

`src/main.tsx` — after `import '@/styles/global.css';` add `import '@/styles/chassis.css';`.

- [ ] **Step 4: Let the gradient through and glaze the chrome**

`src/layouts/StorefrontShell.module.css` — in `.shell` (line 15) replace `  background: var(--sf-bg);` with `  background: transparent;`. In `.header` (line 21) replace `  background: var(--sf-bg-deep);` with:
```css
  background: color-mix(in srgb, var(--sf-bg) 85%, transparent);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  transform: translateZ(0);
```

`src/layouts/MenuShell.module.css` — same two edits: `.shell` background → `transparent` (line 16); `.bar` background (line 22) → the four glass lines above.

`src/layouts/Chromeless.module.css` — `.shell` background (line 7) → `transparent`.

`src/components/ContactLinks.module.css` — `.stripBar` background (line 53) → the four glass lines; `.strip .link` background (line 68) → `transparent` (the strip's own `background: var(--sf-line)` grid gap remains the hairline between the two targets).

`src/features/cart/MobileCartBar.module.css` — `.bar` background (line 9) → the four glass lines.

`src/components/Sheet.module.css` — `.footer` background (line 35) → :
```css
  background: color-mix(in srgb, var(--sf-bg-deep) 80%, transparent);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
```

`src/features/checkout/CheckoutPage.module.css` — `.nav` (line 234): add after `z-index: 5;`:
```css
  background: color-mix(in srgb, var(--sf-bg) 80%, transparent);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  padding-top: 0.6rem;
  margin-inline: calc(-1 * var(--sf-main-pad, 1rem));
  padding-inline: var(--sf-main-pad, 1rem);
```
(the negative inline margin lets the glazed band run to the shell's edge like the old sheet foot; if `.nav` already sets `margin`/`padding` that conflict, keep the existing values and only add the background/filter lines — note it in the report).

- [ ] **Step 5: Run tests, typecheck, and look**

Run: `npx vitest run && npm run typecheck`
Expected: green. Then run the local stack per `../README.md` "Local development" — backend `cd T:\Projects\ecommerce\ecommerce-backend && npm run dev` (:3000; usually already running), worker `cd .. && npm run dev` (:8787), SPA `npm run dev:web` from the repo root (:5173) — open `http://localhost:5173` and confirm at 1280 px: the body shows a lighter glow at the top centre and a darker foot; scrolling the catalog keeps the gradient still; the header is translucent over content. Take a screenshot to `../.playwright-mcp/` or describe what you saw in the report.

- [ ] **Step 6: Commit**

```bash
git add src/styles/chassis.css src/main.tsx src/layouts/StorefrontShell.module.css src/layouts/MenuShell.module.css src/layouts/Chromeless.module.css src/components/ContactLinks.module.css src/features/cart/MobileCartBar.module.css src/components/Sheet.module.css src/features/checkout/CheckoutPage.module.css test/chassis.test.ts
git commit -m "feat(web): gradient ground and glass chrome

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017mSv2DDn5QZPBHwUF4bkKc"
```

---

### Task 4: Motion — keyframes, utilities, helper, Mantine transitions

**Files:**
- Create: `src/styles/motion.css`
- Create: `src/lib/motion.ts`
- Modify: `src/main.tsx` (import)
- Modify: `src/app/theme-bridge.ts` (`components` block in `buildMantineTheme`; imports)
- Modify: `src/components/Sheet.tsx:47`
- Test: `test/motion.test.ts` (create), `test/theme-bridge.test.ts`

**Interfaces:**
- Produces:
  - CSS classes `anim-row`, `anim-fade`, `anim-fade-stagger`, `anim-scale`, `ping` (global, in `motion.css`).
  - `src/lib/motion.ts`:
    ```ts
    export function rowAnim(index: number): { className: string; style: CSSProperties }
    export function staggerAnim(index: number): { className: string; style: CSSProperties }
    export const FADE = 'anim-fade';
    ```
    `rowAnim(i)` → `{ className: 'anim-row', style: { '--i': i } }`; `staggerAnim(i)` → `{ className: 'anim-fade-stagger', style: { '--stagger': `${Math.min(i, 4) * 60}ms` } }`. Task 7 spreads these onto elements.
  - `buildMantineTheme(...).components` with `Drawer`, `Modal`, `Button`, `ActionIcon`, `Input` entries (Task 5 supplies the CSS for the last three).

- [ ] **Step 1: Write the failing tests**

Create `test/motion.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FADE, rowAnim, staggerAnim } from '@/lib/motion.ts';

const css = readFileSync(new URL('../src/styles/motion.css', import.meta.url), 'utf8');

describe('motion.css', () => {
  it('defines the four keyframes', () => {
    for (const name of ['sf-row-enter', 'sf-fade-in', 'sf-scale-in', 'sf-ping']) expect(css).toContain(`@keyframes ${name}`);
  });
  it('uses the ecommerce-menu timings', () => {
    expect(css).toMatch(/\.anim-row\s*\{[^}]*sf-row-enter 0\.4s cubic-bezier\(0\.2, 0\.8, 0\.2, 1\) backwards[^}]*calc\(min\(var\(--i, 0\), 14\) \* 25ms\)/s);
    expect(css).toMatch(/\.anim-fade\s*\{[^}]*sf-fade-in 0\.3s ease backwards/s);
  });
  it('neutralises everything under reduced motion and removes the stagger outright', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/\.anim-fade-stagger\s*\{\s*animation: none;/);
    expect(reduced).toMatch(/\.ping\s*\{\s*display: none;/);
    expect(reduced).toMatch(/\.anim-row, \.anim-fade, \.anim-scale\s*\{[^}]*animation-duration: 0\.01ms/s);
  });
});

describe('motion helpers', () => {
  it('rowAnim sets the class and the index variable', () => {
    expect(rowAnim(3)).toEqual({ className: 'anim-row', style: { '--i': 3 } });
  });
  it('staggerAnim caps the delay at the fifth item', () => {
    expect(staggerAnim(0).style).toEqual({ '--stagger': '0ms' });
    expect(staggerAnim(2).style).toEqual({ '--stagger': '120ms' });
    expect(staggerAnim(9).style).toEqual({ '--stagger': '240ms' });
    expect(staggerAnim(9).className).toBe('anim-fade-stagger');
    expect(FADE).toBe('anim-fade');
  });
});
```

Append to `test/theme-bridge.test.ts` inside `describe('theme bridge')`:

```ts
  it('slows Mantine sheets and modals to the shop timings', () => {
    const c = buildMantineTheme(theme).components as Record<string, { defaultProps?: Record<string, unknown> }>;
    expect(c.Drawer?.defaultProps?.transitionProps).toEqual({ duration: 300, timingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    expect(c.Drawer?.defaultProps?.overlayProps).toEqual({ backgroundOpacity: 0.7, blur: 2 });
    expect(c.Modal?.defaultProps?.transitionProps).toEqual({ transition: 'pop', duration: 200, timingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    expect(c.Button).toBeDefined();
    expect(c.ActionIcon).toBeDefined();
    expect(c.Input).toBeDefined();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/motion.test.ts test/theme-bridge.test.ts`
Expected: FAIL — `motion.css`/`motion.ts` missing; `components` undefined.

- [ ] **Step 3: Create `src/styles/motion.css`**

```css
/* Motion — the ecommerce-menu vocabulary, verbatim. Rows rise 6px on a snappy
   curve with a per-index delay; sections fade; the "you are here" node pings. */
@keyframes sf-row-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes sf-fade-in   { from { opacity: 0; } to { opacity: 1; } }
@keyframes sf-scale-in  { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: none; } }
@keyframes sf-ping      { 75%, 100% { transform: scale(2); opacity: 0; } }

.anim-row { animation: sf-row-enter 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) backwards; animation-delay: calc(min(var(--i, 0), 14) * 25ms); }
.anim-fade { animation: sf-fade-in 0.3s ease backwards; }
.anim-fade-stagger { animation: sf-fade-in 0.3s ease backwards; animation-delay: var(--stagger, 0ms); }
.anim-scale { animation: sf-scale-in 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) backwards; }
.ping { position: absolute; inset: 0; border: 1px solid var(--sf-primary); animation: sf-ping 1s cubic-bezier(0, 0, 0.2, 1) infinite; }

@media (prefers-reduced-motion: reduce) {
  .anim-row, .anim-fade, .anim-scale { animation-duration: 0.01ms; animation-delay: 0ms; }
  .anim-fade-stagger { animation: none; } /* a delayed reveal would hide content for the stagger length */
  .ping { display: none; }
}
```

`src/main.tsx` — after the chassis import add `import '@/styles/motion.css';`.

- [ ] **Step 4: Create `src/lib/motion.ts`**

```ts
import type { CSSProperties } from 'react';

/** Class + inline var for a list row: `min(index, 14) × 25ms` delay, handled in CSS. */
export function rowAnim(index: number): { className: string; style: CSSProperties } {
  return { className: 'anim-row', style: { '--i': index } as CSSProperties };
}

/** Class + inline var for cards arriving in sequence: `min(index, 4) × 60ms`. */
export function staggerAnim(index: number): { className: string; style: CSSProperties } {
  return { className: 'anim-fade-stagger', style: { '--stagger': `${Math.min(index, 4) * 60}ms` } as CSSProperties };
}

/** Plain section fade. */
export const FADE = 'anim-fade';
```

- [ ] **Step 5: Add the Mantine `components` block**

`src/app/theme-bridge.ts` — change the first import to `import { ActionIcon, Button, Drawer, Input, Modal, createTheme, type MantineThemeOverride } from '@mantine/core';` and add to the `createTheme({ … })` object in `buildMantineTheme`, after `other: { density: theme.density },`:

```ts
    components: {
      Drawer: Drawer.extend({
        defaultProps: {
          transitionProps: { duration: 300, timingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' },
          overlayProps: { backgroundOpacity: 0.7, blur: 2 },
        },
      }),
      Modal: Modal.extend({
        defaultProps: {
          transitionProps: { transition: 'pop', duration: 200, timingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
          overlayProps: { backgroundOpacity: 0.7, blur: 2 },
        },
      }),
      Button: Button.extend({ classNames: { root: 'sf-button' } }),
      ActionIcon: ActionIcon.extend({ classNames: { root: 'sf-icon-button' } }),
      Input: Input.extend({ classNames: { input: 'sf-input' } }),
    },
```

`src/components/Sheet.tsx` line 47 — replace `<Drawer.Overlay backgroundOpacity={0.62} blur={2} />` with `<Drawer.Overlay />` (the theme default now applies). Note: `Drawer.Root` does not read `defaultProps.transitionProps` from the theme for compound usage in every Mantine version — verify in the browser (Step 6); if the sheet still animates at the stock 200 ms, pass `transitionProps={{ duration: 300, timingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}` explicitly on `Drawer.Root` and say so in the report.

- [ ] **Step 6: Run tests, typecheck, and check the sheet timing**

Run: `npx vitest run && npm run typecheck`
Expected: green. With the local stack running (see Task 3 Step 5), open the cart drawer (or any sheet) and watch: it should take ~0.3 s with a soft overshoot-free settle, overlay slightly darker than before.

- [ ] **Step 7: Commit**

```bash
git add src/styles/motion.css src/lib/motion.ts src/main.tsx src/app/theme-bridge.ts src/components/Sheet.tsx test/motion.test.ts test/theme-bridge.test.ts
git commit -m "feat(web): motion vocabulary — row/fade keyframes, helper, Mantine sheet timings

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017mSv2DDn5QZPBHwUF4bkKc"
```

---

### Task 5: Component vocabulary — buttons, inputs, cards

**Files:**
- Create: `src/styles/mantine.css`
- Modify: `src/main.tsx` (import)
- Modify: `src/features/checkout/Fields.module.css:30-56`
- Modify: `src/features/order-status/OrderStatus.module.css:248-256`
- Modify: `src/features/tracking/Tracking.module.css:511-518`
- Modify: `src/features/auth/AuthCard.module.css:4-9`
- Modify: `src/features/catalog/ProductGrid.module.css:11-19` (`.hero`)
- Test: `test/vocabulary.test.ts` (create)

**Interfaces:**
- Consumes: the `sf-button`, `sf-icon-button`, `sf-input` class hooks registered in Task 4.
- Produces: global rules for those classes; card recipe `border: 1px solid var(--sf-line); background: color-mix(in srgb, var(--sf-surface) 40%, transparent); box-shadow: none`.

- [ ] **Step 1: Write the failing test**

Create `test/vocabulary.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../src/styles/mantine.css');

describe('mantine.css', () => {
  it('gives buttons the mono voice and press feedback', () => {
    expect(css).toMatch(/\.sf-button\s*\{[^}]*font-family: var\(--sf-font-mono\)[^}]*text-transform: uppercase[^}]*letter-spacing: 0\.2em/s);
    expect(css).toMatch(/\.sf-button:active:not\(\[data-disabled\]\)\s*\{\s*transform: scale\(0\.98\);/);
    expect(css).toMatch(/\.sf-icon-button:active:not\(\[data-disabled\]\)\s*\{\s*transform: scale\(0\.97\);/);
    expect(css).toMatch(/\.sf-button\[data-variant="filled"\]\s*\{[^}]*--button-bg: var\(--sf-primary\)[^}]*--button-color: var\(--sf-bg\)[^}]*--button-hover: var\(--sf-primary-soft\)/s);
  });
  it('underlines inputs', () => {
    expect(css).toMatch(/\.sf-input\s*\{[^}]*border-bottom: 1px solid var\(--sf-line-strong\)[^}]*border-radius: 0/s);
    expect(css).toMatch(/textarea\.sf-input\s*\{[^}]*border: 1px solid var\(--sf-line-strong\)/s);
  });
});

describe('cards', () => {
  it.each([
    ['../src/features/order-status/OrderStatus.module.css'],
    ['../src/features/tracking/Tracking.module.css'],
    ['../src/features/auth/AuthCard.module.css'],
  ])('%s uses the hairline + 40%% surface recipe with no shadow', (file) => {
    const block = read(file).match(/\.card\s*\{[^}]*\}/s)?.[0] ?? '';
    expect(block).toContain('background: color-mix(in srgb, var(--sf-surface) 40%, transparent)');
    expect(block).not.toMatch(/box-shadow: (?!none)/);
  });
  it('checkout fields are underlined', () => {
    const block = read('../src/features/checkout/Fields.module.css').match(/\.input\s*\{[^}]*\}/s)?.[0] ?? '';
    expect(block).toContain('border-bottom: 1px solid var(--sf-line-strong)');
    expect(block).toContain('background: transparent');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/vocabulary.test.ts`
Expected: FAIL — `mantine.css` missing.

- [ ] **Step 3: Create `src/styles/mantine.css`**

Mantine's Button paints from CSS variables (`--button-bg`, `--button-hover`, `--button-color`, `--button-bd`, `--button-fz`, `--button-radius`) on the root, and stamps `data-variant` / `data-size` / `data-disabled` attributes — override the variables, not the properties, so Mantine's own hover/loading states keep working.

```css
/* Mantine component vocabulary — hooks registered in theme-bridge.ts via
   `classNames`. Buttons speak in tracked micro-caps; inputs are underlines. */
.sf-button {
  font-family: var(--sf-font-mono);
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.2em;
  --button-fz: 12px;
  transition: transform 150ms ease, background-color 150ms ease, border-color 150ms ease, color 150ms ease;
}
.sf-button[data-size="xs"], .sf-button[data-size="sm"], .sf-button[data-size="compact-xs"], .sf-button[data-size="compact-sm"] { --button-fz: 11px; letter-spacing: 0.18em; }
.sf-button[data-size="lg"], .sf-button[data-size="xl"] { --button-fz: 13px; letter-spacing: 0.22em; }
.sf-button:active:not([data-disabled]) { transform: scale(0.98); }
.sf-button[data-variant="filled"] { --button-bg: var(--sf-primary); --button-color: var(--sf-bg); --button-hover: var(--sf-primary-soft); --button-hover-color: var(--sf-bg); }
.sf-button[data-variant="default"] { --button-bg: transparent; --button-bd: 1px solid var(--sf-line-strong); --button-color: var(--sf-text); --button-hover: var(--sf-surface); }
.sf-button[data-variant="default"]:hover:not([data-disabled]) { --button-bd: 1px solid var(--sf-primary); }
.sf-button[data-variant="subtle"] { --button-bg: transparent; --button-color: var(--sf-muted); --button-hover: var(--sf-surface); --button-hover-color: var(--sf-text); }
.sf-button:focus-visible { outline: 1px solid var(--sf-primary); outline-offset: 2px; }

.sf-icon-button { transition: transform 150ms ease, background-color 150ms ease, border-color 150ms ease; }
.sf-icon-button:active:not([data-disabled]) { transform: scale(0.97); }

.sf-input {
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--sf-line-strong);
  border-radius: 0;
  padding-left: 0;
  padding-right: 0;
  font-family: var(--sf-font-mono);
  font-variant-numeric: tabular-nums;
  transition: border-color 150ms ease;
}
.sf-input:focus, .sf-input:focus-within { border-bottom-color: var(--sf-primary); outline: none; }
.sf-input[data-error] { border-bottom-color: var(--sf-danger); }
textarea.sf-input { border: 1px solid var(--sf-line-strong); padding: 0.75rem; }
```

`src/main.tsx` — after the motion import add `import '@/styles/mantine.css';`.

- [ ] **Step 4: Underline the checkout fields and converge the cards**

`src/features/checkout/Fields.module.css` — replace the `.input` block (lines 30-42) with:
```css
.input {
  width: 100%;
  min-height: 44px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--sf-line-strong);
  border-radius: 0;
  background: transparent;
  color: var(--sf-text);
  font-family: var(--sf-font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 16px; /* iOS zoom guard — the global rule, restated for the box */
  line-height: 1.4;
  transition: border-color 150ms ease;
}
```
and replace the `.input:focus` block (lines 48-52) with:
```css
.input:focus {
  outline: none;
  border-bottom-color: var(--sf-primary);
}
```
Leave `.input[aria-invalid='true']` as is (it sets `border-color`, which now only affects the bottom edge). In the `.textarea` block that follows, add `border: 1px solid var(--sf-line-strong); padding: 0.6rem 0.75rem;` so text areas stay boxed (keep its existing `min-height`).

`src/features/order-status/OrderStatus.module.css` `.card` (lines 248-256) — replace `  border: 1px solid var(--sf-line-strong);` with `  border: 1px solid var(--sf-line);` and `  background: var(--sf-bg-deep);` with `  background: color-mix(in srgb, var(--sf-surface) 40%, transparent);`.

`src/features/tracking/Tracking.module.css` `.card` (lines 511-518) — add `  background: color-mix(in srgb, var(--sf-surface) 40%, transparent);` after the `border-left` line (keep the 2 px tone spine).

`src/features/auth/AuthCard.module.css` `.card` (lines 4-9) — `border` → `1px solid var(--sf-line)`, `background` → `color-mix(in srgb, var(--sf-surface) 40%, transparent)`.

`src/features/catalog/ProductGrid.module.css` `.hero` (lines 11-19) — `background: var(--sf-surface);` → `background: color-mix(in srgb, var(--sf-surface) 40%, transparent);`.

- [ ] **Step 5: Run tests, typecheck, and look**

Run: `npx vitest run && npm run typecheck`
Expected: green. In the browser: a Mantine `Button` (e.g. "Try again" on an empty state, or checkout "Continue") reads as uppercase tracked caps and shrinks slightly on press; checkout text fields are underlines that light up on focus; order-status cards are translucent hairline panels.

- [ ] **Step 6: Commit**

```bash
git add src/styles/mantine.css src/main.tsx src/features/checkout/Fields.module.css src/features/order-status/OrderStatus.module.css src/features/tracking/Tracking.module.css src/features/auth/AuthCard.module.css src/features/catalog/ProductGrid.module.css test/vocabulary.test.ts
git commit -m "feat(web): button, input and card vocabulary from ecommerce-menu

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017mSv2DDn5QZPBHwUF4bkKc"
```

---

### Task 6: Catalog without images — no wells, list fallback

**Files:**
- Modify: `src/features/catalog/ProductCard.tsx`
- Modify: `src/features/catalog/ProductGrid.tsx`
- Modify: `src/features/catalog/ProductGrid.module.css` (add `.rows`)
- Test: `test/product-card.test.tsx` (create), `test/product-grid.test.tsx` (create)

**Interfaces:**
- Consumes: `ProductRow` (`{ product, onSelect(product) }`) from `@/features/catalog/ProductRow.tsx`; `rowAnim` from Task 4.
- Produces: `ProductCardProps` gains `hasSiblingImages?: boolean` (default `true`) and `index?: number` (default `0`, for `rowAnim`). `ProductGrid` renders `<ul className={classes.rows}>` of `ProductRow` when every visible product has `imageProductId === null`.

- [ ] **Step 1: Write the failing tests**

Create `test/product-card.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { Product } from '@/types/catalog.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ currency: 'GBP', features: { ordering: true } }) as unknown as StorefrontSettings,
}));

import { ProductCard } from '@/features/catalog/ProductCard.tsx';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 1, sku: 'SKU-1', name: 'Product', displayName: 'Product', shortDisplayName: null, description: null,
    categoryId: 1, categoryName: 'Peptides', sortOrder: 0, price: 29, inStock: true, lowStockAlert: false,
    isActive: true, isPreorder: false, preorderEta: null, pricingTiers: [], upsellProductIds: [],
    excludedFromFreeShipping: false, imageProductId: null, provenance: null, ...overrides,
  };
}

function mount(p: Product, props: { hasSiblingImages?: boolean; index?: number } = {}) {
  return render(
    <MantineProvider env="test">
      <MemoryRouter>
        <ProductCard product={p} {...props} />
      </MemoryRouter>
    </MantineProvider>,
  );
}

afterEach(() => cleanup());

describe('ProductCard', () => {
  it('renders the photo well when the product has an image', () => {
    mount(product({ imageProductId: 1 }));
    expect(screen.getByRole('img', { name: 'Product' })).toBeInTheDocument();
  });

  it('renders no well at all for an image-less product in an image-less set', () => {
    const { container } = mount(product({ imageProductId: null }), { hasSiblingImages: false });
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[class*="well"]')).toBeNull();
  });

  it('keeps the empty rule-well when siblings have images, without fetching', () => {
    const { container } = mount(product({ imageProductId: null }), { hasSiblingImages: true });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[class*="well"]')).not.toBeNull();
  });

  it('animates in as a row with its index', () => {
    const { container } = mount(product(), { index: 3 });
    const card = container.querySelector('article')!;
    expect(card.className).toContain('anim-row');
    expect(card.style.getPropertyValue('--i')).toBe('3');
  });
});
```

Create `test/product-grid.test.tsx` (mirrors `test/product-list.test.tsx`'s fixtures and mocks — copy its `product()`, `category()`, `CATALOG`, `Shell` and the two `vi.mock` calls verbatim, then):

```tsx
import { ProductGrid } from '@/features/catalog/ProductGrid.tsx';

function mount(catalog: Catalog) {
  state.catalog = catalog;
  state.settings = {
    currency: 'GBP', welcomeMessage: null,
    brand: { name: 'Shop', title: 'Shop', tagline: '', links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: true, tracking: false, wholesale: false, upsell: true },
  } as StorefrontSettings;
  return render(
    <MantineProvider env="test">
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<ProductGrid />} />
            <Route path="/p/:id" element={<p>product page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

afterEach(() => cleanup());

describe('ProductGrid', () => {
  it('renders the dense list when no visible product has an image', () => {
    const { container } = mount(CATALOG); // every fixture product has imageProductId: null
    expect(container.querySelector('article')).toBeNull();
    expect(container.querySelectorAll('li').length).toBe(3);
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders the card grid when at least one product has an image', () => {
    const withImage: Catalog = { ...CATALOG, products: CATALOG.products.map((p, i) => (i === 0 ? { ...p, imageProductId: p.id } : p)) };
    const { container } = mount(withImage);
    expect(container.querySelectorAll('article').length).toBe(3);
    expect(container.querySelectorAll('img').length).toBe(1);
  });

  it('opens the product page from a list row', () => {
    mount(CATALOG);
    fireEvent.click(screen.getByRole('button', { name: 'BPC-157 5mg' }));
    expect(screen.getByText('product page')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/product-card.test.tsx test/product-grid.test.tsx`
Expected: FAIL — `hasSiblingImages`/`index` props are ignored (well still rendered; no `anim-row`), and the grid renders `article`s for the image-less catalogue.

- [ ] **Step 3: Update `ProductCard`**

`src/features/catalog/ProductCard.tsx` — add `import { rowAnim } from '@/lib/motion.ts';`; extend the props and render:

```tsx
export interface ProductCardProps {
  product: Product;
  /** The first row of the grid loads its images straight away. */
  eager?: boolean;
  /** False when nothing in the visible set has a photo: the well is dropped entirely. */
  hasSiblingImages?: boolean;
  /** Position in the grid, for the entrance stagger. */
  index?: number;
}

export function ProductCard({ product, eager = false, hasSiblingImages = true, index = 0 }: ProductCardProps) {
  // …existing body…
  const anim = rowAnim(index);
  const hasImage = product.imageProductId !== null;

  return (
    <article className={`${classes.card} ${anim.className}`} style={anim.style}>
      {hasImage ? (
        <ProductImage productId={product.imageProductId!} variant="thumbnail" alt={product.displayName} eager={eager} className={classes.media} />
      ) : hasSiblingImages ? (
        <span className={`${imageClasses.well} ${classes.media}`} aria-hidden>
          <span className={imageClasses.rule} />
        </span>
      ) : null}
      {/* …rest unchanged… */}
```
with `import imageClasses from '@/features/catalog/ProductImage.module.css';` added. (The rule-well markup mirrors `ProductImage`'s failed state so the two blanks are identical.)

- [ ] **Step 4: Update `ProductGrid`**

`src/features/catalog/ProductGrid.tsx` — add imports `import { useNavigate } from 'react-router';` (extend the existing `react-router` import), `import { ProductRow } from '@/features/catalog/ProductRow.tsx';`, `import { rowAnim } from '@/lib/motion.ts';`. Inside the component, after `visible`:

```tsx
  const navigate = useNavigate();
  const imageless = visible.length > 0 && visible.every((p) => p.imageProductId === null);
```

Replace the grid render (`<div className={classes.grid}>…</div>`) with:

```tsx
            ) : imageless ? (
              <ul className={classes.rows}>
                {visible.map((product, i) => (
                  <li key={product.id} {...rowAnim(i)}>
                    <ProductRow product={product} onSelect={(p) => navigate(`/p/${p.id}`)} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className={classes.grid}>
                {visible.map((product, i) => (
                  <ProductCard key={product.id} product={product} eager={i < EAGER_CARDS} hasSiblingImages index={i} />
                ))}
              </div>
            )}
```

`src/features/catalog/ProductGrid.module.css` — add after `.grid { … }`:
```css
/* Image-less catalogues fall back to the manifest rows the menu layout uses. */
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--sf-line);
}
```

- [ ] **Step 5: Run all tests and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: green (including `test/product-list.test.tsx`, which still exercises `ProductRow` in the menu layout).

- [ ] **Step 6: Commit**

```bash
git add src/features/catalog/ProductCard.tsx src/features/catalog/ProductGrid.tsx src/features/catalog/ProductGrid.module.css test/product-card.test.tsx test/product-grid.test.tsx
git commit -m "feat(web): image-less catalogues render as a list; cards drop empty wells

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017mSv2DDn5QZPBHwUF4bkKc"
```

---

### Task 7: Apply the motion across the app; ping the current step

**Files:** (one-line class additions; exact anchors below)
- Modify: `src/features/catalog/ProductRow.tsx:33`, `src/features/catalog/ProductList.tsx:78,152-156`
- Modify: `src/features/wholesale/WholesaleRow.tsx` (the row's root element inside the fragment at line 62)
- Modify: `src/features/cart/CartLine.tsx:55`
- Modify: `src/features/account/OrdersPage.tsx:57` (+ the per-order element inside its `.map`)
- Modify: `src/features/account/AccountLayout.tsx:31`
- Modify: `src/features/catalog/Upsells.tsx:38` (+ the per-item element inside its `.map`)
- Modify: `src/features/tracking/ParcelTimeline.tsx:56`
- Modify: `src/features/tracking/ParcelCard.tsx:40`
- Modify: `src/features/tracking/OrderHero.tsx:57`, `src/features/tracking/LookupForm.tsx:44`
- Modify: `src/features/checkout/QuoteSummary.tsx:81`, `src/features/checkout/CheckoutPage.tsx` (the step panel wrapper — the element that contains the active step's fields; find with `grep -n "classes.panel\|classes.step\b" src/features/checkout/CheckoutPage.tsx`)
- Modify: `src/features/order-status/StatusHero.tsx:25,79-90`, `src/features/order-status/ItemsCard.tsx:18`, `AddressCard.tsx:16`, `ShipmentCard.tsx:30`, `CryptoPaymentCard.tsx:79`, `PaymentSection.tsx:135`
- Modify: `src/features/order-status/OrderStatus.module.css:133` (`.node` gets `position: relative`)
- Modify: `src/features/catalog/ProductDetailPage.tsx:51`, `src/features/catalog/ProductDetailSheet.tsx:100` (wrap the fragment's content: the first element inside)
- Modify: `src/features/verify/VerifyPage.tsx:165,190`, `src/features/payment-redirect/PaymentSuccessPage.tsx:49`, `PaymentCancelPage.tsx:21`, `OrderPlacedPage.tsx:42`
- Modify: `src/features/auth/AuthCard.tsx:20`, `src/components/EmptyState.tsx:15`
- Test: `test/motion-usage.test.ts` (create)

**Interfaces:**
- Consumes: `rowAnim`, `staggerAnim`, `FADE` from `@/lib/motion.ts` (Task 4).

Patterns (use exactly these three):

```tsx
// (a) list rows — the element rendered per item; `i` is the map index
<li key={x.id} {...rowAnim(i)}>            // when the element has no className of its own
<div className={`${classes.row} ${rowAnim(i).className}`} style={rowAnim(i).style}>   // when it has

// (b) sections — one-off panels
<section className={`${classes.card} ${FADE}`} …>

// (c) staggered cards (tracking parcels only)
<section className={`${classes.card} ${staggerAnim(i).className}`} style={staggerAnim(i).style} …>
```

Where a component receives no index (`ProductRow`, `WholesaleRow`, `CartLine`, `ParcelCard`), add an optional `index?: number` prop and pass `i` from the caller's `.map`. Rule for `ProductRow` and `WholesaleRow`: apply `rowAnim(index)` on the root **only when `index` is defined** — `ProductList` passes `i`; `ProductGrid` (Task 6) passes nothing because its own `<li>` already animates, so the row must not animate twice.

- [ ] **Step 1: Write the failing test**

Create `test/motion-usage.test.ts` — a source guard that the anchors listed above carry the motion (keeps a later refactor from silently dropping it):

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

describe('motion is applied', () => {
  it.each([
    'features/catalog/ProductRow.tsx', 'features/cart/CartLine.tsx', 'features/account/OrdersPage.tsx',
    'features/catalog/Upsells.tsx', 'features/tracking/ParcelTimeline.tsx', 'features/checkout/QuoteSummary.tsx',
    'features/wholesale/WholesaleRow.tsx',
  ])('%s animates its rows', (file) => expect(src(file)).toContain('rowAnim('));

  it('tracking parcel cards stagger', () => expect(src('features/tracking/ParcelCard.tsx')).toContain('staggerAnim('));

  it.each([
    'features/order-status/StatusHero.tsx', 'features/order-status/ItemsCard.tsx', 'features/order-status/AddressCard.tsx',
    'features/order-status/ShipmentCard.tsx', 'features/order-status/CryptoPaymentCard.tsx', 'features/order-status/PaymentSection.tsx',
    'features/catalog/ProductList.tsx', 'features/catalog/ProductGrid.tsx', 'features/catalog/ProductDetailPage.tsx',
    'features/catalog/ProductDetailSheet.tsx', 'features/checkout/CheckoutPage.tsx', 'features/tracking/OrderHero.tsx',
    'features/tracking/LookupForm.tsx', 'features/verify/VerifyPage.tsx', 'features/payment-redirect/PaymentSuccessPage.tsx',
    'features/payment-redirect/PaymentCancelPage.tsx', 'features/payment-redirect/OrderPlacedPage.tsx',
    'features/account/AccountLayout.tsx', 'features/auth/AuthCard.tsx', 'components/EmptyState.tsx',
  ])('%s fades in', (file) => expect(src(file)).toMatch(/\bFADE\b/));

  it('the current route node pings', () => {
    expect(src('features/order-status/StatusHero.tsx')).toContain('className="ping"');
    expect(src('features/order-status/OrderStatus.module.css')).toMatch(/\.node\s*\{[^}]*position: relative/s);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/motion-usage.test.ts`
Expected: FAIL on every case.

- [ ] **Step 3: Apply pattern (a) to the rows**

- `ProductRow.tsx`: add `index?: number` to `ProductRowProps`; destructure `index`; root becomes
  `<div className={index === undefined ? classes.row : `${classes.row} ${rowAnim(index).className}`} style={index === undefined ? undefined : rowAnim(index).style}>`.
- `ProductList.tsx` lines 152-156: `.map((product, i) => (<li key={product.id}><ProductRow product={product} onSelect={showProduct} index={i} /></li>))`.
- `WholesaleRow.tsx`: same `index?: number` prop treatment on its root element; pass `i` from its caller's `.map` (`grep -n "<WholesaleRow" src/features/wholesale/*.tsx`).
- `CartLine.tsx` line 55: add `index?: number` prop (default `0`); `<li className={`${classes.line} ${withdrawn ? classes.withdrawn : ''} ${rowAnim(index).className}`} style={rowAnim(index).style}>`; pass `index={i}` from every `<CartLine` caller (`grep -rn "<CartLine" src`).
- `OrdersPage.tsx`: in the orders `.map`, spread `rowAnim(i)` onto the per-order element (merge with its existing `className` using the (a)-second form if it has one).
- `Upsells.tsx`: same on the per-item element in its `.map`.
- `ParcelTimeline.tsx` line 56: `<li className={`${classes.event} ${rowAnim(i).className}`} style={rowAnim(i).style}>` — the enclosing `.map` must expose `i` (`.map((event, i) =>`).
- `QuoteSummary.tsx`: the per-line element in its lines `.map`, same treatment.

- [ ] **Step 4: Apply pattern (b) to the sections and (c) to parcel cards**

For each file in the `fades in` list, import `FADE` and append `${FADE}` to the root element's `className` named at the anchor line (`EmptyState.tsx:15` → `<div className={`${classes.root} ${FADE}`}>`; `StatusHero.tsx:25` → the `<section className={classes.hero}>`; `ProductList.tsx:78` / `ProductGrid.tsx` → the `.page` root; `ProductDetailSheet.tsx:100` → the first element inside the fragment; `CheckoutPage.tsx` → the active step's panel wrapper; `PaymentSection.tsx:135` → the `<section aria-label="Change payment method">` gets `className={FADE}`; `CryptoPaymentCard.tsx:79` → its `<section` root; `AccountLayout.tsx:31` → the tab panel element *inside* `.account` that wraps the `<Outlet />`, not the layout root, so switching tabs re-fades).

`ParcelCard.tsx:40` → `<section className={`${classes.card} ${staggerAnim(index).className}`} style={staggerAnim(index).style} …>` with a new `index: number` prop passed from the parcels `.map` in `TrackingPage.tsx` (`grep -n "<ParcelCard" src/features/tracking/TrackingPage.tsx`).

- [ ] **Step 5: Ping the current node**

`StatusHero.tsx` lines 88-90 — inside the node `<span … aria-hidden>` add, before `{here ? <span className={classes.nodeCore} /> : null}`:
```tsx
              {here ? <span className="ping" /> : null}
```
`OrderStatus.module.css` `.node` (line 133) — add `  position: relative;` as the first declaration.

- [ ] **Step 6: Run all tests, typecheck, and watch it move**

Run: `npx vitest run && npm run typecheck`
Expected: green. With the local stack running (see Task 3 Step 5): catalog rows ripple in top-to-bottom (~25 ms apart); reloading the order-status page fades the hero and cards and the current step node has a slow expanding ring; with the OS "reduce motion" setting on (or DevTools → Rendering → emulate `prefers-reduced-motion`), everything appears instantly and the ring is gone.

- [ ] **Step 7: Commit**

```bash
git add src test/motion-usage.test.ts
git commit -m "feat(web): entrance motion across catalogue, cart, account, tracking, order status

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017mSv2DDn5QZPBHwUF4bkKc"
```

---

### Task 8: Tabular figures audit, version bump, build, visual pass

**Files:**
- Modify: any `src/**/*.module.css` rule that sets `font-family: var(--sf-font-mono)` on an element that renders digits but lacks `font-variant-numeric: tabular-nums`
- Modify: `package.json` (`"version": "0.2.0"`), `../README.md` (release notes line)
- Test: existing suites; `npm run build`

**Interfaces:** none new.

- [ ] **Step 1: Audit the mono voice for tabular figures**

Run (from `web/`): `grep -rn -A6 "font-family: var(--sf-font-mono)" src --include=*.module.css | grep -v "tabular-nums" | grep -B6 "^--$" | grep "font-family" | cut -d: -f1,2 | sort -u`
That lists rule locations whose next six lines contain no `tabular-nums`. For each, open the rule: if the class is used on prices, quantities, totals, order refs, dates, times, counts, tracking numbers or timers, add `  font-variant-numeric: tabular-nums;` directly after the `font-family` line. Pure-word eyebrows (e.g. "Items", "Delivery address") are left alone. Record the list of touched selectors in the report.

- [ ] **Step 2: Bump the version and note the release**

`package.json` → `"version": "0.2.0"`. `../README.md` — under the release/changelog heading (if none exists, add `## Releases` before the deploy section) add:
`- v0.2.0 — design language: Inter, gradient chassis, sharp corners by default (needs backend ≥ the commit that accepts radius \`none\`), entrance motion, image-less catalogue list.`

- [ ] **Step 3: Full verification**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: all green; `dist/` produced. The worker bundle is built by the release workflow — nothing to do here.

- [ ] **Step 4: Visual pass against the old site (report only)**

Run the local stack per `../README.md` "Local development" (backend :3000, `npm run dev` at the repo root for the worker on :8787, `npm run dev:web` for the SPA on :5173) and open the catalog (`/`), a product (`/p/<id>`), `/cart`, `/checkout`, `/tracking`, `/verify`, `/login` at 1280 × 900 and 390 × 844 and compare against `https://kratos-pharma.com/` (catalog) and `https://kratos-pharma.com/order/CSRU8N/3c0f1d4750ba1ed8ded9a72fb53323f0` (order). Check and record in the report: computed `font-family` of a price contains `Inter Variable`; `document.fonts.check('12px "Inter Variable"')` is `true`; `getComputedStyle(document.body).backgroundImage` contains two `radial-gradient`; header `backdrop-filter` is not `none`; product rows carry `anim-row` with `--i`; the console shows no 404s for product images when the catalogue has none. If the local backend has no products with images, the catalog must render as rows.

- [ ] **Step 5: Commit**

```bash
git add package.json ../README.md src
git commit -m "chore(web): v0.2.0 — tabular figures audit, release notes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017mSv2DDn5QZPBHwUF4bkKc"
```

Stop here. Tagging `v0.2.0`, pushing, and the Cloudflare deploy from the admin Deploy tab are the user's calls (spec §3.7); report that the tree is ready to tag.
