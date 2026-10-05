# Storefront templates

The storefront's visual language — colours, fonts, corner radius, button/card/heading treatment,
and a handful of decoration slots — is a **template**. Every client picks one template and one of
its presets in the admin (Storefront → Appearance); the built-in `modern` template is what every
store looked like before templates existed, and it stays the default. A template is a folder of
pure data (a manifest) plus optional React components (slots) and one stylesheet, loaded through a
lazy chunk so a store that never changes its template never downloads another one.

This document is generated from the code, not the design spec — when the two disagree, trust
`web/src/templates/{define,slots,contract,tokens}.ts`, `web/src/templates/runtime.tsx`,
`web/src/templates/registry.ts`, the `scripts/*.mjs` template tooling, and `e2e/templates.spec.ts`.

## 1. What a template is

A template never renders a page itself. It supplies a **manifest** (name, presets, editable
tokens, options) that the resolver turns into CSS variables and `<html>` attributes, and it may
optionally supply **slot components** — small React components the shells render at fixed
extension points (`TopBar`, `Footer`, `CatalogHero`, `SectionLabel`, `Overlay`,
`ButtonAdornment`). Everything else — routing, data fetching, cart/checkout logic, the DOM
structure of every page — is the app's, identical for every template.

```
web/src/templates/<id>/            (built-in)   or   web/src/templates/external/<id>/   (imported)
  manifest.ts    export default defineTemplate({...})       — imports only '@/templates/define.ts'
  index.ts       import './template.css'; export const slots: TemplateSlots = { ... };
  template.css   every rule under :root[data-sf-template="<id>"]
  slots/*.tsx    optional slot components
  preview.webp   optional (png/jpg/jpeg also accepted), referenced as manifest.preview = './preview.webp'
```

`index.ts` must have a named export `slots` (may be `{}`), typed `TemplateSlots`. Nothing else is
read from it. `external/` and `defaults/` are reserved folder names — never a valid template id
(`RESERVED_DIRS` in `scripts/template-rules.mjs`); `defaults/` holds modern's own slot components,
statically bundled, never treated as a template by the registry.

A template imports **only**: `@/templates/contract.ts` (everything below — slots, hooks,
components, re-exported types), `@/templates/define.ts` (manifest-only; `manifest.ts` may import
nothing else), `react` / `react/jsx-runtime`, relative files inside its own folder, and relative
`.css`. This is enforced at build/import time — see [§9](#9-importing-a-template-from-git).

## 2. Manifest

The manifest's shape, verbatim from `web/src/templates/define.ts`:

```ts
export const CONTRACT_VERSION = 1 as const;

export type ColorKey = 'primary' | 'bg' | 'surface' | 'text' | 'muted' | 'success' | 'warn' | 'danger';
export const COLOR_KEYS: readonly ColorKey[] = ['primary', 'bg', 'surface', 'text', 'muted', 'success', 'warn', 'danger'];
export type Scheme = 'dark' | 'light';
export type RadiusName = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type Density = 'comfortable' | 'compact';

export interface FontSpec { family: string; weights: number[] }
export interface PresetFonts { heading: FontSpec | null; body: FontSpec | null; mono: FontSpec | null }

export interface TemplatePreset {
  id: string;
  name: string;
  scheme: Scheme;
  colors: Record<ColorKey, string>; // 6-digit hex
  fonts: PresetFonts;               // null = the self-hosted Inter stack
  radius: RadiusName;
}

/** 'theme' = follow the store radius (var(--mantine-radius-default)); 'pill' = 999px; number = px. */
export type RadiusToken = 'theme' | 'pill' | number;
export type ButtonFill = 'solid' | 'outline-glow' | 'ghost';
export type TextCase = 'uppercase' | 'none';
export type LabelStyle = 'plain' | 'bracket' | 'numbered';

export interface TemplateTokens {
  button: {
    radius: RadiusToken;
    fill: ButtonFill;
    transform: TextCase;
    tracking: { sm: string; md: string; lg: string }; // CSS letter-spacing per Mantine size band
    weight: number;
    font: 'mono' | 'body' | 'heading';
  };
  card: { radius: RadiusToken; border: string; shadow: string; shadowHover: string }; // border/shadow = CSS values ('none' allowed)
  heading: { weight: number; tracking: string; transform: TextCase };
  label: { style: LabelStyle };
  input: { style: 'underline' | 'box' };
  chassis: 'glow' | 'flat';
  /** 'off' = frosted chrome (.glass/.glass-soft bars, Mantine overlays) loses its blur and turns solid --sf-bg. */
  glass: 'on' | 'off';
  badge: { radius: RadiusToken };
}

/** Modern's tokens — today's look. Templates spread and override. */
export const BASE_TOKENS: TemplateTokens = {
  button: { radius: 'theme', fill: 'solid', transform: 'uppercase', tracking: { sm: '0.18em', md: '0.2em', lg: '0.22em' }, weight: 600, font: 'mono' },
  card: { radius: 'theme', border: '1px solid var(--sf-line)', shadow: 'none', shadowHover: 'none' },
  heading: { weight: 600, tracking: 'normal', transform: 'none' },
  label: { style: 'plain' },
  input: { style: 'underline' },
  chassis: 'glow',
  glass: 'on',
  badge: { radius: 'pill' },
};

export type TemplateOption =
  | { key: string; type: 'boolean'; label: string; help?: string; default: boolean }
  | { key: string; type: 'select'; label: string; help?: string; default: string; choices: { value: string; label: string }[] }
  | { key: string; type: 'text'; label: string; help?: string; default: string; maxLength: number };

export type OptionValues = Record<string, boolean | string>;

export interface TemplateEditable { colors: ColorKey[]; fonts: boolean; radius: boolean; density: boolean }

export interface TemplateManifest {
  contractVersion: 1;
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  schemes: Scheme[];
  presets: TemplatePreset[];
  defaultPreset: string;
  tokens: TemplateTokens;
  editable: TemplateEditable;
  options: TemplateOption[];
  preview?: string; // './preview.webp' | './preview.png' | './preview.jpg' | './preview.jpeg'
}

export const TEMPLATE_ID_RE = /^[a-z0-9-]{1,40}$/;
export const OPTION_KEY_RE = /^[a-zA-Z0-9_-]{1,40}$/;
export const FONT_FAMILY_RE = /^[A-Za-z0-9 ]{1,50}$/;
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
```

`defineTemplate()` is the identity function — it exists purely so a manifest literal gets checked
against `TemplateManifest` by the compiler. `validateManifest(value, folderId)` (also in
`define.ts`) then checks everything TypeScript can't — regexes, cross-references (`defaultPreset`
must name a real preset, a preset's `scheme` must be in `schemes`, an option's `default` must be a
legal value for its `type`) and every limit below. It runs at build time in
`web/src/templates/registry.ts` (`collectManifestErrors`, called from the `templates-catalog` Vite
plugin) — an invalid **modern** manifest fails the build outright; any other invalid manifest is
*skipped* at runtime (one `console.warn`) but still fails `npm run build`, so it never reaches a
release.

