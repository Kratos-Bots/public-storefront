# Telegram Mini App — design

Date: 2026-09-29
Status: approved in conversation, awaiting written-spec review
Repos touched: `ecommerce-backend`, `ecommerce-admin-frontend`, `ecommerce-storefront`
Deploy order: backend → admin SPA → storefront release (binding, as for every storefront spec)

## 1. Goal

Let a store run its storefront as a Telegram Mini App. A shopper who opens it from the bot is
signed in automatically from their Telegram profile, and sees a new `webapp` display mode that
keeps the store's template, colours and fonts but behaves like a native Mini App. The bot can be
switched into a "webapp mode" where it stops being a shop and becomes a front door plus notifier.

Success looks like:

- Opening the shop from the bot lands a signed-in shopper on the catalog with no login step.
- The Mini App looks like the store (template, preset, brand colours), never like the shopper's
  Telegram theme.
- A store can choose `webapp` as its layout for ordinary browsers too, so it can later become the
  default everywhere.
- With webapp mode on, the bot only ever sends: the welcome message and notifications.

## 2. Decisions (from the brainstorm)

| # | Decision |
|---|---|
| D1 | `webapp` is a **third value of the existing layout setting**: `features.layout = 'storefront' \| 'menu' \| 'webapp'`. Inside Telegram the shell is always `webapp`, regardless of the chosen layout; choosing `webapp` in admin makes it the browser default too. |
| D2 | Bot behaviour is a **bot setting** `bot_settings.shop_webapp_mode = 'off' \| 'beta' \| 'forced'` (default `off`). Bot-only, so it lives in `bot_settings`, not `storefront_settings`. |
| D3 | Shoppers can **opt out in `beta`**, never in `forced`. Stored per customer. |
| D4 | In webapp mode the bot **replaces all shop menus**: it shows only the welcome message (Open shop, Contact, and — in `beta` — Use classic bot). Its only other messages are notifications. |
| D5 | Auth is **`initData` verification** on a new backend route, not a bot-signed URL token, so every launch path (menu button, inline button, `t.me/<bot>/<app>` link, attachment menu) works. |
| D6 | `WebAppShell` is a **new shell** next to `StorefrontShell` and `MenuShell`; all Telegram SDK calls go through one adapter that is a no-op outside Telegram. |
| D7 | **On brand always**: Telegram chrome colours are set *from* the store theme; `themeParams` are ignored. |
| D8 | Wholesale Mode **takes precedence** over webapp mode when both are on. |
| D9 | Reviews, FAQ and Giveaways (bot-only today) are **out of scope here** and ported in a follow-up spec ("Storefront Reviews, FAQ & Giveaways"). Until it ships, the admin control is labelled BETA and the docs advise against `forced`. |

## 3. Backend (`ecommerce-backend`)

### 3.1 Mini App authentication

New pure function `verifyTelegramWebApp(initData: string)` in
`src/modules/public-storefront/telegram-login.ts`, beside `verifyTelegramLogin`:

1. Read `bot_token` via `getBotSettingValue('bot_token')`; missing → `ServiceUnavailableError`.
2. Parse `initData` with `URLSearchParams`. Pull out `hash` (must match `/^[0-9a-f]{64}$/i`, else
   `ValidationError`). Build the data-check string from **all remaining fields as received**
   (including `signature` if present), sorted by key, joined `key=value\n`.
3. `secretKey = HMAC_SHA256(key = "WebAppData", data = botToken)`;
   `expected = hex(HMAC_SHA256(key = secretKey, data = dataCheckString))`. Compare with
   `timingSafeEqual`; mismatch → `UnauthorizedError`.
4. `auth_date` must be present, not more than 60 s in the future, and at most **24 h** old
   (constant `MAX_WEBAPP_AUTH_AGE_S = 86_400`); otherwise `UnauthorizedError`.
5. `user` must parse as JSON with a numeric `id`; return `{ telegramId: String(user.id), username: user.username ?? null }`.

It does not touch the database. The login step reuses the existing widget path: the body of
`telegramLogin` after verification (find-or-create customer by `telegramId`, ban check,
`createStorefrontSession`) is extracted into a shared helper both routes call, so the two
Telegram entry points can never diverge on account linking.

Route (in `router.ts`, after `/auth/telegram`):

```
POST /api/v1/public/storefront/auth/telegram-webapp
  requireStorefrontEnabled
  rateLimit({ windowMs: 15 * 60 * 1000, max: 60 })
  validate({ body: telegramWebAppLoginSchema })   // z.object({ initData: z.string().min(1).max(4096) })
  → LoginResult  { token, customer: { id, nickname } }   (same shape as /auth/telegram)
```

