# Radius `none` — backend + admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let store owners choose sharp corners: the storefront theme's `radius` accepts `none`, defaults to `none` for unthemed stores, and the admin Appearance tab offers it.

**Architecture:** Two independent repos, one task each. The backend widens a zod enum in two places and changes one default; the admin SPA mirrors the enum in its form schema, type, preview map and select options. No migration — saved themes keep their value.

**Tech Stack:** Backend — Express 5, zod, vitest (`npx vitest run`), extensionless imports. Admin — React 19, react-hook-form + zod 4, Tailwind v4, `@/…` imports with explicit `.ts/.tsx` extensions.

**Spec:** `T:\Projects\ecommerce\ecommerce-storefront\docs\superpowers\specs\2026-08-27-storefront-design-language-design.md` §3.3

## Global Constraints

- Radius enum, in this order everywhere: `['none', 'sm', 'md', 'lg', 'xl']`.
- Backend `DEFAULT_THEME.radius` becomes `'none'`. No data migration; stored themes are untouched.
- Admin select option label for the new value: `None (sharp)`; preview pixel value `0`.
- Backend: extensionless imports; tests under `src/**/*.test.ts` run with `npx vitest run`; `npx tsc --noEmit` and `npx tsc --noEmit -p tsconfig.test.json` must both pass.
- Admin: `npm run build` (`tsc -b && vite build`) and `npm run lint` must pass.
- Commit trailers on every commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_017mSv2DDn5QZPBHwUF4bkKc`.
- Work directly on `main` in both repos (user decision, 2026-08-26). Do not push.

---

### Task 1: Backend accepts and defaults to `radius: 'none'`

**Files:**
- Modify: `T:\Projects\ecommerce\ecommerce-backend\src\modules\storefront-settings\schemas.ts:80`
- Modify: `T:\Projects\ecommerce\ecommerce-backend\src\modules\storefront-settings\service.ts:86`
- Modify: `T:\Projects\ecommerce\ecommerce-backend\src\docs\registry.ts:1122`
- Modify: `T:\Projects\ecommerce\ecommerce-backend\STOREFRONT.md` (the theme table row that lists radius values — find with `grep -n "radius" STOREFRONT.md`)
- Test: `T:\Projects\ecommerce\ecommerce-backend\src\modules\storefront-settings\schemas.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `storefrontThemeSchema` (zod) accepting `radius: 'none' | 'sm' | 'md' | 'lg' | 'xl'`; `DEFAULT_THEME.radius === 'none'`. The admin SPA (Task 2) and the storefront web app (other plan) depend on `GET /api/v1/public/storefront/settings` returning `theme.radius === 'none'` for unthemed stores.

- [ ] **Step 1: Write the failing test**

Create `src/modules/storefront-settings/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { storefrontThemeSchema } from './schemas';
import { DEFAULT_THEME } from './service';

describe('storefrontThemeSchema.radius', () => {
  it('accepts none and the four sizes', () => {
    for (const radius of ['none', 'sm', 'md', 'lg', 'xl'] as const) {
      expect(storefrontThemeSchema.parse({ ...DEFAULT_THEME, radius }).radius).toBe(radius);
    }
  });

  it('rejects an unknown radius', () => {
    expect(() => storefrontThemeSchema.parse({ ...DEFAULT_THEME, radius: 'round' })).toThrow();
  });

  it('defaults an unthemed store to sharp corners', () => {
    expect(DEFAULT_THEME.radius).toBe('none');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `T:\Projects\ecommerce\ecommerce-backend`): `npx vitest run src/modules/storefront-settings/schemas.test.ts`
Expected: FAIL — `accepts none` throws a ZodError (`Invalid enum value`), and `defaults … sharp corners` expects `'none'` but receives `'md'`.

- [ ] **Step 3: Widen the enum and change the default**

`src/modules/storefront-settings/schemas.ts` line 80 — replace:
```ts
  radius: z.enum(['sm', 'md', 'lg', 'xl']),
```
with:
```ts
  radius: z.enum(['none', 'sm', 'md', 'lg', 'xl']),
