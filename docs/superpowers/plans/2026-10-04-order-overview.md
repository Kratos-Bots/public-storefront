# Order Overview Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/account/orders/:ref` becomes the shop's only order page: a professional order overview where an unpaid order is paid or cancelled through the customer's session, and the key-based `/order/:ref/:key` page leaves the storefront.

**Architecture:** The backend gains session-authenticated mirrors of the four key-based payment routes by extracting the work that follows the key check into functions that take an order row. The storefront's pay components switch from `reference + accessKey` to the reference alone, the link page and its builder family are deleted (the URL survives as a redirect), and the `OrderDetail` container is redesigned around one "Payment needed" card with a two-column layout on desktop.

**Tech Stack:** Backend: Express 5, Drizzle, Zod 4, Vitest. Storefront: React 19, Vite, Mantine 8, TanStack Query, react-router 7, Puck-based page builder, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-order-overview-design.md` (this repo). Read it before any task.

## Worktrees and commands

- Storefront: `T:\Projects\ecommerce\.worktrees\order-overview\ecommerce-storefront`, branch `feature/order-overview`. Run `npm ci` and `npm --prefix web ci` once before the first storefront task.
- Backend: create with `git -C T:/Projects/ecommerce/ecommerce-backend worktree add -b feature/order-overview T:/Projects/ecommerce/.worktrees/order-overview/ecommerce-backend main`, then `npm ci` there.
- Backend tests: `npx vitest run <path>`; whole suite `npm test`; types `npx tsc --noEmit` (this skips `*.test.ts`, so always run the tests too).
- Storefront tests: `npm --prefix web test -- test/<file>`; whole suite `TZ=UTC npm test` from the repo root; types and build `npm run build`.
- Never run Docker. Never `git add -A` or `git add .`: stage by path. Never push. Never create gateway payments or shipping-provider resources against the dev database.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Global Constraints

- The backend's key-based order API (`src/modules/public-orders/` routes), `buildOrderPublicUrl`, order emails, `resolveReturnUrls` and `ORDER_ACCESS_SECRET` behave exactly as before. `ecommerce-menu` is live on them.
- Backend response changes are additive only: `publicUrl`, `accessKey` and `servicePoint` stay on existing responses.
- Session order routes use `requireStorefrontEnabled` + `authenticateStorefrontCustomer` and never `requireStorefrontAccess`.
- Ownership failures are `NotFoundError('Order')`: an unknown reference and someone else's reference are the same 404.
- Backend imports are extensionless. Storefront imports use `@/…` with `.ts`/`.tsx` extensions.
- No existing builder part is renamed. `OrderHeading` and `OrderItems` stay the only required `OrderDetail` parts.
- Every customer-visible string is a text key in `web/src/text/keys/*.ts` with a note in `web/src/text/notes/*.ts`; no literal copy in components.
- Cards and buttons carry the existing `data-sf-part="card"` / `data-sf-part="button"` hooks and read `--sf-*` tokens. No template gets order-specific CSS unless Task 12's browser check shows a need.
- Mobile first: base styles are the 390 px layout; the two-column layout starts at `62em`.
- Deploy order: backend first, then storefront. No migration. No admin SPA change.

## Review Focus

1. **A signed-in customer opens another customer's reference on any new pay route.** Expected: the same 404 as an unknown reference, and no payment is created or switched. Test in Task 2.
2. **The payment state fails to load (503, network) while money is owed.** Expected: the payment card says it could not load and offers Try again; it never shows a bare figure and never hides Cancel. Test in Task 10.
3. **An old emailed link `/order/REF/KEY` opened signed out.** Expected: sign-in, then `/account/orders/REF`; a reference with characters needing encoding survives the round trip. Test in Task 7.
4. **A shop's stored `account.order` page still places `OrderPageLink`, or its page set still has an `order-status` page.** Expected: the order page renders without the removed part; nothing throws. Test in Task 7.
5. **Double tap on "Yes, cancel order", or Escape / click-outside while the request runs.** Expected: one request, the modal stays until it settles. Test in Task 9.

---

## Part A: Backend

### Task 1: Order-row functions in the public order service

**Files:**
- Modify: `src/modules/public-orders/service.ts`
- Test: `src/modules/public-orders/order-row-functions.test.ts` (create)

**Interfaces:**
- Produces (all exported from `src/modules/public-orders/service.ts`):
  - `type OrderRow = typeof orders.$inferSelect`
  - `projectPublicOrder(order: OrderRow): Promise<PublicOrderView>` where `PublicOrderView = Awaited<ReturnType<typeof getPublicOrder>>`
  - `paymentOptionsForOrder(order: OrderRow)`: same return as `getPublicOrderPaymentOptions`
  - `selectPaymentMethodForOrder(order: OrderRow, input: PublicPaymentMethodInput)`: same return as `selectPublicPaymentMethod`
  - `submitCryptoTxidForOrder(order: OrderRow, paymentId: number, txid: string)`: same return as `submitPublicCryptoTxid`
- The four key-based exports keep their names, signatures and behaviour.

- [ ] **Step 1: Write the failing test**

A source-shape test, the style this module's neighbours use (`public-storefront/order-view-cancel.test.ts`), because the behaviour is already pinned by `payment-names.integration.test.ts` and `orders/cancellation.integration.test.ts`.

```ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(__dirname, 'service.ts'), 'utf8');
// Slices from an exported function to the next export, so an unexported helper declared in between is counted
// as part of the function above it. If this fails after moving a helper, look at where the helper sits first.
const body = (name: string) => {
  const start = src.indexOf(`export async function ${name}(`);
  if (start < 0) throw new Error(`${name} is not exported`);
  const next = src.indexOf('\nexport ', start + 1);
  return src.slice(start, next < 0 ? undefined : next);
};

describe('public order service: key check and work are separate', () => {
  it.each(['projectPublicOrder', 'paymentOptionsForOrder', 'selectPaymentMethodForOrder', 'submitCryptoTxidForOrder'])(
    '%s takes an order row and never looks at the access key or the secret',
    (name) => {
      const fn = body(name);
      expect(fn).not.toMatch(/accessKey|ORDER_ACCESS_SECRET|verifyOrderAccessKey|loadOrderByAccessKey/);
    },
  );

  it('the key-based entry points check the key and delegate', () => {
    expect(body('getPublicOrder')).toMatch(/loadOrderByAccessKey\(reference, accessKey\)[\s\S]*projectPublicOrder\(/);
    expect(body('getPublicOrderPaymentOptions')).toMatch(/loadOrderByAccessKey\(reference, accessKey\)[\s\S]*paymentOptionsForOrder\(/);
    expect(body('selectPublicPaymentMethod')).toMatch(/loadOrderByAccessKey\(reference, accessKey\)[\s\S]*selectPaymentMethodForOrder\(/);
    expect(body('submitPublicCryptoTxid')).toMatch(/loadOrderByAccessKey\(reference, accessKey\)[\s\S]*submitCryptoTxidForOrder\(/);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/modules/public-orders/order-row-functions.test.ts`
Expected: FAIL, `projectPublicOrder is not exported`.

- [ ] **Step 3: Refactor `service.ts`**

Move `loadOrderByAccessKey` above `getPublicOrder` (unchanged body). Then:

```ts
export type OrderRow = typeof orders.$inferSelect;

export async function getPublicOrder(reference: string, accessKey: string) {
  const order = await loadOrderByAccessKey(reference, accessKey);
  return projectPublicOrder(order);
}

/** The customer-facing projection of one order. The caller has already proved the customer may see it. */
export async function projectPublicOrder(order: OrderRow) {
  // …the current body of getPublicOrder from `const [items, orderShipments, shippingAddress, settings] = …`
  // to the final `return { … }`, unchanged.
}

export async function getPublicOrderPaymentOptions(reference: string, accessKey: string) {
  const order = await loadOrderByAccessKey(reference, accessKey);
  return paymentOptionsForOrder(order);
}

/** `[]` once the order can no longer be paid: not pending, or it already has a completed payment. */
export async function paymentOptionsForOrder(order: OrderRow) {
  if (order.status !== 'pending') return [];
  const completed = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.orderId, order.id), eq(payments.status, 'completed')))
    .limit(1);
  if (completed.length > 0) return [];
  return offeredMethodsFor(order);
}

export async function submitPublicCryptoTxid(reference: string, accessKey: string, paymentId: number, txid: string) {
  const order = await loadOrderByAccessKey(reference, accessKey);
  return submitCryptoTxidForOrder(order, paymentId, txid);
}

export async function submitCryptoTxidForOrder(order: OrderRow, paymentId: number, txid: string) {
  const result = await submitCryptoTxid({ paymentId, orderId: order.id, rawTxid: txid, submittedBy: 'customer' });
  return { verificationStatus: result.outcome === 'confirmed' ? 'confirmed' : result.outcome === 'checking' ? 'checking' : 'needs_review' };
}

export async function selectPublicPaymentMethod(reference: string, accessKey: string, input: PublicPaymentMethodInput) {
  const order = await loadOrderByAccessKey(reference, accessKey);
  return selectPaymentMethodForOrder(order, input);
}

export async function selectPaymentMethodForOrder(order: OrderRow, input: PublicPaymentMethodInput) {
  // …the current body of selectPublicPaymentMethod after its first line, unchanged.
}
```

Add `and` to the `drizzle-orm` import. `paymentOptionsForOrder` keeps the old rule (`canPay` is `status === 'pending'` and no completed payment) without building the whole view. Keep every existing comment that still describes the code it sits on; reword the two doc comments that say "Reuses `getPublicOrder` for the reference/access-key resolution".

- [ ] **Step 4: Verify**

Run: `npx vitest run src/modules/public-orders src/modules/public-storefront src/modules/orders` and `npx tsc --noEmit`
Expected: PASS, no type errors. (`*.integration.test.ts` suites skip unless PGlite is installed; run `npm install --no-save @electric-sql/pglite` first and confirm `payment-names.integration.test.ts` and `cancellation.integration.test.ts` pass, since they exercise the code that moved.)

- [ ] **Step 5: Commit**

```bash
git add src/modules/public-orders/service.ts src/modules/public-orders/order-row-functions.test.ts
git commit -m "refactor(public-orders): the work after the key check takes an order row"
```

### Task 2: Session payment routes

**Files:**
- Modify: `src/modules/public-storefront/account.ts`, `controller.ts`, `router.ts`
- Test: `src/modules/public-storefront/order-pay-routes.test.ts` (create), `src/modules/public-storefront/order-pay-ownership.test.ts` (create)
- Extend: `src/modules/public-orders/payment-names.integration.test.ts`

**Interfaces:**
- Consumes: Task 1's four functions and `OrderRow`.
- Produces, in `account.ts`:
  - `getStorefrontOrderPayment(customerId: number, reference: string)` → `projectPublicOrder` result
  - `getStorefrontOrderPaymentOptions(customerId: number, reference: string)`
  - `selectStorefrontOrderPaymentMethod(customerId: number, reference: string, input: PublicPaymentMethodInput)`
  - `submitStorefrontOrderCryptoTxid(customerId: number, reference: string, paymentId: number, txid: string)`
- Routes (all under `/api/v1/public/storefront`): `GET /orders/:reference/payment` (120 / 15 min), `GET /orders/:reference/payment-options` (30), `POST /orders/:reference/payment-method` (30), `POST /orders/:reference/crypto-txid` (30). Response bodies are identical to the key-based routes'.

- [ ] **Step 1: Write the failing ownership test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  row: null as null | { id: number; customerId: number | null; reference: string },
  project: vi.fn(async () => ({ projected: true })),
  options: vi.fn(async () => []),
  select: vi.fn(async () => ({ paymentId: 1 })),
  txid: vi.fn(async () => ({ verificationStatus: 'checking' })),
}));

vi.mock('../../db/client', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => (h.row ? [h.row] : []) }) }) }) },
}));
vi.mock('../public-orders/service', () => ({
  projectPublicOrder: h.project,
  paymentOptionsForOrder: h.options,
  selectPaymentMethodForOrder: h.select,
  submitCryptoTxidForOrder: h.txid,
  projectOrderShipments: vi.fn(),
}));

import {
  getStorefrontOrderPayment,
  getStorefrontOrderPaymentOptions,
  selectStorefrontOrderPaymentMethod,
  submitStorefrontOrderCryptoTxid,
} from './account';

const calls = [
  ['payment', () => getStorefrontOrderPayment(7, 'ABC123'), h.project],
  ['payment-options', () => getStorefrontOrderPaymentOptions(7, 'ABC123'), h.options],
  ['payment-method', () => selectStorefrontOrderPaymentMethod(7, 'ABC123', { method: 'stripe' }), h.select],
  ['crypto-txid', () => submitStorefrontOrderCryptoTxid(7, 'ABC123', 5, 'a'.repeat(64)), h.txid],
] as const;

beforeEach(() => { for (const fn of [h.project, h.options, h.select, h.txid]) fn.mockClear(); });

describe.each(calls)('session %s', (_name, run, worker) => {
  it('an unknown reference is a 404 and does no work', async () => {
    h.row = null;
    await expect(run()).rejects.toMatchObject({ statusCode: 404 });
    expect(worker).not.toHaveBeenCalled();
  });

  it("another customer's order is the same 404 and does no work", async () => {
    h.row = { id: 1, customerId: 8, reference: 'ABC123' };
    await expect(run()).rejects.toMatchObject({ statusCode: 404 });
    expect(worker).not.toHaveBeenCalled();
  });

  it('a guest order with no customer is a 404', async () => {
    h.row = { id: 1, customerId: null, reference: 'ABC123' };
    await expect(run()).rejects.toMatchObject({ statusCode: 404 });
  });

  it("the customer's own order reaches the shared function with the order row", async () => {
    h.row = { id: 1, customerId: 7, reference: 'ABC123' };
    await run();
    expect(worker).toHaveBeenCalledOnce();
    expect(worker.mock.calls[0]![0]).toBe(h.row);
  });
});
```

