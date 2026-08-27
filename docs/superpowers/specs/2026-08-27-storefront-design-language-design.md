# Storefront design language — bringing the ecommerce-menu look to the new storefront

**Date:** 2026-08-27
**Status:** approved in chat, awaiting spec review
**Repos touched:** `ecommerce-storefront/web` (bulk), `ecommerce-backend` (one enum + default), `ecommerce-admin-frontend` (one select option)

## 1. Problem

The new storefront (`kp-sf-beta.kratos-bots.com`) reads as a downgrade next to the old
`ecommerce-menu` site (`kratos-pharma.com`). Side-by-side inspection of the order-status page and
catalog at 1280 px and 390 px found four concrete causes — not a general "everything is worse":

| Area | Old (`ecommerce-menu/web`) | New (`ecommerce-storefront/web`) |
|---|---|---|
| Fonts | Inter (Google Fonts, 300–800). "Mono voice" for prices/eyebrows/refs is **Inter + `tabular-nums` + wide uppercase tracking** — no real monospace anywhere. | No default typeface: `--sf-font-body/heading` fall back to `system-ui` (Segoe UI on Windows); `--sf-font-mono` is a **real** monospace (`ui-monospace` → Consolas) used 228× for prices, eyebrows, totals, refs. |
| Background | Two fixed radial gradients (top glow, bottom vignette) from palette tokens; glass header/footer (`bg/85` + `backdrop-blur`). | Flat `--sf-bg`; flat `--sf-bg-deep` header. |
| Motion | `rowEnter` on every list row (6 px rise, 0.4 s, 25 ms stagger capped at 14), `anim-fade` on every section, sheets slide 300 ms on `cubic-bezier(.22,1,.36,1)`, buttons `active:scale(.98)`, `ping` ring on the current step. | No entrance animation anywhere; only a skeleton shimmer and a status-dot pulse; Mantine drawers at stock 150–200 ms. |
| Shape & density | Sharp corners everywhere (radius 0) except sheet top edge, dots, skeletons. 768 px single column. Dense image-less product list. | Rounded via `theme.radius` (default `md`). Image-led grid; for a store with no product photos it is ~60 % empty wells and one 404 per card. |

Everything else (layout system, Mantine drawers/modals, per-feature CSS modules, theme plumbing)
is structurally sound and stays.

## 2. Decisions (from brainstorming, 2026-08-27)

1. **Fidelity:** port the old design language as the storefront's *built-in default*. Admin theme
   settings (colours, fonts, radius, density, custom CSS) still override on top.
2. **Corners:** sharp by default — add `none` to the radius scale and make it the default.
3. **Catalog without images:** auto-adapt (card drops its image well; an image-less result set
   renders as the dense list). No admin action required.
4. **Font delivery:** self-host Inter in the bundle (`@fontsource-variable/inter`); store-configured
   fonts still load from Google Fonts as today.
5. **Approach:** extend the existing Mantine app with a shared design layer. Rejected: porting the
   old Tailwind codebase wholesale (throws away 9.5k lines of working CSS modules and behaviour);
   fonts-and-gradient-only patch (misses motion, shape, catalog).

## 3. Design

### 3.1 Typography

- Dependency: `@fontsource-variable/inter` (5.x). `web/src/main.tsx` imports
  `@fontsource-variable/inter/index.css` (the default `wght` axis file; no `slnt` axis) **before**
  `global.css`. Vite emits the woff2 files as hashed assets; the existing release `_headers`
  immutable-cache rule for `/assets/*` covers them. Budget: ≈ 130 KB of woff2 for the latin + latin-ext subsets (stock fontsource output is 133 KB; other subsets ship but load only on demand via `unicode-range`).
- `web/src/app/theme-bridge.ts` constants become:
  ```ts
  const INTER = '"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const SYSTEM_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'; // only used when a store sets fonts.mono
  ```
  - `--sf-font-body` = `family(theme.fonts.body, INTER)`
  - `--sf-font-heading` = `family(theme.fonts.heading ?? theme.fonts.body, INTER)`
  - `--sf-font-mono` = `theme.fonts.mono ? family(theme.fonts.mono, SYSTEM_MONO) : family(theme.fonts.body, INTER)` — i.e. the mono voice is the **body face** unless the store explicitly chooses a mono font.
  - Mantine `fontFamily` / `fontFamilyMonospace` / `headings.fontFamily` use the same three values.
  - `googleFontsHref` unchanged (only configured names are requested).
- `web/src/styles/global.css` `:root` fallback vars change to the Inter stacks above (pre-boot
  paint uses them; the fontsource CSS is in the same bundle so there is no swap on load).