```

`src/modules/storefront-settings/service.ts` line 86 — replace `  radius: 'md',` with `  radius: 'none',`.

`src/docs/registry.ts` line 1122 — replace `  radius: z.enum(['sm', 'md', 'lg', 'xl']),` with `  radius: z.enum(['none', 'sm', 'md', 'lg', 'xl']),`.

`STOREFRONT.md` — in the theme documentation, wherever the radius values are listed (`grep -n "'sm'\|sm, md\|sm | md" STOREFRONT.md`), add `none` first and note: "`none` (sharp corners) is the default for stores that have never saved a theme".

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run` then `npx tsc --noEmit && npx tsc --noEmit -p tsconfig.test.json`
Expected: all test files pass (existing 8 + the new one); both tsc runs exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/modules/storefront-settings/schemas.ts src/modules/storefront-settings/service.ts src/modules/storefront-settings/schemas.test.ts src/docs/registry.ts STOREFRONT.md
git commit -m "feat(storefront-settings): theme radius accepts 'none' and defaults to it

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017mSv2DDn5QZPBHwUF4bkKc"
```

---

### Task 2: Admin Appearance tab offers "None (sharp)"

**Files:**
- Modify: `T:\Projects\ecommerce\ecommerce-admin-frontend\src\features\storefront-settings\ThemeCard.tsx:27,49,65,209`
- Modify: `T:\Projects\ecommerce\ecommerce-admin-frontend\src\types\storefront-settings.ts:120`

**Interfaces:**
- Consumes: backend enum from Task 1 (the SPA sends `radius` as-is; the backend validates).
- Produces: nothing downstream.

- [ ] **Step 1: Update the type**

`src/types/storefront-settings.ts` line 120 — replace:
```ts
  radius: 'sm' | 'md' | 'lg' | 'xl';
```
with:
```ts
  radius: 'none' | 'sm' | 'md' | 'lg' | 'xl';
```

- [ ] **Step 2: Update the form schema, preview map, default and select**

`src/features/storefront-settings/ThemeCard.tsx`:

Line 27 — replace `  radius: z.enum(['sm', 'md', 'lg', 'xl']),` with `  radius: z.enum(['none', 'sm', 'md', 'lg', 'xl']),`.

Line 49 (`EMPTY_THEME`) — replace `  radius: 'md',` with `  radius: 'none',`.

Line 65 — replace:
```ts
const RADIUS_PX: Record<FormData['radius'], number> = { sm: 6, md: 10, lg: 16, xl: 24 };
```
with:
```ts
const RADIUS_PX: Record<FormData['radius'], number> = { none: 0, sm: 6, md: 10, lg: 16, xl: 24 };
```

Line 209 — the `Select id="theme-radius"` options array becomes:
```tsx
options={[{ value: 'none', label: 'None (sharp)' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }, { value: 'xl', label: 'Extra large' }]}
```

Also line 128 reads `RADIUS_PX[theme.radius ?? 'md']` — change the fallback to `'none'`.

- [ ] **Step 3: Build and lint**

Run (from `T:\Projects\ecommerce\ecommerce-admin-frontend`): `npm run build && npm run lint`
Expected: both exit 0.

- [ ] **Step 4: Browser check**

Start the dev backend if not running (the user's own backend usually runs on :3000) and the SPA with `npx vite --port 5180 --strictPort`. Log in as `testadmin` / `testadmin123` (create with `cd T:\Projects\ecommerce\ecommerce-backend && npx tsx scripts/create-test-admin.ts` if the login fails — local dev only). Open Storefront → Appearance. Verify: the Corner radius select lists "None (sharp)" first; choosing it renders the preview card and button with square corners; Save succeeds (HTTP 200) and a reload shows "None (sharp)" still selected. Restore the previous value afterwards if the store had one (note it before changing).

- [ ] **Step 5: Commit**

```bash
git add src/features/storefront-settings/ThemeCard.tsx src/types/storefront-settings.ts
git commit -m "feat(storefront): Appearance offers a sharp-corner (none) radius

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017mSv2DDn5QZPBHwUF4bkKc"
```