### Limits (at least as strict as the backend's catalog schema)

A manifest that satisfies `validateManifest` but exceeds the backend's own caps (`storefront-templates.ts`
in `ecommerce-backend`, which parses each release's `templates.json`) would otherwise pass the
storefront's build and then get silently dropped when the admin ingests the catalog — so the
storefront enforces every one of the backend's numbers, and is stricter where noted:

| Field | Limit |
|---|---|
| `name` | ≤ 60 characters |
| `description` | ≤ 500 characters |
| `author` | ≤ 100 characters |
| `version` | ≤ 40 characters |
| `schemes` | 1–2 entries, `dark` and/or `light`, no duplicates |
| `presets` | 1–20 entries |
| preset `name` | ≤ 60 characters |
| `editable.colors` | colour keys, no duplicates (so ≤ 8) |
| `editable.fonts` / `.radius` / `.density` | booleans (required) |
| `options` | ≤ 18 entries (the backend caps a catalog entry at 30; the twelve core options take the rest) |
| option `key` | not a core option key (`showPageTitle`, `showCatalogIntro`, `showSectionLabels`, `showSku`, `showCategoryPicker`, `headerAccountIcon`, `headerCartIcon`, `showCutoffBar`, `cutoffMessage`, `showCutoffCountdown`, `showCategoryEmoji`, `showOutOfStockPrice` — all reserved) |
| option `label` | 1–80 characters |
| option `help` | optional; a string of ≤ 200 characters |
| select `choices` | 1–20 entries |
| select choice `value` / `label` | 1–100 / 1–80 characters |
| text `maxLength` | 1–100 |
| `FontSpec.weights` | 1–9 values; storefront stricter: 100–900 step 100; backend accepts 100–1000 |
| `id` / preset `id` / `defaultPreset` | `/^[a-z0-9-]{1,40}$/` |
| option `key` | `/^[a-zA-Z0-9_-]{1,40}$/` |
| font `family` | `/^[A-Za-z0-9 ]{1,50}$/` |
| preset `colors.*` | `/^#[0-9a-fA-F]{6}$/` (6-digit hex) |

Token values are checked too: radius tokens `'theme' | 'pill' | integer 0..64`; tracking
`'normal' | '0' | <signed decimal>em`; weights `100..900` step 100; `card.border` /
`card.shadow` / `card.shadowHover` are `'none'` or a CSS value with no `;`, `{`, `}` (≤ 200 chars);
`glass` is `'on' | 'off'`. A manifest over any of these limits **fails the build** — it is never
silently dropped or truncated.

### Presets, `editable` locks and options

A store's stored theme (`Theme` in `types/settings.ts`) always names a `template` and a `preset`;
`resolveTheme()` (`web/src/templates/resolve.ts`) turns that plus the manifest into the
`ResolvedTheme` every hook and slot reads:

- **Colours**: for every `ColorKey` *not* listed in `manifest.editable.colors`, the active preset's
  colour wins outright — a stored value for a locked key is ignored, never blended.
- **Fonts**: if `editable.fonts` is `false`, the preset's fonts are used unconditionally. If `true`,
  the stored font name is used when set (falling back to the preset's own weights only if the
  stored family matches the preset's family; otherwise `DEFAULT_WEIGHTS = [400, 500, 600, 700]`).
- **Radius**: `editable.radius ? stored.radius : preset.radius`.
- **Density**: `editable.density ? stored.density : 'comfortable'` — a locked density is always
  `'comfortable'`, never the preset's own opinion (there isn't one; density is a store-wide toggle).
- **Options**: `resolveOptions()` merges the manifest's own defaults with the stored `options`
  object key by key, discarding any stored value whose type or shape doesn't match the option's
  declared `type` (boolean/select/text) — so a stale or foreign options blob degrades to defaults
  field-by-field, never wholesale.