`account.ts` imports many modules; if the import fails on something unmocked, add `vi.mock` stubs for exactly those modules (the pattern in `sessions.test.ts`). Check the property name `statusCode` against `src/utils/errors.ts` and use whatever `AppError` exposes.

- [ ] **Step 2: Write the failing route-chain test**

Copy the harness of `customer-cancel-routes.test.ts` (hoisted spy controller, mocked `db`, real router, real `requireStorefrontEnabled`, `authenticateStorefrontCustomer`, `validate`, error handler, the `rateLimit` mock that exposes `opts`). Generalise its `handlers(router, path)` to take the HTTP method. Then:

```ts
const W = 15 * 60 * 1000;
const ROUTES = [
  ['get', '/orders/:reference/payment', 120, 'getOrderPayment', false],
  ['get', '/orders/:reference/payment-options', 30, 'getOrderPaymentOptions', false],
  ['post', '/orders/:reference/payment-method', 30, 'selectOrderPaymentMethod', true],
  ['post', '/orders/:reference/crypto-txid', 30, 'submitOrderCryptoTxid', true],
] as const;

describe.each(ROUTES)('%s /public/storefront%s', (method, path, max, handler) => {
  const url = () => `${origin}/public/storefront${path.replace(':reference', 'ABC123')}`;

  it('runs the kill switch, the customer session, the limiter, then validation; never the shop-access gate', () => {
    const c = handlers(publicStorefrontRouter, method, path);
    expect(c[0]).toBe(requireStorefrontEnabled);
    expect(c[1]).toBe(authenticateStorefrontCustomer);
    expect((c[2] as RequestHandler & { opts: unknown }).opts).toEqual({ windowMs: W, max });
    expect(c).toHaveLength(5);
    expect(c).not.toContain(requireStorefrontAccess);
  });

  it('answers 401 without a session and never reaches the controller', async () => {
    const res = await fetch(url(), { method: method.toUpperCase() });
    expect(res.status).toBe(401);
    expect(controller[handler]).not.toHaveBeenCalled();
  });

  it('answers 503 when the storefront is off, before the session check', async () => {
    settings.enabled = false;
    const res = await fetch(url(), { method: method.toUpperCase() });
    expect(res.status).toBe(503);
  });
});

it('the by-reference order read still resolves: /orders/unpaid is declared before /orders/:reference', () => {
  const paths = (publicStorefrontRouter as unknown as { stack: Layer[] }).stack.map((l) => l.route?.path).filter(Boolean);
  expect(paths.indexOf('/orders/unpaid')).toBeLessThan(paths.indexOf('/orders/:reference'));
});
```

Import `requireStorefrontAccess` from `../../middleware/shop-access`.

- [ ] **Step 3: Run both and see them fail**

Run: `npx vitest run src/modules/public-storefront/order-pay-routes.test.ts src/modules/public-storefront/order-pay-ownership.test.ts`
Expected: FAIL (functions and routes do not exist).

- [ ] **Step 4: Implement**

`account.ts`, beside `cancelStorefrontOrder`:

```ts
/** The customer's own order row, or the same 404 an unknown reference gets. Never a 403: that would confirm the reference exists. */
async function loadOwnedOrder(customerId: number, reference: string) {
  const order = (await db.select().from(orders).where(eq(orders.reference, reference)).limit(1))[0];
  if (!order || order.customerId !== customerId) throw new NotFoundError('Order');
  return order;
}

/** Payment state of the customer's own order, in the public order view's shape, so the storefront's pay components read one type. */
export async function getStorefrontOrderPayment(customerId: number, reference: string) {
  return projectPublicOrder(await loadOwnedOrder(customerId, reference));
}

export async function getStorefrontOrderPaymentOptions(customerId: number, reference: string) {
  return paymentOptionsForOrder(await loadOwnedOrder(customerId, reference));
}

export async function selectStorefrontOrderPaymentMethod(customerId: number, reference: string, input: PublicPaymentMethodInput) {
  return selectPaymentMethodForOrder(await loadOwnedOrder(customerId, reference), input);
}

export async function submitStorefrontOrderCryptoTxid(customerId: number, reference: string, paymentId: number, txid: string) {
  return submitCryptoTxidForOrder(await loadOwnedOrder(customerId, reference), paymentId, txid);
}
```

Import the four functions from `../public-orders/service` (the file already imports `projectOrderShipments` from there) and `type PublicPaymentMethodInput` from `../public-orders/schemas`.

`controller.ts`, in the Orders section:

```ts
export async function getOrderPayment(req: Request, res: Response) {
  sendSuccess(res, await storefrontAccount.getStorefrontOrderPayment(req.storefrontCustomer!.id, req.params.reference as string));
}

export async function getOrderPaymentOptions(req: Request, res: Response) {
  sendSuccess(res, await storefrontAccount.getStorefrontOrderPaymentOptions(req.storefrontCustomer!.id, req.params.reference as string));
}

export async function selectOrderPaymentMethod(req: Request, res: Response) {
  sendSuccess(res, await storefrontAccount.selectStorefrontOrderPaymentMethod(req.storefrontCustomer!.id, req.params.reference as string, req.body));
}

export async function submitOrderCryptoTxid(req: Request, res: Response) {
  const { paymentId, txid } = req.body as { paymentId: number; txid: string };
  sendSuccess(res, await storefrontAccount.submitStorefrontOrderCryptoTxid(req.storefrontCustomer!.id, req.params.reference as string, paymentId, txid));
}
```

`router.ts`, after the cancel route; import `publicCryptoTxidSchema, publicPaymentMethodSchema` from `../public-orders/schemas`:

```ts
// Paying an order through the session: the same work as /public/orders/:reference/:accessKey/*, authorised by
// ownership instead of the key, so it works with ORDER_ACCESS_SECRET unset. Not behind requireStorefrontAccess:
// a customer the shop has since refused must still be able to pay an order already placed.
const ORDER_PAY_LIMIT = { windowMs: 15 * 60 * 1000, max: 30 };
publicStorefrontRouter.get(
  '/orders/:reference/payment',
  requireStorefrontEnabled,
  authenticateStorefrontCustomer,
  // Polled by the order page while a payment is open.
  rateLimit({ windowMs: 15 * 60 * 1000, max: 120 }),
  validate({ params: orderReferenceParamSchema }),
  publicStorefrontController.getOrderPayment,
);
publicStorefrontRouter.get(
  '/orders/:reference/payment-options',
  requireStorefrontEnabled,
  authenticateStorefrontCustomer,
  rateLimit(ORDER_PAY_LIMIT),
  validate({ params: orderReferenceParamSchema }),
  publicStorefrontController.getOrderPaymentOptions,
);
publicStorefrontRouter.post(
  '/orders/:reference/payment-method',
  requireStorefrontEnabled,
  authenticateStorefrontCustomer,
  rateLimit(ORDER_PAY_LIMIT),
  validate({ params: orderReferenceParamSchema, body: publicPaymentMethodSchema }),
  publicStorefrontController.selectOrderPaymentMethod,
);
publicStorefrontRouter.post(
  '/orders/:reference/crypto-txid',
  requireStorefrontEnabled,
  authenticateStorefrontCustomer,
  rateLimit(ORDER_PAY_LIMIT),
  validate({ params: orderReferenceParamSchema, body: publicCryptoTxidSchema }),
  publicStorefrontController.submitOrderCryptoTxid,
);
```

Each `rateLimit(...)` call owns its own in-memory `Map` (`src/middleware/rate-limit.ts`), so the four routes above have four separate budgets and the polled read cannot drain the action routes'. Keep it that way: call `rateLimit(...)` once per route as written, never share one instance between routes. Add to the route-chain test: the limiter handles of the four routes are four different function objects.

- [ ] **Step 5: Extend the integration suite**

In `payment-names.integration.test.ts`, add a `describe('through the customer session')` that, on the fixtures the file already builds, calls `getStorefrontOrderPayment`, `getStorefrontOrderPaymentOptions` and `selectStorefrontOrderPaymentMethod` with the order's `customerId` and asserts: the payment view equals `getPublicOrder`'s for the same order; options equal the key-based options; selecting a method not offered is a `ValidationError`; a different `customerId` is a `NotFoundError`. Unset `process.env.ORDER_ACCESS_SECRET` for this block (the file sets it near line 126) to prove the session path needs no secret, and restore it after.

- [ ] **Step 6: Verify**

Run: `npx vitest run src/modules/public-storefront src/modules/public-orders` and `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/public-storefront/account.ts src/modules/public-storefront/controller.ts src/modules/public-storefront/router.ts src/modules/public-storefront/order-pay-routes.test.ts src/modules/public-storefront/order-pay-ownership.test.ts src/modules/public-orders/payment-names.integration.test.ts
git commit -m "feat(storefront): a signed-in customer pays their order through the session"
```

### Task 3: Delivery address on the order detail, and docs

**Files:**
- Modify: `src/modules/public-storefront/account.ts`, `src/modules/public-storefront/order-view-service-point.test.ts`, `src/docs/registry.ts`, `STOREFRONT.md`, `CLAUDE.md`
- Modify: `src/modules/public-orders/service.ts` (export the address projection)

**Interfaces:**
- Produces: `projectShippingAddress(row: typeof shippingAddresses.$inferSelect | null)` exported from `src/modules/public-orders/service.ts`, returning `{ firstName, surname, addressLine1, addressLine2, addressLine3, city, county, zip, country, servicePoint } | null`.
- `StorefrontOrderDetail.shippingAddress: ReturnType<typeof projectShippingAddress>`.

- [ ] **Step 1: Write the failing test** (append to `order-view-service-point.test.ts`, matching its source-reading style)

```ts
it('the storefront order detail returns the delivery address through the shared projection', () => {
  expect(account).toMatch(/shippingAddress: projectShippingAddress\(shippingAddress\)/);
  expect(publicOrders).toMatch(/shippingAddress: projectShippingAddress\(shippingAddress\)/);
});

it('the shared address projection never returns the raw service point columns', () => {
  const start = publicOrders.indexOf('export function projectShippingAddress(');
  const fn = publicOrders.slice(start, publicOrders.indexOf('\n}\n', start));
  expect(fn).not.toMatch(/servicePointId|servicePointCarrier|servicePointName/);
  expect(fn).toMatch(/servicePoint: projectServicePoint\(/);
});
```

Use the variable names the file already has for the two sources.

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/modules/public-storefront/order-view-service-point.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

In `public-orders/service.ts`, extract the inline object:

```ts
/** A delivery address as customers see it: no ids, and the collection point only as its name and carrier. */
export function projectShippingAddress(row: typeof shippingAddresses.$inferSelect | null) {
  if (!row) return null;
  return {
    firstName: row.firstName,
    surname: row.surname,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    addressLine3: row.addressLine3,
    city: row.city,
    county: row.county,
    zip: row.zip,
    country: row.country,
    servicePoint: projectServicePoint(row),
  };
}
```

and use `shippingAddress: projectShippingAddress(shippingAddress),` in `projectPublicOrder`. In `account.ts` add to the interface:

```ts
  /** Where the order is going, or null when it has no address. For a collection order these lines are the point's own address. */
  shippingAddress: ReturnType<typeof projectShippingAddress>;
```

and `shippingAddress: projectShippingAddress(shippingAddress),` in the returned object, next to `servicePoint`.

- [ ] **Step 4: Docs**

- `src/docs/registry.ts`: register the four routes of Task 2 next to the existing `/public/storefront/orders/{reference}/cancel` entry, with `security` matching the real middleware (storefront customer session), and add `shippingAddress` to the order detail schema.
- `STOREFRONT.md`: in the orders section, document the four routes, their limits, that their bodies equal the key-based routes', and the new `shippingAddress` field. State that `accessKey` and `publicUrl` are still returned and that storefront v0.18.0 and later ignore them.
- `CLAUDE.md` (backend), Orders bullet: one sentence naming the four session routes and that they share `public-orders/service.ts`'s order-row functions.

