# Visual review: dark-luxury and cyber-brutalism templates

- **Date:** 2026-09-28
- **Commit reviewed:** `cb47226` (branch `feature/storefront-templates`, both templates complete)
- **Briefs:** `designs/dark-luxury/DESIGN.md`, `designs/cyber-brutalism/DESIGN.md`, the `dark-luxury`
  and `cyber-brutalism-design` skills, spec §4.2–4.4 plus amendments 10–13.
- **Capture command:** `E2E_REAL_FONTS=1 npm run test:e2e -- templates.spec.ts templates-decor.spec.ts`
  (38/38 passed, real Google Fonts). Output: `docs/screenshots/templates/` (gitignored).

## How the screenshots were read

`templates.spec.ts` screenshots as soon as the page heading is visible. The shared entrance
animations (`anim-row`, `anim-fade-stagger`) and the drawer slide-in are still running at that
point, so the matrix shots show dimmed rows, half-faded cards and a drawer part-way off the right
edge. Modern's shots show the same thing, so this comes from how the matrix captures, and the
templates are not at fault. To judge the templates' settled look, the same flow was run a second
time from a throwaway spec (deleted after the review, never committed). It waits for every finite
animation to finish before each shot and also captures the phone cart bar. A second throwaway spec
captured the un-hovered detail CTA and AddToCart's "Added" state. Both sets went to a scratch folder
outside the repo. Two artefacts of `fullPage: true` were ignored: fixed or sticky chrome drawn
part-way down the page, and the menu shell's inner scroller cutting the list short.

## Dark Luxury (Gold) checklist

- [x] No button with an accent fill. Primary buttons are dark with an accent border and a visible
  glow (grid Add, detail CTA, drawer and cart-page Checkout, checkout Continue, cart-bar Checkout).
  The disabled "Out of stock" button is grey with no glow.
- [x] Custom CTAs (Add, Add · £42.50, Checkout, Continue, cart-bar Checkout) use the body font with
  no caps and no tracking, the same voice as the Mantine buttons.
- [ ] Page and group titles 700 with tight tracking on every page. Grid, menu page title and product
  detail pass. **Menu list group titles fail**: see defect N2.
- [x] Cards are borderless and 16px-rounded, with content inset from the fill and an inset top
  highlight as the edge. The hover lift is gated on `(hover: hover) and (prefers-reduced-motion:
  no-preference)` (template.css).