- **Core options**: every template — built-in and external — also carries twelve shared options,
  declared once as `CORE_OPTIONS` in `define.ts` and prepended to each manifest's own `options[]`
  by the registry (`withCoreOptions()` in `buildRegistry`, after validation). Because the catalog
  (`catalog.ts` → `templates.json`) and `lookupManifest` both read the registry, the admin's
  Template options card lists them for every template and `resolveOptions()` resolves them like
  any other option — no backend or admin change. Every default leaves the store as it was before the
  option existed (booleans `true`, header icons `all`, wording blank = built-in); the keys are
  reserved, so a manifest that declares one fails validation.

  | Key | Admin label | Hides |
  |---|---|---|
  | `showPageTitle` | Page title | The catalogue heading block in `ProductGrid`, `ProductList` and `WholesaleCatalogPage`: the page-level `SectionLabel`, the h1's visible styling and the tally ("N products", "6 LINES"). The h1 itself stays (class `sf-visually-hidden`, global.css) so screen readers and `getByRole('heading')` still find it. The wholesale "Whole list" link stays on its own slim row while a category is open. |
  | `showCatalogIntro` | Catalogue intro | The `CatalogHero` slot on all three surfaces (custom or default). |
  | `showSectionLabels` | Section labels | The `SectionLabel` slot at page and group level (custom or default). |
  | `showSku` | Product codes | The SKU in `ProductRow`, `ProductDetailPage` and `ProductDetailSheet`, and the wholesale sheet's Code column (header, cells, the tier ladder's leading pad; on a phone the row's code track collapses via `.noCode`). Search still matches codes; the contact prefill still quotes the code to staff. |
  | `showCategoryPicker` | Category picker | `CategoryNav` (chips and rail) and `FilterDrawer` in `ProductGrid` (the column goes full width), `FilterSheet` in `ProductList`, and the Categories button in `MenuShell`/`WebAppShell`. `/c/<slug>` links still work. |
  | `headerAccountIcon` | Header account icon | Select: `all` (default), `desktop`, `mobile`, `none`. The account link (or Sign in) in all three shells' headers. `desktop`/`mobile` add the global `sf-hide-mobile`/`sf-hide-desktop` class (62em); `none` doesn't render it (`headerIconClass()` in `hooks.ts`). |
  | `headerCartIcon` | Header cart icon | Same choices, for the header cart link. The phone cart bar and the web app's primary action are untouched — that's the point: in the web app the foot button already opens the cart. |
  | `showCutoffBar` | Dispatch cut-off banner | `CutoffBar` in all three shells. |
  | `cutoffMessage` | Cut-off banner wording | Text (≤ 100). Blank = "Order by {time} for {dispatch} dispatch"; otherwise the store's sentence with `{time}` and `{dispatch}` swapped for the styled cut-off time and ship day (`fillCutoffMessage()`). The weekday prefix for a cut-off that isn't today stays. |
  | `showCutoffCountdown` | Cut-off countdown | The "4h 12m left" readout and the draining meter. |
  | `showCategoryEmoji` | Category emojis | The emoji beside each category: the group heads in `ProductList` (and their reserved glyph column), `CategoryNav` chips and tree. Off draws none and reserves no column. The admin-facing editor picker is unaffected. |
  | `showOutOfStockPrice` | Price on out-of-stock products | Default on. Off: an out-of-stock, non-preorder product shows the "Out of Stock" chip in the price slot of `ProductRow` and `ProductCard` (right-aligned), and the meta/flags line drops its duplicate chip. Product sheet and page keep the price; low stock is unchanged (`useOutOfStockInPriceSlot()`). |

  `CatalogHero` and `SectionLabel` are gated centrally in `<Slot>` (`runtime.tsx`), so a template's
  slot never needs to check them; the page title is gated in the three views through
  `useCoreOptions()` (`hooks.ts`, also exported from `contract.ts`), which treats anything but an
  explicit `false` as shown.
