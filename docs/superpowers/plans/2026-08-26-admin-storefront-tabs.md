# Admin SPA: Appearance / Features / Integrations / Deploy tabs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Storefront settings page four new tabs so a store owner can edit every storefront setting the backend already accepts (brand, theme, features, guest checkout, Turnstile, tracking API, logo/favicon) and connect Cloudflare, pick a domain, and deploy/update the storefront from the admin.

**Architecture:** Each tab is one or more cards in `src/features/storefront-settings/`, following `GeneralCard.tsx` (react-hook-form + zod + react-query, content-keyed reset so a save on another tab never clobbers an in-progress edit). Two new API modules (`storefront-deploy.ts`, extended `storefront-settings.ts`). A short design pass with the `frontend-design` skill first produces the shared primitives every card uses (`Switch`, `CardHeader`, `SwitchRow`, `StepLog`, a generic `AssetDropZone`) so the nine tabs read as one surface.

**Tech Stack:** React 19, react-router 7, @tanstack/react-query 5, ky, react-hook-form 7 + @hookform/resolvers + zod 4, Tailwind v4 theme tokens, lucide-react, react-hot-toast, socket.io-client.

**Spec:** `T:\Projects\ecommerce\ecommerce-storefront\docs\superpowers\specs\2026-08-26-storefront-admin-editor-and-deploy-design.md` §3. Backend contract: the backend plan `2026-08-26-backend-storefront-deploy.md` (Tasks 7–8 define every endpoint used here).

## Global Constraints

- Repo: `T:\Projects\ecommerce\ecommerce-admin-frontend`. Run `npm` from there. Verification = `npm run build` (tsc -b + vite) and `npm run lint` — there is no test runner.
- Imports: `@/…` alias with explicit `.ts`/`.tsx` extensions (`from '@/components/ui/Card.tsx'`). No relative `../../`.
- API calls: `api.get('storefront-deploy/zones')` — relative paths, no leading slash (ky `prefixUrl`). Unwrap with `unwrapResponse`. Errors are plain `Error`s whose `message` is the backend's `error` string; `onError: (err: Error) => toast.error(err.message)`.
- All Storefront tabs stay mounted (hidden with CSS), so cards sync local state from the shared `storefrontSettingsKeys.all` query **during render with a value check**, exactly like `GeneralCard.tsx` lines 59–75 — never `useEffect` on the `settings` object identity.
- Theme utilities: text `text-text-primary/secondary/tertiary`, backgrounds `bg-bg-base/raised/overlay/surface`, borders `border-border-subtle/default`, semantic `text-success|warning|error|info`, `bg-*-muted`, accent `bg-accent text-accent bg-accent-muted`. `Badge` takes `color` (`default|accent|success|warning|error|info`), `Button` takes `variant` (`primary|secondary|ghost|danger`) + `size` (`sm|md|lg`).
- **Load the `frontend-design` skill before Task 1 and before each card task** (Tasks 3–6) — the user requires it for all UI work.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_017mSv2DDn5QZPBHwUF4bkKc`.

---

### Task 1: Design pass + shared primitives

**Files:**
- Create: `src/components/ui/Switch.tsx`, `src/components/branding/AssetDropZone.tsx`, `src/features/storefront-settings/ui/CardHeader.tsx`, `src/features/storefront-settings/ui/SwitchRow.tsx`, `src/features/storefront-settings/ui/StepLog.tsx`
- Modify: `src/features/storefront-settings/GeneralCard.tsx`, `src/features/storefront-settings/CutoffsEditor.tsx` (use `Switch`), `src/features/settings/BrandingAssetsCard.tsx` (use the extracted `AssetDropZone`)

**Interfaces:**
- Produces:
  ```tsx
  // Switch.tsx
  export default function Switch(props: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean; className?: string }): JSX.Element
  // CardHeader.tsx
  export default function CardHeader(props: { icon: LucideIcon; title: string; description?: string; right?: ReactNode }): JSX.Element
  // SwitchRow.tsx
  export default function SwitchRow(props: { title: string; help?: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }): JSX.Element
  // StepLog.tsx
  export default function StepLog(props: { lines: { t: string; level: 'info' | 'warn' | 'error'; msg: string }[] }): JSX.Element
  // AssetDropZone.tsx
  export interface AssetDropZoneMeta { title: string; hint: string; accept: string; isAllowed: (f: File) => boolean; formats: string; emptyPrompt: string; rejectMessage: string }
  export default function AssetDropZone(props: { meta: AssetDropZoneMeta; currentUrl: string | null; upload: (file: File) => Promise<unknown>; remove: () => Promise<unknown>; onChanged: () => void }): JSX.Element
  ```

- [ ] **Step 1: Invoke the `frontend-design` skill**

Use the Skill tool: `frontend-design`. Brief it with: "Four new tabs on an existing dark admin (tokens in `src/styles/index.css`, primitives in `src/components/ui/`) — Appearance (brand + theme editor with colour swatches and font preview), Features (switch list with dependency hints), Integrations (two credential pairs), Deploy (connection → domain → releases → history with a step log). Existing tabs are single `Card`s with an icon+title header and a right-aligned Save. Decide: section rhythm inside long cards, how switch rows with help text read, how status/step pills read, and the step-log treatment." Record the outcome as the defaults below unless the pass yields something clearly better — then update the code in this task and note the change in the commit message.

Defaults this plan assumes: cards keep the existing `Card` + icon/title header; long cards are split into titled sub-sections (`<h4 class="text-xs font-semibold uppercase tracking-wide text-text-tertiary">`) with a `border-t border-border-subtle` between them; short fields sit in a `grid gap-4 sm:grid-cols-2`; switch rows are full-width `flex justify-between` with title + help on the left; status uses `Badge`; the step log is a monospace `text-xs` list with a muted timestamp column, `warn` lines in `text-warning`, `error` in `text-error`.

- [ ] **Step 2: `Switch` (extracted from the four inline copies)**

`src/components/ui/Switch.tsx`:

```tsx
import { cn } from '@/lib/cn.ts';

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name — required because the control has no visible text of its own. */
  label: string;
  disabled?: boolean;
  className?: string;
}

export default function Switch({ checked, onChange, label, disabled, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors',
        checked ? 'bg-accent' : 'bg-border-default',
        disabled && 'opacity-60 cursor-not-allowed',
        className,
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  );
}
```

Replace the inline `<button role="switch" …>` in `GeneralCard.tsx` (lines 119–137) with:

```tsx
          <Switch checked={enabled} onChange={setEnabled} label="Enable the storefront" />
```

and the one in `CutoffsEditor.tsx` (line 208 area) the same way, keeping its existing state variable and aria-label. Import `Switch from '@/components/ui/Switch.tsx'` in both. (`PriceListThemeCard.tsx` and `ProductsPage.tsx` keep their copies — out of scope.)

- [ ] **Step 3: `CardHeader`, `SwitchRow`, `StepLog`**

`src/features/storefront-settings/ui/CardHeader.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface CardHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  right?: ReactNode;
}