- Global rules added (`chassis.css`, see 3.2): on `html, body` — `font-feature-settings: 'cv11', 'ss01', 'ss03'`,
  `-webkit-font-smoothing: antialiased`, `-moz-osx-font-smoothing: grayscale`,
  `text-rendering: optimizeLegibility`. Existing `.eyebrow`/price rules keep their letter-spacing
  values; the plan audits every `--sf-font-mono` use that renders digits and adds
  `font-variant-numeric: tabular-nums` where missing (`Money.tsx` already has it).

### 3.2 Chassis (new shared stylesheets)

Three new files under `web/src/styles/`, imported from `main.tsx` after `global.css`:

**`chassis.css`**
```css
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
*::-webkit-scrollbar-thumb { background: var(--sf-line-strong); border-radius: 2px; }
.glass {            /* sticky header / strip / sheet footer */
  background: color-mix(in srgb, var(--sf-bg) 85%, transparent);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  transform: translateZ(0); /* iOS Safari: force repaint of sticky+backdrop during momentum scroll */
}
.glass-soft { background: color-mix(in srgb, var(--sf-bg) 80%, transparent); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
.hr { height: 1px; background: var(--sf-line); }
.hr-strong { height: 1px; background: var(--sf-line-strong); }
```
Applied via CSS Modules global composition — `composes: glass from global;` — on `StorefrontShell`
`.header`, `MenuShell` `.bar`, the menu `ContactLinks` strip, `MobileCartBar` and `WholesaleBar`;
`composes: glass-soft from global;` on the `Sheet` footer and the checkout sticky `.nav`. Their module
CSS drops the opaque `background: var(--sf-bg-deep)` (border-bottom/top lines stay). `.hr`/`.hr-strong`
were dropped as unused.

**`motion.css`** — the old keyframes verbatim:
```css
@keyframes sf-row-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes sf-fade-in   { from { opacity: 0; } to { opacity: 1; } }
@keyframes sf-scale-in  { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: none; } }
@keyframes sf-ping      { 75%, 100% { transform: scale(2); opacity: 0; } }
.anim-row  { animation: sf-row-enter 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) backwards; animation-delay: calc(min(var(--i, 0), 14) * 25ms); }
.anim-fade { animation: sf-fade-in 0.3s ease backwards; }
.anim-fade-stagger { animation: sf-fade-in 0.3s ease backwards; animation-delay: var(--stagger, 0ms); }
.anim-scale { animation: sf-scale-in 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) backwards; }
.ping { position: absolute; inset: 0; border: 1px solid var(--sf-primary); animation: sf-ping 1s cubic-bezier(0, 0, 0.2, 1) infinite; }
@media (prefers-reduced-motion: reduce) {
  .anim-row, .anim-fade, .anim-scale { animation-duration: 0.01ms; animation-delay: 0ms; }
  .anim-fade-stagger { animation: none; }   /* a delayed reveal would hide content for the stagger length */
  .ping { display: none; }
}
```
`--i` is set inline as a style var by the list renderer (`style={{ '--i': index }}`); `--stagger`
likewise (`${Math.min(index, 4) * 60}ms` for tracking parcel cards).

Where the utilities go (complete list — each is a one-line `className` addition):

| `.anim-row` (+ `--i`) | `.anim-fade` | `.anim-fade-stagger` |
|---|---|---|
| `ProductCard`, `ProductRow`, `WholesaleRow`, account `OrdersPage` rows, `CartLine`, `Upsells` items, `ParcelTimeline` events, checkout `QuoteSummary` lines | `ProductGrid`/`ProductList` head + hero, `StatusHero`, `ItemsCard`, `AddressCard`, `ShipmentCard`, `PaymentSection`, `CryptoPaymentCard`, `EmptyState`, `AuthCard`, `ProductDetailPage`/`Sheet` body, `CheckoutPage` step panel, `TrackingPage` `OrderHero` + `LookupForm`, `VerifyPage` result, payment-redirect pages, `AccountLayout` tab panel | `ParcelCard` |

**`mantine.css`** — Mantine component defaults (see 3.5) that are simpler as CSS than as
`components` overrides — the button/input/card vocabulary in 3.5 (Drawer/Modal transitions and overlays are set as theme `defaultProps`, 3.4).

### 3.3 Shape