- [ ] **Step 5: Verify and commit**

Run: `npm test` and `npx tsc --noEmit` — Expected: PASS.

```bash
git add src/modules/public-storefront/account.ts src/modules/public-orders/service.ts src/modules/public-storefront/order-view-service-point.test.ts src/docs/registry.ts STOREFRONT.md CLAUDE.md
git commit -m "feat(storefront): the order detail carries the delivery address; docs for the session pay routes"
```

---

## Part B: Storefront

Paths below are relative to the storefront worktree root. Tests live in `web/test/`.

### Task 4: Session order-payment API client

**Files:**
- Modify: `web/src/api/orders.ts`, `web/src/types/orders.ts`
- Test: `web/test/api-orders.test.ts` (extend)

**Interfaces:**
- Produces, from `@/api/orders.ts`:
  - `class PaymentConflictError`, `class OrderNotCancellableError`, `asCancelError(err): never`, `type PaymentSelection` (moved here; `@/api/public-order.ts` re-exports them until Task 8 deletes it)
  - `class OrderGoneError extends Error` (404 on a pay route)
  - `fetchOrderPayment(reference: string): Promise<PublicOrder>`
  - `fetchOrderPaymentOptions(reference: string): Promise<PaymentMethod[]>`
  - `selectOrderPaymentMethod(reference: string, selection: PaymentSelection): Promise<SelectPaymentResult>`
  - `submitOrderCryptoTxid(reference: string, paymentId: number, txid: string): Promise<CryptoTxidVerification>`
- `OrderDetail.shippingAddress?: ShippingAddress | null` (type from `@/types/public-order.ts`).

- [ ] **Step 1: Write the failing tests**

Follow the mocking style already in `api-orders.test.ts` (it stubs `@/api/client.ts`). Cases:

```ts
describe('order payment through the session', () => {
  it('reads the payment view from storefront/orders/:ref/payment, encoding the reference', async () => {
    get.mockReturnValue(ok({ reference: 'A/1' }));
    await fetchOrderPayment('A/1');
    expect(get).toHaveBeenCalledWith('storefront/orders/A%2F1/payment');
  });

  it('reads payment options', async () => {
    get.mockReturnValue(ok([]));
    expect(await fetchOrderPaymentOptions('K4M2QP')).toEqual([]);
    expect(get).toHaveBeenCalledWith('storefront/orders/K4M2QP/payment-options');
  });

  it('posts a selection, and a 409 becomes PaymentConflictError', async () => {
    post.mockReturnValue(fail(new ApiError('This order is no longer awaiting payment', 409)));
    await expect(selectOrderPaymentMethod('K4M2QP', { method: 'stripe' })).rejects.toBeInstanceOf(PaymentConflictError);
    expect(post).toHaveBeenCalledWith('storefront/orders/K4M2QP/payment-method', { json: { method: 'stripe' } });
  });

  it('a 422 on selection keeps the backend message for the customer', async () => {
    post.mockReturnValue(fail(new ApiError('That payment method is not available for this order', 422)));
    await expect(selectOrderPaymentMethod('K4M2QP', { method: 'x' })).rejects.toMatchObject({ status: 422, message: 'That payment method is not available for this order' });
  });

  it('a 404 on any pay route is OrderGoneError', async () => {
    get.mockReturnValue(fail(new ApiError('Order not found', 404)));
    await expect(fetchOrderPayment('K4M2QP')).rejects.toBeInstanceOf(OrderGoneError);
  });

  it('a 503 stays an ApiError so the page can offer a retry', async () => {
    get.mockReturnValue(fail(new ApiError('STOREFRONT_DISABLED', 503)));
    await expect(fetchOrderPayment('K4M2QP')).rejects.toMatchObject({ status: 503 });
  });

  it('submits a trimmed txid and maps unknown statuses to checking', async () => {
    post.mockReturnValue(ok({ verificationStatus: 'something-new' }));
    expect(await submitOrderCryptoTxid('K4M2QP', 9, '  abc1234567  ')).toBe('checking');
    expect(post).toHaveBeenCalledWith('storefront/orders/K4M2QP/crypto-txid', { json: { paymentId: 9, txid: 'abc1234567' } });
  });
});
```

Adapt `ok` / `fail` / `get` / `post` to the helpers the file already defines; add them if it has none.

- [ ] **Step 2: Run and see them fail**

Run: `npm --prefix web test -- test/api-orders.test.ts` — Expected: FAIL (not exported).

- [ ] **Step 3: Implement in `web/src/api/orders.ts`**

Move `PaymentConflictError`, `OrderNotCancellableError`, `CANCEL_REASONS`, `asCancelError` and `PaymentSelection` here verbatim from `public-order.ts`; in `public-order.ts` replace them with `export { PaymentConflictError, OrderNotCancellableError, asCancelError, type PaymentSelection } from '@/api/orders.ts';` and drop its now-circular import. Then add:

```ts
/** A pay route answered 404: the order is not this customer's, or no longer exists. */
export class OrderGoneError extends Error {
  constructor() {
    super('Order not found');
    this.name = 'OrderGoneError';
  }
}

const orderBase = (reference: string) => `storefront/orders/${encodeURIComponent(reference)}`;

/** 404 alone: a 422 on the action routes is the backend's own customer-written message about the method or the txid. */
function asGone(err: unknown): never {
  if (err instanceof ApiError && err.status === 404) throw new OrderGoneError();
  throw err;
}

/** What is owed on the order and how it stands: `payment.canPay`, the active payment, crypto payments, the address. */
export const fetchOrderPayment = (reference: string) =>
  unwrap<PublicOrder>(api.get(`${orderBase(reference)}/payment`)).catch(asGone);

/** The methods this order can be paid with right now; `[]` once it can no longer be paid. */
export const fetchOrderPaymentOptions = (reference: string) =>
  unwrap<PaymentMethod[]>(api.get(`${orderBase(reference)}/payment-options`)).catch(asGone);

/** Create the order's first payment or switch a pending one. A 409 means the order moved on: the caller refetches. */
export const selectOrderPaymentMethod = (reference: string, selection: PaymentSelection) =>
  unwrap<SelectPaymentResult>(api.post(`${orderBase(reference)}/payment-method`, { json: selection })).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 409) throw new PaymentConflictError();
    return asGone(err);
  });

/** Submit the transaction id of a static-crypto payment. A rejected id carries a customer-written message. */
export async function submitOrderCryptoTxid(reference: string, paymentId: number, txid: string): Promise<CryptoTxidVerification> {
  const data = await unwrap<{ verificationStatus?: string }>(
    api.post(`${orderBase(reference)}/crypto-txid`, { json: { paymentId, txid: txid.trim() } }),
  ).catch(asGone);
  return data.verificationStatus === 'confirmed' || data.verificationStatus === 'needs_review' ? data.verificationStatus : 'checking';
}
```

In `web/src/types/orders.ts` add `shippingAddress?: import('./public-order.ts').ShippingAddress | null;` to `OrderDetail`.

- [ ] **Step 4: Verify and commit**

Run: `npm --prefix web test -- test/api-orders.test.ts test/cancel-order.test.tsx` and `npm run build` — Expected: PASS.

```bash
git add web/src/api/orders.ts web/src/api/public-order.ts web/src/types/orders.ts web/test/api-orders.test.ts
git commit -m "feat(api): order payment routes through the customer session"
```

### Task 5: The pop-up: signed-in only, one button, back on every page load

**Files:**
- Modify: `web/src/features/unpaid-prompt/rules.ts`, `useUnpaidOrder.ts`, `UnpaidOrderPrompt.tsx`, `UnpaidOrderDialog.tsx`, `UnpaidOrderPrompt.module.css`, `web/src/text/keys/order.ts`, `web/src/text/notes/order.ts`
- Test: `web/test/unpaid-prompt-rules.test.ts`, `web/test/unpaid-order-prompt.test.tsx`, `web/test/unpaid-prompt-chunk-failure.test.tsx`

**Interfaces:**
- Produces:
  - `PromptOrder = { reference: string; amount: number; reviewPath: string }`
  - `fromUnpaid(order: UnpaidOrder): PromptOrder`
  - `dismissForThisLoad(): void`, `isDismissed(): boolean`, `resetDismissalForTests(): void` from `useUnpaidOrder.ts`
  - `UnpaidOrderDialogProps = { order: PromptOrder; more: boolean; onLater: () => void; onReview: () => void }`
- Removed: `guestCandidates`, `isTerminalStatus`, `fromPublic`, `snooze`, `isSnoozed`, `PromptOrder.payPath / viaLink / accessKey / canCancel / cancelBlockedBy`.

- [ ] **Step 1: Rewrite the tests first**

`unpaid-prompt-rules.test.ts`: delete the `isTerminalStatus` and `guestCandidates` blocks and the `fromPublic` cases; keep `promptAllowedOn` (the `/order/K4M2QP/abc` path stays blocked: it is now a redirect); replace the prompt-order block with:

```ts
describe('prompt order', () => {
  it('an unpaid order is reviewed on its account page', () => {
    expect(fromUnpaid({ reference: 'K4M2QP', accessKey: null, createdAt: '', totalAmount: 46.03, outstandingBalance: 46.03, payBy: null, canCancel: true, cancelBlockedBy: null }))
      .toEqual({ reference: 'K4M2QP', amount: 46.03, reviewPath: '/account/orders/K4M2QP' });
  });
  it('encodes a reference that needs it', () => {
    expect(fromUnpaid({ reference: 'A/1', accessKey: null, createdAt: '', totalAmount: 1, outstandingBalance: 1, payBy: null, canCancel: false, cancelBlockedBy: 'paid' }).reviewPath).toBe('/account/orders/A%2F1');
  });
});
```

`unpaid-order-prompt.test.tsx`: delete every guest and saved-link case (lines for "guest: …", "saved links the lookup proves dead…", "prunes a dead saved link…", "a guest with nothing saved…", "a signed-in customer is never offered saved guest links") and every in-dialog cancel case ("cancelling from the dialog…", both "Escape…confirmation" cases, "an order that cannot be cancelled shows the contact line…"). Remove the `@/stores/saved-orders.ts` and `@/api/public-order.ts` mocks. Change and add:

```ts
it('signed in: shows the newest unpaid order with its amount, one button and Not now', async () => {
  // …existing arrange…
  expect(await screen.findByRole('button', { name: 'Review or cancel order' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
});

it('Review or cancel order goes to the account order page and closes the dialog', async () => {
  // click, then: expect(location).toBe('/account/orders/K4M2QP'); dialog gone
});

it('Not now hides it across route changes and remounts, without touching sessionStorage', async () => {
  // click Not now; navigate; remount the prompt; still hidden
  expect(sessionStorage.getItem('sf-unpaid-prompt-snoozed')).toBeNull();
});

it('a fresh page load asks again', async () => {
  // click Not now, then simulate a load: resetDismissalForTests(); remount; the dialog is back
});

it('a signed-out visitor is never asked and nothing is requested', async () => {
  // session store signed out; expect(fetchUnpaidOrders).not.toHaveBeenCalled(); no dialog
});

it('signing out mid-visit closes the pop-up', async () => { /* keep the signed-in half of the old case */ });
```

Add `beforeEach(() => resetDismissalForTests())`. Update `unpaid-prompt-chunk-failure.test.tsx` for the renamed prop only.

- [ ] **Step 2: Run and see them fail**

Run: `npm --prefix web test -- test/unpaid-prompt-rules.test.ts test/unpaid-order-prompt.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement**

`rules.ts`: delete `MAX_GUEST_CHECKS`, `MAX_AGE_MS`, `guestCandidates`, `isTerminalStatus`, `fromPublic` and the `SavedOrder` / `PublicOrder` / `CancelBlockedBy` imports. Keep `BLOCKED` and `promptAllowedOn` as they are.

```ts
export interface PromptOrder {
  reference: string;
  amount: number;
  /** Where "Review or cancel order" goes. */
  reviewPath: string;
}