export default function CardHeader({ icon: Icon, title, description, right }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-text-tertiary shrink-0" />
          <h3 className="text-base font-semibold text-text-primary">{title}</h3>
        </div>
        {description && <p className="mt-1 text-xs text-text-tertiary">{description}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
```

`src/features/storefront-settings/ui/SwitchRow.tsx`:

```tsx
import Switch from '@/components/ui/Switch.tsx';
import { cn } from '@/lib/cn.ts';

interface SwitchRowProps {
  title: string;
  help?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export default function SwitchRow({ title, help, checked, onChange, disabled }: SwitchRowProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2', disabled && 'opacity-60')}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        {help && <p className="text-xs text-text-tertiary mt-0.5">{help}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} label={title} disabled={disabled} className="mt-0.5" />
    </div>
  );
}
```

`src/features/storefront-settings/ui/StepLog.tsx`:

```tsx
import { cn } from '@/lib/cn.ts';

export interface StepLogLine {
  t: string;
  level: 'info' | 'warn' | 'error';
  msg: string;
}

const LEVEL_CLASS = { info: 'text-text-secondary', warn: 'text-warning', error: 'text-error' } as const;

export default function StepLog({ lines }: { lines: StepLogLine[] }) {
  if (lines.length === 0) {
    return <p className="text-xs text-text-tertiary italic">No log lines yet.</p>;
  }
  return (
    <ol className="font-mono text-xs space-y-0.5 max-h-80 overflow-y-auto rounded-md bg-bg-base border border-border-subtle p-3">
      {lines.map((l, i) => (
        <li key={i} className="flex gap-3">
          <span className="text-text-tertiary shrink-0 tabular-nums">
            {new Date(l.t).toLocaleTimeString('en-GB', { hour12: false })}
          </span>
          <span className={cn('break-words', LEVEL_CLASS[l.level])}>{l.msg}</span>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 4: Extract `AssetDropZone`**

`src/components/branding/AssetDropZone.tsx` — the body is `BrandingAssetsCard.tsx` lines 63–154 made generic (upload/remove come from props; the parent decides what to invalidate):

```tsx
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button.tsx';
import { MAX_BRANDING_ASSET_SIZE } from '@/lib/branding-assets.ts';
import { cn } from '@/lib/cn.ts';

const MAX_SIZE_MB = MAX_BRANDING_ASSET_SIZE / (1024 * 1024);

export interface AssetDropZoneMeta {
  title: string;
  hint: string;
  accept: string;
  isAllowed: (file: File) => boolean;
  formats: string;
  emptyPrompt: string;
  rejectMessage: string;
}

interface AssetDropZoneProps {
  meta: AssetDropZoneMeta;
  currentUrl: string | null;
  upload: (file: File) => Promise<unknown>;
  remove: () => Promise<unknown>;
  /** Called after a successful upload or removal — invalidate your query here. */
  onChanged: () => void;
}

export default function AssetDropZone({ meta, currentUrl, upload, remove, onChanged }: AssetDropZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: upload,
    onSuccess: () => { toast.success(`${meta.title} uploaded`); onChanged(); },
    onError: (err: Error) => toast.error(err.message),
  });
  const deleteMutation = useMutation({
    mutationFn: remove,
    onSuccess: () => { toast.success(`${meta.title} removed`); onChanged(); },
    onError: (err: Error) => toast.error(err.message),
  });
  const busy = uploadMutation.isPending || deleteMutation.isPending;

  function validateAndUpload(file: File) {
    if (!meta.isAllowed(file)) { toast.error(meta.rejectMessage); return; }
    if (file.size > MAX_BRANDING_ASSET_SIZE) { toast.error(`File too large. Maximum size is ${MAX_SIZE_MB} MB.`); return; }
    uploadMutation.mutate(file);
  }
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (busy) return;
    const file = e.dataTransfer.files[0];
    if (file) validateAndUpload(file);
  }
  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) validateAndUpload(file);
    e.target.value = '';
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">{meta.title}</span>
        {currentUrl && (
          <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate()} disabled={busy}>
            <Trash2 className="w-3.5 h-3.5" /> Remove
          </Button>
        )}
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => { if (!busy) fileInputRef.current?.click(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (e.key === ' ') e.preventDefault();
            if (!busy) fileInputRef.current?.click();
          }
        }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'flex items-center gap-4 rounded-lg border border-dashed p-4 cursor-pointer transition-colors',
          isDragging ? 'border-accent bg-accent/10' : 'border-border-default hover:border-accent/50',
          busy && 'pointer-events-none opacity-60',
        )}
      >
        {currentUrl ? (
          <img src={currentUrl} alt={`Current ${meta.title.toLowerCase()}`} className="w-12 h-12 object-contain rounded bg-bg-surface p-1 shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded bg-bg-surface flex items-center justify-center shrink-0">
            {busy ? <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" /> : <Upload className="w-5 h-5 text-text-tertiary" />}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm text-text-secondary">
            {busy ? 'Working…' : currentUrl ? 'Click or drop a file to replace' : meta.emptyPrompt}
          </p>
          <p className="text-xs text-text-tertiary">{meta.hint} {meta.formats}, max {MAX_SIZE_MB} MB.</p>
        </div>
      </div>
      <input ref={fileInputRef} type="file" accept={meta.accept} onChange={handleFileSelect} className="hidden" />
    </div>
  );
}
```

Then in `src/features/settings/BrandingAssetsCard.tsx`: delete its local `AssetDropZone` function and its now-unused imports; render the shared one for each kind:

```tsx
<AssetDropZone
  meta={KIND_META[kind]}
  currentUrl={brandingAssetUrl(branding?.[kind === 'favicon' ? 'faviconUrl' : 'logoUrl'] ?? null)}
  upload={(file) => uploadBrandingAsset(kind, file)}
  remove={() => deleteBrandingAsset(kind)}
  onChanged={() => queryClient.invalidateQueries({ queryKey: settingsKeys.branding })}
/>
```

(Adjust the `currentUrl` expression to whatever field names that card already reads from its `Branding` object — keep its behaviour identical.) `KIND_META` there already has `title/hint/accept/isAllowed/formats/emptyPrompt/rejectMessage`; type it as `Record<BrandingAssetKind, AssetDropZoneMeta>`.

- [ ] **Step 5: Build + lint, check the two migrated screens**

Run: `npm run build && npm run lint`
Expected: clean. Open Settings → Branding: upload/remove still works; Storefront → General: the enable switch still toggles and saves.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Switch.tsx src/components/branding/AssetDropZone.tsx src/features/storefront-settings/ui/ src/features/storefront-settings/GeneralCard.tsx src/features/storefront-settings/CutoffsEditor.tsx src/features/settings/BrandingAssetsCard.tsx
git commit -m "refactor(ui): shared Switch, AssetDropZone, and storefront card primitives"
```

---

### Task 2: Types + API modules

**Files:**
- Modify: `src/types/storefront-settings.ts`, `src/api/storefront-settings.ts`, `src/lib/branding-assets.ts`
- Create: `src/types/storefront-deploy.ts`, `src/api/storefront-deploy.ts`

**Interfaces:**
- Produces (types): `StorefrontBrand`, `StorefrontFeatures`, `StorefrontTheme`, `StorefrontLayout`, extended `StorefrontSettings` / `StorefrontSettingsUpdate`; deploy types below.
- Produces (api): `uploadStorefrontBranding(kind, file)`, `deleteStorefrontBranding(kind)`, `apiOriginUrl(path)`; and in `storefront-deploy.ts`: `getConnection`, `connectCloudflare`, `testConnection`, `disconnectCloudflare`, `listZones`, `getTarget`, `setTarget`, `getReleases`, `listDeploys`, `getDeploy`, `createDeploy`, `storefrontDeployKeys`.

- [ ] **Step 1: Settings types**

Append to `src/types/storefront-settings.ts`:

```ts
export type StorefrontLayout = 'storefront' | 'menu';

export interface StorefrontBrand {
  name: string;
  shortName: string;
  tagline: string;
  title: string;
  description: string;
  /** px at the default header size, 16–64 */
  logoHeight: number;
  links: { whatsapp: string | null; telegram: string | null };
}

export interface StorefrontFeatures {
  layout: StorefrontLayout;
  ordering: boolean;
  guestCheckout: boolean;
  accounts: boolean;
  verify: boolean;
  tracking: boolean;
  wholesale: boolean;
  upsell: boolean;
}

export type StorefrontThemeColorKey = 'primary' | 'bg' | 'surface' | 'text' | 'muted' | 'success' | 'warn' | 'danger';

export interface StorefrontTheme {
  scheme: 'dark' | 'light';
  colors: Record<StorefrontThemeColorKey, string>;
  /** Google Fonts family names; null = system stack */
  fonts: { heading: string | null; body: string | null; mono: string | null };
  radius: 'sm' | 'md' | 'lg' | 'xl';
  density: 'comfortable' | 'compact';
  customCss: string;
}
```

Extend `StorefrontSettings` with:

```ts
  brand: StorefrontBrand | null;
  features: StorefrontFeatures;
  theme: StorefrontTheme;
  guestCheckoutEnabled: boolean;
  turnstileSiteKey: string | null;
  turnstileSecretSet: boolean;
  trackingApiUrl: string | null;
  trackingApiKeySet: boolean;
  /** Origin-relative URLs (`/api/v1/storefront-settings/branding/logo?v=…`); null when none uploaded. */
  branding: { logoUrl: string | null; faviconUrl: string | null };
```

and `StorefrontSettingsUpdate` with:

```ts
  brand?: StorefrontBrand;
  features?: StorefrontFeatures;
  theme?: StorefrontTheme;
  guestCheckoutEnabled?: boolean;
  turnstileSiteKey?: string | null;
  turnstileSecret?: string | null;
  trackingApiUrl?: string | null;
  trackingApiKey?: string | null;
```

- [ ] **Step 2: Settings API additions**

Append to `src/api/storefront-settings.ts`:

```ts
export type StorefrontBrandingKind = 'logo' | 'favicon';

export async function uploadStorefrontBranding(kind: StorefrontBrandingKind, file: File) {
  const formData = new FormData();
  formData.append('image', file);
  return unwrapResponse<{ url: string | null }>(api.post(`storefront-settings/branding/${kind}`, { body: formData }));
}

export async function deleteStorefrontBranding(kind: StorefrontBrandingKind) {
  return unwrapResponse<{ url: string | null }>(api.delete(`storefront-settings/branding/${kind}`));
}
```

Append to `src/lib/branding-assets.ts` (the storefront branding URLs are origin-relative, unlike the admin ones which are API-base-relative):

```ts
/** For URLs the backend returns relative to its *origin* (e.g. "/api/v1/storefront-settings/branding/logo?v=1"). */
export function apiOriginUrl(originRelative: string | null): string | null {
  if (!originRelative) return null;
  const origin = new URL(env.API_BASE_URL, typeof window !== 'undefined' ? window.location.origin : 'http://localhost').origin;
  return `${origin}${originRelative}`;
}
```

- [ ] **Step 3: Deploy types**

`src/types/storefront-deploy.ts`:

```ts
export type CloudflareConnection =
  | { connected: true; accountId: string; accountName: string; tokenSuffix: string; verifiedAt: string | null }
  | { connected: false };

export interface CloudflareAccountOption { id: string; name: string }

export type ConnectResult = CloudflareConnection | { needsAccount: true; accounts: CloudflareAccountOption[] };

export interface ConnectionTest {
  token: 'ok' | 'fail';
  accounts: 'ok' | 'fail';
  zones: 'ok' | 'fail';
  message?: string;
}

export interface CloudflareZone { id: string; name: string; status: string }

export interface DeployTarget { zoneId: string; zoneName: string; hostname: string }

export interface StorefrontRelease {
  tag: string;
  name: string;
  publishedAt: string;
  notes: string;
  assetName: string;
}

export interface ReleaseListing {
  releases: StorefrontRelease[];
  deployedTag: string | null;
  latestTag: string | null;
  updateAvailable: boolean;
}

export type DeployStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface DeployLogLine { t: string; level: 'info' | 'warn' | 'error'; msg: string }

export interface StorefrontDeploy {
  id: number;
  tag: string;
  hostname: string;
  status: DeployStatus;
  step: string | null;
  error: string | null;
  warning: string | null;
  triggeredByUserId: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StorefrontDeployDetail extends StorefrontDeploy {
  log: DeployLogLine[];
}
```

- [ ] **Step 4: Deploy API module**

`src/api/storefront-deploy.ts`:

```ts
import { api, unwrapResponse } from '@/lib/api-client.ts';
import type {
  CloudflareConnection,
  CloudflareZone,
  ConnectResult,
  ConnectionTest,
  DeployTarget,
  ReleaseListing,
  StorefrontDeploy,
  StorefrontDeployDetail,
} from '@/types/storefront-deploy.ts';

export async function getConnection() {
  return unwrapResponse<CloudflareConnection>(api.get('storefront-deploy/connection'));
}

export async function connectCloudflare(data: { apiToken: string; accountId?: string }) {
  return unwrapResponse<ConnectResult>(api.put('storefront-deploy/connection', { json: data }));
}

export async function testConnection() {
  return unwrapResponse<ConnectionTest>(api.post('storefront-deploy/connection/test'));
}

export async function disconnectCloudflare() {
  return unwrapResponse<{ ok: boolean }>(api.delete('storefront-deploy/connection'));
}

export async function listZones() {
  return unwrapResponse<CloudflareZone[]>(api.get('storefront-deploy/zones'));
}

export async function getTarget() {
  return unwrapResponse<DeployTarget | null>(api.get('storefront-deploy/target'));
}

export async function setTarget(data: { zoneId: string; hostname: string }) {
  return unwrapResponse<DeployTarget>(api.put('storefront-deploy/target', { json: data }));
}

export async function getReleases() {
  return unwrapResponse<ReleaseListing>(api.get('storefront-deploy/releases'));
}

export async function listDeploys() {
  return unwrapResponse<StorefrontDeploy[]>(api.get('storefront-deploy/deploys'));
}

export async function getDeploy(id: number) {
  return unwrapResponse<StorefrontDeployDetail>(api.get(`storefront-deploy/deploys/${id}`));
}

export async function createDeploy(data: { tag: string }) {
  return unwrapResponse<StorefrontDeploy>(api.post('storefront-deploy/deploys', { json: data }));
}

export const storefrontDeployKeys = {
  all: ['storefront-deploy'] as const,
  connection: () => ['storefront-deploy', 'connection'] as const,
  zones: () => ['storefront-deploy', 'zones'] as const,
  target: () => ['storefront-deploy', 'target'] as const,
  releases: () => ['storefront-deploy', 'releases'] as const,
  deploys: () => ['storefront-deploy', 'deploys'] as const,
  deploy: (id: number) => ['storefront-deploy', 'deploys', id] as const,
};
```

Note: `unwrapResponse` throws when `data === null`, so `getTarget` must tolerate a `null` target. Change that one call to read the envelope directly:

```ts
export async function getTarget(): Promise<DeployTarget | null> {
  const body = (await api.get('storefront-deploy/target').json()) as { success: boolean; data: DeployTarget | null; error: string | null };
  if (!body.success) throw new Error(body.error ?? 'An unexpected error occurred');
  return body.data;
}
```

- [ ] **Step 5: Build**

Run: `npm run build && npm run lint` → clean (nothing consumes the new code yet).

- [ ] **Step 6: Commit**

```bash
git add src/types/storefront-settings.ts src/types/storefront-deploy.ts src/api/storefront-settings.ts src/api/storefront-deploy.ts src/lib/branding-assets.ts
git commit -m "feat(storefront): types + API modules for appearance, integrations and deploy"
```

---

### Task 3: Appearance tab — `BrandCard` + `ThemeCard`

**Files:**
- Create: `src/features/storefront-settings/BrandCard.tsx`, `src/features/storefront-settings/ThemeCard.tsx`, `src/features/storefront-settings/AppearanceTab.tsx`
- Modify: `src/features/storefront-settings/StorefrontSettingsPage.tsx` (tab + panel)

**Interfaces:**
- Consumes: Task 1 primitives, Task 2 types/api, `ColorPicker` (`{ value, onChange }`), `Select` (`{ label, options, value, onChange }`), `Textarea`, `Input`.
- Produces: `AppearanceTab` default export (props: none). Reads `settings.brand`, `settings.theme`, `settings.branding`; needs the deploy target from `storefrontDeployKeys.target()` for the "Open storefront" link.

- [ ] **Step 1: Invoke `frontend-design`** for this tab (brief: brand form + logo/favicon drop zones; theme editor with eight swatches, font inputs with live preview, radius/density selects, custom CSS with a byte counter).

- [ ] **Step 2: `BrandCard`**

`src/features/storefront-settings/BrandCard.tsx`:

```tsx
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  deleteStorefrontBranding,
  getStorefrontSettings,
  storefrontSettingsKeys,
  updateStorefrontSettings,
  uploadStorefrontBranding,
} from '@/api/storefront-settings.ts';
import AssetDropZone, { type AssetDropZoneMeta } from '@/components/branding/AssetDropZone.tsx';
import Button from '@/components/ui/Button.tsx';
import Card from '@/components/ui/Card.tsx';
import Input from '@/components/ui/Input.tsx';
import Spinner from '@/components/ui/Spinner.tsx';
import Textarea from '@/components/ui/Textarea.tsx';
import { FAVICON_ACCEPT, SVG_ACCEPT, apiOriginUrl, isIcoFile, isSvgFile } from '@/lib/branding-assets.ts';
import type { StorefrontBrand } from '@/types/storefront-settings.ts';
import CardHeader from './ui/CardHeader.tsx';

const url = z.string().trim().url('Enter a full URL').max(300).or(z.literal(''));

const schema = z.object({
  name: z.string().trim().min(1, 'Required').max(100),
  shortName: z.string().trim().min(1, 'Required').max(40),
  tagline: z.string().trim().max(120),
  title: z.string().trim().min(1, 'Required').max(120),
  description: z.string().trim().max(300),
  logoHeight: z.coerce.number().int().min(16).max(64),
  whatsapp: url,
  telegram: url,
});
type FormData = z.infer<typeof schema>;

const EMPTY: FormData = { name: '', shortName: '', tagline: '', title: '', description: '', logoHeight: 28, whatsapp: '', telegram: '' };

function toForm(b: StorefrontBrand | null): FormData {
  if (!b) return EMPTY;
  return { name: b.name, shortName: b.shortName, tagline: b.tagline, title: b.title, description: b.description, logoHeight: b.logoHeight, whatsapp: b.links.whatsapp ?? '', telegram: b.links.telegram ?? '' };
}

const LOGO_META: AssetDropZoneMeta = {
  title: 'Logo', hint: 'Shown in the storefront header.', accept: SVG_ACCEPT, isAllowed: isSvgFile,
  formats: 'SVG only', emptyPrompt: 'Click or drop an SVG here', rejectMessage: 'Only SVG files are accepted.',
};
const FAVICON_META: AssetDropZoneMeta = {
  title: 'Favicon', hint: 'Browser tab icon.', accept: FAVICON_ACCEPT, isAllowed: (f) => isSvgFile(f) || isIcoFile(f),
  formats: 'SVG or ICO', emptyPrompt: 'Click or drop an SVG or ICO here', rejectMessage: 'Only SVG or ICO files are accepted.',
};

export default function BrandCard() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: storefrontSettingsKeys.all, queryFn: getStorefrontSettings });

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });

  // Content-keyed reset — see GeneralCard for why (all tabs share one query).
  const brandKey = settings ? JSON.stringify(settings.brand) : null;
  useEffect(() => {
    if (settings) reset(toForm(settings.brand));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandKey, reset]);

  const mutation = useMutation({
    mutationFn: (d: FormData) =>
      updateStorefrontSettings({
        brand: {
          name: d.name, shortName: d.shortName, tagline: d.tagline, title: d.title, description: d.description,
          logoHeight: d.logoHeight, links: { whatsapp: d.whatsapp || null, telegram: d.telegram || null },
        },
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: storefrontSettingsKeys.all }); toast.success('Brand saved'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: storefrontSettingsKeys.all });

  if (isLoading || !settings) {
    return <Card><div className="flex justify-center py-8"><Spinner size="lg" /></div></Card>;
  }

  return (
    <Card>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5">
        <CardHeader icon={BadgeCheck} title="Brand" description="Names, copy and links customers see. Leave blank to inherit the company name." />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name" id="brand-name" placeholder="Kratos Pharma" error={errors.name?.message} {...register('name')} />
          <Input label="Short name" id="brand-short" placeholder="KRATOS" error={errors.shortName?.message} {...register('shortName')} />
          <Input label="Tagline" id="brand-tagline" placeholder="Peptides & Supplements" error={errors.tagline?.message} {...register('tagline')} />
          <Input label="Browser title" id="brand-title" placeholder="Kratos Pharma — Shop" error={errors.title?.message} {...register('title')} />
        </div>
        <Textarea label="Meta description" id="brand-description" rows={2} error={errors.description?.message} {...register('description')} />

        <div className="border-t border-border-subtle pt-4 space-y-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Logo & favicon</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <AssetDropZone meta={LOGO_META} currentUrl={apiOriginUrl(settings.branding.logoUrl)} upload={(f) => uploadStorefrontBranding('logo', f)} remove={() => deleteStorefrontBranding('logo')} onChanged={invalidate} />
            <AssetDropZone meta={FAVICON_META} currentUrl={apiOriginUrl(settings.branding.faviconUrl)} upload={(f) => uploadStorefrontBranding('favicon', f)} remove={() => deleteStorefrontBranding('favicon')} onChanged={invalidate} />
          </div>
          <Input label="Logo height (px, 16–64)" id="brand-logo-height" type="number" min={16} max={64} className="w-40" error={errors.logoHeight?.message} {...register('logoHeight')} />
        </div>

        <div className="border-t border-border-subtle pt-4 space-y-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Contact links</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="WhatsApp" id="brand-whatsapp" placeholder="https://wa.me/…" error={errors.whatsapp?.message} {...register('whatsapp')} />
            <Input label="Telegram" id="brand-telegram" placeholder="https://t.me/…" error={errors.telegram?.message} {...register('telegram')} />
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button type="submit" size="sm" disabled={mutation.isPending || !isDirty}>
            {mutation.isPending ? <><Spinner size="sm" /> Saving...</> : <><Save className="w-3.5 h-3.5" /> Save</>}
          </Button>
        </div>
      </form>
    </Card>
  );
}
```

- [ ] **Step 3: `ThemeCard`**

`src/features/storefront-settings/ThemeCard.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Palette, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { getStorefrontSettings, storefrontSettingsKeys, updateStorefrontSettings } from '@/api/storefront-settings.ts';
import Button from '@/components/ui/Button.tsx';
import Card from '@/components/ui/Card.tsx';
import ColorPicker from '@/components/ui/ColorPicker.tsx';
import Input from '@/components/ui/Input.tsx';
import Select from '@/components/ui/Select.tsx';
import Spinner from '@/components/ui/Spinner.tsx';
import Textarea from '@/components/ui/Textarea.tsx';
import type { StorefrontTheme, StorefrontThemeColorKey } from '@/types/storefront-settings.ts';
import CardHeader from './ui/CardHeader.tsx';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, '6-digit hex');
const font = z.string().trim().max(50).regex(/^[A-Za-z0-9 ]*$/, 'Letters, digits and spaces only');
const MAX_CSS = 20 * 1024;

const schema = z.object({
  scheme: z.enum(['dark', 'light']),
  colors: z.object({ primary: hex, bg: hex, surface: hex, text: hex, muted: hex, success: hex, warn: hex, danger: hex }),
  fonts: z.object({ heading: font, body: font, mono: font }),
  radius: z.enum(['sm', 'md', 'lg', 'xl']),
  density: z.enum(['comfortable', 'compact']),
  customCss: z.string().max(MAX_CSS, 'Custom CSS is limited to 20 KB'),
});
type FormData = z.infer<typeof schema>;

const COLOR_FIELDS: { key: StorefrontThemeColorKey; label: string; help: string }[] = [
  { key: 'primary', label: 'Primary', help: 'Buttons, links, accents' },
  { key: 'bg', label: 'Background', help: 'Page background' },
  { key: 'surface', label: 'Surface', help: 'Cards and panels' },
  { key: 'text', label: 'Text', help: 'Body copy' },
  { key: 'muted', label: 'Muted', help: 'Secondary text' },
  { key: 'success', label: 'Success', help: 'Confirmations' },
  { key: 'warn', label: 'Warning', help: 'Notices' },
  { key: 'danger', label: 'Danger', help: 'Errors' },
];

function toForm(t: StorefrontTheme): FormData {
  return { ...t, fonts: { heading: t.fonts.heading ?? '', body: t.fonts.body ?? '', mono: t.fonts.mono ?? '' } };
}

/** Loads a Google Fonts stylesheet for `family` once so the preview line renders in it. */
function useGoogleFont(family: string) {
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    const fam = family.trim();
    if (!fam || loaded === fam) return;
    const id = `gf-preview-${fam.replace(/\s+/g, '-')}`;
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g, '+')}&display=swap`;
      document.head.appendChild(link);
    }
    const t = setTimeout(() => setLoaded(fam), 400);
    return () => clearTimeout(t);
  }, [family, loaded]);
}

function FontField({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  useGoogleFont(value);
  return (
    <div className="space-y-1">
      <Input label={label} placeholder="Inter (blank = system font)" value={value} onChange={(e) => onChange(e.target.value)} error={error} />
      <p className="text-sm text-text-secondary truncate" style={{ fontFamily: value.trim() ? `'${value.trim()}', sans-serif` : undefined }}>
        The quick brown fox jumps over the lazy dog 0123456789
      </p>
    </div>
  );
}

export default function ThemeCard() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: storefrontSettingsKeys.all, queryFn: getStorefrontSettings });

  const { control, register, handleSubmit, reset, watch, formState: { errors, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: settings ? toForm(settings.theme) : undefined,
  });

  const themeKey = settings ? JSON.stringify(settings.theme) : null;
  useEffect(() => {
    if (settings) reset(toForm(settings.theme));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeKey, reset]);

  const cssLength = new TextEncoder().encode(watch('customCss') ?? '').length;

  const mutation = useMutation({
    mutationFn: (d: FormData) =>
      updateStorefrontSettings({
        theme: { ...d, fonts: { heading: d.fonts.heading.trim() || null, body: d.fonts.body.trim() || null, mono: d.fonts.mono.trim() || null } },
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: storefrontSettingsKeys.all }); toast.success('Theme saved — live within about 30 seconds'); },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !settings) {
    return <Card><div className="flex justify-center py-8"><Spinner size="lg" /></div></Card>;
  }

  return (
    <Card>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5">
        <CardHeader icon={Palette} title="Theme" description="Colours, fonts and shape. Changes reach the storefront within its 30-second settings cache." />

        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Scheme" options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} {...register('scheme')} />
          <Select label="Corner radius" options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }, { value: 'xl', label: 'Extra large' }]} {...register('radius')} />
          <Select label="Density" options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} {...register('density')} />
        </div>

        <div className="border-t border-border-subtle pt-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Colours</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            {COLOR_FIELDS.map((f) => (
              <Controller
                key={f.key}
                control={control}
                name={`colors.${f.key}`}
                render={({ field }) => (
                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between">
                      <label className="text-sm font-medium text-text-secondary">{f.label}</label>
                      <span className="text-xs text-text-tertiary">{f.help}</span>
                    </div>
                    <ColorPicker value={field.value} onChange={field.onChange} />
                    {errors.colors?.[f.key] && <p className="text-xs text-error">{errors.colors[f.key]?.message}</p>}
                  </div>
                )}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-border-subtle pt-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Fonts (Google Fonts family names)</h4>
          <div className="grid gap-4 sm:grid-cols-3">
            {(['heading', 'body', 'mono'] as const).map((k) => (
              <Controller key={k} control={control} name={`fonts.${k}`} render={({ field }) => (
                <FontField label={k[0]!.toUpperCase() + k.slice(1)} value={field.value} onChange={field.onChange} error={errors.fonts?.[k]?.message} />
              )} />
            ))}
          </div>
        </div>

        <div className="border-t border-border-subtle pt-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Custom CSS</h4>
            <span className={cssLength > MAX_CSS ? 'text-xs text-error' : 'text-xs text-text-tertiary'}>{(cssLength / 1024).toFixed(1)} / 20 KB</span>
          </div>
          <Textarea rows={8} className="font-mono text-xs" placeholder=":root { --sf-line: #223; }" error={errors.customCss?.message} {...register('customCss')} />
          <p className="text-xs text-text-tertiary">Injected last in the cascade. `@import`, external `url()`s and expressions are rejected server-side.</p>
        </div>

        <div className="flex justify-end pt-1">
          <Button type="submit" size="sm" disabled={mutation.isPending || !isDirty}>
            {mutation.isPending ? <><Spinner size="sm" /> Saving...</> : <><Save className="w-3.5 h-3.5" /> Save</>}
          </Button>
        </div>
      </form>
    </Card>
  );
}
```

- [ ] **Step 4: `AppearanceTab` + page wiring**

`src/features/storefront-settings/AppearanceTab.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { getTarget, storefrontDeployKeys } from '@/api/storefront-deploy.ts';
import BrandCard from './BrandCard.tsx';
import ThemeCard from './ThemeCard.tsx';

export default function AppearanceTab() {
  const { data: target } = useQuery({ queryKey: storefrontDeployKeys.target(), queryFn: getTarget });
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {target ? (
          <a href={`https://${target.hostname}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
            Open storefront <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <p className="text-xs text-text-tertiary">Deploy the storefront (Deploy tab) to get a link here.</p>
        )}
      </div>
      <BrandCard />
      <ThemeCard />
    </div>
  );
}
```

In `StorefrontSettingsPage.tsx`: import `AppearanceTab`, add `{ id: 'appearance', label: 'Appearance' }` after `general` in `TABS`, add the panel `<div className={activeTab === 'appearance' ? 'space-y-6' : 'hidden'}><AppearanceTab /></div>`, and update the header paragraph to: "Configure the customer-facing storefront — availability, appearance, features, banners, shipping cut-offs, payments, integrations, WhatsApp login, and deployment."

- [ ] **Step 5: Build, lint, manual pass**

Run: `npm run build && npm run lint` → clean.
Against a local backend (with the backend plan's Tasks 2 and 7 applied): edit the brand name, save → toast, reload → persists; upload an SVG logo → preview appears; set a colour, save; type `Inter` in Heading → preview line changes typeface; paste `@import url(x);` into custom CSS, save → inline 422 message from the backend under the field. Switch to General mid-edit and back → the unsaved edit is still there.

- [ ] **Step 6: Commit**

```bash
git add src/features/storefront-settings/BrandCard.tsx src/features/storefront-settings/ThemeCard.tsx src/features/storefront-settings/AppearanceTab.tsx src/features/storefront-settings/StorefrontSettingsPage.tsx
git commit -m "feat(storefront): Appearance tab — brand, logo/favicon, theme editor"
```

---

### Task 4: Features tab

**Files:**
- Create: `src/features/storefront-settings/FeaturesCard.tsx`
- Modify: `src/features/storefront-settings/StorefrontSettingsPage.tsx`

**Interfaces:**
- Consumes: `SwitchRow`, `CardHeader`, `StorefrontFeatures`, `updateStorefrontSettings({ features, guestCheckoutEnabled })`.

- [ ] **Step 1: Invoke `frontend-design`** (brief: a switch list where three rules create dependencies — show the rule inline, disable the impossible state rather than erroring after the fact).

- [ ] **Step 2: `FeaturesCard`**

`src/features/storefront-settings/FeaturesCard.tsx` — plain `useState` (like `PaymentsCard`) because every field is a switch and the cross-field rules are easier to express directly:

```tsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, ToggleRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { getStorefrontSettings, storefrontSettingsKeys, updateStorefrontSettings } from '@/api/storefront-settings.ts';
import Button from '@/components/ui/Button.tsx';
import Card from '@/components/ui/Card.tsx';
import Select from '@/components/ui/Select.tsx';
import Spinner from '@/components/ui/Spinner.tsx';
import type { StorefrontFeatures } from '@/types/storefront-settings.ts';
import CardHeader from './ui/CardHeader.tsx';
import SwitchRow from './ui/SwitchRow.tsx';