- Radius scale gains `none`. Changes:
  - `ecommerce-backend/src/modules/storefront-settings/schemas.ts`: `radius: z.enum(['none', 'sm', 'md', 'lg', 'xl'])`;
    `service.ts` `DEFAULT_THEME.radius = 'none'`. No migration — stored themes keep their value.
  - `ecommerce-admin-frontend` `ThemeCard.tsx`: zod enum + `RADIUS_PX.none = 0` + select option
    `{ value: 'none', label: 'None (sharp)' }` first in the list; `EMPTY_THEME.radius = 'none'`;
    `src/types/storefront-settings.ts` union.
  - `web/src/types/settings.ts` union; `buildMantineTheme`: `defaultRadius: theme.radius === 'none' ? 0 : theme.radius`
    (Mantine accepts a number of px). `web/test/theme-bridge.test.ts` covers `none → 0`.
- Exceptions (hard-coded, not from the token): `Sheet` bottom-sheet content `border-radius: 16px 16px 0 0`
  on `< 62em` only; `.handle`, status dots, `StockChip` dot, avatar circles stay `border-radius: 999px`;
  `PageSkeleton` blocks `2px`.
- Compatibility: a web build that predates this change receiving `radius: 'none'` resolves
  `var(--mantine-radius-none)` to nothing → browsers treat the declaration as invalid → `0`. Acceptable
  for the minutes between backend and storefront deploys.
- Operator note: stores with a saved theme keep their radius; the KP beta must set
  Admin → Storefront → Appearance → Corner radius → **None** once.

### 3.4 Motion in Mantine components

`buildMantineTheme` adds a `components` block:

```ts
components: {
  Drawer: Drawer.extend({ defaultProps: { transitionProps: { duration: 300, timingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }, overlayProps: { backgroundOpacity: 0.7, blur: 2 } } }),
  Modal:  Modal.extend({ defaultProps: { transitionProps: { transition: 'pop', duration: 200, timingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }, overlayProps: { backgroundOpacity: 0.7, blur: 2 } } }),
  Button: Button.extend({ classNames: { root: 'sf-button' } }),
  ActionIcon: ActionIcon.extend({ classNames: { root: 'sf-icon-button' } }),
  Input: Input.extend({ classNames: { input: 'sf-input' } }),
}
```
`Sheet.tsx` keeps its explicit `position`/`size`, and — because Mantine's compound `Drawer.Root`
reads the `DrawerRoot` theme key, not `Drawer` — also repeats the transition and overlay props
explicitly. `respectReducedMotion: true` is set so Mantine's own transitions honour the OS setting.
The `StatusHero` "current" node gets a `<span className="ping" />` child (`.node` is `position: relative`).
The tracking `ProgressStepper` gets no ping: it renders seven bar segments, not nodes, so a ring has
nothing to sit on (deliberate omission, 2026-08-27).

### 3.5 Component vocabulary (`mantine.css`)

```css
.sf-button {
  font-family: var(--sf-font-mono); text-transform: uppercase; font-weight: 600;
  letter-spacing: 0.2em; transition: transform 150ms ease, background-color 150ms ease, border-color 150ms ease, color 150ms ease;
}
.sf-button[data-size="xs"], .sf-button[data-size="sm"] { font-size: 11px; letter-spacing: 0.18em; }
.sf-button[data-size="md"] { font-size: 12px; }
.sf-button[data-size="lg"], .sf-button[data-size="xl"] { font-size: 13px; letter-spacing: 0.22em; }
.sf-button:active:not([data-disabled]) { transform: scale(0.98); }
/* the same press feedback is declared on the app-owned CTAs (AddToCart, ProductRow ±/+, MobileCartBar,
   order-status checkout button, wholesale steppers) — spec scoped this to Mantine Buttons at first,
   but the customer's most-pressed controls are not Mantine Buttons (amended 2026-08-27). */
.sf-button[data-variant="filled"] { background: var(--sf-primary); color: var(--sf-bg); }
.sf-button[data-variant="filled"]:hover { background: var(--sf-primary-soft); }
.sf-button[data-variant="default"] { background: transparent; border-color: var(--sf-line-strong); color: var(--sf-text); }
.sf-button[data-variant="default"]:hover { border-color: var(--sf-primary); background: var(--sf-surface); }
.sf-button[data-variant="subtle"] { color: var(--sf-muted); }
.sf-button[data-variant="subtle"]:hover { color: var(--sf-text); background: var(--sf-surface); }
.sf-button:focus-visible { outline: 1px solid var(--sf-primary); outline-offset: 2px; }
.sf-icon-button { transition: transform 150ms ease, background-color 150ms ease, border-color 150ms ease; }
.sf-icon-button:active:not(:disabled) { transform: scale(0.97); }
.sf-input {
  background: transparent; border: 0; border-bottom: 1px solid var(--sf-line-strong); border-radius: 0;
  padding-left: 0; padding-right: 0; font-family: var(--sf-font-mono); font-variant-numeric: tabular-nums;
  transition: border-color 150ms ease;
}
.sf-input:focus, .sf-input:focus-within { border-bottom-color: var(--sf-primary); outline: none; }
.sf-input[data-error] { border-bottom-color: var(--sf-danger); }
textarea.sf-input { border: 1px solid var(--sf-line-strong); padding: 0.75rem; }
```
Mantine's `Button` injects `--button-*` as inline styles, so the variant/size values above are set from
a theme-level `Button.extend({ vars })` resolver (which wins) and `mantine.css` keeps only the
non-variable properties; `.sf-input` zeroes inline padding only on inputs without a section
(`:not([data-with-left-section]) > .sf-input`). The app's own `Fields` component (checkout/login/verify) adopts the same underline rules in its
module CSS; its labels already use the eyebrow idiom. Mantine `Select`/`NativeSelect` inherit via
`Input`. Mantine `Notifications` keep stock styling.

