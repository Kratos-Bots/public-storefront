# Telegram Mini App — Admin SPA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin pick the new `webapp` storefront layout and set the bot's `storefront_webapp_mode` (Off / Beta / Forced).

**Architecture:** Two form additions on existing pages; no new API modules — bot settings already round-trip arbitrary keys through `bulkUpdateBotSettings`, and the Message Templates tab lists `tpl_webapp_welcome` and the new `btn_*` labels straight from the backend registry.

**Tech Stack:** React 19, Vite, react-hook-form + zod, TanStack Query, Tailwind v4.

**Spec:** `ecommerce-storefront/docs/superpowers/specs/2026-09-29-telegram-mini-app-design.md` (§4)

**Repo:** `T:\Projects\ecommerce\ecommerce-admin-frontend` — paths relative to it. Branch `feature/telegram-mini-app`. Depends on the backend plan (`2026-09-29-telegram-mini-app-backend.md`) being deployed first: an older backend rejects `layout: 'webapp'` with a 422.

## Global Constraints

- Setting key `storefront_webapp_mode`, values exactly `off` | `beta` | `forced`, default `off`.
- Layout values `storefront` | `menu` | `webapp`.
- `@/…` imports with `.ts`/`.tsx` extensions; reuse `src/components/ui/` primitives.
- No test runner exists: verification is `npm run build` + `npm run lint` + a browser check.

## Review Focus

- **A stored value outside the enum** (hand-edited DB, e.g. `true`) must show as Off and not break the form — `settingsToForm` normalises it. Checked in Task 2 Step 3.
- **Saving the General tab with the mode untouched** must write `off`, not an empty string (the backend rejects `''` for this key with a 422). Checked in Task 2 Step 3.
- **The FeaturesCard save with `webapp`** must round-trip (reload shows Web app selected). Checked in Task 1 Step 3.

---

### Task 1: `webapp` layout option

**Files:**
- Modify: `src/types/storefront-settings.ts:89`
- Modify: `src/features/storefront-settings/FeaturesCard.tsx:61`

- [ ] **Step 1: Widen the type**

```ts
export type StorefrontLayout = 'storefront' | 'menu' | 'webapp';
```

- [ ] **Step 2: Add the option**

Replace the `options` prop of the `features-layout` `Select`:

```tsx
          options={[
            { value: 'storefront', label: 'Storefront — full shop with accounts' },
            { value: 'menu', label: 'Menu — compact catalogue' },
            { value: 'webapp', label: 'Web app — Telegram-style, phone-first' },
          ]}
```

and directly under the `Select` add:

```tsx
        <p className="text-xs text-text-tertiary -mt-2">
          Inside Telegram the storefront always uses the Web app layout; this picks what browsers get.
        </p>
```

- [ ] **Step 3: Verify**

Run: `npm run build && npm run lint`
Expected: both clean. Then with the backend running (`npm run dev`), open Storefront → Features, choose **Web app**, save, reload: Web app is still selected.

- [ ] **Step 4: Commit**

```bash
git add src/types/storefront-settings.ts src/features/storefront-settings/FeaturesCard.tsx
git commit -m "feat(storefront-settings): webapp layout option"
```

---

### Task 2: "Shop in web app (BETA)" bot setting

**Files:**
- Modify: `src/features/bot-settings/BotSettingsPage.tsx` (schema ~line 41, `FORM_KEYS` ~line 78, helpers ~line 122/138, General card ~line 283)

- [ ] **Step 1: Schema, keys, options**

In `schema`, after `wholesale_mode_enabled`:

```ts
  storefront_webapp_mode: z.enum(['off', 'beta', 'forced']).optional(),
```

In `FORM_KEYS`, after `'wholesale_mode_enabled',` add `'storefront_webapp_mode',`.

After `CONTACT_MODE_OPTIONS`:

```ts
const WEBAPP_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: 'off', label: 'Off — classic bot' },
  { value: 'beta', label: 'Beta — web app, shoppers can switch back' },
  { value: 'forced', label: 'Forced — web app only' },
];
```

- [ ] **Step 2: Normalise on load and default**

In `settingsToForm`, add a branch before the final `else`:

```ts
    } else if (key === 'storefront_webapp_mode') {
      form[key] = map[key] === 'beta' || map[key] === 'forced' ? map[key] : 'off';
```

In the `useForm` `defaultValues` mapper, replace the ternary with:

```ts
        BOOLEAN_KEYS.has(k)
          ? DEFAULT_TRUE_KEYS.has(k)
          : CONTACT_MODE_KEYS.has(k)
            ? 'optional'
            : k === 'storefront_webapp_mode'
              ? 'off'
              : '',
```

- [ ] **Step 3: The control**

In the General card, directly after the Wholesale Mode `<label>`:

```tsx
              <div>
                <Select
                  id="storefront_webapp_mode"
                  label="Shop in web app (BETA)"
                  options={WEBAPP_MODE_OPTIONS}
                  {...register('storefront_webapp_mode')}
                />
                <p className="text-xs text-text-tertiary mt-1">
                  The bot shows only a welcome with Open shop and Contact, opens your storefront as a Telegram
                  Mini App (shoppers are signed in automatically) and otherwise only sends notifications. Needs a
                  deployed, enabled storefront — until then the bot stays classic. Wholesale Mode takes precedence.
                  Reviews, FAQ and Giveaways aren&rsquo;t in the web app yet, so prefer Beta over Forced for now.
                  In BotFather, <code>/setdomain</code> must point at the storefront.
                </p>
              </div>
```

(`Select` is already imported for the contact-mode fields.)

Verify: `npm run build && npm run lint` clean. In the browser: Bot Settings → General shows the select at **Off** on a DB with no row; pick **Beta**, Save, reload → Beta; the network request body contains `{"key":"storefront_webapp_mode","value":"beta"}`. Save again with Off → `"value":"off"` (never `""`). Templates tab lists `tpl_webapp_welcome` and the four new buttons.

- [ ] **Step 4: Commit**

```bash
git add src/features/bot-settings/BotSettingsPage.tsx
git commit -m "feat(bot-settings): Shop in web app (BETA) mode"
```
