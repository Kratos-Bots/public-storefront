# Storefront Templates — Plan 3: Dark Luxury + Cyber Brutalism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two built-in storefront templates — `dark-luxury` and `cyber-brutalism` — on top of Plan 2's template engine, each with presets, locks, options, scoped CSS, slot components, tests, e2e coverage and an admin preview image.

**Architecture:** Each template is a folder under `web/src/templates/<id>/` following Plan 2's Contract reference exactly: a pure `manifest.ts` (presets, tokens, `editable`, `options`), an `index.ts` exporting `slots`, one `template.css` whose every rule is scoped under `:root[data-sf-template="<id>"]`, and slot components in `slots/`. Tokens do most of the work (radius, button fill, card elevation, heading weight, label style, input style, chassis); the CSS styles parts (`data-sf-part`) and the templates' own slot markup (plain `lux-*` / `cb-*` classes); slots add structure (grain, hero, footer, system bar, status strip). Decoration reads **real** store data through the contract hooks.

**Tech Stack:** React 19, Mantine 9.5, Vite 7, vitest 4 + Testing Library (jsdom), Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-09-28-storefront-templates-design.md` — §4.2, §4.3, §4.4 and the template parts of §6. Design briefs: `designs/dark-luxury/DESIGN.md`, `designs/cyber-brutalism/DESIGN.md`, plus the `dark-luxury` and `cyber-brutalism-design` skills.

**Depends on:** Plan 2 (`2026-09-28-storefront-templates-2-engine.md`) fully landed on the same branch. Every name below — `defineTemplate`, `BASE_TOKENS`, `COLOR_KEYS`, `TemplateSlots`, the slot prop types, `useOrderingState`, `useCatalogStats`, `useServerClock`, `useCutoffInfo` (its `CutoffInfo` type is re-exported by the contract from `@/lib/server-clock.ts`, where it is declared — `next` carries `day`, `cutoff`, `shipsOn`, `isToday`, `at`, `msRemaining`), `useMobileCartBar`, `formatClock`, `utcOffsetLabel`, `Brand`, `ContactLinks`, `ArrowUpRightIcon`, `validateManifest`, `resolveTheme`, `lookupManifest`, `getTemplate`, `allTemplates`, the `--sf-*` variables, root attributes, `data-sf-part` values (the five custom buttons — `AddToCart`, `CartSummary` checkout, `MobileCartBar` checkout, `CheckoutPage` `.next` and `.back` — carry `data-sf-part="button"` with `data-variant`), `data-sf-cta="main"` (CartSummary, MobileCartBar and the CheckoutPage Place order / Continue button), `data-sf-slot`, `e2e/flows.ts` (`addFirstToCart`, `FIXED_NOW`), `e2e/mocks.ts` (`installMocks`, `Layout`, `InstallMocksOptions`) and `TEMPLATE_CASES` in `e2e/templates.spec.ts` — comes from Plan 2's Contract reference and tasks, used verbatim.

## Global Constraints

- Repo `T:\Projects\ecommerce\ecommerce-storefront`, branch `feature/storefront-templates` (Plan 2 lands first). **Never stage `designs/`.** Stage by explicit path only.
- Web imports use the `@/` alias with explicit `.ts`/`.tsx` extensions.
- Template files may import **only** `@/templates/contract.ts` (slots, hooks, components, types), `@/templates/define.ts` (manifests — `manifest.ts` imports nothing else), `react`, and `./`-relative files inside their own folder (including `./template.css`). Icons come from the contract (`ArrowUpRightIcon` from `@/templates/contract.ts`) or are inline SVG in the template's own `slots/` — never import `@/components/icons.tsx` directly. Helpers live in `slots/` so every relative import is `./…` (no `../`). Enforced by Plan 2's `scripts/template-imports.mjs` vitest.
- Every selector in a `template.css` starts with `:root[data-sf-template="<id>"]`. Keyframes are prefixed `sf-lux-` / `sf-cb-`. Template classes are prefixed `lux-` / `cb-`. Every non-`none` `animation` declaration sits inside `@media (prefers-reduced-motion: no-preference …)`.
- Contract version 1; ids `dark-luxury`, `cyber-brutalism`; option keys per the manifests below; `nodeLabel` max 24.
- Both templates: `editable: { colors: [...COLOR_KEYS], fonts: false, radius: false, density: true }`.
- Fonts (`FontSpec.weights`): Inter 400–800 — **served by the self-hosted Inter Variable stack, so luxury's heading/body are `null`**; JetBrains Mono `[400, 500]`; Tektur `[400, 600, 700, 900]`; Share Tech Mono `[400]`.
- Mobile contract (spec §4.4): no horizontal scroll at 360 px; tap targets ≥ 44 px inside slots; decorations collapse/hide at the breakpoints stated below (480 px = `29.99em` max, 768 px = `48em`, 992 px = `62em`); safe-area insets respected; overlays `pointer-events: none`; reduced motion honoured; 16 px inputs untouched.
- Option strings (e.g. `nodeLabel`) render as React text only.
- UI tasks (2, 3, 5, 6 and the review in 9) are implemented by a **frontend-design subagent that first loads the matching design skill** (`dark-luxury` for Tasks 2–3, `cyber-brutalism-design` for Tasks 5–6, both for 9) — user preference. Logic tasks may be done directly.
- Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **A long brand name at 360 px in the brutalist hero** (uppercase Tektur 900 at `clamp(2.25rem, 10vw, 7rem)`) → wraps inside the column, no horizontal scroll. Pinned in Task 7 (`templates-decor.spec.ts`: "long brand name does not overflow at 360px").
2. **A catalogue-only store (`features.ordering = false`)** → luxury footer reads `[ORDERING PAUSED]`, brutalist readout `ORDERING PAUSED`, nothing claims orders are open. Pinned in Task 2 (`LuxuryFooter` paused test) and Task 5 (`CyberCatalogHero` paused test).
3. **`nodeLabel` stored blank, whitespace or over-long** (older backend, hand-edited setting) → `NODE_01` / clamped to 24 chars, system bar never widens the page. Pinned in Task 4 (`nodeName` tests) and Task 6 (sysbar `overflow: hidden; white-space: nowrap` CSS test).
4. **Purple Light brutalism on a phone with a cart** → the cart bar is ink (`#111`) with acid text, not purple-on-black, and the checkout stays legible. Pinned in Task 7 ("purple light cart bar is ink with acid text").
5. **`prefers-reduced-motion: reduce`** → no pulsing CTA, no breathing orb, no blinking cursor, no slide-up. Pinned in Tasks 3 and 6 (CSS: every animation inside a no-preference media block) and Task 7 (luxury reduced-motion e2e).

---

## File structure

| File | Responsibility |
|---|---|
| `web/test/helpers/css-rules.ts` | Tiny stylesheet walker for CSS assertions (rules, selectors, at-rule context) |
| `web/src/templates/dark-luxury/manifest.ts` | Presets Gold/Silver/Emerald/Crimson, tokens, locks, options |
| `web/src/templates/dark-luxury/index.ts` | `slots` export + CSS import |
| `web/src/templates/dark-luxury/template.css` | All luxury styling |
| `web/src/templates/dark-luxury/slots/headline.ts` | `splitHeadline` (colour-contrast headline) |
| `web/src/templates/dark-luxury/slots/LuxuryOverlay.tsx` | Grain layer |
| `web/src/templates/dark-luxury/slots/LuxuryCatalogHero.tsx` | Hero badge + headline + orb; list/wholesale welcome |
| `web/src/templates/dark-luxury/slots/LuxurySectionLabel.tsx` | `[Catalogue]` / `[01]` labels |
| `web/src/templates/dark-luxury/slots/LuxuryFooter.tsx` | Rounded footer panel + ordering status badge |
| `web/src/templates/cyber-brutalism/manifest.ts` | Presets Acid Dark/Purple Light, tokens, locks, options |
| `web/src/templates/cyber-brutalism/index.ts` | `slots` export + CSS import |
| `web/src/templates/cyber-brutalism/template.css` | All brutalist styling |
| `web/src/templates/cyber-brutalism/slots/readout.ts` | `nodeName`, `readoutLines` |
| `web/src/templates/cyber-brutalism/slots/Crosshairs.tsx` | `+` corner marks |
| `web/src/templates/cyber-brutalism/slots/CyberTopBar.tsx` | SYS.TIME system bar |
| `web/src/templates/cyber-brutalism/slots/CyberOverlay.tsx` | Viewport crosshair frame |
| `web/src/templates/cyber-brutalism/slots/CyberCatalogHero.tsx` | Brand-name hero + terminal readout |
| `web/src/templates/cyber-brutalism/slots/CyberFooter.tsx` | Hazard stripe, mono grid, node row, status strip |
| `web/src/templates/cyber-brutalism/slots/CyberButtonAdornment.tsx` | `↗` on primary buttons |
| `web/test/template-dark-luxury.test.tsx` | Luxury manifest/locks/slots/CSS tests |
| `web/test/template-cyber-brutalism.test.tsx` | Brutalism manifest/locks/slots/CSS tests |
| `e2e/template-theme.ts` | `presetTheme()` — builds a `tweakSettings` from `/templates.json` |
| `e2e/templates-decor.spec.ts` | Template-specific DOM/computed-style checks |
| `e2e/template-previews.spec.ts` | Opt-in capture of `preview.webp` (no new deps: Chromium canvas encodes WebP) |
| `web/src/templates/*/preview.webp` | Admin thumbnails (generated, committed) |
| `docs/verification/2026-09-28-templates-visual-review.md` | Visual review record |

---

### Task 1: CSS test helper + Dark Luxury manifest, locks and headline

**Files:**
- Create: `web/test/helpers/css-rules.ts`
- Create: `web/src/templates/dark-luxury/manifest.ts`, `web/src/templates/dark-luxury/index.ts`, `web/src/templates/dark-luxury/template.css`, `web/src/templates/dark-luxury/slots/headline.ts`
- Test: `web/test/template-dark-luxury.test.tsx`

**Interfaces:**
- Consumes: `defineTemplate`, `BASE_TOKENS`, `COLOR_KEYS`, `validateManifest` (`@/templates/define.ts`); `resolveTheme` (`@/templates/resolve.ts`); `lookupManifest`, `getTemplate`, `allTemplates` (`@/templates/registry.ts`); `TemplateSlots` (`@/templates/contract.ts`); `Theme` (`@/types/settings.ts`).
- Produces: `cssRules(css): CssRule[]`, `splitSelectors(selector): string[]`, `interface CssRule { selector: string; body: string; atRule: string | null }`; the `dark-luxury` manifest (default export); `splitHeadline(text): { muted: string; bright: string }`.

- [ ] **Step 1: Write the CSS helper** (test infrastructure, no test of its own — exercised by Tasks 3 and 6)

`web/test/helpers/css-rules.ts`:

```ts
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CssRule {
  /** The rule's selector list, verbatim (comments stripped). */
  selector: string;
  /** Declarations between the braces. */
  body: string;
  /** The enclosing @media/@supports prelude, or null at top level. */
  atRule: string | null;
}

/** Flat style rules: @media/@supports bodies are descended into, @keyframes are skipped. */
export function cssRules(css: string): CssRule[] {
  const out: CssRule[] = [];
  walk(css.replace(/\/\*[\s\S]*?\*\//g, ''), null, out);
  return out;
}

function walk(src: string, atRule: string | null, out: CssRule[]): void {
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1) return;
    const prelude = src.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
      j++;
    }
    const body = src.slice(open + 1, j - 1);
    if (prelude.startsWith('@keyframes')) {
      /* skip */
    } else if (prelude.startsWith('@media') || prelude.startsWith('@supports')) {
      walk(body, prelude, out);
    } else if (prelude) {
      out.push({ selector: prelude, body: body.trim(), atRule });
    }
    i = j;
  }
}

/** Split a selector list on top-level commas (commas inside :is()/:not() stay put). */
export function splitSelectors(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of selector) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/** web/test/ — this file lives in web/test/helpers/. */
const TEST_DIR = fileURLToPath(new URL('../', import.meta.url));

/** Read a file relative to web/test/ (e.g. '../src/templates/x/template.css'). */
export function readFromTest(rel: string): string {
  return readFileSync(path.resolve(TEST_DIR, rel), 'utf8');
}
```

- [ ] **Step 2: Write the failing tests**

`web/test/template-dark-luxury.test.tsx` (this file grows in Tasks 2 and 3):

```tsx
import { describe, expect, it } from 'vitest';
import manifest from '@/templates/dark-luxury/manifest.ts';
import { validateManifest } from '@/templates/define.ts';
import { allTemplates, getTemplate, lookupManifest } from '@/templates/registry.ts';
import { resolveTheme } from '@/templates/resolve.ts';
import { splitHeadline } from '@/templates/dark-luxury/slots/headline.ts';
import type { Theme } from '@/types/settings.ts';

describe('dark-luxury manifest', () => {
  it('is a valid contract-1 manifest discovered as a built-in', () => {
    expect(validateManifest(manifest, 'dark-luxury')).toEqual([]);
    expect(allTemplates().map((t) => t.manifest.id)).toContain('dark-luxury');
    expect(getTemplate('dark-luxury').builtIn).toBe(true);
  });

  it('offers Gold (default), Silver, Emerald and Crimson — all dark', () => {
    expect(manifest.defaultPreset).toBe('gold');
    expect(manifest.presets.map((p) => p.id)).toEqual(['gold', 'silver', 'emerald', 'crimson']);
    expect(manifest.schemes).toEqual(['dark']);
    expect(manifest.presets.every((p) => p.scheme === 'dark' && p.radius === 'lg')).toBe(true);
    expect(manifest.presets[0]!.colors).toMatchObject({ primary: '#d4a03c', bg: '#0a0907', surface: '#161412', text: '#f0ebe0' });
  });

  it('never fills buttons with the accent and never borders cards', () => {
    expect(manifest.tokens.button.fill).toBe('outline-glow');
    expect(manifest.tokens.card.border).toBe('none');
    expect(manifest.tokens.card.shadow).toContain('inset 0 1px 0');
    expect(manifest.tokens.label.style).toBe('bracket');
    expect(manifest.tokens.chassis).toBe('flat');
  });
});

describe('dark-luxury locks', () => {
  const gold = manifest.presets[0]!;
  const stored: Theme = {
    template: 'dark-luxury', preset: 'gold', options: {},
    scheme: 'light',
    colors: { ...gold.colors, primary: '#ff0000' },
    fonts: { heading: 'Comic Neue', body: null, mono: null },
    radius: 'sm', density: 'compact', customCss: '',
  };

  it('keeps colours and density, forces scheme, radius and fonts back to the preset', () => {
    const r = resolveTheme(stored, lookupManifest);
    expect(r.templateId).toBe('dark-luxury');
    expect(r.scheme).toBe('dark');
    expect(r.radius).toBe('lg');
    expect(r.fonts.heading).toBeNull();
    expect(r.fonts.body).toBeNull();
    expect(r.fonts.mono).toEqual({ family: 'JetBrains Mono', weights: [400, 500] });
    expect(r.colors.primary).toBe('#ff0000');
    expect(r.density).toBe('compact');
  });

  it('defaults every option on', () => {
    expect(resolveTheme(stored, lookupManifest).options).toEqual({ grain: true, orb: true, statusBadge: true });
  });
});

describe('splitHeadline', () => {
  it('brightens the last third of the words (at least one)', () => {
    expect(splitHeadline('Pure botanical extracts, lab verified')).toEqual({ muted: 'Pure botanical extracts,', bright: 'lab verified' });
    expect(splitHeadline('Small batch oils')).toEqual({ muted: 'Small batch', bright: 'oils' });
    expect(splitHeadline('Handmade candles')).toEqual({ muted: 'Handmade', bright: 'candles' });
  });
  it('handles one word, blanks and messy spacing', () => {
    expect(splitHeadline('Aurum')).toEqual({ muted: '', bright: 'Aurum' });
    expect(splitHeadline('   ')).toEqual({ muted: '', bright: '' });
    expect(splitHeadline('  Rare   resins  here ')).toEqual({ muted: 'Rare resins', bright: 'here' });
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `npm run test:web -- template-dark-luxury` → FAIL (`@/templates/dark-luxury/manifest.ts` not found).

- [ ] **Step 4: Create the manifest**

`web/src/templates/dark-luxury/manifest.ts`:

```ts
import { BASE_TOKENS, COLOR_KEYS, defineTemplate } from '@/templates/define.ts';

