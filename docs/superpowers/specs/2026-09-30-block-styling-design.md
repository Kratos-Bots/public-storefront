# Block styling — design (stage 2 of "everything editable")

Date: 2026-09-30. Status: written for review; no code yet.
Repos: `ecommerce-storefront` (lead), `ecommerce-backend` (validation only), branch
`feature/puck-editable`. `ecommerce-admin-frontend` needs **no change** (see §10).
Initiative overview and cross-stage rules:
[`2026-09-30-puck-editable-overview.md`](2026-09-30-puck-editable-overview.md). Builds on
[`2026-09-29-puck-page-builder-design.md`](2026-09-29-puck-page-builder-design.md) (§13 wins over
its §1–12), stage 1 ([`2026-09-30-editable-text-design.md`](2026-09-30-editable-text-design.md))
and [`../../builder.md`](../../builder.md). Examples use the fixture store "Northbound Supply" at
`shop.example`.

## 1. Goal

Let an owner give any single block its own look — colours, spacing, border, corners, shadow, text
size, alignment, width, and "hide on phones / hide on desktop" — from a **Style** group in the
block's sidebar, without ever writing CSS, without leaving the template's vocabulary, and without
changing a single byte of DOM for a block nobody styled. Switching template restyles every styled
block consistently, because a stored style names *tokens and scale steps*, never colours or
lengths.

## 2. Decisions

**U** = the user's decision (binding). **D** = this spec's decision, with its reason.