- A stored `template` id not present in this release, or a `preset` id not present in that
  template, resolves to `modern` (or that template's `defaultPreset`) with one `console.warn` — see
  `registry.ts`'s `getTemplate()`.

## 3. Tokens

### CSS variables

Palette (unchanged by templates): `--sf-bg --sf-bg-deep --sf-surface --sf-surface-2 --sf-surface-3
--sf-line --sf-line-strong --sf-text --sf-muted --sf-faint --sf-primary --sf-primary-soft
--sf-success --sf-warn --sf-danger --sf-logo-h --sf-font-heading --sf-font-body --sf-font-mono`.

Token variables (set by `tokenVariables()` in `web/src/templates/tokens.ts`): `--sf-btn-radius
--sf-btn-transform --sf-btn-weight --sf-btn-font --sf-btn-tracking-sm --sf-btn-tracking-md
--sf-btn-tracking-lg --sf-card-radius --sf-card-border --sf-card-shadow --sf-card-shadow-hover
--sf-pill-radius --sf-heading-weight --sf-heading-tracking --sf-heading-transform`. (`radiusCss()`
turns a `RadiusToken` into `var(--mantine-radius-default)` / `999px` / `<n>px`; `--sf-btn-font`
points at whichever `--sf-font-*` the token names.)

### Root attributes

Set on `<html>` by `applyDocumentTheme()` (`web/src/app/theme-bridge.ts`, via `rootAttributes()` in
`tokens.ts`) and replayed by the inlined first-paint script from `localStorage`. This exact list —
`ROOT_ATTRIBUTE_NAMES` in `tokens.ts` — is also the allowlist that sanitises a stored/foreign
`localStorage` payload, so it is the single source of truth for both directions:

| Attribute | Values |
|---|---|
| `data-sf-template` | resolved template id |
| `data-sf-preset` | resolved preset id |
| `data-sf-btn-fill` | `solid` \| `outline-glow` \| `ghost` |
| `data-sf-input` | `underline` \| `box` |
| `data-sf-chassis` | `glow` \| `flat` (`flat` removes the body's two radial gradients) |
| `data-sf-label` | `plain` \| `bracket` \| `numbered` |
| `data-sf-glass` | `on` \| `off` (`off`: shared rules in `chassis.css` strip `backdrop-filter` from `.glass`, `.glass-soft` and `.mantine-Overlay-root` and paint the two glass classes solid `var(--sf-bg)`) |
| `data-mantine-color-scheme` | `dark` \| `light` |

Modern's own values (from `BASE_TOKENS` above, plus its one preset): `data-sf-template="modern"`,
`data-sf-preset="default"`, `data-sf-btn-fill="solid"`, `data-sf-input="underline"`,
`data-sf-chassis="glow"`, `data-sf-label="plain"`, `data-sf-glass="on"`,
`data-mantine-color-scheme="dark"`.

### Heading tokens reach fewer places than you'd expect

`heading.*` (weight/tracking/transform) only reaches headings whose **modern** value already
equals `BASE_TOKENS.heading` — because changing it anywhere else would break modern's
pixel-identical guarantee. Concretely that is just two headings: `ProductGrid`'s `.title`
(weight, tracking *and* transform) and `ProductDetailPage`'s `.name` (weight only — it keeps its
own `-0.01em` tracking). `ProductList`'s `.title` and `WholesaleCatalogPage`'s `.title` are never
touched by `heading.*` — they stay at their own literal `700` weight / negative tracking. A
template that wants one consistent heading look across every page styles the parts directly in its
`template.css`: `[data-sf-part="page-title"]`, `[data-sf-part="group-title"]` and
`[data-sf-part="sheet-title"]`.

## 4. Parts (`data-sf-part`)

| Part | Attached to |
|---|---|
| `header` | `<header>` in `StorefrontShell`, `MenuShell`, `Chromeless` |
| `main` | `<main>` in the same three shells |
| `footer` | default `Footer` slot's `<footer>` |
| `hero` | default `CatalogHero` grid `<section>` |
| `page-title` | catalogue `<h1>` in `ProductGrid`, `ProductList`, `WholesaleCatalogPage`; product `<h1>` in `ProductDetailPage` |
| `group-title` | menu-layout category `<h2>` in `ProductList` |
| `sheet-title` | the product name `<h2>` in the menu layout's `ProductDetailSheet` |
| `section-label` | default `SectionLabel` output |
| `button` | every Mantine `Button` (theme default prop) **plus** every custom `<button>`/`<a>`/`<span>`/`<Link>` explicitly tagged `data-sf-part="button"` — `AddToCart`; `CartSummary` checkout (disabled `<button>` and `<Link>`); `MobileCartBar` checkout (disabled `<button>` and `<Link>`); `CheckoutPage` `.next` (Place order / Continue) and `.back` (Back); plus the primary CTA on `LoyaltyPage` (Redeem), `WhatsappLogin` (three retry/continue states and the "Open WhatsApp" link), `PaymentSection`, `MethodPicker`, the payment-return pages' actions in `payment-parts.tsx` (sign in, view your order, pay via WhatsApp / Telegram, return to the order, back to the shop), the unpaid-order dialog (`UnpaidOrderDialog`: "Review or cancel order" filled, "Not now" `text`), the cancel dialog (`CancelOrder`: "Keep order" filled), the payment card's retry (`OrderPaymentCard`, `default`), `LookupForm` (tracking submit), `VerifyPage` (submit) and `WholesaleBar` ("View basket") — added in review so every primary CTA gets the template's button treatment, not just the four original checkout-path buttons. Variant is Mantine's own `data-variant` (`filled` \| `default` \| `subtle`) on Mantine `Button`s; every custom element above carries an explicit `data-variant="filled"`, except `CheckoutPage` `.back`, which carries `data-variant="default"`; the password sign-in surfaces — `PasswordLogin`'s three submits and its WhatsApp reset link, `ResetPasswordPage` (save and back to sign-in), `VerifyEmailPage` (profile link) and `PasswordSection` (save) — carry `data-variant="filled"`. The show/hide toggle inside `Field`'s password type is a plain `<button>` with no `data-sf-part`, so it is not a template hook (an `input` or `button` rule does not reach it). The `input` and `card` rows do not change (`Field` keeps its three `data-sf-part="input"` literals; `PasswordLogin` lives inside the existing `AuthCard`) |
| `input` | every Mantine `Input` element (theme default prop); the three `classes.input` elements in `features/checkout/Field.tsx` (text input, select, textarea) |
| `card` | exactly these eight roots: `features/auth/AuthCard.tsx` `<section>`; `features/order-status/CryptoPaymentCard.tsx` root; `features/order-status/PaymentSection.tsx` (four `classes.card` elements); `features/tracking/ParcelCard.tsx` root; `features/checkout/CheckoutPage.tsx` step card `<div>` |
| `product-card` | `ProductCard` `<article>` |
| `product-row` | `ProductRow` root element |
| `product-grid` | the storefront catalogue's card grid `<div>` in `ProductGrid` (not the upsell row) — its direct children are the `product-card`s, so a template can promote `:first-child` |
| `price` | the main price element in `ProductCard`, `ProductRow`, `ProductDetailPage`, `ProductDetailSheet` |
| `badge` | `StockChip` root, `StatusPill` root, header cart count `<span>` in both shells |
| `sheet` | `Drawer.Content` in `components/Sheet.tsx` (every sheet except the cart) |
| `drawer` | the same `Drawer.Content` when `CartDrawer.tsx` opens it (`<Sheet part="drawer">`) |
| `cart-bar` | `MobileCartBar` root `<div>` |
| `notice` | each notice root in `NoticeBanners.tsx` |
| `pinned-notices` | the `<aside>` holding notices the store pinned, inside each shell's sticky header. While it shows, its height is published as `--sf-pin-h` on `<html>`; anything a template sticks under the header should use `top: calc(var(--sf-bar-h) + var(--sf-pin-h, 0px))` |
| `cutoff` | `CutoffBar` root `<section>` |
| `stepper` | `ProgressStepper` root `<div>` (tracking) **and** the checkout Mantine `<Stepper>` in `CheckoutPage.tsx` |

`data-sf-cta="main"` marks the single main call to action on a page: `CartSummary` checkout,
`MobileCartBar` checkout, `CheckoutPage` `.next` (Place order / Continue). All three also carry
`data-sf-part="button" data-variant="filled"`, so a template styles them purely through the shared
parts — no page-specific class is ever targeted.

Never use a direct-child combinator under `[data-sf-part="main"]` (or any part): a styled block adds
a wrapper `<div>` around wrap-mode blocks.

Structural selectors inside product surfaces (for example bento's `[data-sf-part="product-card"] > :first-child`)
assume the default arrangement; degrade gracefully when an owner changes it. Every `data-sf-part` stays
on the same element under any arrangement, and the default arrangement renders exactly the markup
above, but an owner can reorder, wrap, drop or restyle the parts of the product page, the product
sheet, the catalogue and the product card and row (see `builder.md`, *Containers and parts*), so a
card's first child may not be its image. Style the part itself rather than its position where you can.

Header, cart and account parts can be reordered; don't rely on child order or `:first-child` inside
`[data-sf-part="header"]` or the cart.

Checkout steps and order cards can be reordered; don't rely on child order or `:first-child` inside
the checkout card or the order page columns.

### Shared button-fill rules

`mantine.css` carries the fill recipes for `tokens.button.fill` on every element tagged
`[data-sf-part="button"][data-variant="filled"]` — Mantine `Button`s *and* every custom filled
button above — keyed on `:root[data-sf-btn-fill="outline-glow"]` and
`:root[data-sf-btn-fill="ghost"]` (mirroring `buttonVariantVars()` in `theme-bridge.ts`): outline-glow
= `var(--sf-bg)` fill / `var(--sf-primary)` text / `1px solid var(--sf-primary)` border; ghost =
transparent fill / `var(--sf-primary)` text / `1px solid var(--sf-line-strong)` border; both hover
to `var(--sf-surface)`; disabled = `var(--sf-faint)` text / `var(--sf-line)` border. `solid` has no
shared rule — the app's own accent fill is the modern look. Its hover fill (Mantine's `--button-hover`
and `AddToCart`'s hover background and border) is `var(--sf-filled-hover-bg, var(--sf-primary-soft))`:
unset, it stays modern's `--sf-primary-soft`; a solid-fill template whose `--sf-primary-soft` mix is
unreadable under the `--sf-bg` label sets `--sf-filled-hover-bg` on its root (cyber-brutalism uses
`var(--sf-text)`). **A template that restyles the hover or
disabled state of a filled button must match these selectors' specificity, not just add a plain
`:hover`/`:disabled` rule**, or the shared rule keeps winning:

- base: `:root[data-sf-btn-fill=…] [data-sf-part="button"][data-variant="filled"]` — **(0,4,0)**
- hover: `…:hover:not(:disabled):not([data-disabled])` — **(0,7,0)**
- disabled: `…:is(:disabled, [data-disabled])` — **(0,5,0)**

A template only adds what is specific to it (a glow, a pulse) with an equally specific selector.

### Specificity

`:root[data-sf-template="x"] [data-sf-part="button"]` is **(0,3,0)** — it beats a module's own
class (0,1,0) and Mantine's `.mantine-Button-root` rules, and (because the template chunk's CSS is
injected after `mantine.css`) it also beats the shared fill rules above at equal specificity where
one applies. Set real properties (`background`, `border`, `box-shadow`), not Mantine's `--button-*`
variables — those arrive as an inline `style` attribute, which always outranks a stylesheet rule.

### Supported hooks outside the parts table

Two global classes and one Mantine selector are stable, documented hooks a template may target for
looks beyond a plain on/off: `.glass` / `.glass-soft` (frosted sticky chrome, from
`styles/chassis.css`) and Mantine's static `.mantine-Overlay-root`. Prefer the `glass` token
(`data-sf-glass`) to switching blur off entirely by hand; reach for these selectors only for a
template-specific treatment of the frosted look itself.

**Block styles (escape hatch).** Owners style blocks with `data-sf-style` / `data-sfs-*` attributes
at specificity (0,4,0). A template whose design genuinely breaks under an owner value may override
at equal specificity in its `template.css` (which loads after the main bundle, so it wins), e.g.
`:root[data-sf-template="<id>"] [data-sf-style="Header"][data-sfs-bg] { … }`. This is the only
supported style hook; use it sparingly — the owner chose that value.

## 5. Slots

`web/src/templates/slots.ts` (types only):

```ts
import type { ComponentType, ReactNode } from 'react';
import type { Brand, LayoutKind, SupportLink } from '@/types/settings.ts';
import type { OptionValues, Scheme, TemplateTokens } from '@/templates/define.ts';

/** Filled in by <Slot> — callers never pass these. */
export interface SlotBaseProps {
  brand: Brand;
  options: OptionValues;   // resolved: manifest defaults ⊕ stored values
  scheme: Scheme;
  layout: LayoutKind;      // 'storefront' | 'menu' | 'webapp' (always 'webapp' inside Telegram)
  tokens: TemplateTokens;
}
/** Above the header, first child of both shells (not on a chromeless page). */
export type TopBarProps = SlotBaseProps;
/** StorefrontShell: replaces the footer. MenuShell: rendered after <main>, before the contact strip. */
export interface FooterProps extends SlotBaseProps { supportLinks: SupportLink[]; hasChat: boolean }
/** Catalogue intro. grid = ProductGrid hero; list = ProductList welcome; wholesale = WholesaleCatalogPage welcome. */
export interface CatalogHeroProps extends SlotBaseProps {
  surface: 'grid' | 'list' | 'wholesale';
  tagline: string;
  welcomeMessage: string | null;
  productCount: number;
  categoryCount: number;
}
/** Eyebrow above a heading. page = the catalogue page title (index 1); group = a menu-layout category section (1-based). */
export interface SectionLabelProps extends SlotBaseProps { index: number; title: string; level: 'page' | 'group' }
/** Fixed decoration layer, last child of every shell. Must be pointer-events: none. */
export type OverlayProps = SlotBaseProps;
/** Trailing adornment inside primary buttons. cta = the page's single main call to action.
 *  busy (optional) = the action behind this button is in flight (e.g. checkout's Place order
 *  while the order is being submitted) — a template may swap in a spinner glyph; callers that
 *  never have an in-flight state simply omit it. */
export interface ButtonAdornmentProps extends SlotBaseProps { variant: 'primary' | 'secondary'; cta: boolean; busy?: boolean }

export interface SlotPropsMap {
  TopBar: TopBarProps;
  Footer: FooterProps;
  CatalogHero: CatalogHeroProps;
  SectionLabel: SectionLabelProps;
  Overlay: OverlayProps;
  ButtonAdornment: ButtonAdornmentProps;
}
export type SlotName = keyof SlotPropsMap;
export type TemplateSlots = { [K in SlotName]?: ComponentType<SlotPropsMap[K]> };
export interface TemplateModule { slots?: TemplateSlots }
export type SlotChildren = ReactNode;
```

**Where each slot renders and what modern's default does:**

| Slot | Renders | Modern's default |
|---|---|---|
| `TopBar` | first child of `StorefrontShell` and `MenuShell` (not on `Chromeless`, not in `WebAppShell` — Telegram owns the top of the screen there) | nothing |
| `Footer` | `StorefrontShell`: replaces the footer. `MenuShell`: after `<main>`, before the contact strip | today's three-column footer + colophon (storefront layout only — nothing in the menu layout); `WebAppShell`: not rendered |
| `CatalogHero` | catalogue intro (grid/list/wholesale) | today's hero/welcome markup per surface |
| `SectionLabel` | eyebrow above a heading | nothing for `label.style === 'plain'`; `[Title]` for `'bracket'`; `/01` (1-based, zero-padded) for `'numbered'` groups, and `/00` for the page label, so the first group keeps `/01` — mono, 11px, `--sf-primary`, `data-sf-part="section-label"` |
| `Overlay` | fixed decoration layer, last child of all three shells (must be `pointer-events: none`) | nothing |
| `ButtonAdornment` | trailing adornment inside primary buttons | nothing |

A template-provided slot component is wrapped by `<Slot>` (`runtime.tsx`) in a
`data-sf-slot="<Name>" style="display:contents"` element before rendering — a `<span>` for
`ButtonAdornment` (it renders inside `<button>`, where only phrasing content is valid) and a
`<div>` for every other slot; a default slot renders unwrapped, so modern's DOM is byte-identical
to before templates existed.

The `webapp` layout (Telegram Mini App, or any store that picks it for browsers) renders no
`TopBar` and no `Footer`. It does render `CatalogHero`, `SectionLabel`, `Overlay` and
`ButtonAdornment`, exactly as the menu layout does. A template that branches on `layout` should
treat `'webapp'` like `'menu'` unless it has a reason not to; external templates built before
this value existed keep working because every built-in check is `layout !== 'storefront'`.

**Cart-bar merge pattern.** The mobile cart bar root (`MobileCartBar`) carries
`data-sf-part="cart-bar"`. A template restyles it from its own `template.css`
(`:root[data-sf-template="x"] [data-sf-part="cart-bar"] {...}`) and hides its own bottom status
element while `useMobileCartBar()` returns `true`. Keep that status element in normal flow at the
end of the `Footer` slot (not `position: fixed`) so it never needs page clearance of its own.

## 6. Hooks and components

`web/src/templates/contract.ts` is the only module a template imports from (besides `define.ts` in
a manifest):

```ts
export * from '@/templates/define.ts';
export type * from '@/templates/slots.ts';
export { useTemplate, useTemplateOptions, useCoreOptions, useStorefront, useCatalogStats, useOrderingState, formatClock, utcOffsetLabel } from '@/templates/hooks.ts';
export type { TemplateInfo, CoreOptions, StorefrontInfo, CatalogStats, OrderingState } from '@/templates/hooks.ts';
export { useServerClock, useCutoffInfo } from '@/lib/server-clock.ts';
export type { CutoffInfo } from '@/lib/server-clock.ts';
export { useMobileCartBar } from '@/features/cart/MobileCartBar.tsx';
export { Brand } from '@/components/Brand.tsx';
export { ContactLinks } from '@/components/ContactLinks.tsx';
export { ArrowUpRightIcon } from '@/components/icons.tsx';
export type { GlyphProps } from '@/components/icons.tsx';
export { Link } from 'react-router';
```

Hook signatures:

```ts
interface TemplateInfo { id: string; presetId: string; scheme: Scheme; options: OptionValues; tokens: TemplateTokens }
useTemplate(): TemplateInfo
useTemplateOptions(): OptionValues
interface CoreOptions {
  showPageTitle: boolean; showCatalogIntro: boolean; showSectionLabels: boolean;
  showSku: boolean; showCategoryPicker: boolean;
  headerAccountIcon: HeaderIconMode; headerCartIcon: HeaderIconMode;   // 'all' | 'desktop' | 'mobile' | 'none'
  showCutoffBar: boolean; cutoffMessage: string; showCutoffCountdown: boolean;
  showCategoryEmoji: boolean; showOutOfStockPrice: boolean;
}
useCoreOptions(): CoreOptions                                                           // only an explicit false (or a non-default choice) hides
interface StorefrontInfo { brand: Brand; features: Features; supportLinks: SupportLink[]; welcomeMessage: string | null; currency: string; enabled: boolean }
useStorefront(): StorefrontInfo
interface CatalogStats { productCount: number | null; categoryCount: number | null }   // null while loading
useCatalogStats(): CatalogStats
interface OrderingState { enabled: boolean; ordering: boolean; accepting: boolean }    // accepting = enabled && ordering
useOrderingState(): OrderingState
useServerClock(intervalMs?: number /* default 1000 */): Date                            // server-anchored (settings fetch time), ticks
interface CutoffInfo { timezone: string; next: { day: DayKey; cutoff: string; shipsOn: string; isToday: boolean; at: Date; msRemaining: number } | null }   // declared in lib/server-clock.ts
useCutoffInfo(): CutoffInfo                                                               // re-evaluated every 30 s
useMobileCartBar(): boolean                                                               // phone cart bar on screen
formatClock(date: Date, timeZone: string): string        // 'HH:MM:SS', 24h; bad zone → UTC
utcOffsetLabel(date: Date, timeZone: string): string     // 'UTC+1' | 'UTC-5' | 'UTC+5:30' | 'UTC+0'
```

`useServerClock`/`useCutoffInfo` anchor to the settings query's fetch time (`serverTime` +
`settingsFetchedAt()`), not the component's mount time — so a clock slot that mounts minutes after
the last settings fetch (a late chunk, a shell switch, a preview template switch) still reads the
server's real "now", not a frozen response.