The limit is higher than the widget route's 10 because the Mini App authenticates on every launch,
and many phones share a carrier NAT address.

### 3.2 Webapp mode setting

- Seed `{ key: 'shop_webapp_mode', value: 'off' }` in `src/db/seed.ts`, and add it to the
  bot-settings schema/validation as enum `off | beta | forced`.
- Helper `src/bot/webapp-mode.ts`:
  - `getWebAppMode(): Promise<'off' | 'beta' | 'forced'>` — returns `off` (and logs a warning once
    per process) when the mode is on but `storefront_public_url` is unset or the storefront is
    disabled, mirroring `isWholesaleMode`'s "half-configured falls back to classic" rule. Also
    returns `off` when `isWholesaleMode()` is true (D8).
  - `isWebAppActiveFor(customer): boolean` — `forced`, or `beta` and `!customer.botWebappOptOut`.
  - `webAppUrl(): string` — `storefront_public_url` with trailing slash stripped.

### 3.3 Opt-out flag

`customers.bot_webapp_opt_out boolean not null default false` + Drizzle migration
(`npm run db:generate`). Ignored when mode is `forced`.

### 3.4 Bot routing

A single guard in the bot pipeline (registered before the menu/command handlers in
`src/bot/bot.ts`) runs for every update from a private chat:

- If `isWebAppActiveFor(customer)` is false → continue to the classic handlers unchanged.
- Otherwise:
  - Callback `webapp_optout` (only honoured in `beta`) → set `botWebappOptOut = true`, set the
    chat's menu button to `commands`, answer the callback, show the classic main menu. Stop.
  - `/start link_…` (admin account linking) completes on its own screen. `/start ref_…` is applied
    first; an applied referral shows its own confirmation, whose Continue button comes back
    through the gate and gets the welcome. A referral that isn't applied is silent, and the
    welcome shows straight away.
  - Anything else — `/start`, any other command, free text, any callback from an old classic
    message → send (or edit into) the **welcome message**. Stop.
  - Non-message updates (e.g. `my_chat_member` when a shopper blocks the bot) pass through.

Welcome message: new template `tpl_webapp_welcome` (editable in Message Templates like the others,
default text: store name + one line inviting the shopper to open the shop). Inline keyboard, one
button per row:

1. `btn_open_shop` → `Markup.button.webApp(label, webAppUrl())`
2. `btn_contact` → `Markup.button.url(label, 'https://t.me/' + support_username)`; omitted when
   `support_username` is unset.
3. `beta` only: `btn_use_classic_bot` → callback `webapp_optout`.

New labels `btn_open_shop`, `btn_contact`, `btn_use_classic_bot`, `btn_try_new_shop` are added to
the label registry with defaults.

Classic main menu, when mode is `beta` and the shopper has opted out: an extra first row
`btn_try_new_shop` → callback `webapp_optin`, which clears the flag, sets the chat's menu button to
the web app, and shows the welcome message.

Notifications (`src/modules/notifications/drivers/telegram.ts`) are unchanged — they already only
carry `url` buttons and are the one other kind of message the bot sends in webapp mode.

### 3.5 Cart hand-over

A `web_app` button tap never reaches the bot, so the hand-over happens whenever the bot sends the
welcome message: if the Telegraf session cart is non-empty, merge its lines into the customer's
`storefront_carts` row (existing storefront lines kept; same product → quantities summed, then
clamped by the storefront cart's existing quantity-limit logic), clear the session cart, and call
`untrackCart` for the chat ID so admin Live Carts shows only the `sf:<customerId>` cart. Nothing is
copied in the other direction; the storefront cart persists for the shopper's next visit.

### 3.6 Menu button

- On the bot's existing one-minute command-menu sync tick (so it runs in the process that owns
  the bot, and picks up setting or `storefront_public_url` changes within a minute): call
  `setChatMenuButton` **without** `chat_id` to set the default menu button to
  `{ type: 'web_app', text: <btn_open_shop label>, web_app: { url } }` when the mode is
  effectively on. When it is off, a BotFather-set menu button is left alone; only a default button
  pointing at our storefront is reset to `{ type: 'commands' }`.
- Per-chat overrides on opt-out (`commands`) and opt-in (delete the override →
  `setChatMenuButton({ chat_id, menu_button: { type: 'default' } })`).
- Failures are logged and never block the setting save.

### 3.7 Public settings exposure

The public storefront settings payload gains
`telegramWebApp: { mode: 'off' | 'beta' | 'forced' }` (the *effective* mode from
`getWebAppMode()`). Only the mode is exposed; no bot settings leak.

