# Puck Page Builder — Plan 1: Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `ecommerce-backend` durable storage and an HTTP API for storefront page-builder page sets: one autosaved draft per layout, atomic publish with the last 20 versions kept, restore, image uploads, and a public read of the latest published set.

**Architecture:** A new `storefront_page_sets` table (draft + published rows per layout) behind a new `src/modules/storefront-pages/` module. The module keeps the strict router/controller/service/schemas files, plus three helpers: `richtext.ts` (DOMPurify allowlist and the single link rule), `store.ts` (every Drizzle query, so the service can be unit-tested against an in-memory fake), and `media.ts` (S3 image upload and serving). Publish, restore and draft saves run in a transaction that holds a per-layout Postgres advisory lock. The public read is a small sub-router, mounted inside the existing `/public/storefront` router behind the storefront kill switch.

**Tech Stack:** Express 5, Drizzle ORM 0.45 on Postgres, Zod 4.3, `isomorphic-dompurify` 3.19 (already a dependency), multer 2, `@aws-sdk/client-s3` (via `src/lib/s3.ts`), Vitest 4.

**Spec:** `T:/Projects/ecommerce/.worktrees/puck-builder/ecommerce-storefront/docs/superpowers/specs/2026-09-29-puck-page-builder-design.md`: §4 (backend), §4.4 (tests), §11 (delivery), and §13 A2, A3, A4 and A5. Where §13 and §1–12 disagree, §13 wins.

## Global Constraints

- Work only in `T:/Projects/ecommerce/.worktrees/puck-builder/ecommerce-backend` (branch `feature/puck-builder`). Every path below is relative to that directory. Never merge or push.
- **Never touch a database.** `.env` holds a copy of production. Do not run `npm run dev`, `npm run db:push`, `npm run db:migrate`, `npm run seed`, any `scripts/*.ts`, or anything else that opens a Postgres connection. `npm run db:generate` is allowed because it only diffs snapshots offline. Migrations apply on the next deploy's startup.
- Backend conventions (`CLAUDE.md`): strict `router.ts` / `controller.ts` / `service.ts` / `schemas.ts` per module (extra helper files are fine, as in `storefront-settings/`). **Extensionless imports everywhere.** Throw `AppError` subclasses from `src/utils/errors.ts` and never hand-build error responses. All responses go through `sendSuccess`. Non-DB side effects (`emitEvent`) run only after the transaction commits.
- Test gate: `npm test` (Vitest). The baseline before this plan is **149 files / 1920 tests, all passing**. `npx tsc --noEmit` and `npm run build` skip `*.test.ts`, so only `npm test` catches broken test code. Run both.
- Tests follow the repo's existing patterns only: `vi.mock` of `../../db/client` or of a store seam (`storefront-deploy/service.test.ts`); an express app on port 0 hit with `fetch` (`bot-settings/commands.test.ts`); and `.toSQL()` pinning with no connection (`src/lib/store-credit.test.ts`). No new test harness, no supertest, no real Postgres.
- HTTP contract (spec §13 A5, fixed, because plans 2–4 depend on it). It lives under `/api/v1`, uses the `{ success, data, error }` envelope, and `:layout ∈ storefront | menu | webapp` (400 otherwise):
  - `GET /storefront-pages/:layout/draft` → `{ layout, source: 'draft'|'published'|'none', data: PageSet|null, baseVersion, latestPublishedVersion, updatedAt: string|null }`
  - `PUT /storefront-pages/:layout/draft` body `{ data: PageSet, baseVersion }` → `{ baseVersion, updatedAt }`
  - `DELETE /storefront-pages/:layout/draft` → `{ discarded: boolean }`
  - `POST /storefront-pages/:layout/publish` body `{ baseVersion }` → `{ version, publishedAt }`
  - `GET /storefront-pages/:layout/versions` → `Array<{ version, createdAt, createdBy: { id, name } | null }>`, newest first
  - `GET /storefront-pages/:layout/versions/:version` → `{ version, createdAt, data }`
  - `POST /storefront-pages/:layout/versions/:version/restore` → `{ version }` (the new version)
  - `POST /storefront-pages/media` multipart field `file` → `{ url }`
  - `GET /storefront-pages/media/:key` → raw image (public)
  - `GET /public/storefront/pages/:layout` → `{ version, data } | null`
- Errors: `409` with envelope `error === 'PAGESET_CONFLICT'` when `baseVersion < latestPublishedVersion` (PUT and publish). `400` for validation failures (a ZodError, rendered by `errorHandler` as `"path: message; …"`). `400` with `error === 'NO_DRAFT'` when publishing with no draft. The envelope has no `code` field in this codebase (see `STOREFRONT.md` §5.3), so **the `error` string is the code**.
- Admin routes use `authenticate, authorize('admin')`. `GET /storefront-pages/media/:key` and `GET /public/storefront/pages/:layout` have no auth. The public route is behind `requireStorefrontEnabled`.
- Socket event `storefront-pages:published` with payload `{ layout, version }`, emitted to `role:admin` (same room as `storefront-deploy:updated`).
- Validation limits (spec §4.3, verbatim):
  - component `type` matches `^[A-Z][A-Za-z0-9]{0,40}$`
  - `props.id` is a string ≤ 64
  - route keys come from the fixed list or match `page:[a-z0-9-]{1,60}`, with ≤ 50 custom pages per layout
  - slot nesting depth ≤ 12, ≤ 2 000 components per set, serialized size ≤ 512 KB
  - root `title` ≤ 120, `description` ≤ 300, `chrome ∈ shell|none`
  - every string prop ≤ 20 000 chars
- Fixed route keys (A4): `catalog product cart checkout login account.orders account.order account.loyalty account.referrals account.profile order-status payment-success payment-cancel order-placed verify tracking`.
- Richtext (A2): every string prop whose key ends in `Html`, at any depth, is sanitised with `isomorphic-dompurify`. Allowed tags: `p h2 h3 h4 strong em u s a ul ol li blockquote br code`. `a[href]` accepts only `https:`, `mailto:`, `tel:` and site-relative `/` paths. `rel="noopener noreferrer"` is forced on external links. No other attributes survive. The sanitised value is what gets stored.
- Link props (§4.3 + A3): any string prop whose key ends in `Url`/`url`/`href`/`src` must be `https:`, `mailto:`, `tel:`, a site-relative path starting with `/`, or `''`.
- Media (A3): png/jpeg/webp/gif, ≤ 5 MB. `<key>` matches `^[a-f0-9]{32}\.(png|jpg|webp|gif)$`. The S3 object is `storefront-pages/<key>`. Upload returns `{ url: '/media/storefront-pages/media/<key>' }`.
- Deploy order: **backend first**, then the storefront `v0.7.0`, then the admin SPA.

## Review Focus

These five inputs are implied by the spec but no requirement names them. Each is most likely to bite a real user. Each is pinned by a test in the owning task:

1. **Protocol-relative "site paths"**: `//evil.example` and `/\evil.example` start with `/` but browsers treat them as external hosts. Both must be rejected in link props and stripped from richtext `href`s. Tests are in Task 1 and Task 2.
2. **Pathologically deep props**: a 10 000-level nested object in a prop must produce a 400 with a nesting message, not a `RangeError` stack overflow and a 500. The walker caps JSON depth at 64 before recursing. Test is in Task 2.
3. **Real-size page sets vs the global 100 KB body limit**: a legitimate 300–512 KB set must reach validation instead of being rejected with a 413 by `express.json()`'s default limit. A scoped `1mb` parser must be mounted ahead of the global parser. Test is in Task 6 (`app.mounts.test.ts`).
4. **Two admins publishing at once**: both would read `latest = N` and insert `N+1`. The second then hits the unique index and returns a 500. Publish, restore and draft saves serialise on a per-layout advisory lock taken before `latest` is read. Tests are in Task 3 (lock SQL pinned) and Task 4 (lock precedes the read; sequential stale publish → 409).
5. **Bad uploads**: a text file sent as `image/png`, a 6 MB image, or a wrong field name must each return 422, never a 500 (multer's `MulterError` is not an `AppError`) and never store junk. Magic-byte sniffing is in Task 5. The multer error mapping is in Task 6.

---

## File map

| File | Responsibility |
|---|---|
| Create `src/modules/storefront-pages/richtext.ts` | `isAllowedLink()` (the one link rule) and `sanitizeRichtext()` (DOMPurify allowlist) |
| Create `src/modules/storefront-pages/schemas.ts` | Layout/route constants, `pageSetSchema` (structural walk + `*Html` sanitise + size cap), request param/body schemas |
| Create `src/db/schema/storefront-pages.ts` | `storefront_page_sets` table + stored types |
| Modify `src/db/schema/index.ts` | export the new table |
| Create `drizzle/0045_*.sql` (+ `drizzle/meta`) | generated migration |
| Create `src/modules/storefront-pages/store.ts` | every Drizzle query + advisory lock + transaction seam |
| Modify `src/utils/errors.ts` | add `BadRequestError` (400) |
| Create `src/modules/storefront-pages/service.ts` | draft / publish / versions / restore / public read logic, socket emit |
| Create `src/modules/storefront-pages/media.ts` | image sniffing, S3 upload, S3 read |
| Modify `src/middleware/upload.ts` | `uploadPageImage` (multer `file`, 5 MB, MulterError → 422) |
| Create `src/modules/storefront-pages/controller.ts` | thin handlers; parses params/bodies (ZodError → 400) |
| Create `src/modules/storefront-pages/router.ts` | `storefrontPagesRouter` (admin + public media) and `publicStorefrontPagesRouter` |
| Modify `src/app.ts` | scoped 1 MB JSON parser + mount |
| Modify `src/app.mounts.test.ts` | exempt the new body-parser mount; assert its order |
| Modify `src/modules/public-storefront/router.ts` | `use('/pages', publicStorefrontPagesRouter)` |
| Modify `src/config/modules.ts`, `src/lib/permissions.test.ts` | `storefront-pages` domain under the `storefront` module |
| Modify `src/docs/registry.ts`, `src/docs/generator.ts` | OpenAPI entries + tag |
| Modify `STOREFRONT.md`, `docs/websocket-guide.md`, `CLAUDE.md` | endpoint, event and domain docs |
| Tests (create) | `richtext.test.ts`, `schemas.test.ts`, `store.test.ts`, `service.test.ts`, `media.test.ts`, `router.test.ts`, all in `src/modules/storefront-pages/` |

---

### Task 1: Richtext sanitiser and link rule

**Files:**
- Create: `src/modules/storefront-pages/richtext.ts`
- Test: `src/modules/storefront-pages/richtext.test.ts`

**Interfaces:**
- Consumes: `isomorphic-dompurify` default export (same import as `src/lib/svg-sanitizer.ts`).
- Produces:
  - `RICHTEXT_ALLOWED_TAGS: readonly string[]`
  - `isAllowedLink(value: string): boolean`: `''`, `https:` with a host, `mailto:`, `tel:`, or `/path` that does not start with `//` or `/\`. No leading or trailing whitespace, no control characters.
  - `sanitizeRichtext(html: string): string`

- [ ] **Step 1: Write the failing test**

Create `src/modules/storefront-pages/richtext.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import DOMPurify from 'isomorphic-dompurify';
import { isAllowedLink, sanitizeRichtext } from './richtext';

describe('isAllowedLink', () => {
  it.each([
    '',
    'https://shop.example/a',
    'HTTPS://shop.example',
    'mailto:hello@shop.example',
    'tel:+441234567890',
    '/',
    '/pages/about',
    '/media/storefront-pages/media/0123456789abcdef0123456789abcdef.png',
  ])('accepts %j', (value) => {
    expect(isAllowedLink(value)).toBe(true);
  });

  it.each([
    'http://shop.example',
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<b>x</b>',
    'ftp://shop.example',
    '//evil.example',
    '/\\evil.example',
    ' https://shop.example',
    'https://shop.example\n',
    'https://',
    'pages/about',
    '#top',
  ])('rejects %j', (value) => {
    expect(isAllowedLink(value)).toBe(false);
  });
});

describe('sanitizeRichtext', () => {
  it('keeps every allowed tag untouched', () => {
    const html =
      '<h2>A</h2><h3>B</h3><h4>C</h4>' +
      '<p><strong>s</strong><em>e</em><u>u</u><s>x</s><code>c</code><br></p>' +
      '<ul><li>1</li></ul><ol><li>2</li></ol><blockquote>q</blockquote>';
    expect(sanitizeRichtext(html)).toBe(html);
  });

  it('unwraps disallowed tags but keeps their text', () => {
    expect(sanitizeRichtext('<h1>Title</h1><div>Body</div>')).toBe('TitleBody');
  });

  it('drops script and style elements together with their content', () => {
    expect(sanitizeRichtext('<p>ok</p><script>alert(1)</script><style>p{color:red}</style>')).toBe('<p>ok</p>');
  });

  it('drops images and event handlers', () => {
    expect(sanitizeRichtext('<img src="x" onerror="alert(1)"><p onclick="x()">t</p>')).toBe('<p>t</p>');
  });

  it('strips every attribute except href — including style, class, id, aria-* and data-*', () => {
    expect(
      sanitizeRichtext('<p style="color:red" class="c" id="i" aria-label="l" data-x="1">t</p>'),
    ).toBe('<p>t</p>');
  });

  it('forces rel="noopener noreferrer" on external links and drops target', () => {
    expect(sanitizeRichtext('<a href="https://shop.example/x" target="_blank">x</a>')).toBe(
      '<a href="https://shop.example/x" rel="noopener noreferrer">x</a>',
    );
  });

  it('keeps site-relative, mailto and tel links without adding rel', () => {
    expect(sanitizeRichtext('<a href="/pages/about" rel="nofollow">a</a>')).toBe('<a href="/pages/about">a</a>');
    expect(sanitizeRichtext('<a href="mailto:hi@shop.example">m</a>')).toBe('<a href="mailto:hi@shop.example">m</a>');
    expect(sanitizeRichtext('<a href="tel:+441234">t</a>')).toBe('<a href="tel:+441234">t</a>');
  });

  it.each([
    'javascript:alert(1)',
    '//evil.example',
    '/\\evil.example',
    'http://shop.example',
    'data:text/html,x',
  ])('removes a disallowed href %j but keeps the link text', (href) => {
    expect(sanitizeRichtext(`<a href="${href}">x</a>`)).toBe('<a>x</a>');
  });

  it('is idempotent', () => {
    const once = sanitizeRichtext('<p>Hi <a href="https://shop.example">there</a><img src=x></p><h1>T</h1>');
    expect(sanitizeRichtext(once)).toBe(once);
  });

  it('returns an empty string for empty input', () => {
    expect(sanitizeRichtext('')).toBe('');
  });

  it('leaves no DOMPurify hook installed afterwards', () => {
    sanitizeRichtext('<a href="https://shop.example">x</a>');
    expect(DOMPurify.sanitize('<a href="https://shop.example">x</a>')).not.toContain('rel=');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/modules/storefront-pages/richtext.test.ts`
Expected: FAIL. The run reports it cannot resolve `./richtext`.

- [ ] **Step 3: Write the implementation**

Create `src/modules/storefront-pages/richtext.ts`:

```ts
import DOMPurify from 'isomorphic-dompurify';

/**
 * Richtext allowlist for page-builder `*Html` props (spec §4.3 / §13 A2).
 * Mirrored by the storefront's `web/src/builder/sanitize.ts` — keep the two
 * lists identical.
 */
export const RICHTEXT_ALLOWED_TAGS = [
  'p', 'h2', 'h3', 'h4', 'strong', 'em', 'u', 's', 'a',
  'ul', 'ol', 'li', 'blockquote', 'br', 'code',
] as const;

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/**
 * The single link rule for page-builder data, shared by `*Url`/`*href`/`*src`
 * props and richtext `<a href>`: `''` (unset), `https:` with a host,
 * `mailto:`, `tel:`, or a site-relative path. `//host` and `/\host` start
 * with a slash but browsers resolve them to another origin, so they are
 * refused.
 */
export function isAllowedLink(value: string): boolean {
  if (value === '') return true;
  if (value !== value.trim() || CONTROL_CHARS.test(value)) return false;
  if (value.startsWith('/')) return !value.startsWith('//') && !value.startsWith('/\\');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return url.hostname !== '';
  return url.protocol === 'mailto:' || url.protocol === 'tel:';
}

function isExternalLink(value: string): boolean {
  return /^https:/i.test(value);
}

/**
 * Sanitise one richtext HTML string. Hooks are installed per call and
 * removed in `finally`, the same pattern `sanitizeSvg` uses: DOMPurify is a
 * shared singleton and `sanitize` is synchronous, so the hooks can never leak
 * into a concurrent call.
 */
export function sanitizeRichtext(html: string): string {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName !== 'A') return;
    const el = node as unknown as Element;
    const href = el.getAttribute('href');
    if (href === null) return;
    if (href === '' || !isAllowedLink(href)) {
      el.removeAttribute('href');
      return;
    }
    if (isExternalLink(href)) el.setAttribute('rel', 'noopener noreferrer');
  });
  try {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [...RICHTEXT_ALLOWED_TAGS],
      ALLOWED_ATTR: ['href'],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
    });
  } finally {
    DOMPurify.removeAllHooks();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/modules/storefront-pages/richtext.test.ts`
Expected: PASS, all tests green.

If a single exact-string expectation differs only in DOMPurify's serialisation, stop and report the actual output rather than loosening the assertion. Examples of such differences: attribute order `rel` before `href`, or `<br>` versus `<br/>`. The allowlist behaviour is what's under test.

- [ ] **Step 5: Commit**

```bash
git add src/modules/storefront-pages/richtext.ts src/modules/storefront-pages/richtext.test.ts
git commit -m "feat(storefront-pages): richtext allowlist sanitiser and link rule"
```

---

### Task 2: Page-set validation schemas

**Files:**
- Create: `src/modules/storefront-pages/schemas.ts`
- Test: `src/modules/storefront-pages/schemas.test.ts`

**Interfaces:**
- Consumes: `isAllowedLink`, `sanitizeRichtext` from `./richtext` (Task 1).
- Produces (later tasks import these names exactly):
  - `PAGE_LAYOUTS` (`readonly ['storefront','menu','webapp']`), `type PageLayout`
  - `FIXED_ROUTE_KEYS`, `COMPONENT_TYPE_RE`, `CUSTOM_PAGE_KEY_RE`, `HTML_PROP_RE`, `URL_PROP_RE`, `PAGESET_LIMITS`
  - `pageSetSchema`: parse = structural validation, then `*Html` sanitising, then the size cap. `type PageSet = z.output<typeof pageSetSchema>`
  - `layoutParamSchema` → `{ layout: PageLayout }`
  - `versionParamSchema` → `{ layout, version: number }` (coerced positive integer)
  - `saveDraftBodySchema` → `{ data: PageSet, baseVersion: number }`, `type SaveDraftInput`
  - `publishBodySchema` → `{ baseVersion: number }`, `type PublishInput`
- Data contract other plans must respect (the backend does not know which props are slots):
  - An **array element that is a plain object with a string `type` and an object `props` is treated as a component** and must satisfy the component rules.
  - Non-slot array items must therefore never carry both a `type` and a `props` key.
  - Values of `*Html` keys must be strings.

- [ ] **Step 1: Write the failing test**

Create `src/modules/storefront-pages/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  layoutParamSchema,
  pageSetSchema,
  publishBodySchema,
  saveDraftBodySchema,
  versionParamSchema,
} from './schemas';

let seq = 0;
const comp = (type: string, props: Record<string, unknown> = {}) => ({
  type,
  props: { id: `${type}-${++seq}`, ...props },
});
const doc = (content: unknown[] = [], root: Record<string, unknown> = {}) => ({
  root: { props: { title: '', description: '', chrome: 'shell', ...root } },
  content,
});
const bareShell = () => doc([comp('PageOutlet')]);
const set = (pages: Record<string, unknown> = {}, shell: unknown = bareShell()) => ({
  schemaVersion: 1,
  shell,
  pages,
});
const catalogWith = (...content: unknown[]) => set({ catalog: doc(content) });

/** A chain of `levels` components, each nested in the previous one's `children` slot. */
function nest(levels: number) {
  let inner: ReturnType<typeof comp> = comp('Section');
  for (let i = 1; i < levels; i++) inner = comp('Section', { children: [inner] });
  return inner;
}

function problems(input: unknown): string[] {
  const r = pageSetSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

type Loose = { pages: Record<string, { root: { props: Record<string, unknown> }; content: Array<{ props: Record<string, unknown> }> }> };

describe('pageSetSchema — accepts', () => {
  it('a minimal set with a shell and no pages', () => {
    expect(problems(set())).toEqual([]);
  });

  it('every fixed route key', () => {
    const keys = ['catalog', 'product', 'cart', 'checkout', 'login', 'account.orders', 'account.order',
      'account.loyalty', 'account.referrals', 'account.profile', 'order-status', 'payment-success',
      'payment-cancel', 'order-placed', 'verify', 'tracking'];
    expect(problems(set(Object.fromEntries(keys.map((k) => [k, doc()]))))).toEqual([]);
  });

  it('a custom page key at the 60-char slug limit', () => {
    expect(problems(set({ [`page:${'a'.repeat(60)}`]: doc(), 'page:about-us-2': doc() }))).toEqual([]);
  });

  it('exactly 50 custom pages', () => {
    const pages = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`page:p${i}`, doc()]));
    expect(problems(set(pages))).toEqual([]);
  });

  it('a 41-char component type and a 64-char id', () => {
    expect(problems(catalogWith({ type: `A${'a'.repeat(40)}`, props: { id: 'i'.repeat(64) } }))).toEqual([]);
  });

  it('slot nesting 12 levels deep', () => {
    expect(problems(catalogWith(nest(12)))).toEqual([]);
  });

  it('exactly 2000 components across the whole set (shell included)', () => {
    const content = Array.from({ length: 1999 }, () => comp('Spacer'));
    expect(problems(catalogWith(...content))).toEqual([]);
  });

  it('a 20 000-char string prop', () => {
    expect(problems(catalogWith(comp('Heading', { text: 'x'.repeat(20_000) })))).toEqual([]);
  });

  it('every allowed link form, including the page-media path', () => {
    expect(problems(catalogWith(comp('Image', {
      imageSrc: '/media/storefront-pages/media/0123456789abcdef0123456789abcdef.png',
      linkHref: 'https://shop.example/x',
      ctaUrl: '',
      mailUrl: 'mailto:hello@shop.example',
      phoneUrl: 'tel:+441234',
      pageUrl: '/pages/about',
    })))).toEqual([]);
  });

  it('empty zones and a page with chrome none', () => {
    expect(problems(set({ 'order-status': { ...doc([], { chrome: 'none' }), zones: {} } }))).toEqual([]);
  });

  it('fills missing root props with their defaults', () => {
    const out = pageSetSchema.parse(set({ catalog: { root: {}, content: [] } })) as unknown as Loose;
    expect(out.pages.catalog.root.props).toEqual({ title: '', description: '', chrome: 'shell' });
  });
});