**Components:**

- `Brand` (`components/Brand.tsx`) — the logo/name lockup.
- `ContactLinks` (`components/ContactLinks.tsx`) — the shop's WhatsApp/Telegram/support links.
- `ArrowUpRightIcon(props: GlyphProps)` — the shop's `↗` glyph (24-unit viewBox, 1.6 stroke, square
  caps, `currentColor`). `GlyphProps = { size?: number | string } & Omit<SVGProps<SVGSVGElement>,
  'width' | 'height'>`: `size` defaults to 13 (px; pass `'1em'` to follow the font size), and any
  other SVG prop (`className`, `data-*`, …) is spread onto the `<svg>`.
- `Link` — re-exported from `react-router` so a template never needs its own dependency on it.

## 7. Mobile rules (every template)

Every template — built-in or imported — must satisfy, on every page it touches:

- no horizontal scroll at 360px
- tap targets ≥ 44px
- decorations collapse or hide at the breakpoints the template declares
- safe-area insets respected (`env(safe-area-inset-*)`)
- overlays `pointer-events: none`
- `prefers-reduced-motion` honoured
- inputs stay 16px (iOS zoom guard)

This is enforced by `e2e/templates.spec.ts`, which runs a `template × preset × layout × viewport`
matrix (`TEMPLATE_CASES`, widths 360/390/768/1280 for the storefront layout and 390/1280 for the
menu layout) through catalog → product detail → cart → checkout, asserting no horizontal overflow
at every step, an unobstructed 44×44 cart-bar checkout target on phone widths, and — for templates
whose case sets `tapTargets: true` — that every element inside a `[data-sf-slot]` wrapper is either
not interactive/not visible/`pointer-events: none`, or at least 44×44 in **both** dimensions
(`expectSlotTapTargets` / `findSmallSlotTapTargets`; modern ships no slots, so its case sets
`tapTargets: false`). A separate test (`every template in the catalog has a matrix case`) fails the
suite if `/templates.json` ever lists a template id with no `TEMPLATE_CASES` entry.

