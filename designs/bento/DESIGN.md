# Bento Storefront Design Guidelines

The bento grid, adapted for a shop. The source brief is `designs/bento-grid/DESIGN.md` (a
landing-page pattern); this version keeps its grid vocabulary, colour discipline and accent-by-
content-type rule, and re-points all of it at the job a storefront actually has: **show what is
for sale, prove the shop is open and ships, and get a product into the cart in as few taps as
possible — on a phone first.**

Implemented as the built-in storefront template `bento` (`web/src/templates/bento/`).

---

## What a Bento Storefront Is

A bento grid divides content into asymmetric cells of different sizes on one shared grid, so the
**size of a cell states its importance**. On a landing page the cells hold features. In a shop
they hold two things:

1. **The shop board** (catalogue intro) — a small bento of the shop's real facts: what it is,
   how much it stocks, when the next dispatch closes, whether it's taking orders, how to reach it.
2. **The product grid** — product tiles on the same grid, where the first product is promoted to
   a hero tile and the rest keep an even rhythm, so the eye lands on one product before it scans.

Every other page (product detail, cart, checkout, account) keeps its structure and only takes the
bento surface language: identical rounded cells, one border weight, one elevation step, the accent
held back for the thing you're meant to press.

---

## Grid Architecture

### Base grid

| Viewport | Shop board | Product grid |
|---|---|---|
| ≥ 75em (1200px) | 4 columns | 4 columns |
| 48em–75em | 4 columns (stacked areas) | 3 columns |
| < 48em (phone) | 2 columns | 2 columns |
| < 22.5em (360px) | 2 columns, hero full-width | 2 columns |

```
gap: 12px;          /* phone */
gap: 16px;          /* ≥ 48em — pick one per breakpoint, never mix inside a grid */
```

### Cell size vocabulary

| Name | Span | Shop use |
|------|------|----------|
| **Hero** | 2×2 | The shop's tagline + welcome (board); the first product (grid) |
| **Wide** | 2×1 | Dispatch cut-off; contact links |
| **Tall** | 1×2 | Product count (the stat cell) |
| **Small** | 1×1 | Categories count; ordering status |

### The shop board layout

Desktop:

```
"hero  hero  stock  cats"
"hero  hero  stock  open"
"ship  ship  talk   talk"
```

Phone (2 columns):

```
"hero  hero"
"stock cats"
"stock open"
```

On phones the `ship` and `talk` cells are hidden: the shell's cut-off bar and the footer already
carry the same facts, and two more full-width rows would push the first product below the fold.

A cell only renders when it has real data — no cut-off configured means no `ship` cell, no chat
channels means no `talk` cell. The grid uses `grid-auto-flow: dense` so a missing cell never
leaves a hole. **The hero must win within one second**: if the tagline is empty, the welcome
message takes the hero; if both are empty, the board collapses to the stat row only.

### The product grid rhythm

- Tile 1 is the **hero product**: 2×2 on ≥ 48em, full-width (2×1) on phones. Its photo loads
  eagerly and its name is set a step larger (in the display face).
- Every other tile is 1×1. Never promote more than one product per page — two heroes means none.
- A category page promotes its own first product, so every category opens on a focal point.
- Image-less catalogues fall back to the row list; no hero tile is invented for them.

### Cell count