// Heading and body stay on the self-hosted Inter Variable stack (null) — it already
// covers 400–800, so loading Inter from Google Fonts too would be a wasted request.
const FONTS = { heading: null, body: null, mono: { family: 'JetBrains Mono', weights: [400, 500] } };

export default defineTemplate({
  contractVersion: 1,
  id: 'dark-luxury',
  name: 'Dark Luxury',
  version: '1.0.0',
  description: 'Near-black ground, one warm metallic accent, film grain and a single soft glow. Borderless raised cards and glowing outlined buttons — premium without ornament.',
  author: 'Kratos Bots',
  schemes: ['dark'],
  presets: [
    {
      id: 'gold', name: 'Gold', scheme: 'dark', radius: 'lg', fonts: FONTS,
      colors: { primary: '#d4a03c', bg: '#0a0907', surface: '#161412', text: '#f0ebe0', muted: '#8a8070', success: '#3d9e5c', warn: '#c98a2e', danger: '#b83c38' },
    },
    {
      id: 'silver', name: 'Silver', scheme: 'dark', radius: 'lg', fonts: FONTS,
      colors: { primary: '#b4c0d4', bg: '#080809', surface: '#121316', text: '#eceef5', muted: '#808898', success: '#3d9e5c', warn: '#c9a24a', danger: '#b83c38' },
    },
    {
      id: 'emerald', name: 'Emerald', scheme: 'dark', radius: 'lg', fonts: FONTS,
      colors: { primary: '#42b872', bg: '#070908', surface: '#101410', text: '#e8f2ec', muted: '#708078', success: '#3d9e5c', warn: '#c9a24a', danger: '#b83c38' },
    },
    {
      id: 'crimson', name: 'Crimson', scheme: 'dark', radius: 'lg', fonts: FONTS,
      colors: { primary: '#c8385a', bg: '#09070a', surface: '#130f14', text: '#f2eaf0', muted: '#907080', success: '#3d9e5c', warn: '#c9a24a', danger: '#e0524f' },
    },
  ],
  defaultPreset: 'gold',
  tokens: {
    ...BASE_TOKENS,
    button: { radius: 10, fill: 'outline-glow', transform: 'none', tracking: { sm: '0', md: '0', lg: '0' }, weight: 600, font: 'body' },
    card: {
      radius: 16,
      border: 'none',
      shadow: 'inset 0 1px 0 rgba(255, 248, 230, 0.08), 0 4px 24px rgba(0, 0, 0, 0.45)',
      shadowHover: 'inset 0 1px 0 rgba(255, 248, 230, 0.10), 0 12px 40px rgba(0, 0, 0, 0.55)',
    },
    heading: { weight: 700, tracking: '-0.03em', transform: 'none' },
    label: { style: 'bracket' },
    input: { style: 'box' },
    chassis: 'flat',
    badge: { radius: 'pill' },
  },
  editable: { colors: [...COLOR_KEYS], fonts: false, radius: false, density: true },
  options: [
    { key: 'grain', type: 'boolean', label: 'Grain texture', help: 'A faint film grain over the whole page.', default: true },
    { key: 'orb', type: 'boolean', label: 'Hero glow', help: 'One soft accent-coloured glow behind the catalogue intro.', default: true },
    { key: 'statusBadge', type: 'boolean', label: 'Ordering status badge', help: 'Shows [ACCEPTING ORDERS] or [ORDERING PAUSED] in the footer.', default: true },
  ],
});
```

(`preview` is added in Task 8, once the image exists — the catalog plugin fails the build on a missing file.)

- [ ] **Step 5: Create the headline helper, index and CSS placeholder**

`web/src/templates/dark-luxury/slots/headline.ts`:

```ts
export interface Headline { muted: string; bright: string }

/**
 * The dark-luxury headline move: every word the same bold weight, contrast by colour.
 * The last third of the words (at least one) are bright; the rest are dimmed.
 */
export function splitHeadline(text: string): Headline {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { muted: '', bright: words[0] ?? '' };
  const brightCount = Math.max(1, Math.ceil(words.length / 3));
  return {
    muted: words.slice(0, words.length - brightCount).join(' '),
    bright: words.slice(words.length - brightCount).join(' '),
  };
}
```

`web/src/templates/dark-luxury/index.ts`:

```ts
import './template.css';
import type { TemplateSlots } from '@/templates/contract.ts';

export const slots: TemplateSlots = {};
```

`web/src/templates/dark-luxury/template.css`:

```css
/* Dark Luxury — filled in by Task 3. Every rule scoped under :root[data-sf-template="dark-luxury"]. */
```

- [ ] **Step 6: Run the tests**

Run: `npm run test:web -- template-dark-luxury templates-registry` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 7: Commit**

```bash
git add web/test/helpers/css-rules.ts web/src/templates/dark-luxury web/test/template-dark-luxury.test.tsx
git commit -m "feat(templates): dark-luxury manifest, presets and locks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Dark Luxury slots (frontend-design subagent, loads `dark-luxury`)

**Files:**
- Create: `web/src/templates/dark-luxury/slots/LuxuryOverlay.tsx`, `LuxuryCatalogHero.tsx`, `LuxurySectionLabel.tsx`, `LuxuryFooter.tsx`
- Modify: `web/src/templates/dark-luxury/index.ts`
- Test: `web/test/template-dark-luxury.test.tsx` (append)

**Interfaces:**
- Consumes: `OverlayProps`, `CatalogHeroProps`, `SectionLabelProps`, `FooterProps`, `SlotBaseProps`, `OptionValues`, `useOrderingState`, `Brand`, `ContactLinks` (all from `@/templates/contract.ts`); `splitHeadline`.
- Produces: `LuxuryOverlay`, `LuxuryCatalogHero`, `LuxurySectionLabel`, `LuxuryFooter`; DOM hooks used by Tasks 3 and 7: `.lux-grain[data-lux="grain"]`, `.lux-hero`, `.lux-orb[data-lux="orb"]`, `.lux-hero__badge`, `.lux-hero__headline`, `.lux-hero__muted`, `.lux-hero__bright`, `.lux-hero__welcome`, `.lux-welcome`, `.lux-label`, `.lux-footer-wrap`, `.lux-footer`, `.lux-footer--compact`, `.lux-footer__grid`, `.lux-footer__tagline`, `.lux-footer__head`, `.lux-footer__list`, `.lux-footer__link`, `.lux-footer__base`, `.lux-status[data-state="open"|"paused"]`, `.lux-status__dot`.

- [ ] **Step 1: Append the failing slot tests**

At the **top** of `web/test/template-dark-luxury.test.tsx`, replace the first import line with these (mocks must be hoisted before the imports that use them):

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { OptionValues, SlotBaseProps } from '@/templates/contract.ts';

const h = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));