export function fromUnpaid(order: UnpaidOrder): PromptOrder {
  return { reference: order.reference, amount: order.outstandingBalance, reviewPath: `/account/orders/${encodeURIComponent(order.reference)}` };
}
```

`useUnpaidOrder.ts`: replace the `sessionStorage` snooze with a module flag, drop the guest branch:

```ts
// "Not now" lasts until the page is loaded again: a module variable dies with the document, so every fresh
// arrival (a reload, a new tab, reopening the Telegram Mini App) asks again, and moving around the shop does not.
let dismissed = false;
export const isDismissed = () => dismissed;
export const dismissForThisLoad = () => { dismissed = true; };
/** Tests stand in for a page load. */
export const resetDismissalForTests = () => { dismissed = false; };
```

`active` becomes `loggedIn && promptAllowedOn(pathname) && !isBuilderMode() && !isPreviewMode() && !isDismissed() && !otherDialogOpen && !refused`. Delete `candidates`, the `guest` query and the `listSavedOrders` / `removeSavedOrder` / `fetchPublicOrder` / `InvalidLinkError` imports. The return is:

```ts
if (!active) return { order: null, more: false };
const list = signedIn.isError || !Array.isArray(signedIn.data) ? [] : signedIn.data;
return { order: list[0] ? fromUnpaid(list[0]) : null, more: list.length > 1 };
```

Rewrite the doc comment to say signed-in customers only and why (guests have no order page).

`UnpaidOrderPrompt.tsx`: `later` calls `dismissForThisLoad()` then `setDismissed(true)`; `review` sets dismissed (component state only, so a later visit to another page in the same load does not re-ask: also call `dismissForThisLoad()`), then `navigate(order.reviewPath)`. Pass `onReview`. Remove `onCancelled`.

`UnpaidOrderDialog.tsx`: remove `CancelOrder`, `invalidateAfterCancel`, `useQueryClient`. The actions are:

```tsx
<div className={classes.actions}>
  <button type="button" data-autofocus className={orderClasses.cta} data-sf-part="button" data-variant="filled" onClick={onReview}>
    {t('order.prompt.review')}
  </button>
  <button type="button" className={`${orderClasses.ghost} ${classes.later}`} onClick={onLater}>{t('order.prompt.later')}</button>
</div>
```

Text: rename key `prompt.pay` to `prompt.review` with `en: 'Review or cancel order'`, note `'Pop-up button that opens the order page, where the customer pays or cancels'`; change the `prompt.later` note to `'Pop-up button that hides it until the site is next loaded'`. Search for `order.prompt.pay` across `web/src`, `web/test` and `e2e` and update every hit, including `web/test/helpers/text-inventory.json` if it lists the old literal.

- [ ] **Step 4: Verify and commit**

Run: `npm --prefix web test -- test/unpaid-prompt-rules.test.ts test/unpaid-order-prompt.test.tsx test/unpaid-prompt-chunk-failure.test.tsx test/text-inventory.test.ts test/text-scan.test.ts` — Expected: PASS.

```bash
git add web/src/features/unpaid-prompt web/src/text/keys/order.ts web/src/text/notes/order.ts web/test/unpaid-prompt-rules.test.ts web/test/unpaid-order-prompt.test.tsx web/test/unpaid-prompt-chunk-failure.test.tsx web/test/helpers/text-inventory.json
git commit -m "feat(unpaid-prompt): one button to the order page, asked again on every page load, signed-in customers only"
```

### Task 6: After checkout and after paying

**Files:**
- Modify: `web/src/features/checkout/outcome.ts`, `web/src/features/checkout/CheckoutPage.tsx` (submit handler around lines 586-613), `web/src/features/payment-redirect/PaymentSuccessPage.tsx`, `PaymentCancelPage.tsx`, `OrderPlacedPage.tsx`, `payment-parts.tsx`, `web/src/builder/family-payment.ts`, `web/src/features/tracking/LookupForm.tsx`, text keys/notes for `payment.*`
- Test: `web/test/checkout-outcome.test.ts`, `web/test/checkout-page.test.tsx`, `web/test/redirect-pages.test.tsx`, `web/test/golden-stage4-flows.test.tsx` (+ its goldens), `web/test/builder-login-payment-parts.test.tsx`

**Interfaces:**
- Produces:
  - `resolveCheckoutOutcome(r: CheckoutResult, loggedIn: boolean): CheckoutOutcome`
  - `accountOrderPath(reference: string): string` exported from `outcome.ts` → `/account/orders/<encoded>`
  - `PaymentData` gains `signIn: string | null` (the sign-in URL to show a signed-out customer, or null) and loses `saved`. `PaymentPreview` loses `saved` likewise; keep a preview state that shows the sign-in prompt.
- Removed: `publicOrderPath`.

- [ ] **Step 1: Rewrite `checkout-outcome.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { accountOrderPath, resolveCheckoutOutcome } from '@/features/checkout/outcome.ts';
import type { CheckoutResult } from '@/types/checkout.ts';

const result = (payment: CheckoutResult['payment'], extra: Partial<CheckoutResult> = {}): CheckoutResult =>
  ({ reference: 'K4M2QP', publicUrl: 'https://shop.example/order/K4M2QP/key', status: 'pending', total: 46.03, payment, ...extra });

describe('accountOrderPath', () => {
  it('encodes the reference', () => expect(accountOrderPath('A/1')).toBe('/account/orders/A%2F1'));
});

describe('resolveCheckoutOutcome', () => {
  it.each([true, false])('a hosted checkout goes to the processor (signed in: %s)', (loggedIn) => {
    expect(resolveCheckoutOutcome(result({ type: 'checkout_url', url: 'https://pay.example/x' } as CheckoutResult['payment']), loggedIn))
      .toEqual({ kind: 'external', url: 'https://pay.example/x' });
  });
  it.each(['crypto', 'manual'])('signed in, %s: the account order page, never the key link', (type) => {
    expect(resolveCheckoutOutcome(result({ type } as CheckoutResult['payment']), true)).toEqual({ kind: 'navigate', to: '/account/orders/K4M2QP' });
  });
  it.each(['crypto', 'manual'])('guest, %s: order placed', (type) => {
    expect(resolveCheckoutOutcome(result({ type } as CheckoutResult['payment']), false)).toEqual({ kind: 'navigate', to: '/order-placed?order=K4M2QP' });
  });
  it.each([true, false])('no payment: order placed, with the warning flag (signed in: %s)', (loggedIn) => {
    expect(resolveCheckoutOutcome(result({ type: 'none' } as CheckoutResult['payment'], { warning: 'x' }), loggedIn))
      .toEqual({ kind: 'navigate', to: '/order-placed?order=K4M2QP&warning=1' });
  });
});
```

Use the real `CheckoutPayment` variants from `web/src/types/checkout.ts` instead of the casts where their required fields are few.

- [ ] **Step 2: Update the page tests**

- `checkout-page.test.tsx` (around 747-758): a signed-in crypto order navigates to `/account/orders/<ref>`; a guest one to `/order-placed?order=<ref>`; nothing is written to `localStorage` key `sf-orders-v1`. In Telegram with an external gateway: signed in → `/account/orders/<ref>`, guest → `/order-placed?order=<ref>`.
- `redirect-pages.test.tsx`: remove the stub `/order/:ref/:accessKey` route and saved-order cases. Using the file's existing `mount(path)` helper and its session / settings mocks (add a stub route `/account/orders/:ref` that prints `order page <ref>`), add:

```tsx
const SIGN_IN = '/login?returnTo=%2Faccount%2Forders%2FREF3';
const signInLink = () => screen.queryByRole('link', { name: 'Sign in to view your order' });

describe('after paying or ordering', () => {
  it('success, signed in: straight to the order page', async () => {
    signIn(); mount('/payment/success?order=REF3');
    expect(await screen.findByText('order page REF3')).toBeTruthy();
    expect(signInLink()).toBeNull();
  });
  it('success, signed out, accounts on: thanks, plus the way to the order', () => {
    signOut(); features({ accounts: true }); mount('/payment/success?order=REF3');
    expect(signInLink()?.getAttribute('href')).toBe(SIGN_IN);
  });
  it('success, signed out, accounts off: no sign-in link', () => {
    signOut(); features({ accounts: false }); mount('/payment/success?order=REF3');
    expect(signInLink()).toBeNull();
  });
  it('cancel, signed in: Return to order goes to the account order page', () => {
    signIn(); mount('/payment/cancel?order=REF3');
    expect(screen.getByRole('link', { name: 'Return to order' }).getAttribute('href')).toBe('/account/orders/REF3');
  });
  it('cancel, signed out: the sign-in link when accounts are on, else Back to shop', () => {
    signOut(); features({ accounts: true }); const a = mount('/payment/cancel?order=REF3');
    expect(signInLink()?.getAttribute('href')).toBe(SIGN_IN);
    a.unmount();
    features({ accounts: false }); mount('/payment/cancel?order=REF3');
    expect(screen.getByRole('link', { name: 'Back to shop' }).getAttribute('href')).toBe('/');
  });
  it('order placed, signed out, accounts on: the sign-in link sits with the chat buttons', () => {
    signOut(); features({ accounts: true }); mount('/order-placed?order=REF3');
    expect(signInLink()?.getAttribute('href')).toBe(SIGN_IN);
  });
  it('order placed, signed in: no sign-in link', () => {
    signIn(); mount('/order-placed?order=REF3');
    expect(signInLink()).toBeNull();
  });
});
```

`signIn` / `signOut` / `features` are thin wrappers over whatever the file already uses to set the session store and the mocked settings; write them once at the top.
- `golden-stage4-flows.test.tsx`: replace the `stage4-payment-cancel-saved-order` case with `stage4-payment-cancel-signed-in` and add `stage4-order-placed-guest-sign-in`; delete the obsolete golden file.

- [ ] **Step 3: Run and see them fail**

Run: `npm --prefix web test -- test/checkout-outcome.test.ts test/redirect-pages.test.tsx` — Expected: FAIL.

- [ ] **Step 4: Implement**

`outcome.ts`:

```ts
import type { CheckoutResult } from '@/types/checkout.ts';

export type CheckoutOutcome = { kind: 'external'; url: string } | { kind: 'navigate'; to: string };

export const accountOrderPath = (reference: string) => `/account/orders/${encodeURIComponent(reference)}`;

/**
 * Where to send the shopper once an order has been placed. A signed-in customer who still has to act (send crypto,
 * make a transfer) goes to their order page, where the details are. A guest has no order page until they sign in,
 * so they get the order-placed screen, which says so.
 */