- Shop board: **4–6 cells** (it's an intro, not a dashboard).
- Product grid: unbounded — the rhythm above is what keeps a long grid readable.

---

## Color

### The 70/20/10 rule

| Proportion | Role | Shop usage |
|------------|------|-------|
| **70%** | Base background | The page canvas |
| **20%** | Elevated surface | Every cell, product tile, card, sheet, input |
| **10%** | Accent | The stat cell, primary buttons (Add, Checkout, Place order), focus rings, the active category |

The accent never goes on prices, product names or body copy. A shopper should be able to find the
button they need by colour alone — that only works while nothing else is accent-coloured.

### Dark palette
```css
--bg:            #0a0a0a;
--surface:       #141414;
--border:        rgba(255, 255, 255, 0.08);
--text-primary:  #f0f0f0;
--text-muted:    #8f8f8f;
```

### Light palette
```css
--bg:            #f5f5f4;
--surface:       #ffffff;
--border:        rgba(0, 0, 0, 0.08);
--text-primary:  #111111;
--text-muted:    #62626b;
```

### Accent colour by store type (kept from the source brief)

The accent is chosen by **what the shop sells**, and each one is a preset in the `bento` template.
Light presets use a darker step of the same hue so the accent — and white text on an accent
button — clears 4.5:1 contrast.

| Store type | Preset ids | Dark accent | Light accent |
|---|---|---|---|
| **Tech & electronics** | `tech-dark` (default) / `tech-light` | Electric blue `#3b82f6` | `#2563eb` |
| **Fashion & apparel** | `fashion-dark` / `fashion-light` | Coral `#f97316` | `#c2410c` |
| **Beauty & wellness** | `wellness-dark` / `wellness-light` | Teal `#14b8a6` | `#0f766e` |
| **Home & lifestyle** | `home-dark` / `home-light` | Amber `#f59e0b` | `#b45309` |
| **Food & grocery** | `grocery-dark` / `grocery-light` | Leaf green `#40c057` | `#237032` |
| **Monochrome** (any store) | `mono-dark` / `mono-light` | `#f0f0f0` | `#111111` |

Colours stay admin-editable, so a store can still push its own brand accent — the presets are the
starting point per store type, not a lock.

---

## Typography

- **Display**: Bricolage Grotesque, 600–800 — tagline, page titles, stat numbers, product names in
  the hero tile. Its optical-size contrast carries the personality; nothing else needs to.
- **Body**: the storefront's self-hosted Inter — body copy, UI, product names in regular tiles.
  Inter as body only, never as display.
- **Numbers** (prices, counts, cut-off times): the body face with tabular figures, not a mono
  face. Prices must line up down a column and read as money, not as code.

### Type scale in cells

| Role | Size | Weight |
|---|---|---|
| Board hero headline | `clamp(1.75rem, 4.5vw, 3.25rem)` | 700, -0.03em |
| Stat number | `clamp(3rem, 7vw, 4.75rem)` | 800, -0.04em, accent-cell text |
| Cell headline | 1rem–1.125rem | 600 |
| Cell caption | 0.8125rem | 500, sentence case, muted |
| Hero product name | 1.25rem | 700 |
| Tile product name | 0.875rem | 600 |

Captions are sentence case ("Products in stock", "Next dispatch closes") — no tracked-out
uppercase eyebrows.

---

## Icons

Real SVG icons only, drawn from **Lucide** (ISC). A storefront template may not import packages,
so the handful the board needs (`package`, `layout-grid`, `truck`, `message-circle`, `circle`)
are inlined as small components in the template folder. 20px, 1.75 stroke, `currentColor`,
always `aria-hidden` — the caption next to the icon carries the meaning.

---

## Cell Anatomy

```css
.bento-cell {
  border-radius: 18px;            /* the same on every cell, tile, card and sheet */
  padding: 20px;                   /* hero cells: 28–40px — padding scales with span */
  border: 1px solid var(--border);
  background: var(--surface);
}
```

Buttons are the one deliberate exception to the shared radius (12px) — they sit *inside* cells,
and a nested radius must be smaller than its container's to look concentric.

### Board cells

- **Hero (2×2)** — tagline as the headline, welcome message beneath. No button: the product grid
  is directly below, and the header already carries search and cart.
- **Stock (1×2, accent)** — the product count as a giant number on an accent-filled cell. The
  only accent-filled cell on the page.
- **Categories (1×1)** — category count with the `layout-grid` icon.
- **Open (1×1)** — ordering status: "Taking orders" (success) or "Ordering paused" (warn), from
  the store's real ordering flag.
- **Ship (2×1)** — the next dispatch cut-off and the day it ships, from the store's real
  dispatch schedule. Hidden when no schedule is configured, and on phones.
- **Talk (2×1)** — the store's WhatsApp / Telegram links, each ≥ 44×44. Hidden on phones
  (the footer carries them).

### Product tile

Photo well on top (square, `contain` — labels must not be cropped), then name, flags, and the
price rail with the quick-add. The hero tile shows the same photo, larger.

---

## Motion

- **One entrance moment**: the shop board's cells arrive in a single 60ms stagger when the
  catalogue first paints. Product tiles already have the app's own row stagger — don't add a
  second one.
- **Hover lift** on product tiles only (`translateY(-3px)`, spring easing, `hover: hover`
  devices only). Board cells are information, not links — they don't move on hover.
- **No sibling dimming** — in a shop it greys out products the shopper might want.
- Only `transform` and `opacity` animate; everything is inside
  `prefers-reduced-motion: no-preference`.
- Phones get `:active` press feedback (`scale(0.98)`) instead of hover.

---

## Mobile Rules (non-negotiable)

- No horizontal scroll at 360px.
- Every tap target ≥ 44×44, including contact links inside board cells.
- Board cells never hold a primary action — the mobile cart bar owns the bottom of the screen.
- Safe-area insets respected on the footer.
- Inputs stay at 16px (iOS zoom guard).
- The hero product tile goes full-width on phones, never 2×2 — a 2×2 tile on a 2-column phone grid
  pushes the second product below the fold.

---

## Anti-Patterns

| Anti-pattern | Why it fails in a shop |
|---|---|
| Invented stats ("10k happy customers", "4.9★") | A shop's numbers must be true. Only real store data goes in a cell. |
| Every product tile a different size | The grid stops reading as a catalogue; shoppers lose their place |
| More than one hero product | Two focal points = none |
| Accent on prices or names | The buttons stop being findable by colour |
| Emojis as icons | Inconsistent sizing, no stroke control |
| Mono face on prices | Reads as code, not money |
| A primary CTA inside the board | Competes with the cart bar and the product grid |
| Inconsistent radius | Breaks the cell language instantly |
| Animating layout properties | Layout thrash on low-end phones |
| Hover-only affordances | Phones have no hover |

---

## Checklist Before Shipping

- [ ] Board hero is visually dominant; first product tile is the only promoted product
- [ ] Accent appears on the stat cell and primary buttons only
- [ ] Bricolage Grotesque on display text; body stays Inter; prices in tabular figures
- [ ] Lucide SVGs, `aria-hidden`, no emojis
- [ ] Board cells only render with real data; no holes when one is missing
- [ ] One entrance stagger; hover lift on product tiles only; reduced motion honoured
- [ ] 360 / 390 / 768 / 1280 all free of horizontal scroll; all tap targets ≥ 44px
- [ ] One radius (18px) on every cell, tile, card and sheet; buttons 12px
- [ ] Every store-type preset passes 4.5:1 for accent on background and button label on accent