**To add a case** for a new built-in or imported template, append a `{ template, preset,
tapTargets }` entry to `TEMPLATE_CASES` in `e2e/templates.spec.ts` for each preset worth covering
(`tapTargets: true` once the template ships slot components with interactive content).

## 8. Adding a built-in template

```bash
npm run template:new -- <id>
```

Scaffolds `web/src/templates/<id>/` from `scripts/template-starter/*.tpl` (`manifest.ts`,
`index.ts`, `template.css`, `README.md`, with `__ID__`/`__NAME__` filled in) via
`scripts/new-template.mjs`. Refuses a bad id (must match `TEMPLATE_ID_RE`), a reserved name
(`external`, `defaults`), or a folder that already exists. Then:

1. Edit the manifest, slots and CSS.
2. Add a `TEMPLATE_CASES` entry in `e2e/templates.spec.ts` (see [§7](#7-mobile-rules-every-template)).
3. `npm test && npm run test:e2e`.

## 9. Importing a template from git

A template can also live in another repository and be vendored in at build time. The naming and
import rules are centralised in **one** module, `scripts/template-rules.mjs` (imported by
`fetch-templates.mjs`, `templates-lock.mjs`, `template-imports.mjs` and `new-template.mjs`, so
nothing re-declares them):

- **Reserved folder names**: `external`, `defaults` — never a valid template id.
- **Template id**: `/^[a-z0-9-]{1,40}$/` (`TEMPLATE_ID_RE`).
- **Lock ref**: `/^[0-9a-f]{40}$/` — a full, lowercase commit SHA. Branches and tags are rejected;
  a moving ref would make a "reviewed" template mutate under a client without another review.
- **Repo URL** (`REPO_RE`): `https://…`, `ssh://…`, `file://…`, or `git@host:path` (scp-style).
  A bare value or anything starting with `-` is rejected outright, and the host portion of
  `ssh://`/`https://`/scp-style forms may also not start with `-` — both `repo` and `ref` are
  passed to `git fetch` after a literal `--`, so this closes the door on git/ssh reading either as
  an option (arbitrary command execution via a malicious `templates.lock.json`). `file://` stays
  allowed unconditionally: the lock is maintainer-authored, the transport is separately pinned
  (`protocol.allow=never` plus explicit `https`/`ssh`/`file` allows in the actual `git` invocation),
  and every fetched folder still runs the full shape/import/symlink validation below regardless of
  transport — tests rely on `file://` to fetch fixture repos.
- **Import allowlist**: the same one a template's own files are held to — `@/templates/contract.ts`
  (or `.ts`-less), `@/templates/define.ts` (manifest.ts only), `react` / `react/jsx-runtime`, and
  relative files/`.css` that resolve inside the template's own folder.

**Repo root = template folder.** `manifest.ts` and `index.ts` must sit at the repository root (not
in a subdirectory) — exactly the same shape as a built-in template.

**To pin one**, add an entry to `templates.lock.json`:

```json
{ "templates": [{ "id": "acme-noir", "repo": "https://github.com/acme/storefront-template-noir.git", "ref": "3f2a1b9c4d5e6f708192a3b4c5d6e7f809102a3b" }] }
```

Then run:

```bash
npm run templates:fetch
```

which vendors it into `web/src/templates/external/<id>/` (gitignored) and validates it. The `web/`
workspace's `predev`/`prebuild` scripts already call this automatically, so a fresh `npm run dev`
or `npm run build` always fetches whatever is pinned. **Private repos** need a
`TEMPLATES_DEPLOY_KEY` GitHub Actions secret — a read-only deploy key added to the template repo —
which `.github/workflows/release.yml` loads into an `ssh-agent` before the fetch step whenever it
is set (it's a no-op for public repos).

**What the fetch rejects** (`validateTemplateDir` in `fetch-templates.mjs`, run on every entry
before it's trusted, removing the folder again on any failure):

- any symlink anywhere in the template folder
- a missing `manifest.ts` or `index.ts` at the repo root
- a `package.json` declaring dependencies (a template may use only the storefront contract and React)
- a manifest whose declared `id` doesn't equal the lock's `id` for that entry — read via the
  TypeScript AST straight off the `defineTemplate({...})` call's own `id:` property, not a text
  match, and rejected outright (not just ignored) if the manifest uses a spread, a computed
  property name, a string-literal-keyed `'id'`, a getter/setter/method/shorthand `id`, or declares
  `id` more than once — none of those can be statically verified to match at runtime
- a forbidden import anywhere in a `.js/.jsx/.ts/.tsx/.mjs/.cjs/.mts/.cts` file (parsed with the
  TypeScript compiler API, not a regex, so formatting/comments/template-literal specifiers can't
  hide one) — including `import.meta.glob`/`globEager` and a `new URL(x, import.meta.url)` whose
  path leaves the folder
- a relative import carrying a query string, unless it is exactly `?inline`, `?url` or `?raw` on a
  `.css` path (a query can switch Vite's loader, or make it read `./x.foo?.css` as CSS)
- a forbidden reference in any `.css` file (extension matched case-insensitively) — see below
- any stylesheet that isn't plain `.css` (`.pcss`, `.postcss`, `.sss`, `.scss`, `.sass`, `.less`,
  `.styl`, `.stylus` are all rejected; Vite would run these through their own preprocessors)
- any CSS module (`*.module.css`), as a file or as an import — templates ship plain global `.css`

**CSS references.** Built on a hand-written CSS Syntax Level 3 tokenizer
(`scripts/css-tokenizer.mjs`) rather than decode-then-regex, because decoding CSS escapes before
finding string/paren boundaries is unsound (an escaped quote or `)` can become a real delimiter and
desync every token after it). A *reference* — a `url()` token, a string directly inside
`url()`/`image-set()`/`-webkit-image-set()`/`src()`, an `@import` target, or **any raw `url(…)` text
anywhere in the file, including inside comments and string/content values** (Vite's own CSS url
rewriter is a regex, so it rewrites those too) — is allowed only when it is `data:…`, `#fragment`,
or a `./`/`../` path that resolves *inside* the template folder. Everything else is rejected: a bare
or aliased specifier (`@/…`, `~pkg`, `img/a.png`), any other scheme, `//host`, root-absolute `/…`.
A *candidate* — a string that isn't itself a reference but could be substituted into one (inside a
custom-property value, a `var()` fallback, anywhere inside an `@property` block (its `initial-value`),
or nested under a URL-taking function) — is flagged only when it looks like it would actually leave
the template (a network scheme, `@/`/`~`, or an escaping relative path); ordinary text (`content`,
`font-family`, attribute selectors) is never inspected. Not checked at all: bare strings passed to
other (non-URL-taking) functions, and `blob:` / `mailto:` style candidates.

This is a **guardrail for reviewed first-party code, not a sandbox** — see [§10](#10-trust).

## 10. Trust

An imported template runs as first-party code in every client's storefront. Adding or bumping one
in `templates.lock.json` is a code-review decision: **read the diff at the new SHA before
merging.** The import scanner (import allowlist + CSS reference allowlist + symlink rejection)
exists to catch mistakes and make an obviously hostile change loud, not to make an unreviewed
template safe to run.

## 11. Catalog and preview

The build emits `web/dist/templates.json` (also served at `/templates.json` in dev, always
`no-store`), shaped exactly as `TemplatesCatalog` in `web/src/templates/catalog.ts`:

```ts
export interface CatalogTemplate {
  id: string; name: string; version: string; description: string; author: string;
  schemes: Scheme[]; presets: TemplatePreset[]; defaultPreset: string;
  editable: TemplateEditable; options: TemplateOption[];
  preview: string | null;
  builtIn: boolean;
}
export interface TemplatesCatalog { schemaVersion: 1; templates: CatalogTemplate[] }
```

Each entry's `options` starts with the twelve core options (`showPageTitle`, `showCatalogIntro`,
`showSectionLabels`, `showSku`, `showCategoryPicker`, `headerAccountIcon`, `headerCartIcon`,
`showCutoffBar`, `cutoffMessage`, `showCutoffCountdown`, `showCategoryEmoji`, `showOutOfStockPrice`), then the template's own — the catalog is built from the registry, which adds
them. Templates are sorted `modern` first, then other built-ins, then imported templates, each group
alphabetical by name. A template's preview image (if it declares one) is copied to
`templates/<id>/preview.<ext>` in the build output and served at `/templates/<id>/preview.<ext>` in
dev; a manifest that declares a `preview` path whose file doesn't exist fails the build with a
clean `Invalid templates:` error (never a raw `ENOENT` from the copy step). The backend captures
this file on deploy so the admin's Appearance picker knows which templates a given release ships.

**Preview mode.** The admin's Appearance editor frames the live storefront at `/?sf-preview=1` and
posts draft themes into it. `isPreviewMode()` requires both the query param and `window.parent !==
window`, and decides once per window (cached on first evaluation, primed when the module loads), so
an in-frame SPA navigation that drops `?sf-preview=1` never turns a preview frame back into a
persisting visitor page; `subscribePreview()` then accepts a message only when `event.source === window.parent` and
it parses against the exact zod shape (`previewMessageSchema` in `theme-schema.ts`,
`{ type: 'sf-preview-theme', theme: <the stored-theme shape> }`) — anything else (wrong origin,
malformed payload) is silently ignored. The message's `customCss` is **always** dropped before the
theme is applied (`{ ...parsed.data.theme, customCss: '' }`) — the previously-saved, backend-sanitised
custom CSS keeps applying instead, so a frameable preview page can never be used to exfiltrate typed
input through arbitrary CSS. `applyDocumentTheme(theme, brand, { persist: false })` is used in
preview mode, so nothing a preview ever applies is written to `localStorage`.

## 12. Built-in templates

| Id | Schemes | Presets | Locked | Options |
|---|---|---|---|---|
| `modern` | dark, light | Default | nothing | — (core options only) |
| `dark-luxury` | dark | Gold (default), Silver, Emerald, Crimson | fonts, radius | `grain`, `orb`, `showFooter`, `statusBadge` (all on) |
| `cyber-brutalism` | dark, light | Acid Dark (default), Purple Light | fonts, radius (always square) | `systemBar`, `statusBar`, `crosshairs`, `showFooter`, `buttonArrow` (on), `nodeLabel` (text, `NODE_01`, ≤ 24) |
| `bento` | dark, light | one dark + one light per store type: Tech & electronics (`tech-dark` default), Fashion & apparel, Beauty & wellness, Home & lifestyle, Food & grocery, Monochrome | fonts, radius | `dispatch`, `contact`, `featured`, `showFooter` (all on) |

Every template also has the twelve core options (section 2, "Presets, `editable` locks and options"). `showFooter` removes the template's
`Footer` slot outright (the luxury status badge and the brutalist status strip live in it, so they
go too); `buttonArrow` removes the brutalist ↗ `ButtonAdornment`.

Button style (fill, case, weight, tracking) comes from each template's tokens and is never
admin-editable, for any template.

Both non-default templates read real store data for their decoration: the ordering flag
(luxury footer badge, brutalist readout), the catalogue size (hero badge, `SKU:`), and the
next dispatch cut-off and its timezone (brutalist clock and readout). They are worked
examples of the contract: `web/src/templates/dark-luxury/` and
`web/src/templates/cyber-brutalism/`.

`bento` (brief: `designs/bento/DESIGN.md`) turns the catalogue intro into a shop board of
real-data cells (product count, categories, ordering status, next dispatch cut-off, chat links)
and promotes the first catalogue product to a large tile through the `product-grid` part. Its
`featured` option can't reach `<html>` as an attribute, so the `Overlay` slot renders a hidden
`[data-bento-featured="off"]` marker when it is off and `template.css` keys the promotion on
`:root:not(:has(...))` — the pattern to copy when an option must switch pure CSS.

Preview images are regenerated with
`CAPTURE_PREVIEWS=1 E2E_REAL_FONTS=1 npm run test:e2e -- template-previews.spec.ts`.