export function resolveCheckoutOutcome(r: CheckoutResult, loggedIn: boolean): CheckoutOutcome {
  if (r.payment.type === 'checkout_url') return { kind: 'external', url: r.payment.url };
  if (loggedIn && r.payment.type !== 'none') return { kind: 'navigate', to: accountOrderPath(r.reference) };
  const q = new URLSearchParams({ order: r.reference });
  if (r.warning) q.set('warning', '1');
  return { kind: 'navigate', to: `/order-placed?${q}` };
}
```

`CheckoutPage.tsx` submit handler: delete the `publicOrderPath` / `saveOrder` block and its comment; pass `loggedIn` to `resolveCheckoutOutcome`; the Telegram external branch navigates to `loggedIn ? accountOrderPath(result.reference) : '/order-placed?order=' + encodeURIComponent(result.reference)`. Remove the `saveOrder` import.

Sign-in link, one helper in `payment-parts.tsx`:

```ts
/** The way to an order for someone who placed it signed out: sign in with the same contact, land on the order. */
export const signInToOrder = (reference: string) => `/login?returnTo=${encodeURIComponent(accountOrderPath(reference))}`;
```

Each of the three pages computes `signIn = !loggedIn && settings.features.accounts && orderRef ? signInToOrder(orderRef) : null` (`useSessionStore(selectIsLoggedIn)`, `useSettings()`), and puts it in `PaymentData`. Confirm `/login` honours `returnTo` by reading `web/src/features/auth/` (the login page and `useLoginSuccess`); use the parameter name it actually reads.

- `PaymentSuccessPage`: `if (loggedIn && orderRef && !previewing) return <Navigate to={accountOrderPath(orderRef)} replace />;` replaces the saved-order redirect. Rewrite the doc comment. This page is reached by a full page load from the processor, so `loggedIn` must be right on the first render: `app/guards.tsx` reads the same `useSessionStore(selectIsLoggedIn)` synchronously with no "ready" flag, which means the store is restored before first paint. Confirm that in `web/src/stores/session.ts` (how the persisted session is read at module load). If the session is instead restored asynchronously, render nothing until it has been, using the same signal the app shell waits on, so a signed-in customer never flashes the sign-in prompt. Pin it with a test: with a persisted session in storage before the first render, the page redirects and the sign-in link is never in the DOM.
- `payment-parts.tsx` `ActionsView`:
  - `kind === 'success'`: `signIn ? <sign-in CTA> : null`.
  - `kind === 'cancel'`: signed in → "Return to order" to `accountOrderPath(orderRef)`; else `signIn` → sign-in CTA; else "Back to shop".
  - order placed: the existing chat buttons, plus the sign-in CTA above them when `signIn`.
  - The sign-in CTA is `<Link to={signIn} className={classes.cta} data-sf-part="button" data-variant="filled">{t('payment.signIn.action')}</Link>` followed by `<p className={classes.detail}>{t('payment.signIn.hint')}</p>`.
- Text keys (in the file that holds `payment.placed.*`): `signIn.action` = `'Sign in to view your order'` (max 40), `signIn.hint` = `'Use the email or phone number you gave at checkout. You can pay for the order and follow it from there.'` (max 200), with notes. Add both to the `text:` patterns of the `PaymentActions` block (`web/src/builder/blocks/PaymentActions.tsx`).
- `LookupForm.tsx`: delete the recent-orders chips, their state, their CSS classes and the `listSavedOrders` import; update `test/` cases that asserted the chips.

- [ ] **Step 5: Regenerate the affected goldens, read the diff**

Run the golden test with the repo's update flag (see the header of `golden-stage4-flows.test.tsx` for the exact env var), then `git diff --stat web/test/__golden__` and open each changed file: only the action area of the three pages and the tracking form may differ.

- [ ] **Step 6: Verify and commit**

Run: `npm --prefix web test` and `npm run build` — Expected: PASS.

```bash
git add web/src/features/checkout web/src/features/payment-redirect web/src/features/tracking web/src/builder/family-payment.ts web/src/builder/blocks/PaymentActions.tsx web/src/text web/test
git commit -m "feat(checkout): after ordering, a signed-in customer lands on the order page and a guest is asked to sign in"
```

(Stage `web/test` and `web/src/text` by the individual changed paths; the directory names above are shorthand for the files this task touched. Check `git status --short` first: it must list nothing you did not change.)

### Task 7: The link page leaves the storefront

**Files:**
- Delete: `web/src/features/order-status/OrderStatusPage.tsx`, `order-status-parts.tsx`, `StatusHero.tsx`, `StateScreens.tsx`, `AddressCard.tsx`, `ItemsCard.tsx`, `ShipmentCard.tsx`; `web/src/builder/blocks/OrderStatus.tsx`, `OrderStatusHero.tsx`, `OrderStatusPayment.tsx`, `OrderStatusShipments.tsx`, `OrderStatusItems.tsx`, `OrderStatusAddress.tsx`, `OrderStatusFooter.tsx`, `OrderPageLink.tsx`; `web/src/builder/blocks/_shared/order-status-container.ts`; `web/src/builder/family-order-status.ts`; `web/src/builder/editor/fields/OrderStatus*.ts`, `fields/OrderPageLink.ts`; `web/src/stores/saved-orders.ts`; tests `web/test/builder-order-status-parts.test.tsx`, `golden-stage5-order-status.test.tsx`, `saved-orders.test.ts`, `sign-out-saved-orders.test.ts`, `text-guard-order.test.tsx` (only if it covers nothing but the deleted page); goldens `web/test/__golden__/stage5-order-*.html`; baselines `e2e/__baseline__/dom-order-status-*.txt`
- Modify: `web/src/app/routes.tsx`, `web/src/features/webapp/default-action.ts`, `web/src/features/auth/sign-out.ts`, `web/src/features/account/OrderDetailPage.tsx` (remove `PageLinkView`), `web/src/builder/blocks/_shared/order-container.ts`, `web/src/builder/types.ts`, `parts.ts`, `rules.ts`, `mode.ts`, `defaults/groups/post-order.ts`, `editor/page-catalog.ts`, `editor/route-bound.ts`, `editor/preview-states.ts`, `editor/config.ts`, `editor/IssueQuickFix.tsx`, `editor/fixture-routes.tsx`, `editor/fixtures.ts`, `editor/fixture-api.ts`, text keys/notes, `web/public/blocks.json`, `worker/src/proxy.ts`, `worker/test/proxy.test.ts`, `e2e/mocks.ts`, `e2e/dom-parity.spec.ts`, `e2e/page-sets.ts`, `e2e/builder-editor.spec.ts`, `e2e/checkout-parts.spec.ts`, `e2e/unpaid-orders.spec.ts`, `docs/builder.md`, and every contract test named below
- Create: `web/src/app/OrderLinkRedirect.tsx`, `web/test/order-link-redirect.test.tsx`, `web/test/stale-order-docs.test.tsx`

**Interfaces:**
- Produces: `OrderLinkRedirect` (default-less named export), a route element.
- `FIXED_ROUTE_KEYS` has 17 entries (no `'order-status'`). `PartFamily` has no `'order-status'`. `ORDER_CONTAINER` parts: `OrderBackLink, OrderHeading, OrderBalance, OrderItems, OrderPayments, OrderParcels`.
- `closed-gate.ts` is NOT changed. `/order/` stays exempt because `app/access.ts` uses the same check: on a private or restricted shop the redirect route has to render so the visitor reaches `/account/…`, which has its own access exemption. On a closed shop the redirect's target shows the closed screen, as the spec says.

- [ ] **Step 1: Write the two new tests**

`order-link-redirect.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { OrderLinkRedirect } from '@/app/OrderLinkRedirect.tsx';

const Where = () => <p data-testid="at">{useLocation().pathname}</p>;
const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/order/:ref/:accessKey" element={<OrderLinkRedirect />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

describe('an old order link', () => {
  it('goes to the account order page for that reference and drops the key', () => {
    open('/order/K4M2QP/abcdef0123456789');
    expect(screen.getByTestId('at').textContent).toBe('/account/orders/K4M2QP');
  });
  it('keeps a reference that needs encoding intact', () => {
    open('/order/A%2F1/key');
    expect(screen.getByTestId('at').textContent).toBe('/account/orders/A%2F1');
  });
});
```

`stale-order-docs.test.tsx`: using the helpers `test/builder-account-parts.test.tsx` already uses to render a stored doc for `account.order`, assert (a) a stored `OrderDetail` whose `content` slot includes a block of type `OrderPageLink` renders the order heading and items and throws nothing, and reports a `drop:unknown-block` issue from `builder/guard.ts`; (b) a page set whose `pages` contains an `order-status` key resolves every remaining route's doc exactly as a page set without it (`resolveDoc` for each of `FIXED_ROUTE_KEYS`); (c) `docsFromPageSet` (`builder/editor/page-set.ts`) given that page set returns no `order-status` doc and does not throw, and the payload the editor would save back (`toPageSet` or the editor's own serialiser: read `page-set.ts` for the function) either omits the stale key or passes it through unchanged. If (c) shows the editor throws on the stale key, make the loader drop keys outside `FIXED_ROUTE_KEYS` / `card:*` / `page:*` and assert that.

- [ ] **Step 2: Run and see them fail**

Run: `npm --prefix web test -- test/order-link-redirect.test.tsx test/stale-order-docs.test.tsx` — Expected: FAIL.

- [ ] **Step 3: The redirect**

```tsx
// web/src/app/OrderLinkRedirect.tsx
import { Navigate, useParams } from 'react-router';
import { accountOrderPath } from '@/features/checkout/outcome.ts';

/**
 * `/order/:ref/:accessKey` used to be the order's own page. The backend still writes that address into order
 * emails and uses it as the return address of hosted payments, so it has to lead somewhere: the customer's
 * order page. The account guard sends a signed-out visitor through sign-in and back. The key is not used.
 */
export function OrderLinkRedirect() {
  const { ref } = useParams<{ ref: string }>();
  return <Navigate to={ref ? accountOrderPath(ref) : '/account/orders'} replace />;
}
```

`routes.tsx` line 146: `{ path: 'order/:ref/:accessKey', element: <OrderLinkRedirect /> },`. Check how neighbouring non-builder routes are declared (lazy or eager) and whether the surrounding frame needs a `handle`; the redirect must not require a `routeKey`.

- [ ] **Step 4: Delete and unregister**

Work through this list; after each group run `npm run build` and fix what the compiler reports.

1. Delete the files in the Delete list. `registry.ts` and `editor/config.ts` glob `blocks/*.tsx` and `fields/*.ts`, so deletion unregisters them.
2. `OrderDetailPage.tsx`: remove `PageLinkView` and its `ORDER_VIEWS` entry. `order-container.ts`: remove `'OrderPageLink'` from `PARTS`.
3. Builder registration, remove every `order-status` / `OrderStatus` entry: `types.ts` (`FIXED_ROUTE_KEYS`), `parts.ts` (`PartFamily`, `FAMILY_DOCS`), `rules.ts` (`PLACEMENT`, `EXACTLY_ONE`, `FAMILY_NOUN`, `FAMILY_HOME`), `mode.ts` (`PREVIEW_STATE_IDS.OrderStatus`), `defaults/groups/post-order.ts`, `editor/page-catalog.ts`, `editor/route-bound.ts`, `editor/preview-states.ts`, `editor/config.ts` (`PART_TITLES`, `ITEM_TITLE_DOCS`, the `contentBeforePayment` hint), `editor/IssueQuickFix.tsx` (`part-order:OrderStatus`), `editor/fixture-routes.tsx`, `editor/fixtures.ts` (`FIXTURE_ACCESS_KEY`, `fixtureOrderStates` only if nothing else uses them: Task 10 reuses the order-state fixtures for the account page, so keep the `PublicOrder` state builders and delete only what is link-page-only), `editor/fixture-api.ts` (the `orders/:ref/:key` handlers).
4. `default-action.ts`: remove `'/order/'` from `TERMINAL`. `sign-out.ts`: remove `clearSavedOrders`. Delete `stores/saved-orders.ts` once `grep -rn "saved-orders" web/src` is empty.
5. Text: for each of `order.hero.*`, `order.screens.*`, `order.link.*`, `order.documentTitle`, `account.order.openOrderPage`, `account.order.orderPageNote` and any other key whose only users were deleted files, run `grep -rn "<key>" web/src`; delete the key and its note only when nothing remains. Then remove the matching literals and the deleted files' sections from `web/test/helpers/text-inventory.json`.
6. Worker: remove `'orders/'` from `ALLOWED_PREFIXES` in `worker/src/proxy.ts`; in `worker/test/proxy.test.ts` move `orders/ABC/key` and `orders/ABC/key/payment-options` to the refused cases.
7. `OrderStatus.module.css`: delete classes no remaining file uses. For each class, `grep -rn "classes\.<name>\|orderClasses\.<name>" web/src`; keep everything `PaymentSection`, `MethodPicker`, `CryptoPaymentCard`, `CancelOrder`, `CopyRow`, `SupportLinks`, `UnpaidOrderDialog`, `features/tracking/*` and `features/account/*` use.

- [ ] **Step 5: Update the contract tests**

- `builder-editor-contract.test.ts` and `builder-types.test.ts`: `FIXED_ROUTE_KEYS` length 17; remove `'OrderStatus'` from `SPEC_BLOCKS`.
- `test/helpers/stage5-parts.ts`: remove the six `OrderStatus*` parts and the `OrderStatus` container. `test/helpers/stage4-parts.ts`: remove `OrderPageLink`.
- `builder-parts-stage5-contract.test.ts`, `builder-parts-stage5.test.ts` (lines 239-248), `builder-parts-stage4.test.ts` (line 157), `builder-defaults-complete.test.ts`, `builder-post-order.test.tsx`, `builder-editor-route-bound.test.ts`, `builder-editor-page-set.test.ts`, `builder-editor-config.test.ts`, `builder-editor-navigation.test.tsx`, `builder-editor-fixture-api.test.ts`, `builder-editor-fixture-mode.test.ts`, `builder-editor-checkout-parts.test.ts` (63-118), `builder-routes.test.tsx`, `builder-shell.test.tsx`, `builder-style-contract.test.tsx`, `builder-style-wrap.test.tsx`, `builder-fixture-guards.test.tsx`, `builder-account-parts.test.tsx` (part lists at lines 98 and 195), `templates-parts.test.ts` (88-150: drop the counts for the deleted cards), `motion-usage.test.ts`, `vocabulary.test.ts`, `text-guard.allow.ts`, `default-action.test.ts`, `closed-exempt.test.ts` and `access.test.ts` (unchanged expectations: `/order/x/y` is still exempt; reword any comment that calls it the order page), `telegram-session.test.ts` (saved-orders lines 120-123), `golden-stage4-account.test.tsx` (the `stage4-account-order-*` cases lose the "Open order page" link: regenerate, read the diff).
- Remove each assertion about the deleted page; do not weaken assertions about anything else. Where a test only existed for the deleted page, delete the test.

- [ ] **Step 6: Regenerate the manifest**

Run: `UPDATE_BLOCKS_JSON=1 npm --prefix web test -- test/blocks-manifest.test.ts`, then `git diff web/public/blocks.json`: exactly the eight removed blocks may differ.

- [ ] **Step 7: e2e sources**

`e2e/mocks.ts`: delete `ORDER_PATH`, the `orders/` handlers and the `orders/` exemption from `disabled`. `e2e/dom-parity.spec.ts`: delete the `order-status` case. `e2e/page-sets.ts`: delete the order-status page-set fixtures (420-565). `e2e/builder-editor.spec.ts` (1330-1640) and `e2e/checkout-parts.spec.ts` (from 795): delete the order-status sections. `e2e/unpaid-orders.spec.ts`: delete guest and link-page scenarios; Task 12 adds the new ones. `e2e/fixtures/profile.json:66`: remove the key-link value if it is only that. Do not run Playwright here; Task 12 does.

- [ ] **Step 8: Docs**

`docs/builder.md`: remove the order-status page and blocks, note that `/order/:ref/:key` redirects to the account order page. `README.md` if it lists routes.

- [ ] **Step 9: Verify and commit**

Run: `TZ=UTC npm test` and `npm run build` — Expected: PASS, zero references left: `grep -rn "order-status\|OrderStatus\b\|saved-orders\|publicOrderPath" web/src worker/src` prints only CSS module file names (`OrderStatus.module.css`) and the `features/order-status/` folder imports.

```bash
git status --short   # read it: only files this task touched
git add <each path listed by git status that this task changed or deleted>
git commit -m "feat!: the order link page leaves the storefront; /order/:ref/:key redirects to the account order page"
```

### Task 8: Pay and cancel components run on the session

**Files:**
- Modify: `web/src/features/order-status/PaymentSection.tsx`, `MethodPicker.tsx`, `CryptoPaymentCard.tsx`, `CancelOrder.tsx`, `queries.ts`, `invalidate-after-cancel.ts`, `web/src/features/account/OrderDetailPage.tsx` (`BalanceView`), `web/src/types/orders.ts`, `web/src/builder/blocks/OrderBalance.tsx` (comment only), `web/src/builder/editor/fixtures.ts` and `fixture-api.ts`
- Delete: `web/src/api/public-order.ts`
- Test: `web/test/account-order-pay.test.tsx`, `cancel-order.test.tsx`, `invalidate-after-cancel.test.ts`, `transfer-settlement.test.tsx`, `builder-fixture-guards.test.tsx`, `collect-from.test.tsx`, `promotions-ui.test.tsx`

**Interfaces:**
- Consumes: Task 4's API functions.
- Produces:
  - `orderPaymentKey(reference: string) = ['order-payment', reference] as const` and `paymentOptionsKey(reference)` from `queries.ts`; `publicOrderKey` is removed.
  - `useOrderPayment(reference: string, enabled: boolean)` exported from `web/src/features/account/queries.ts`: the polled payment view query.
  - `PaymentSectionProps = { order: PublicOrder; reference: string }`; `MethodPickerProps = { order; reference; onSelected? }`; `CryptoPaymentCardProps = { payment; reference; currency }`.
  - `CancelOrderProps = { reference; canCancel; blockedBy; onCancelled?; rootAttrs? }`.
  - `invalidateAfterCancel(queryClient: QueryClient, reference: string): void`.
- `OrderDetail` loses `accessKey` and `publicUrl`; `UnpaidOrder` loses `accessKey`.

- [ ] **Step 1: Update the tests**

`account-order-pay.test.tsx`: mock `@/api/orders.ts` with `fetchOrderPayment`, `fetchOrderPaymentOptions`, `selectOrderPaymentMethod`, `cancelOrder` (spread the original so the error classes stay real); delete the `@/api/public-order.ts` mock. In every case drop `accessKey` from `h.order` and assert `fetchOrderPayment` was called with `'K4M2QP'` alone. Replace any case named for the access key with:

```ts
it('an unpaid order shows the payment section with no access key on the order', async () => {
  h.order = { ...base, canCancel: true, cancelBlockedBy: null };
  paymentMock.mockResolvedValue(publicOrder({ canPay: true, payBy: null, activePayment: null }));
  mount();
  expect(await screen.findByText(/Choose how to pay/)).toBeTruthy();
  expect(paymentMock).toHaveBeenCalledWith('K4M2QP');
});

it('a paid order asks for no payment state at all', async () => {
  h.order = { ...base, outstandingBalance: 0, status: 'confirmed', canCancel: false, cancelBlockedBy: 'paid' };
  mount();
  await screen.findByText('K4M2QP');
  expect(paymentMock).not.toHaveBeenCalled();
});
```

`cancel-order.test.tsx`: delete "with an access key and no session flag…" and "renders nothing when viaLink is set…"; the rest lose `viaLink` / `accessKey` props. `invalidate-after-cancel.test.ts`: it now invalidates `['orders']`, `['order', ref]`, `['order-payment', ref]`, `['orders', 'unpaid']` (via `['orders']`) and `['unpaid-prompt']`; assert `['order-payment', 'K4M2QP']`.

- [ ] **Step 2: Run and see them fail**

Run: `npm --prefix web test -- test/account-order-pay.test.tsx test/cancel-order.test.tsx test/invalidate-after-cancel.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

`queries.ts` (order-status):

```ts
/** The order page's query keys, in one place so a refetch from any card hits the same cache entry. */
export const orderPaymentKey = (reference: string) => ['order-payment', reference] as const;
export const paymentOptionsKey = (reference: string) => ['order-payment-options', reference] as const;
```

`features/account/queries.ts`:

```ts
/**
 * What is owed on the order and how its payment stands, through the session. Polled while a payment is open
 * (the interval comes from the order's own state) and in the background: a customer finishing a hosted checkout
 * in another tab is not looking at this one, and that is when it most needs to keep up.
 */