- [x] Headline contrast comes from colour, not weight ("Small-batch supply, shipped" dim, "from
  Leeds." bright, same 700 weight). No 300 weights anywhere.
- [x] `[Catalogue]`, `[01]`…, `[Support]`, `[Talk to us]` bracket labels are mono in the accent. No
  `— dashes —`. The shared small-caps eyebrows (CATEGORIES, PROVENANCE, BUY MORE, PAY LESS) are
  shared components, not labels the template owns.
- [x] Exactly one orb, elliptical, at the bottom centre of the hero. The grain is visible but faint.
- [x] The footer sits inside a rounded elevated panel with a green `[ACCEPTING ORDERS]` badge. The
  menu layout shows the compact badge panel.
- [x] The accent is used surgically: labels, borders, prices, the dispatch progress line. It is
  never a large fill.
- [ ] 360 px: no clipped text, a readable hero, and a one-column footer. Hero and footer pass.
  **Card price is covered by the button**: see defect N1.

## Cyber Brutalism (Acid Dark, Purple Light) checklist

- [x] Zero radius on buttons, cards, inputs, badges (cart count), drawer, menu sheet, chips and qty
  steppers. The only round element is the 8px status dot, which the skill itself specifies.
- [x] No shadows, blur or gradients. The drawer and sheet overlay is a solid dim (glass off). The
  hazard stripe (Acid Dark) is the only gradient. Purple Light uses the skill's bold rule instead.
- [x] System bar sits above the header, `/01` numbering is present, and crosshairs appear in the
  hero, the footer and the viewport corners at 768 and 1280. They are hidden at 360 and 390. The
  viewport crosshair overlaps the system bar text ("+SYS.TIME") at 1280, and also at 768. This is
  known issue K1.
- [ ] Headings uppercase Tektur 700 on every page, left-aligned, with readouts in Share Tech Mono.
  Grid, menu page title, menu group titles and the storefront product detail pass. **The menu
  layout's product sheet title is mixed case**: see defect N4.
- [x] Custom CTAs are Tektur 600 caps at 0.04em (not mono micro-caps). Add to cart hollows out while
  it says "Added" (measured: background `rgba(accent, ~0.05)`, accent text, accent border, both
  presets, 390 and 1280). The main detail-page CTA loses its `↗` under 768: see defect N3.
- [x] Product-card content is inset from its 1px border. Footer crosshairs sit inside the footer box.
- [x] Phone cart bar: the `● CONNECTION SECURE · > CART LOADED_` strip fits above the checkout and
  nothing is hidden under the bar (the e2e check `expectCartBarUnobstructed` passes). The blocked
  cart's disabled look is pinned by the existing unit and e2e tests. The matrix does not produce a
  blocked-cart screenshot.
- [x] One accent only: acid on dark. On light it is purple, with acid only on the ink bars (status
  strip and cart bar: `#111` with acid text). The green (IN STOCK, savings) and amber (LOW STOCK)
  are the shared semantic status colours and act as status, not decorative accents.
- [x] A bottom status strip is present. On phones with a cart it becomes the cart bar, never two
  stacked bars.
- [x] 360 px: the system bar is one line (`SYS.TIME 10:00:00 · NODE: NODE_01`), the hero name wraps,
  and there is no horizontal scroll (asserted by the matrix at every step). The card price/button
  overlap is the same as in luxury: see defect N1.

## Known issues (queued for the plan's final fix wave, recorded, not fixed here)

- **K1:** the viewport crosshair (`CyberOverlay`, top-left) overlaps the system bar text
  ("+SYS.TIME") at 1280, and at 768 too. Seen in
  `cyber-brutalism-{acid-dark,purple-light}-storefront-{768,1280}-1-catalog.png` and
  `…-menu-1280-1-catalog.png`.
- **K2:** the shared filled-button hover (`--sf-primary-soft` = mix(primary, bg, .75) with `--sf-bg`
  text) is unreadable on both brutalism presets. It appears as the sticky hover after a tap: "ADD
  ANOTHER" is dark text on dark olive (Acid Dark) and white on pale lavender (Purple Light) in the
  phone detail shots (`…-storefront-{360,390}-2-detail.png` and the settled cart-bar captures).

## New defects found (not fixed; for the controller to route)

- **N1: card price covered by the Pre-order / Out-of-stock button at 360 px.**
  - Where: dark-luxury Gold, cyber-brutalism Acid Dark and Purple Light; storefront layout, 360 px,
    catalog page. Screenshots: `dark-luxury-gold-storefront-360-1-catalog.png`,
    `cyber-brutalism-acid-dark-storefront-360-1-catalog.png`,
    `cyber-brutalism-purple-light-storefront-360-1-catalog.png`.
  - What: in the two-column phone grid, the wider "Pre-order" button covers the last digit of
    "£95.00". The disabled "Out of stock" button sits over "£18.00".
  - Rule broken: "360 px: no clipped text" (luxury) and spec §4.4 mobile contract.
  - Cause: the shared ProductCard foot puts price and button side by side with no wrap. Modern's
    square button already abuts the price at 360. The templates' inner card padding (F7) takes
    about 24px more from the row, and that tips it into overlap.
  - Suggested fix: let the card foot wrap (price above button) or shrink the button label at narrow
    card widths, in the template CSS or the shared module.
- **N2: luxury menu-list group titles are 10px JetBrains Mono.**
  - Where: dark-luxury Gold, menu layout, 390 and 1280, catalog. Screenshots:
    `dark-luxury-gold-menu-{390,1280}-1-catalog.png` ("Concentrates", "Capsules", "Starter kits").
  - What: `[data-sf-part="group-title"]` gets weight 700, -0.03em tracking and no caps, but no font
    family or size. It therefore keeps `ProductList.module.css .groupHead`'s mono 10px, and negative
    tracking on a 10px mono face reads cramped.
  - Rule broken: "page and group titles 700 / tight tracking on every page (menu list)". This should
    be a title in the heading face (Inter). Brutalism's rule sets `font-family:
    var(--sf-font-heading)`, and luxury's does not.
  - Suggested fix: add `font-family: var(--sf-font-heading)` and a readable size (about 13–14px) to
    luxury's group-title rule, plus a CSS unit assertion.
- **N3: brutalism detail-page Add to cart loses its `↗` under 768 px.**
  - Where: cyber-brutalism, both presets, storefront product detail and the menu product sheet, at
    360 and 390. Screenshots: `cyber-brutalism-*-storefront-{360,390}-2-detail.png`,
    `cyber-brutalism-*-menu-390-2-detail.png`.
  - What: `AddToCart.tsx` always renders `<Slot name="ButtonAdornment" variant="primary"
    cta={false} />`. The grid rule "arrows hide under 768 px (cta=false)" therefore also strips the
    arrow from the page's main CTA.
  - Rule broken: the ruling "main CTAs always keep `↗`" and the skill's "All buttons include an ↗".
  - Suggested fix: AddToCart passes `cta` when it is the detail or sheet CTA (not in a grid card).
    This is a shared-component change.
- **N4: brutalism menu product-sheet title is not uppercase.**
  - Where: cyber-brutalism, both presets, menu layout product sheet, 390 and 1280. Screenshots:
    `cyber-brutalism-*-menu-{390,1280}-2-detail.png` ("Alpine Extract 10ml").
  - What: the sheet's `<h2>` (`ProductDetailSheet.tsx:104`) carries no `data-sf-part`. Only `ProductDetailPage`, `ProductGrid`,
    `ProductList` and `WholesaleCatalogPage` titles are `page-title`, so the template cannot reach
    it.
  - Rule broken: "headings uppercase Tektur 700 on every page (… product detail)".
  - Suggested fix: tag the sheet title (e.g. `data-sf-part="page-title"` or a new documented part)
    and let brutalism's existing rule apply.
- **N5 (minor): the page-level section label sits flush against the dispatch bar in the menu
  layout.**
  - Where: dark-luxury (`[Catalogue]`) and cyber-brutalism (`/01`), menu layout, 390 and 1280.
    Screenshots: `dark-luxury-gold-menu-{390,1280}-1-catalog.png`,
    `cyber-brutalism-*-menu-{390,1280}-1-catalog.png`.
  - What: `ProductList` renders the `SectionLabel` slot before `.head`, which owns the `1.25rem` top
    padding, so the label touches the bar above it and the gap opens between label and title
    instead. The storefront grid is fine.
  - Rule broken: the skill's eyebrow-above-heading pattern (the label belongs to the title below
    it, not to the bar above) and the page's own vertical rhythm, where the storefront grid keeps
    that gap.
  - Suggested fix: give `[data-sf-part="section-label"]` a top margin inside the list, or move the
    slot inside `.head`.
- **N6 (minor): brutalism menu shows `/01` twice.**
  - Where: cyber-brutalism, menu layout, catalog, both widths
    (`cyber-brutalism-*-menu-{390,1280}-1-catalog.png`).
  - What: the page label is `/01` and the first group label is also `/01`.
    `ProductList` passes `index={1}` for the page and `groupIndex + 1` for groups. Luxury avoids
    this with `[Catalogue]`.
  - Rule broken: the skill's section numbering is a sequence.
  - Suggested fix: the page label uses `/00`, or groups start at `/02`, or the page label is omitted
    in the list surface.

### Observations outside the checklists (no action required unless the controller wants it)

- Brutalism: the checkout page title "Checkout", the step heading "Your details" and the drawer
  title "Your cart" are mixed-case Tektur. These headings have no `data-sf-part`, and the checklist
  enumerates only catalog, menu, wholesale and detail pages.
- The phone-code select truncates to "United Ki" in Tektur (brutalism) and "United" (luxury). This
  is shared Mantine select sizing.
- The wholesale catalog page is not part of the screenshot matrix, so it was not reviewed visually.
  Its `page-title` / `SectionLabel` parts are the same as the grid's.

## Defects fixed in this task

None. Per the controller's instruction, new defects are recorded above for routing and are not
fixed here.

## Screenshots reviewed

Matrix set (`docs/screenshots/templates/`), each with `-1-catalog`, `-2-detail`, `-3-cart` and
`-4-checkout`:

- `dark-luxury-gold-storefront-{360,390,768,1280}`
- `dark-luxury-gold-menu-{390,1280}`
- `cyber-brutalism-acid-dark-storefront-{360,390,768,1280}`
- `cyber-brutalism-acid-dark-menu-{390,1280}`
- `cyber-brutalism-purple-light-storefront-{360,390,768,1280}`
- `cyber-brutalism-purple-light-menu-{390,1280}`
- `modern-default-storefront-{360,1280}-1-catalog` and `-1280-3-cart`, as the capture-timing
  control.

That is 72 template screenshots plus modern controls. The same 18 flows were also captured
settled, with an extra `-2b-cartbar` shot at phone widths, plus `*-{390,1280}-detail-view` and
`*-{390,1280}-added` for all three presets. These went to a scratch folder and were not kept.