| # | Decision | By |
|---|---|---|
| 1 | Every block is stylable per instance — colours, spacing, borders, radius, font size, alignment, hide on phone/desktop — not only through the template. | U |
| 2 | One shared, typed, flat prop `blockStyle` (not `style`), identical in shape on every block. `style` would collide with React's `style` and with `SlotRender`'s `style`; a block that ever spread its props onto the DOM would turn tokens into garbage inline CSS. | D |
| 3 | Stored values are **enum keys only** (palette token names, scale steps). No hex, no lengths, no free strings. Absent key = "template default"; there is no stored `inherit`. | U (tokens only), D (no stored `inherit`) |
| 4 | Styles render as **data attributes** on one element plus a **generated static stylesheet** keyed on those attributes. No inline `style`, no runtime CSS generation, no per-block CSS variables written by the renderer. | D — enumerable values make every rule static and reviewable; no inline style means CSP-friendly and no fight with the inline vars Section/Columns already write; attributes are a stable hook a template can target (§8). |
| 5 | Where the attributes land is declared per block: `root` (the block's own root element), `wrap` (one `<div>` the renderer adds), or `pass` (forwarded to a named inner element — only `Header`). With no style set, none of the three adds anything. | D — parity (§6) and the sticky header (§5.3). |
| 6 | Each block declares **which keys it accepts** (`BlockDef.style`), required on every `defineBlock` so stage 3–5 sub-blocks cannot forget it. `PageOutlet` and `MobileCartBar` accept none. Route-bound blocks accept only box keys, never `hide`. | D — hiding or reshaping a flow must never take a purchase path down (overview rule 5). |
| 7 | A new rule, `hidden-required:<Block>`: a block with `hide` set may not contain, in any visible slot, a block the document requires (or `PageOutlet` / `MobileCartBar`). Violation ⇒ route default + Publish blocked, like every rule. | D |
| 8 | Font size and text colour are offered only on blocks whose own CSS reads two new variables (`--sf-text-scale`, `--sf-block-fg`); route-bound monoliths get them when stages 3–5 split them into parts. | D — ~450 hard-coded `px`/`rem` font sizes mean an inherited `font-size` or `color` on a wrapper silently does nothing on most feature components; a control that doesn't work is worse than none. Refines U#1 for stage 2 only. |
| 9 | Phone caps are automatic and not stored: below 48em large spacing steps shrink one step, side padding caps at 1rem, and the third nested level of side padding drops to 0. | D — template mobile rules (§7). |
| 10 | Templates **cannot** veto keys per block. Their control is the token values themselves, plus a documented CSS escape hatch at equal specificity that wins by load order (§8). | D — reasons in §8. |
| 11 | Owner style beats template part rules and module rules: every generated rule has specificity (0,4,0). | D |
| 12 | Backend validates exact keys and exact value sets (mirrored constants) and rejects anything else with 400; it still knows nothing about blocks, so per-block allowlists stay a storefront guard concern. | D (U asked for validation on both sides) |
| 13 | No stored-document migration, no DB migration, no protocol change (`protocol: 1`), no admin change. | D |

## 3. Data model

### 3.1 The prop

```ts
// web/src/builder/style/model.ts (runtime-safe; no Puck imports)
export const STYLE_SPACE = ['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const;          // = keys of SPACING
export const STYLE_KEYS = {
  bg:           PALETTE_TOKENS_NO_NONE,                 // background
  fg:           PALETTE_TOKENS_NO_NONE,                 // text colour
  padTop:       STYLE_SPACE,
  padBottom:    STYLE_SPACE,
  padX:         STYLE_SPACE,                            // inline padding, both sides
  marginTop:    STYLE_SPACE,
  marginBottom: STYLE_SPACE,
  border:       ['thin', 'medium', 'thick'],            // all four sides
  borderColor:  PALETTE_TOKENS_NO_NONE,
  borderStyle:  ['solid', 'dashed', 'dotted'],
  radius:       ['none', 'sm', 'md', 'lg', 'card', 'pill'],
  shadow:       ['card', 'raised'],
  textSize:     ['sm', 'lg', 'xl'],
  align:        ['start', 'center', 'end'],
  maxWidth:     ['narrow', 'text', 'wide'],
  hide:         ['mobile', 'desktop'],
} as const;
export type StyleKey = keyof typeof STYLE_KEYS;
export type BlockStyle = { [K in StyleKey]?: typeof STYLE_KEYS[K][number] };
```

`PALETTE_TOKENS_NO_NONE` is `define.ts`'s `PALETTE_TOKENS` without `'none'` (15 tokens: `bg bg-deep
surface surface-2 surface-3 line line-strong text muted faint primary primary-soft success warn
danger`). 16 keys, flat (one level — the backend's walk and the admin diff need nothing new).

A component stores it beside its other props:

```json
{ "type": "Heading", "props": { "id": "h-1", "text": "Wholesale enquiries", "eyebrow": "", "level": "h2",
  "align": "start", "blockStyle": { "bg": "surface-2", "padTop": "lg", "padBottom": "lg", "radius": "card" } } }
```

Rules of the shape:

- **Absent ⇒ template default.** `blockStyle` absent, `{}` and "every key absent" mean the same
  thing and render identically (nothing). The editor and the guard never *emit* `{}`: an empty
  result removes the key.
- **`none` is a real value** for spacing and radius ("zero", overriding the block's own), distinct
  from absent.
- `borderColor` / `borderStyle` without `border` are stored but have no effect (the editor
  disables them until a width is chosen; the guard keeps them so toggling width back restores
  them).
- `hide` is one value, so "hidden everywhere" cannot be expressed — that is deleting the block.
- Canonical key order is the order above; the guard and the editor normaliser write keys in that
  order so `stableStringify` diffs stay quiet.

### 3.2 What each value means (the generated stylesheet)

| Key | Value → CSS on the target |
|---|---|
| `bg` | `background: var(--sf-<token>)` (shorthand: replaces a gradient/glass image too). If `padX` is absent, also `padding-inline: 1rem` — the same inset Section's tinted rail band uses, so text never touches the tint. |
| `fg` | `color: var(--sf-<token>); --sf-block-fg: var(--sf-<token>)` |
| `padTop` / `padBottom` / `padX` | `padding-block-start` / `padding-block-end` / `padding-inline` = `SPACING[step]` (`none 0, xs .5rem, sm 1rem, md 1.5rem, lg 2.5rem, xl 4rem`) |
| `marginTop` / `marginBottom` | `margin-block-start` / `margin-block-end` = `SPACING[step]` |
| `border` | `border: <thin 1px \| medium 2px \| thick 4px> var(--sfs-bs, solid) var(--sfs-bc, var(--sf-line))` |
| `borderColor` | `--sfs-bc: var(--sf-<token>)` |
| `borderStyle` | `--sfs-bs: <value>` |
| `radius` | `none 0`, `sm/md/lg var(--mantine-radius-sm/md/lg)`, `card var(--sf-card-radius)`, `pill var(--sf-pill-radius)` |
| `shadow` | `card var(--sf-card-shadow)`, `raised var(--sf-card-shadow-hover)` |
| `textSize` | `--sf-text-scale: <sm .875 \| lg 1.125 \| xl 1.25>` |
| `align` | `text-align: <start \| center \| end>`; with `maxWidth` also places the box: `center` → `margin-inline: auto`, `end` → `margin-inline-start: auto` |
| `maxWidth` | `max-width: min(<narrow 36rem \| text 68ch \| wide 60rem>, 100%)` |
| `hide` | `mobile`: `display: none !important` below 62em; `desktop`: from 62em (the same breakpoint as `.sf-hide-mobile` / `.sf-hide-desktop` in `global.css`, so it lines up with the header icons' own hiding) |

Every styled target also gets `box-sizing: border-box; min-width: 0` and resets the private
variables (`--sfs-bc: initial; --sfs-bs: initial`) so a nested styled block never inherits its
parent's border colour. `--sf-block-fg` and `--sf-text-scale` are **meant** to inherit: a Section
set to "Text size: large" enlarges the Headings and RichText inside it; a nested block's own
setting wins (nearest ancestor). Radius never clips (`overflow` is never set — it would break
sticky descendants and focus rings).

Tokens resolve through the active template: `surface-2` is whatever the template and preset say it
is, `card` radius and shadow are the template's card treatment (a template whose card shadow is
`none` shows no shadow — the template stays in charge). Spacing, border widths, text scale and max
widths are the app's fixed scale, the same `SPACING` Section and Columns already use.

## 4. Per-block support

```ts
// define.ts
export type StyleTarget = 'root' | 'wrap' | 'pass';
export interface StyleSupport { target: StyleTarget; keys: readonly StyleKey[] }
export interface BlockDef<P> { /* … */ style: StyleSupport | false }   // REQUIRED
export interface BlockRenderContext { editing: boolean; docKey: DocKey; layout: LayoutKind; style?: StyleAttrs }
export type StyleAttrs = Readonly<Record<`data-sf${string}`, string>>;
```

Key sets: **BOX** = `bg padTop padBottom padX marginTop marginBottom border borderColor borderStyle
radius shadow maxWidth`; **TEXT** = `fg textSize align`; **VIS** = `hide`.

| Block | Target | Keys | Why the exceptions |
|---|---|---|---|
| `Section` | root | BOX − `bg padTop padBottom maxWidth` + `textSize align` + VIS | Its own `backgroundToken`, `textToken`, `padding`, `width` stay; the Style group never duplicates a block's own prop. `fg` omitted (own `textToken`). |
| `Heading` | root | BOX + `fg textSize` + VIS | own `align` |
| `RichText` | root | BOX − `maxWidth` + TEXT + VIS | own `width` |
| `Image` | root | BOX − `maxWidth` + VIS | own `width` |
| `Button` | root | BOX + VIS | own `align`; the label's colour and size are the template's `button` part |
| `Divider` | root | `maxWidth align` + VIS | own `spacing` / `toneToken` |
| `Spacer` | root | VIS | its size is the block |
| `Columns`, `FAQ`, `Testimonial`, `NavLinks` | root | BOX + TEXT + VIS | |
| `Video`, `CatalogHero`, `CategoryNav`, `SearchField`, `FeaturedProducts` | root | BOX + VIS | no text controls (template slots / inputs — inputs stay 16px) |
| `Upsells`, `TopBar`, `NoticeBanners`, `CutoffBar`, `ContactStrip`, `Footer` | wrap | BOX + VIS | no single root the block owns |
| `Header` | pass → the `<header data-sf-part="header">` of `StorefrontHeader` / `MenuHeader` / `WebAppHeader` | `bg shadow` + VIS | a wrapper would end `position: sticky` at the wrapper's edge; padding/margin/border would change the bar height other sticky elements line up with (`--sf-bar-h`) |
| The 19 route-bound blocks (`ProductGrid` … `TrackingLookup`) and `AccountNav` | wrap | BOX | never `hide` (§2 #6); no TEXT (§2 #8) |
| `PageOutlet` | — | `false` | it *is* the page: hiding it hides every route, padding doubles `<main>`'s, a wrapper breaks the frame's `flex: 1` |
| `MobileCartBar` | — | `false` | fixed-position; a wrapper can't paint it, and hiding it would remove the phone checkout path while also suppressing the frame's safety-net bar (which only mounts when the shell has *no* `MobileCartBar`) |

Root-mode blocks with TEXT keys switch their text colours and sizes to read the variables, e.g.
`Heading.module.css` `color: var(--sf-text)` → `color: var(--sf-block-fg, var(--sf-text))` and
`font-size: 1.75rem` → `font-size: calc(1.75rem * var(--sf-text-scale, 1))`. Unset, both compute to
exactly today's values (no DOM change; `templates-baseline*` screenshots unchanged). Secondary text
(eyebrows, captions, testimonial detail) keeps its own muted token and scales with
`--sf-text-scale` only. Interactive elements in these blocks keep `min-height: 44px` independent of
the scale.

**Allowlists only grow.** Removing a key from a block in a later release would turn stored styles
into blocking field issues; a release may add keys, never remove them (a test pins the current
lists as a floor).

## 5. Rendering

### 5.1 One shared helper

`web/src/builder/style/apply.tsx` (runtime-safe, in the shopper bundle):

```ts
/** null when nothing applies — the caller must then add nothing at all. */
export function styleAttrs(def: AnyBlock, style: BlockStyle | undefined, editing: boolean): StyleAttrs | null;
export function renderBlock(def: AnyBlock, props: Record<string, unknown>, ctx: BlockRenderContext): ReactNode;
```

`styleAttrs` returns `null` if `def.style === false`, `style` is absent, or no key survives the
block's allowlist. Otherwise: `data-sf-style="<BlockName>"` (the marker) plus one attribute per key —
`data-sfs-bg`, `-fg`, `-pt`, `-pb`, `-px`, `-mt`, `-mb`, `-border`, `-bc`, `-bs`, `-radius`,
`-shadow`, `-text`, `-align`, `-max`, and `data-sfs-hide` (shopper, exact preview) or
`data-sfs-ghost` (editor canvas, `editing: true`) — values are the stored enum strings. The
`data-sfs-` prefix keeps clear of the `<html>` theme attributes (`data-sf-label`,
`data-sf-input`, …).

`renderBlock` is the only caller of `def.render`: both `render.tsx`'s `BlockBody` and the editor's
`EditorBlock` `BlockBody` use it, so canvas, exact preview and shop cannot disagree.

- `attrs === null` → `def.render({ ...props, puck: ctx })` — **the exact call made today**.
- `root` → `def.render({ ...props, puck: { ...ctx, style: attrs } })`; the block spreads
  `{...puck.style}` onto its root element (or passes it to the inner component that owns the root).
  Spreading `undefined` adds nothing, so the block's JSX needs no branch.
- `pass` → as `root`; `Header` forwards `puck.style` as a `styleAttrs` prop to the three header
  components, which spread it onto `<header>`.
- `wrap` → `<div {...attrs}>{def.render({ ...props, puck: ctx })}</div>`.

A wrap-mode block that renders nothing (an `Upsells` with no upsells) would leave an empty padded
box; the stylesheet has `[data-sf-style]:empty { display: none }`.

### 5.2 The stylesheet

`web/src/builder/style/block-style.css`, **generated** from `STYLE_KEYS` + §3.2 by
`renderBlockStyleCss()` (`style/css.ts`) and checked in; `test/block-style-css.test.ts` fails when
stale (`UPDATE_BLOCK_STYLE_CSS=1` rewrites it — the `blocks.json` pattern). Imported once by
`render.tsx`. About 160 rules, ~8 KB raw / ~1.5 KB gzip. No `transition` or `animation` anywhere in
it (so `prefers-reduced-motion` holds trivially; a test asserts the absence).

Every rule is written `:root:root [data-sf-style][data-sfs-<key>="<value>"]` — specificity
**(0,4,0)**: above module classes (0,1,0)–(0,2,0) (Section's `.rail.filled`), above template part
rules `:root[data-sf-template="x"] [data-sf-part="…"]` (0,3,0), so an owner's choice is what the
shopper sees. The ghost rules live in the editor's own CSS, not here.

### 5.3 Why not one mechanism for all blocks

- *Always a wrapper*: breaks `position: sticky` (the header sticks only within its parent's box),
  the frame's `flex: 1` `<main>`, fixed bars, and adds DOM to the 16 blocks that already own a root.
- *Always the block's root*: 29 blocks have no root they own (feature pages, template slots,
  shell pieces); threading attributes into ~40 feature components is stage 3–5's job, done part by
  part.
- *CSS variables on the target with one generic rule* (`padding-top: var(--sfs-pt)`): an unset
  variable makes the property invalid-at-computed-time, which **resets** the block's own padding to
  `0` — a style on `bg` alone would collapse its spacing. Per-key attribute rules only touch the
  properties that are set.

## 6. Parity guarantee

With no published page set, or a published set with no `blockStyle` anywhere, the DOM is
byte-identical to today, because:

1. `styleAttrs` returns `null` for absent/empty/all-disallowed styles, and `renderBlock` then makes
   the identical `def.render` call with the identical `puck` object (same reference — no per-block
   copy).
2. Root and pass blocks spread `puck.style` (`undefined`) — no attribute; no `className` is
   touched anywhere (styling is attribute-only), so no class string can gain a trailing space.
3. No default document contains `blockStyle`; `defaultProps` of no block contains it; Puck inserts
   blocks without it; `prepareDoc` strips `{}` and unknown keys before any change is posted.
4. CSS changes (the generated sheet, the `var(--x, <today's value>)` rewrites) are not DOM; they
   compute to today's values when unset (`calc(1.75rem * 1)` = `1.75rem`).

Gates: `e2e/dom-parity.spec.ts` passes **with no snapshot regenerated**; a unit parity test renders
every registered block (the blocks unit tests' fixtures) with `blockStyle` absent, `{}`, and
`{ hide: 'mobile' }` on a block that disallows it, and asserts identical `renderToStaticMarkup`;
`templates-baseline*.spec.ts` screenshots unchanged.

## 7. Mobile rules

- **No overflow at 360px.** `max-width` is always `min(…, 100%)`; `border-box` on every target;
  `min-width: 0`. Below 48em: `padTop`/`padBottom`/`marginTop`/`marginBottom` `lg` → 1.5rem and
  `xl` → 2.5rem; `padX` `md`/`lg`/`xl` → 1rem; and `[data-sfs-px] [data-sfs-px] [data-sfs-px]`
  (third nested level) → `padding-inline: 0`, so deep nesting can't squeeze text to nothing.
  `textSize: xl` is 1.125 below 48em. A full-bleed `Section` keeps its negative inline margins:
  Section accepts no `maxWidth` (the only key that sets `margin-inline`), and its `padX` replaces
  only the `--sf-main-pad` inset, never the margins.
- **44 × 44 targets.** Styling never shrinks a target: padding and borders only add; TEXT blocks
  keep `min-height: 44px` on links/summary rows regardless of `--sf-text-scale`; `Button` accepts
  no `textSize`.
- **Inputs stay 16px.** No block containing an input (`SearchField`, route blocks) accepts
  `textSize`.
- **`prefers-reduced-motion`.** The style sheet has no motion.
- **Safe areas / overlays** — untouched: `Header` accepts no padding; `MobileCartBar` isn't
  stylable.
- **Hiding.** `hide` uses the 62em breakpoint. "Phone" in the editor is labelled honestly:
  *Hide below 992 px (phones and tablets)* / *Hide from 992 px (desktop)*.

## 8. Templates

- **Control through tokens.** Every colour, radius and shadow a style can name is a template
  token, so switching template or preset restyles styled blocks in that template's voice.
- **No per-template veto (D).** Considered and rejected: (a) it needs a template contract bump
  and a backend catalog-schema change (manifests are validated there); (b) a veto that depends on
  the active template makes a template switch silently drop owner choices in some places, which
  the owner cannot see or predict; (c) the dangerous cases are geometric and identical under
  every template, and they are already handled by the app's per-block allowlists (§4).
- **Escape hatch.** A template whose design genuinely breaks under an owner value (a glass header
  it wants to keep translucent) may override in its `template.css` at equal specificity, which wins
  because template CSS always loads after the main bundle:
  `:root[data-sf-template="<id>"] [data-sf-style="Header"][data-sfs-bg]` (0,4,0). `templates.md`
  documents this as the only supported style hook and asks templates to use it sparingly.
- **Parts are untouched.** No style attribute is ever placed on, or removes, a `data-sf-part`
  element's attributes; the wrapper carries no part. (`Header` is the one pass target that *is* a
  part element; it keeps `data-sf-part="header"` and gains attributes beside it.) Today no template
  or shell CSS relies on a direct-child combinator under `[data-sf-part="main"]` (checked);
  `templates.md` §4 gains the rule "don't — a styled block adds a wrapper".
- `templates.spec.ts` matrix is unchanged; §11 adds a styled pass across every built-in template.

## 9. Editor

### 9.1 The Style group

`web/src/builder/editor/custom-fields/style.tsx` exports `styleField(def)`, a Puck `custom` field
for the `blockStyle` prop. `blockFields(name, overrides)` appends it **last**, after overrides, for
every block whose `def.style` is not `false`. `deriveFields` is unchanged (`blockStyle` is not in
any `def.schema`), so the "every schema key has a field" test is unaffected; a new test asserts
every stylable block's fields end with `blockStyle`.

- **Collapsible.** A disclosure headed **Style**, collapsed by default; the summary shows the count
  of set keys ("Style · 3 set"). Open/closed is remembered per block type for the editor session
  (memory only).
- **Only allowed controls.** Rows are built from `def.style.keys`, grouped: *Colours* (Background,
  Text colour), *Spacing* (Padding top / bottom / sides, Space above / below), *Border* (Width,
  Colour, Style), *Shape* (Corners, Shadow), *Text* (Size, Alignment), *Width* (Max width),
  *Visibility*.
- **Every row starts at "Default"** (= absent, the template decides) and has its own reset (×)
  when set. **Reset style** in the group header clears every key in one `onChange` (one undo step)
  and sets the prop to `undefined`.
- **Visual controls.** Colours: the existing `paletteTokenField` swatches (the shop's resolved
  `--sf-*`, radio group with roving arrow keys), plus a "Default" swatch. Spacing: segmented chips
  `0 · XS · S · M · L · XL`, each titled with its size ("L — 40 px, 24 px on phones"), beside a
  small box diagram that highlights the side being edited. Corners: chips drawn with their own
  radius. Shadow: two chips painted with the template's shadows. Text size: `A` glyphs at the three
  scales. Visibility: three radios (Shown everywhere / Hide below 992 px / Hide from 992 px).
- **Contrast hint.** When the block has both `bg` and `fg`, or a `fg` on its own, the group computes
  the contrast of the resolved colours (`getComputedStyle(document.documentElement)`) and shows
  "Low contrast (3.1 : 1)" under 4.5 : 1. A hint, never a publish block (a template switch changes
  the numbers).
- **Live.** The canvas re-renders on every change (Puck); posting keeps its 500 ms debounce.
- **Hidden blocks stay editable.** On the canvas (`editing: true`) `hide` is emitted as
  `data-sfs-ghost`; the editor CSS shows a ghosted block (opacity .4, dashed outline, a corner tag
  "Hidden on this width") within the matching media query, so it can still be selected. Exact
  previews (`editing: false`) hide for real.
- **Touch.** On `pointer: coarse` every chip and swatch is a 44 px target (as the Text panel).
- Labels are editor UI (outside the text layer, like all editor copy).

### 9.2 Issues and normalisation

- `prepareProps` (editor `prepare.ts`) normalises `blockStyle` for every block: drop unknown keys,
  keys the block doesn't allow, and invalid values; canonical order; `{}` → removed.
- Guard issues for styles (§10.1) show in the header's issue list like field issues and block
  Publish.

## 10. Validation

### 10.1 Storefront guard

`parseBlockPropsDetailed` (define.ts) takes `blockStyle` out of `raw` before the schema parse (a
plain `z.object` would strip it anyway — which is exactly why a v0.7.0 storefront ignores styles)
and parses it with `parseBlockStyle(def, raw.blockStyle)`:

| Input | Result | Issue |
|---|---|---|
| absent / `undefined` | no `blockStyle` | — |
| not a plain object | no `blockStyle` | `field:<Block>.blockStyle` |
| key not in `STYLE_KEYS` | key dropped | none (forward compatibility, like an unknown top-level prop) |
| key the block doesn't accept | key dropped | `field:<Block>.blockStyle.<key>` |
| value not in the key's list | key dropped | `field:<Block>.blockStyle.<key>` |
| nothing left | no `blockStyle` | — |

`field:` issues keep the doc rendering (the key is just not applied) and block Publish, as today;
the message reads "{Label}: the style setting "{row label}" is not valid here and was left at its
default."

### 10.2 Rules

`rules.ts` gains `hidden-required:<Block>`: walking visible slots, a block whose (guarded)
`blockStyle.hide` is set must not have, at any depth, a descendant whose type is in the document's
`EXACTLY_ONE` list, the `AT_LEAST_ONE` list, `PageOutlet` or `MobileCartBar`. Violation ⇒
`checkRules` issue ⇒ the route's default document for shoppers and a blocking issue in the editor
("Section is hidden below 992 px but holds the Product grid, which every shopper must see."). With
the allowlists this closes every way `hide` could remove a flow: required blocks can't carry it,
and nothing that carries it can hold them.

### 10.3 Backend (`ecommerce-backend`, `storefront-pages/schemas.ts`)

The backend still knows no blocks. `walkComponent` gains one check for a component's
`props.blockStyle` when present:

- must be a plain object with at most 16 keys;
- every key must be in `BLOCK_STYLE_VALUES` (a mirror of `STYLE_KEYS`, with a comment pointing at
  `web/src/builder/style/model.ts`) and its value one of that key's strings;
- otherwise a structural issue at `[…, 'props', 'blockStyle', key]` ("Unknown style setting" /
  "Invalid value for style setting") ⇒ 400, like every structural issue.

No other change: none of the keys matches `HTML_PROP_RE` or `URL_PROP_RE`, the walk already bounds
depth, and the 512 KB cap already counts styles. **Size impact:** a fully styled block adds at most
~330 bytes, a typical one (3–4 keys) ~90 bytes; a 150-block layout with every block styled adds
~14 KB — about 3 % of the cap. No new limit. No DB migration (props are JSON).

### 10.4 Protocol and admin

`blockStyle` is an ordinary prop: the editor protocol's `componentSchema` is `looseObject`, the
admin's mirror is loose, and `diffPageSets` compares whole documents (a style edit shows as
"Edited"). `protocol` stays `1`; the admin needs no change and gets only its usual gates (build,
lint vs baseline, mocked Pages pass).

## 11. Interplay with other stages

- **Stage 1 (text).** Styling adds no shopper string (the text guard stays green: the runtime style
  modules hold only attribute names and enum values; editor labels are exempt). A hidden block's
  keys still appear under "Text in this block". `textSize` scales edited text exactly like
  default text.
- **Stages 3–5 (sub-blocks).** `style` is required in `defineBlock`, so no sub-block compiles
  without declaring support (overview rule 3). Sub-blocks own their root, so they are `root`
  targets; text parts (title, price, labels) take TEXT keys by reading `--sf-block-fg` /
  `--sf-text-scale` in their CSS; required sub-blocks (add to cart, place order, payment, …) never
  accept `hide`, and the stage 3–5 required-sub-block tables feed `hidden-required` automatically
  (the rule reads the same tables). A monolith that becomes a container may move from `wrap` to
  `root`; that changes DOM only for styled documents, and its key list may only grow (§4).

## 12. Testing

**Storefront unit (Vitest)** — new `test/builder-style.test.ts`, plus additions:

- `parseBlockStyle`: every row of §10.1; canonical order; `{}` removed.
- `styleAttrs`: `null` cases; one attribute per key; ghost vs hide by `editing`.
- Contract: every block declares `style`; `false` exactly for `PageOutlet` and `MobileCartBar`;
  route-bound blocks and `AccountNav` ⊆ BOX with no `hide`; the §4 lists pinned as a floor; a
  CSS scan asserts each block offering `fg`/`textSize` reads `--sf-block-fg` / `--sf-text-scale`
  in its module CSS.
- Parity: every block rendered with style absent / `{}` / disallowed-only is identical
  (`renderToStaticMarkup`); with a style, the marker appears exactly once — on the element carrying
  `data-sf-block` (root), on the added `<div>` (wrap), on `<header>` (Header).
- Stylesheet: `block-style.css` not stale; every key × value has a rule; every selector is
  (0,4,0); no `transition`/`animation`; the phone-cap and nesting rules present.
- Rules: `hidden-required` for Section(hide) ⊃ ProductGrid on `catalog`, Columns(hide) ⊃
  PageOutlet on `shell`, Section(hide) ⊃ MobileCartBar; a hidden Heading passes; a required block
  in a non-rendered column (Columns set to 2, block in `col3`) is reported by `exactly-one` only,
  never by `hidden-required`.
- Editor: `styleField` shows only allowed rows; Reset sets `undefined` in one change; `prepareDoc`
  normalises; contrast ratio maths; `blockFields` ends with `blockStyle` for stylable blocks.
- `blocks-manifest.test.ts`: `blocks.json` regenerated with each block's `style` support.

**Storefront e2e (Playwright, mocked)**

- `dom-parity.spec.ts` — unchanged, no snapshot regenerated.
- New `e2e/block-style.spec.ts` with a Northbound Supply page set:
  - Computed styles at 390 and 1280: a Heading (`bg surface-2`, `padTop lg`, `border thin`,
    `borderColor primary`, `radius card`, `textSize lg`) resolves to the template's variables; the
    phone cap applies at 390.
  - `hide`: a Section hidden below 992 px is `display: none` at 390 and visible at 1280, and
    vice versa.
  - Owner beats template: a styled `Header` `bg` wins over the template's header background under
    every built-in template; the header still sticks after scrolling (`top` stays 0).
  - Flows survive styling: checkout completes through a `CheckoutFlow` with `bg`, padding and
    border; `CartContents` with styles keeps its summary column.
  - Template switch: the same set under each built-in template — `bg: surface` equals that
    template's `--sf-surface`; **no horizontal overflow at 360** on catalog and checkout with a
    "maximum" set (every key at its largest, Section › Columns › Section › Heading nested, thick
    borders).
  - `hidden-required`: a published catalog with the grid inside a hidden Section renders the
    default catalog.
  - Empty wrap: a styled `Upsells` with no upsells leaves no visible box.
- `builder-editor.spec.ts`: open Style on a Heading, pick a swatch → canvas updates and the posted
  change carries `blockStyle`; Reset removes it from the next change; a route block shows no
  Visibility row; a hidden block is ghosted in Fit and gone in the Phone exact preview.

**Backend (`npm test`)** — `schemas.test.ts`: a valid `blockStyle` is accepted and stored
unchanged; unknown key, unknown value, `inherit`, non-object, 17 keys → 400 with the path; a
`blockStyle` on a component nested in a slot is checked; existing fixtures unchanged.

No test touches a live database, bucket, bot or deployed storefront.

## 13. Migration and deploy

1. **Backend first** (overview rule 7) — the new check only. Not load-bearing in either direction:
   an older backend stores `blockStyle` unchecked (it validates structure only) and the new
   storefront's guard still cleans it; a rollback of the storefront to v0.7.0 strips the prop at
   render (`z.object` strip) and shows the blocks unstyled.
2. **Storefront** v0.8.0 with the rest of the branch; clients redeployed from the admin.
3. **Admin** — nothing to deploy for this stage.

No stored document is rewritten; no DB migration. Live verification after deploy (a pending
manual step, not done by any test): style a block on a test layout, publish, check it under two
templates on a phone.

`docs/builder.md` gains a "Block styling" section (keys, per-block table, targets, rules, the
hidden-required rule); `docs/templates.md` gains the escape hatch and the no-child-combinator
rule; `web/public/blocks.json` is regenerated.

## 14. Non-goals

Raw CSS, hex/RGB colours, gradients, background images or custom lengths; per-breakpoint values
(other than `hide` and the automatic phone caps); hover, focus or animation styles; per-side
inline padding or inline margins; per-template allowlists or vetoes; styling the page root or
shell ground (the template's job); copy/paste style between blocks; making `Section`'s own
`textToken` recolour nested headings (existing behaviour kept); text controls on route-bound
monoliths before their stage 3–5 split; styling `PageOutlet` or `MobileCartBar`.

## 15. Review focus — likely failure modes

1. **Parity leaks** — anything that emits the marker or a key for an unstyled block: a `{}` default
   sneaking into `defaultProps` or Puck's insert, a `renderBlock` that copies `puck` per block even
   when unstyled, a root block that builds a `className` string instead of spreading attributes.
   Only `dom-parity.spec.ts` catches most of these; no snapshot may be regenerated to "fix" one.
2. **Wrappers breaking layout** — sticky descendants (never set `overflow`), the frame's flex
   column (a styled `Footer` wrapper absorbs the footer's `margin-top` inside its background),
   direct-child selectors in template CSS. The wrap list in §4 must not grow without checking each
   block's root for `position: sticky/fixed` and parent `flex`/`grid` placement.
3. **Hiding a flow** — any path where `hide` reaches a required block: a new route block added
   without `routeBound`, a stage 3–5 required sub-block missing from the tables
   `hidden-required` reads, or the `MobileCartBar` safety net (it counts blocks, not visible
   blocks).
4. **Specificity drift** — owner rules must stay (0,4,0) and load before template CSS; if the build
   ever inlines template CSS into the main bundle before `block-style.css`, the escape hatch and
   owner-wins behaviour flip silently. The e2e "owner beats template" case pins it.
5. **Private variable inheritance** — `--sfs-bc` / `--sfs-bs` must reset on every marker, or a
   nested bordered block takes its parent's colour.
6. **Controls that do nothing** — a TEXT key offered on a block whose CSS ignores the variables;
   the CSS-scan test is the only guard, so it must match the real selectors, not just the file.
7. **Mirrored value lists** — `STYLE_KEYS` (storefront) and `BLOCK_STYLE_VALUES` (backend) must
   change together, backend first; a value added only to the storefront makes every save 400.
8. **Phone overflow from compounding** — nested padding, `maxWidth` with `align: end` inside a
   narrow column, thick borders at 360. The maximum-set e2e runs every built-in template.
9. **Ghost vs real hide** — exact previews and the version preview must pass `editing: false`, or
   owners approve pages that hide nothing.
10. **Allowlist shrinkage** — a later release removing a key from a block turns stored styles into
    blocking issues across every store; the floor test must not be "updated" to allow it.