### 3.8 Account route for the in-app switch

```
POST /api/v1/public/storefront/account/bot-mode   (storefront-customer auth)
  body { classic: boolean }
```

`classic: true` in `beta` → set the flag, set the chat's menu button to `commands`, and have the
bot send the classic main menu to the customer's `telegramId`. `classic: true` in `forced` or
`off` → `ValidationError`. `classic: false` → clear the flag and reset the per-chat menu button.

### 3.9 Layout enum

`storefront-settings/schemas.ts` `layout: z.enum(['storefront', 'menu', 'webapp'])`.

## 4. Admin SPA (`ecommerce-admin-frontend`)

- Storefront → Features → Layout picker: third option **Web app** — "Telegram-style, phone-first.
  Always used inside Telegram."
- Bot Settings: new control **Shop in web app (BETA)** with a segmented `Off / Beta / Forced`
  and helper copy: Beta lets shoppers switch back to the classic bot; Forced removes that choice;
  requires a deployed storefront URL; Reviews, FAQ and Giveaways are not in the web app yet, so
  avoid Forced until they are; Wholesale Mode takes precedence. Shows a warning when the storefront
  URL is missing.
- Message Templates / Labels pages pick up `tpl_webapp_welcome` and the four new labels from the
  backend's registries (no bespoke UI).

## 5. Storefront (`ecommerce-storefront/web`)

### 5.1 Telegram adapter — `src/lib/telegram-webapp.ts`

- `index.html` loads `https://telegram.org/js/telegram-web-app.js` synchronously in `<head>`, so
  `window.Telegram.WebApp` exists before React renders. The Worker's CSP (if any) allows it.
- `isTelegramWebApp()` — true only when `window.Telegram?.WebApp?.initData` is a non-empty string
  (the script defines `WebApp` in any browser; empty `initData` means "not inside Telegram").
- Typed wrappers, each a no-op outside Telegram and guarded by `isVersionAtLeast` where the API is
  version-gated: `ready`, `expand`, `close`, `setChromeColors({ header, background, bottomBar })`,
  `mainButton.{show, hide, setText, setParams, onClick, offClick, showProgress, hideProgress}`,
  `backButton.{show, hide, onClick, offClick}`, `haptic.{impact, notify}`,
  `setClosingConfirmation(on)`, `setVerticalSwipes(on)`, `openLink(url)`, `initData()`.
- Safe areas: subscribes to `safeAreaChanged` / `contentSafeAreaChanged` and writes
  `--tg-safe-top/bottom` and `--tg-content-safe-top/bottom` onto `<html>` (0 outside Telegram).

### 5.2 Auto-login

- On boot inside Telegram, before any authed query runs, the session store posts
  `{ initData }` to `storefront/auth/telegram-webapp` (new `loginTelegramWebApp` in
  `src/api/auth.ts`) and saves the token exactly as the widget login does. It runs on **every
  launch**, replacing any stored token, so a device used by two Telegram accounts always gets the
  right customer.
- Authed routes wait for this bootstrap (a `pending` state in the session store the existing
  `Guard` already understands, or an equivalent gate) so no request goes out with a stale token.