describe('pageSetSchema — rejects', () => {
  it('a schemaVersion other than 1', () => {
    expect(problems({ ...set(), schemaVersion: 2 })).not.toEqual([]);
  });

  it.each(['heading', 'Heading-1', '1Heading', `A${'a'.repeat(41)}`, ''])('component type %j', (type) => {
    expect(problems(catalogWith({ type, props: { id: 'x' } })).join('\n')).toMatch(/Invalid component type/);
  });

  it.each([
    ['missing', {}],
    ['empty', { id: '' }],
    ['65 chars', { id: 'i'.repeat(65) }],
    ['a number', { id: 7 }],
  ])('a props.id that is %s', (_label, props) => {
    expect(problems(catalogWith({ type: 'Heading', props })).join('\n')).toMatch(/props\.id must be/);
  });

  it('a content entry that is not a component', () => {
    expect(problems(catalogWith('just text')).join('\n')).toMatch(/Expected a component/);
  });

  it.each(['about', 'page:', 'page:About', 'page:a_b', `page:${'a'.repeat(61)}`, 'shell'])('route key %j', (key) => {
    expect(problems(set({ [key]: doc() })).join('\n')).toMatch(/Unknown route key/);
  });

  it('51 custom pages', () => {
    const pages = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`page:p${i}`, doc()]));
    expect(problems(set(pages)).join('\n')).toMatch(/at most 50 custom pages/);
  });

  it('slot nesting 13 levels deep', () => {
    expect(problems(catalogWith(nest(13))).join('\n')).toMatch(/nested at most 12 levels/);
  });

  it('2001 components across the whole set', () => {
    const content = Array.from({ length: 2000 }, () => comp('Spacer'));
    expect(problems(catalogWith(...content)).join('\n')).toMatch(/at most 2000 components/);
  });

  it('a set whose serialized size exceeds 512 KB', () => {
    const content = Array.from({ length: 30 }, () => comp('Heading', { text: 'x'.repeat(19_000) }));
    expect(problems(catalogWith(...content)).join('\n')).toMatch(/at most 512 KB/);
  });

  it('a 20 001-char string prop, including one nested in an array', () => {
    expect(problems(catalogWith(comp('Heading', { text: 'x'.repeat(20_001) }))).join('\n')).toMatch(/limited to 20000/);
    expect(problems(catalogWith(comp('FAQ', { items: [{ question: 'x'.repeat(20_001) }] }))).join('\n')).toMatch(/limited to 20000/);
  });

  it('root props over their limits', () => {
    expect(problems(set({ catalog: doc([], { title: 'x'.repeat(121) }) }))).not.toEqual([]);
    expect(problems(set({ catalog: doc([], { description: 'x'.repeat(301) }) }))).not.toEqual([]);
    expect(problems(set({ catalog: doc([], { chrome: 'full' }) }))).not.toEqual([]);
  });

  it('a shell whose chrome is not shell', () => {
    expect(problems(set({}, doc([comp('PageOutlet')], { chrome: 'none' }))).join('\n')).toMatch(/shell's chrome/);
  });

  it.each([
    ['href', 'http://shop.example'],
    ['imageSrc', 'javascript:alert(1)'],
    ['ctaUrl', 'data:text/html,x'],
    ['linkHref', '//evil.example'],
    ['linkHref', '/\\evil.example'],
    ['imageURL', 'ftp://shop.example'],
  ])('link prop %s = %j', (key, value) => {
    expect(problems(catalogWith(comp('Button', { [key]: value }))).join('\n')).toMatch(/Links must be/);
  });

  it('a bad link nested inside an array of plain items', () => {
    expect(problems(catalogWith(comp('NavLinks', { links: [{ label: 'x', url: '//evil.example' }] }))).join('\n'))
      .toMatch(/Links must be/);
  });

  it('a non-string *Html value', () => {
    expect(problems(catalogWith(comp('RichText', { bodyHtml: { __richtext: true, html: '<p>x</p>' } }))).join('\n'))
      .toMatch(/must be an HTML string/);
  });

  it('a bad component inside zones', () => {
    expect(problems(set({ catalog: { ...doc(), zones: { 'a:b': [{ type: 'lower', props: { id: 'z' } }] } } })).join('\n'))
      .toMatch(/Invalid component type/);
  });

  it('props nested deeper than 64 levels, with a 400-style issue', () => {
    let v: unknown = 'leaf';
    for (let i = 0; i < 70; i++) v = { n: v };
    expect(problems(catalogWith(comp('Heading', { deep: v }))).join('\n')).toMatch(/at most 64 levels/);
  });

  it('a 10 000-level nested prop without throwing (no stack overflow)', () => {
    let v: unknown = 'leaf';
    for (let i = 0; i < 10_000; i++) v = { n: v };
    const input = catalogWith(comp('Heading', { deep: v }));
    expect(() => pageSetSchema.safeParse(input)).not.toThrow();
    expect(pageSetSchema.safeParse(input).success).toBe(false);
  });
});

describe('pageSetSchema — richtext sanitising', () => {
  it('sanitises *Html props at the top level and nested in arrays/objects', () => {
    const out = pageSetSchema.parse(catalogWith(
      comp('RichText', { bodyHtml: '<p onclick="x()">a</p><script>alert(1)</script>' }),
      comp('FAQ', { items: [{ question: 'Q', answerHtml: '<a href="https://shop.example" target="_blank">l</a>' }] }),
    )) as unknown as Loose;
    const [rich, faq] = out.pages.catalog.content;
    expect(rich.props.bodyHtml).toBe('<p>a</p>');
    expect((faq.props.items as Array<Record<string, string>>)[0].answerHtml)
      .toBe('<a href="https://shop.example" rel="noopener noreferrer">l</a>');
  });

  it('stores non-Html strings verbatim', () => {
    const out = pageSetSchema.parse(catalogWith(comp('Heading', { text: '<b>x</b>' }))) as unknown as Loose;
    expect(out.pages.catalog.content[0].props.text).toBe('<b>x</b>');
  });
});