export function useOrderPayment(reference: string, enabled: boolean) {
  return useQuery({
    queryKey: orderPaymentKey(reference),
    queryFn: () => fetchOrderPayment(reference),
    enabled,
    retry: false,
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data ? pollInterval(query.state.data) : false),
    refetchIntervalInBackground: true,
  });
}
```

`MethodPicker.tsx`: imports from `@/api/orders.ts` (`PaymentConflictError`, `fetchOrderPaymentOptions`, `selectOrderPaymentMethod`, `type PaymentSelection`); drop the `accessKey` prop; `queryFn: () => fetchOrderPaymentOptions(reference)`; `refetchOrder` invalidates `orderPaymentKey(reference)`; `mutationFn: (selection) => selectOrderPaymentMethod(reference, selection)`. Fix the comment that explains keying "on the reference alone".
`CryptoPaymentCard.tsx`: drop `accessKey`; `submitOrderCryptoTxid(reference, payment.paymentId, value)`; invalidate `orderPaymentKey(reference)`.
`PaymentSection.tsx`: drop `accessKey` from props and from every child.
`CancelOrder.tsx`: drop `accessKey` and `viaLink`; `view = cancelView(canCancel, blockedBy)`; `await cancelOrder(reference)`; import `OrderNotCancellableError` from `@/api/orders.ts`. (The inline panel stays until Task 9.)
`invalidate-after-cancel.ts`:

```ts
export function invalidateAfterCancel(queryClient: QueryClient, reference: string): void {
  void queryClient.invalidateQueries({ queryKey: ['orders'] });
  void queryClient.invalidateQueries({ queryKey: ['order', reference] });
  void queryClient.invalidateQueries({ queryKey: orderPaymentKey(reference) });
  void queryClient.invalidateQueries({ queryKey: ['unpaid-prompt'] });
}
```

`BalanceView`: replace the inline `useQuery` with `const payment = useOrderPayment(data.reference, owed);`, keep the signature effect (it invalidates `['order', ref]` when the payment signature changes) reading `payment.data`, set `const loaded = payment.data;`, pass `<PaymentSection order={payable} reference={data.reference} />`, and call `invalidateAfterCancel(queryClient, data.reference)`. Rewrite its doc comment: paying runs through the session, there is no access key. Leave the markup otherwise as it is; Task 10 redesigns it.

Types: remove `accessKey` and `publicUrl` from `OrderDetail` and `accessKey` from `UnpaidOrder`; fix fixtures and tests the compiler flags. Editor `fixture-api.ts`: serve `storefront/orders/:ref/payment` and `…/payment-options` from the fixture states that used to back the key routes.

Delete `web/src/api/public-order.ts` once `grep -rn "public-order.ts'" web/src web/test` shows only `@/types/public-order.ts`.

- [ ] **Step 4: Verify and commit**

Run: `TZ=UTC npm test` and `npm run build` — Expected: PASS.

```bash
git add <the paths git status lists for this task>
git commit -m "feat(account): paying and cancelling an order run on the customer session, with no access key"
```

### Task 9: Cancel confirmation modal

**Files:**
- Modify: `web/src/features/order-status/CancelOrder.tsx`, `OrderStatus.module.css`, `web/src/text/keys/order.ts`, `web/src/text/notes/order.ts`
- Test: `web/test/cancel-order.test.tsx`

**Interfaces:**
- `CancelOrderProps` unchanged from Task 8. The trigger keeps `data-sf-part="cancel"` on its root.

- [ ] **Step 1: Rewrite the confirmation tests**

Render inside `<MantineProvider env="test">` (the file already does or must now). Replace the inline-panel cases with:

```tsx
it('asks in a dialog before cancelling, and Keep order backs out without a request', async () => {
  mount({ canCancel: true });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
  const dialog = await screen.findByRole('dialog', { name: 'Cancel order K4M2QP?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Keep order' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(cancelMock).not.toHaveBeenCalled();
});

it('has no close button, and a click outside does not close it', async () => {
  mount({ canCancel: true });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).queryByRole('button', { name: /close/i })).toBeNull();
  fireEvent.mouseDown(document.querySelector('.mantine-Modal-overlay')!);
  fireEvent.click(document.querySelector('.mantine-Modal-overlay')!);
  expect(screen.getByRole('dialog')).toBeTruthy();
});

it('Keep order has focus when it opens, and Escape means Keep order', async () => {
  mount({ canCancel: true });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Keep order' })));
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(cancelMock).not.toHaveBeenCalled();
});