import { LuxuryOverlay } from '@/templates/dark-luxury/slots/LuxuryOverlay.tsx';
import { LuxuryCatalogHero } from '@/templates/dark-luxury/slots/LuxuryCatalogHero.tsx';
import { LuxurySectionLabel } from '@/templates/dark-luxury/slots/LuxurySectionLabel.tsx';
import { LuxuryFooter } from '@/templates/dark-luxury/slots/LuxuryFooter.tsx';
```

(keep the Task 1 imports that follow). Then append:

```tsx
function settings(over: { ordering?: boolean; tagline?: string } = {}): StorefrontSettings {
  return {
    enabled: true,
    serverTime: '2026-08-24T09:05:07.000Z',
    cutoffs: { timezone: 'UTC', days: {} },
    brand: { name: 'Aurum', shortName: 'Aurum', tagline: over.tagline ?? 'Rare resins, slow made', title: 'Aurum', description: '', logoUrl: null, faviconUrl: null, logoHeight: 28, links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront', ordering: over.ordering ?? true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
    supportLinks: [],
    welcomeMessage: null,
    currency: 'GBP',
  } as unknown as StorefrontSettings;
}

const DEFAULTS: OptionValues = Object.fromEntries(manifest.options.map((o) => [o.key, o.default]));
function base(options: OptionValues = {}, over: Partial<SlotBaseProps> = {}): SlotBaseProps {
  return { brand: h.settings.brand, options: { ...DEFAULTS, ...options }, scheme: 'dark', layout: 'storefront', tokens: manifest.tokens, ...over };
}

afterEach(cleanup);

describe('LuxuryOverlay', () => {
  it('renders the grain layer when the option is on, nothing when off', () => {
    h.settings = settings();
    const { container, rerender } = render(<LuxuryOverlay {...base()} />);
    expect(container.querySelector('[data-lux="grain"]')).toBeInTheDocument();
    rerender(<LuxuryOverlay {...base({ grain: false })} />);
    expect(container.querySelector('[data-lux="grain"]')).toBeNull();
  });
});

describe('LuxuryCatalogHero', () => {
  const hero = { tagline: 'Rare resins, slow made', welcomeMessage: 'Dispatched daily.', productCount: 42, categoryCount: 5 };

  it('grid: badge with real counts, colour-split headline, welcome and orb', () => {
    h.settings = settings();
    const { container } = render(<LuxuryCatalogHero {...base()} surface="grid" {...hero} />);
    expect(screen.getByText('42 products · 5 categories')).toBeInTheDocument();
    expect(container.querySelector('.lux-hero__muted')).toHaveTextContent('Rare resins,');
    expect(container.querySelector('.lux-hero__bright')).toHaveTextContent('slow made');
    expect(screen.getByText('Dispatched daily.')).toBeInTheDocument();
    expect(container.querySelector('[data-lux="orb"]')).toBeInTheDocument();
    expect(container.querySelector('[data-sf-part="hero"]')).toBeInTheDocument();
  });

  it('grid: orb off, no category count, headline absent without a tagline', () => {
    h.settings = settings();
    const { container } = render(<LuxuryCatalogHero {...base({ orb: false })} surface="grid" {...hero} tagline="" categoryCount={0} />);
    expect(container.querySelector('[data-lux="orb"]')).toBeNull();
    expect(container.querySelector('.lux-hero__headline')).toBeNull();
    expect(screen.getByText('42 products')).toBeInTheDocument();
  });

  it('grid with neither tagline nor welcome renders nothing (same as modern)', () => {
    h.settings = settings();
    const { container } = render(<LuxuryCatalogHero {...base()} surface="grid" {...hero} tagline="" welcomeMessage={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('list and wholesale surfaces render only the welcome line', () => {
    h.settings = settings();
    const { container, rerender } = render(<LuxuryCatalogHero {...base()} surface="list" {...hero} />);
    expect(container.querySelector('.lux-welcome')).toHaveTextContent('Dispatched daily.');
    expect(container.querySelector('.lux-hero')).toBeNull();
    rerender(<LuxuryCatalogHero {...base()} surface="wholesale" {...hero} welcomeMessage={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('LuxurySectionLabel', () => {
  it('labels the page [Catalogue] and groups [01], [02]…', () => {
    h.settings = settings();
    const { container, rerender } = render(<LuxurySectionLabel {...base()} index={1} title="All products" level="page" />);
    expect(container.querySelector('[data-sf-part="section-label"]')).toHaveTextContent('[Catalogue]');
    rerender(<LuxurySectionLabel {...base()} index={7} title="Resins" level="group" />);
    expect(container.querySelector('[data-sf-part="section-label"]')).toHaveTextContent('[07]');
  });
});

describe('LuxuryFooter', () => {
  const links = [{ label: 'Shipping', url: 'https://example.com/shipping' }];

  it('storefront: panel with tagline, [Support] links and an open status badge', () => {
    h.settings = settings();
    const { container } = render(<LuxuryFooter {...base()} supportLinks={links} hasChat={false} />);
    expect(container.querySelector('[data-sf-part="footer"]')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '[Support]' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shipping' })).toHaveAttribute('href', 'https://example.com/shipping');
    expect(container.querySelector('.lux-status')).toHaveAttribute('data-state', 'open');
    expect(container.querySelector('.lux-status')).toHaveTextContent('[ACCEPTING ORDERS]');
  });

  it('reads [ORDERING PAUSED] when ordering is off', () => {
    h.settings = settings({ ordering: false });
    const { container } = render(<LuxuryFooter {...base()} supportLinks={[]} hasChat={false} />);
    expect(container.querySelector('.lux-status')).toHaveAttribute('data-state', 'paused');
    expect(container.querySelector('.lux-status')).toHaveTextContent('[ORDERING PAUSED]');
  });

  it('statusBadge off hides the badge; menu layout gets the compact panel or nothing', () => {
    h.settings = settings();
    const { container, rerender } = render(<LuxuryFooter {...base({ statusBadge: false })} supportLinks={[]} hasChat={false} />);
    expect(container.querySelector('.lux-status')).toBeNull();
    rerender(<LuxuryFooter {...base({}, { layout: 'menu' })} supportLinks={links} hasChat={false} />);
    expect(container.querySelector('.lux-footer--compact')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Shipping' })).toBeNull();
    rerender(<LuxuryFooter {...base({ statusBadge: false }, { layout: 'menu' })} supportLinks={links} hasChat={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm run test:web -- template-dark-luxury` → FAIL (slot modules missing).

- [ ] **Step 3: Write the slots**

`web/src/templates/dark-luxury/slots/LuxuryOverlay.tsx`:

```tsx
import type { OverlayProps } from '@/templates/contract.ts';

/** The grain: a fixed, tap-transparent film over the whole page (styled in template.css). */
export function LuxuryOverlay({ options }: OverlayProps) {
  if (options.grain !== true) return null;
  return <div className="lux-grain" data-lux="grain" aria-hidden />;
}
```

`web/src/templates/dark-luxury/slots/LuxuryCatalogHero.tsx`:

```tsx
import type { CatalogHeroProps } from '@/templates/contract.ts';
import { splitHeadline } from './headline.ts';

/**
 * Grid: a hero badge with the real catalogue counts, the tagline as a colour-contrast
 * headline, the welcome line, and the single elliptical orb. List/wholesale surfaces
 * are dense — they keep only the welcome line.
 */
export function LuxuryCatalogHero({ surface, tagline, welcomeMessage, productCount, categoryCount, options }: CatalogHeroProps) {
  if (surface !== 'grid') {
    return welcomeMessage ? <p className="lux-welcome">{welcomeMessage}</p> : null;
  }
  if (!tagline && !welcomeMessage) return null;

  const { muted, bright } = splitHeadline(tagline);
  const counts = `${productCount} products${categoryCount > 0 ? ` · ${categoryCount} categories` : ''}`;

  return (
    <section className="lux-hero" aria-label="About this shop" data-sf-part="hero">
      {options.orb === true ? <div className="lux-orb" data-lux="orb" aria-hidden /> : null}
      <p className="lux-hero__badge">
        <span className="lux-hero__dot" aria-hidden />
        {counts}
      </p>
      {bright ? (
        <p className="lux-hero__headline">
          {muted ? <span className="lux-hero__muted">{muted} </span> : null}
          <span className="lux-hero__bright">{bright}</span>
        </p>
      ) : null}
      {welcomeMessage ? <p className="lux-hero__welcome">{welcomeMessage}</p> : null}
    </section>
  );
}
```

`web/src/templates/dark-luxury/slots/LuxurySectionLabel.tsx`:

```tsx
import type { SectionLabelProps } from '@/templates/contract.ts';

/**
 * `[Label]` bracket notation, mono, accent. Not `[${title}]` — the heading right under
 * it already says the title, so the label names the section's role instead.
 */
export function LuxurySectionLabel({ index, level }: SectionLabelProps) {
  const text = level === 'page' ? '[Catalogue]' : `[${String(index).padStart(2, '0')}]`;
  return <p className="lux-label" data-sf-part="section-label" aria-hidden>{text}</p>;
}
```

`web/src/templates/dark-luxury/slots/LuxuryFooter.tsx`:

```tsx
import { Brand, ContactLinks, useOrderingState, type FooterProps } from '@/templates/contract.ts';

function StatusBadge() {
  const { accepting } = useOrderingState();
  return (
    <p className="lux-status" data-state={accepting ? 'open' : 'paused'}>
      <span className="lux-status__dot" aria-hidden />
      {accepting ? '[ACCEPTING ORDERS]' : '[ORDERING PAUSED]'}
    </p>
  );
}

/**
 * The footer sits inside a rounded elevated panel, never flush with the page. The
 * status badge is the store's real ordering state. The menu layout is dense: it gets
 * a compact panel carrying just the badge (or nothing when the badge is off).
 */
export function LuxuryFooter({ brand, layout, supportLinks, hasChat, options }: FooterProps) {
  const badge = options.statusBadge === true ? <StatusBadge /> : null;
  const year = new Date().getFullYear();

  if (layout !== 'storefront') {
    if (!badge) return null;
    return (
      <footer className="lux-footer-wrap" data-sf-part="footer">
        <div className="lux-footer lux-footer--compact">
          {badge}
          <span className="lux-footer__meta">{brand.name} // {year}</span>
        </div>
      </footer>
    );
  }

  return (
    <footer className="lux-footer-wrap" data-sf-part="footer">
      <div className="lux-footer">
        <div className="lux-footer__grid">
          <div>
            <Brand size="sm" />
            {brand.tagline ? <p className="lux-footer__tagline">{brand.tagline}</p> : null}
          </div>

          {supportLinks.length > 0 ? (
            <nav aria-label="Support">
              <h2 className="lux-footer__head">[Support]</h2>
              <ul className="lux-footer__list">
                {supportLinks.map((link) => (
                  <li key={link.url}>
                    <a className="lux-footer__link" href={link.url} target="_blank" rel="noopener noreferrer">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          {hasChat ? (
            <div>
              <h2 className="lux-footer__head">[Talk to us]</h2>
              <ContactLinks />
            </div>
          ) : null}
        </div>

        <div className="lux-footer__base">
          <span className="lux-footer__meta">{brand.name} // {year}</span>
          {badge}
        </div>
      </div>
    </footer>
  );
}
```

`web/src/templates/dark-luxury/index.ts`:

```ts
import './template.css';
import type { TemplateSlots } from '@/templates/contract.ts';
import { LuxuryCatalogHero } from './slots/LuxuryCatalogHero.tsx';
import { LuxuryFooter } from './slots/LuxuryFooter.tsx';
import { LuxuryOverlay } from './slots/LuxuryOverlay.tsx';
import { LuxurySectionLabel } from './slots/LuxurySectionLabel.tsx';

export const slots: TemplateSlots = {
  Overlay: LuxuryOverlay,
  CatalogHero: LuxuryCatalogHero,
  SectionLabel: LuxurySectionLabel,
  Footer: LuxuryFooter,
};
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:web -- template-dark-luxury template-imports` → PASS (the import scanner vitest from Plan 2 Task 10 must accept every new file). Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/templates/dark-luxury web/test/template-dark-luxury.test.tsx
git commit -m "feat(templates): dark-luxury grain, hero, section labels and footer slots

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Dark Luxury stylesheet (frontend-design subagent, loads `dark-luxury`)

**Files:**
- Modify: `web/src/templates/dark-luxury/template.css`
- Test: `web/test/template-dark-luxury.test.tsx` (append)

**Interfaces:**
- Consumes: `cssRules`, `splitSelectors`, `readFromTest` (Task 1); Plan 2 parts, tokens, root attributes; Task 2 class names.
- Produces: the finished luxury look.

- [ ] **Step 1: Append the failing CSS tests**

Add `import { cssRules, readFromTest, splitSelectors } from './helpers/css-rules.ts';` to the imports, then append:

```tsx
describe('dark-luxury template.css', () => {
  const css = readFromTest('../src/templates/dark-luxury/template.css');
  const rules = cssRules(css);
  const ROOT = ':root[data-sf-template="dark-luxury"]';

  it('scopes every selector under the template root', () => {
    expect(rules.length).toBeGreaterThan(30);
    for (const r of rules) for (const s of splitSelectors(r.selector)) expect(s.startsWith(ROOT), s).toBe(true);
  });

  it('pulses only the main call to action', () => {
    const pulsing = rules.filter((r) => r.body.includes('sf-lux-pulse'));
    expect(pulsing.length).toBeGreaterThan(0);
    for (const r of pulsing) for (const s of splitSelectors(r.selector)) expect(s).toContain('[data-sf-cta="main"]');
  });

  it('runs every animation only when motion is welcome', () => {
    for (const r of rules) {
      const m = /animation:\s*([^;]+);/.exec(r.body);
      if (m && m[1]!.trim() !== 'none') expect(r.atRule ?? '', r.selector).toContain('prefers-reduced-motion: no-preference');
    }
  });

  it('keeps decoration out of the way of taps', () => {
    for (const cls of ['.lux-grain', '.lux-orb']) {
      const r = rules.find((x) => x.selector === `${ROOT} ${cls}` && x.atRule === null)!;
      expect(r.body, cls).toContain('pointer-events: none');
    }
    const hero = rules.find((x) => x.selector === `${ROOT} .lux-hero` && x.atRule === null)!;
    expect(hero.body).toContain('overflow: hidden'); // the 900px orb never widens the page
  });

  it('never fills a button with the accent', () => {
    for (const r of rules.filter((x) => x.selector.includes('[data-sf-part="button"]'))) {
      expect(r.body, r.selector).not.toMatch(/background(-color)?:\s*var\(--sf-primary\)/);
    }
  });

  it('gives footer links a 44px target', () => {
    expect(rules.find((x) => x.selector === `${ROOT} .lux-footer__link`)!.body).toContain('min-height: 44px');
    expect(rules.find((x) => x.selector === `${ROOT} [data-sf-slot="Footer"] a`)!.body).toContain('min-height: 44px');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm run test:web -- template-dark-luxury` → FAIL (placeholder CSS has no rules).

- [ ] **Step 3: Write the stylesheet**

Replace `web/src/templates/dark-luxury/template.css` with:

```css
/* Dark Luxury — near-black ground, one warm metallic accent, grain, a single orb.
   Brief: designs/dark-luxury/DESIGN.md + the dark-luxury skill. The rules that matter:
   cards have no border (the inset top highlight is the edge); filled buttons are a dark
   surface with an accent border and an always-on layered glow — never an accent fill;
   the accent is surgical (labels, borders, prices); only the page's main CTA pulses.
   Every rule is scoped under :root[data-sf-template="dark-luxury"]; keyframes are
   prefixed sf-lux-; animations live only inside prefers-reduced-motion: no-preference. */

:root[data-sf-template="dark-luxury"] {
  --lux-glow: 0 0 8px color-mix(in srgb, var(--sf-primary) 55%, transparent), 0 0 20px color-mix(in srgb, var(--sf-primary) 25%, transparent), 0 0 40px color-mix(in srgb, var(--sf-primary) 10%, transparent);
  --lux-glow-mid: 0 0 10px color-mix(in srgb, var(--sf-primary) 70%, transparent), 0 0 28px color-mix(in srgb, var(--sf-primary) 35%, transparent), 0 0 52px color-mix(in srgb, var(--sf-primary) 16%, transparent);
  --lux-glow-hi: 0 0 10px color-mix(in srgb, var(--sf-primary) 75%, transparent), 0 0 28px color-mix(in srgb, var(--sf-primary) 40%, transparent), 0 0 55px color-mix(in srgb, var(--sf-primary) 18%, transparent);
  --lux-border-subtle: color-mix(in srgb, var(--sf-text) 7%, transparent);
  --lux-border-medium: color-mix(in srgb, var(--sf-text) 13%, transparent);
  --lux-highlight: color-mix(in srgb, var(--sf-text) 8%, transparent);
  --lux-dim: color-mix(in srgb, var(--sf-muted) 62%, var(--sf-bg));
  --lux-accent-bright: color-mix(in srgb, var(--sf-primary) 82%, #ffffff);
  --lux-ease: cubic-bezier(0.16, 1, 0.3, 1);
}

/* ── Chrome ─────────────────────────────────────────────────────────── */

:root[data-sf-template="dark-luxury"] [data-sf-part="header"] {
  background: color-mix(in srgb, var(--sf-bg) 80%, transparent);
  border-bottom-color: var(--lux-border-subtle);
}

:root[data-sf-template="dark-luxury"] [data-sf-part="cart-bar"] {
  border-top-color: var(--lux-border-subtle);
}

/* ── Type ───────────────────────────────────────────────────────────── */

:root[data-sf-template="dark-luxury"] [data-sf-part="page-title"] {
  font-size: clamp(1.75rem, 3.2vw, 2.75rem);
  line-height: 1.1;
  color: var(--sf-text);
}

:root[data-sf-template="dark-luxury"] [data-sf-part="group-title"] {
  font-weight: 700;
  letter-spacing: -0.02em;
}

:root[data-sf-template="dark-luxury"] [data-sf-part="price"] {
  font-family: var(--sf-font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--sf-primary);
}

:root[data-sf-template="dark-luxury"] .lux-label {
  margin: 0 0 0.5rem;
  font-family: var(--sf-font-mono);
  font-size: 13px;
  font-weight: 400;
  letter-spacing: 0.06em;
  color: var(--sf-primary);
}

/* ── Buttons: dark surface + accent border + layered glow ───────────── */

:root[data-sf-template="dark-luxury"] [data-sf-part="button"][data-variant="filled"] {
  /* Plan 2's shared outline-glow rule already gives every filled button (Mantine and the three
     custom module buttons) its accent border; luxury only lifts the fill and adds the glow. */
  background: var(--sf-surface);
  color: var(--sf-text);
  box-shadow: var(--lux-glow);
  transition: box-shadow 220ms ease, border-color 220ms ease, transform 150ms var(--lux-ease);
}

:root[data-sf-template="dark-luxury"] [data-sf-part="button"][data-variant="filled"]:is(:disabled, [data-disabled]) {
  background: var(--sf-surface);
  color: var(--sf-faint);
  border-color: var(--lux-border-medium);
  box-shadow: none;
}

:root[data-sf-template="dark-luxury"] [data-sf-part="button"][data-variant="default"] {
  border-color: var(--lux-border-medium);
  color: var(--sf-text);
}

:root[data-sf-template="dark-luxury"] [data-sf-part="button"]:focus-visible {
  outline: 2px solid var(--lux-accent-bright);
  outline-offset: 3px;
}

@media (hover: hover) {
  :root[data-sf-template="dark-luxury"] [data-sf-part="button"][data-variant="filled"]:hover:not(:disabled):not([data-disabled]) {
    border-color: var(--lux-accent-bright);
    box-shadow: var(--lux-glow-hi);
    transform: translateY(-1px);
    animation: none;
  }
  :root[data-sf-template="dark-luxury"] [data-sf-part="button"][data-variant="default"]:hover:not(:disabled):not([data-disabled]) {
    border-color: color-mix(in srgb, var(--sf-text) 28%, transparent);
    background: color-mix(in srgb, #ffffff 3%, transparent);
  }
}

/* ── Surfaces: no border, inset top highlight + soft drop shadow ────── */

:root[data-sf-template="dark-luxury"] [data-sf-part="product-card"],
:root[data-sf-template="dark-luxury"] [data-sf-part="card"] {
  border: none;
  background: var(--sf-surface);
  box-shadow: var(--sf-card-shadow);
}

:root[data-sf-template="dark-luxury"] [data-sf-part="product-card"] {
  overflow: hidden;
}

:root[data-sf-template="dark-luxury"] [data-sf-part="product-row"] {
  border-color: var(--lux-border-subtle);
}

@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  :root[data-sf-template="dark-luxury"] [data-sf-part="product-card"] {
    transition: transform 220ms var(--lux-ease), box-shadow 220ms ease;
  }
  :root[data-sf-template="dark-luxury"] [data-sf-part="product-card"]:hover {
    transform: translateY(-2px);
    box-shadow: var(--sf-card-shadow-hover);
  }
}

/* ── Inputs: quiet boxes, accent on focus ───────────────────────────── */

:root[data-sf-template="dark-luxury"] [data-sf-part="input"] {
  border-color: var(--lux-border-medium);
  border-radius: 10px;
  background: color-mix(in srgb, var(--sf-surface) 60%, transparent);
}

:root[data-sf-template="dark-luxury"] [data-sf-part="input"]:focus,
:root[data-sf-template="dark-luxury"] [data-sf-part="input"]:focus-within {
  border-color: var(--sf-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--sf-primary) 18%, transparent);
}

/* ── Overlay: grain ─────────────────────────────────────────────────── */

:root[data-sf-template="dark-luxury"] .lux-grain {
  position: fixed;
  inset: 0;
  z-index: 60;
  pointer-events: none;
  opacity: 0.04;
  mix-blend-mode: overlay;
  background-size: 128px;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  transform: translateZ(0);
}

/* Phones: blending a full-screen fixed layer is costly during momentum scroll. */
@media (max-width: 47.99em) {
  :root[data-sf-template="dark-luxury"] .lux-grain {
    mix-blend-mode: normal;
    opacity: 0.03;
  }
}

/* ── Catalogue hero ─────────────────────────────────────────────────── */

:root[data-sf-template="dark-luxury"] .lux-hero {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  margin: 0 0 1.5rem;
  padding: clamp(2rem, 6vw, 4.5rem) clamp(1.25rem, 4vw, 2.5rem) clamp(2.5rem, 7vw, 5rem);
  border-radius: 20px;
  background: color-mix(in srgb, var(--sf-surface) 45%, var(--sf-bg));
  box-shadow: inset 0 1px 0 var(--lux-highlight);
}

:root[data-sf-template="dark-luxury"] .lux-orb {
  position: absolute;
  z-index: -1;
  left: 50%;
  bottom: -45%;
  width: min(900px, 160%);
  aspect-ratio: 9 / 5;
  border-radius: 50%;
  filter: blur(40px);
  pointer-events: none;
  transform: translateX(-50%);
  background: radial-gradient(ellipse at center bottom, color-mix(in srgb, var(--sf-primary) 28%, transparent) 0%, color-mix(in srgb, var(--sf-primary) 12%, transparent) 35%, transparent 70%);
}

:root[data-sf-template="dark-luxury"] .lux-hero__badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 1.5rem;
  padding: 0.45rem 1rem;
  border: 1px solid var(--lux-border-subtle);
  border-radius: 999px;
  background: color-mix(in srgb, var(--sf-text) 5%, transparent);
  font-family: var(--sf-font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--sf-muted);
}

:root[data-sf-template="dark-luxury"] .lux-hero__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sf-primary);
  box-shadow: 0 0 8px color-mix(in srgb, var(--sf-primary) 55%, transparent);
}

:root[data-sf-template="dark-luxury"] .lux-hero__headline {
  margin: 0;
  max-width: 18ch;
  font-family: var(--sf-font-heading);
  font-size: clamp(2.25rem, 7vw, 5.25rem);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.03em;
  overflow-wrap: anywhere;
}

:root[data-sf-template="dark-luxury"] .lux-hero__muted {
  color: var(--lux-dim);
}

:root[data-sf-template="dark-luxury"] .lux-hero__bright {
  color: var(--sf-text);
}

:root[data-sf-template="dark-luxury"] .lux-hero__welcome {
  margin: 1.25rem 0 0;
  max-width: 56ch;
  font-size: 1rem;
  line-height: 1.65;
  color: var(--sf-muted);
}

:root[data-sf-template="dark-luxury"] .lux-welcome {
  margin: 0 0 1rem;
  font-size: 0.95rem;
  line-height: 1.65;
  color: var(--sf-muted);
}

/* ── Footer: a rounded elevated panel on the page, never flush ──────── */

:root[data-sf-template="dark-luxury"] .lux-footer-wrap {
  margin-top: auto;
  padding: 1.5rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
}

:root[data-sf-template="dark-luxury"] .lux-footer {
  max-width: 1200px;
  margin: 0 auto;
  padding: clamp(1.5rem, 5vw, 3rem) clamp(1.25rem, 5vw, 3rem) 1.25rem;
  border-radius: 20px;
  background: color-mix(in srgb, var(--sf-surface) 88%, var(--sf-bg));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--sf-text) 6%, transparent);
}

:root[data-sf-template="dark-luxury"] .lux-footer--compact {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  padding: 1rem 1.25rem;
}

:root[data-sf-template="dark-luxury"] .lux-footer__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
}

@media (min-width: 48em) {
  :root[data-sf-template="dark-luxury"] .lux-footer__grid {
    grid-template-columns: 2fr 1fr 1fr;
  }
}

:root[data-sf-template="dark-luxury"] .lux-footer__tagline {
  margin: 0.75rem 0 0;
  max-width: 36ch;
  font-size: 0.9rem;
  line-height: 1.65;
  color: var(--sf-muted);
}

:root[data-sf-template="dark-luxury"] .lux-footer__head {
  margin: 0 0 0.5rem;
  font-family: var(--sf-font-mono);
  font-size: 13px;
  font-weight: 400;
  letter-spacing: 0.06em;
  color: var(--sf-primary);
}

:root[data-sf-template="dark-luxury"] .lux-footer__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

:root[data-sf-template="dark-luxury"] .lux-footer__link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: var(--sf-muted);
  text-decoration: none;
  transition: color 150ms ease;
}

:root[data-sf-template="dark-luxury"] .lux-footer__link:hover {
  color: var(--sf-text);
}

:root[data-sf-template="dark-luxury"] .lux-footer__link:focus-visible {
  outline: 2px solid var(--sf-primary);
  outline-offset: 2px;
  border-radius: 4px;
}

/* ContactLinks chips are ~32px tall by default; inside the footer they must reach 44. */
:root[data-sf-template="dark-luxury"] [data-sf-slot="Footer"] a {
  min-height: 44px;
}

:root[data-sf-template="dark-luxury"] .lux-footer__base {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.5rem;
  margin-top: 2rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--lux-border-subtle);
}

:root[data-sf-template="dark-luxury"] .lux-footer__meta {
  font-family: var(--sf-font-mono);
  font-size: 12px;
  color: var(--lux-dim);
}

:root[data-sf-template="dark-luxury"] .lux-status {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-family: var(--sf-font-mono);
  font-size: 12px;
  letter-spacing: 0.04em;
}

:root[data-sf-template="dark-luxury"] .lux-status[data-state="open"] {
  color: var(--sf-success);
}

:root[data-sf-template="dark-luxury"] .lux-status[data-state="paused"] {
  color: var(--sf-warn);
}

:root[data-sf-template="dark-luxury"] .lux-status__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 8px currentColor;
}

/* ── Motion (only when welcome) ─────────────────────────────────────── */

@media (prefers-reduced-motion: no-preference) {
  :root[data-sf-template="dark-luxury"] [data-sf-cta="main"]:not(:disabled):not([data-disabled]) {
    animation: sf-lux-pulse 2.8s ease-in-out infinite;
  }
}

@media (prefers-reduced-motion: no-preference) and (min-width: 62em) {
  :root[data-sf-template="dark-luxury"] .lux-orb {
    animation: sf-lux-orb 8s ease-in-out infinite alternate;
  }
}

@keyframes sf-lux-pulse {
  0%, 100% { box-shadow: var(--lux-glow); }
  50% { box-shadow: var(--lux-glow-mid); }
}

@keyframes sf-lux-orb {
  from { opacity: 0.8; transform: translateX(-50%) scale(1); }
  to { opacity: 1; transform: translateX(-50%) scale(1.08); }
}
```

- [ ] **Step 4: Run the tests and look at it**

Run: `npm run test:web -- template-dark-luxury` → PASS. Run: `npm run typecheck` → clean. Then run the app against the mocks: `npm run test:e2e -- templates.spec.ts -g modern` (sanity — modern unaffected) and eyeball luxury by temporarily running the Task 7 decor spec once it exists; until then a quick manual check via `npm run dev:web` with a local backend set to `template: 'dark-luxury'` is optional.

- [ ] **Step 5: Commit**

```bash
git add web/src/templates/dark-luxury/template.css web/test/template-dark-luxury.test.tsx
git commit -m "feat(templates): dark-luxury stylesheet — glow buttons, raised cards, grain, orb, footer panel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Cyber Brutalism manifest, locks and readout helpers

**Files:**
- Create: `web/src/templates/cyber-brutalism/manifest.ts`, `web/src/templates/cyber-brutalism/index.ts`, `web/src/templates/cyber-brutalism/template.css`, `web/src/templates/cyber-brutalism/slots/readout.ts`
- Test: `web/test/template-cyber-brutalism.test.tsx`

**Interfaces:**
- Consumes: same as Task 1.
- Produces: the `cyber-brutalism` manifest; `DEFAULT_NODE = 'NODE_01'`, `NODE_MAX = 24`, `nodeName(value: boolean | string | undefined): string`, `interface ReadoutInput { productCount: number | null; cutoff: string | null; accepting: boolean }`, `readoutLines(input): string[]`.

- [ ] **Step 1: Write the failing tests**

`web/test/template-cyber-brutalism.test.tsx` (grows in Tasks 5 and 6):

```tsx
import { describe, expect, it } from 'vitest';
import manifest from '@/templates/cyber-brutalism/manifest.ts';
import { validateManifest } from '@/templates/define.ts';
import { allTemplates, getTemplate, lookupManifest } from '@/templates/registry.ts';
import { resolveTheme } from '@/templates/resolve.ts';
import { DEFAULT_NODE, nodeName, readoutLines } from '@/templates/cyber-brutalism/slots/readout.ts';
import type { Theme } from '@/types/settings.ts';

describe('cyber-brutalism manifest', () => {
  it('is a valid contract-1 manifest discovered as a built-in', () => {
    expect(validateManifest(manifest, 'cyber-brutalism')).toEqual([]);
    expect(allTemplates().map((t) => t.manifest.id)).toContain('cyber-brutalism');
    expect(getTemplate('cyber-brutalism').builtIn).toBe(true);
  });

  it('ships Acid Dark (default) and Purple Light', () => {
    expect(manifest.schemes).toEqual(['dark', 'light']);
    expect(manifest.defaultPreset).toBe('acid-dark');
    const [dark, light] = manifest.presets;
    expect(dark).toMatchObject({ id: 'acid-dark', scheme: 'dark', radius: 'none' });
    expect(dark!.colors).toMatchObject({ primary: '#d4ff00', bg: '#0d0d0d', surface: '#1a1a1a', text: '#ffffff' });
    expect(light).toMatchObject({ id: 'purple-light', scheme: 'light', radius: 'none' });
    expect(light!.colors).toMatchObject({ primary: '#6b3ff6', bg: '#f4f4ee', surface: '#e8e8e2', text: '#111111' });
    expect(dark!.fonts).toEqual({
      heading: { family: 'Tektur', weights: [400, 600, 700, 900] },
      body: { family: 'Tektur', weights: [400, 600, 700, 900] },
      mono: { family: 'Share Tech Mono', weights: [400] },
    });
  });

  it('is square, flat and numbered', () => {
    expect(manifest.tokens.button).toMatchObject({ radius: 0, fill: 'solid', transform: 'uppercase', font: 'heading' });
    expect(manifest.tokens.card).toMatchObject({ radius: 0, shadow: 'none', shadowHover: 'none' });
    expect(manifest.tokens.badge.radius).toBe(0);
    expect(manifest.tokens.glass).toBe('off');
    expect(manifest.tokens.label.style).toBe('numbered');
    expect(manifest.tokens.heading.transform).toBe('uppercase');
  });
});

describe('cyber-brutalism locks', () => {
  const light = manifest.presets[1]!;
  const stored: Theme = {
    template: 'cyber-brutalism', preset: 'purple-light', options: { nodeLabel: 'LDN_02' },
    scheme: 'light', colors: light.colors,
    fonts: { heading: 'Inter', body: 'Inter', mono: null },
    radius: 'xl', density: 'compact', customCss: '',
  };

  it('forces radius none and the template fonts, keeps the light scheme and density', () => {
    const r = resolveTheme(stored, lookupManifest);
    expect(r.radius).toBe('none');
    expect(r.scheme).toBe('light');
    expect(r.fonts.heading?.family).toBe('Tektur');
    expect(r.fonts.mono).toEqual({ family: 'Share Tech Mono', weights: [400] });
    expect(r.density).toBe('compact');
    expect(r.options).toEqual({ systemBar: true, statusBar: true, crosshairs: true, nodeLabel: 'LDN_02' });
  });
});

describe('readout helpers', () => {
  it('nodeName trims, clamps to 24 and falls back', () => {
    expect(nodeName('  LDN_02 ')).toBe('LDN_02');
    expect(nodeName('')).toBe(DEFAULT_NODE);
    expect(nodeName('   ')).toBe(DEFAULT_NODE);
    expect(nodeName(undefined)).toBe(DEFAULT_NODE);
    expect(nodeName(true)).toBe(DEFAULT_NODE);
    expect(nodeName('X'.repeat(100))).toBe('X'.repeat(24));
  });

  it('readoutLines reports real data, cut-off first when there is one', () => {
    expect(readoutLines({ productCount: 128, cutoff: '16:00', accepting: true })).toEqual(['DISPATCH CUTOFF 16:00', 'ITEMS 128', 'ORDERING ONLINE']);
    expect(readoutLines({ productCount: null, cutoff: null, accepting: false })).toEqual(['ITEMS ---', 'ORDERING PAUSED']);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm run test:web -- template-cyber-brutalism` → FAIL (module missing).

- [ ] **Step 3: Create the manifest**

`web/src/templates/cyber-brutalism/manifest.ts`:

```ts
import { BASE_TOKENS, COLOR_KEYS, defineTemplate } from '@/templates/define.ts';

const TEKTUR = { family: 'Tektur', weights: [400, 600, 700, 900] };
const FONTS = { heading: TEKTUR, body: TEKTUR, mono: { family: 'Share Tech Mono', weights: [400] } };

export default defineTemplate({
  contractVersion: 1,
  id: 'cyber-brutalism',
  name: 'Cyber Brutalism',
  version: '1.0.0',
  description: 'A live system, not a brochure: heavy uppercase type on a hard grid, mono readouts of real store data, one acid accent, zero radius, 1px borders.',
  author: 'Kratos Bots',
  schemes: ['dark', 'light'],
  presets: [
    {
      id: 'acid-dark', name: 'Acid Dark', scheme: 'dark', radius: 'none', fonts: FONTS,
      colors: { primary: '#d4ff00', bg: '#0d0d0d', surface: '#1a1a1a', text: '#ffffff', muted: '#8a8a8a', success: '#00ff88', warn: '#ffb800', danger: '#ff3b30' },
    },
    {
      id: 'purple-light', name: 'Purple Light', scheme: 'light', radius: 'none', fonts: FONTS,
      colors: { primary: '#6b3ff6', bg: '#f4f4ee', surface: '#e8e8e2', text: '#111111', muted: '#5f5f5a', success: '#00a35c', warn: '#b37400', danger: '#d0021b' },
    },
  ],
  defaultPreset: 'acid-dark',
  tokens: {
    ...BASE_TOKENS,
    button: { radius: 0, fill: 'solid', transform: 'uppercase', tracking: { sm: '0.04em', md: '0.04em', lg: '0.04em' }, weight: 600, font: 'heading' },
    card: { radius: 0, border: '1px solid var(--sf-line)', shadow: 'none', shadowHover: 'none' },
    heading: { weight: 700, tracking: '-0.02em', transform: 'uppercase' },
    label: { style: 'numbered' },
    input: { style: 'underline' },
    chassis: 'flat',
    glass: 'off', // no frosted chrome: Plan 2's shared rules paint .glass bars and Mantine overlays solid
    badge: { radius: 0 },
  },
  editable: { colors: [...COLOR_KEYS], fonts: false, radius: false, density: true },
  options: [
    { key: 'systemBar', type: 'boolean', label: 'System bar', help: 'SYS.TIME / NODE / SKU strip above the header.', default: true },
    { key: 'statusBar', type: 'boolean', label: 'Bottom status bar', help: '"CONNECTION SECURE · ACCESS GRANTED" strip at the foot of the page. Gives way to the cart bar on phones.', default: true },
    { key: 'crosshairs', type: 'boolean', label: 'Crosshair marks', help: '+ marks at the hero, footer and screen corners (hidden on small phones).', default: true },
    { key: 'nodeLabel', type: 'text', label: 'Node label', help: 'Shown as NODE: … in the system bar and footer.', default: 'NODE_01', maxLength: 24 },
  ],
});
```

- [ ] **Step 4: Readout helpers, index, CSS placeholder**

`web/src/templates/cyber-brutalism/slots/readout.ts`:

```ts
export const DEFAULT_NODE = 'NODE_01';
export const NODE_MAX = 24;

/** The admin's node label, trimmed and clamped; anything unusable reads as NODE_01. */
export function nodeName(value: boolean | string | undefined): string {
  if (typeof value !== 'string') return DEFAULT_NODE;
  const v = value.trim();
  return v ? v.slice(0, NODE_MAX) : DEFAULT_NODE;
}

export interface ReadoutInput { productCount: number | null; cutoff: string | null; accepting: boolean }

/** Terminal readout lines — real store data only, no invented metrics. */
export function readoutLines({ productCount, cutoff, accepting }: ReadoutInput): string[] {
  const lines: string[] = [];
  if (cutoff) lines.push(`DISPATCH CUTOFF ${cutoff}`);
  lines.push(`ITEMS ${productCount ?? '---'}`);
  lines.push(`ORDERING ${accepting ? 'ONLINE' : 'PAUSED'}`);
  return lines;
}
```

`web/src/templates/cyber-brutalism/index.ts`:

```ts
import './template.css';
import type { TemplateSlots } from '@/templates/contract.ts';

export const slots: TemplateSlots = {};
```

`web/src/templates/cyber-brutalism/template.css`:

```css
/* Cyber Brutalism — filled in by Task 6. Every rule scoped under :root[data-sf-template="cyber-brutalism"]. */
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:web -- template-cyber-brutalism templates-registry` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add web/src/templates/cyber-brutalism web/test/template-cyber-brutalism.test.tsx
git commit -m "feat(templates): cyber-brutalism manifest, presets, locks and readout helpers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Cyber Brutalism slots (frontend-design subagent, loads `cyber-brutalism-design`)

**Files:**
- Create: `web/src/templates/cyber-brutalism/slots/Crosshairs.tsx`, `CyberTopBar.tsx`, `CyberOverlay.tsx`, `CyberCatalogHero.tsx`, `CyberFooter.tsx`, `CyberButtonAdornment.tsx`
- Modify: `web/src/templates/cyber-brutalism/index.ts`
- Test: `web/test/template-cyber-brutalism.test.tsx` (append)

**Interfaces:**
- Consumes: `TopBarProps`, `OverlayProps`, `CatalogHeroProps`, `FooterProps`, `ButtonAdornmentProps`, `SlotBaseProps`, `OptionValues`, `useServerClock`, `useCutoffInfo`, `useCatalogStats`, `useOrderingState`, `useMobileCartBar`, `formatClock`, `utcOffsetLabel`, `Brand`, `ContactLinks` (`@/templates/contract.ts`); `nodeName`, `readoutLines`.
- Produces: `CORNERS`, `Crosshairs`, `CyberTopBar`, `CyberOverlay`, `CyberCatalogHero`, `CyberFooter`, `CyberButtonAdornment`; DOM hooks used by Tasks 6 and 7: `.cb-sysbar[data-cb="sysbar"]`, `.cb-sysbar__time`, `.cb-sysbar__sep`, `.cb-sysbar__end`, `[data-cb-wide]`, `.cb-frame[data-cb="frame"]`, `.cb-cross[data-at]`, `.cb-hero`, `.cb-hero__scn`, `.cb-hero__name`, `.cb-hero__tagline`, `.cb-hero__welcome`, `.cb-hero__line`, `.cb-hero-compact`, `.cb-readout`, `.cb-readout--inline`, `.cb-cursor`, `.cb-footer`, `.cb-footer--compact`, `.cb-hazard`, `.cb-rule`, `.cb-footer__inner`, `.cb-footer__eyebrow`, `.cb-footer__tagline`, `.cb-footer__list`, `.cb-footer__link`, `.cb-footer__nodes`, `.cb-status[data-cb="status"]`, `.cb-status__dot`, `.cb-arrow[data-cta]`.

- [ ] **Step 1: Append the failing slot tests**

At the top of `web/test/template-cyber-brutalism.test.tsx`, replace the first import line with:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { DayKey, StorefrontSettings } from '@/types/settings.ts';
import type { OptionValues, SlotBaseProps } from '@/templates/contract.ts';

const h = vi.hoisted(() => ({
  settings: {} as StorefrontSettings,
  bar: false,
  stats: { productCount: 128 as number | null, categoryCount: 6 as number | null },
}));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));
vi.mock('@/templates/contract.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/templates/contract.ts')>()),
  useMobileCartBar: () => h.bar,
  useCatalogStats: () => h.stats,
}));

import { CyberTopBar } from '@/templates/cyber-brutalism/slots/CyberTopBar.tsx';
import { CyberOverlay } from '@/templates/cyber-brutalism/slots/CyberOverlay.tsx';
import { CyberCatalogHero } from '@/templates/cyber-brutalism/slots/CyberCatalogHero.tsx';
import { CyberFooter } from '@/templates/cyber-brutalism/slots/CyberFooter.tsx';
import { CyberButtonAdornment } from '@/templates/cyber-brutalism/slots/CyberButtonAdornment.tsx';
```

(keep the Task 4 imports). Append:

```tsx
const DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function settings(over: { ordering?: boolean; cutoffsOn?: boolean } = {}): StorefrontSettings {
  return {
    enabled: true,
    serverTime: '2026-08-24T09:05:07.000Z',
    cutoffs: { timezone: 'UTC', days: Object.fromEntries(DAYS.map((d) => [d, { enabled: over.cutoffsOn ?? false, cutoff: '16:00', shipsOn: 'same day' }])) },
    brand: { name: 'Voltline', shortName: 'Voltline', tagline: 'Parts for the grid', title: 'Voltline', description: '', logoUrl: null, faviconUrl: null, logoHeight: 28, links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront', ordering: over.ordering ?? true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
    supportLinks: [],
    welcomeMessage: null,
    currency: 'GBP',
  } as unknown as StorefrontSettings;
}

const DEFAULTS: OptionValues = Object.fromEntries(manifest.options.map((o) => [o.key, o.default]));
function base(options: OptionValues = {}, over: Partial<SlotBaseProps> = {}): SlotBaseProps {
  return { brand: h.settings.brand, options: { ...DEFAULTS, ...options }, scheme: 'dark', layout: 'storefront', tokens: manifest.tokens, ...over };
}

afterEach(() => { cleanup(); vi.useRealTimers(); h.bar = false; h.stats = { productCount: 128, categoryCount: 6 }; });

describe('CyberTopBar', () => {
  it('ticks SYS.TIME every second in the store timezone and shows node + SKU', () => {
    vi.useFakeTimers({ now: new Date('2026-08-24T09:05:07.000Z') });
    h.settings = settings();
    const { container } = render(<CyberTopBar {...base({ nodeLabel: 'LDN_02' })} />);
    expect(container.querySelector('.cb-sysbar__time')).toHaveTextContent('09:05:07');
    expect(container).toHaveTextContent('/ UTC+0');
    expect(container).toHaveTextContent('NODE: LDN_02');
    expect(container).toHaveTextContent('SKU: 128');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(container.querySelector('.cb-sysbar__time')).toHaveTextContent('09:05:08');
  });

  it('marks the offset and SKU as wide-only (hidden under 480px) and shows --- while loading', () => {
    h.settings = settings();
    h.stats = { productCount: null, categoryCount: null };
    const { container } = render(<CyberTopBar {...base()} />);
    const wide = [...container.querySelectorAll('[data-cb-wide]')].map((e) => e.textContent);
    expect(wide).toEqual([expect.stringContaining('UTC'), 'SKU: ---']);
    expect(container).toHaveTextContent('NODE: NODE_01');
  });

  it('renders nothing when the system bar is off', () => {
    h.settings = settings();
    const { container } = render(<CyberTopBar {...base({ systemBar: false })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('CyberOverlay', () => {
  it('draws four corner crosshairs only when crosshairs are on', () => {
    h.settings = settings();
    const { container, rerender } = render(<CyberOverlay {...base()} />);
    expect(container.querySelectorAll('[data-cb="frame"] .cb-cross')).toHaveLength(4);
    rerender(<CyberOverlay {...base({ crosshairs: false })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('CyberCatalogHero', () => {
  const hero = { tagline: 'Parts for the grid', welcomeMessage: 'Same-day dispatch.', productCount: 128, categoryCount: 6 };

  it('grid: brand name, tagline, crosshairs and a readout of real data', () => {
    h.settings = settings({ cutoffsOn: true });
    const { container } = render(<CyberCatalogHero {...base()} surface="grid" {...hero} />);
    expect(container.querySelector('.cb-hero__name')).toHaveTextContent('Voltline');
    expect(container.querySelector('.cb-hero__tagline')).toHaveTextContent('Parts for the grid');
    expect(container.querySelectorAll('.cb-hero .cb-cross')).toHaveLength(4);
    const lines = [...container.querySelectorAll('.cb-readout li')].map((li) => li.textContent);
    expect(lines).toEqual(['> DISPATCH CUTOFF 16:00', '> ITEMS 128', '> ORDERING ONLINE']);
    expect(container.querySelector('.cb-readout li:last-child')).toHaveClass('cb-cursor');
    expect(screen.queryByRole('heading')).toBeNull(); // the page h1 stays the only heading
  });

  it('reports ORDERING PAUSED for a catalogue-only store; no crosshairs when off', () => {
    h.settings = settings({ ordering: false });
    const { container } = render(<CyberCatalogHero {...base({ crosshairs: false })} surface="grid" {...hero} />);
    expect(container).toHaveTextContent('> ORDERING PAUSED');
    expect(container).not.toHaveTextContent('DISPATCH CUTOFF');
    expect(container.querySelector('.cb-cross')).toBeNull();
  });

  it('list surface: a one-line readout plus the welcome', () => {
    h.settings = settings();
    const { container } = render(<CyberCatalogHero {...base()} surface="list" {...hero} />);
    expect(container.querySelector('.cb-hero')).toBeNull();
    expect(container.querySelector('.cb-readout--inline')).toHaveTextContent('> ITEMS 128');
    expect(screen.getByText('Same-day dispatch.')).toBeInTheDocument();
  });
});

describe('CyberFooter', () => {
  const links = [{ label: 'Shipping', url: 'https://example.com/shipping' }];

  it('storefront dark: hazard stripe, numbered columns, node row and the status strip', () => {
    h.settings = settings();
    const { container } = render(<CyberFooter {...base({ nodeLabel: 'LDN_02' })} supportLinks={links} hasChat={false} />);
    expect(container.querySelector('.cb-hazard')).toBeInTheDocument();
    expect(container.querySelector('.cb-rule')).toBeNull();
    expect(screen.getByRole('heading', { name: '/02 Support' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shipping' })).toHaveAttribute('href', 'https://example.com/shipping');
    expect(container.querySelector('.cb-footer__nodes')).toHaveTextContent('LDN_02');
    expect(container.querySelector('[data-cb="status"]')).toHaveTextContent('CONNECTION SECURE');
  });

  it('light scheme swaps the hazard stripe for a bold rule', () => {
    h.settings = settings();
    const { container } = render(<CyberFooter {...base({}, { scheme: 'light' })} supportLinks={[]} hasChat={false} />);
    expect(container.querySelector('.cb-hazard')).toBeNull();
    expect(container.querySelector('.cb-rule')).toBeInTheDocument();
  });

  it('the status strip gives way to the phone cart bar, and to the option', () => {
    h.settings = settings();
    h.bar = true;
    const { container, rerender } = render(<CyberFooter {...base()} supportLinks={[]} hasChat={false} />);
    expect(container.querySelector('[data-cb="status"]')).toBeNull();
    h.bar = false;
    rerender(<CyberFooter {...base({ statusBar: false })} supportLinks={[]} hasChat={false} />);
    expect(container.querySelector('[data-cb="status"]')).toBeNull();
  });

  it('menu layout: only the status strip, or nothing', () => {
    h.settings = settings();
    const { container, rerender } = render(<CyberFooter {...base({}, { layout: 'menu' })} supportLinks={links} hasChat={false} />);
    expect(container.querySelector('.cb-footer--compact [data-cb="status"]')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Shipping' })).toBeNull();
    rerender(<CyberFooter {...base({ statusBar: false }, { layout: 'menu' })} supportLinks={links} hasChat={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('CyberButtonAdornment', () => {
  it('adds ↗ to primary buttons only, flagged for the main CTA', () => {
    h.settings = settings();
    const { container, rerender } = render(<CyberButtonAdornment {...base()} variant="primary" cta />);
    expect(container.querySelector('svg.cb-arrow')).toHaveAttribute('data-cta', 'true');
    rerender(<CyberButtonAdornment {...base()} variant="primary" cta={false} />);
    expect(container.querySelector('svg.cb-arrow')).toHaveAttribute('data-cta', 'false');
    rerender(<CyberButtonAdornment {...base()} variant="secondary" cta={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm run test:web -- template-cyber-brutalism` → FAIL (slot modules missing).

- [ ] **Step 3: Write the slots**

`web/src/templates/cyber-brutalism/slots/Crosshairs.tsx`:

```tsx
export const CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

/** `+` marks at the four corners of the nearest positioned ancestor (hidden under 480px). */
export function Crosshairs() {
  return (
    <>
      {CORNERS.map((c) => <span key={c} className="cb-cross" data-at={c} aria-hidden />)}
    </>
  );
}
```

`web/src/templates/cyber-brutalism/slots/CyberTopBar.tsx`:

```tsx
import { formatClock, useCatalogStats, useCutoffInfo, useServerClock, utcOffsetLabel, type TopBarProps } from '@/templates/contract.ts';
import { nodeName } from './readout.ts';

function SystemBar({ node }: { node: string }) {
  const now = useServerClock(1000);
  const { timezone } = useCutoffInfo();
  const { productCount } = useCatalogStats();
  return (
    <div className="cb-sysbar" data-cb="sysbar" aria-hidden>
      <span>
        SYS.TIME <span className="cb-sysbar__time">{formatClock(now, timezone)}</span>
        <span data-cb-wide> / {utcOffsetLabel(now, timezone)}</span>
      </span>
      <span className="cb-sysbar__sep">·</span>
      <span>NODE: {node}</span>
      <span className="cb-sysbar__end" data-cb-wide>SKU: {productCount ?? '---'}</span>
    </div>
  );
}

/**
 * The live-system strip above the header: the server's clock in the store's cut-off
 * timezone, the node label, the real catalogue size. Decorative for assistive tech
 * (it would announce every second), so the whole strip is aria-hidden.
 */
export function CyberTopBar({ options }: TopBarProps) {
  if (options.systemBar !== true) return null;
  return <SystemBar node={nodeName(options.nodeLabel)} />;
}
```

`web/src/templates/cyber-brutalism/slots/CyberOverlay.tsx`:

```tsx
import type { OverlayProps } from '@/templates/contract.ts';
import { Crosshairs } from './Crosshairs.tsx';

/** A fixed, tap-transparent frame of corner crosshairs around the viewport. */
export function CyberOverlay({ options }: OverlayProps) {
  if (options.crosshairs !== true) return null;
  return (
    <div className="cb-frame" data-cb="frame" aria-hidden>
      <Crosshairs />
    </div>
  );
}
```

`web/src/templates/cyber-brutalism/slots/CyberCatalogHero.tsx`:

```tsx
import { useCutoffInfo, useOrderingState, type CatalogHeroProps } from '@/templates/contract.ts';
import { Crosshairs } from './Crosshairs.tsx';
import { readoutLines } from './readout.ts';

/**
 * Grid: the brand name as the heavy left-aligned display line (a <p> — the page's
 * <h1> stays the only heading), tagline in the accent, and a terminal readout of real
 * store data. List/wholesale surfaces are dense: a one-line readout and the welcome.
 */
export function CyberCatalogHero({ surface, brand, tagline, welcomeMessage, productCount, options }: CatalogHeroProps) {
  const { accepting } = useOrderingState();
  const { next } = useCutoffInfo();
  const lines = readoutLines({ productCount, cutoff: next?.cutoff ?? null, accepting });

  if (surface !== 'grid') {
    return (
      <div className="cb-hero-compact">
        <ul className="cb-readout cb-readout--inline" aria-label="Store status">
          {lines.map((l) => <li key={l}>&gt; {l}</li>)}
        </ul>
        {welcomeMessage ? <p className="cb-hero__welcome">{welcomeMessage}</p> : null}
      </div>
    );
  }

  return (
    <section className="cb-hero" aria-label="About this shop" data-sf-part="hero">
      {options.crosshairs === true ? <Crosshairs /> : null}
      <div className="cb-hero__main">
        <p className="cb-hero__scn" aria-hidden>//SCN_01</p>
        <p className="cb-hero__name cb-hero__line">{brand.name}</p>
        {tagline ? <p className="cb-hero__tagline cb-hero__line">{tagline}</p> : null}
        {welcomeMessage ? <p className="cb-hero__welcome">{welcomeMessage}</p> : null}
      </div>
      <ul className="cb-readout" aria-label="Store status">
        {lines.map((l, i) => (
          <li key={l} className={i === lines.length - 1 ? 'cb-cursor' : undefined}>&gt; {l}</li>
        ))}
      </ul>
    </section>
  );
}
```

`web/src/templates/cyber-brutalism/slots/CyberFooter.tsx`:

```tsx
import { ArrowUpRightIcon, Brand, ContactLinks, useMobileCartBar, type FooterProps } from '@/templates/contract.ts';
import { Crosshairs } from './Crosshairs.tsx';
import { nodeName } from './readout.ts';

function StatusStrip() {
  return (
    <div className="cb-status" data-cb="status" aria-hidden>
      <span><span className="cb-status__dot" />CONNECTION SECURE</span>
      <span className="cb-status__fill" data-cb-wide>· · · · · · · · · · · ·</span>
      <span>&gt; ACCESS GRANTED_</span>
    </div>
  );
}

/**
 * Hazard stripe (dark) or a bold rule (light), a numbered mono grid, the node row, and
 * the bottom status strip in normal flow — which steps aside while the phone cart bar
 * is showing (the cart bar is restyled as the same strip in template.css). The menu
 * layout keeps only the strip.
 */
export function CyberFooter({ brand, layout, supportLinks, hasChat, options, scheme }: FooterProps) {
  const barShowing = useMobileCartBar();
  const status = options.statusBar === true && !barShowing ? <StatusStrip /> : null;

  if (layout !== 'storefront') {
    return status ? <footer className="cb-footer cb-footer--compact" data-sf-part="footer">{status}</footer> : null;
  }

  let n = 0;
  const eyebrow = () => `/${String(++n).padStart(2, '0')}`;

  return (
    <footer className="cb-footer" data-sf-part="footer">
      {scheme === 'dark' ? <div className="cb-hazard" aria-hidden /> : <div className="cb-rule" aria-hidden />}
      <div className="cb-footer__inner">
        {options.crosshairs === true ? <Crosshairs /> : null}

        <div>
          <p className="cb-footer__eyebrow">{eyebrow()}</p>
          <Brand size="sm" />
          {brand.tagline ? <p className="cb-footer__tagline">{brand.tagline}</p> : null}
        </div>

        {supportLinks.length > 0 ? (
          <nav aria-label="Support">
            <h2 className="cb-footer__eyebrow">{eyebrow()} Support</h2>
            <ul className="cb-footer__list">
              {supportLinks.map((link) => (
                <li key={link.url}>
                  <a className="cb-footer__link" href={link.url} target="_blank" rel="noopener noreferrer">
                    {link.label}
                    <ArrowUpRightIcon size="1em" />
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {hasChat ? (
          <div>
            <h2 className="cb-footer__eyebrow">{eyebrow()} Contact</h2>
            <ContactLinks />
          </div>
        ) : null}

        <p className="cb-footer__nodes" aria-hidden>
          <span>{brand.name}</span>
          <span>●</span>
          <span>{nodeName(options.nodeLabel)}</span>
          <span>+</span>
          <span>{new Date().getFullYear()}</span>
        </p>
      </div>
      {status}
    </footer>
  );
}
```

`web/src/templates/cyber-brutalism/slots/CyberButtonAdornment.tsx`:

```tsx
import { ArrowUpRightIcon, type ButtonAdornmentProps } from '@/templates/contract.ts';

/** ↗ on primary buttons. Grid add-to-cart buttons (cta=false) drop it under 768px. */
export function CyberButtonAdornment({ variant, cta }: ButtonAdornmentProps) {
  if (variant !== 'primary') return null;
  return <ArrowUpRightIcon size="1em" className="cb-arrow" data-cta={cta ? 'true' : 'false'} />;
}
```

`web/src/templates/cyber-brutalism/index.ts`:

```ts
import './template.css';
import type { TemplateSlots } from '@/templates/contract.ts';
import { CyberButtonAdornment } from './slots/CyberButtonAdornment.tsx';
import { CyberCatalogHero } from './slots/CyberCatalogHero.tsx';
import { CyberFooter } from './slots/CyberFooter.tsx';
import { CyberOverlay } from './slots/CyberOverlay.tsx';
import { CyberTopBar } from './slots/CyberTopBar.tsx';

// SectionLabel is the default: tokens.label.style = 'numbered' renders /01, /02 …
export const slots: TemplateSlots = {
  TopBar: CyberTopBar,
  Overlay: CyberOverlay,
  CatalogHero: CyberCatalogHero,
  Footer: CyberFooter,
  ButtonAdornment: CyberButtonAdornment,
};
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:web -- template-cyber-brutalism template-imports` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/templates/cyber-brutalism web/test/template-cyber-brutalism.test.tsx
git commit -m "feat(templates): cyber-brutalism system bar, hero readout, footer, status strip, arrows

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Cyber Brutalism stylesheet (frontend-design subagent, loads `cyber-brutalism-design`)

**Files:**
- Modify: `web/src/templates/cyber-brutalism/template.css`
- Test: `web/test/template-cyber-brutalism.test.tsx` (append)

**Interfaces:**
- Consumes: `cssRules`, `splitSelectors`, `readFromTest`; Plan 2 parts/tokens/root attributes; Task 5 class names. Blur removal is not in this stylesheet: the manifest's `tokens.glass: 'off'` sets `data-sf-glass="off"`, and Plan 2's shared `chassis.css` rules make `.glass`/`.glass-soft` bars and `.mantine-Overlay-root` solid.
- Produces: the finished brutalist look, including the cart-bar merge.

- [ ] **Step 1: Append the failing CSS tests**

Add `import { cssRules, readFromTest, splitSelectors } from './helpers/css-rules.ts';` to the imports, then append:

```tsx
describe('cyber-brutalism template.css', () => {
  const css = readFromTest('../src/templates/cyber-brutalism/template.css');
  const rules = cssRules(css);
  const ROOT = ':root[data-sf-template="cyber-brutalism"]';
  const find = (sel: string, atRule: string | null = null) => rules.find((r) => r.selector === sel && r.atRule === atRule);

  it('scopes every selector under the template root', () => {
    expect(rules.length).toBeGreaterThan(40);
    for (const r of rules) for (const s of splitSelectors(r.selector)) expect(s.startsWith(ROOT), s).toBe(true);
  });

  it('has zero radius everywhere except the round status dot', () => {
    for (const r of rules) {
      for (const m of r.body.matchAll(/border-radius:\s*([^;]+);/g)) {
        if (r.selector.includes('.cb-status__dot')) continue;
        expect(m[1]!.trim(), r.selector).toBe('0');
      }
    }
  });

  it('casts no shadows and blurs nothing', () => {
    for (const r of rules) {
      for (const m of r.body.matchAll(/box-shadow:\s*([^;]+);/g)) expect(m[1]!.trim(), r.selector).toBe('none');
      for (const m of r.body.matchAll(/backdrop-filter:\s*([^;]+);/g)) expect(m[1]!.trim(), r.selector).toBe('none');
    }
    // blur removal itself comes from tokens.glass = 'off' (asserted in the manifest test) — the stylesheet
    // must not re-target the glass classes
    expect(css).not.toMatch(/\.glass|\.mantine-Overlay-root/);
  });

  it('runs every animation only when motion is welcome', () => {
    for (const r of rules) {
      const m = /animation:\s*([^;]+);/.exec(r.body);
      if (m && m[1]!.trim() !== 'none') expect(r.atRule ?? '', r.selector).toContain('prefers-reduced-motion: no-preference');
    }
  });

  it('collapses the wide system readouts under 480px and keeps the bar one line', () => {
    const narrow = rules.filter((r) => r.atRule?.includes('max-width: 29.99em'));
    expect(narrow.some((r) => r.selector.includes('[data-cb-wide]') && r.body.includes('display: none'))).toBe(true);
    expect(narrow.some((r) => r.selector.includes('.cb-cross') && r.body.includes('display: none'))).toBe(true);
    const bar = find(`${ROOT} .cb-sysbar`)!;
    expect(bar.body).toContain('white-space: nowrap');
    expect(bar.body).toContain('overflow: hidden');
  });

  it('restyles the phone cart bar as the status strip, ink-and-acid in light mode', () => {
    expect(find(`${ROOT} [data-sf-part="cart-bar"]`)!.body).toContain('background: var(--cb-bar-bg)');
    const light = find(`${ROOT}[data-mantine-color-scheme="light"]`)!;
    expect(light.body).toContain('--cb-bar-bg: #111111');
    expect(light.body).toContain('--cb-bar-fg: var(--cb-signal)');
  });

  it('keeps overlays tap-transparent and footer links 44px tall', () => {
    expect(find(`${ROOT} .cb-frame`)!.body).toContain('pointer-events: none');
    expect(find(`${ROOT} .cb-cross`)!.body).toContain('pointer-events: none');
    expect(find(`${ROOT} .cb-footer__link`)!.body).toContain('min-height: 44px');
    expect(find(`${ROOT} [data-sf-slot="Footer"] a`)!.body).toContain('min-height: 44px');
  });

  it('wraps a long brand name instead of widening the page', () => {
    expect(find(`${ROOT} .cb-hero__name`)!.body).toContain('overflow-wrap: anywhere');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm run test:web -- template-cyber-brutalism` → FAIL.

- [ ] **Step 3: Write the stylesheet**

Replace `web/src/templates/cyber-brutalism/template.css` with:

```css
/* Cyber Brutalism — strict grid, heavy uppercase Tektur, Share Tech Mono readouts, one
   acid accent, zero radius, 1px borders, no shadows, no blur, no gradients (the footer
   hazard stripe is the one sanctioned exception). Brief: designs/cyber-brutalism/DESIGN.md
   + the cyber-brutalism-design skill. Every rule is scoped under
   :root[data-sf-template="cyber-brutalism"]; keyframes are prefixed sf-cb-; animations
   live only inside prefers-reduced-motion: no-preference. */

:root[data-sf-template="cyber-brutalism"] {
  --cb-ink: #000000;
  --cb-signal: #d4ff00;
  --cb-on-accent: #000000;
  --cb-bar-bg: var(--sf-primary);
  --cb-bar-fg: #000000;
  --cb-bar-btn-bg: var(--cb-ink);
  --cb-bar-btn-fg: var(--sf-primary);
  --cb-footer-bg: #000000;
  --cb-pad-start: max(1rem, env(safe-area-inset-left, 0px));
  --cb-pad-end: max(1rem, env(safe-area-inset-right, 0px));
}

/* Light mode: the bars are ink with acid signal text (purple on black is illegible at 10px);
   the footer drops from pure black to the lifted surface. */
:root[data-sf-template="cyber-brutalism"][data-mantine-color-scheme="light"] {
  --cb-on-accent: #ffffff;
  --cb-bar-bg: #111111;
  --cb-bar-fg: var(--cb-signal);
  --cb-bar-btn-bg: var(--sf-primary);
  --cb-bar-btn-fg: #ffffff;
  --cb-footer-bg: var(--sf-surface);
}

/* No frosted chrome: the manifest's glass token is 'off', so Plan 2's shared chassis.css rules strip the blur from the frosted
   bars and Mantine overlays. Nothing to do here. */

:root[data-sf-template="cyber-brutalism"] [data-sf-part="header"] {
  border-bottom: 1px solid var(--sf-line);
}

/* ── Type ───────────────────────────────────────────────────────────── */

:root[data-sf-template="cyber-brutalism"] [data-sf-part="page-title"] {
  font-size: clamp(1.75rem, 6vw, 3.5rem);
  line-height: 1;
  overflow-wrap: anywhere;
}

:root[data-sf-template="cyber-brutalism"] [data-sf-part="group-title"] {
  font-family: var(--sf-font-heading);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: -0.01em;
}

:root[data-sf-template="cyber-brutalism"] [data-sf-part="section-label"] {
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--sf-primary);
}

:root[data-sf-template="cyber-brutalism"] [data-sf-part="price"] {
  font-family: var(--sf-font-mono);
  font-variant-numeric: tabular-nums;
}

:root[data-sf-template="cyber-brutalism"] [data-sf-part="badge"] {
  border-radius: 0;
  font-family: var(--sf-font-mono);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

:root[data-sf-template="cyber-brutalism"] [data-sf-part="cutoff"] {
  font-family: var(--sf-font-mono);
}

/* ── Buttons: solid acid, black caps; ghost lifts to the accent ─────── */

:root[data-sf-template="cyber-brutalism"] [data-sf-part="button"] {
  border-radius: 0;
  font-family: var(--sf-font-heading);
}

:root[data-sf-template="cyber-brutalism"] [data-sf-part="button"][data-variant="filled"] {
  background: var(--sf-primary);
  color: var(--cb-on-accent);
  border: 1px solid var(--sf-primary);
  box-shadow: none;
  transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
}

:root[data-sf-template="cyber-brutalism"] [data-sf-part="button"][data-variant="default"] {
  border: 1px solid var(--sf-line-strong);
  transition: border-color 150ms ease, color 150ms ease;
}

:root[data-sf-template="cyber-brutalism"] [data-sf-part="button"]:is(:disabled, [data-disabled]) {
  background: var(--sf-surface);
  color: var(--sf-faint);
  border-color: var(--sf-line);
}

:root[data-sf-template="cyber-brutalism"] [data-sf-part="button"]:focus-visible {
  outline: 1px solid var(--sf-primary);
  outline-offset: 3px;
}

@media (hover: hover) {
  :root[data-sf-template="cyber-brutalism"] [data-sf-part="button"][data-variant="filled"]:hover:not(:disabled):not([data-disabled]) {
    background: color-mix(in srgb, var(--sf-primary) 85%, #000000);
  }
  :root[data-sf-template="cyber-brutalism"] [data-sf-part="button"][data-variant="default"]:hover:not(:disabled):not([data-disabled]) {
    border-color: var(--sf-primary);
    color: var(--sf-primary);
  }
}

:root[data-sf-template="cyber-brutalism"] .cb-arrow {
  flex: none;
  width: 1em;
  height: 1em;
  margin-left: 0.5em;
}

@media (max-width: 47.99em) {
  :root[data-sf-template="cyber-brutalism"] .cb-arrow[data-cta="false"] {
    display: none;
  }
}

/* ── Surfaces: 1px borders, no fill, no shadow ──────────────────────── */

:root[data-sf-template="cyber-brutalism"] [data-sf-part="product-card"],
:root[data-sf-template="cyber-brutalism"] [data-sf-part="card"] {
  border-radius: 0;
  border: 1px solid var(--sf-line);
  box-shadow: none;
}

:root[data-sf-template="cyber-brutalism"] [data-sf-part="product-card"] {
  background: transparent;
}

:root[data-sf-template="cyber-brutalism"] [data-sf-part="sheet"],
:root[data-sf-template="cyber-brutalism"] [data-sf-part="drawer"],
:root[data-sf-template="cyber-brutalism"] [data-sf-part="input"] {
  border-radius: 0;
}

:root[data-sf-template="cyber-brutalism"] [data-sf-part="input"] {
  font-family: var(--sf-font-mono);
}

@media (hover: hover) {
  :root[data-sf-template="cyber-brutalism"] [data-sf-part="product-card"]:hover {
    border-color: var(--sf-primary);
  }
}

@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  :root[data-sf-template="cyber-brutalism"] [data-sf-part="product-card"] {
    transition: border-color 150ms ease, transform 150ms ease;
  }
  :root[data-sf-template="cyber-brutalism"] [data-sf-part="product-card"]:hover {
    transform: translateY(-3px);
  }
}

/* ── The phone cart bar becomes the bottom status strip ─────────────── */

:root[data-sf-template="cyber-brutalism"] [data-sf-part="cart-bar"] {
  background: var(--cb-bar-bg);
  color: var(--cb-bar-fg);
  border-top: 0;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}

:root[data-sf-template="cyber-brutalism"] [data-sf-part="cart-bar"]::before {
  content: "\25CF  CONNECTION SECURE  \00B7  > CART LOADED_";
  display: block;
  padding: 0.35rem var(--cb-pad-end) 0 var(--cb-pad-start);
  font-family: var(--sf-font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.72;
}

:root[data-sf-template="cyber-brutalism"] [data-sf-part="cart-bar"] a:not([data-sf-part="button"]),
:root[data-sf-template="cyber-brutalism"] [data-sf-part="cart-bar"] a:not([data-sf-part="button"]) * {
  color: inherit;
}

:root[data-sf-template="cyber-brutalism"] [data-sf-part="cart-bar"] [data-sf-part="button"],
:root[data-sf-template="cyber-brutalism"] [data-sf-part="cart-bar"] [data-sf-part="button"]:hover:not(:disabled):not([data-disabled]) {
  background: var(--cb-bar-btn-bg);
  color: var(--cb-bar-btn-fg);
  border-color: var(--cb-bar-btn-bg);
}

/* ── System bar ─────────────────────────────────────────────────────── */

:root[data-sf-template="cyber-brutalism"] .cb-sysbar {
  display: flex;
  align-items: center;
  gap: 0.5rem 1rem;
  min-height: 32px;
  padding: 0 var(--cb-pad-end) 0 var(--cb-pad-start);
  border-bottom: 1px solid var(--sf-line);
  background: var(--sf-bg);
  font-family: var(--sf-font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
  color: var(--sf-muted);
  white-space: nowrap;
  overflow: hidden;
}

:root[data-sf-template="cyber-brutalism"] .cb-sysbar__time {
  color: var(--sf-text);
}

:root[data-sf-template="cyber-brutalism"] .cb-sysbar__sep {
  opacity: 0.5;
}

:root[data-sf-template="cyber-brutalism"] .cb-sysbar__end {
  margin-left: auto;
}

/* ── Crosshairs ─────────────────────────────────────────────────────── */

:root[data-sf-template="cyber-brutalism"] .cb-frame {
  position: fixed;
  inset: 12px;
  z-index: 5;
  pointer-events: none;
}

:root[data-sf-template="cyber-brutalism"] .cb-cross {
  position: absolute;
  width: 12px;
  height: 12px;
  color: var(--sf-text);
  opacity: 0.4;
  pointer-events: none;
}

:root[data-sf-template="cyber-brutalism"] .cb-cross::before,
:root[data-sf-template="cyber-brutalism"] .cb-cross::after {
  content: "";
  position: absolute;
  background: currentColor;
}

:root[data-sf-template="cyber-brutalism"] .cb-cross::before {
  top: 0;
  left: 50%;
  width: 1px;
  height: 100%;
  transform: translateX(-50%);
}

:root[data-sf-template="cyber-brutalism"] .cb-cross::after {
  top: 50%;
  left: 0;
  width: 100%;
  height: 1px;
  transform: translateY(-50%);
}

:root[data-sf-template="cyber-brutalism"] .cb-cross[data-at="tl"] { top: -6px; left: -6px; }
:root[data-sf-template="cyber-brutalism"] .cb-cross[data-at="tr"] { top: -6px; right: -6px; }
:root[data-sf-template="cyber-brutalism"] .cb-cross[data-at="bl"] { bottom: -6px; left: -6px; }
:root[data-sf-template="cyber-brutalism"] .cb-cross[data-at="br"] { bottom: -6px; right: -6px; }

/* ── Catalogue hero ─────────────────────────────────────────────────── */

:root[data-sf-template="cyber-brutalism"] .cb-hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.5rem;
  margin: 0 0 1.5rem;
  padding: clamp(1.5rem, 5vw, 3rem) 0 clamp(1.5rem, 4vw, 2.5rem);
  border-top: 1px solid var(--sf-line);
  border-bottom: 1px solid var(--sf-line);
}

@media (min-width: 62em) {
  :root[data-sf-template="cyber-brutalism"] .cb-hero {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }
  :root[data-sf-template="cyber-brutalism"] .cb-readout:not(.cb-readout--inline) {
    text-align: right;
  }
}

:root[data-sf-template="cyber-brutalism"] .cb-hero__main {
  min-width: 0;
}

:root[data-sf-template="cyber-brutalism"] .cb-hero__scn {
  margin: 0 0 0.75rem;
  font-family: var(--sf-font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--sf-muted);
}

:root[data-sf-template="cyber-brutalism"] .cb-hero__name {
  margin: 0;
  font-family: var(--sf-font-heading);
  font-size: clamp(2.25rem, 10vw, 7rem);
  font-weight: 900;
  line-height: 0.92;
  letter-spacing: -0.02em;
  text-transform: uppercase;
  color: var(--sf-text);
  overflow-wrap: anywhere;
}

:root[data-sf-template="cyber-brutalism"] .cb-hero__tagline {
  margin: 1rem 0 0;
  max-width: 48ch;
  font-size: 1rem;
  line-height: 1.65;
  color: var(--sf-primary);
}

:root[data-sf-template="cyber-brutalism"] .cb-hero__welcome {
  margin: 0.75rem 0 0;
  max-width: 60ch;
  line-height: 1.65;
  color: var(--sf-muted);
}

:root[data-sf-template="cyber-brutalism"] .cb-hero-compact {
  margin: 0 0 1rem;
}

:root[data-sf-template="cyber-brutalism"] .cb-readout {
  display: grid;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: var(--sf-font-mono);
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
  color: var(--sf-muted);
}

:root[data-sf-template="cyber-brutalism"] .cb-readout--inline {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
}

:root[data-sf-template="cyber-brutalism"] .cb-cursor::after {
  content: "_";
  color: var(--sf-primary);
}

/* ── Footer ─────────────────────────────────────────────────────────── */

:root[data-sf-template="cyber-brutalism"] .cb-footer {
  margin-top: auto;
  border-top: 1px solid var(--sf-line);
  background: var(--cb-footer-bg);
}

:root[data-sf-template="cyber-brutalism"] .cb-footer--compact {
  border-top: 0;
  background: transparent;
}

:root[data-sf-template="cyber-brutalism"] .cb-hazard {
  height: 12px;
  background: repeating-linear-gradient(-45deg, var(--cb-ink) 0 10px, var(--sf-primary) 10px 20px);
}

:root[data-sf-template="cyber-brutalism"] .cb-rule {
  height: 4px;
  background: var(--sf-text);
}

:root[data-sf-template="cyber-brutalism"] .cb-footer__inner {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2rem;
  max-width: 1280px;
  margin: 0 auto;
  padding: clamp(2rem, 6vw, 4rem) var(--cb-pad-end) 2rem var(--cb-pad-start);
}

@media (min-width: 48em) {
  :root[data-sf-template="cyber-brutalism"] .cb-footer__inner {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

:root[data-sf-template="cyber-brutalism"] .cb-footer__eyebrow {
  margin: 0 0 0.75rem;
  font-family: var(--sf-font-mono);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sf-primary);
}

:root[data-sf-template="cyber-brutalism"] .cb-footer__tagline {
  margin: 0.75rem 0 0;
  max-width: 36ch;
  line-height: 1.65;
  color: var(--sf-muted);
}

:root[data-sf-template="cyber-brutalism"] .cb-footer__list {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--sf-line);
}

:root[data-sf-template="cyber-brutalism"] .cb-footer__list li {
  border-bottom: 1px solid var(--sf-line);
}

:root[data-sf-template="cyber-brutalism"] .cb-footer__link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 44px;
  color: var(--sf-text);
  text-decoration: none;
  font-family: var(--sf-font-heading);
  font-size: 0.875rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  transition: color 150ms ease;
}

:root[data-sf-template="cyber-brutalism"] .cb-footer__link:hover {
  color: var(--sf-primary);
}

:root[data-sf-template="cyber-brutalism"] .cb-footer__link:focus-visible {
  outline: 1px solid var(--sf-primary);
  outline-offset: 2px;
}

/* ContactLinks chips are ~32px tall by default; inside the footer they must reach 44. */
:root[data-sf-template="cyber-brutalism"] [data-sf-slot="Footer"] a {
  min-height: 44px;
  border-radius: 0;
}

:root[data-sf-template="cyber-brutalism"] .cb-footer__nodes {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  margin: 0;
  padding-top: 1.5rem;
  border-top: 1px solid var(--sf-line);
  font-family: var(--sf-font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sf-muted);
}

:root[data-sf-template="cyber-brutalism"] .cb-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 32px;
  padding: 0 var(--cb-pad-end) env(safe-area-inset-bottom, 0px) var(--cb-pad-start);
  background: var(--cb-bar-bg);
  color: var(--cb-bar-fg);
  font-family: var(--sf-font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
}

:root[data-sf-template="cyber-brutalism"] .cb-status__fill {
  flex: 1;
  overflow: hidden;
  text-overflow: clip;
  opacity: 0.6;
}

:root[data-sf-template="cyber-brutalism"] .cb-status__dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 0.5rem;
  border-radius: 50%;
  background: currentColor;
}

/* ── Small phones: collapse the readouts, drop the crosshairs ───────── */

@media (max-width: 29.99em) {
  :root[data-sf-template="cyber-brutalism"] [data-cb-wide] {
    display: none;
  }
  :root[data-sf-template="cyber-brutalism"] .cb-cross {
    display: none;
  }
}

/* ── Motion (only when welcome) ─────────────────────────────────────── */

@media (prefers-reduced-motion: no-preference) {
  :root[data-sf-template="cyber-brutalism"] .cb-hero__line {
    animation: sf-cb-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  :root[data-sf-template="cyber-brutalism"] .cb-hero__line + .cb-hero__line {
    animation-delay: 80ms;
  }
  :root[data-sf-template="cyber-brutalism"] .cb-cursor::after {
    animation: sf-cb-blink 1s step-end infinite;
  }
  :root[data-sf-template="cyber-brutalism"] .cb-status__dot {
    animation: sf-cb-pulse 2s ease infinite;
  }
}

@keyframes sf-cb-up {
  from { opacity: 0; transform: translateY(32px); }
  to { opacity: 1; transform: none; }
}

@keyframes sf-cb-blink {
  50% { opacity: 0; }
}

@keyframes sf-cb-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.75); }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:web -- template-cyber-brutalism` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/templates/cyber-brutalism/template.css web/test/template-cyber-brutalism.test.tsx
git commit -m "feat(templates): cyber-brutalism stylesheet — square grid, acid buttons, status-strip cart bar

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: E2E — matrix cases and template decor checks

**Files:**
- Create: `e2e/template-theme.ts`, `e2e/templates-decor.spec.ts`
- Modify: `e2e/templates.spec.ts` (append to `TEMPLATE_CASES`)

**Interfaces:**
- Consumes: `installMocks`, `Layout`, `InstallMocksOptions` (`e2e/mocks.ts`); `addFirstToCart`, `FIXED_NOW` (`e2e/flows.ts`); `TEMPLATE_CASES` shape `{ template; preset; tapTargets }` (`e2e/templates.spec.ts`); `/templates.json` served by the dev server (Plan 2 Task 9).
- Produces: `presetTheme(page, template, preset, options?)` → a `tweakSettings` function.

- [ ] **Step 1: Add the matrix cases**

In `e2e/templates.spec.ts`, change the `TEMPLATE_CASES` array to:

```ts
export const TEMPLATE_CASES: TemplateCase[] = [
  { template: 'modern', preset: 'default', tapTargets: false },
  { template: 'dark-luxury', preset: 'gold', tapTargets: true },
  { template: 'cyber-brutalism', preset: 'acid-dark', tapTargets: true },
  { template: 'cyber-brutalism', preset: 'purple-light', tapTargets: true },
];
```

- [ ] **Step 2: The preset helper**

`e2e/template-theme.ts`:

```ts
import { expect, type Page } from '@playwright/test';
import type { InstallMocksOptions } from './mocks.ts';

interface CatalogPreset {
  id: string;
  scheme: 'dark' | 'light';
  colors: Record<string, string>;
  fonts: Record<'heading' | 'body' | 'mono', { family: string } | null>;
  radius: 'none' | 'sm' | 'md' | 'lg' | 'xl';
}
interface CatalogJson { templates: Array<{ id: string; presets: CatalogPreset[] }> }

type Tweak = NonNullable<InstallMocksOptions['tweakSettings']>;

/** A tweakSettings that stores `template`/`preset` the way the admin does: preset values copied in. */
export async function presetTheme(page: Page, template: string, preset: string, options: Record<string, boolean | string> = {}): Promise<Tweak> {
  const res = await page.request.get('/templates.json');
  expect(res.ok()).toBe(true);
  const p = ((await res.json()) as CatalogJson).templates.find((t) => t.id === template)?.presets.find((x) => x.id === preset);
  if (!p) throw new Error(`no preset ${template}/${preset} in /templates.json`);
  return (s) => {
    s.theme = {
      ...s.theme,
      template,
      preset,
      options,
      scheme: p.scheme,
      colors: p.colors as typeof s.theme.colors,
      fonts: { heading: p.fonts.heading?.family ?? null, body: p.fonts.body?.family ?? null, mono: p.fonts.mono?.family ?? null },
      radius: p.radius,
    };
  };
}
```

- [ ] **Step 3: Write the decor spec**

`e2e/templates-decor.spec.ts`:

```ts
import { expect, test, type Locator, type Page } from '@playwright/test';
import { installMocks, type InstallMocksOptions, type Layout } from './mocks.ts';
import { addFirstToCart, FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';

type Settings = Parameters<NonNullable<InstallMocksOptions['tweakSettings']>>[0];

async function open(page: Page, template: string, preset: string, width: number, opts: { options?: Record<string, boolean | string>; layout?: Layout; extra?: (s: Settings) => void } = {}) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.clock.setFixedTime(FIXED_NOW);
  const tweak = await presetTheme(page, template, preset, opts.options);
  const layout = opts.layout ?? 'storefront';
  const mocks = await installMocks(page, { layout, session: true, tweakSettings: (s) => { tweak(s); opts.extra?.(s); } });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-sf-template', template);
  return { mocks, layout };
}

const style = (loc: Locator, prop: string) => loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe('cyber-brutalism', () => {
  test('desktop: system bar, readout, crosshairs, status strip, square cards', async ({ page }) => {
    await open(page, 'cyber-brutalism', 'acid-dark', 1280);
    const bar = page.locator('[data-cb="sysbar"]');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('SYS.TIME');
    await expect(bar).toContainText('SKU:');
    await expect(page.locator('.cb-hero .cb-readout')).toContainText('> ITEMS');
    await expect(page.locator('[data-cb="frame"] .cb-cross')).toHaveCount(4);
    await expect(page.locator('[data-cb="status"]')).toBeVisible();
    expect(await style(page.locator('[data-sf-part="product-card"]').first(), 'border-top-left-radius')).toBe('0px');
    expect(await style(page.locator('[data-sf-part="header"]').first(), 'backdrop-filter')).toBe('none');
  });

  test('phone: the bar collapses and the status strip gives way to the acid cart bar', async ({ page }) => {
    const { mocks, layout } = await open(page, 'cyber-brutalism', 'acid-dark', 360);
    await expect(page.locator('[data-cb="sysbar"]')).toBeVisible();
    await expect(page.locator('[data-cb="sysbar"] [data-cb-wide]').first()).toBeHidden();
    await expect(page.locator('.cb-cross').first()).toBeHidden();
    expect(await noOverflow(page)).toBe(true);
    await addFirstToCart(page, layout, mocks);
    const cartBar = page.locator('[data-sf-part="cart-bar"]');
    await expect(cartBar).toBeVisible();
    await expect(page.locator('[data-cb="status"]')).toHaveCount(0);
    expect(await style(cartBar, 'background-color')).toBe('rgb(212, 255, 0)');
  });

  test('purple light cart bar is ink with acid text', async ({ page }) => {
    const { mocks, layout } = await open(page, 'cyber-brutalism', 'purple-light', 390);
    await addFirstToCart(page, layout, mocks);
    const cartBar = page.locator('[data-sf-part="cart-bar"]');
    expect(await style(cartBar, 'background-color')).toBe('rgb(17, 17, 17)');
    expect(await style(cartBar, 'color')).toBe('rgb(212, 255, 0)');
  });

  test('options off remove every decoration', async ({ page }) => {
    await open(page, 'cyber-brutalism', 'acid-dark', 1280, { options: { systemBar: false, statusBar: false, crosshairs: false } });
    await expect(page.locator('[data-cb="sysbar"]')).toHaveCount(0);
    await expect(page.locator('[data-cb="frame"]')).toHaveCount(0);
    await expect(page.locator('[data-cb="status"]')).toHaveCount(0);
    await expect(page.locator('.cb-cross')).toHaveCount(0);
  });

  test('long brand name does not overflow at 360px', async ({ page }) => {
    await open(page, 'cyber-brutalism', 'acid-dark', 360, {
      extra: (s) => { s.brand.name = 'MERIDIANBOTANICALAPOTHECARY SUPPLY COMPANY'; s.brand.tagline = 'Wholesale botanicals'; },
    });
    await expect(page.locator('.cb-hero__name')).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
  });

  test('menu layout keeps the bar and the strip', async ({ page }) => {
    await open(page, 'cyber-brutalism', 'acid-dark', 390, { layout: 'menu' });
    await expect(page.locator('[data-cb="sysbar"]')).toBeVisible();
    await expect(page.locator('.cb-footer--compact [data-cb="status"]')).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
  });
});

test.describe('dark-luxury', () => {
  test('desktop: grain, orb, borderless raised cards, open badge, calm grid buttons', async ({ page }) => {
    await open(page, 'dark-luxury', 'gold', 1280);
    const grain = page.locator('[data-lux="grain"]');
    await expect(grain).toHaveCount(1);
    expect(await style(grain, 'pointer-events')).toBe('none');
    await expect(page.locator('[data-lux="orb"]')).toHaveCount(1);
    const card = page.locator('[data-sf-part="product-card"]').first();
    expect(await style(card, 'border-top-style')).toBe('none');
    expect(await style(card, 'box-shadow')).toContain('inset');
    await expect(page.locator('.lux-status')).toHaveText('[ACCEPTING ORDERS]');
    const add = page.locator('[data-sf-part="product-card"] [data-sf-part="button"]').first();
    expect(await style(add, 'animation-name')).toBe('none');
    expect(await style(add, 'background-color')).not.toBe('rgb(212, 160, 60)');
  });

  test('phone: only the main CTA pulses', async ({ page }) => {
    const { mocks, layout } = await open(page, 'dark-luxury', 'gold', 390);
    await addFirstToCart(page, layout, mocks);
    const cta = page.locator('[data-sf-part="cart-bar"] [data-sf-cta="main"]');
    await expect(cta).toBeVisible();
    expect(await style(cta, 'animation-name')).toBe('sf-lux-pulse');
    expect(await noOverflow(page)).toBe(true);
  });

  test('reduced motion: nothing pulses or breathes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { mocks, layout } = await open(page, 'dark-luxury', 'gold', 390);
    await addFirstToCart(page, layout, mocks);
    expect(await style(page.locator('[data-sf-part="cart-bar"] [data-sf-cta="main"]'), 'animation-name')).toBe('none');
    expect(await style(page.locator('[data-lux="orb"]'), 'animation-name')).toBe('none');
  });

  test('options off remove grain, orb and badge', async ({ page }) => {
    await open(page, 'dark-luxury', 'gold', 1280, { options: { grain: false, orb: false, statusBadge: false } });
    await expect(page.locator('[data-lux="grain"]')).toHaveCount(0);
    await expect(page.locator('[data-lux="orb"]')).toHaveCount(0);
    await expect(page.locator('.lux-status')).toHaveCount(0);
  });
});
```

The fixture's brand must have a tagline or welcome for the luxury orb to render (the hero renders nothing without either, same as modern). If `e2e/fixtures/settings.storefront.json` has neither, add `extra: (s) => { s.brand.tagline = 'Rare resins, slow made'; }` to the three luxury tests that assert the orb — check the fixture first (`grep -n tagline e2e/fixtures/settings.storefront.json`).

- [ ] **Step 4: Run**

Run: `npm run test:e2e -- templates.spec.ts templates-decor.spec.ts` → all pass: the matrix is 1 guard + 6 × 4 cases (4 storefront widths + 2 menu widths per case) = 25, plus 10 decor tests. A failure here is a real template bug (overflow, a covered cart bar, a sub-44px slot link) — fix the template, never the assertion.

- [ ] **Step 5: Commit**

```bash
git add e2e/template-theme.ts e2e/templates-decor.spec.ts e2e/templates.spec.ts
git commit -m "test(e2e): dark-luxury and cyber-brutalism matrix cases and decor checks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Admin preview images

**Files:**
- Create: `e2e/template-previews.spec.ts`, `e2e/mocks-policy.spec.ts`
- Modify: `e2e/mocks.ts` (`E2E_REAL_FONTS=1` lets Google Fonts through; default unchanged)
- Create (generated, committed): `web/src/templates/dark-luxury/preview.webp`, `web/src/templates/cyber-brutalism/preview.webp`
- Modify: both `manifest.ts` (add `preview`)
- Test: `web/test/template-dark-luxury.test.tsx`, `web/test/template-cyber-brutalism.test.tsx` (append)

**Interfaces:**
- Consumes: `presetTheme`, `installMocks`, `FIXED_NOW`; Plan 2 Task 9's catalog plugin (accepts `./preview.webp`, emits `/templates/<id>/preview.webp`).
- Produces: `externalRequestPolicy(url, env?)` in `e2e/mocks.ts`; `manifest.preview = './preview.webp'` for both templates; the images in `templates.json`.

- [ ] **Step 1: Real fonts on demand in the e2e mocks**

`installMocks` aborts every request that leaves `localhost:5199` (mocks.ts L232), so Google Fonts never load and the preview images and visual review would show fallback faces. Add an opt-in pass-through for exactly the two Google Fonts hosts. With `E2E_REAL_FONTS` unset, behaviour is unchanged (fonts are aborted, the suite stays hermetic). With `E2E_REAL_FONTS=1`, only `fonts.googleapis.com` / `fonts.gstatic.com` go through; every other external request is still aborted.

Write the failing test first. `e2e/mocks-policy.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { externalRequestPolicy, installMocks } from './mocks.ts';

const CSS = 'https://fonts.googleapis.com/css2?family=Tektur:wght@400;700&display=swap';
const WOFF = 'https://fonts.gstatic.com/s/tektur/v1/x.woff2';

test.describe('external request policy (E2E_REAL_FONTS)', () => {
  test('default: every external request is aborted, fonts included', () => {
    expect(externalRequestPolicy(CSS, {})).toBe('abort');
    expect(externalRequestPolicy(WOFF, {})).toBe('abort');
    expect(externalRequestPolicy('https://example.com/x.js', {})).toBe('abort');
  });

  test('E2E_REAL_FONTS=1: only the two Google Fonts hosts pass', () => {
    const env = { E2E_REAL_FONTS: '1' };
    expect(externalRequestPolicy(CSS, env)).toBe('continue');
    expect(externalRequestPolicy(WOFF, env)).toBe('continue');
    expect(externalRequestPolicy('https://example.com/x.js', env)).toBe('abort');
    expect(externalRequestPolicy('https://fonts.googleapis.com.evil.example/x.css', env)).toBe('abort');
    expect(externalRequestPolicy('http://fonts.googleapis.com/css2', env)).toBe('abort'); // https only
  });

  test('any other value of the flag keeps fonts blocked', () => {
    expect(externalRequestPolicy(CSS, { E2E_REAL_FONTS: 'true' })).toBe('abort');
    expect(externalRequestPolicy(CSS, { E2E_REAL_FONTS: '0' })).toBe('abort');
  });

  test('default wiring: a page fetch to Google Fonts fails (no network used)', async ({ page }) => {
    test.skip(process.env.E2E_REAL_FONTS === '1', 'checks the default (blocked) wiring only');
    await installMocks(page, { layout: 'storefront' });
    await page.goto('/');
    const failed = await page.evaluate(async (url) => {
      try { await fetch(url, { mode: 'no-cors' }); return false; } catch { return true; }
    }, CSS);
    expect(failed).toBe(true);
  });
});
```

Run: `npm run test:e2e -- mocks-policy.spec.ts` → FAIL (`externalRequestPolicy` is not exported).

Then in `e2e/mocks.ts` add, above `installMocks`:

```ts
const GOOGLE_FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

/**
 * What the catch-all route does with a request that leaves the dev server. Default: abort
 * (hermetic). E2E_REAL_FONTS=1 lets the two Google Fonts hosts through so template
 * screenshots and preview images use the real faces; nothing else is ever let out.
 */
export function externalRequestPolicy(url: string, env: Record<string, string | undefined> = process.env): 'continue' | 'abort' {
  return env.E2E_REAL_FONTS === '1' && GOOGLE_FONTS.test(url) ? 'continue' : 'abort';
}
```

and change the catch-all route (L232) from `route.abort()` to consult it:

```ts
  // Nothing outside the dev server and the (shimmed) challenge script should
  // ever be reached — a real request would hang the run. Only exception: Google
  // Fonts when E2E_REAL_FONTS=1 (see externalRequestPolicy).
  await page.route(/^https?:\/\/(?!localhost:5199|challenges\.cloudflare\.com)/, (route) =>
    externalRequestPolicy(route.request().url()) === 'continue' ? route.continue() : route.abort(),
  );
```

Run: `npm run test:e2e -- mocks-policy.spec.ts` → 4 passed. Run `npm run test:e2e -- storefront.spec.ts templates-baseline.spec.ts` → all pass, which shows the default is unchanged (the baseline must not move).

- [ ] **Step 2: Write the opt-in capture spec** (no new dependencies — Chromium's canvas encodes WebP)

`e2e/template-previews.spec.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { installMocks } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';

const TARGETS = [
  { template: 'dark-luxury', preset: 'gold' },
  { template: 'cyber-brutalism', preset: 'acid-dark' },
];

test.describe('template previews', () => {
  test.skip(process.env.CAPTURE_PREVIEWS !== '1', 'set CAPTURE_PREVIEWS=1 (and E2E_REAL_FONTS=1) to regenerate preview.webp');

  for (const t of TARGETS) {
    test(`capture ${t.template}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.clock.setFixedTime(FIXED_NOW);
      await installMocks(page, { layout: 'storefront', tweakSettings: await presetTheme(page, t.template, t.preset) });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const png = await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 800 } });
      const webp = await page.evaluate(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 400;
        canvas.getContext('2d')!.drawImage(img, 0, 0, 640, 400);
        return canvas.toDataURL('image/webp', 0.82).split(',')[1]!;
      }, png.toString('base64'));
      writeFileSync(fileURLToPath(new URL(`../web/src/templates/${t.template}/preview.webp`, import.meta.url)), Buffer.from(webp, 'base64'));
    });
  }
});
```

- [ ] **Step 3: Generate the images**

Run (bash): `CAPTURE_PREVIEWS=1 E2E_REAL_FONTS=1 npm run test:e2e -- template-previews.spec.ts` → 2 passed. Check each file exists, is 640×400 and under 150 KB, and **open both to eyeball them** (Read tool on the `.webp`). A normal `npm run test:e2e` reports these two as skipped.

- [ ] **Step 4: Write the failing tests**

Append to `web/test/template-dark-luxury.test.tsx`:

```tsx
describe('dark-luxury preview', () => {
  it('declares the committed preview image', () => {
    expect(manifest.preview).toBe('./preview.webp');
    expect(readFromTest('../src/templates/dark-luxury/preview.webp').length).toBeGreaterThan(1000);
  });
});
```

Append the same block to `web/test/template-cyber-brutalism.test.tsx` with `cyber-brutalism` in the path and describe name (add the `readFromTest` import there too if Task 6 did not).

Run: `npm run test:web -- template-dark-luxury template-cyber-brutalism` → FAIL (`preview` undefined).

- [ ] **Step 5: Declare the previews**

In both `manifest.ts` files add, after `options: [...]`:

```ts
  preview: './preview.webp',
```

- [ ] **Step 6: Verify the catalog**

Run: `npm run test:web` → PASS. Run: `npm run build` → succeeds. Then:

```bash
node -e "const c=require('./web/dist/templates.json');console.log(c.templates.map(t=>t.id+' '+(t.preview||'-')).join('\n'))"
```

Expected: `modern -`, `dark-luxury /templates/dark-luxury/preview.webp`, `cyber-brutalism /templates/cyber-brutalism/preview.webp` (unhashed — spec amendment 5), and both files present under `web/dist/templates/`.

- [ ] **Step 7: Commit**

```bash
git add e2e/mocks.ts e2e/mocks-policy.spec.ts e2e/template-previews.spec.ts web/src/templates/dark-luxury/preview.webp web/src/templates/cyber-brutalism/preview.webp web/src/templates/dark-luxury/manifest.ts web/src/templates/cyber-brutalism/manifest.ts web/test/template-dark-luxury.test.tsx web/test/template-cyber-brutalism.test.tsx
git commit -m "feat(templates): admin preview images for dark-luxury and cyber-brutalism

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Visual review against the briefs + docs (frontend-design subagent, loads both design skills)

**Files:**
- Create: `docs/verification/2026-09-28-templates-visual-review.md`
- Modify: `docs/templates.md` (append a "Built-in templates" section)
- Modify (only if the review finds defects): the two `template.css` files / slots, with their tests

- [ ] **Step 1: Capture with real fonts**

Run (bash): `E2E_REAL_FONTS=1 npm run test:e2e -- templates.spec.ts templates-decor.spec.ts` → all pass (real Google Fonts via Task 8 Step 1). Screenshots land in `docs/screenshots/templates/` (gitignored): `<template>-<preset>-<layout>-<width>-{1-catalog,2-detail,3-cart,4-checkout}.png`.

- [ ] **Step 2: Review every screenshot against the checklists**

Open each PNG (Read tool). For **dark-luxury** check, per the skill's anti-pattern list and the brief:
- [ ] no button with an accent fill; primary buttons dark + accent border + visible glow
- [ ] cards borderless, edge = inset top highlight; hover lift only on hover devices
- [ ] headline contrast by colour, same weight; no thin (300) weights anywhere
- [ ] `[Label]` bracket labels in mono accent; no `— dashes —`
- [ ] exactly one orb, elliptical, bottom-centre of the hero; grain visible but faint
- [ ] footer inside a rounded elevated panel with the status badge
- [ ] accent used surgically (labels, borders, prices) — never a large fill
- [ ] 360 px: no clipped text, hero readable, footer stacks to one column

For **cyber-brutalism** check, per the skill's anti-pattern list and the brief:
- [ ] zero radius on every element (buttons, cards, inputs, badges, sheets, chips)
- [ ] no shadows, no blur, no gradients except the footer hazard stripe
- [ ] system bar above the header; `/01` numbering; crosshairs in hero, footer and viewport corners (≥ 480 px)
- [ ] headings uppercase Tektur, left-aligned; readouts in Share Tech Mono
- [ ] one accent only (acid on dark; purple on light, with acid only on the ink bars)
- [ ] bottom status strip present; on phones with a cart it is the cart bar, never two stacked bars
- [ ] 360 px: system bar one line (time + node), hero name wraps, no horizontal scroll

Any failed box is a defect: fix it in the template's CSS/slot, add or adjust a unit test that pins it, re-run Steps 1–2.

- [ ] **Step 3: Record the review**

Write `docs/verification/2026-09-28-templates-visual-review.md`: date, commit SHA reviewed, the command used, the two checklists with each box ticked or annotated, defects found and the commits that fixed them, and the list of screenshot filenames reviewed.

- [ ] **Step 4: Document the built-ins**

Append to `docs/templates.md`:

```md
## Built-in templates

| Id | Schemes | Presets | Locked | Options |
|---|---|---|---|---|
| `modern` | dark, light | Default | nothing | — |
| `dark-luxury` | dark | Gold (default), Silver, Emerald, Crimson | fonts, radius, button style | `grain`, `orb`, `statusBadge` (all on) |
| `cyber-brutalism` | dark, light | Acid Dark (default), Purple Light | fonts, radius (always square), button style | `systemBar`, `statusBar`, `crosshairs` (on), `nodeLabel` (text, `NODE_01`, ≤ 24) |

Both non-default templates read real store data for their decoration: the ordering flag
(luxury footer badge, brutalist readout), the catalogue size (hero badge, `SKU:`), and the
next dispatch cut-off and its timezone (brutalist clock and readout). They are worked
examples of the contract: `web/src/templates/dark-luxury/` and
`web/src/templates/cyber-brutalism/`.

Preview images are regenerated with
`CAPTURE_PREVIEWS=1 E2E_REAL_FONTS=1 npm run test:e2e -- template-previews.spec.ts`.
```

- [ ] **Step 5: Full verification**

Run: `npm test` → web + worker + scripts PASS. Run: `npm run typecheck` → clean. Run: `npm run build` → succeeds. Run: `npm run test:e2e` → all pass (previews skipped), `templates-baseline.spec.ts` snapshots **unchanged** (modern untouched by this plan).

- [ ] **Step 6: Commit**

```bash
git add docs/verification/2026-09-28-templates-visual-review.md docs/templates.md
git commit -m "docs: built-in templates and visual review record

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Plus any fix commits from Step 2, each staging only the files it touched.)

---

## Contract notes for Plan 2 (resolved — Plan 2 was patched)

1. **Blur removal** → Plan 2 added `tokens.glass: 'on' | 'off'` (root `data-sf-glass`) with shared `chassis.css` rules that make `.glass`/`.glass-soft` bars and `.mantine-Overlay-root` solid; `.glass`, `.glass-soft`, `.mantine-Overlay-root` are also documented as supported hooks. Brutalism sets `glass: 'off'` and its stylesheet no longer targets those selectors (Tasks 4 and 6).
2. **Custom buttons and `button.fill`** → Plan 2 Task 7 adds shared `:root[data-sf-btn-fill="outline-glow"|"ghost"] [data-sf-part="button"][data-variant="filled"]` rules (fill, text, border, hover, disabled) covering `AddToCart`, `CartSummary` and `MobileCartBar` checkouts and the checkout page's `.next` (Place order / Continue; `data-variant="filled"`, `data-sf-cta="main"`) and `.back` (`data-variant="default"`) buttons too (Plan 2 preflight ruling F2). Luxury's filled-button rule keeps only its surface fill, text colour and glow/pulse (Task 3); both templates reach the checkout buttons through `[data-sf-part="button"]` / `[data-sf-cta="main"]` alone — no page-specific class (such as `.next`) is ever targeted.
3. **Token values** → Plan 2's `validateManifest` now checks every token and explicitly accepts numeric radii 0..64 (incl. `badge.radius: 0`), `'0'`/em tracking, `card.border: 'none'` and `button.font: 'body' | 'heading'`; its tests use this plan's exact luxury and brutalism token blocks.
4. **Import scanner** → pinned by a Plan 2 Task 10 test covering `./x.ts`/`./x.tsx`/`../slots/x.tsx` in-folder imports, `import type { SVGProps } from 'react'` and inline `type` specifiers.
5. **Icons** → `ArrowUpRightIcon` (props `GlyphProps`: `size?: number | string` plus pass-through SVG props) is re-exported from `@/templates/contract.ts`; this plan imports it and no longer ships its own `Arrow.tsx` (Task 5). It keeps the shop's 1.6 stroke rather than the brief's 1.5 so the glyph matches the rest of the storefront.

## Rulings

- **Luxury headings/body fonts are `null`** (self-hosted Inter Variable covers 400–800); only JetBrains Mono is fetched. Avoids a duplicate Inter download.
- **Luxury `muted` is the brief's body colour (`#8a8070`), not its near-invisible `#5a544a`.** The storefront uses `muted` for readable secondary text; the dim headline grey is derived in CSS (`--lux-dim`). Same reasoning for brutalism's `muted` (`#8a8a8a` / `#5f5f5a`) instead of 38 % alpha.
- **Custom luxury `SectionLabel`** (`[Catalogue]`, `[01]`) rather than the default `[Title]`, which would repeat the heading beneath it. Brutalism uses the default `/01`.
- **Hero parity:** the luxury hero renders nothing without a tagline or welcome (like modern); the brutalist hero always renders (the brand name is always available). Both keep the page `<h1>` as the only heading.
- **Crosshair placement:** hero corners, footer corners and a fixed viewport frame (`Overlay`) — all hidden under 480 px.
- **Light-mode ink bars** use acid `#d4ff00` text on `#111`, not purple-on-black (illegible at 10–11 px). This is the skill's `--accent-hi`, used for status only.
- **Grid add-to-cart arrows** hide under 768 px (`data-cta="false"`) so compact grid buttons don't overflow; main CTAs always keep `↗`.
- **Menu layout footers:** luxury shows a compact badge panel, brutalism only the status strip; both render nothing when their option is off.
- **Options drive markup, not CSS:** each decoration's option decides whether its slot renders at all, so `template.css` never has to read options.