describe('request schemas', () => {
  it('layoutParamSchema accepts the three layouts only', () => {
    for (const layout of ['storefront', 'menu', 'webapp']) expect(layoutParamSchema.parse({ layout })).toEqual({ layout });
    expect(layoutParamSchema.safeParse({ layout: 'desktop' }).success).toBe(false);
  });

  it('versionParamSchema coerces a positive integer', () => {
    expect(versionParamSchema.parse({ layout: 'menu', version: '3' })).toEqual({ layout: 'menu', version: 3 });
    for (const version of ['0', '-1', '1.5', 'x']) {
      expect(versionParamSchema.safeParse({ layout: 'menu', version }).success).toBe(false);
    }
  });

  it('saveDraftBodySchema needs data and a non-negative integer baseVersion', () => {
    expect(saveDraftBodySchema.safeParse({ data: set(), baseVersion: 0 }).success).toBe(true);
    expect(saveDraftBodySchema.safeParse({ data: set(), baseVersion: -1 }).success).toBe(false);
    expect(saveDraftBodySchema.safeParse({ data: set(), baseVersion: '1' }).success).toBe(false);
    expect(saveDraftBodySchema.safeParse({ baseVersion: 0 }).success).toBe(false);
  });

  it('publishBodySchema needs a non-negative integer baseVersion', () => {
    expect(publishBodySchema.parse({ baseVersion: 4 })).toEqual({ baseVersion: 4 });
    expect(publishBodySchema.safeParse({}).success).toBe(false);
    expect(publishBodySchema.safeParse({ baseVersion: 1.5 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/modules/storefront-pages/schemas.test.ts`
Expected: FAIL. The run reports it cannot resolve `./schemas`.

- [ ] **Step 3: Write the implementation**

Create `src/modules/storefront-pages/schemas.ts`:

```ts
import { z } from 'zod';
import { isAllowedLink, sanitizeRichtext } from './richtext';

// ---------------------------------------------------------------------------
// Constants — mirror the storefront's web/src/builder/types.ts (spec §13 A4).
// The backend validates STRUCTURE only; it never knows which blocks exist.
// ---------------------------------------------------------------------------

export const PAGE_LAYOUTS = ['storefront', 'menu', 'webapp'] as const;
export type PageLayout = (typeof PAGE_LAYOUTS)[number];

export const FIXED_ROUTE_KEYS = [
  'catalog', 'product', 'cart', 'checkout', 'login',
  'account.orders', 'account.order', 'account.loyalty', 'account.referrals', 'account.profile',
  'order-status', 'payment-success', 'payment-cancel', 'order-placed', 'verify', 'tracking',
] as const;
const FIXED_ROUTE_KEY_SET: ReadonlySet<string> = new Set(FIXED_ROUTE_KEYS);

export const COMPONENT_TYPE_RE = /^[A-Z][A-Za-z0-9]{0,40}$/;
export const CUSTOM_PAGE_KEY_RE = /^page:[a-z0-9-]{1,60}$/;
/** Richtext props (spec §13 A2): sanitised on write, must be strings. */
export const HTML_PROP_RE = /Html$/;
/** Link props (spec §4.3 + A3): must pass `isAllowedLink`. */
export const URL_PROP_RE = /(?:[Uu]rl|URL|[Hh]ref|[Ss]rc)$/;

export const PAGESET_LIMITS = {
  componentId: 64,
  customPages: 50,
  slotDepth: 12,
  components: 2000,
  bytes: 512 * 1024,
  stringProp: 20_000,
  /** Object/array nesting inside one component's props. Not in the spec: it
   *  exists so a hostile body is a 400, not a stack overflow. */
  jsonDepth: 64,
  rootTitle: 120,
  rootDescription: 300,
} as const;

const MAX_REPORTED_ISSUES = 20;

// ---------------------------------------------------------------------------
// Structural walk. Slots are not declared to the backend: any array element
// that is a plain object with a string `type` and an object `props` IS a
// component and must obey the component rules.
// ---------------------------------------------------------------------------

type Path = (string | number)[];

interface WalkState {
  issues: { path: Path; message: string }[];
  components: number;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isComponentLike(v: unknown): v is { type: string; props: Record<string, unknown> } & Record<string, unknown> {
  return isPlainObject(v) && typeof v.type === 'string' && isPlainObject(v.props);
}

function report(w: WalkState, path: Path, message: string) {
  if (w.issues.length < MAX_REPORTED_ISSUES) w.issues.push({ path, message });
}

function walkValue(value: unknown, key: string, path: Path, compDepth: number, jsonDepth: number, w: WalkState): void {
  if (jsonDepth > PAGESET_LIMITS.jsonDepth) {
    report(w, path, `Props may be nested at most ${PAGESET_LIMITS.jsonDepth} levels deep`);
    return;
  }
  if (HTML_PROP_RE.test(key) && typeof value !== 'string') {
    report(w, path, 'Rich text must be an HTML string');
    return;
  }
  if (typeof value === 'string') {
    if (value.length > PAGESET_LIMITS.stringProp) {
      report(w, path, `Text is limited to ${PAGESET_LIMITS.stringProp} characters`);
    }
    if (URL_PROP_RE.test(key) && !isAllowedLink(value)) {
      report(w, path, 'Links must be https:, mailto:, tel: or a site path starting with /');
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((el, i) => {
      if (isComponentLike(el)) walkComponent(el, [...path, i], compDepth + 1, w);
      else walkValue(el, key, [...path, i], compDepth, jsonDepth + 1, w);
    });
    return;
  }
  if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) walkValue(v, k, [...path, k], compDepth, jsonDepth + 1, w);
  }
}

function walkComponent(item: unknown, path: Path, depth: number, w: WalkState): void {
  if (!isComponentLike(item)) {
    report(w, path, 'Expected a component { type, props }');
    return;
  }
  w.components += 1;
  if (w.components === PAGESET_LIMITS.components + 1) {
    report(w, path, `A page set may contain at most ${PAGESET_LIMITS.components} components`);
  }
  if (depth > PAGESET_LIMITS.slotDepth) {
    report(w, path, `Components may be nested at most ${PAGESET_LIMITS.slotDepth} levels deep`);
    return;
  }
  if (!COMPONENT_TYPE_RE.test(item.type)) report(w, [...path, 'type'], 'Invalid component type');
  const id = item.props.id;
  if (typeof id !== 'string' || id.length < 1 || id.length > PAGESET_LIMITS.componentId) {
    report(w, [...path, 'props', 'id'], `props.id must be a string of 1-${PAGESET_LIMITS.componentId} characters`);
  }
  for (const [k, v] of Object.entries(item.props)) walkValue(v, k, [...path, 'props', k], depth, 1, w);
  for (const [k, v] of Object.entries(item)) {
    if (k !== 'type' && k !== 'props') walkValue(v, k, [...path, k], depth, 1, w);
  }
}

function walkComponentList(list: unknown, path: Path, w: WalkState): void {
  if (!Array.isArray(list)) return; // zod already reported the shape
  list.forEach((item, i) => walkComponent(item, [...path, i], 1, w));
}

const ROOT_PROP_KEYS = new Set(['title', 'description', 'chrome']);

function walkDoc(doc: unknown, path: Path, w: WalkState): void {
  if (!isPlainObject(doc)) return;
  walkComponentList(doc.content, [...path, 'content'], w);
  if (isPlainObject(doc.zones)) {
    for (const [zone, list] of Object.entries(doc.zones)) walkComponentList(list, [...path, 'zones', zone], w);
  }
  const rootProps = isPlainObject(doc.root) && isPlainObject(doc.root.props) ? doc.root.props : null;
  if (rootProps) {
    for (const [k, v] of Object.entries(rootProps)) {
      if (!ROOT_PROP_KEYS.has(k)) walkValue(v, k, [...path, 'root', 'props', k], 0, 1, w);
    }
  }
}

function checkStructure(set: { shell: unknown; pages: Record<string, unknown> }, ctx: z.RefinementCtx): void {
  const w: WalkState = { issues: [], components: 0 };

  walkDoc(set.shell, ['shell'], w);
  const shellRoot = isPlainObject(set.shell) && isPlainObject(set.shell.root) && isPlainObject(set.shell.root.props)
    ? set.shell.root.props
    : null;
  if (shellRoot && shellRoot.chrome !== 'shell') {
    report(w, ['shell', 'root', 'props', 'chrome'], "The shell's chrome must be 'shell'");
  }

  let customPages = 0;
  for (const [key, doc] of Object.entries(set.pages)) {
    if (CUSTOM_PAGE_KEY_RE.test(key)) customPages += 1;
    else if (!FIXED_ROUTE_KEY_SET.has(key)) report(w, ['pages', key], 'Unknown route key');
    walkDoc(doc, ['pages', key], w);
  }
  if (customPages > PAGESET_LIMITS.customPages) {
    report(w, ['pages'], `A layout may have at most ${PAGESET_LIMITS.customPages} custom pages`);
  }

  for (const issue of w.issues) ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
}

/** Rebuilds the value with every `*Html` string sanitised. Runs only after
 *  `checkStructure` passed, so depth is already bounded. */
function sanitizeHtmlProps(value: unknown, key: string): unknown {
  if (typeof value === 'string') return HTML_PROP_RE.test(key) ? sanitizeRichtext(value) : value;
  if (Array.isArray(value)) return value.map((v) => sanitizeHtmlProps(v, key));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeHtmlProps(v, k)]));
  }
  return value;
}

function checkSize(set: unknown, ctx: z.RefinementCtx): void {
  if (Buffer.byteLength(JSON.stringify(set), 'utf8') > PAGESET_LIMITS.bytes) {
    ctx.addIssue({ code: 'custom', message: 'A page set may be at most 512 KB', path: [] });
  }
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const rootPropsSchema = z.looseObject({
  title: z.string().max(PAGESET_LIMITS.rootTitle).default(''),
  description: z.string().max(PAGESET_LIMITS.rootDescription).default(''),
  chrome: z.enum(['shell', 'none']).default('shell'),
});

const puckDocSchema = z.object({
  root: z.looseObject({ props: rootPropsSchema.prefault({}) }),
  content: z.array(z.unknown()),
  zones: z.record(z.string(), z.array(z.unknown())).optional(),
});

/** A `PageSet` (spec §13 A4): structural checks → `*Html` sanitised → size cap.
 *  The parsed output is exactly what gets stored. */
export const pageSetSchema = z
  .object({
    schemaVersion: z.literal(1),
    shell: puckDocSchema,
    pages: z.record(z.string(), puckDocSchema),
  })
  .superRefine(checkStructure)
  .transform((set) => sanitizeHtmlProps(set, '') as typeof set)
  .superRefine(checkSize);

export type PageSet = z.output<typeof pageSetSchema>;

// ---------------------------------------------------------------------------
// Request schemas. The controller calls .parse() on these (not validate()):
// the HTTP contract fixes validation failures at 400, which is what
// errorHandler returns for a ZodError.
// ---------------------------------------------------------------------------

const layoutSchema = z.enum(PAGE_LAYOUTS);

export const layoutParamSchema = z.object({ layout: layoutSchema });

export const versionParamSchema = z.object({
  layout: layoutSchema,
  version: z.coerce.number().int().positive(),
});

export const saveDraftBodySchema = z.object({
  data: pageSetSchema,
  baseVersion: z.number().int().min(0),
});
export type SaveDraftInput = z.output<typeof saveDraftBodySchema>;

export const publishBodySchema = z.object({
  baseVersion: z.number().int().min(0),
});
export type PublishInput = z.output<typeof publishBodySchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/modules/storefront-pages/schemas.test.ts`
Expected: PASS.

If the 13-level or 2001-component case reports an extra issue next to the expected one, that's fine: the assertions use `toMatch` on the joined list.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/modules/storefront-pages/schemas.ts src/modules/storefront-pages/schemas.test.ts
git commit -m "feat(storefront-pages): structural page-set validation with richtext sanitising"
```

---

### Task 3: Table, migration and store

**Files:**
- Create: `src/db/schema/storefront-pages.ts`
- Modify: `src/db/schema/index.ts` (add an export line after `export * from './storefront-deploys';`)
- Create (generated): `drizzle/0045_<generated_name>.sql`, `drizzle/meta/0045_snapshot.json`, and an entry in `drizzle/meta/_journal.json`
- Create: `src/modules/storefront-pages/store.ts`
- Test: `src/modules/storefront-pages/store.test.ts`

**Interfaces:**
- Consumes: `db`, `Executor` from `src/db/client`; `users` from `src/db/schema/users`.
- Produces:
  - `storefrontPageSets` table, `StorefrontPageSetRow`, `StoredPageSet`, `StoredPuckDoc`, `StorefrontPageLayout`
  - store functions:

```ts
export type PageSetRow = StorefrontPageSetRow; // { id, layout, kind, version, data: StoredPageSet, createdBy: number|null, createdAt: Date, updatedAt: Date }
export interface VersionListRow { version: number; createdAt: Date; createdById: number | null; createdByName: string | null }
export interface PageSetWrite { layout: StorefrontPageLayout; version: number; data: StoredPageSet; createdBy: number | null }
export function inTransaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
export function layoutLockSql(layout: StorefrontPageLayout): SQL;
export function lockLayout(tx: Executor, layout: StorefrontPageLayout): Promise<void>;
export function findDraft(layout, ex?: Executor): Promise<PageSetRow | null>;
export function findLatestPublished(layout, ex?: Executor): Promise<PageSetRow | null>;
export function findPublished(layout, version: number, ex?: Executor): Promise<PageSetRow | null>;
export function listPublished(layout, ex?: Executor): Promise<VersionListRow[]>;
export function upsertDraft(tx: Executor, input: PageSetWrite): Promise<PageSetRow>;
export function deleteDraft(layout, ex?: Executor): Promise<boolean>;
export function insertPublished(tx: Executor, input: PageSetWrite): Promise<PageSetRow>;
export function setDraftVersion(tx: Executor, layout, version: number): Promise<void>;
export function prunePublishedBelow(tx: Executor, layout, belowVersion: number): Promise<void>;
// query builders exported for SQL pinning:
export function latestPublishedQuery(layout, ex?: Executor);
export function listPublishedQuery(layout, ex?: Executor);
export function pruneQuery(layout, belowVersion: number, ex?: Executor);
```

- [ ] **Step 1: Write the table**

Create `src/db/schema/storefront-pages.ts`:

```ts
import { pgTable, integer, text, jsonb, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamps } from './_helpers';
import { users } from './users';

export type StorefrontPageLayout = 'storefront' | 'menu' | 'webapp';
export type StorefrontPageSetKind = 'draft' | 'published';

/** Stored shape of a page-builder document. Validated on every write by
 *  modules/storefront-pages/schemas (pageSetSchema); the storefront owns
 *  which block types exist. */
export interface StoredPuckDoc {
  root: { props: Record<string, unknown> };
  content: unknown[];
  zones?: Record<string, unknown[]>;
}
export interface StoredPageSet {
  schemaVersion: 1;
  shell: StoredPuckDoc;
  pages: Record<string, StoredPuckDoc>;
}

/**
 * Page-builder page sets (spec 2026-09-29 §4.1). Per layout: at most one
 * `draft` row (autosaved by the admin editor, `version` = the published
 * version it is based on, 0 if none) and the newest 20 `published` rows
 * (`version` 1, 2, 3… per layout; history is never rewritten).
 */
export const storefrontPageSets = pgTable('storefront_page_sets', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  layout: text('layout').$type<StorefrontPageLayout>().notNull(),
  kind: text('kind').$type<StorefrontPageSetKind>().notNull(),
  version: integer('version').notNull(),
  data: jsonb('data').$type<StoredPageSet>().notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
}, (table) => [
  uniqueIndex('storefront_page_sets_draft_uq').on(table.layout).where(sql`kind = 'draft'`),
  uniqueIndex('storefront_page_sets_published_uq').on(table.layout, table.version).where(sql`kind = 'published'`),
  check('storefront_page_sets_layout_check', sql`${table.layout} in ('storefront', 'menu', 'webapp')`),
  check('storefront_page_sets_kind_check', sql`${table.kind} in ('draft', 'published')`),
  check('storefront_page_sets_version_check', sql`${table.version} >= 0`),
]);

export type StorefrontPageSetRow = typeof storefrontPageSets.$inferSelect;
```

In `src/db/schema/index.ts`, add this line directly after `export * from './storefront-deploys';`:

```ts
export * from './storefront-pages';
```

- [ ] **Step 2: Generate the migration (offline, no DB connection)**

Run: `npm run db:generate`
Expected: drizzle-kit reports one new migration `drizzle/0045_<random_name>.sql`. Open it. It must contain only these statements, separated by `--> statement-breakpoint`:
- `CREATE TABLE "storefront_page_sets"`, with the `id` identity, `layout`, `kind`, `version`, `data jsonb`, `created_by`, `created_at` and `updated_at`, plus the three `CHECK` constraints
- the `ALTER TABLE … ADD CONSTRAINT "storefront_page_sets_created_by_users_id_fk" … ON DELETE set null`
- `CREATE UNIQUE INDEX "storefront_page_sets_draft_uq" … WHERE kind = 'draft'`
- `CREATE UNIQUE INDEX "storefront_page_sets_published_uq" … WHERE kind = 'published'`

If the file contains **any** statement touching another table, the snapshot drifted. Stop and report; do not hand-edit it. Do **not** run `db:migrate` or `db:push`: migrations apply on the next deploy's startup.

- [ ] **Step 3: Write the failing store test**

Create `src/modules/storefront-pages/store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { latestPublishedQuery, layoutLockSql, listPublishedQuery, pruneQuery } from './store';

// toSQL() needs no database connection, so these are plain unit tests that
// pin the SQL the service relies on (see src/lib/store-credit.test.ts).

describe('storefront-pages store SQL', () => {
  it('takes a per-layout transaction-scoped advisory lock', () => {
    const q = new PgDialect().sqlToQuery(layoutLockSql('menu'));
    expect(q.sql).toBe('select pg_advisory_xact_lock(hashtext($1))');
    expect(q.params).toEqual(['storefront_pages:menu']);
  });

  it('reads the latest published row of one layout', () => {
    const q = latestPublishedQuery('menu').toSQL();
    expect(q.sql).toContain('"storefront_page_sets"."layout" = $1');
    expect(q.sql).toContain('"storefront_page_sets"."kind" = $2');
    expect(q.sql).toContain('order by "storefront_page_sets"."version" desc');
    expect(q.sql).toMatch(/limit \$3|limit 1/);
    expect(q.params.slice(0, 2)).toEqual(['menu', 'published']);
  });

  it('lists published versions newest first with the author joined (left join, so deleted users survive)', () => {
    const q = listPublishedQuery('webapp').toSQL();
    expect(q.sql).toContain('left join "users" on "users"."id" = "storefront_page_sets"."created_by"');
    expect(q.sql).toContain('order by "storefront_page_sets"."version" desc');
    expect(q.params).toEqual(['webapp', 'published']);
  });

  it('prunes only PUBLISHED rows of ONE layout below a version — never the draft', () => {
    const q = pruneQuery('storefront', 6).toSQL();
    expect(q.sql).toMatch(/^delete from "storefront_page_sets" where/);
    expect(q.sql).toContain('"storefront_page_sets"."layout" = $1');
    expect(q.sql).toContain('"storefront_page_sets"."kind" = $2');
    expect(q.sql).toContain('"storefront_page_sets"."version" < $3');
    expect(q.params).toEqual(['storefront', 'published', 6]);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/modules/storefront-pages/store.test.ts`
Expected: FAIL. The run reports it cannot resolve `./store`.

- [ ] **Step 5: Write the store**

Create `src/modules/storefront-pages/store.ts`:

```ts
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { db, type Executor } from '../../db/client';
import {
  storefrontPageSets as t,
  type StorefrontPageLayout,
  type StorefrontPageSetRow,
  type StoredPageSet,
} from '../../db/schema/storefront-pages';
import { users } from '../../db/schema/users';

// Every query of the storefront-pages module lives here so service.ts can be
// unit-tested against an in-memory fake (the deploy-job-store.ts seam
// pattern). Nothing in this file decides anything.

export type PageSetRow = StorefrontPageSetRow;

export interface VersionListRow {
  version: number;
  createdAt: Date;
  createdById: number | null;
  createdByName: string | null;
}

export interface PageSetWrite {
  layout: StorefrontPageLayout;
  version: number;
  data: StoredPageSet;
  createdBy: number | null;
}

export function inTransaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
  return db.transaction((tx) => fn(tx));
}

/** Serialises every write to one layout's page sets for the rest of the
 *  transaction (publish/restore/draft save), so two admins publishing at once
 *  get N+1 and a 409, never a unique-index 500. */
export function layoutLockSql(layout: StorefrontPageLayout) {
  return sql`select pg_advisory_xact_lock(hashtext(${`storefront_pages:${layout}`}))`;
}

export async function lockLayout(tx: Executor, layout: StorefrontPageLayout): Promise<void> {
  await tx.execute(layoutLockSql(layout));
}

export async function findDraft(layout: StorefrontPageLayout, ex: Executor = db): Promise<PageSetRow | null> {
  const rows = await ex.select().from(t)
    .where(and(eq(t.layout, layout), eq(t.kind, 'draft')))
    .limit(1);
  return rows[0] ?? null;
}

export function latestPublishedQuery(layout: StorefrontPageLayout, ex: Executor = db) {
  return ex.select().from(t)
    .where(and(eq(t.layout, layout), eq(t.kind, 'published')))
    .orderBy(desc(t.version))
    .limit(1);
}

export async function findLatestPublished(layout: StorefrontPageLayout, ex: Executor = db): Promise<PageSetRow | null> {
  return (await latestPublishedQuery(layout, ex))[0] ?? null;
}

export async function findPublished(layout: StorefrontPageLayout, version: number, ex: Executor = db): Promise<PageSetRow | null> {
  const rows = await ex.select().from(t)
    .where(and(eq(t.layout, layout), eq(t.kind, 'published'), eq(t.version, version)))
    .limit(1);
  return rows[0] ?? null;
}

export function listPublishedQuery(layout: StorefrontPageLayout, ex: Executor = db) {
  return ex
    .select({
      version: t.version,
      createdAt: t.createdAt,
      createdById: users.id,
      createdByName: users.name,
    })
    .from(t)
    .leftJoin(users, eq(users.id, t.createdBy))
    .where(and(eq(t.layout, layout), eq(t.kind, 'published')))
    .orderBy(desc(t.version));
}

export async function listPublished(layout: StorefrontPageLayout, ex: Executor = db): Promise<VersionListRow[]> {
  return listPublishedQuery(layout, ex);
}

/** Caller must hold the layout lock (so select-then-write cannot race). */
export async function upsertDraft(tx: Executor, input: PageSetWrite): Promise<PageSetRow> {
  const existing = await findDraft(input.layout, tx);
  if (existing) {
    const [row] = await tx.update(t)
      .set({ version: input.version, data: input.data, createdBy: input.createdBy })
      .where(eq(t.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await tx.insert(t).values({ ...input, kind: 'draft' }).returning();
  return row;
}

export async function deleteDraft(layout: StorefrontPageLayout, ex: Executor = db): Promise<boolean> {
  const rows = await ex.delete(t)
    .where(and(eq(t.layout, layout), eq(t.kind, 'draft')))
    .returning({ id: t.id });
  return rows.length > 0;
}

export async function insertPublished(tx: Executor, input: PageSetWrite): Promise<PageSetRow> {
  const [row] = await tx.insert(t).values({ ...input, kind: 'published' }).returning();
  return row;
}

export async function setDraftVersion(tx: Executor, layout: StorefrontPageLayout, version: number): Promise<void> {
  await tx.update(t).set({ version }).where(and(eq(t.layout, layout), eq(t.kind, 'draft')));
}

export function pruneQuery(layout: StorefrontPageLayout, belowVersion: number, ex: Executor = db) {
  return ex.delete(t)
    .where(and(eq(t.layout, layout), eq(t.kind, 'published'), lt(t.version, belowVersion)));
}

export async function prunePublishedBelow(tx: Executor, layout: StorefrontPageLayout, belowVersion: number): Promise<void> {
  await pruneQuery(layout, belowVersion, tx);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/modules/storefront-pages/store.test.ts`
Expected: PASS.

The test imports the real `db`. `pg.Pool` does not connect until a query runs, and `toSQL()` never runs one. Confirm the run printed no connection error.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema/storefront-pages.ts src/db/schema/index.ts drizzle/ src/modules/storefront-pages/store.ts src/modules/storefront-pages/store.test.ts
git commit -m "feat(storefront-pages): storefront_page_sets table (migration 0045) and store"
```

---

### Task 4: Service — drafts, publish, versions, restore, public read

**Files:**
- Modify: `src/utils/errors.ts` (append `BadRequestError`)
- Create: `src/modules/storefront-pages/service.ts`
- Test: `src/modules/storefront-pages/service.test.ts`

**Interfaces:**
- Consumes: the Task 3 store functions (exact names above); `pageSetSchema`, `PageLayout`, `SaveDraftInput`, `PublishInput` (Task 2); `emitEvent` from `src/lib/emitter`.
- Produces:

```ts
export const PAGESET_CONFLICT = 'PAGESET_CONFLICT';
export const NO_DRAFT = 'NO_DRAFT';
export const PUBLISHED_HISTORY_LIMIT = 20;
export const PAGES_PUBLISHED_EVENT = 'storefront-pages:published';
export interface DraftView { layout: PageLayout; source: 'draft'|'published'|'none'; data: StoredPageSet|null; baseVersion: number; latestPublishedVersion: number; updatedAt: string|null }
export interface VersionSummary { version: number; createdAt: string; createdBy: { id: number; name: string } | null }
export interface VersionDetail { version: number; createdAt: string; data: StoredPageSet }
export function getDraft(layout): Promise<DraftView>;
export function saveDraft(layout, input: SaveDraftInput, userId: number): Promise<{ baseVersion: number; updatedAt: string }>;
export function discardDraft(layout): Promise<{ discarded: boolean }>;
export function publish(layout, input: PublishInput, userId: number): Promise<{ version: number; publishedAt: string }>;
export function listVersions(layout): Promise<VersionSummary[]>;
export function getVersion(layout, version: number): Promise<VersionDetail>;
export function restoreVersion(layout, version: number, userId: number): Promise<{ version: number }>;
export function getPublishedPageSet(layout): Promise<{ version: number; data: StoredPageSet } | null>;
// utils/errors.ts
export class BadRequestError extends AppError {} // 400
```

Behaviour decisions this task pins (resolving points the spec leaves open):
- `saveDraft` stores the draft with `version = latestPublishedVersion` and returns it as `baseVersion`. A client-sent `baseVersion` *above* the latest is tolerated, not an error; only *below* is a 409.
- `publish` and `restore` both emit `storefront-pages:published`.
- `restore` re-validates the old data against the current rules; a failure is a 400 ZodError. It also resets the draft (data and version) to the new version.

- [ ] **Step 1: Add `BadRequestError`**

Append to `src/utils/errors.ts`:

```ts
/**
 * 400 — a well-formed request the current state cannot satisfy. As with
 * ServiceUnavailableError, the envelope carries only a string, so callers
 * that need a stable machine-readable value pass it as the message
 * (e.g. `new BadRequestError('NO_DRAFT')`).
 */
export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request') {
    super(message, 400);
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `src/modules/storefront-pages/service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

type Row = {
  id: number; layout: string; kind: 'draft' | 'published'; version: number;
  data: unknown; createdBy: number | null; createdAt: Date; updatedAt: Date;
};

// In-memory stand-in for ./store (the seam every query goes through), so the
// service is tested without Postgres. `calls` records lock/read order.
const { mem, emitEvent } = vi.hoisted(() => ({
  mem: {
    rows: [] as Row[],
    nextId: 1,
    calls: [] as string[],
    users: { 9: 'Ada Admin' } as Record<number, string>,
  },
  emitEvent: vi.fn(),
}));

vi.mock('../../lib/emitter', () => ({ emitEvent }));

vi.mock('./store', () => {
  const draftOf = (layout: string) => mem.rows.find((r) => r.layout === layout && r.kind === 'draft') ?? null;
  const publishedOf = (layout: string) =>
    mem.rows.filter((r) => r.layout === layout && r.kind === 'published').sort((a, b) => b.version - a.version);
  const insert = (row: Omit<Row, 'id' | 'createdAt' | 'updatedAt'>): Row => {
    const now = new Date();
    const r = { ...row, id: mem.nextId++, createdAt: now, updatedAt: now };
    mem.rows.push(r);
    return r;
  };
  type Write = { layout: string; version: number; data: unknown; createdBy: number | null };
  return {
    inTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn('tx'),
    lockLayout: async (_tx: unknown, layout: string) => { mem.calls.push(`lock:${layout}`); },
    findDraft: async (layout: string) => draftOf(layout),
    findLatestPublished: async (layout: string) => {
      mem.calls.push(`latest:${layout}`);
      return publishedOf(layout)[0] ?? null;
    },
    findPublished: async (layout: string, version: number) =>
      publishedOf(layout).find((r) => r.version === version) ?? null,
    listPublished: async (layout: string) =>
      publishedOf(layout).map((r) => {
        const name = r.createdBy !== null ? mem.users[r.createdBy] ?? null : null;
        return { version: r.version, createdAt: r.createdAt, createdById: name ? r.createdBy : null, createdByName: name };
      }),
    upsertDraft: async (_tx: unknown, input: Write) => {
      const existing = draftOf(input.layout);
      if (existing) {
        Object.assign(existing, { version: input.version, data: input.data, createdBy: input.createdBy, updatedAt: new Date() });
        return existing;
      }
      return insert({ ...input, kind: 'draft' });
    },
    deleteDraft: async (layout: string) => {
      const before = mem.rows.length;
      mem.rows = mem.rows.filter((r) => !(r.layout === layout && r.kind === 'draft'));
      return mem.rows.length < before;
    },
    insertPublished: async (_tx: unknown, input: Write) => {
      if (publishedOf(input.layout).some((r) => r.version === input.version)) {
        throw new Error('duplicate key value violates unique constraint "storefront_page_sets_published_uq"');
      }
      return insert({ ...input, kind: 'published' });
    },
    setDraftVersion: async (_tx: unknown, layout: string, version: number) => {
      const d = draftOf(layout);
      if (d) d.version = version;
    },
    prunePublishedBelow: async (_tx: unknown, layout: string, below: number) => {
      mem.rows = mem.rows.filter((r) => !(r.layout === layout && r.kind === 'published' && r.version < below));
    },
  };
});

import * as service from './service';
import type { SaveDraftInput } from './schemas';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';

const shell = {
  root: { props: { title: '', description: '', chrome: 'shell' } },
  content: [{ type: 'PageOutlet', props: { id: 'outlet' } }],
};
const setWith = (title: string) => ({
  schemaVersion: 1,
  shell,
  pages: {
    catalog: {
      root: { props: { title, description: '', chrome: 'shell' } },
      content: [{ type: 'ProductGrid', props: { id: 'grid' } }],
    },
  },
});
const draftInput = (title: string, baseVersion: number) => ({ data: setWith(title), baseVersion }) as SaveDraftInput;
const titleOf = (data: unknown) => (data as ReturnType<typeof setWith>).pages.catalog.root.props.title;

function seedPublished(layout: string, versions: number[], createdBy: number | null = 9) {
  for (const version of versions) {
    const now = new Date(Date.UTC(2026, 8, version));
    mem.rows.push({ id: mem.nextId++, layout, kind: 'published', version, data: setWith(`v${version}`), createdBy, createdAt: now, updatedAt: now });
  }
}
const publishedVersions = (layout: string) =>
  mem.rows.filter((r) => r.layout === layout && r.kind === 'published').map((r) => r.version).sort((a, b) => a - b);
const draftRow = (layout: string) => mem.rows.find((r) => r.layout === layout && r.kind === 'draft');

beforeEach(() => {
  mem.rows = [];
  mem.nextId = 1;
  mem.calls = [];
  emitEvent.mockClear();
});

describe('getDraft', () => {
  it('reports none when nothing exists', async () => {
    await expect(service.getDraft('menu')).resolves.toEqual({
      layout: 'menu', source: 'none', data: null, baseVersion: 0, latestPublishedVersion: 0, updatedAt: null,
    });
  });

  it('falls back to the latest published set when there is no draft', async () => {
    seedPublished('menu', [1, 2]);
    const view = await service.getDraft('menu');
    expect(view).toMatchObject({ layout: 'menu', source: 'published', baseVersion: 2, latestPublishedVersion: 2 });
    expect(titleOf(view.data)).toBe('v2');
    expect(typeof view.updatedAt).toBe('string');
  });

  it('prefers the draft', async () => {
    seedPublished('menu', [1]);
    await service.saveDraft('menu', draftInput('Draft', 1), 9);
    const view = await service.getDraft('menu');
    expect(view).toMatchObject({ source: 'draft', baseVersion: 1, latestPublishedVersion: 1 });
    expect(titleOf(view.data)).toBe('Draft');
  });
});

describe('saveDraft', () => {
  it('creates the draft based on the latest published version (0 when none)', async () => {
    const res = await service.saveDraft('menu', draftInput('A', 0), 9);
    expect(res.baseVersion).toBe(0);
    expect(typeof res.updatedAt).toBe('string');
    expect(draftRow('menu')).toMatchObject({ version: 0, createdBy: 9 });
  });

  it('updates the existing draft in place', async () => {
    await service.saveDraft('menu', draftInput('A', 0), 9);
    await service.saveDraft('menu', draftInput('B', 0), 9);
    expect(mem.rows.filter((r) => r.kind === 'draft')).toHaveLength(1);
    expect(titleOf(draftRow('menu')!.data)).toBe('B');
  });

  it('takes the layout lock before reading the latest version', async () => {
    await service.saveDraft('menu', draftInput('A', 0), 9);
    expect(mem.calls.slice(0, 2)).toEqual(['lock:menu', 'latest:menu']);
  });

  it('refuses a stale baseVersion with 409 PAGESET_CONFLICT and writes nothing', async () => {
    seedPublished('menu', [1, 2]);
    const err = await service.saveDraft('menu', draftInput('A', 1), 9).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err).toMatchObject({ message: 'PAGESET_CONFLICT', statusCode: 409 });
    expect(draftRow('menu')).toBeUndefined();
  });

  it('keeps layouts independent', async () => {
    seedPublished('menu', [1, 2]);
    await expect(service.saveDraft('storefront', draftInput('A', 0), 9)).resolves.toMatchObject({ baseVersion: 0 });
  });
});

describe('discardDraft', () => {
  it('reports whether a draft was removed', async () => {
    await service.saveDraft('menu', draftInput('A', 0), 9);
    await expect(service.discardDraft('menu')).resolves.toEqual({ discarded: true });
    await expect(service.discardDraft('menu')).resolves.toEqual({ discarded: false });
  });
});

describe('publish', () => {
  it('refuses with 400 NO_DRAFT when there is no draft', async () => {
    const err = await service.publish('menu', { baseVersion: 0 }, 9).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestError);
    expect(err).toMatchObject({ message: 'NO_DRAFT', statusCode: 400 });
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('refuses a stale baseVersion with 409 PAGESET_CONFLICT', async () => {
    seedPublished('menu', [1, 2]);
    mem.rows.push({ id: mem.nextId++, layout: 'menu', kind: 'draft', version: 2, data: setWith('D'), createdBy: 9, createdAt: new Date(), updatedAt: new Date() });
    await expect(service.publish('menu', { baseVersion: 1 }, 9)).rejects.toMatchObject({ message: 'PAGESET_CONFLICT', statusCode: 409 });
    expect(publishedVersions('menu')).toEqual([1, 2]);
  });

  it('publishes version latest+1, re-bases the draft and emits to admins', async () => {
    await service.saveDraft('menu', draftInput('A', 0), 9);
    const res = await service.publish('menu', { baseVersion: 0 }, 9);
    expect(res.version).toBe(1);
    expect(typeof res.publishedAt).toBe('string');
    expect(publishedVersions('menu')).toEqual([1]);
    expect(draftRow('menu')!.version).toBe(1);
    expect(emitEvent).toHaveBeenCalledWith('storefront-pages:published', { layout: 'menu', version: 1 }, { target: 'role:admin' });
  });

  it('makes an editor still holding the old baseVersion conflict afterwards', async () => {
    await service.saveDraft('menu', draftInput('A', 0), 9);
    await service.publish('menu', { baseVersion: 0 }, 9);
    await expect(service.saveDraft('menu', draftInput('late', 0), 9)).rejects.toBeInstanceOf(ConflictError);
    await expect(service.publish('menu', { baseVersion: 0 }, 9)).rejects.toBeInstanceOf(ConflictError);
  });

  it('re-validates the stored draft and publishes nothing when it fails', async () => {
    mem.rows.push({
      id: mem.nextId++, layout: 'menu', kind: 'draft', version: 0,
      data: { ...setWith('bad'), pages: { nope: setWith('x').pages.catalog } },
      createdBy: 9, createdAt: new Date(), updatedAt: new Date(),
    });
    await expect(service.publish('menu', { baseVersion: 0 }, 9)).rejects.toBeInstanceOf(ZodError);
    expect(publishedVersions('menu')).toEqual([]);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('keeps only the newest 20 published versions', async () => {
    for (let i = 0; i < 25; i++) {
      await service.saveDraft('menu', draftInput(`p${i}`, i), 9);
      await service.publish('menu', { baseVersion: i }, 9);
    }
    expect(publishedVersions('menu')).toEqual(Array.from({ length: 20 }, (_, i) => i + 6));
    expect(draftRow('menu')!.version).toBe(25);
  });

  it('prunes an existing 20-version history down to the newest 20 including the new one', async () => {
    seedPublished('menu', Array.from({ length: 20 }, (_, i) => i + 1));
    await service.saveDraft('menu', draftInput('A', 20), 9);
    await service.publish('menu', { baseVersion: 20 }, 9);
    expect(publishedVersions('menu')).toEqual(Array.from({ length: 20 }, (_, i) => i + 2));
  });
});

describe('restoreVersion', () => {
  it('copies an old version into a NEW version and resets the draft to it', async () => {
    await service.saveDraft('menu', draftInput('A', 0), 9);
    await service.publish('menu', { baseVersion: 0 }, 9);
    await service.saveDraft('menu', draftInput('B', 1), 9);
    await service.publish('menu', { baseVersion: 1 }, 9);
    emitEvent.mockClear();

    await expect(service.restoreVersion('menu', 1, 9)).resolves.toEqual({ version: 3 });

    expect(publishedVersions('menu')).toEqual([1, 2, 3]);
    const v1 = mem.rows.find((r) => r.kind === 'published' && r.version === 1)!;
    const v3 = mem.rows.find((r) => r.kind === 'published' && r.version === 3)!;
    expect(titleOf(v1.data)).toBe('A');
    expect(titleOf(v3.data)).toBe('A');
    expect(draftRow('menu')).toMatchObject({ version: 3 });
    expect(titleOf(draftRow('menu')!.data)).toBe('A');
    expect(emitEvent).toHaveBeenCalledWith('storefront-pages:published', { layout: 'menu', version: 3 }, { target: 'role:admin' });
  });

  it('404s an unknown version', async () => {
    seedPublished('menu', [1]);
    await expect(service.restoreVersion('menu', 7, 9)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('versions and public read', () => {
  it('lists versions newest first with the author, or null when the author is gone', async () => {
    seedPublished('menu', [1], null);
    seedPublished('menu', [2], 9);
    const list = await service.listVersions('menu');
    expect(list.map((v) => v.version)).toEqual([2, 1]);
    expect(list[0].createdBy).toEqual({ id: 9, name: 'Ada Admin' });
    expect(list[1].createdBy).toBeNull();
    expect(typeof list[0].createdAt).toBe('string');
  });

  it('returns one version or 404s', async () => {
    seedPublished('menu', [1]);
    const v = await service.getVersion('menu', 1);
    expect(v.version).toBe(1);
    expect(titleOf(v.data)).toBe('v1');
    await expect(service.getVersion('menu', 2)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('serves only the latest published set — never the draft — and null when none', async () => {
    await expect(service.getPublishedPageSet('menu')).resolves.toBeNull();
    await service.saveDraft('menu', draftInput('draft only', 0), 9);
    await expect(service.getPublishedPageSet('menu')).resolves.toBeNull();
    seedPublished('menu', [1, 2]);
    const pub = await service.getPublishedPageSet('menu');
    expect(pub!.version).toBe(2);
    expect(titleOf(pub!.data)).toBe('v2');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/modules/storefront-pages/service.test.ts`
Expected: FAIL. The run reports it cannot resolve `./service`.

- [ ] **Step 4: Write the service**

Create `src/modules/storefront-pages/service.ts`:

```ts
import * as store from './store';
import { pageSetSchema, type PageLayout, type PublishInput, type SaveDraftInput } from './schemas';
import type { StoredPageSet } from '../../db/schema/storefront-pages';
import { emitEvent } from '../../lib/emitter';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';

/** Envelope `error` strings (spec §13 A5 — the envelope carries no `code`). */
export const PAGESET_CONFLICT = 'PAGESET_CONFLICT';
export const NO_DRAFT = 'NO_DRAFT';
export const PUBLISHED_HISTORY_LIMIT = 20;
export const PAGES_PUBLISHED_EVENT = 'storefront-pages:published';

export interface DraftView {
  layout: PageLayout;
  source: 'draft' | 'published' | 'none';
  data: StoredPageSet | null;
  baseVersion: number;
  latestPublishedVersion: number;
  updatedAt: string | null;
}

export interface VersionSummary {
  version: number;
  createdAt: string;
  createdBy: { id: number; name: string } | null;
}

export interface VersionDetail {
  version: number;
  createdAt: string;
  data: StoredPageSet;
}

function notifyPublished(layout: PageLayout, version: number): void {
  emitEvent(PAGES_PUBLISHED_EVENT, { layout, version }, { target: 'role:admin' });
}

export async function getDraft(layout: PageLayout): Promise<DraftView> {
  const [draft, latest] = await Promise.all([store.findDraft(layout), store.findLatestPublished(layout)]);
  const latestPublishedVersion = latest?.version ?? 0;
  if (draft) {
    return { layout, source: 'draft', data: draft.data, baseVersion: draft.version, latestPublishedVersion, updatedAt: draft.updatedAt.toISOString() };
  }
  if (latest) {
    return { layout, source: 'published', data: latest.data, baseVersion: latest.version, latestPublishedVersion, updatedAt: latest.updatedAt.toISOString() };
  }
  return { layout, source: 'none', data: null, baseVersion: 0, latestPublishedVersion: 0, updatedAt: null };
}

/** Autosave. 409 when someone published since this editor loaded. The
 *  stored draft is always based on the current latest version. */
export async function saveDraft(layout: PageLayout, input: SaveDraftInput, userId: number) {
  return store.inTransaction(async (tx) => {
    await store.lockLayout(tx, layout);
    const latest = (await store.findLatestPublished(layout, tx))?.version ?? 0;
    if (input.baseVersion < latest) throw new ConflictError(PAGESET_CONFLICT);
    const row = await store.upsertDraft(tx, { layout, version: latest, data: input.data, createdBy: userId });
    return { baseVersion: row.version, updatedAt: row.updatedAt.toISOString() };
  });
}

export async function discardDraft(layout: PageLayout) {
  return { discarded: await store.deleteDraft(layout) };
}

export async function publish(layout: PageLayout, input: PublishInput, userId: number) {
  const result = await store.inTransaction(async (tx) => {
    await store.lockLayout(tx, layout);
    const latest = (await store.findLatestPublished(layout, tx))?.version ?? 0;
    if (input.baseVersion < latest) throw new ConflictError(PAGESET_CONFLICT);
    const draft = await store.findDraft(layout, tx);
    if (!draft) throw new BadRequestError(NO_DRAFT);
    // Re-validate: the draft was valid when saved, but rules may have
    // tightened since. A ZodError here is a 400 and rolls everything back.
    const data = pageSetSchema.parse(draft.data);
    const version = latest + 1;
    const row = await store.insertPublished(tx, { layout, version, data, createdBy: userId });
    await store.setDraftVersion(tx, layout, version);
    await store.prunePublishedBelow(tx, layout, version - PUBLISHED_HISTORY_LIMIT + 1);
    return { version, publishedAt: row.createdAt.toISOString() };
  });
  notifyPublished(layout, result.version);
  return result;
}

export async function listVersions(layout: PageLayout): Promise<VersionSummary[]> {
  const rows = await store.listPublished(layout);
  return rows.map((r) => ({
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdById !== null ? { id: r.createdById, name: r.createdByName ?? '' } : null,
  }));
}

export async function getVersion(layout: PageLayout, version: number): Promise<VersionDetail> {
  const row = await store.findPublished(layout, version);
  if (!row) throw new NotFoundError('Page set version');
  return { version: row.version, createdAt: row.createdAt.toISOString(), data: row.data };
}

/** History is never rewritten: the old data becomes a NEW version, and the
 *  draft is reset to it. */
export async function restoreVersion(layout: PageLayout, version: number, userId: number) {
  const result = await store.inTransaction(async (tx) => {
    await store.lockLayout(tx, layout);
    const source = await store.findPublished(layout, version, tx);
    if (!source) throw new NotFoundError('Page set version');
    const latest = (await store.findLatestPublished(layout, tx))?.version ?? source.version;
    const data = pageSetSchema.parse(source.data);
    const next = latest + 1;
    await store.insertPublished(tx, { layout, version: next, data, createdBy: userId });
    await store.upsertDraft(tx, { layout, version: next, data, createdBy: userId });
    await store.prunePublishedBelow(tx, layout, next - PUBLISHED_HISTORY_LIMIT + 1);
    return { version: next };
  });
  notifyPublished(layout, result.version);
  return result;
}

/** Public read (storefront): the latest published set only — never a draft. */
export async function getPublishedPageSet(layout: PageLayout): Promise<{ version: number; data: StoredPageSet } | null> {
  const latest = await store.findLatestPublished(layout);
  return latest ? { version: latest.version, data: latest.data } : null;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/modules/storefront-pages/service.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

If `data` from `pageSetSchema.parse` is reported as not assignable to `StoredPageSet` in `insertPublished`/`upsertDraft`, widen `StoredPuckDoc.root` in `src/db/schema/storefront-pages.ts` to `{ props: Record<string, unknown>; [k: string]: unknown }`. Do not cast.

- [ ] **Step 7: Commit**

```bash
git add src/utils/errors.ts src/modules/storefront-pages/service.ts src/modules/storefront-pages/service.test.ts
git commit -m "feat(storefront-pages): draft/publish/restore service with 20-version history"
```

---

### Task 5: Page media — sniffing, S3 upload, S3 read

**Files:**
- Create: `src/modules/storefront-pages/media.ts`
- Test: `src/modules/storefront-pages/media.test.ts`

**Interfaces:**
- Consumes: `uploadFile(key, body, contentType)`, `getFile(key)` from `src/lib/s3`; `ValidationError`, `NotFoundError`.
- Produces:
  - `PAGE_MEDIA_KEY_RE = /^[a-f0-9]{32}\.(png|jpg|webp|gif)$/`
  - `type PageImageExt = 'png'|'jpg'|'webp'|'gif'`
  - `sniffImageType(buf: Buffer): PageImageExt | null`
  - `pageMediaS3Key(key: string): string` → `storefront-pages/<key>`
  - `uploadPageMedia(file: Express.Multer.File): Promise<{ url: string }>`: stores by the **sniffed** type, not the declared mimetype
  - `getPageMedia(key: string): Promise<{ stream: Readable; contentType: string; contentLength?: number; etag?: string }>`: `NotFoundError` for a malformed key or a missing object

- [ ] **Step 1: Write the failing test**

Create `src/modules/storefront-pages/media.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'stream';

const { uploadFile, getFile } = vi.hoisted(() => ({
  uploadFile: vi.fn(async (key: string) => key),
  getFile: vi.fn(),
}));
vi.mock('../../lib/s3', () => ({ uploadFile, getFile }));

import { PAGE_MEDIA_KEY_RE, getPageMedia, sniffImageType, uploadPageMedia } from './media';
import { NotFoundError, ValidationError } from '../../utils/errors';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

const file = (buffer: Buffer, mimetype = 'image/png') =>
  ({ buffer, mimetype, originalname: 'upload', size: buffer.length }) as unknown as Express.Multer.File;

beforeEach(() => {
  uploadFile.mockClear();
  getFile.mockReset();
});

describe('sniffImageType', () => {
  it.each([
    [PNG, 'png'], [JPG, 'jpg'], [GIF, 'gif'], [WEBP, 'webp'],
  ] as const)('detects %#', (buf, ext) => {
    expect(sniffImageType(buf)).toBe(ext);
  });

  it('returns null for anything else', () => {
    expect(sniffImageType(HTML)).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
    expect(sniffImageType(Buffer.from('RIFF\0\0\0\0WAVE'))).toBeNull();
  });
});

describe('uploadPageMedia', () => {
  it('stores under storefront-pages/<32 hex>.<ext> and returns the Worker media URL', async () => {
    const { url } = await uploadPageMedia(file(PNG));
    const key = url.replace('/media/storefront-pages/media/', '');
    expect(url).toMatch(/^\/media\/storefront-pages\/media\/[a-f0-9]{32}\.png$/);
    expect(key).toMatch(PAGE_MEDIA_KEY_RE);
    expect(uploadFile).toHaveBeenCalledWith(`storefront-pages/${key}`, PNG, 'image/png');
  });

  it('names the object by its real bytes, not the declared mimetype', async () => {
    const { url } = await uploadPageMedia(file(PNG, 'image/jpeg'));
    expect(url).toMatch(/\.png$/);
    expect(uploadFile).toHaveBeenCalledWith(expect.stringMatching(/\.png$/), PNG, 'image/png');
  });

  it('refuses a non-image dressed up as one, storing nothing', async () => {
    await expect(uploadPageMedia(file(HTML, 'image/png'))).rejects.toBeInstanceOf(ValidationError);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('never reuses a key', async () => {
    const a = await uploadPageMedia(file(JPG, 'image/jpeg'));
    const b = await uploadPageMedia(file(JPG, 'image/jpeg'));
    expect(a.url).not.toBe(b.url);
  });
});

describe('getPageMedia', () => {
  it('reads storefront-pages/<key> with the type implied by the extension', async () => {
    const stream = Readable.from([Buffer.from('x')]);
    getFile.mockResolvedValue({ stream, contentType: 'application/octet-stream', contentLength: 1, etag: '"e"' });
    const key = `${'a'.repeat(32)}.jpg`;
    const res = await getPageMedia(key);
    expect(getFile).toHaveBeenCalledWith(`storefront-pages/${key}`);
    expect(res).toMatchObject({ stream, contentType: 'image/jpeg', contentLength: 1, etag: '"e"' });
  });

  it.each(['../secret.png', `${'a'.repeat(32)}.svg`, `${'A'.repeat(32)}.png`, 'x.png'])(
    '404s the malformed key %j without touching S3',
    async (key) => {
      await expect(getPageMedia(key)).rejects.toBeInstanceOf(NotFoundError);
      expect(getFile).not.toHaveBeenCalled();
    },
  );

  it('404s a missing object', async () => {
    getFile.mockRejectedValue(Object.assign(new Error('The specified key does not exist.'), { name: 'NoSuchKey' }));
    await expect(getPageMedia(`${'b'.repeat(32)}.png`)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rethrows any other S3 failure', async () => {
    getFile.mockRejectedValue(new Error('socket hang up'));
    await expect(getPageMedia(`${'b'.repeat(32)}.png`)).rejects.toThrow('socket hang up');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/storefront-pages/media.test.ts`
Expected: FAIL. The run reports it cannot resolve `./media`.

- [ ] **Step 3: Write the implementation**

Create `src/modules/storefront-pages/media.ts`:

```ts
import { randomBytes } from 'crypto';
import type { Readable } from 'stream';
import { getFile, uploadFile } from '../../lib/s3';
import { NotFoundError, ValidationError } from '../../utils/errors';

/** Spec §13 A3. The storefront Worker proxies
 *  /media/storefront-pages/media/<key> → /api/v1/storefront-pages/media/<key>. */
export const PAGE_MEDIA_KEY_RE = /^[a-f0-9]{32}\.(png|jpg|webp|gif)$/;

export type PageImageExt = 'png' | 'jpg' | 'webp' | 'gif';

const CONTENT_TYPE: Record<PageImageExt, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** Magic bytes. The multer filter only sees the client-declared mimetype. */
export function sniffImageType(buf: Buffer): PageImageExt | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 6) {
    const head = buf.subarray(0, 6).toString('latin1');
    if (head === 'GIF87a' || head === 'GIF89a') return 'gif';
  }
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

export function pageMediaS3Key(key: string): string {
  return `storefront-pages/${key}`;
}

export async function uploadPageMedia(file: Express.Multer.File): Promise<{ url: string }> {
  const ext = sniffImageType(file.buffer);
  if (!ext) throw new ValidationError('File is not a valid PNG, JPEG, WebP or GIF image');
  const key = `${randomBytes(16).toString('hex')}.${ext}`;
  await uploadFile(pageMediaS3Key(key), file.buffer, CONTENT_TYPE[ext]);
  return { url: `/media/storefront-pages/media/${key}` };
}

function isMissingObject(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404;
}

export async function getPageMedia(key: string): Promise<{ stream: Readable; contentType: string; contentLength?: number; etag?: string }> {
  const match = PAGE_MEDIA_KEY_RE.exec(key);
  if (!match) throw new NotFoundError('Image');
  try {
    const file = await getFile(pageMediaS3Key(key));
    return {
      stream: file.stream,
      contentType: CONTENT_TYPE[match[1] as PageImageExt],
      contentLength: file.contentLength,
      etag: file.etag,
    };
  } catch (err) {
    if (isMissingObject(err)) throw new NotFoundError('Image');
    throw err;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/modules/storefront-pages/media.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/storefront-pages/media.ts src/modules/storefront-pages/media.test.ts
git commit -m "feat(storefront-pages): page media upload/serve with magic-byte sniffing"
```

---

### Task 6: HTTP layer — upload middleware, controller, routers, mounts, permissions

**Files:**
- Modify: `src/middleware/upload.ts` (append `uploadPageImage`)
- Create: `src/modules/storefront-pages/controller.ts`
- Create: `src/modules/storefront-pages/router.ts`
- Modify: `src/app.ts` (import, scoped body parser, mount)
- Modify: `src/app.mounts.test.ts`
- Modify: `src/modules/public-storefront/router.ts`
- Modify: `src/config/modules.ts`
- Modify: `src/lib/permissions.test.ts`
- Test: `src/modules/storefront-pages/router.test.ts`

**Interfaces:**
- Consumes: all service functions (Task 4), `uploadPageMedia`/`getPageMedia` (Task 5), request schemas (Task 2), `requireStorefrontEnabled` (`src/middleware/storefront`), `authenticate`, `authorize`.
- Produces:
  - `storefrontPagesRouter`, mounted at `/api/v1/storefront-pages` with `tagDomain('storefront-pages')`
  - `publicStorefrontPagesRouter` (`GET /:layout`), mounted inside `publicStorefrontRouter` at `/pages`
  - `uploadPageImage` middleware (multer field `file`, png/jpeg/webp/gif, 5 MB; every `MulterError` → `ValidationError` 422)
  - `DomainKey` gains `'storefront-pages'`, granted by the `storefront` module

- [ ] **Step 1: Write the failing router test**

Create `src/modules/storefront-pages/router.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

// The real routers, controller, schemas and upload middleware; the service,
// media store and storefront kill switch stubbed. `x-test-role` drives the
// authorize stub so the admin gate on every route is actually exercised.
const { svc, media, settings } = vi.hoisted(() => ({
  svc: {
    getDraft: vi.fn(), saveDraft: vi.fn(), discardDraft: vi.fn(), publish: vi.fn(),
    listVersions: vi.fn(), getVersion: vi.fn(), restoreVersion: vi.fn(), getPublishedPageSet: vi.fn(),
  },
  media: { uploadPageMedia: vi.fn(), getPageMedia: vi.fn() },
  settings: { isStorefrontEnabled: vi.fn() },
}));

vi.mock('./service', () => svc);
vi.mock('./media', () => media);
vi.mock('../storefront-settings/service', () => settings);
vi.mock('../../middleware/authenticate', () => ({
  authenticate: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { id: 9, role: 'admin' };
    next();
  },
}));
vi.mock('../../middleware/authorize', async () => {
  const { ForbiddenError } = await import('../../utils/errors');
  return {
    authorize: (...roles: string[]) =>
      (req: { headers: Record<string, string | undefined> }, _res: unknown, next: (err?: unknown) => void) =>
        roles.includes(req.headers['x-test-role'] ?? 'admin') ? next() : next(new ForbiddenError('Insufficient permissions')),
  };
});

import { publicStorefrontPagesRouter, storefrontPagesRouter } from './router';
import { errorHandler } from '../../middleware/error-handler';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/storefront-pages', storefrontPagesRouter);
  app.use('/public/storefront/pages', publicStorefrontPagesRouter);
  app.use(errorHandler);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  vi.clearAllMocks();
  settings.isStorefrontEnabled.mockResolvedValue(true);
});

function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const validSet = () => ({
  schemaVersion: 1,
  shell: { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [{ type: 'PageOutlet', props: { id: 'o' } }] },
  pages: {
    catalog: {
      root: { props: { title: 'Shop', description: '', chrome: 'shell' } },
      content: [{ type: 'RichText', props: { id: 'r', bodyHtml: '<p onclick="x()">Hi</p>' } }],
    },
  },
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
function upload(field: string, bytes: Buffer, type: string, name = 'a.png') {
  const fd = new FormData();
  fd.append(field, new Blob([bytes], { type }), name);
  return fetch(`${base}/storefront-pages/media`, { method: 'POST', body: fd });
}

describe('admin gate', () => {
  it.each([
    ['GET', '/storefront-pages/menu/draft'],
    ['PUT', '/storefront-pages/menu/draft'],
    ['DELETE', '/storefront-pages/menu/draft'],
    ['POST', '/storefront-pages/menu/publish'],
    ['GET', '/storefront-pages/menu/versions'],
    ['GET', '/storefront-pages/menu/versions/1'],
    ['POST', '/storefront-pages/menu/versions/1/restore'],
    ['POST', '/storefront-pages/media'],
  ])('%s %s refuses a non-admin', async (method, path) => {
    const res = await call(method, path, method === 'GET' || method === 'DELETE' ? undefined : {}, { 'x-test-role': 'staff' });
    expect(res.status).toBe(403);
    for (const fn of Object.values(svc)) expect(fn).not.toHaveBeenCalled();
    expect(media.uploadPageMedia).not.toHaveBeenCalled();
  });
});

describe('drafts', () => {
  it('GET draft passes the layout through', async () => {
    svc.getDraft.mockResolvedValue({ layout: 'menu', source: 'none', data: null, baseVersion: 0, latestPublishedVersion: 0, updatedAt: null });
    const res = await call('GET', '/storefront-pages/menu/draft');
    expect(res.status).toBe(200);
    expect((await res.json()).data.source).toBe('none');
    expect(svc.getDraft).toHaveBeenCalledWith('menu');
  });

  it('an unknown layout is a 400 and never reaches the service', async () => {
    const res = await call('GET', '/storefront-pages/desktop/draft');
    expect(res.status).toBe(400);
    expect(svc.getDraft).not.toHaveBeenCalled();
  });

  it('PUT draft validates, sanitises and passes the user id', async () => {
    svc.saveDraft.mockResolvedValue({ baseVersion: 2, updatedAt: '2026-09-29T00:00:00.000Z' });
    const res = await call('PUT', '/storefront-pages/webapp/draft', { data: validSet(), baseVersion: 2 });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ baseVersion: 2, updatedAt: '2026-09-29T00:00:00.000Z' });
    const [layout, input, userId] = svc.saveDraft.mock.calls[0];
    expect(layout).toBe('webapp');
    expect(userId).toBe(9);
    expect(input.baseVersion).toBe(2);
    expect(input.data.pages.catalog.content[0].props.bodyHtml).toBe('<p>Hi</p>');
  });

  it('PUT draft with an invalid page set is a 400 naming the path', async () => {
    const bad = validSet();
    (bad.pages.catalog.content[0] as { type: string }).type = 'richText';
    const res = await call('PUT', '/storefront-pages/menu/draft', { data: bad, baseVersion: 0 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/data\.pages\.catalog\.content\.0\.type: Invalid component type/);
    expect(svc.saveDraft).not.toHaveBeenCalled();
  });

  it('PUT draft surfaces the conflict as 409 PAGESET_CONFLICT', async () => {
    svc.saveDraft.mockRejectedValue(new ConflictError('PAGESET_CONFLICT'));
    const res = await call('PUT', '/storefront-pages/menu/draft', { data: validSet(), baseVersion: 0 });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, data: null, error: 'PAGESET_CONFLICT' });
  });

  it('DELETE draft', async () => {
    svc.discardDraft.mockResolvedValue({ discarded: true });
    const res = await call('DELETE', '/storefront-pages/storefront/draft');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ discarded: true });
    expect(svc.discardDraft).toHaveBeenCalledWith('storefront');
  });
});

describe('publish, versions, restore', () => {
  it('publish passes baseVersion and user', async () => {
    svc.publish.mockResolvedValue({ version: 3, publishedAt: '2026-09-29T00:00:00.000Z' });
    const res = await call('POST', '/storefront-pages/menu/publish', { baseVersion: 2 });
    expect(res.status).toBe(200);
    expect((await res.json()).data.version).toBe(3);
    expect(svc.publish).toHaveBeenCalledWith('menu', { baseVersion: 2 }, 9);
  });

  it.each([[{}], [{ baseVersion: -1 }], [{ baseVersion: 'x' }]])('publish rejects body %j with 400', async (body) => {
    const res = await call('POST', '/storefront-pages/menu/publish', body);
    expect(res.status).toBe(400);
    expect(svc.publish).not.toHaveBeenCalled();
  });

  it('publish with no draft is 400 NO_DRAFT', async () => {
    svc.publish.mockRejectedValue(new BadRequestError('NO_DRAFT'));
    const res = await call('POST', '/storefront-pages/menu/publish', { baseVersion: 0 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('NO_DRAFT');
  });

  it('lists versions', async () => {
    svc.listVersions.mockResolvedValue([{ version: 2, createdAt: 'x', createdBy: null }]);
    const res = await call('GET', '/storefront-pages/menu/versions');
    expect((await res.json()).data).toEqual([{ version: 2, createdAt: 'x', createdBy: null }]);
  });

  it('gets one version with a coerced number, 400 for a non-number', async () => {
    svc.getVersion.mockResolvedValue({ version: 4, createdAt: 'x', data: validSet() });
    expect((await call('GET', '/storefront-pages/menu/versions/4')).status).toBe(200);
    expect(svc.getVersion).toHaveBeenCalledWith('menu', 4);
    expect((await call('GET', '/storefront-pages/menu/versions/abc')).status).toBe(400);
    expect((await call('GET', '/storefront-pages/menu/versions/0')).status).toBe(400);
  });

  it('a missing version is 404', async () => {
    svc.getVersion.mockRejectedValue(new NotFoundError('Page set version'));
    expect((await call('GET', '/storefront-pages/menu/versions/9')).status).toBe(404);
  });

  it('restore', async () => {
    svc.restoreVersion.mockResolvedValue({ version: 5 });
    const res = await call('POST', '/storefront-pages/menu/versions/2/restore');
    expect((await res.json()).data).toEqual({ version: 5 });
    expect(svc.restoreVersion).toHaveBeenCalledWith('menu', 2, 9);
  });
});

describe('media', () => {
  it('uploads a PNG from field "file"', async () => {
    media.uploadPageMedia.mockResolvedValue({ url: `/media/storefront-pages/media/${'a'.repeat(32)}.png` });
    const res = await upload('file', PNG, 'image/png');
    expect(res.status).toBe(200);
    expect((await res.json()).data.url).toMatch(/^\/media\/storefront-pages\/media\//);
    expect(media.uploadPageMedia).toHaveBeenCalledWith(expect.objectContaining({ mimetype: 'image/png' }));
  });

  it('rejects a disallowed type with 422', async () => {
    const res = await upload('file', Buffer.from('<svg/>'), 'image/svg+xml', 'a.svg');
    expect(res.status).toBe(422);
    expect(media.uploadPageMedia).not.toHaveBeenCalled();
  });

  it('rejects a file over 5 MB with 422, not 500', async () => {
    const res = await upload('file', Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png');
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/5 MB/);
    expect(media.uploadPageMedia).not.toHaveBeenCalled();
  });

  it('rejects the wrong field name with 422, not 500', async () => {
    const res = await upload('image', PNG, 'image/png');
    expect(res.status).toBe(422);
  });

  it('rejects a request with no file with 422', async () => {
    const res = await fetch(`${base}/storefront-pages/media`, { method: 'POST', body: new FormData() });
    expect(res.status).toBe(422);
  });

  it('serves an image publicly with long-lived cache headers', async () => {
    media.getPageMedia.mockResolvedValue({ stream: Readable.from([Buffer.from('img')]), contentType: 'image/png', contentLength: 3, etag: '"e"' });
    const key = `${'c'.repeat(32)}.png`;
    const res = await call('GET', `/storefront-pages/media/${key}`, undefined, { 'x-test-role': 'nobody' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(await res.text()).toBe('img');
    expect(media.getPageMedia).toHaveBeenCalledWith(key);
  });

  it('404s a missing image', async () => {
    media.getPageMedia.mockRejectedValue(new NotFoundError('Image'));
    expect((await call('GET', `/storefront-pages/media/${'d'.repeat(32)}.png`)).status).toBe(404);
  });
});

describe('public read', () => {
  it('is closed with 503 STOREFRONT_DISABLED while the kill switch is off', async () => {
    settings.isStorefrontEnabled.mockResolvedValue(false);
    const res = await call('GET', '/public/storefront/pages/menu');
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('STOREFRONT_DISABLED');
    expect(svc.getPublishedPageSet).not.toHaveBeenCalled();
  });

  it('returns the published set', async () => {
    svc.getPublishedPageSet.mockResolvedValue({ version: 3, data: validSet() });
    const res = await call('GET', '/public/storefront/pages/webapp', undefined, { 'x-test-role': 'nobody' });
    expect(res.status).toBe(200);
    expect((await res.json()).data.version).toBe(3);
    expect(svc.getPublishedPageSet).toHaveBeenCalledWith('webapp');
  });

  it('returns data: null when nothing is published', async () => {
    svc.getPublishedPageSet.mockResolvedValue(null);
    const res = await call('GET', '/public/storefront/pages/menu');
    expect(await res.json()).toEqual({ success: true, data: null, error: null });
  });

  it('400s an unknown layout', async () => {
    expect((await call('GET', '/public/storefront/pages/desktop')).status).toBe(400);
  });

  it('is mounted inside the public storefront router at /pages', () => {
    const source = readFileSync(join(__dirname, '../public-storefront/router.ts'), 'utf8');
    expect(source).toContain("publicStorefrontRouter.use('/pages', publicStorefrontPagesRouter);");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/storefront-pages/router.test.ts`
Expected: FAIL. The run reports it cannot resolve `./router`.

- [ ] **Step 3: Add the upload middleware**

Append to `src/middleware/upload.ts`:

```ts
// Page-builder images (spec 2026-09-29 §13 A3): field "file", png/jpeg/webp/gif,
// 5 MB. Unlike the instances above, MulterError (file too large, wrong field
// name) is mapped to a 422 here — it is not an AppError, so errorHandler would
// otherwise answer 500. The bytes are sniffed again in storefront-pages/media.
const PAGE_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const PAGE_IMAGE_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const pageImageMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PAGE_IMAGE_MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!PAGE_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      return cb(new ValidationError(`Invalid file type: ${file.mimetype}. Allowed: ${PAGE_IMAGE_MIME_TYPES.join(', ')}`));
    }
    cb(null, true);
  },
}).single('file');

export function uploadPageImage(req: Request, res: Response, next: NextFunction) {
  pageImageMulter(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      return next(new ValidationError(
        err.code === 'LIMIT_FILE_SIZE' ? 'Image is larger than 5 MB' : `Upload rejected: ${err.message} (expected one image in field "file")`,
      ));
    }
    next(err as Error | undefined);
  });
}
```

Add the type import at the top of `src/middleware/upload.ts`, below `import multer from 'multer';`:

```ts
import type { Request, Response, NextFunction } from 'express';
```

- [ ] **Step 4: Write the controller**

Create `src/modules/storefront-pages/controller.ts`:

```ts
import type { Request, Response } from 'express';
import * as storefrontPagesService from './service';
import * as mediaService from './media';
import { layoutParamSchema, publishBodySchema, saveDraftBodySchema, versionParamSchema } from './schemas';
import { sendSuccess } from '../../utils/response';
import { ValidationError } from '../../utils/errors';

// Params and bodies are parsed here, not with validate(): the page-builder
// HTTP contract (spec 2026-09-29 §13 A5) fixes validation failures at 400,
// which is what errorHandler answers for a ZodError (validate() answers 422).

const MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable'; // keys are random and never reused

function layoutOf(req: Request) {
  return layoutParamSchema.parse(req.params).layout;
}

export async function getDraft(req: Request, res: Response) {
  sendSuccess(res, await storefrontPagesService.getDraft(layoutOf(req)));
}

export async function saveDraft(req: Request, res: Response) {
  const layout = layoutOf(req);
  const body = saveDraftBodySchema.parse(req.body);
  sendSuccess(res, await storefrontPagesService.saveDraft(layout, body, req.user!.id));
}

export async function discardDraft(req: Request, res: Response) {
  sendSuccess(res, await storefrontPagesService.discardDraft(layoutOf(req)));
}

export async function publish(req: Request, res: Response) {
  const layout = layoutOf(req);
  const body = publishBodySchema.parse(req.body);
  sendSuccess(res, await storefrontPagesService.publish(layout, body, req.user!.id));
}

export async function listVersions(req: Request, res: Response) {
  sendSuccess(res, await storefrontPagesService.listVersions(layoutOf(req)));
}

export async function getVersion(req: Request, res: Response) {
  const { layout, version } = versionParamSchema.parse(req.params);
  sendSuccess(res, await storefrontPagesService.getVersion(layout, version));
}

export async function restoreVersion(req: Request, res: Response) {
  const { layout, version } = versionParamSchema.parse(req.params);
  sendSuccess(res, await storefrontPagesService.restoreVersion(layout, version, req.user!.id));
}

export async function uploadMedia(req: Request, res: Response) {
  if (!req.file) throw new ValidationError('No image file provided (multipart field "file")');
  sendSuccess(res, await mediaService.uploadPageMedia(req.file));
}

export async function getMedia(req: Request, res: Response) {
  const file = await mediaService.getPageMedia(String(req.params.key));
  res.set({
    'Content-Type': file.contentType,
    'Cache-Control': MEDIA_CACHE_CONTROL,
    'CDN-Cache-Control': MEDIA_CACHE_CONTROL,
    'Cross-Origin-Resource-Policy': 'cross-origin',
    ...(file.contentLength != null && { 'Content-Length': String(file.contentLength) }),
    ...(file.etag && { ETag: file.etag }),
  });
  file.stream.pipe(res);
}

export async function getPublishedPages(req: Request, res: Response) {
  sendSuccess(res, await storefrontPagesService.getPublishedPageSet(layoutOf(req)));
}
```

- [ ] **Step 5: Write the routers**

Create `src/modules/storefront-pages/router.ts`:

```ts
import { Router } from 'express';
import * as storefrontPagesController from './controller';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { requireStorefrontEnabled } from '../../middleware/storefront';
import { uploadPageImage } from '../../middleware/upload';

/**
 * Page-builder storage (spec 2026-09-29 §4.2 / §13 A5), mounted at
 * `/api/v1/storefront-pages`. Admin JWT only, like every storefront-settings
 * route — except `GET /media/:key`, which the storefront Worker proxies
 * publicly as `/media/storefront-pages/media/<key>`.
 */
export const storefrontPagesRouter = Router();

// Media first so `/media/...` is never read as a `:layout`.
storefrontPagesRouter.get('/media/:key', storefrontPagesController.getMedia);
storefrontPagesRouter.post('/media', authenticate, authorize('admin'), uploadPageImage, storefrontPagesController.uploadMedia);

storefrontPagesRouter.get('/:layout/draft', authenticate, authorize('admin'), storefrontPagesController.getDraft);
storefrontPagesRouter.put('/:layout/draft', authenticate, authorize('admin'), storefrontPagesController.saveDraft);
storefrontPagesRouter.delete('/:layout/draft', authenticate, authorize('admin'), storefrontPagesController.discardDraft);
storefrontPagesRouter.post('/:layout/publish', authenticate, authorize('admin'), storefrontPagesController.publish);
storefrontPagesRouter.get('/:layout/versions', authenticate, authorize('admin'), storefrontPagesController.listVersions);
storefrontPagesRouter.get('/:layout/versions/:version', authenticate, authorize('admin'), storefrontPagesController.getVersion);
storefrontPagesRouter.post('/:layout/versions/:version/restore', authenticate, authorize('admin'), storefrontPagesController.restoreVersion);

/**
 * The storefront's read of the latest published set. Mounted by
 * public-storefront/router.ts at `/pages`, so it is
 * `GET /api/v1/public/storefront/pages/:layout`. Behind the kill switch; no
 * auth (identical for every shopper; the Worker edge-caches it 30 s).
 */
export const publicStorefrontPagesRouter = Router();

publicStorefrontPagesRouter.get('/:layout', requireStorefrontEnabled, storefrontPagesController.getPublishedPages);
```

- [ ] **Step 6: Run the router test to verify it passes**

Run: `npx vitest run src/modules/storefront-pages/router.test.ts`
Expected: every test passes **except** `is mounted inside the public storefront router at /pages`, which still fails. Step 7 fixes that one.

- [ ] **Step 7: Mount the public sub-router**

In `src/modules/public-storefront/router.ts`, add this import below `import { validate } from '../../middleware/validate';`:

```ts
import { publicStorefrontPagesRouter } from '../storefront-pages/router';
```

Then insert this block immediately above the `// ------…` line that opens the `// Catalog (personalised) — behind` comment block:

```ts
// ---------------------------------------------------------------------------
// Pages — the latest published page-builder set per layout (module
// storefront-pages). `requireStorefrontEnabled` is applied inside the
// sub-router. No auth: it is identical for every shopper and the Worker
// edge-caches it 30 s alongside /settings.
// ---------------------------------------------------------------------------
publicStorefrontRouter.use('/pages', publicStorefrontPagesRouter);

```

- [ ] **Step 8: Mount the admin router and the scoped body parser in `src/app.ts`**

Add the import after `import { storefrontDeployRouter } from './modules/storefront-deploy/router';`:

```ts
import { storefrontPagesRouter } from './modules/storefront-pages/router';
```

Insert this directly after the line `app.use('/api/v1/label-templates', express.json({ limit: '10mb' }));`. It must come before the global `app.use(express.json({`:

```ts
// Page-builder page sets are up to 512 KB serialized (storefront-pages
// PAGESET_LIMITS.bytes); the global parser's 100 KB default would 413 a
// legitimate set before validation runs. Scoped for the same reason as above.
app.use('/api/v1/storefront-pages', express.json({ limit: '1mb' }));
```

Add the mount after the `storefront-deploy` mount line:

```ts
app.use(`${v1}/storefront-pages`, tagDomain('storefront-pages'), storefrontPagesRouter);
```

- [ ] **Step 9: Register the permission domain**

In `src/config/modules.ts`:
- In `DOMAINS`, change `'storefront-settings', 'storefront-deploy',` to `'storefront-settings', 'storefront-deploy', 'storefront-pages',`.
- In `MODULES.storefront`, change `primary: ['storefront-settings', 'storefront-deploy'],` to `primary: ['storefront-settings', 'storefront-deploy', 'storefront-pages'],`.

In `src/lib/permissions.test.ts`, add this test inside `describe('expandToDomains', () => {`:

```ts
  it('grants the page-builder domain with the Storefront module', () => {
    expect(expandToDomains({ storefront: 'write' })['storefront-pages']).toBe('write');
    expect(expandToDomains({ storefront: 'read' })['storefront-pages']).toBe('read');
  });
```

- [ ] **Step 10: Update the mount test**

In `src/app.mounts.test.ts`, change

```ts
const BODY_PARSER_MOUNTS = [/^\/label-templates$/];
```

to

```ts
const BODY_PARSER_MOUNTS = [/^\/label-templates$/, /^\/storefront-pages$/];
```

and add this test at the end of the `describe('app.ts v1 mounts', () => {` block:

```ts
  it('scopes a 1 MB JSON parser to storefront-pages ahead of the global parser', () => {
    const scoped = source.indexOf("app.use('/api/v1/storefront-pages', express.json({ limit: '1mb' }));");
    const global = source.indexOf('app.use(express.json({');
    expect(scoped).toBeGreaterThan(-1);
    expect(scoped).toBeLessThan(global);
  });
```

- [ ] **Step 11: Run the affected tests**

Run: `npx vitest run src/modules/storefront-pages src/app.mounts.test.ts src/lib/permissions.test.ts`
Expected: PASS, all green, including the mount assertion.

- [ ] **Step 12: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 13: Commit**

```bash
git add src/middleware/upload.ts src/modules/storefront-pages/controller.ts src/modules/storefront-pages/router.ts src/modules/storefront-pages/router.test.ts src/app.ts src/app.mounts.test.ts src/modules/public-storefront/router.ts src/config/modules.ts src/lib/permissions.test.ts
git commit -m "feat(storefront-pages): admin + public routes, media upload, storefront-pages permission domain"
```

---

### Task 7: API docs, backend docs, final gate

**Files:**
- Modify: `src/docs/generator.ts`, `src/docs/registry.ts`
- Modify: `STOREFRONT.md`, `docs/websocket-guide.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: the final routes from Task 6. Every OpenAPI `security` must match the router's actual middleware (`CLAUDE.md` rule): `bearerAuth` on admin routes, none on `GET /media/{key}` and the public route.
- Produces: documentation only.

- [ ] **Step 1: OpenAPI tag**

In `src/docs/generator.ts`, add this line directly after the `{ name: 'Storefront Deploy', … },` entry:

```ts
      { name: 'Storefront Pages', description: 'Page builder — draft, publish, version history and images for storefront page sets (admin)' },
```

- [ ] **Step 2: OpenAPI paths**

In `src/docs/registry.ts`, insert this block directly after the last `registry.registerPath({ method: 'get', path: '/api/v1/storefront-deploy/deploys/{id}'` line. That places it immediately before `// ---- FULFILLMENT ----`:

```ts
// ---- STOREFRONT PAGES (page builder) ----
const storefrontPageLayoutParam = z.object({ layout: z.enum(['storefront', 'menu', 'webapp']) });
const storefrontPageVersionParams = storefrontPageLayoutParam.extend({ version: z.number().int().positive() });
registry.registerPath({ method: 'get', path: '/api/v1/storefront-pages/{layout}/draft', tags: ['Storefront Pages'], summary: 'Current draft (or latest published set) for a layout', security: bearerAuth, request: { params: storefrontPageLayoutParam }, responses: { 200: { description: "{ layout, source: 'draft'|'published'|'none', data: PageSet|null, baseVersion, latestPublishedVersion, updatedAt: string|null }" }, 400: { description: 'Unknown layout' } } });
registry.registerPath({ method: 'put', path: '/api/v1/storefront-pages/{layout}/draft', tags: ['Storefront Pages'], summary: 'Autosave the draft', security: bearerAuth, description: 'Structural validation only (the storefront owns block types). *Html props are sanitised to a fixed tag allowlist; *Url/*href/*src props must be https:, mailto:, tel:, a /path or empty. Body limit 1 MB, page set ≤ 512 KB.', request: { params: storefrontPageLayoutParam, body: { content: { 'application/json': { schema: z.object({ data: z.object({ schemaVersion: z.literal(1), shell: z.object({}).passthrough(), pages: z.record(z.string(), z.object({}).passthrough()) }), baseVersion: z.number().int().min(0) }) } } } }, responses: { 200: { description: '{ baseVersion, updatedAt }' }, 400: { description: 'Validation failed ("path: message; …")' }, 409: { description: "error = 'PAGESET_CONFLICT' — someone published since baseVersion" } } });
registry.registerPath({ method: 'delete', path: '/api/v1/storefront-pages/{layout}/draft', tags: ['Storefront Pages'], summary: 'Discard the draft', security: bearerAuth, request: { params: storefrontPageLayoutParam }, responses: { 200: { description: '{ discarded: boolean }' } } });
registry.registerPath({ method: 'post', path: '/api/v1/storefront-pages/{layout}/publish', tags: ['Storefront Pages'], summary: 'Publish the draft as a new version', security: bearerAuth, description: 'Re-validates the draft, inserts version latest+1, re-bases the draft on it and keeps the newest 20 versions. Emits storefront-pages:published { layout, version } to role:admin.', request: { params: storefrontPageLayoutParam, body: { content: { 'application/json': { schema: z.object({ baseVersion: z.number().int().min(0) }) } } } }, responses: { 200: { description: '{ version, publishedAt }' }, 400: { description: "Validation failed, or error = 'NO_DRAFT'" }, 409: { description: "error = 'PAGESET_CONFLICT'" } } });
registry.registerPath({ method: 'get', path: '/api/v1/storefront-pages/{layout}/versions', tags: ['Storefront Pages'], summary: 'Published versions, newest first (max 20)', security: bearerAuth, request: { params: storefrontPageLayoutParam }, responses: { 200: { description: '[{ version, createdAt, createdBy: { id, name } | null }]' } } });
registry.registerPath({ method: 'get', path: '/api/v1/storefront-pages/{layout}/versions/{version}', tags: ['Storefront Pages'], summary: 'One published version', security: bearerAuth, request: { params: storefrontPageVersionParams }, responses: { 200: { description: '{ version, createdAt, data: PageSet }' }, 404: { description: 'Unknown version' } } });
registry.registerPath({ method: 'post', path: '/api/v1/storefront-pages/{layout}/versions/{version}/restore', tags: ['Storefront Pages'], summary: 'Restore a version as a NEW published version', security: bearerAuth, description: 'History is never rewritten. The draft is reset to the new version. Emits storefront-pages:published.', request: { params: storefrontPageVersionParams }, responses: { 200: { description: '{ version } — the new version' }, 400: { description: 'The old data fails current validation' }, 404: { description: 'Unknown version' } } });
registry.registerPath({ method: 'post', path: '/api/v1/storefront-pages/media', tags: ['Storefront Pages'], summary: 'Upload a page-builder image', security: bearerAuth, description: 'PNG/JPEG/WebP/GIF, max 5 MB, type verified by magic bytes. Stored in S3 as storefront-pages/<32 hex>.<ext>.', request: { body: { content: { 'multipart/form-data': { schema: z.object({ file: z.string().describe('Image file (PNG, JPEG, WebP, GIF — max 5 MB)') }) } } } }, responses: { 200: { description: "{ url: '/media/storefront-pages/media/<key>' } — a storefront-relative URL served through the Worker" }, 422: { description: 'Missing file, wrong field, wrong type, not an image, or over 5 MB' } } });
registry.registerPath({ method: 'get', path: '/api/v1/storefront-pages/media/{key}', tags: ['Storefront Pages'], summary: 'Serve a page-builder image (no auth)', request: { params: z.object({ key: z.string().regex(/^[a-f0-9]{32}\.(png|jpg|webp|gif)$/) }) }, responses: { 200: { description: 'Raw image, Cache-Control: public, max-age=31536000, immutable' }, 404: { description: 'Malformed key or no such image' } } });
registry.registerPath({ method: 'get', path: '/api/v1/public/storefront/pages/{layout}', tags: ['Storefront (public)'], summary: 'Latest published page set for a layout', description: 'Never returns a draft. Behind the storefront kill switch. Edge-cached 30 s by the storefront Worker.', request: { params: storefrontPageLayoutParam }, responses: { 200: { description: '{ version, data: PageSet } | null' }, 400: { description: 'Unknown layout' }, 503: { description: 'Storefront disabled' } } });
```

- [ ] **Step 3: Type-check the registry**

Run: `npx tsc --noEmit`
Expected: exits 0. The full `npm test` run happens in Step 7.

- [ ] **Step 4: `STOREFRONT.md`**

In the §3 endpoint table, add this row after the `| GET | /catalog/products/:id | session | yes | — |` row:

```markdown
| GET | `/pages/:layout` | none | yes | — |
```

Add a new subsection after the `### 3.10 Tracking` section, immediately before `## 4. WebSocket`:

````markdown
### 3.11 Page builder

#### `GET /public/storefront/pages/:layout`

No auth, behind the kill switch. `:layout` is `storefront`, `menu` or `webapp` (400 otherwise).
Returns the **latest published** page set for that layout — a draft is never reachable here:

```json
{ "version": 7, "data": { "schemaVersion": 1, "shell": { "root": { "props": { "title": "", "description": "", "chrome": "shell" } }, "content": [] }, "pages": {} } }
```

or `null` when nothing has been published (the storefront then renders its built-in default
documents). The storefront reaches it as `GET /api/storefront/pages/:layout` through its Worker,
edge-cached 30 s like `/settings`. The document format is owned by the storefront release
(`ecommerce-storefront/docs/builder.md`); the backend validates structure only (§6.2).
````

Add a new subsection after the `### 6.1 Deploy-from-admin` section, immediately before `## 7. Ops`:

````markdown
### 6.2 Page builder (`/api/v1/storefront-pages`)

Storage for the storefront's Puck page builder (spec `ecommerce-storefront/docs/superpowers/specs/2026-09-29-puck-page-builder-design.md`).
Table `storefront_page_sets` (migration `0045`): per layout one `draft` row and the newest 20
`published` rows. Admin JWT only (`authenticate` → `authorize('admin')`; permission domain
`storefront-pages`, granted by the Storefront module), except `GET /media/:key`.

| Method | Path | Body | `data` |
|---|---|---|---|
| GET | `/:layout/draft` | — | `{ layout, source: 'draft'\|'published'\|'none', data, baseVersion, latestPublishedVersion, updatedAt }` |
| PUT | `/:layout/draft` | `{ data: PageSet, baseVersion }` | `{ baseVersion, updatedAt }` |
| DELETE | `/:layout/draft` | — | `{ discarded }` |
| POST | `/:layout/publish` | `{ baseVersion }` | `{ version, publishedAt }` |
| GET | `/:layout/versions` | — | `[{ version, createdAt, createdBy: { id, name } \| null }]`, newest first |
| GET | `/:layout/versions/:version` | — | `{ version, createdAt, data }` |
| POST | `/:layout/versions/:version/restore` | — | `{ version }` (the new one) |
| POST | `/media` | multipart `file` | `{ url: '/media/storefront-pages/media/<key>' }` |
| GET | `/media/:key` | — | raw image, public, `max-age=31536000, immutable` |

**Versions.** The draft's `version` is the published version it is based on (0 if none). `PUT`
and `publish` answer **409 with `error === 'PAGESET_CONFLICT'`** when `baseVersion` is below the
latest published version — someone published since that editor loaded — and the editor must
reload. After its own publish/restore the editor's new `baseVersion` is the returned `version`.
Publish re-validates the draft, inserts `latest + 1`, re-bases the draft and prunes to 20;
restore copies an old version into a **new** version (history is never rewritten), re-validating
it against today's rules, and resets the draft to it. Publish with no draft is **400
`NO_DRAFT`**. All three take a per-layout `pg_advisory_xact_lock`, so concurrent publishes
serialise. Both publish and restore emit `storefront-pages:published` `{ layout, version }` to
`role:admin`.

**Validation (structural only — the backend never knows which blocks exist).** A 400 carries
the standard ZodError string (`"data.pages.catalog.content.0.type: Invalid component type; …"`).
Rules: `schemaVersion: 1`; page keys are the 16 fixed route keys or `page:[a-z0-9-]{1,60}` (≤ 50
per layout); component `type` `^[A-Z][A-Za-z0-9]{0,40}$`, `props.id` 1–64 chars; slot nesting ≤
12; ≤ 2 000 components per set; serialized set ≤ 512 KB (the route has its own 1 MB JSON body
limit); root `title` ≤ 120, `description` ≤ 300, `chrome` `shell`|`none` (the shell's must be
`shell`; missing root props default to `''`/`''`/`'shell'`); every string ≤ 20 000 chars; prop
nesting ≤ 64. **Slot detection:** any array element that is an object with a string `type` and
an object `props` is treated as a component and must satisfy the component rules — non-slot
array items must not carry both keys. **Richtext:** every string prop whose key ends in `Html`
(any depth) must be a string and is sanitised with DOMPurify to `p h2 h3 h4 strong em u s a ul
ol li blockquote br code`, `href` only (https/mailto/tel/`/path`), `rel="noopener noreferrer"`
forced on https links — the sanitised HTML is what is stored. **Links:** every string prop
whose key ends in `url`/`Url`/`URL`/`href`/`Href`/`src`/`Src` must be `https:`, `mailto:`,
`tel:`, a `/path` (not `//` or `/\`), or `''`.

**Media.** PNG/JPEG/WebP/GIF ≤ 5 MB, verified by magic bytes (the stored extension is the
sniffed type), S3 key `storefront-pages/<32 hex>.<ext>`. Upload errors are 422. The storefront
Worker proxies `/media/storefront-pages/media/<key>` to `GET /api/v1/storefront-pages/media/<key>`.
**Known limitation:** uploaded images are never garbage-collected — removing an image from a
page leaves its S3 object in place.
````

In `### 7.2 Processes & deploy order`, append this paragraph at the end of the section, before `### 7.3 Rate limits`:

```markdown
**Page builder (storefront v0.7.0):** deploy the backend first (migration `0045` applies on
startup), then redeploy storefronts to v0.7.0 from the admin, then the admin SPA. An older
storefront ignores `/pages/:layout`; a v0.7.0 storefront against an older backend gets a 404
there and renders its default pages.
```

- [ ] **Step 5: `docs/websocket-guide.md`**

Insert this section after the `### Storefront Deploy` section's closing code fence, immediately before `## Room Architecture`:

````markdown
### Storefront Pages

Sent only to the `role:admin` room.

| Event | Payload | When |
|---|---|---|
| `storefront-pages:published` | `{ layout, version }` | A page set was published or a version restored (`layout` is `storefront`, `menu` or `webapp`) |

```ts
socket.on("storefront-pages:published", (data) => {
  // data = { layout: "menu", version: 8 }
  // Invalidate GET /api/v1/storefront-pages/:layout/versions (and the draft
  // query — an editor still on an older baseVersion will now get 409).
});
```
````

In the `## Event Reference (Summary)` table, add this row after the `storefront-deploy:updated` row:

```markdown
| `storefront-pages:published` | `{ layout, version }` | `role:admin` |
```

- [ ] **Step 6: `CLAUDE.md`**

In `## Architecture` → `### Domain Logic`, add this bullet directly after the `- **Web app mode**:` bullet:

```markdown
- **Storefront page builder**: `storefront_page_sets` (migration `0045`) holds per layout (`storefront`/`menu`/`webapp`) one `draft` row and the newest 20 `published` rows; module `src/modules/storefront-pages/` (admin JWT, domain `storefront-pages` under the Storefront module). Validation is **structural only** (`schemas.ts` — the storefront release owns block types): route keys, component `type`/`props.id`, nesting ≤ 12, ≤ 2 000 components, ≤ 512 KB, any array element with string `type` + object `props` is a component; `*Html` props are DOMPurify-sanitised on write (`richtext.ts`) and `*Url`/`*href`/`*src` props go through `isAllowedLink` (https/mailto/tel/`/path`, never `//`). Publish/restore/draft-save serialise on a per-layout advisory lock (`store.ts`); a stale `baseVersion` is `409 PAGESET_CONFLICT` (the error string is the code), publish with no draft `400 NO_DRAFT`, and validation failures are **400** (controller-side `.parse()`, not `validate()`, because the cross-repo contract fixes 400). `storefront-pages:published { layout, version }` → `role:admin`. Public read `GET /public/storefront/pages/:layout` (latest published only, kill-switched) lives in a sub-router mounted by `public-storefront/router.ts`. Images: `POST /storefront-pages/media` (magic-byte sniffed, `storefront-pages/<32hex>.<ext>` in S3), served publicly at `GET /storefront-pages/media/:key` and via the storefront Worker at `/media/storefront-pages/media/<key>`; never garbage-collected. The route has a scoped 1 MB JSON parser in `app.ts`. Contract: `STOREFRONT.md` §3.11 / §6.2.
```

- [ ] **Step 7: Full gate**

Run: `npm test`
Expected: all test files pass. The count is the 149-file baseline plus the six new storefront-pages test files, so **155 files**, with 0 failures. Any failure outside `src/modules/storefront-pages/`, `src/app.mounts.test.ts` or `src/lib/permissions.test.ts` is a regression this plan introduced: fix it, do not skip it.

Run: `npm run build`
Expected: `tsc` exits 0.

Run: `git status --short`
Expected: only the files named in this plan's tasks are modified or new. There must be no `dist/`, no `.env` and no stray scripts.

- [ ] **Step 8: Commit**

```bash
git add src/docs/generator.ts src/docs/registry.ts STOREFRONT.md docs/websocket-guide.md CLAUDE.md
git commit -m "docs(storefront-pages): OpenAPI, STOREFRONT.md §3.11/§6.2, websocket event, CLAUDE.md"
```

- [ ] **Step 9: Pending manual verification (do not perform; record in the hand-off)**

Nothing in this plan ran against a real Postgres, S3 bucket or deployed storefront. Once a disposable local database exists, and **never** the `.env` database, someone must check these:

- migration `0045` applies
- two concurrent `POST …/publish` calls produce versions N+1 and a 409
- a 21st publish prunes version 1
- an upload lands in S3 and is served through the storefront Worker's `/media/storefront-pages/media/<key>`

These are listed as a pending step, not claimed as done.