Cards: every `*Card` module converges on `border: 1px solid var(--sf-line); background: color-mix(in srgb, var(--sf-surface) 40%, transparent); padding: 1.25rem; box-shadow: none; border-radius: var(--mantine-radius-default)`.
Emphasised cards use `border-color: color-mix(in srgb, var(--sf-primary) 60%, transparent)`.

### 3.6 Catalog without images

- `ProductCard`: when `product.imageProductId === null` render no `ProductImage` at all (the
  `.media` well is omitted, the `.body` stack starts at the top). `ProductImage` continues to
  handle a runtime 404 for products that *claim* an image.
- `ProductGrid`: `const imageless = visible.length > 0 && visible.every((p) => p.imageProductId === null)`.
  When `imageless`, render `<ul className={rows}>` of `ProductRow` (imported from the catalog
  feature, index passed for `--i`) instead of the card grid. Navigation inside `ProductRow` already
  resolves by layout (`/p/:id` in the storefront layout). Head/tally/empty states unchanged.
- Mixed result sets keep the grid; cards without an image keep the existing compact "rule" well only
  when *some* sibling has an image — implemented as a `hasSiblingImages` prop from `ProductGrid`
  (`true` when not `imageless`), so a card with `imageProductId === null` renders the rule well when
  `hasSiblingImages` and nothing otherwise.
- Tests (`web/test/product-grid.test.tsx`, `product-card.test.tsx`): no `<img>` for an image-less
  product; list rendered when all visible products are image-less; grid when at least one has an image.

### 3.7 Rollout

1. Backend + admin merge and deploy first (`none` accepted and defaulted; existing themes untouched).
2. Storefront: bump `web/package.json` to `0.2.0`, tag `v0.2.0`, release pipeline builds the zip;
   deploy from Admin → Storefront → Deploy to the beta hostname; set Corner radius → None.
3. Verify (Playwright, 1280 × 900 and 390 × 844): home, product, cart/checkout, `/order/:ref/:key`,
   `/tracking`, `/verify`, `/login` — screenshot pairs old vs new; zero console errors on home;
   `document.fonts.check('12px "Inter Variable"')` true; computed `font-family` of a price is the
   Inter stack; body `background-image` contains two `radial-gradient`s; header `backdrop-filter`
   non-`none`; `.anim-row` present on product rows with `--i` set.

## 4. Testing

- `web`: vitest — `theme-bridge.test.ts` (Inter defaults, mono = body face unless set, explicit mono
  honoured, `none → 0`, `md` passthrough), `product-card.test.tsx`, `product-grid.test.tsx`,
  a `motion.test.ts` that imports `motion.css` text and asserts the four keyframe names and the
  reduced-motion block exist (guards against accidental deletion), existing 35 files stay green.
- `ecommerce-backend`: schema test accepts `none`, rejects `round`; `DEFAULT_THEME.radius === 'none'`.
- `ecommerce-admin-frontend`: `tsc -b && vite build` + `eslint`; browser check that the select shows
  "None (sharp)" and the preview renders 0 px corners.
- No existing test asserts on class names or styles (verified 2026-08-27), so the restyle cannot
  break behavioural tests except through the two theme-bridge signatures above.

## 5. Out of scope

- Any layout change beyond the image-less list fallback (the storefront/menu layout switch stays an
  admin setting).
- Light-scheme tuning of the gradient (it is token-derived; a light palette gets a subtle version
  automatically and is checked visually only).
- Replacing Mantine `Stepper` in checkout with the square-node rail (checkout keeps Mantine's
  stepper, restyled by the global button/input rules only).
- Google-Fonts loading for the default face (self-hosted decision), and the theme-bootstrap inline
  script (fonts are CSS-level; nothing to replicate pre-boot).