type Draft = { features: StorefrontFeatures; guestCheckoutEnabled: boolean };

export default function FeaturesCard() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: storefrontSettingsKeys.all, queryFn: getStorefrontSettings });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  const serverKey = settings ? JSON.stringify([settings.features, settings.guestCheckoutEnabled]) : null;
  if (settings && serverKey !== syncedKey) {
    setSyncedKey(serverKey);
    setDraft({ features: settings.features, guestCheckoutEnabled: settings.guestCheckoutEnabled });
  }

  const mutation = useMutation({
    mutationFn: (d: Draft) => updateStorefrontSettings(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: storefrontSettingsKeys.all }); toast.success('Features saved'); },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !settings || !draft) {
    return <Card><div className="flex justify-center py-8"><Spinner size="lg" /></div></Card>;
  }

  const f = draft.features;
  const set = (patch: Partial<StorefrontFeatures>) => setDraft({ ...draft, features: { ...f, ...patch } });
  const dirty = JSON.stringify([draft.features, draft.guestCheckoutEnabled]) !== serverKey;

  // Backend rules (422 otherwise): wholesale requires ordering; ordering without accounts requires guestCheckout.
  const orderingOffBlocksWholesale = !f.ordering && f.wholesale;
  const needsGuest = f.ordering && !f.accounts && !f.guestCheckout;
  const invalid = orderingOffBlocksWholesale || needsGuest;

  return (
    <Card>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(draft); }} className="space-y-4">
        <CardHeader icon={ToggleRight} title="Features" description="What the storefront offers. Dependencies are enforced here and again by the server." />

        <Select
          label="Layout"
          value={f.layout}
          onChange={(e) => set({ layout: e.target.value as StorefrontFeatures['layout'] })}
          options={[{ value: 'storefront', label: 'Storefront — full shop with accounts' }, { value: 'menu', label: 'Menu — compact catalogue' }]}
        />

        <div className="divide-y divide-border-subtle">
          <SwitchRow title="Ordering" help="Off = browse-only, no cart." checked={f.ordering} onChange={(v) => set({ ordering: v, ...(v ? {} : { wholesale: false }) })} />
          <SwitchRow title="Accounts" help="WhatsApp / Telegram login, order history, loyalty." checked={f.accounts} onChange={(v) => set({ accounts: v })} />
          <SwitchRow
            title="Guest checkout"
            help={needsGuest ? 'Required: ordering is on and accounts are off.' : 'Checkout without an account (Turnstile-verified).'}
            checked={f.guestCheckout}
            onChange={(v) => set({ guestCheckout: v })}
          />
          <SwitchRow title="Product verification" help="/verify page for label codes." checked={f.verify} onChange={(v) => set({ verify: v })} />
          <SwitchRow title="Parcel tracking" help="Needs the Tracking API (Integrations tab)." checked={f.tracking} onChange={(v) => set({ tracking: v })} />
          <SwitchRow title="Wholesale" help={f.ordering ? 'Tiered catalogue table instead of product cards.' : 'Requires ordering.'} checked={f.wholesale} disabled={!f.ordering} onChange={(v) => set({ wholesale: v, ...(v ? { upsell: false } : {}) })} />
          <SwitchRow title="Upsells" help={f.wholesale ? 'Not available with wholesale.' : 'Suggest add-ons in the cart.'} checked={f.upsell} disabled={f.wholesale} onChange={(v) => set({ upsell: v })} />
        </div>

        <div className="border-t border-border-subtle pt-3">
          <SwitchRow
            title="Guest checkout master switch"
            help="Both this and the feature flag above must be on. Also needs a Turnstile site key and secret (Integrations)."
            checked={draft.guestCheckoutEnabled}
            onChange={(v) => setDraft({ ...draft, guestCheckoutEnabled: v })}
          />
        </div>

        {invalid && (
          <p className="text-xs text-error">
            {orderingOffBlocksWholesale ? 'Wholesale needs ordering on.' : 'Turn on guest checkout, or accounts, while ordering is on.'}
          </p>
        )}

        <div className="flex justify-end pt-1">
          <Button type="submit" size="sm" disabled={mutation.isPending || !dirty || invalid}>
            {mutation.isPending ? <><Spinner size="sm" /> Saving...</> : <><Save className="w-3.5 h-3.5" /> Save</>}
          </Button>
        </div>
      </form>
    </Card>
  );
}
```

- [ ] **Step 3: Page wiring**

Add `{ id: 'features', label: 'Features' }` after `appearance` in `TABS` and the panel `<div className={activeTab === 'features' ? 'space-y-6' : 'hidden'}><FeaturesCard /></div>`.

- [ ] **Step 4: Build, lint, manual pass**

`npm run build && npm run lint` → clean. Turn ordering off → Wholesale greys out and unchecks; turn accounts off with ordering on → the guest checkout row shows "Required…" and Save disables until guest checkout is on; save → persists.

- [ ] **Step 5: Commit**

```bash
git add src/features/storefront-settings/FeaturesCard.tsx src/features/storefront-settings/StorefrontSettingsPage.tsx
git commit -m "feat(storefront): Features tab with dependency-aware switches"
```

---

### Task 5: Integrations tab

**Files:**
- Create: `src/features/storefront-settings/IntegrationsCard.tsx`
- Modify: `src/features/storefront-settings/StorefrontSettingsPage.tsx`

**Interfaces:**
- Consumes: `updateStorefrontSettings({ turnstileSiteKey, turnstileSecret, trackingApiUrl, trackingApiKey })`; `turnstileSecretSet` / `trackingApiKeySet` booleans.

- [ ] **Step 1: Invoke `frontend-design`** (brief: two credential pairs, secrets write-only with a "set" state and explicit Clear).

- [ ] **Step 2: `IntegrationsCard`**

```tsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Plug, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { getStorefrontSettings, storefrontSettingsKeys, updateStorefrontSettings } from '@/api/storefront-settings.ts';
import Badge from '@/components/ui/Badge.tsx';
import Button from '@/components/ui/Button.tsx';
import Card from '@/components/ui/Card.tsx';
import Input from '@/components/ui/Input.tsx';
import Spinner from '@/components/ui/Spinner.tsx';
import CardHeader from './ui/CardHeader.tsx';

