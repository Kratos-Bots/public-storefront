## The editor (`/__builder`)

The editor is a lazy chunk of the storefront, framed by the admin's **Storefront → Pages** tab
at `/__builder?sf-builder=1`. It boots only when that parameter is present **and** the page is
inside a frame (decided once per window, like the Appearance preview); anything else redirects
to `/`. The build fails if `@puckeditor/core`, tiptap, dnd-kit or any `src/builder/editor/`
module is statically reachable from the shopper entry (`vite-plugins/builder-isolation.ts`,
tested in `test/builder-isolation-plugin.test.ts` against hand-built bundle fixtures). Shopper lazy
chunks are checked too; only the chunk holding `EditorApp.tsx` is a boundary.

### Protocol (spec §13 A6)

| Direction | Message |
|---|---|
| admin → storefront | `sf-builder-load { protocol: 1, loadId, layout, pageSet \| null, theme, readOnly }` |
| admin → storefront | `sf-builder-theme { theme }` |
| admin → storefront | `sf-builder-select-page { docKey }` (optional: the editor honours it; the current admin does not send it) |
| admin → storefront | `sf-builder-upload-result { requestId, url \| null, error \| null }` |
| storefront → admin | `sf-builder-ready { protocol: 1 }` (to `'*'`; once per frame boot) |
| storefront → admin | `sf-builder-change { loadId, pageSet, issues }` (500 ms debounce; never when read-only) |
| storefront → admin | `sf-builder-upload-request { requestId, file }` |
| storefront → admin | `sf-builder-viewport { width: 360 \| 768 \| 1280 \| null }` (on every toggle change and after every load) |

Load identity: every `sf-builder-load` carries a `loadId`, and every `sf-builder-change` echoes
the `loadId` of the load it derives from, so the admin can discard changes belonging to a
superseded load. On each load the editor cancels any pending debounced change and posts exactly
one change built from the loaded data (also when `pageSet` is `null`; none when `readOnly`).

Only messages whose `source` is the parent frame are read; the first valid load pins the admin
origin (it must be an `http(s)` origin), and later messages from any other origin are ignored.
Draft themes never carry custom CSS into the frame. Guard issues whose rule starts with `drop:`
are informational and are not posted to the admin.

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