- Inside Telegram, `/login` never shows the WhatsApp/widget options: success redirects to the
  intended route; failure shows an error card ("Couldn't sign you in through Telegram — close and
  reopen the shop") with a Retry button.
- Logout is hidden inside Telegram (identity is the Telegram account).

### 5.3 Layout switch

- `LayoutKind = 'storefront' | 'menu' | 'webapp'` in `src/types/settings.ts`.
- `ShellSwitch`: `isTelegramWebApp() || features.layout === 'webapp'` → `<WebAppShell/>`; else as
  today. A small `useEffectiveLayout()` hook returns the effective value so `ProductRoute` and
  `CartRoute` use it: `webapp` treats products like `menu` (sheet via `/?p=id`), and the cart is
  always a page (no desktop drawer).

### 5.4 `WebAppShell` — `src/layouts/WebAppShell.tsx` (+ `.module.css`)

Phone-first; at wider widths it stays a centred column (max ~560 px) rather than growing a desktop
layout.

- **Header**: compact, sticky, padded by `--tg-content-safe-top`; brand logo/short name, search
  field (reuse `SearchField`), account icon → `/account`. Template `TopBar` slot is not rendered
  (Telegram owns the top chrome); `CatalogHero`, `SectionLabel`, `Overlay`, `ButtonAdornment` slots
  render as in `MenuShell`.
- **Body**: `<Outlet/>`; catalog uses the menu-style list with product sheets.
- **Primary action bar** — one hook `usePrimaryAction()` that pages set, rendered two ways:
  - Inside Telegram: the native **MainButton**, colour = theme `primary`, text colour chosen for
    contrast; progress spinner while the action runs.
  - Outside Telegram: a fixed bottom bar in the shell (`--tg-safe-bottom` padded), styled by the
    template's button tokens.
  - Catalog/product with items in cart → "View cart · {total}"; cart → "Checkout"; checkout →
    "Place order · {total}"; hidden when there's nothing to do.
- **Back**: Telegram **BackButton** shown whenever the route isn't `/`, wired to `navigate(-1)`
  (falling back to `/` when there's no history); outside Telegram the header shows a back chevron.
- **Chrome colours** (D7): on mount and whenever the theme changes,
  `setChromeColors({ header: theme.colors.bg, background: theme.colors.bg, bottomBar: theme.colors.surface })`.
  `themeParams` are never read.
- **Behaviour**: `ready()` + `expand()` on mount; vertical swipes disabled while a sheet is open;
  `haptic.impact('light')` on add-to-cart, `haptic.notify('success')` on order placed;
  `setClosingConfirmation(true)` while checkout has entered data.
- **Payments**: when checkout returns an external payment URL, inside Telegram it is opened with
  `openLink(url)` and the Mini App navigates to the order-placed/status page to poll; outside
  Telegram the existing redirect is unchanged.
- **Footer**: none. Contact links move into the account page.

### 5.5 Opt-out in the Mini App

`/account` shows **Switch to the classic bot** when inside Telegram and
`settings.telegramWebApp.mode === 'beta'`. It confirms, calls
`POST storefront/account/bot-mode { classic: true }`, then `close()`.

### 5.6 Templates

No template changes and no contract change: the shell uses only existing CSS variables and slots,
so all built-in and external templates work. `docs/templates.md` gets a short note that the
`webapp` layout does not render the `TopBar` or `Footer` slots.

## 6. Deploy & setup (documented in the storefront README)

1. Deploy backend (runs the migration), then the admin SPA, then release/deploy the storefront.
2. In BotFather: `/setdomain` to the storefront host (already needed for the widget) and,
   optionally, `/newapp` so `t.me/<bot>/<app>` links work. The menu button is set by the backend
   (§3.6); no BotFather step needed for it.
3. Admin → Bot Settings → Shop in web app → Beta.

## 7. Error handling summary

| Situation | Behaviour |
|---|---|
| Mode on but storefront URL unset / storefront disabled | Bot stays classic; warning logged; admin control shows a warning. |
| Wholesale Mode on | Webapp mode effectively `off`. |
| `initData` bad hash / expired / missing user | 401; Mini App shows the sign-in error card with Retry. |
| Bot token unset | 503 from the auth route; same error card. |
| Banned customer | Same rejection as the widget login. |
| `setChatMenuButton` fails | Logged; setting still saved. |
| Opt-out requested in `forced` | 422; the control isn't shown in `forced` anyway. |

## 8. Testing

Backend (vitest):
- `verifyTelegramWebApp`: valid vector (signed in-test with the documented algorithm), tampered
  field, wrong hash format, expired `auth_date`, future `auth_date`, missing `user`, missing bot
  token.
- `getWebAppMode`: half-configured fallback, wholesale precedence.
- Bot guard: routes to welcome vs classic for each mode × opt-out combination; `webapp_optout`
  ignored in `forced`; `/start` referral payload still processed.
- Cart hand-over merge: disjoint lines, overlapping lines summed and clamped, session cleared.
- `bot-mode` route: `beta` toggles both ways; `forced`/`off` reject.

Storefront (Playwright, `e2e/telegram-webapp.spec.ts`), with `window.Telegram.WebApp` stubbed via
`addInitScript` (recording calls) and the auth route mocked:
- Auto-login posts `initData` and the catalog renders signed-in; `/login` redirects.
- `WebAppShell` renders inside Telegram even when the store layout is `storefront`.
- MainButton text follows the cart ("View cart · …" → "Checkout" → "Place order · …").
- BackButton shown off-root and navigates back.
- Chrome colours are set from the theme, not `themeParams`.
- `layout: 'webapp'` in a plain browser renders the in-page action bar and no Telegram calls.
- At 390×844 the first product is in the first screen.
- Opt-out control present only in `beta`.

Manual (user): a real launch from the bot on iOS/Android/Desktop Telegram.

## 9. Out of scope

- Reviews, FAQ and Giveaways in the storefront (next spec).
- Telegram Stars / in-app invoices, `CloudStorage`, home-screen shortcuts, fullscreen mode.
- Using the shopper's Telegram theme colours.
- Moving the bot's session cart back into the bot on opt-out.