const schema = z.object({
  turnstileSiteKey: z.string().trim().max(100),
  turnstileSecret: z.string().trim().max(100),
  trackingApiUrl: z.string().trim().url('Enter a full URL').max(300).or(z.literal('')),
  trackingApiKey: z.string().trim().max(200),
});
type FormData = z.infer<typeof schema>;

function SecretField({ label, id, isSet, clear, onClear, error, ...rest }: { label: string; id: string; isSet: boolean; clear: boolean; onClear: () => void; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-text-secondary">{label}</label>
        {isSet && !clear && <Badge color="success">set</Badge>}
        {clear && <Badge color="warning">will be cleared</Badge>}
      </div>
      <div className="flex gap-2">
        <Input id={id} type="password" autoComplete="off" placeholder={isSet ? '•••••••• (leave blank to keep)' : 'Not set'} className="flex-1" error={error} disabled={clear} {...rest} />
        {isSet && <Button type="button" variant="ghost" size="sm" onClick={onClear}>{clear ? 'Keep' : 'Clear'}</Button>}
      </div>
    </div>
  );
}

export default function IntegrationsCard() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: storefrontSettingsKeys.all, queryFn: getStorefrontSettings });
  const [clearTurnstile, setClearTurnstile] = useState(false);
  const [clearTracking, setClearTracking] = useState(false);

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { turnstileSiteKey: '', turnstileSecret: '', trackingApiUrl: '', trackingApiKey: '' },
  });

  const key = settings ? JSON.stringify([settings.turnstileSiteKey, settings.turnstileSecretSet, settings.trackingApiUrl, settings.trackingApiKeySet]) : null;
  useEffect(() => {
    if (settings) {
      reset({ turnstileSiteKey: settings.turnstileSiteKey ?? '', turnstileSecret: '', trackingApiUrl: settings.trackingApiUrl ?? '', trackingApiKey: '' });
      setClearTurnstile(false);
      setClearTracking(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reset]);

  const mutation = useMutation({
    mutationFn: (d: FormData) =>
      updateStorefrontSettings({
        turnstileSiteKey: d.turnstileSiteKey || null,
        ...(clearTurnstile ? { turnstileSecret: null } : d.turnstileSecret ? { turnstileSecret: d.turnstileSecret } : {}),
        trackingApiUrl: d.trackingApiUrl || null,
        ...(clearTracking ? { trackingApiKey: null } : d.trackingApiKey ? { trackingApiKey: d.trackingApiKey } : {}),
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: storefrontSettingsKeys.all }); toast.success('Integrations saved'); },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !settings) {
    return <Card><div className="flex justify-center py-8"><Spinner size="lg" /></div></Card>;
  }

  const dirty = isDirty || clearTurnstile || clearTracking;

  return (
    <Card>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5">
        <CardHeader icon={Plug} title="Integrations" description="Secrets are write-only: they are never shown again after saving." />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Cloudflare Turnstile</h4>
            <a href="https://dash.cloudflare.com/?to=/:account/turnstile" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">Manage widgets <ExternalLink className="w-3 h-3" /></a>
          </div>
          <p className="text-xs text-text-tertiary">Required for guest checkout and parcel tracking. Add the storefront hostname to the widget's allowed domains.</p>
          <Input label="Site key" id="ts-site" placeholder="0x4AAAAAAA…" error={errors.turnstileSiteKey?.message} {...register('turnstileSiteKey')} />
          <SecretField label="Secret key" id="ts-secret" isSet={settings.turnstileSecretSet} clear={clearTurnstile} onClear={() => setClearTurnstile((v) => !v)} error={errors.turnstileSecret?.message} {...register('turnstileSecret')} />
        </div>

        <div className="border-t border-border-subtle pt-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Parcel tracking API</h4>
          <p className="text-xs text-text-tertiary">Until both are set the tracking page runs in degraded mode (no live events).</p>
          <Input label="API URL" id="tr-url" placeholder="https://…" error={errors.trackingApiUrl?.message} {...register('trackingApiUrl')} />
          <SecretField label="API key" id="tr-key" isSet={settings.trackingApiKeySet} clear={clearTracking} onClear={() => setClearTracking((v) => !v)} error={errors.trackingApiKey?.message} {...register('trackingApiKey')} />
        </div>

        <div className="flex justify-end pt-1">
          <Button type="submit" size="sm" disabled={mutation.isPending || !dirty}>
            {mutation.isPending ? <><Spinner size="sm" /> Saving...</> : <><Save className="w-3.5 h-3.5" /> Save</>}
          </Button>
        </div>
      </form>
    </Card>
  );
}
```

- [ ] **Step 3: Page wiring**

Add `{ id: 'integrations', label: 'Integrations' }` after `payments` in `TABS` and the panel `<div className={activeTab === 'integrations' ? 'space-y-6' : 'hidden'}><IntegrationsCard /></div>`.

- [ ] **Step 4: Build, lint, manual pass**

`npm run build && npm run lint` → clean. Save a Turnstile secret → the "set" badge appears and the field is blank; save again with the field blank → still set; Clear → save → badge gone.

- [ ] **Step 5: Commit**

```bash
git add src/features/storefront-settings/IntegrationsCard.tsx src/features/storefront-settings/StorefrontSettingsPage.tsx
git commit -m "feat(storefront): Integrations tab — Turnstile + tracking API credentials"
```

---

### Task 6: Deploy tab

**Files:**
- Create: `src/features/storefront-settings/deploy/CloudflareConnectionCard.tsx`, `deploy/DomainCard.tsx`, `deploy/ReleaseCard.tsx`, `deploy/DeployHistoryCard.tsx`, `deploy/DeployTab.tsx`
- Modify: `src/features/storefront-settings/StorefrontSettingsPage.tsx`

**Interfaces:**
- Consumes: everything in `src/api/storefront-deploy.ts`, `useSocket()` (`Socket | null`), `useConfirm()` + `ConfirmDialog`, `formatRelativeTime` from `@/lib/format.ts`, `StepLog`, `CardHeader`, `Badge`.
- Socket event: `storefront-deploy:updated` → invalidate `storefrontDeployKeys.deploys()`, the open detail, and `storefrontDeployKeys.releases()`.

- [ ] **Step 1: Invoke `frontend-design`** (brief: a four-stage flow — connect → domain → release → history — where each stage is a card that reads as locked until the previous one is done; live step log inside an expandable history row).

- [ ] **Step 2: `CloudflareConnectionCard`**

```tsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cloud, ExternalLink, Unplug } from 'lucide-react';
import toast from 'react-hot-toast';
import { connectCloudflare, disconnectCloudflare, getConnection, storefrontDeployKeys, testConnection } from '@/api/storefront-deploy.ts';
import Badge from '@/components/ui/Badge.tsx';
import Button from '@/components/ui/Button.tsx';
import Card from '@/components/ui/Card.tsx';
import ConfirmDialog from '@/components/ui/ConfirmDialog.tsx';
import Input from '@/components/ui/Input.tsx';
import Select from '@/components/ui/Select.tsx';
import Spinner from '@/components/ui/Spinner.tsx';
import { useConfirm } from '@/hooks/use-confirm.ts';
import { formatRelativeTime } from '@/lib/format.ts';
import type { CloudflareAccountOption, ConnectionTest } from '@/types/storefront-deploy.ts';
import CardHeader from '../ui/CardHeader.tsx';