it('a double tap on Yes sends one request, and nothing closes the dialog while it runs', async () => {
  let finish!: () => void;
  cancelMock.mockReturnValue(new Promise((r) => { finish = () => r({ reference: 'K4M2QP', status: 'cancelled' }); }));
  mount({ canCancel: true });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
  const dialog = await screen.findByRole('dialog');
  const yes = within(dialog).getByRole('button', { name: 'Yes, cancel order' });
  fireEvent.click(yes);
  fireEvent.click(yes);
  expect(cancelMock).toHaveBeenCalledTimes(1);
  expect(within(dialog).getByRole('button', { name: 'Cancelling…' })).toBeTruthy();
  expect((within(dialog).getByRole('button', { name: 'Keep order' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.getByRole('dialog')).toBeTruthy();
  await act(async () => { finish(); });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
```

Keep and adapt: success notification and `onCancelled`; each refusal reason closes the dialog, shows its message on the page and calls `onCancelled`; "any other failure can be retried" (the dialog stays open with the failure message inside it); the contact view; "renders nothing when the order is paid or the backend is older".

- [ ] **Step 2: Run and see them fail**

Run: `npm --prefix web test -- test/cancel-order.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement**

Replace the inline panel (and the `keep` / `panel` refs, the two focus effects and every `data-mantine-stop-propagation`) with:

```tsx
<Modal
  opened={open}
  onClose={() => { if (!working) close(); }}
  title={t('order.cancel.confirmTitle', { reference })}
  centered
  size="sm"
  radius="var(--mantine-radius-default)"
  withCloseButton={false}
  closeOnClickOutside={false}
  closeOnEscape={!working}
  returnFocus
  classNames={{ content: classes.cancelDialog, title: classes.cancelTitle }}
>
  <p className={classes.cancelText}>{t('order.cancel.confirmBody')}</p>
  {message === 'order.cancel.failed' ? <p className={classes.cancelError} role="alert">{t(message)}</p> : null}
  <div className={classes.cancelButtons}>
    <button type="button" data-autofocus className={classes.ghost} disabled={working} onClick={close}>
      {t('order.cancel.keep')}
    </button>
    <button type="button" className={classes.cancelConfirm} aria-disabled={working} onClick={() => void confirm()}>
      {working ? t('order.cancel.working') : t('order.cancel.confirm')}
    </button>
  </div>
</Modal>
```

`close` just calls `setOpen(false)` (Mantine returns focus to the trigger). `confirm` keeps its `busy` ref guard. Text: `cancel.confirm` → `'Yes, cancel order'`, `cancel.keep` → `'Keep order'`; update the inventory if it pins the old literals. CSS: `.cancelButtons` is a column with the buttons full width below `36em` and a row from there; the danger button uses the existing danger tokens; minimum touch height 44px.

- [ ] **Step 4: Verify and commit**

Run: `npm --prefix web test -- test/cancel-order.test.tsx test/account-order-pay.test.tsx test/text-inventory.test.ts` — Expected: PASS.

```bash
git add web/src/features/order-status/CancelOrder.tsx web/src/features/order-status/OrderStatus.module.css web/src/text/keys/order.ts web/src/text/notes/order.ts web/test/cancel-order.test.tsx web/test/helpers/text-inventory.json
git commit -m "feat(orders): cancelling is confirmed in a dialog that only its two buttons can close"
```

### Task 10: The order overview page

**REQUIRED:** the implementer invokes the `frontend-design:frontend-design` skill before writing any markup or CSS, and reads `designs/*/DESIGN.md` for the four templates plus `web/src/templates/*/template.css` to learn what `data-sf-part="card"` and `button` look like in each.

**Files:**
- Create: `web/src/builder/blocks/OrderAddress.tsx`, `web/src/builder/editor/fields/OrderAddress.ts`, `web/src/features/account/OrderPaymentCard.tsx`, `web/src/features/account/order-layout.ts`, `web/src/features/account/OrderDetail.module.css`, `web/test/order-layout.test.ts`
- Modify: `web/src/builder/blocks/OrderDetail.tsx` (pass `puck` as `ctx`), `web/src/features/account/OrderDetailPage.tsx`, `AccountLayout.tsx`, `Account.module.css` (remove order-detail rules that moved), `web/src/builder/blocks/_shared/order-container.ts`, `web/src/builder/blocks/OrderBalance.tsx` (label "Payment needed", text patterns), `web/src/builder/editor/fixtures.ts`, `preview-states.ts`, `mode.ts`, `web/src/text/keys/account.ts` (or wherever `account.order.*` lives) + notes, `web/public/blocks.json`, `docs/builder.md`
- Test: `web/test/account-order-overview.test.tsx` (create), `web/test/account-order-pay.test.tsx`, `web/test/helpers/stage4-parts.ts`, `web/test/builder-account-parts.test.tsx`, `web/test/golden-stage4-account.test.tsx` + goldens, `web/test/text-account-dom.test.tsx`

**Interfaces:**
- Consumes: `useOrderPayment`, `PaymentSection`, `CancelOrder`, `invalidateAfterCancel`, `OrderDetail.shippingAddress`.
- Produces:
  - Part `OrderAddress` (family `order`, style `styleSupport('root', [...BOX, ...TEXT, ...VIS])`, text `account.order.address.*`).
  - `ORDER_CONTAINER` parts in default order: `OrderBackLink, OrderHeading, OrderBalance, OrderItems, OrderAddress, OrderParcels, OrderPayments`. Required stays `['OrderHeading', 'OrderItems']`.
  - `isOrderDetailPath(pathname: string): boolean` exported from `AccountLayout.tsx` (`/^\/account\/orders\/[^/]+\/?$/`).
  - `PREVIEW_STATE_IDS.OrderDetail`: `['awaiting-payment', 'hosted-open', 'crypto-waiting', 'shipped', 'collection', 'cancelled']`, default `'awaiting-payment'`, each backed by an `OrderDetail` fixture and a `PublicOrder` payment fixture served by `fixture-api.ts`.

**Behaviour contract (tests in Step 1 pin all of it):**

1. On `/account/orders/:ref`, `GreetingView` and `TabsView` return null. On every other account path they render as today.
2. Header: back link "All orders" (`account.order.backToOrders`, existing key, change `en` to `'All orders'` if it differs), reference as `<h1>`, status pill, "Placed {date}". The "Collect from {name}" line stays in the heading (a stored arrangement without `OrderAddress` must not lose it); `OrderAddress` adds the point's full address.
3. `OrderBalance` renders `OrderPaymentCard` only when `order.outstandingBalance > 0` and status is neither `cancelled` nor `refunded`. The card is `<section data-sf-part="card" aria-labelledby=…>` with:
   - eyebrow `account.order.pay.eyebrow` "Payment needed"; the amount due as the largest figure on the page; the pay-by line comes from `PaymentSection`'s own `Deadline`.
   - body by state:
     - payment query pending → a skeleton block with `aria-busy="true"` and visually hidden `account.order.pay.loading` "Loading payment options…".
     - payment query error → `account.order.pay.loadFailed` "We couldn't load the payment options." + a "Try again" button (`common.actions.tryAgain`) that refetches. `role="alert"`.
     - loaded and payable (`payment.canPay` or visible crypto payments) → `<PaymentSection order reference />`.
     - loaded, `payment.canPay === false`, nothing to show → existing `account.order.payHelp` + `SupportLinks`.
   - footer, separated by a rule: `<CancelOrder … />` in every one of those states (its own logic decides between the button, the contact line and nothing).
4. `OrderItems`: unchanged data; restyled as a card with the grand total emphasised.
5. `OrderAddress`: null when `!order.shippingAddress`. Title `account.order.address.delivery` "Delivery address", or `account.order.address.collection` "Collect from" when `shippingAddress.servicePoint`; then for collection the point's name and carrier; then name, address lines (skipping blank ones), city, county, postcode and the country name (use the helper the checkout uses to print a country name from its code; find it with `grep -rn "countryName\|regionNames" web/src/lib web/src/features/checkout`).
6. `OrderParcels`, `OrderPayments`: unchanged data, restyled as cards; `OrderPayments` shows the status in plain words through text keys `account.order.paymentStatus.{pending,completed,failed,cancelled,expired,refunded}` ("Waiting", "Paid", "Failed", "Cancelled", "Expired", "Refunded"), falling back to the raw status for an unknown value.
7. Layout. The renderer (`builder/render.tsx`) emits a slot's blocks as bare children with no per-block wrapper on the published site, but the editor mounts a slot as one drop zone with its own wrappers, and a CSS grid cannot stack two columns independently from one flat list (rows couple the heights). So the container partitions the slot's items itself, the way the deleted `OrderStatusPage` decided its wide layout:
   - `OrderDetail.tsx` (the block) passes its render context down: `render: ({ content, puck }) => <OrderDetailPage slots={{ content }} ctx={puck} />`. `OrderDetailPage` takes `ctx?: BlockRenderContext`; without it (tests, the no-argument entry point) it uses `{ editing: false, docKey: 'account.order', layout: 'storefront' }`.
   - Pure function, exported from `web/src/features/account/order-layout.ts` and unit-tested:
     ```ts
     export type OrderArea = 'head' | 'main' | 'side';
     const AREA: Record<string, OrderArea> = {
       OrderBackLink: 'head', OrderHeading: 'head', OrderBalance: 'main', OrderItems: 'main',
       OrderAddress: 'side', OrderParcels: 'side', OrderPayments: 'side',
     };
     /** Which order parts draw nothing for this order. */
     export function silentParts(order: OrderDetail): Set<string> {
       const silent = new Set<string>();
       const closed = order.status === 'cancelled' || order.status === 'refunded';
       if (!(order.outstandingBalance > 0) || closed) silent.add('OrderBalance');
       if (!order.shippingAddress) silent.add('OrderAddress');
       if (order.shipments.length === 0) silent.add('OrderParcels');
       if (order.payments.length === 0) silent.add('OrderPayments');
       return silent;
     }
     /**
      * Sorts a slot's items into the page's areas, keeping their order within each. An order part goes to its own
      * area. Any other block (a Section, a text block) goes by the order parts inside it: `side` when every one of
      * them is a side part, else `main`; with no order parts inside, `main`.
      */
     export function partitionOrderItems(items: readonly ComponentData[]): Record<OrderArea, ComponentData[]> {
       const out: Record<OrderArea, ComponentData[]> = { head: [], main: [], side: [] };
       for (const item of items) {
         const own = AREA[item.type];
         if (own) { out[own].push(item); continue; }
         const inner = flattenTypes([item]).slice(1).map((t) => AREA[t]).filter(Boolean);
         out[inner.length > 0 && inner.every((a) => a === 'side') ? 'side' : 'main'].push(item);
       }
       return out;
     }
     /** The side column exists only when something placed in it will draw. */
     export function sideDraws(side: readonly ComponentData[], silent: ReadonlySet<string>): boolean {
       return side.some((item) => {
         if (silent.has(item.type)) return false;
         const inner = flattenTypes([item]).slice(1);
         return inner.length === 0 || inner.some((t) => !silent.has(t));
       });
     }
     ```
   - Published site (`!ctx.editing`): `OrderDetailPage` renders
     ```tsx
     <div className={classes.overview} data-columns={two ? 'two' : 'one'}>
       <div className={classes.head}>{areas.head.map((i) => renderComponent(i, ctx))}</div>
       <div className={classes.main}>{areas.main.map((i) => renderComponent(i, ctx))}</div>
       {two ? <div className={classes.side}>{areas.side.map((i) => renderComponent(i, ctx))}</div> : null}
     </div>
     ```
     with `renderComponent` from `@/builder/render.tsx`, `areas = partitionOrderItems(content.items)` and `two = sideDraws(areas.side, silentParts(order))`. When `two` is false the side items render at the end of `.main` instead (they all draw nothing, but a wrapping content block may have its own content). DOM order is head, main, side, so on mobile payment comes before items, then address, parcels, history.
   - In the editor (`ctx.editing`): `content({ className: classes.overview })` as one column, so the slot stays one drop zone. Say so in a comment.
   - CSS: `.overview` is a single column with a gap. From `62em`, `.overview[data-columns='two']` is `grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr)`, `.head` spans both, `align-items: start`; the side column is `position: sticky; top: <header offset token>` only if the shell exposes one, otherwise static.
   - A stored arrangement that dropped `OrderParcels` or never gained `OrderAddress` therefore gets the same two columns for what it does place, and no empty column.
8. Motion: only what `web/src/lib/motion.ts` already provides; respect `prefers-reduced-motion`.
9. Accessibility: one `<h1>`; card titles are `<h2>`; every interactive target at least 44 px tall on touch; visible focus; colour is never the only signal for a status (the pill has text).

- [ ] **Step 1: Write the failing tests** (`account-order-overview.test.tsx`)

Use the harness of `account-order-pay.test.tsx` (mock `useOrder`, mock `@/api/orders.ts`). Cases, each a real assertion:

```ts
it('hides the account greeting and the section tabs on an order page, and keeps them on the list', …)
// render the account.order default doc through the builder's default renderer the way golden-stage4-account does;
// expect(screen.queryByRole('navigation', { name: 'Account sections' })).toBeNull();
// then render /account/orders and expect it present. Use the real aria-label text key value.

it('isOrderDetailPath matches only a single order', () => {
  expect(['/account/orders/K4M2QP', '/account/orders/K4M2QP/'].map(isOrderDetailPath)).toEqual([true, true]);
  expect(['/account/orders', '/account/orders/', '/account/profile', '/account/orders/A/b'].map(isOrderDetailPath)).toEqual([false, false, false, false]);
});

it('unpaid: the payment card leads with the amount and holds the method picker and Cancel order', …)
it('while the payment state loads there is a busy placeholder, not a bare figure, and Cancel order is already there', …)
it('when the payment state fails to load it says so, Try again refetches, and Cancel order is still offered', …)
// paymentMock.mockRejectedValueOnce(new ApiError('STOREFRONT_DISABLED', 503)); click Try again; expect 2 calls.
it('an unpaid order that cannot be paid online shows the help text and support links', …)
it('a paid order has no payment card', …)
it('a cancelled order with a balance on paper has no payment card', …)
it('shows the delivery address, skipping blank lines', …)
it('a collection order says Collect from with the point name and carrier', …)
it('no address: the address part draws nothing', …)
it('payment history says the status in plain words', …)
```

Fully written, the cases that carry the most risk:

```tsx
const address = { firstName: 'Ada', surname: 'Byron', addressLine1: '1 Mill Lane', addressLine2: null, addressLine3: '', city: 'Leeds', county: null, zip: 'LS1 1AA', country: 'GB', servicePoint: null };
const overview = () => document.querySelector('[data-columns]') as HTMLElement;

it('while the payment state loads there is a busy placeholder, not a bare figure, and Cancel order is already there', async () => {
  h.order = { ...base, canCancel: true, cancelBlockedBy: null };
  paymentMock.mockReturnValue(new Promise(() => {}));
  mount();
  const card = await screen.findByRole('region', { name: 'Payment needed' });
  expect(within(card).getByText('Loading payment options…')).toBeTruthy();
  expect(card.querySelector('[aria-busy="true"]')).toBeTruthy();
  expect(within(card).getByRole('button', { name: 'Cancel order' })).toBeTruthy();
  expect(within(card).queryByText(/Choose how to pay/)).toBeNull();
});

it('when the payment state fails to load it says so, Try again refetches, and Cancel order is still offered', async () => {
  h.order = { ...base, canCancel: true, cancelBlockedBy: null };
  paymentMock.mockRejectedValueOnce(new ApiError('STOREFRONT_DISABLED', 503));
  paymentMock.mockResolvedValue(publicOrder({ canPay: true, payBy: null, activePayment: null }));
  mount();
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain("We couldn't load the payment options.");
  expect(screen.getByRole('button', { name: 'Cancel order' })).toBeTruthy();
  fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText(/Choose how to pay/)).toBeTruthy();
  expect(paymentMock).toHaveBeenCalledTimes(2);
});

it('a paid order has no payment card and asks for no payment state', async () => {
  h.order = { ...base, outstandingBalance: 0, status: 'confirmed', canCancel: false, cancelBlockedBy: 'paid' };
  mount();
  await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
  expect(screen.queryByRole('region', { name: 'Payment needed' })).toBeNull();
  expect(paymentMock).not.toHaveBeenCalled();
});

it('a cancelled order with a balance on paper has no payment card', async () => {
  h.order = { ...base, status: 'cancelled', outstandingBalance: 46.03, canCancel: false, cancelBlockedBy: null };
  mount();
  await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
  expect(screen.queryByRole('region', { name: 'Payment needed' })).toBeNull();
});

it('shows the delivery address, skipping blank lines', async () => {
  h.order = { ...base, outstandingBalance: 0, status: 'confirmed', shippingAddress: address };
  mount();
  const card = await screen.findByRole('region', { name: 'Delivery address' });
  expect(card.textContent).toContain('Ada Byron');
  expect(card.textContent).toContain('1 Mill Lane');
  expect(card.textContent).toContain('LS1 1AA');
  expect(card.textContent).toContain('United Kingdom');
  expect(card.querySelectorAll('[data-address-line]')).toHaveLength(4); // name, line 1, city + postcode, country
});

it('a collection order says Collect from with the point name and carrier', async () => {
  h.order = { ...base, outstandingBalance: 0, status: 'confirmed', shippingAddress: { ...address, servicePoint: { name: 'Corner Shop', carrier: 'DPD' } } };
  mount();
  const card = await screen.findByRole('region', { name: 'Collect from' });
  expect(card.textContent).toContain('Corner Shop');
  expect(card.textContent).toContain('DPD');
});

it('two columns when the side column has something to draw, one when it has not', async () => {
  h.order = { ...base, outstandingBalance: 0, status: 'confirmed', shippingAddress: address };
  const first = mount();
  await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
  expect(overview().dataset.columns).toBe('two');
  first.unmount();
  h.order = { ...base, outstandingBalance: 0, status: 'confirmed', shippingAddress: null, shipments: [], payments: [] };
  mount();
  await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
  expect(overview().dataset.columns).toBe('one');
});
```

and in `web/test/order-layout.test.ts`, the pure functions:

```ts
import { describe, expect, it } from 'vitest';
import { partitionOrderItems, sideDraws, silentParts } from '@/features/account/order-layout.ts';

const b = (type: string, props: Record<string, unknown> = {}) => ({ type, props: { id: type, ...props } });
const order = { status: 'confirmed', outstandingBalance: 0, shippingAddress: null, shipments: [], payments: [] } as never;

describe('order page areas', () => {
  it('sorts parts into head, main and side, keeping their order', () => {
    const areas = partitionOrderItems([b('OrderPayments'), b('OrderHeading'), b('OrderItems'), b('OrderAddress'), b('OrderBalance'), b('OrderBackLink')]);
    expect(areas.head.map((i) => i.type)).toEqual(['OrderHeading', 'OrderBackLink']);
    expect(areas.main.map((i) => i.type)).toEqual(['OrderItems', 'OrderBalance']);
    expect(areas.side.map((i) => i.type)).toEqual(['OrderPayments', 'OrderAddress']);
  });
  it('a content block goes to the side only when every order part inside it is a side part', () => {
    const areas = partitionOrderItems([b('Section', { content: [b('OrderParcels')] }), b('Section', { content: [b('OrderParcels'), b('OrderItems')] }), b('RichText')]);
    expect(areas.side).toHaveLength(1);
    expect(areas.main).toHaveLength(2);
  });
  it('a stored arrangement that dropped the parcels part opens no empty side column', () => {
    expect(sideDraws([b('OrderAddress'), b('OrderPayments')], silentParts(order))).toBe(false);
    expect(sideDraws([b('OrderAddress')], silentParts({ ...(order as object), shippingAddress: {} } as never))).toBe(true);
  });
  it('a content block in the side column counts as drawing unless everything inside it is silent', () => {
    expect(sideDraws([b('Section', { content: [b('OrderParcels')] })], silentParts(order))).toBe(false);
    expect(sideDraws([b('RichText')], silentParts(order))).toBe(true);
  });
});
```

Write the remaining `…` bodies out in full with the same fixtures; no `it.todo`. `OrderAddress` renders each printed line with `data-address-line` so the blank-line rule is testable.

- [ ] **Step 2: Run and see them fail**

Run: `npm --prefix web test -- test/account-order-overview.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Register the part and the hiding rule**

`OrderAddress.tsx`:

```tsx
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrderFamily } from '@/builder/family-order.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** Where the order is going: the delivery address, or the collection point. Absent when the order has no address. */
export const block = defineBlock<{ id: string }>({
  name: 'OrderAddress', label: 'Delivery address', category: 'part', part: { family: 'order' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['account.order.address.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrderFamily.PartHost name="OrderAddress" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
```

`fields/OrderAddress.ts`: `export const fields = blockFields('OrderAddress');` with the neighbours' one-line comment. `order-container.ts`: `PARTS = ['OrderBackLink', 'OrderHeading', 'OrderBalance', 'OrderItems', 'OrderAddress', 'OrderParcels', 'OrderPayments']`. `test/helpers/stage4-parts.ts`: add `OrderAddress: { family: 'order', style: T('root', BOX, TEXT, VIS) }`. `builder-account-parts.test.tsx`: add it to the part lists. Regenerate `blocks.json`.

`AccountLayout.tsx`:

```ts
/** One order's own page: it is read on its own, so the account's greeting and section rail stay out of the way. */
export function isOrderDetailPath(pathname: string): boolean {
  return /^\/account\/orders\/[^/]+\/?$/.test(pathname);
}
```

and the first line of both `GreetingView` and `TabsView` after their hooks: `if (isOrderDetailPath(pathname)) return null;` reading `pathname` from `AccountFamily.useData()`. Update the layout's doc comment (it currently says the order page keeps the Orders section marked).

- [ ] **Step 4: Build the page with the frontend-design skill**

Implement the behaviour contract. Move the order-detail rules out of `Account.module.css` into `OrderDetail.module.css` only for classes no other account page uses (`grep` each class first). `OrderPaymentCard.tsx` owns the card and its states; `BalanceView` keeps the signature effect and renders it. Design direction for the skill: a calm commerce order page, generous spacing, one accent (the shop's `--sf-primary`) reserved for the payment card and the primary button, figures in tabular numerals, no decorative imagery; it must read correctly on a white modern theme, the bento card theme, cyber-brutalism's sharp corners and heavy type, and dark-luxury's dark surface, using only tokens.

- [ ] **Step 5: Preview states for the editor**

Add the six `OrderDetail` preview states, fixtures for each (`OrderDetail` + matching `PublicOrder`), and have `fixture-api.ts` answer `storefront/orders/:ref/payment` and `…/payment-options` per state. Update `builder-editor-preview-states.test.tsx` and any test that enumerates preview states.

- [ ] **Step 6: Goldens and text**

Regenerate `stage4-account-order-*` and `stage4-account-nav-tab-order` goldens; add `stage4-account-order-unpaid-loading`, `-unpaid-error`, `-collection`, `-cancelled`. Read every diff. New text keys get notes; update `text-inventory.json` only for literals that changed or were removed.

- [ ] **Step 7: Verify and commit**

Run: `TZ=UTC npm test` and `npm run build` — Expected: PASS.

```bash
git add <the paths git status lists for this task>
git commit -m "feat(account): the order page is an order overview: pay first, then items, address, parcels and payment history"
```

### Task 11: e2e mocks and specs

**Files:**
- Modify: `e2e/mocks.ts`, `e2e/unpaid-orders.spec.ts`, `e2e/payment-methods.spec.ts`, `e2e/dom-parity.spec.ts`, `e2e/page-sets.ts`, `e2e/shell-cart-account-parts.spec.ts`, `e2e/text.spec.ts`, `e2e/__baseline__/dom-account-*.txt`

- [ ] **Step 1: Session routes in the mock backend**

In `e2e/mocks.ts` add handlers for `storefront/orders/:ref/payment`, `…/payment-options`, `…/payment-method`, `…/crypto-txid`, backed by the order states the deleted key handlers used, and add `shippingAddress` to the mocked order detail. Add named order fixtures: unpaid with no method, unpaid with a hosted checkout open, unpaid crypto, paid and shipped with two parcels, collection-point order, cancelled.

- [ ] **Step 2: Specs**

`unpaid-orders.spec.ts`: (a) signed in with an unpaid order → the pop-up shows on `/`; "Not now" hides it; navigating within the site keeps it hidden; `page.reload()` shows it again; (b) "Review or cancel order" lands on `/account/orders/<ref>` with the payment card visible and no account tabs; (c) Cancel order → the dialog has no close button, clicking the overlay leaves it open, "Keep order" closes it, "Yes, cancel order" cancels and the page shows the cancelled state with no payment card; (d) choosing a hosted method shows the checkout button; (e) a signed-out visit to `/order/<ref>/<key>` ends on `/login` with `returnTo=/account/orders/<ref>`, and after signing in lands on the order; (f) signed-out visitors get no pop-up.
`payment-methods.spec.ts`: repoint from the link page to the account order page.
`dom-parity.spec.ts` / `page-sets.ts`: the `account-order` case uses the shipped-with-address fixture.

- [ ] **Step 3: Run and regenerate baselines**

Run: `TZ=UTC npm run test:e2e` (the config starts its own preview server; if port 3000 is taken see the config for the port variable). Regenerate `dom-account-*` baselines with the spec's documented update flag and read the diff: account list / loyalty / referrals / profile baselines must be unchanged apart from nothing; only `dom-account-order-*` may change. If the unrelated ones change, stop and find out why.

- [ ] **Step 4: Commit**

```bash
git add e2e/mocks.ts e2e/unpaid-orders.spec.ts e2e/payment-methods.spec.ts e2e/dom-parity.spec.ts e2e/page-sets.ts e2e/__baseline__/dom-account-order-storefront-390.txt e2e/__baseline__/dom-account-order-storefront-1280.txt e2e/__baseline__/dom-account-order-menu-390.txt e2e/__baseline__/dom-account-order-menu-1280.txt e2e/__baseline__/dom-account-order-webapp-390.txt e2e/__baseline__/dom-account-order-webapp-1280.txt
git commit -m "test(e2e): the order overview, the pop-up and the cancel dialog on the mock backend"
```

(Add any other spec file this task changed, by path.)

### Task 12: Browser check on every template

**Files:**
- Create: `e2e/order-overview-visual.spec.ts` (kept in the repo, skipped unless `ORDER_OVERVIEW_SHOTS=1`), screenshots under `e2e/screenshots/order-overview/` (git-ignored)

- [ ] **Step 1: The matrix**

A Playwright spec that, for each template (`modern`, `bento`, `cyber-brutalism`, `dark-luxury`: set through the mocked settings the way existing template e2e specs do; find one with `grep -rln "dark-luxury" e2e`) × layout (`storefront`, `menu`, `webapp`) × viewport (390×844, 1280×900) × order state (the six fixtures of Task 11), opens `/account/orders/<ref>`, waits for the payment card or the heading, and saves a full-page screenshot named `<template>-<layout>-<width>-<state>.png`. Plus, per template at both widths: the cancel dialog open, and the pop-up on `/`. That is 4 × 3 × 2 × 6 + 4 × 2 × 2 = 160 images.

- [ ] **Step 2: Run it**

Run: `ORDER_OVERVIEW_SHOTS=1 TZ=UTC npx playwright test -c e2e/playwright.config.ts e2e/order-overview-visual.spec.ts`

- [ ] **Step 3: Look at them**

Open every 390 px image and every 1280 px image for the unpaid-no-method and shipped states on all four templates, and a sample of the rest. Check against this list and write the result of each check into the task report, with the file name of any image that fails:

- nothing overflows horizontally; no clipped text; long product names and long method names wrap
- the payment card is the first thing below the heading on mobile and is visually dominant
- the primary button is one clear call to action; Cancel order is quiet but findable
- two columns at 1280 with no empty side column; the paid state does not leave a hole where the payment card was
- text contrast is readable on dark-luxury and cyber-brutalism; borders and radii follow the template
- no account greeting or tabs
- the dialog fits a 390 px screen with both buttons fully visible and at least 44 px tall
- webapp layout: nothing sits under the Telegram bottom bar

- [ ] **Step 4: Fix and repeat**

Fix what the check finds in `OrderDetail.module.css` (tokens first; a template-scoped rule `:root[data-sf-template="X"] …` in that template's `template.css` only when tokens cannot express it). Re-run Step 2 for the affected templates and re-check. Then `TZ=UTC npm test`.

- [ ] **Step 5: Commit**

```bash
git add e2e/order-overview-visual.spec.ts <any css or template files changed>
git commit -m "test(e2e): order overview screenshots across templates, layouts and widths; fixes from the browser check"
```

---

## After the plan

- Whole-branch review of both repos, then `superpowers:finishing-a-development-branch`.
- Storefront release, per standing practice: merge to `main`, then a `chore(release): web 0.18.0` commit and tag `v0.18.0` after `TZ=UTC npm test` passes on `main`. Do not push without being asked.
- Deploy order to state in the hand-off: backend, then storefront.
- Not verified by this work: real payment processors, the live Telegram Mini App, a real shop's stored page set.