const PERMISSIONS = [
  ['Account', 'Workers Scripts', 'Edit'],
  ['Account', 'Account Settings', 'Read'],
  ['Zone', 'Zone', 'Read'],
  ['Zone', 'Workers Routes', 'Edit'],
  ['Zone', 'DNS', 'Edit'],
  ['Zone', 'SSL and Certificates', 'Edit'],
] as const;

const CREATE_TOKEN_URL = 'https://dash.cloudflare.com/profile/api-tokens';

export default function CloudflareConnectionCard() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: connection, isLoading } = useQuery({ queryKey: storefrontDeployKeys.connection(), queryFn: getConnection });
  const [token, setToken] = useState('');
  const [accounts, setAccounts] = useState<CloudflareAccountOption[] | null>(null);
  const [accountId, setAccountId] = useState('');
  const [test, setTest] = useState<ConnectionTest | null>(null);

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: storefrontDeployKeys.all });

  const connect = useMutation({
    mutationFn: () => connectCloudflare({ apiToken: token.trim(), ...(accountId ? { accountId } : {}) }),
    onSuccess: (res) => {
      if ('needsAccount' in res) {
        setAccounts(res.accounts);
        toast('Pick which Cloudflare account to use');
        return;
      }
      setToken(''); setAccounts(null); setAccountId('');
      toast.success('Cloudflare connected');
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const runTest = useMutation({
    mutationFn: testConnection,
    onSuccess: (res) => { setTest(res); queryClient.invalidateQueries({ queryKey: storefrontDeployKeys.connection() }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const disconnect = useMutation({
    mutationFn: disconnectCloudflare,
    onSuccess: () => { setTest(null); toast.success('Cloudflare disconnected'); invalidateAll(); },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !connection) {
    return <Card><div className="flex justify-center py-8"><Spinner size="lg" /></div></Card>;
  }

  return (
    <Card>
      <div className="space-y-4">
        <CardHeader
          icon={Cloud}
          title="1. Cloudflare account"
          description="The storefront is deployed into your own Cloudflare account with an API token you create."
          right={connection.connected ? <Badge color="success">Connected</Badge> : <Badge>Not connected</Badge>}
        />

        {connection.connected ? (
          <>
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-text-tertiary">Account</dt><dd className="text-text-primary">{connection.accountName}</dd></div>
              <div><dt className="text-xs text-text-tertiary">Token</dt><dd className="font-mono text-text-primary">…{connection.tokenSuffix}</dd></div>
              <div><dt className="text-xs text-text-tertiary">Last verified</dt><dd className="text-text-primary">{connection.verifiedAt ? formatRelativeTime(connection.verifiedAt) : '—'}</dd></div>
            </dl>
            {test && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {(['token', 'accounts', 'zones'] as const).map((k) => (
                  <Badge key={k} color={test[k] === 'ok' ? 'success' : 'error'}>{k}: {test[k]}</Badge>
                ))}
                {test.message && <span className="text-error">{test.message}</span>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => runTest.mutate()} disabled={runTest.isPending}>
                {runTest.isPending ? <><Spinner size="sm" /> Testing…</> : 'Test connection'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => confirm.confirm({ title: 'Disconnect Cloudflare?', message: 'The token and the chosen domain are forgotten. The deployed storefront keeps running.', confirmLabel: 'Disconnect', onConfirm: () => disconnect.mutate() })}>
                <Unplug className="w-3.5 h-3.5" /> Disconnect
              </Button>
            </div>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); connect.mutate(); }} className="space-y-4">
            <div className="rounded-lg border border-border-subtle bg-bg-surface p-3 text-xs text-text-secondary space-y-2">
              <p>
                Create a token at{' '}
                <a href={CREATE_TOKEN_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">dash.cloudflare.com → API Tokens <ExternalLink className="w-3 h-3" /></a>
                {' '}("Create Custom Token") with exactly these permissions, scoped to the account and zone you will use:
              </p>
              <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
                {PERMISSIONS.map(([scope, name, level]) => <li key={name}>{scope} · {name} · {level}</li>)}
              </ul>
            </div>
            <Input label="API token" id="cf-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste the token — it is stored encrypted and never shown again" />
            {accounts && (
              <Select label="Account" value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="Choose an account" options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
            )}
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={connect.isPending || token.trim().length < 10 || (accounts !== null && !accountId)}>
                {connect.isPending ? <><Spinner size="sm" /> Verifying…</> : 'Connect'}
              </Button>
            </div>
          </form>
        )}
      </div>
      <ConfirmDialog open={confirm.open} onClose={confirm.close} onConfirm={() => { confirm.onConfirm(); confirm.close(); }} title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} variant={confirm.variant} loading={disconnect.isPending} />
    </Card>
  );
}
```

- [ ] **Step 3: `DomainCard`**

```tsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { getConnection, getTarget, listZones, setTarget, storefrontDeployKeys } from '@/api/storefront-deploy.ts';
import Badge from '@/components/ui/Badge.tsx';
import Button from '@/components/ui/Button.tsx';
import Card from '@/components/ui/Card.tsx';
import Input from '@/components/ui/Input.tsx';
import Select from '@/components/ui/Select.tsx';
import Spinner from '@/components/ui/Spinner.tsx';
import CardHeader from '../ui/CardHeader.tsx';

export default function DomainCard() {
  const queryClient = useQueryClient();
  const { data: connection } = useQuery({ queryKey: storefrontDeployKeys.connection(), queryFn: getConnection });
  const connected = connection?.connected === true;
  const { data: zones, isLoading: zonesLoading, error: zonesError } = useQuery({ queryKey: storefrontDeployKeys.zones(), queryFn: listZones, enabled: connected });
  const { data: target } = useQuery({ queryKey: storefrontDeployKeys.target(), queryFn: getTarget, enabled: connected });

  const [zoneId, setZoneId] = useState('');
  const [hostname, setHostname] = useState('');
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  const serverKey = target === undefined ? null : JSON.stringify(target);
  if (serverKey !== syncedKey) {
    setSyncedKey(serverKey);
    setZoneId(target?.zoneId ?? '');
    setHostname(target?.hostname ?? '');
  }

  const zone = zones?.find((z) => z.id === zoneId);
  const dirty = zoneId !== (target?.zoneId ?? '') || hostname.trim().toLowerCase() !== (target?.hostname ?? '');
  const hostnameOk = zone ? hostname.trim().toLowerCase() === zone.name || hostname.trim().toLowerCase().endsWith(`.${zone.name}`) : false;

  const save = useMutation({
    mutationFn: () => setTarget({ zoneId, hostname: hostname.trim() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: storefrontDeployKeys.target() }); toast.success('Domain saved'); },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <CardHeader
          icon={Globe}
          title="2. Domain"
          description="A hostname on one of your Cloudflare zones. DNS and the certificate are created automatically on deploy."
          right={target ? <Badge color="success">{target.hostname}</Badge> : connected ? <Badge>Not set</Badge> : <Badge>Connect first</Badge>}
        />
        {!connected ? (
          <p className="text-xs text-text-tertiary">Connect your Cloudflare account above to list zones.</p>
        ) : zonesLoading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : zonesError ? (
          <p className="text-xs text-error">{(zonesError as Error).message}</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Zone" value={zoneId} onChange={(e) => { setZoneId(e.target.value); const z = zones?.find((x) => x.id === e.target.value); if (z && !hostname) setHostname(`shop.${z.name}`); }} placeholder={zones && zones.length ? 'Choose a zone' : 'No active zones in this account'} options={(zones ?? []).map((z) => ({ value: z.id, label: z.name }))} />
              <Input label="Hostname" id="cf-hostname" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder={zone ? `shop.${zone.name}` : 'shop.example.com'} disabled={!zone} error={zone && hostname && !hostnameOk ? `Must be ${zone.name} or a subdomain of it` : undefined} />
            </div>
            <p className="text-xs text-text-tertiary">The hostname must not already have a CNAME record. Deploying a second time to the same hostname just updates the Worker.</p>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={save.isPending || !dirty || !zone || !hostnameOk}>
                {save.isPending ? <><Spinner size="sm" /> Saving...</> : <><Save className="w-3.5 h-3.5" /> Save</>}
              </Button>
            </div>
          </>
        )}
      </form>
    </Card>
  );
}
```

- [ ] **Step 4: `ReleaseCard`**

```tsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Package, Rocket } from 'lucide-react';
import toast from 'react-hot-toast';
import { createDeploy, getConnection, getReleases, getTarget, listDeploys, storefrontDeployKeys } from '@/api/storefront-deploy.ts';
import Badge from '@/components/ui/Badge.tsx';
import Button from '@/components/ui/Button.tsx';
import Card from '@/components/ui/Card.tsx';
import ConfirmDialog from '@/components/ui/ConfirmDialog.tsx';
import Spinner from '@/components/ui/Spinner.tsx';
import { useConfirm } from '@/hooks/use-confirm.ts';
import { formatDate } from '@/lib/format.ts';
import CardHeader from '../ui/CardHeader.tsx';

export default function ReleaseCard() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [openNotes, setOpenNotes] = useState<string | null>(null);
  const { data: connection } = useQuery({ queryKey: storefrontDeployKeys.connection(), queryFn: getConnection });
  const { data: target } = useQuery({ queryKey: storefrontDeployKeys.target(), queryFn: getTarget, enabled: connection?.connected === true });
  const { data: listing, isLoading, error } = useQuery({ queryKey: storefrontDeployKeys.releases(), queryFn: getReleases });
  const { data: deploys } = useQuery({ queryKey: storefrontDeployKeys.deploys(), queryFn: listDeploys });
  const active = deploys?.some((d) => d.status === 'queued' || d.status === 'running') ?? false;

  const deploy = useMutation({
    mutationFn: (tag: string) => createDeploy({ tag }),
    onSuccess: (row) => { toast.success(`Deploy of ${row.tag} queued`); queryClient.invalidateQueries({ queryKey: storefrontDeployKeys.deploys() }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const blocker = !connection?.connected ? 'Connect Cloudflare first' : !target ? 'Choose a domain first' : active ? 'A deploy is in progress' : null;

  return (
    <Card>
      <div className="space-y-4">
        <CardHeader
          icon={Package}
          title="3. Release"
          description="Published releases of the storefront. Deploying an older tag is how you roll back."
          right={listing?.updateAvailable ? <Badge color="accent">Update available</Badge> : listing?.deployedTag ? <Badge color="success">Up to date</Badge> : null}
        />
        {isLoading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : error ? (
          <p className="text-xs text-error">{(error as Error).message}</p>
        ) : !listing || listing.releases.length === 0 ? (
          <p className="text-xs text-text-tertiary italic">No releases published yet.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {listing.releases.map((r) => {
              const current = r.tag === listing.deployedTag;
              const expanded = openNotes === r.tag;
              return (
                <li key={r.tag} className="py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setOpenNotes(expanded ? null : r.tag)} className="text-text-tertiary hover:text-text-primary" aria-label={expanded ? 'Hide notes' : 'Show notes'}>
                      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-text-primary">{r.tag}</span>
                        {current && <Badge color="success">Current</Badge>}
                        {r.tag === listing.latestTag && !current && <Badge color="accent">Latest</Badge>}
                      </div>
                      <p className="text-xs text-text-tertiary">{r.publishedAt ? formatDate(r.publishedAt) : ''}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={current ? 'secondary' : 'primary'}
                      disabled={Boolean(blocker) || deploy.isPending}
                      title={blocker ?? undefined}
                      onClick={() => confirm.confirm({ title: `Deploy ${r.tag}?`, message: `This uploads ${r.tag} to ${target?.hostname ?? 'your domain'} in your Cloudflare account. The site keeps serving the previous version until the new Worker is live.`, confirmLabel: current ? 'Redeploy' : 'Deploy', variant: 'primary', onConfirm: () => deploy.mutate(r.tag) })}
                    >
                      <Rocket className="w-3.5 h-3.5" /> {current ? 'Redeploy' : 'Deploy'}
                    </Button>
                  </div>
                  {expanded && (
                    <pre className="whitespace-pre-wrap text-xs text-text-secondary bg-bg-surface rounded-md p-3 ml-7">{r.notes || 'No release notes.'}</pre>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {blocker && <p className="text-xs text-text-tertiary">{blocker}.</p>}
      </div>
      <ConfirmDialog open={confirm.open} onClose={confirm.close} onConfirm={() => { confirm.onConfirm(); confirm.close(); }} title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} variant={confirm.variant} loading={deploy.isPending} />
    </Card>
  );
}
```

- [ ] **Step 5: `DeployHistoryCard`**

```tsx
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, History, MessageSquareWarning } from 'lucide-react';
import { getDeploy, listDeploys, storefrontDeployKeys } from '@/api/storefront-deploy.ts';
import Badge from '@/components/ui/Badge.tsx';
import Card from '@/components/ui/Card.tsx';
import Spinner from '@/components/ui/Spinner.tsx';
import { useSocket } from '@/hooks/use-socket.ts';
import { formatRelativeTime } from '@/lib/format.ts';
import type { DeployStatus, StorefrontDeploy } from '@/types/storefront-deploy.ts';
import CardHeader from '../ui/CardHeader.tsx';
import StepLog from '../ui/StepLog.tsx';

const STATUS_META: Record<DeployStatus, { label: string; color: 'default' | 'info' | 'success' | 'error' }> = {
  queued: { label: 'Queued', color: 'default' },
  running: { label: 'Running', color: 'info' },
  succeeded: { label: 'Succeeded', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
};

function duration(d: StorefrontDeploy): string {
  if (!d.startedAt) return '—';
  const end = d.finishedAt ? new Date(d.finishedAt).getTime() : Date.now();
  const s = Math.max(0, Math.round((end - new Date(d.startedAt).getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function DeployRow({ deploy }: { deploy: StorefrontDeploy }) {
  const [open, setOpen] = useState(deploy.status === 'running' || deploy.status === 'queued');
  const isActive = deploy.status === 'running' || deploy.status === 'queued';
  const { data: detail } = useQuery({
    queryKey: storefrontDeployKeys.deploy(deploy.id),
    queryFn: () => getDeploy(deploy.id),
    enabled: open,
    refetchInterval: open && isActive ? 3000 : false,
  });
  const meta = STATUS_META[deploy.status];
  return (
    <li className="py-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 text-left">
        {open ? <ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" />}
        <Badge color={meta.color}>{isActive && <Spinner size="sm" className="mr-1" />}{meta.label}</Badge>
        <span className="font-mono text-sm text-text-primary">{deploy.tag}</span>
        <span className="text-xs text-text-tertiary truncate">{deploy.hostname}</span>
        <span className="ml-auto text-xs text-text-tertiary shrink-0">{isActive && deploy.step ? `${deploy.step} · ` : ''}{duration(deploy)} · {formatRelativeTime(deploy.createdAt)}</span>
      </button>
      {(deploy.error || deploy.warning) && (
        <p className={`mt-1 ml-7 text-xs ${deploy.error ? 'text-error' : 'text-warning'}`}>{deploy.error ?? deploy.warning}</p>
      )}
      {open && (
        <div className="mt-2 ml-7">
          {detail ? <StepLog lines={detail.log} /> : <Spinner size="sm" />}
        </div>
      )}
    </li>
  );
}

export default function DeployHistoryCard() {
  const qc = useQueryClient();
  const socket = useSocket();
  const { data: deploys, isLoading } = useQuery({
    queryKey: storefrontDeployKeys.deploys(),
    queryFn: listDeploys,
    // Poll only while something is active; the socket event covers the rest.
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === 'queued' || d.status === 'running') ? 5000 : false),
  });

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: { id: number }) => {
      qc.invalidateQueries({ queryKey: storefrontDeployKeys.deploys() });
      qc.invalidateQueries({ queryKey: storefrontDeployKeys.deploy(payload.id) });
      qc.invalidateQueries({ queryKey: storefrontDeployKeys.releases() });
      qc.invalidateQueries({ queryKey: storefrontDeployKeys.target() });
    };
    socket.on('storefront-deploy:updated', handler);
    return () => { socket.off('storefront-deploy:updated', handler); };
  }, [socket, qc]);

  const firstSuccess = deploys?.some((d) => d.status === 'succeeded');

  return (
    <Card>
      <div className="space-y-3">
        <CardHeader icon={History} title="4. Deploy history" description="Latest 20. Expand a row for the step-by-step log." />
        {firstSuccess && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-muted p-3 text-xs text-text-secondary">
            <MessageSquareWarning className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <p>One manual step remains for Telegram login: message @BotFather, run <code className="font-mono">/setdomain</code>, pick the storefront bot and enter the site's origin (for example <code className="font-mono">https://{deploys?.find((d) => d.status === 'succeeded')?.hostname}</code>).</p>
          </div>
        )}
        {isLoading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : !deploys || deploys.length === 0 ? (
          <p className="text-xs text-text-tertiary italic">No deploys yet.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">{deploys.map((d) => <DeployRow key={d.id} deploy={d} />)}</ul>
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 6: `DeployTab` + page wiring**

`src/features/storefront-settings/deploy/DeployTab.tsx`:

```tsx
import CloudflareConnectionCard from './CloudflareConnectionCard.tsx';
import DeployHistoryCard from './DeployHistoryCard.tsx';
import DomainCard from './DomainCard.tsx';
import ReleaseCard from './ReleaseCard.tsx';

export default function DeployTab() {
  return (
    <div className="space-y-6">
      <CloudflareConnectionCard />
      <DomainCard />
      <ReleaseCard />
      <DeployHistoryCard />
    </div>
  );
}
```

In `StorefrontSettingsPage.tsx`: add `{ id: 'deploy', label: 'Deploy' }` as the last tab and the panel `<div className={activeTab === 'deploy' ? 'space-y-6' : 'hidden'}><DeployTab /></div>`. Final `TABS` order: General, Appearance, Features, Notices, Cut-offs, Payments, Integrations, WhatsApp, Deploy.

- [ ] **Step 7: Build + lint**

`npm run build && npm run lint` → clean.

- [ ] **Step 8: End-to-end against the user's Cloudflare account**

Prerequisites: backend running with the backend plan fully applied and `API_HOST` set to a hostname the Worker can reach over HTTPS; Plan 1's `v0.1.0` release exists.

1. Deploy tab → paste a token created with the listed permissions → Connect → "Connected" with the account name and `…xxxx`.
2. Test connection → three green badges.
3. Domain → pick the test zone, hostname `shop-test.<zone>` → Save → badge shows the hostname.
4. Release → `v0.1.0` → Deploy → confirm. The history row appears as Queued, flips to Running, its log fills live (socket) through `download … health`, ends Succeeded (or Succeeded with the certificate warning — re-check `https://shop-test.<zone>/healthz` after a couple of minutes: `ok`).
5. Release list now shows `v0.1.0` as Current; Appearance tab shows "Open storefront" → the site loads.
6. Redeploy `v0.1.0` → log shows "Cloudflare already has every asset" and "already attached" lines; succeeds faster.
7. `GET /api/v1/orders/<any id>` → `publicUrl` starts with `https://shop-test.<zone>/`.
8. Disconnect while nothing runs → target cleared, Domain card back to "Connect first".

Record anything that failed and what fixed it in the commit message of the fix.

- [ ] **Step 9: Commit**

```bash
git add src/features/storefront-settings/deploy/ src/features/storefront-settings/StorefrontSettingsPage.tsx
git commit -m "feat(storefront): Deploy tab — Cloudflare connection, domain, releases, live history"
```

---

## Self-review

- **Spec coverage**: §3.1 Appearance (brand fields, logo/favicon upload/remove, scheme, eight colours via `ColorPicker`, fonts with preview, radius, density, custom CSS with counter + inline 422, "Open storefront" link) → Task 3. §3.2 Features (layout, seven switches, master switch, inline rules) → Task 4. §3.3 Integrations (write-only secrets with "set" + Clear) → Task 5. §3.4 Deploy (four cards, `needsAccount` picker, permissions checklist, test, disconnect confirm, zone select + hostname, release list with Current/Update badges + confirm, history with expandable live log, BotFather callout) → Task 6. §3.5 unchanged. Frontend-design pass → Task 1 Step 1 and Step 1 of Tasks 3–6.
- **Type consistency**: `storefrontDeployKeys.*` names match between Task 2 and Task 6; `AssetDropZoneMeta` fields match Task 1 ↔ Task 3; `StepLogLine` shape equals backend `DeployLogLine`; `StorefrontDeploy.status` values equal backend `DeployStatus`; `apiOriginUrl` (Task 2) is what Task 3 uses for `settings.branding.*Url`, which the backend plan's Task 2 adds to the admin `GET /storefront-settings` response.
- **Placeholders**: none. The pre-filled `permissionGroupKeys` token link from the spec is deliberately not used — the query format is undocumented; the card links to the API Tokens page and lists the permissions instead.
