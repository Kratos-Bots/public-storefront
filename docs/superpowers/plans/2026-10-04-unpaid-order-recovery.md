# Unpaid Order Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer with an unpaid order can pay or choose a payment method from their account order page, is asked on arrival whether to complete or cancel it, and can cancel it themselves; and every cancellation returns store credit, releases the coupon use and closes pending payments.

**Architecture:** Backend: cancellation side effects move into one module called from `updateOrder`'s existing transaction; a pure eligibility function gates two new customer cancel routes (session and access key); order views expose `canCancel`; a shared helper flags payments that land on a closed order. Storefront: the account order page embeds the existing `PaymentSection` (no second payment implementation), a shared `CancelOrder` control serves three places, and a frame-level pop-up is driven by a pure rules module.

**Tech Stack:** Backend: Express 5, Drizzle (Postgres), zod 4, vitest, PGlite for integration tests. Storefront: React 19, Vite, Mantine, TanStack Query, ky, vitest + Testing Library, Playwright.

**Spec:** `ecommerce-storefront/docs/superpowers/specs/2026-10-04-unpaid-order-recovery-design.md`

Two repos under `T:\Projects\ecommerce\`:

- `ecommerce-backend/` on a new branch `feature/unpaid-order-recovery` (Tasks 1 to 4).
- `ecommerce-storefront/` on the existing branch `feature/unpaid-order-recovery` (Tasks 5 to 8).

## Global Constraints

- Backend: extensionless imports; throw `AppError` subclasses, never catch-and-return; every query inside a transaction uses `tx`; side effects (socket events, queue jobs, notifications) run after commit. No migration: if `npm run db:generate` produces one, stop and report.
- Any path that fails a payment calls `releasePaymentFee(orderId, paymentId, tx)` in the same transaction as the status write.
- A balance write locks the customer row `FOR UPDATE` and writes a `store_credit_log` row with before and after balances.
- Customer cancel rule: `status === 'pending'`; no `completed` payment; no payment in any status with a manual or offline method (`isAdminReconciledPayments`); no crypto payment with a transaction ID. A refused cancel is `409` with message `ORDER_NOT_CANCELLABLE:<reason>`, reason one of `not_pending`, `paid`, `bank_transfer`, `crypto_submitted`.
- The customer cancel reason text is exactly `Cancelled by customer`.
- A non-owner and an unknown reference are both `404` on session routes; a bad access key and an unknown reference are both `404` on access-key routes.
- Nothing reinstates an order automatically.
- Storefront: `@/` alias imports **with** `.ts`/`.tsx` extensions; wording only through editable-text keys with a note and a `max`; no unreferenced key; `web/test/helpers/text-inventory.json` is frozen. No second payment implementation: the account page uses `features/order-status/PaymentSection.tsx` as is.
- The pop-up never shows on `/checkout`, `/order/*`, `/payment/*`, `/order-placed`, `/account/orders/*`, `/login*`, `/auth/*`, or in the page builder; at most once per visit; "Not now" lasts until the next visit (`sessionStorage`).
- Against an older backend (no `accessKey`, no `canCancel`, no `orders/unpaid`): the account page renders as today, no cancel control appears, the pop-up lookup fails quietly.
- Goldens and DOM baselines are regenerated only in Task 8, only where a diff is fully explained by this plan, each diff read in full.
- Storefront release is `web` 0.16.0, tag `v0.16.0`; `TZ=UTC npm test` before tagging. Deploy backend first.
- Do not run Docker. Do not push, merge or deploy without the owner's say-so. Do not start the backend dev server or touch any configured database (the local `.env` points at a live one); integration tests use PGlite only.
- Git: stage only named files. The storefront working tree is CRLF with LF in the index: keep each file's endings, check `git diff --numstat`. Write files with the Write/Edit tools. Commit trailers, both lines:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01HAtBukqatpqJEquLeqLcz5`
- UI tasks (6 and 7) go to a Sonnet subagent that loads the `frontend-design:frontend-design` skill.

## Review Focus

1. A staff member cancels an order that was part-paid with store credit and had a coupon: the credit must come back exactly once, the coupon use must be released, and cancelling an already-cancelled order must not credit again. Tests in Task 1.
2. A customer cancels while a hosted checkout tab is open, then pays in that tab: the payment must be recorded and flagged for staff, the order must stay cancelled. Tests in Tasks 1 and 2.
3. Two cancel requests arrive together (double click, or the pop-up and the page): one succeeds, the other gets `409 ORDER_NOT_CANCELLABLE:not_pending`, store credit is returned once. Test in Task 3.
4. A customer signed in on a shared device opens the site: the pop-up must only ever show their own orders, and a guest must never be shown an order from the signed-in lookup. Test in Task 7.
5. The pop-up must not block checkout or payment: it must not appear on the checkout, order and payment return pages, and "Not now" must hold for the rest of the visit across route changes. Test in Task 7.

## File Structure

Backend (`ecommerce-backend/src/`):

| File | Responsibility |
|---|---|
| `modules/orders/cancellation.ts` (new) | What a cancellation does to money: store credit back, coupon released, pending payments failed |
| `modules/orders/service.ts` | `updateOrder` calls it inside its transaction |
| `db/schema/store-credit-log.ts` | New movement type `order_refund` (TypeScript enum only) |
| `modules/payment-gateways/late-payment.ts` (new) | Shared "paid after the order was closed" note |
| `modules/payment-gateways/hosted-link-reconcile.ts`, `modules/webhooks/*.ts`, `modules/payment-gateways/crypto/verification.ts` | Call the helper |
| `modules/orders/customer-cancel.ts` (new) | Pure eligibility + `cancelOrderAsCustomer` |
| `modules/public-orders/{router,controller,service}.ts`, `modules/public-storefront/{router,controller,account}.ts` | Routes; `canCancel`, `cancelBlockedBy`, `accessKey`; unpaid lookup |

Storefront (`ecommerce-storefront/web/`):

| File | Responsibility |
|---|---|
| `src/types/{orders,public-order}.ts`, `src/api/{orders,public-order}.ts` | Types and calls |
| `src/features/order-status/CancelOrder.tsx` (new) | The cancel control (button, confirm, refused, blocked) |
| `src/features/account/OrderDetailPage.tsx` | Payment section and cancel in the balance part |
| `src/features/order-status/order-status-parts.tsx` | Cancel in the payment part |
| `src/features/unpaid-prompt/rules.ts` (new) | Pure: where the pop-up may show, which guest orders to check, which order to show |
| `src/features/unpaid-prompt/UnpaidOrderPrompt.tsx`, `useUnpaidOrder.ts` (new) | The pop-up |
| `src/layouts/{StorefrontShell,MenuShell,WebAppShell}.tsx` | Mount it |

---

### Task 1: Backend, what a cancellation does

**Repo:** `ecommerce-backend`. Start with `git checkout main && git checkout -b feature/unpaid-order-recovery`.

**Files:**
- Create: `src/modules/orders/cancellation.ts`, `src/modules/orders/cancellation.test.ts`, `src/modules/orders/cancellation.integration.test.ts`
- Modify: `src/db/schema/store-credit-log.ts` (the `movementType` enum)
- Modify: `src/modules/orders/service.ts` (`updateOrder`, inside its transaction, in the `input.status === 'cancelled' && existing.status !== 'cancelled'` block)
- Modify: `CLAUDE.md` (Orders bullet)

**Interfaces:**
- Produces: `storeCreditToReturn(payments): number`; `applyCancellationEffects(tx, order, deps): Promise<CancellationEffects>` where `deps = { releasePaymentFee }` and `CancellationEffects = { storeCreditReturned: number; couponReleased: boolean; paymentsFailed: number[] }`.

- [ ] **Step 1: Write the failing unit test**

Create `src/modules/orders/cancellation.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/client', () => ({ db: {} }));

import { storeCreditToReturn } from './cancellation';

const p = (method: string, status: string, amount: number) => ({ method, status, amount });

describe('storeCreditToReturn', () => {
  it('sums completed store-credit payments only', () => {
    expect(storeCreditToReturn([
      p('store_credit', 'completed', 10), p('store_credit', 'completed', 2.5),
      p('store_credit', 'refunded', 4), p('store_credit', 'failed', 4), p('stripe', 'completed', 30),
    ])).toBe(12.5);
  });
  it('is zero with none', () => {
    expect(storeCreditToReturn([p('stripe', 'pending', 30)])).toBe(0);
    expect(storeCreditToReturn([])).toBe(0);
  });
  it('rounds to pennies', () => {
    expect(storeCreditToReturn([p('store_credit', 'completed', 0.1), p('store_credit', 'completed', 0.2)])).toBe(0.3);
  });
});
```

Run: `npx vitest run src/modules/orders/cancellation.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 2: Add the movement type**

In `src/db/schema/store-credit-log.ts`, change the `movementType` enum to `['redemption_credit', 'order_payment', 'order_refund', 'manual_adjustment', 'balance_rebuild']`. It is a TypeScript-level enum on a `text` column. Run `npm run db:generate`: it must report no schema changes and create no file under `drizzle/`. If it creates a migration, delete nothing, stop and report.

Search the codebase for every place that switches on or lists store-credit movement types (`grep -rn "order_payment" src`) and add `order_refund` wherever a list or label map would otherwise reject or mislabel it (for example a zod enum on a list filter, or a label map). `rebuildCustomerBalances` must count it: confirm it sums `amountChange` over all rows rather than by type; if it filters by type, add the new one.

- [ ] **Step 3: Implement the module**

Create `src/modules/orders/cancellation.ts`:

```ts
// What cancelling an order does to money. Stock is restored by updateOrder
// itself; this is the rest, and it runs inside updateOrder's transaction so a
// cancellation is all or nothing.
import { and, eq } from 'drizzle-orm';
import type { Executor } from '../../db/client';
import { customers } from '../../db/schema/customers';
import { payments } from '../../db/schema/payments';
import { storeCreditLog } from '../../db/schema/store-credit-log';
import { round2 } from '../payment-gateways/fees';
import { removeCouponUsage } from '../coupons/service';

export interface CancellationEffects {
  storeCreditReturned: number;
  couponReleased: boolean;
  /** Ids of the pending payments that were closed. */
  paymentsFailed: number[];
}

interface CancellableOrder {
  id: number;
  reference: string;
  customerId: number | null;
  couponId: number | null;
}

/** Store credit actually spent on the order: its completed store-credit payments. */
export function storeCreditToReturn(rows: ReadonlyArray<{ method: string; status: string; amount: number }>): number {
  return round2(rows.filter((p) => p.method === 'store_credit' && p.status === 'completed').reduce((sum, p) => sum + p.amount, 0));
}

/**
 * Called once, when an order becomes `cancelled`, inside the caller's
 * transaction (`tx`).
 *  - Store credit spent on the order goes back to the customer, with a ledger
 *    row, and those payments become `refunded` — which is also what stops a
 *    second call from crediting twice.
 *  - The coupon's use is released, so a single-use code can be used again.
 *  - Pending payments are closed as `failed` and their fee adjustment unwound
 *    (`releasePaymentFee`, the one permitted unwind). Rows are kept so a late
 *    webhook still finds its payment and can be flagged for staff.
 * `releasePaymentFee` is passed in because it lives in orders/service.ts, which
 * imports this module.
 */
export async function applyCancellationEffects(
  tx: Executor,
  order: CancellableOrder,
  deps: { releasePaymentFee: (orderId: number, paymentId: number, executor: Executor) => Promise<number> },
): Promise<CancellationEffects> {
  const rows = await tx.select().from(payments).where(eq(payments.orderId, order.id));

  // --- Store credit back to the customer.
  const credit = storeCreditToReturn(rows);
  let storeCreditReturned = 0;
  if (credit > 0 && order.customerId) {
    // FOR UPDATE for the same reason addPayment takes it: this writes an
    // absolute balance computed here.
    const customer = (await tx.select().from(customers).where(eq(customers.id, order.customerId)).for('update').limit(1))[0];
    if (customer) {
      const balanceAfter = round2(customer.storeCreditBalance + credit);
      await tx.update(customers).set({ storeCreditBalance: balanceAfter }).where(eq(customers.id, customer.id));
      await tx.insert(storeCreditLog).values({
        customerId: customer.id,
        movementType: 'order_refund',
        amountChange: credit,
        balanceBefore: customer.storeCreditBalance,
        balanceAfter,
        reason: `Order ${order.reference} cancelled`,
        referenceType: 'order',
        referenceId: order.reference,
      });
      await tx.update(payments).set({ status: 'refunded' })
        .where(and(eq(payments.orderId, order.id), eq(payments.method, 'store_credit'), eq(payments.status, 'completed')));
      storeCreditReturned = credit;
    }
  }

  // --- Coupon use released.
  let couponReleased = false;
  if (order.couponId) {
    await removeCouponUsage(order.couponId, order.id, tx);
    couponReleased = true;
  }

  // --- Pending payments closed.
  const paymentsFailed: number[] = [];
  for (const payment of rows.filter((p) => p.status === 'pending')) {
    const note = 'Order cancelled';
    await tx.update(payments)
      .set({ status: 'failed', notes: payment.notes ? `${payment.notes}\n${note}` : note })
      .where(eq(payments.id, payment.id));
    await deps.releasePaymentFee(order.id, payment.id, tx);
    paymentsFailed.push(payment.id);
  }

  return { storeCreditReturned, couponReleased, paymentsFailed };
}
```

Check the real names before relying on them: `Executor` is exported from `src/db/client.ts`; `round2` from `src/modules/payment-gateways/fees.ts`; `removeCouponUsage(couponId, orderId, executor)` from `src/modules/coupons/service.ts`. If `coupons/service` imports `orders/service` (a cycle that breaks at load), import `removeCouponUsage` lazily inside the function instead and say so in the report.

Run: `npx vitest run src/modules/orders/cancellation.test.ts`
Expected: PASS.

- [ ] **Step 4: Call it from `updateOrder`**

In `src/modules/orders/service.ts`, add `import { applyCancellationEffects } from './cancellation';`. Inside the transaction in `updateOrder`, directly after the stock-restore block that ends with `for (const op of stockOps) stockTouches.push(…)` and its closing brace (the `if (input.status === 'cancelled' && existing.status !== 'cancelled') { … }` block), add:

```ts
    // Money: store credit back, coupon use released, pending payments closed.
    // Same transaction as the stock restore, so a cancellation is all or nothing.
    if (input.status === 'cancelled' && existing.status !== 'cancelled') {
      cancellation = await applyCancellationEffects(tx, existing, { releasePaymentFee });
    }
```

Declare `let cancellation: CancellationEffects | null = null;` beside `const stockTouches: StockTouch[] = [];` (import the type). After the transaction commits, where `order:updated` is emitted, add one `emitEvent('payment:updated', { orderId: id, paymentId })` per id in `cancellation?.paymentsFailed ?? []`, matching the payload shape other `payment:updated` emits in this file use (read one first).

`existing` must carry `reference`, `customerId` and `couponId`: it is the full order row loaded at the top of `updateOrder`; confirm.

- [ ] **Step 5: Write the integration test**

Create `src/modules/orders/cancellation.integration.test.ts`, modelled on `src/modules/promotions/pricing.integration.test.ts`: copy its header (the PGlite availability check, the `vi.mock('../../db/client', …)` factory, the other `vi.mock` calls it needs for `createOrder`/`updateOrder`, the `migrate()` helper, the `describe.skipIf(!pgliteAvailable)` wrapper and its `beforeAll` seeding of a warehouse, a category and a product). Read that file in full first and reuse its seeding helpers by copying them; do not import from a test file.

Cases (each creates its own order through the real `createOrder`, pays as described through the real `addPayment`, then cancels through the real `updateOrder(id, { status: 'cancelled', reason: 'test' })`):

```ts
it('returns store credit spent on the order, once, with a ledger row', async () => {
  // customer with storeCreditBalance 20; order total 30; addPayment store_credit 12
  // → balance 8. Cancel → balance 20; the store_credit payment is 'refunded';
  // one store_credit_log row { movementType: 'order_refund', amountChange: 12,
  // balanceBefore: 8, balanceAfter: 20, referenceId: order.reference }.
});
it('releases the coupon use', async () => {
  // single-use coupon applied at createOrder → usageCount 1, one coupon_usages row.
  // Cancel → usageCount 0, no coupon_usages row for the order.
});
it('fails pending payments and unwinds their fee', async () => {
  // a pending offline payment row inserted with feeAmount 1.5 and the order's
  // paymentFeeAmount/totalAmount raised by 1.5 (insert directly; no gateway call).
  // Cancel → payment 'failed', notes contain 'Order cancelled', feeAmount 0,
  // order.paymentFeeAmount back by 1.5 and totalAmount back by 1.5.
});
it('an order with no store credit, coupon or pending payment cancels as before', async () => {
  // only stock restored; no ledger rows; no payment rows changed.
});
it('cancelling does not touch a completed gateway payment', async () => {
  // a completed 'stripe' row stays 'completed'.
});
it('a second cancel is refused and credits nothing', async () => {
  // updateOrder to 'cancelled' again throws (cancelled → cancelled is not an allowed
  // transition); the customer's balance and the ledger are unchanged.
});
```

Write each case out in full with the fixtures the copied helpers provide; the comments above state exactly what to set up and assert. Install PGlite for the run without saving it: `npm install --no-save @electric-sql/pglite`, then `npx vitest run src/modules/orders/cancellation.integration.test.ts`. All six must pass. If PGlite cannot be installed in this environment, say so, and keep the suite (it skips itself).

- [ ] **Step 6: Run everything**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, clean. Existing tests that cancel an order and then assert on payments, coupon usage or store credit may need their expectations updated to the new behaviour; change only expectations that describe the old gap, and list each in the report.

- [ ] **Step 7: Document and commit**

`CLAUDE.md`, Orders bullet: after the sentence about `ALLOWED_STATUS_TRANSITIONS`, add: `Cancelling (`updateOrder` → `cancelled`, from staff, the auto-cancel job or a customer) also runs `applyCancellationEffects` (`orders/cancellation.ts`) in the same transaction as the stock restore: store credit spent on the order is returned to the customer (`store_credit_log` movement `order_refund`, the store-credit payments become `refunded`), the coupon use is released, and pending payments become `failed` with `releasePaymentFee`. Rows are kept so a late webhook still finds its payment.`

```bash
git add src/modules/orders/cancellation.ts src/modules/orders/cancellation.test.ts src/modules/orders/cancellation.integration.test.ts src/db/schema/store-credit-log.ts src/modules/orders/service.ts CLAUDE.md
git commit -m "feat(orders): a cancellation returns store credit, releases the coupon use and closes pending payments"
```

(Add any other file Step 2 or Step 6 made you touch.)

---

### Task 2: Backend, flag money that arrives after a cancellation

**Files:**
- Create: `src/modules/payment-gateways/late-payment.ts`, `src/modules/payment-gateways/late-payment.test.ts`, `src/modules/payment-gateways/late-payment-wiring.test.ts`
- Modify: `src/modules/payment-gateways/hosted-link-reconcile.ts` (use the helper; keep `CANCELLED_NOTE_MARKER` exported from here by re-export)
- Modify: `src/modules/webhooks/stripe.ts`, `paypal.ts`, `revolut.ts`, `oxapay.ts`, `wise.ts`, `paygate.ts`, `nexapay.ts` (the branch that sets a payment `completed`)
- Modify: `src/modules/payment-gateways/crypto/verification.ts` (the success branch)
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: `lateNoteFor(label: string, when: string): string`; `needsLateNote(orderStatus: string, notes: string | null): boolean`; `flagPaymentOnClosedOrder(payment: { id: number; orderId: number; notes: string | null }, label: string, paidAt?: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing unit test**

Create `src/modules/payment-gateways/late-payment.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/client', () => ({ db: {} }));
vi.mock('../../lib/emitter', () => ({ emitEvent: vi.fn() }));

import { CANCELLED_NOTE_MARKER, lateNoteFor, needsLateNote } from './late-payment';

describe('late payment note', () => {
  it('is needed only for a cancelled or refunded order', () => {
    expect(needsLateNote('cancelled', null)).toBe(true);
    expect(needsLateNote('refunded', null)).toBe(true);
    for (const status of ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'partially_shipped']) {
      expect(needsLateNote(status, null)).toBe(false);
    }
  });
  it('is written once', () => {
    const note = lateNoteFor('Stripe', '2026-10-04T10:00:00.000Z');
    expect(note).toContain(CANCELLED_NOTE_MARKER);
    expect(note).toContain('Stripe');
    expect(needsLateNote('cancelled', `earlier\n${note}`)).toBe(false);
  });
});
```

Run: `npx vitest run src/modules/payment-gateways/late-payment.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement the helper**

Create `src/modules/payment-gateways/late-payment.ts`:

```ts
import { eq } from 'drizzle-orm';
import pino from 'pino';
import { db } from '../../db/client';
import { orders } from '../../db/schema/orders';
import { payments } from '../../db/schema/payments';
import { emitEvent } from '../../lib/emitter';

const logger = pino({ name: 'late-payment' });

/** The fixed text a late-payment note is recognised by (so it is written once). */
export const CANCELLED_NOTE_MARKER = 'after order was cancelled';

export function lateNoteFor(label: string, when: string): string {
  return `Paid on ${label} ${when} ${CANCELLED_NOTE_MARKER} — needs review`;
}

export function needsLateNote(orderStatus: string, notes: string | null): boolean {
  if (orderStatus !== 'cancelled' && orderStatus !== 'refunded') return false;
  return !notes?.includes(CANCELLED_NOTE_MARKER);
}

/**
 * A cancelled or refunded order has had its stock restored, so money arriving
 * for it must not revive it. Every path that completes a payment calls this
 * afterwards: it leaves one note on the payment for a human and tells the admin
 * screens. Returns true when it flagged. Never throws: a webhook must not fail
 * over a note.
 */
export async function flagPaymentOnClosedOrder(
  payment: { id: number; orderId: number; notes: string | null },
  label: string,
  paidAt?: string,
): Promise<boolean> {
  try {
    const order = (await db.select({ status: orders.status }).from(orders).where(eq(orders.id, payment.orderId)).limit(1))[0];
    if (!order || !needsLateNote(order.status, payment.notes)) return false;
    const note = lateNoteFor(label, paidAt ?? new Date().toISOString());
    await db.update(payments).set({ notes: payment.notes ? `${payment.notes}\n${note}` : note }).where(eq(payments.id, payment.id));
    logger.warn({ paymentId: payment.id, orderId: payment.orderId, orderStatus: order.status }, `${label} payment landed on a closed order`);
    emitEvent('payment:updated', { orderId: payment.orderId, paymentId: payment.id });
    return true;
  } catch (err) {
    logger.error({ err, paymentId: payment.id }, 'Could not flag a late payment');
    return false;
  }
}
```

Match the `payment:updated` payload to what other emits of that event use (read one in `src/modules/orders/service.ts`).

In `hosted-link-reconcile.ts`: replace the body of the private `flagIfOrderNotPending` with a call to `flagPaymentOnClosedOrder(payment, provider.label, paidAt)`, and replace its own `CANCELLED_NOTE_MARKER` constant with `export { CANCELLED_NOTE_MARKER } from './late-payment';` so existing importers keep working. Behaviour for hosted-link gateways must be unchanged: the same note text, written once. Existing tests of the hosted-link note (`scripts/verify-*` aside) must still pass.

Run: `npx vitest run src/modules/payment-gateways`
Expected: PASS.

- [ ] **Step 3: Write the failing wiring test**

Create `src/modules/payment-gateways/late-payment-wiring.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The webhook handlers need a live provider payload and a database to drive, so
// (as checkout-contact-capture.test.ts does) the wiring is pinned on the source:
// every place that completes a payment flags it when the order is closed.
const read = (rel: string) => readFileSync(join(process.cwd(), 'src', rel), 'utf8');

describe('every completion path flags a payment on a closed order', () => {
  it.each([
    'modules/webhooks/stripe.ts',
    'modules/webhooks/paypal.ts',
    'modules/webhooks/revolut.ts',
    'modules/webhooks/oxapay.ts',
    'modules/webhooks/wise.ts',
    'modules/webhooks/paygate.ts',
    'modules/webhooks/nexapay.ts',
    'modules/payment-gateways/crypto/verification.ts',
    'modules/payment-gateways/hosted-link-reconcile.ts',
  ])('%s', (file) => {
    expect(read(file)).toMatch(/flagPaymentOnClosedOrder\(/);
  });
});
```

Run it: the seven webhook files and `verification.ts` FAIL.

- [ ] **Step 4: Wire the handlers**

In each of the seven webhook handlers and in the success branch of `crypto/verification.ts`, find the statement that sets a payment's status to `completed` and the `confirmOrderIfFullyPaid(…)` call that follows it. Directly after the status write (before or after `confirmOrderIfFullyPaid`, whichever keeps the handler's existing order of operations intact), add:

```ts
    await flagPaymentOnClosedOrder(payment, '<Label>');
```

with the label the processor is known by (`'Stripe'`, `'PayPal'`, `'Revolut'`, `'OxaPay'`, `'Wise'`, `'Paygate.to'`, `'NexaPay'`, `'Crypto'`), and `payment` the row the handler already loaded (it needs `id`, `orderId`, `notes`; if the handler selected only some columns, add `notes` to the selection). Import from `'../payment-gateways/late-payment'` (webhooks) or `'../late-payment'` (crypto). Do not change what any handler does for a pending order; do not add the call to failure branches. Monzo is not touched (it has its own, stricter handling).

If a handler listed here does not exist as a file or does not complete payments, do not invent code: remove it from the wiring test's list and say so in the report.

Run: `npx vitest run src/modules/payment-gateways src/modules/webhooks && npm test && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 5: Keep late payments detectable now that cancellation closes pending payments**

Task 1 makes a cancellation mark the order's pending payments `failed`. Two existing mechanisms only look at `pending` payments and would otherwise stop noticing money that arrives for a cancelled order:

1. **Hosted-link sweeps** (`runHostedLinkReconcile` in `hosted-link-reconcile.ts`, used by the Sushipp, Orderify and Peer Pay reconcile jobs; the Sushipp webhook in particular is sometimes never delivered, which is why the sweep exists). Read the sweep's candidate query. Extend it so that, within the same `maxAgeMs` window and `maxPerRun` cap, it also polls payments of that method that are `failed` AND whose order is `cancelled` or `refunded` AND that have an `externalId`. A paid result for such a row goes through the existing `settleHostedLinkPaid`, which completes it and leaves the note. Pending payments keep priority (order the candidates so pending rows come first). Add a unit test in the style of the existing reconcile tests (find them: `*reconcile*.test.ts` or the `scripts/verify-*-reconcile.ts` stubs) for the candidate selection if it can be expressed as a pure function; otherwise extract the predicate into one and test that.
2. **Monzo** (`src/modules/webhooks/monzo.ts`): it matches an incoming credit against `pending` Monzo payments by order reference, and calls `handleCreditAgainstNonPendingOrder` when the matched payment's order is not pending. After Task 1 a cancelled order's Monzo payment is `failed`, so it would no longer be a candidate and the credit would pass unnoticed. Read the handler and extend the candidate query to also include `failed` Monzo payments whose order is `cancelled` or `refunded` (reference match as today); for those, keep calling `handleCreditAgainstNonPendingOrder` exactly as it does now for a pending payment on a non-pending order. Do not change how a credit for a pending order is matched or confirmed. Add or extend the Monzo handler's test (search `monzo` under `src/**/**.test.ts`) with: a credit whose text names a cancelled order with a failed Monzo payment leaves the review note and completes nothing.

If either file's structure makes this more than a small, local change, stop and report NEEDS_CONTEXT with what you found instead of restructuring.

- [ ] **Step 6: Document and commit**

`CLAUDE.md`, in the Hosted-link gateway core bullet, add: `The "paid after the order was cancelled, needs review" note now lives in `payment-gateways/late-payment.ts` (`flagPaymentOnClosedOrder`) and is called by every path that completes a payment (the Stripe, PayPal, Revolut, OxaPay, Wise, Paygate.to and NexaPay webhooks and crypto verification as well as the hosted-link settle path). It never reinstates an order. Because a cancellation now closes pending payments as `failed`, the hosted-link sweeps and the Monzo matcher also consider failed payments of cancelled or refunded orders, so money arriving late is still noticed.`

```bash
git add src/modules/payment-gateways/late-payment.ts src/modules/payment-gateways/late-payment.test.ts src/modules/payment-gateways/late-payment-wiring.test.ts src/modules/payment-gateways/hosted-link-reconcile.ts src/modules/payment-gateways/crypto/verification.ts src/modules/webhooks CLAUDE.md
git commit -m "feat(payments): every processor flags money that arrives after an order was cancelled"
```

---

### Task 3: Backend, customers cancel their own unpaid order

**Files:**
- Create: `src/modules/orders/customer-cancel.ts`, `src/modules/orders/customer-cancel.test.ts`
- Modify: `src/modules/public-orders/{router,controller,service}.ts`
- Modify: `src/modules/public-storefront/{router,controller,account}.ts`
- Extend: `src/modules/orders/cancellation.integration.test.ts`
- Modify: `STOREFRONT.md`, `CLAUDE.md`

**Interfaces:**
- Produces: `customerCancelEligibility(order, payments, cryptoTxidPaymentIds): { allowed: true } | { allowed: false; reason: CancelBlock }` with `CancelBlock = 'not_pending' | 'paid' | 'bank_transfer' | 'crypto_submitted'`; `cancelBlockedBy(eligibility): 'paid' | 'bank_transfer' | 'crypto_submitted' | null`; `loadCancelEligibility(orderId)`; `cancelOrderAsCustomer(orderId)`. Routes `POST /public/storefront/orders/:reference/cancel` and `POST /public/orders/:reference/:accessKey/cancel`, both answering `{ reference, status: 'cancelled' }`.

- [ ] **Step 1: Write the failing unit test**

Create `src/modules/orders/customer-cancel.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/client', () => ({ db: {} }));
vi.mock('./service', () => ({ updateOrder: vi.fn() }));

import { cancelBlockedBy, customerCancelEligibility } from './customer-cancel';

const pay = (id: number, method: string, status: string) => ({ id, method, status });
const none = new Set<number>();

describe('customerCancelEligibility', () => {
  it('allows a pending order with no payment at all', () => {
    expect(customerCancelEligibility({ status: 'pending' }, [], none)).toEqual({ allowed: true });
  });
  it('allows a pending order with an open hosted checkout or a replaced one', () => {
    expect(customerCancelEligibility({ status: 'pending' }, [pay(1, 'stripe', 'failed'), pay(2, 'whop', 'pending')], none)).toEqual({ allowed: true });
  });
  it('allows a pending crypto payment with no transaction id', () => {
    expect(customerCancelEligibility({ status: 'pending' }, [pay(1, 'crypto', 'pending')], none)).toEqual({ allowed: true });
  });
  it.each(['confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'partially_shipped'])('refuses a %s order', (status) => {
    expect(customerCancelEligibility({ status }, [], none)).toEqual({ allowed: false, reason: 'not_pending' });
  });
  it('refuses once any payment is completed, store credit included', () => {
    expect(customerCancelEligibility({ status: 'pending' }, [pay(1, 'store_credit', 'completed'), pay(2, 'stripe', 'pending')], none)).toEqual({ allowed: false, reason: 'paid' });
  });
  it('refuses when a bank transfer or other staff-reconciled method was ever used', () => {
    for (const method of ['uk_bank_transfer', 'sepa_transfer', 'ach_wire', 'bank_transfer', 'cash', 'manual']) {
      expect(customerCancelEligibility({ status: 'pending' }, [pay(1, method, 'pending')], none)).toEqual({ allowed: false, reason: 'bank_transfer' });
      expect(customerCancelEligibility({ status: 'pending' }, [pay(1, method, 'failed'), pay(2, 'stripe', 'pending')], none)).toEqual({ allowed: false, reason: 'bank_transfer' });
    }
  });
  it('refuses when a crypto transaction id was submitted', () => {
    expect(customerCancelEligibility({ status: 'pending' }, [pay(7, 'crypto', 'pending')], new Set([7]))).toEqual({ allowed: false, reason: 'crypto_submitted' });
  });
  it('reports the first reason in a fixed order: not pending, paid, bank transfer, crypto', () => {
    const all = [pay(1, 'stripe', 'completed'), pay(2, 'uk_bank_transfer', 'pending'), pay(3, 'crypto', 'pending')];
    expect(customerCancelEligibility({ status: 'confirmed' }, all, new Set([3]))).toEqual({ allowed: false, reason: 'not_pending' });
    expect(customerCancelEligibility({ status: 'pending' }, all, new Set([3]))).toEqual({ allowed: false, reason: 'paid' });
  });
});

describe('cancelBlockedBy', () => {
  it('is null when cancelling is allowed or the order is simply not pending', () => {
    expect(cancelBlockedBy({ allowed: true })).toBeNull();
    expect(cancelBlockedBy({ allowed: false, reason: 'not_pending' })).toBeNull();
  });
  it('names the other reasons', () => {
    expect(cancelBlockedBy({ allowed: false, reason: 'paid' })).toBe('paid');
    expect(cancelBlockedBy({ allowed: false, reason: 'bank_transfer' })).toBe('bank_transfer');
    expect(cancelBlockedBy({ allowed: false, reason: 'crypto_submitted' })).toBe('crypto_submitted');
  });
});
```

Run: `npx vitest run src/modules/orders/customer-cancel.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement**

Create `src/modules/orders/customer-cancel.ts`:

```ts
// A customer cancelling their own unpaid order: the rule, and the one function
// both routes (session and access key) call.
import { eq, inArray, isNotNull, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { orders } from '../../db/schema/orders';
import { payments } from '../../db/schema/payments';
import { cryptoPayments } from '../../db/schema/crypto-payments';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { isAdminReconciledPayments } from './maintenance';
import { updateOrder } from './service';

export type CancelBlock = 'not_pending' | 'paid' | 'bank_transfer' | 'crypto_submitted';
export type CancelEligibility = { allowed: true } | { allowed: false; reason: CancelBlock };

export const CUSTOMER_CANCEL_REASON = 'Cancelled by customer';

/**
 * May the customer cancel this order themselves? Only while nothing could be on
 * its way: the order is still pending, no payment has completed, no bank
 * transfer or other staff-reconciled method was ever attached (the same set the
 * auto-cancel job leaves to staff), and no crypto transaction id was submitted.
 * An open hosted checkout does not block it; that payment is closed by the
 * cancellation and flagged for staff if it later lands.
 */
export function customerCancelEligibility(
  order: { status: string },
  rows: ReadonlyArray<{ id: number; method: string; status: string }>,
  cryptoTxidPaymentIds: ReadonlySet<number>,
): CancelEligibility {
  if (order.status !== 'pending') return { allowed: false, reason: 'not_pending' };
  if (rows.some((p) => p.status === 'completed')) return { allowed: false, reason: 'paid' };
  if (isAdminReconciledPayments(rows.filter((p) => p.method !== 'store_credit'))) return { allowed: false, reason: 'bank_transfer' };
  if (rows.some((p) => cryptoTxidPaymentIds.has(p.id))) return { allowed: false, reason: 'crypto_submitted' };
  return { allowed: true };
}

/** What a customer-facing view reports: why the customer cannot cancel, when there is something to say. */
export function cancelBlockedBy(eligibility: CancelEligibility): Exclude<CancelBlock, 'not_pending'> | null {
  return eligibility.allowed || eligibility.reason === 'not_pending' ? null : eligibility.reason;
}

export async function loadCancelEligibility(order: { id: number; status: string }): Promise<CancelEligibility> {
  const rows = await db.select({ id: payments.id, method: payments.method, status: payments.status }).from(payments).where(eq(payments.orderId, order.id));
  const withTxid = rows.length
    ? await db.select({ paymentId: cryptoPayments.paymentId }).from(cryptoPayments)
        .where(and(inArray(cryptoPayments.paymentId, rows.map((p) => p.id)), isNotNull(cryptoPayments.txid)))
    : [];
  return customerCancelEligibility(order, rows, new Set(withTxid.map((c) => c.paymentId)));
}

/**
 * Cancel on the customer's behalf. The caller has already proved the customer
 * may act on this order (session ownership, or the access key). `updateOrder`
 * validates the transition itself, so of two requests racing, the second finds
 * the order no longer pending and is refused.
 */
export async function cancelOrderAsCustomer(orderId: number): Promise<{ reference: string; status: 'cancelled' }> {
  const order = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
  if (!order) throw new NotFoundError('Order');
  const eligibility = await loadCancelEligibility(order);
  if (!eligibility.allowed) throw new ConflictError(`ORDER_NOT_CANCELLABLE:${eligibility.reason}`);
  try {
    await updateOrder(order.id, { status: 'cancelled', reason: CUSTOMER_CANCEL_REASON });
  } catch (err) {
    // Lost the race to another cancel (or to a payment confirming the order).
    const now = (await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1))[0];
    if (now && now.status !== 'pending') throw new ConflictError('ORDER_NOT_CANCELLABLE:not_pending');
    throw err;
  }
  return { reference: order.reference, status: 'cancelled' };
}
```

Check the real names first: the crypto payments schema file and its `txid` / `paymentId` columns (`src/db/schema/`), `ConflictError` in `src/utils/errors.ts` (it must map to HTTP 409), and that `isAdminReconciledPayments` is exported from `./maintenance`. `store_credit` is in the offline set, which is why it is filtered out before that check (a completed store-credit payment is already caught as `paid`; a refunded one must not read as a bank transfer). `maintenance.ts` imports `updateOrder` from `./service` and this file imports both: if that creates a load-order problem, move `isAdminReconciledPayments` and its `MANUAL_OR_OFFLINE` set into a small new file both import, and say so.

Run: `npx vitest run src/modules/orders/customer-cancel.test.ts`
Expected: PASS.

- [ ] **Step 3: Routes**

`src/modules/public-orders/service.ts`: add

```ts
export async function cancelPublicOrder(reference: string, accessKey: string) {
  const order = await loadOrderByAccessKey(reference, accessKey);
  return cancelOrderAsCustomer(order.id);
}
```

where `loadOrderByAccessKey` is the existing way this file turns a reference and key into an order row for the action routes (the 503 when `ORDER_ACCESS_SECRET` is unset, the 404 for a bad key or unknown reference): read `selectPublicPaymentMethod` and reuse exactly what it does; if that logic is inline there, extract it into one private function and use it in both.

`src/modules/public-orders/controller.ts`: add `cancelOrderPublic` in the style of its neighbours. `src/modules/public-orders/router.ts`: add

```ts
publicOrdersRouter.post(
  '/:reference/:accessKey/cancel',
  rateLimit({ windowMs: 15 * 60_000, max: 30 }),
  validate({ params: publicOrderParamsSchema }),
  publicOrdersController.cancelOrderPublic,
);
```

`src/modules/public-storefront/account.ts`: add

```ts
/** Cancel the customer's own unpaid order. Ownership is checked exactly as the detail does: a stranger's reference is a 404. */
export async function cancelStorefrontOrder(customerId: number, reference: string) {
  const order = (await db.select({ id: orders.id, customerId: orders.customerId }).from(orders).where(eq(orders.reference, reference)).limit(1))[0];
  if (!order || order.customerId !== customerId) throw new NotFoundError('Order');
  return cancelOrderAsCustomer(order.id);
}
```

`src/modules/public-storefront/controller.ts`: add `cancelOrder`. `src/modules/public-storefront/router.ts`, after the `GET /orders/:reference` route:

```ts
publicStorefrontRouter.post(
  '/orders/:reference/cancel',
  requireStorefrontEnabled,
  authenticateStorefrontCustomer,
  rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }),
  validate({ params: orderReferenceParamSchema }),
  publicStorefrontController.cancelOrder,
);
```

- [ ] **Step 4: Integration tests**

Extend `src/modules/orders/cancellation.integration.test.ts` with a `describe('customer cancel', …)`:

```ts
it('cancels a pending unpaid order and returns its reference', async () => { /* cancelOrderAsCustomer → { reference, status: 'cancelled' }; the order row is cancelled; its stock is back; the reason note is 'Cancelled by customer' if updateOrder records reasons on the order */ });
it('refuses a paid order with 409 ORDER_NOT_CANCELLABLE:paid', async () => { /* a completed payment */ });
it('refuses an order with a bank transfer on it', async () => { /* a pending uk_bank_transfer row → ORDER_NOT_CANCELLABLE:bank_transfer */ });
it('refuses once a crypto transaction id was submitted', async () => { /* a pending crypto payment with a crypto_payments row whose txid is set → ORDER_NOT_CANCELLABLE:crypto_submitted */ });
it('a second cancel is refused as not pending, and store credit is not returned twice', async () => { /* call twice; second rejects with ORDER_NOT_CANCELLABLE:not_pending */ });
it('two cancels at once: exactly one succeeds', async () => { /* Promise.allSettled of two calls → one fulfilled, one rejected */ });
it('cancelStorefrontOrder refuses another customer with NotFound', async () => { /* the same error as an unknown reference */ });
```

Write each in full. Run: `npx vitest run src/modules/orders/cancellation.integration.test.ts` (with PGlite installed `--no-save`).

- [ ] **Step 5: Run, document, commit**

Run: `npm test && npx tsc --noEmit` — PASS, clean. If a router gate test exists for the storefront or public-orders routers (search `router-gate`, `read-gate`), add the new routes to it in its own style.

`STOREFRONT.md`: document both routes (request, the `{ reference, status }` answer, `404`, `409 ORDER_NOT_CANCELLABLE:<reason>` and the four reasons, the rate limit) beside the routes they sit next to. `CLAUDE.md`, Orders bullet: `A customer can cancel their own unpaid order: `POST /public/storefront/orders/:reference/cancel` (session) and `POST /public/orders/:reference/:accessKey/cancel`, both through `cancelOrderAsCustomer` (`orders/customer-cancel.ts`); the rule is `customerCancelEligibility` (pending, nothing completed, no staff-reconciled method ever attached, no crypto transaction id).`

```bash
git add src/modules/orders/customer-cancel.ts src/modules/orders/customer-cancel.test.ts src/modules/orders/cancellation.integration.test.ts src/modules/public-orders src/modules/public-storefront STOREFRONT.md CLAUDE.md
git commit -m "feat(orders): customers can cancel their own unpaid order"
```

---

### Task 4: Backend, order views and the unpaid lookup

**Files:**
- Modify: `src/modules/public-orders/service.ts` (`getPublicOrder` payment block)
- Modify: `src/modules/public-storefront/account.ts` (`StorefrontOrderDetail`, `getStorefrontOrderDetail`; new `listUnpaidStorefrontOrders`)
- Modify: `src/modules/public-storefront/{router,controller}.ts`
- Create: `src/modules/public-storefront/order-view-cancel.test.ts`
- Extend: `src/modules/orders/cancellation.integration.test.ts`
- Modify: `STOREFRONT.md`

**Interfaces:**
- Consumes: `customerCancelEligibility`, `cancelBlockedBy`, `loadCancelEligibility` (Task 3); `generateOrderAccessKey(reference): string | null` (`src/modules/orders/access-key.ts`).
- Produces: public order `payment.canCancel: boolean`, `payment.cancelBlockedBy: 'paid' | 'bank_transfer' | 'crypto_submitted' | null`; account order detail `accessKey: string | null`, `canCancel`, `cancelBlockedBy`; `GET /public/storefront/orders/unpaid` → `Array<{ reference, accessKey, createdAt, totalAmount, outstandingBalance, payBy, canCancel, cancelBlockedBy }>`.

- [ ] **Step 1: Write the failing wiring test**

Create `src/modules/public-storefront/order-view-cancel.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Both views load an order from the database; the decision itself is unit-tested
// in orders/customer-cancel.test.ts and the lookup on a real schema in
// orders/cancellation.integration.test.ts. This pins the projection wiring.
const publicOrders = readFileSync(join(process.cwd(), 'src/modules/public-orders/service.ts'), 'utf8');
const account = readFileSync(join(process.cwd(), 'src/modules/public-storefront/account.ts'), 'utf8');
const router = readFileSync(join(process.cwd(), 'src/modules/public-storefront/router.ts'), 'utf8');

describe('order views report whether the customer can cancel', () => {
  it('the public order payment block carries canCancel and cancelBlockedBy from the shared rule', () => {
    expect(publicOrders).toMatch(/customerCancelEligibility\(/);
    expect(publicOrders).toMatch(/canCancel:/);
    expect(publicOrders).toMatch(/cancelBlockedBy:/);
  });
  it('the account order detail carries the access key and the same two fields', () => {
    expect(account).toMatch(/accessKey: generateOrderAccessKey\(/);
    expect(account).toMatch(/canCancel:/);
    expect(account).toMatch(/cancelBlockedBy:/);
  });
  it('the unpaid route is declared before the :reference route, behind the session', () => {
    const unpaid = router.indexOf("'/orders/unpaid'");
    const byReference = router.indexOf("'/orders/:reference'");
    expect(unpaid).toBeGreaterThan(-1);
    expect(unpaid).toBeLessThan(byReference);
  });
});
```

Run: FAIL.

- [ ] **Step 2: Public order view**

In `getPublicOrder` (`src/modules/public-orders/service.ts`), after `pendingCryptoTxid` is computed, add:

```ts
  const cancelEligibility = customerCancelEligibility(
    order,
    orderPayments,
    new Set(cryptoRows.filter((c) => c.txid).map((c) => c.paymentId)),
  );
```

and add to the `payment` object, after `payBy`:

```ts
    canCancel: cancelEligibility.allowed,
    cancelBlockedBy: cancelBlockedBy(cancelEligibility),
```

Also export the pay-by computation so the unpaid lookup can share it: extract the existing `payBy` expression into

```ts
/** When the auto-cancel job would cancel this order, or null when it will not. Mirrors scanPendingOrders. */
export function orderPayBy(
  order: { status: string; createdAt: Date },
  rows: ReadonlyArray<{ method: string; status: string }>,
  cfg: { pendingOrderTimeoutEnabled: boolean; pendingOrderTimeoutMinutes: number },
): Date | null {
  const canPay = order.status === 'pending' && !rows.some((p) => p.status === 'completed');
  return canPay && cfg.pendingOrderTimeoutEnabled && !isAdminReconciledPayments(rows)
    ? new Date(order.createdAt.getTime() + cfg.pendingOrderTimeoutMinutes * 60_000)
    : null;
}
```

and use it where `payBy` was computed inline (the result must be identical).

- [ ] **Step 3: Account order detail and the unpaid lookup**

In `src/modules/public-storefront/account.ts`:

- `StorefrontOrderDetail` gains:

```ts
  /** The order's access key, so the storefront can use the order's own payment routes; null when order links are not configured. */
  accessKey: string | null;
  canCancel: boolean;
  cancelBlockedBy: 'paid' | 'bank_transfer' | 'crypto_submitted' | null;
```

- in `getStorefrontOrderDetail`, compute the eligibility from the payments it already loads plus one query for crypto rows with a txid (reuse `loadCancelEligibility(order)` unless that would repeat the payments query the function already made; if so call `customerCancelEligibility` with the loaded rows and query only the crypto rows), and add to the returned object:

```ts
    accessKey: generateOrderAccessKey(order.reference),
    canCancel: eligibility.allowed,
    cancelBlockedBy: cancelBlockedBy(eligibility),
```

- add:

```ts
export interface StorefrontUnpaidOrder {
  reference: string;
  accessKey: string | null;
  createdAt: Date;
  totalAmount: number;
  outstandingBalance: number;
  payBy: Date | null;
  canCancel: boolean;
  cancelBlockedBy: 'paid' | 'bank_transfer' | 'crypto_submitted' | null;
}

const UNPAID_LIMIT = 5;

/**
 * The customer's orders that can still be paid: pending, nothing completed, not
 * archived. Newest first, capped. Two queries for the orders and their payments
 * and one for crypto transaction ids, whatever the count.
 */
export async function listUnpaidStorefrontOrders(customerId: number): Promise<StorefrontUnpaidOrder[]> {
  const pending = await db
    .select()
    .from(orders)
    .where(and(eq(orders.customerId, customerId), eq(orders.status, 'pending'), notArchived()))
    .orderBy(desc(orders.id))
    .limit(25);
  if (pending.length === 0) return [];

  const ids = pending.map((o) => o.id);
  const [rows, cfg] = await Promise.all([
    db.select().from(payments).where(inArray(payments.orderId, ids)),
    getSettings(),
  ]);
  const withTxid = rows.length
    ? await db.select({ paymentId: cryptoPayments.paymentId }).from(cryptoPayments)
        .where(and(inArray(cryptoPayments.paymentId, rows.map((p) => p.id)), isNotNull(cryptoPayments.txid)))
    : [];
  const txids = new Set(withTxid.map((c) => c.paymentId));

  const out: StorefrontUnpaidOrder[] = [];
  for (const order of pending) {
    const own = rows.filter((p) => p.orderId === order.id);
    if (own.some((p) => p.status === 'completed')) continue; // part-paid: not payable online today
    const eligibility = customerCancelEligibility(order, own, txids);
    out.push({
      reference: order.reference,
      accessKey: generateOrderAccessKey(order.reference),
      createdAt: order.createdAt,
      totalAmount: round2(order.totalAmount),
      outstandingBalance: round2(order.totalAmount),
      payBy: orderPayBy(order, own, cfg),
      canCancel: eligibility.allowed,
      cancelBlockedBy: cancelBlockedBy(eligibility),
    });
    if (out.length === UNPAID_LIMIT) break;
  }
  return out;
}
```

Use the imports the file already has where they exist (`round2`, `orders`, `payments`); add `desc`, `inArray`, `isNotNull`, `and` from `drizzle-orm`, `notArchived` from `src/lib/order-scope`, `getSettings` from the settings service (the function `getPublicOrder` uses), the crypto payments schema, `generateOrderAccessKey`, `orderPayBy` and the customer-cancel functions. If importing `orderPayBy` from `public-orders/service` into `public-storefront/account` creates an import cycle (`public-orders/service` already imports from `public-storefront`), move `orderPayBy` into `src/modules/orders/customer-cancel.ts` instead and import it from there in both.

Controller: add `listUnpaidOrders`. Router, BEFORE the `GET /orders/:reference` route (Express matches in order, and `unpaid` would otherwise be read as a reference):

```ts
publicStorefrontRouter.get(
  '/orders/unpaid',
  requireStorefrontEnabled,
  authenticateStorefrontCustomer,
  publicStorefrontController.listUnpaidOrders,
);
```

- [ ] **Step 4: Integration tests**

Extend the PGlite suite with `describe('unpaid lookup', …)`:

```ts
it('lists the customer’s pending unpaid orders, newest first, with whether each can be cancelled', async () => { /* three pending orders (one with a bank transfer → canCancel false, cancelBlockedBy 'bank_transfer'), one confirmed, one cancelled, one of another customer → only the three, newest first */ });
it('leaves out an order with any completed payment', async () => { /* store-credit part-paid */ });
it('leaves out archived orders', async () => { /* archived_at set */ });
it('returns at most five', async () => { /* seven pending */ });
```

Write each in full. Run the PGlite suite, then `npm test && npx tsc --noEmit`.

- [ ] **Step 5: Document and commit**

`STOREFRONT.md`: add `payment.canCancel` / `payment.cancelBlockedBy` to the public order response; `accessKey`, `canCancel`, `cancelBlockedBy` to the account order detail; and the new `GET /orders/unpaid` (session, the response shape, at most five, newest first, excludes part-paid and archived orders).

```bash
git add src/modules/public-orders/service.ts src/modules/public-storefront/account.ts src/modules/public-storefront/router.ts src/modules/public-storefront/controller.ts src/modules/public-storefront/order-view-cancel.test.ts src/modules/orders/cancellation.integration.test.ts src/modules/orders/customer-cancel.ts STOREFRONT.md
git commit -m "feat(storefront): order views say whether the customer can cancel; unpaid orders lookup"
```

---

### Task 5: Storefront, types, calls and the cancel control

**Repo:** `ecommerce-storefront`, branch `feature/unpaid-order-recovery`. Run vitest/tsc from `web/`.

**Files:**
- Modify: `web/src/types/orders.ts`, `web/src/types/public-order.ts`
- Modify: `web/src/api/orders.ts`, `web/src/api/public-order.ts`
- Create: `web/src/features/order-status/CancelOrder.tsx`, `web/src/features/order-status/cancel-state.ts`
- Create: `web/test/cancel-order.test.tsx`, `web/test/cancel-state.test.ts`
- Modify: `web/src/text/keys/order.ts`, `web/src/text/notes/order.ts`, and the `text` lists of the blocks that will render the control (Step 5)

**Interfaces:**
- Produces: types `CancelBlockedBy = 'paid' | 'bank_transfer' | 'crypto_submitted'`, `UnpaidOrder`; `OrderDetail.accessKey?`, `.canCancel?`, `.cancelBlockedBy?`; `OrderPaymentState.canCancel?`, `.cancelBlockedBy?`; `cancelOrder(reference)`, `cancelPublicOrder(reference, accessKey)`, `fetchUnpaidOrders()`; `class OrderNotCancellableError { reason }`; `cancelView(canCancel, blockedBy)`; `<CancelOrder reference accessKey? canCancel blockedBy onCancelled? />`.

- [ ] **Step 1: Types and calls**

`web/src/types/public-order.ts`: add `export type CancelBlockedBy = 'paid' | 'bank_transfer' | 'crypto_submitted';` and to `OrderPaymentState`: `/** Absent on a backend that predates customer cancel. */ canCancel?: boolean; cancelBlockedBy?: CancelBlockedBy | null;`

`web/src/types/orders.ts`: add to `OrderDetail`: `accessKey?: string | null; canCancel?: boolean; cancelBlockedBy?: import('./public-order.ts').CancelBlockedBy | null;` and

```ts
/** An order the customer can still pay, as `GET storefront/orders/unpaid` returns it. */
export interface UnpaidOrder {
  reference: string; accessKey: string | null; createdAt: string; totalAmount: number; outstandingBalance: number;
  payBy: string | null; canCancel: boolean; cancelBlockedBy: import('./public-order.ts').CancelBlockedBy | null;
}
```

`web/src/api/public-order.ts`: add

```ts
/** 409 `ORDER_NOT_CANCELLABLE:<reason>` — the order cannot be cancelled by the customer (any more). */
export class OrderNotCancellableError extends Error {
  readonly reason: 'not_pending' | 'paid' | 'bank_transfer' | 'crypto_submitted';
  constructor(reason: OrderNotCancellableError['reason']) {
    super('Order cannot be cancelled');
    this.name = 'OrderNotCancellableError';
    this.reason = reason;
  }
}

const CANCEL_REASONS = ['not_pending', 'paid', 'bank_transfer', 'crypto_submitted'] as const;

/** Maps the backend's `409 ORDER_NOT_CANCELLABLE:<reason>`; anything else is rethrown. */
export function asCancelError(err: unknown): never {
  if (err instanceof ApiError && err.status === 409) {
    const reason = err.message.split(':')[1];
    throw new OrderNotCancellableError(CANCEL_REASONS.find((r) => r === reason) ?? 'not_pending');
  }
  throw err;
}

/** Cancel through the order's own link (a guest, or anyone holding the link). */
export function cancelPublicOrder(reference: string, accessKey: string): Promise<{ reference: string; status: string }> {
  return unwrap<{ reference: string; status: string }>(api.post(`${base(reference, accessKey)}/cancel`)).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) throw new InvalidLinkError();
    return asCancelError(err);
  });
}
```

`web/src/api/orders.ts`: add

```ts
import { asCancelError } from '@/api/public-order.ts';
import type { UnpaidOrder } from '@/types/orders.ts';

/** Cancel the signed-in customer's own unpaid order. */
export const cancelOrder = (reference: string) =>
  unwrap<{ reference: string; status: string }>(api.post(`storefront/orders/${encodeURIComponent(reference)}/cancel`)).catch(asCancelError);

/** The signed-in customer's orders that can still be paid (newest first, at most five). */
export const fetchUnpaidOrders = () => unwrap<UnpaidOrder[]>(api.get('storefront/orders/unpaid', { retry: 0 }));
```

Add tests for both calls to the files that already test these modules (`web/test/public-order-api.test.ts`, `web/test/api-orders.test.ts`), in their style: the request path and method; a `409` with message `ORDER_NOT_CANCELLABLE:bank_transfer` becomes `OrderNotCancellableError` with that reason; an unknown reason becomes `not_pending`; a `404` on the public route becomes `InvalidLinkError`.

- [ ] **Step 2: The pure state and its test**

Create `web/test/cancel-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cancelView } from '@/features/order-status/cancel-state.ts';

describe('cancelView', () => {
  it('offers the button when the order can be cancelled', () => {
    expect(cancelView(true, null)).toBe('button');
  });
  it('points to the shop when money may be on its way', () => {
    expect(cancelView(false, 'bank_transfer')).toBe('contact');
    expect(cancelView(false, 'crypto_submitted')).toBe('contact');
  });
  it('shows nothing when the order is paid, not pending, or the backend is older', () => {
    expect(cancelView(false, 'paid')).toBe('none');
    expect(cancelView(false, null)).toBe('none');
    expect(cancelView(undefined, undefined)).toBe('none');
  });
});
```

Create `web/src/features/order-status/cancel-state.ts`:

```ts
import type { CancelBlockedBy } from '@/types/public-order.ts';

export type CancelView = 'button' | 'contact' | 'none';

/** What the cancel control shows. A missing flag (older backend) shows nothing. */
export function cancelView(canCancel: boolean | undefined, blockedBy: CancelBlockedBy | null | undefined): CancelView {
  if (canCancel) return 'button';
  return blockedBy === 'bank_transfer' || blockedBy === 'crypto_submitted' ? 'contact' : 'none';
}
```

- [ ] **Step 3: Text keys**

In `web/src/text/keys/order.ts`, add (grouped together, after the existing `address.*` keys):

```ts
  'cancel.action': { en: 'Cancel order', max: 40 },
  'cancel.confirmTitle': { en: 'Cancel order {reference}?', max: 80 },
  'cancel.confirmBody': { en: 'The order will be cancelled and nothing will be charged. This cannot be undone.', max: 200 },
  'cancel.confirm': { en: 'Yes, cancel it', max: 40 },
  'cancel.keep': { en: 'Keep the order', max: 40 },
  'cancel.working': { en: 'Cancelling…', max: 40 },
  'cancel.done': { en: 'Order {reference} was cancelled.', max: 120 },
  'cancel.contact': { en: 'To cancel this order, contact us: a payment may already be on its way.', max: 200 },
  'cancel.refusedPaid': { en: 'This order has already been paid, so it can no longer be cancelled here.', max: 200 },
  'cancel.refusedInFlight': { en: 'A payment may already be on its way, so this order cannot be cancelled here. Contact us and we will help.', max: 220 },
  'cancel.refusedGone': { en: 'This order is no longer waiting for payment.', max: 160 },
  'cancel.failed': { en: "We couldn't cancel the order. Please try again.", max: 160 },
```

and a note for each in `web/src/text/notes/order.ts` (one line saying where it shows; `{reference}` is the order reference).

- [ ] **Step 4: The control and its test**

Create `web/test/cancel-order.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/api/orders.ts', () => ({ cancelOrder: vi.fn() }));
vi.mock('@/api/public-order.ts', async (orig) => ({ ...(await orig<typeof import('@/api/public-order.ts')>()), cancelPublicOrder: vi.fn() }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ supportLinks: [{ label: 'Chat', url: 'https://t.me/example_shop' }] }) }));

import { cancelOrder } from '@/api/orders.ts';
import { cancelPublicOrder, OrderNotCancellableError } from '@/api/public-order.ts';
import { CancelOrder } from '@/features/order-status/CancelOrder.tsx';

const cancelMock = vi.mocked(cancelOrder);
const cancelPublicMock = vi.mocked(cancelPublicOrder);

const mount = (over: Partial<Parameters<typeof CancelOrder>[0]> = {}) => {
  const props = { reference: 'K4M2QP', canCancel: true, blockedBy: null, onCancelled: vi.fn(), ...over };
  render(
    <MantineProvider env="test">
      <QueryClientProvider client={new QueryClient()}>
        <CancelOrder {...props} />
      </QueryClientProvider>
    </MantineProvider>,
  );
  return props;
};

beforeEach(() => { cancelMock.mockReset(); cancelPublicMock.mockReset(); });
afterEach(cleanup);

describe('CancelOrder', () => {
  it('asks before cancelling, and Keep backs out without a request', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    expect(screen.getByText('Cancel order K4M2QP?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep the order' }));
    expect(screen.queryByText('Cancel order K4M2QP?')).toBeNull();
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('a signed-in cancel calls the session route and reports success', async () => {
    cancelMock.mockResolvedValueOnce({ reference: 'K4M2QP', status: 'cancelled' });
    const props = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' })); });
    expect(cancelMock).toHaveBeenCalledWith('K4M2QP');
    expect(cancelPublicMock).not.toHaveBeenCalled();
    expect(props.onCancelled).toHaveBeenCalledTimes(1);
  });

  it('with an access key and no session flag it cancels through the order link', async () => {
    cancelPublicMock.mockResolvedValueOnce({ reference: 'K4M2QP', status: 'cancelled' });
    mount({ accessKey: 'abc123', viaLink: true });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' })); });
    expect(cancelPublicMock).toHaveBeenCalledWith('K4M2QP', 'abc123');
  });

  it.each([
    ['paid', 'This order has already been paid, so it can no longer be cancelled here.'],
    ['bank_transfer', 'A payment may already be on its way, so this order cannot be cancelled here. Contact us and we will help.'],
    ['crypto_submitted', 'A payment may already be on its way, so this order cannot be cancelled here. Contact us and we will help.'],
    ['not_pending', 'This order is no longer waiting for payment.'],
  ] as const)('a refusal for %s says why and still refreshes', async (reason, text) => {
    cancelMock.mockRejectedValueOnce(new OrderNotCancellableError(reason));
    const props = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' })); });
    expect(screen.getByText(text)).toBeTruthy();
    expect(props.onCancelled).toHaveBeenCalledTimes(1);
  });

  it('any other failure can be retried', async () => {
    cancelMock.mockRejectedValueOnce(new Error('network'));
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' })); });
    expect(screen.getByText("We couldn't cancel the order. Please try again.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yes, cancel it' })).toBeTruthy();
  });

  it('does not double-submit', async () => {
    let resolve!: (v: { reference: string; status: string }) => void;
    cancelMock.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' }));
    fireEvent.click(screen.getByRole('button', { name: /Cancelling|Yes, cancel it/ }));
    expect(cancelMock).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ reference: 'K4M2QP', status: 'cancelled' }); });
  });

  it('shows the contact line and the shop’s links when money may be on its way', () => {
    mount({ canCancel: false, blockedBy: 'bank_transfer' });
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
    expect(screen.getByText('To cancel this order, contact us: a payment may already be on its way.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Chat' }).getAttribute('href')).toBe('https://t.me/example_shop');
  });

  it('renders nothing when the order is paid or the backend is older', () => {
    const { container } = render(
      <MantineProvider env="test"><QueryClientProvider client={new QueryClient()}><CancelOrder reference="K4M2QP" canCancel={undefined} blockedBy={undefined} /></QueryClientProvider></MantineProvider>,
    );
    expect(container.textContent).toBe('');
  });
});
```

Create `web/src/features/order-status/CancelOrder.tsx` to satisfy it:

- Props: `{ reference: string; accessKey?: string | null; viaLink?: boolean; canCancel: boolean | undefined; blockedBy: CancelBlockedBy | null | undefined; onCancelled?: () => void; rootAttrs?: StyleAttrs }`. `viaLink` true means cancel through `cancelPublicOrder(reference, accessKey)`; otherwise `cancelOrder(reference)`.
- `cancelView(canCancel, blockedBy)` decides: `'none'` renders `null`; `'contact'` renders the `order.cancel.contact` line and the shop's support links (`useSettings().supportLinks`, rendered as external links with their labels; read how an existing component renders support links and reuse it if one exists); `'button'` renders the control.
- The control: a text button (`order.cancel.action`); on click an inline confirmation (title with the reference, body, "Yes, cancel it" and "Keep the order"), not a browser `confirm()`. While the request runs the confirm button shows `order.cancel.working` and is `aria-disabled`, and a second activation does nothing. On success: `onCancelled?.()` and a notification (`notifications.show`) with `order.cancel.done`. On `OrderNotCancellableError`: show the matching refusal text (`paid` → `refusedPaid`; `bank_transfer` / `crypto_submitted` → `refusedInFlight`; `not_pending` → `refusedGone`), hide the confirmation, and call `onCancelled?.()` so the caller refreshes. On any other error: show `order.cancel.failed` and leave the confirmation open for a retry.
- Refusal and failure text sit in an `aria-live="polite"` region. After the confirmation opens, focus moves to "Keep the order"; after it closes without cancelling, focus returns to the "Cancel order" button.
- Styling: reuse classes from `web/src/features/order-status/OrderStatus.module.css` where they fit; add the few rules needed there. Every control at least 44 px tall. Destructive action styled with the danger token, not the primary.

Run: `npx vitest run test/cancel-order.test.tsx test/cancel-state.test.ts test/public-order-api.test.ts test/api-orders.test.ts`
Expected: PASS.

- [ ] **Step 5: Keep the text guards honest**

The control will be rendered by the order-status payment part and the account order balance part (Task 6) and by the pop-up (Task 7). The registry test fails on keys nothing references: the control references them all, so that is satisfied. Blocks declare the key families they use: add `'order.cancel.*'` to the `text` list of `web/src/builder/blocks/OrderStatusPayment.tsx` and of the account order balance block (`web/src/builder/blocks/OrderBalance.tsx`) now, so Task 6 does not trip the guard. If a guard test objects to a block declaring keys it does not yet render, leave the declarations for Task 6 and say so.

Run: `npm test` (from `web/`) and `npx tsc -b`.
Expected: fully green; no golden changes (nothing renders the control yet).

- [ ] **Step 6: Commit**

```bash
git add web/src/types/orders.ts web/src/types/public-order.ts web/src/api/orders.ts web/src/api/public-order.ts web/src/features/order-status/CancelOrder.tsx web/src/features/order-status/cancel-state.ts web/src/features/order-status/OrderStatus.module.css web/src/text/keys/order.ts web/src/text/notes/order.ts web/test/cancel-order.test.tsx web/test/cancel-state.test.ts web/test/public-order-api.test.ts web/test/api-orders.test.ts
git commit -m "feat(orders): cancel-order control and the calls behind it"
```

(Add the block files if Step 5 changed them.)

---

### Task 6: Storefront, pay and cancel on the order pages

UI task: the implementer loads the `frontend-design:frontend-design` skill.

**Files:**
- Modify: `web/src/features/account/OrderDetailPage.tsx` (`BalanceView`, the page comment, `ORDER_VIEWS` unchanged in shape)
- Modify: `web/src/features/order-status/order-status-parts.tsx` (the payment view)
- Modify: `web/src/builder/blocks/OrderBalance.tsx`, `OrderStatusPayment.tsx` (`text` lists, if not done in Task 5)
- Create: `web/test/account-order-pay.test.tsx`
- Modify: `web/test/builder-account-parts.test.tsx`, `web/test/builder-order-status-parts.test.tsx` only where a lookup must change

**Interfaces:**
- Consumes: `PaymentSection` (`{ order: PublicOrder, reference, accessKey }`), `fetchPublicOrder`, `publicOrderKey`, `pollInterval` from `features/order-status/`; `CancelOrder` (Task 5); `OrderDetail.accessKey` / `.canCancel` / `.cancelBlockedBy`.

- [ ] **Step 1: Write the failing test**

Create `web/test/account-order-pay.test.tsx`. Read `web/test/collect-from.test.tsx` and `web/test/text-account-dom.test.tsx` first: they show how the account order page is rendered in a unit test (which modules are mocked: `useOrder` / the orders API, the router, settings). Using the same harness, with `fetchPublicOrder`, `fetchPaymentOptions`, `selectPaymentMethod` mocked from `@/api/public-order.ts`:

```tsx
it('an unpaid order with an access key shows the payment section under the balance', async () => {
  // order detail: outstandingBalance 46.03, accessKey 'abc123', canCancel true
  // fetchPublicOrder resolves a PublicOrder with payment { canPay: true, payBy: null, activePayment: null }
  // → expect fetchPublicOrder called with (reference, 'abc123'); the method picker's heading/prompt text is present
});
it('with a pending hosted payment it offers the checkout link', async () => {
  // activePayment { kind: 'gateway', checkoutUrl: 'https://pay.example/abc', canChange: true, … }
  // → a link whose href is that URL
});
it('offers Cancel order on an unpaid order, and refreshes both queries after cancelling', async () => {
  // canCancel true → button 'Cancel order'; cancelOrder resolves → the order query and the public order query are invalidated
});
it('shows the contact line when the order cannot be cancelled by the customer', async () => {
  // canCancel false, cancelBlockedBy 'bank_transfer'
});
it('without an access key the page is exactly as before: the balance band, no payment section, no cancel', async () => {
  // accessKey undefined (older backend) and accessKey null → fetchPublicOrder not called; 'Balance due' present; no 'Cancel order'
});
it('a settled order shows neither', async () => {
  // outstandingBalance 0
});
it('if the order link cannot be loaded the balance still shows', async () => {
  // fetchPublicOrder rejects → the band is present, no crash, no payment section
});
```

Write each case out in full against the harness. Run: FAIL.

- [ ] **Step 2: Implement the account order balance part**

In `web/src/features/account/OrderDetailPage.tsx`, replace `BalanceView`:

```tsx
/**
 * What is owed, and the means to settle it. The payment section is the public
 * order page's own component, fed the same public order through the order's
 * access key, so paying, changing method and submitting a crypto transaction id
 * exist once in the shop. Without an access key (order links not configured, or
 * an older backend) only the figure shows, as before.
 */
function BalanceView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { order: data } = OrderFamily.useData();
  const queryClient = useQueryClient();
  const owed = data.outstandingBalance > 0;
  const accessKey = data.accessKey ?? null;

  const publicOrder = useQuery({
    queryKey: publicOrderKey(data.reference, accessKey ?? ''),
    queryFn: () => fetchPublicOrder(data.reference, accessKey!),
    enabled: owed && !!accessKey,
    retry: false,
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data ? pollInterval(query.state.data) : false),
    refetchIntervalInBackground: true,
  });

  // The payment section refreshes the public order itself; the account order
  // (its payments list and balance) has to follow it.
  const updatedAt = publicOrder.dataUpdatedAt;
  useEffect(() => {
    if (updatedAt) void queryClient.invalidateQueries({ queryKey: ['order', data.reference] });
  }, [updatedAt, queryClient, data.reference]);

  if (!owed) return null;
  return (
    <div {...styleAttrs}>
      <p className={classes.band}>
        <span>{t('account.order.balanceDue')}</span>
        <span>
          <Money amount={data.outstandingBalance} />
        </span>
      </p>
      {accessKey && publicOrder.data ? (
        <PaymentSection order={publicOrder.data} reference={data.reference} accessKey={accessKey} />
      ) : null}
      <CancelOrder
        reference={data.reference}
        canCancel={data.canCancel}
        blockedBy={data.cancelBlockedBy}
        onCancelled={() => {
          void queryClient.invalidateQueries({ queryKey: ['order', data.reference] });
          void queryClient.invalidateQueries({ queryKey: ['orders'] });
          if (accessKey) void queryClient.invalidateQueries({ queryKey: publicOrderKey(data.reference, accessKey) });
        }}
      />
    </div>
  );
}
```

Guard the invalidation effect against a loop: invalidating `['order', ref]` refetches the account order, which does not change `publicOrder.dataUpdatedAt`, so it settles; confirm by reading, and skip the first run (the initial load) with a ref if it causes a redundant refetch on mount. Add the imports (`useEffect`, `useQuery`, `useQueryClient`, `PaymentSection`, `CancelOrder`, `fetchPublicOrder`, `publicOrderKey`, `pollInterval`); `publicOrderKey` and `pollInterval` are exported from the order-status feature (find their files).

The previous markup put `styleAttrs` on the `<p className={classes.band}>` itself. Existing stored goldens of the account order page must not change for a SETTLED order or an order with NO access key: for those two cases render exactly the old markup (the bare `<p className={classes.band} {...styleAttrs}>`), and use the wrapping `<div>` only when there is a payment section or a cancel control to show. Restructure the return accordingly.

Rewrite the page's doc comment paragraph that says payment actions deliberately live on the public page: they now appear here too, through the same component, so there is still one implementation.

- [ ] **Step 3: Cancel on the public order page**

In `web/src/features/order-status/order-status-parts.tsx`, in the payment view (the adapter that renders `<PaymentSection order reference accessKey />`), render after it:

```tsx
      <CancelOrder
        reference={reference}
        accessKey={accessKey}
        viaLink
        canCancel={order.payment?.canCancel}
        blockedBy={order.payment?.cancelBlockedBy}
        onCancelled={() => void queryClient.invalidateQueries({ queryKey: publicOrderKey(reference, accessKey) })}
      />
```

with `useQueryClient()`. For an order whose `payment` has no `canCancel` (older backend) the control renders nothing, so existing goldens of the public order page are unchanged; confirm by running them.

- [ ] **Step 4: Run and check rendered**

Run: `npx vitest run test/account-order-pay.test.tsx test/cancel-order.test.tsx test/builder-account-parts.test.tsx test/builder-order-status-parts.test.tsx && npx tsc -b && npm test`
Expected: all green. A stored golden going red means the unchanged cases' markup moved: fix the code, do not regenerate.

Rendered check with a throwaway Playwright script on the mock backend (delete it afterwards): the account order page for an unpaid order with no method (the picker), with a pending hosted payment (the checkout link and Change), with a crypto payment (address and transaction ID form), and blocked from cancelling; the public order page with the cancel control; the confirmation open; at 390 and 1280 px in two templates. Look at each screenshot. Say what was checked.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/account/OrderDetailPage.tsx web/src/features/order-status/order-status-parts.tsx web/src/builder/blocks/OrderBalance.tsx web/src/builder/blocks/OrderStatusPayment.tsx web/test/account-order-pay.test.tsx
git commit -m "feat(account): pay, choose a method and cancel from the account order page; cancel on the order page"
```

---

### Task 7: Storefront, the unpaid order pop-up

UI task: the implementer loads the `frontend-design:frontend-design` skill.

**Files:**
- Create: `web/src/features/unpaid-prompt/rules.ts`, `useUnpaidOrder.ts`, `UnpaidOrderPrompt.tsx`, `UnpaidOrderPrompt.module.css`
- Create: `web/test/unpaid-prompt-rules.test.ts`, `web/test/unpaid-order-prompt.test.tsx`
- Modify: `web/src/layouts/StorefrontShell.tsx`, `MenuShell.tsx`, `WebAppShell.tsx` (mount beside `LoginModal`)
- Modify: `web/src/text/keys/order.ts`, `web/src/text/notes/order.ts`

**Interfaces:**
- Consumes: `fetchUnpaidOrders`, `UnpaidOrder` (Task 5); `listSavedOrders`, `fetchPublicOrder`; `CancelOrder`; `useSessionStore(selectIsLoggedIn)`.
- Produces: `promptAllowedOn(pathname): boolean`; `guestCandidates(saved, now): SavedOrder[]`; `PromptOrder`; `fromUnpaid(order)`, `fromPublic(saved, order)`; `<UnpaidOrderPrompt />`.

- [ ] **Step 1: Write the failing rules test**

Create `web/test/unpaid-prompt-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fromPublic, fromUnpaid, guestCandidates, promptAllowedOn } from '@/features/unpaid-prompt/rules.ts';

describe('promptAllowedOn', () => {
  it.each(['/', '/catalog', '/product/12', '/cart', '/account', '/account/orders', '/account/profile', '/track'])('shows on %s', (p) => {
    expect(promptAllowedOn(p)).toBe(true);
  });
  it.each([
    '/checkout', '/checkout/', '/order/K4M2QP/abc', '/payment/success', '/payment/cancel', '/order-placed',
    '/account/orders/K4M2QP', '/login', '/login/code', '/auth/telegram/callback', '/__builder',
  ])('never shows on %s', (p) => {
    expect(promptAllowedOn(p)).toBe(false);
  });
});

describe('guestCandidates', () => {
  const now = new Date('2026-10-04T12:00:00Z');
  const saved = (reference: string, daysAgo: number) => ({ reference, accessKey: `k-${reference}`, savedAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString() });
  it('takes the three most recent saved orders', () => {
    expect(guestCandidates([saved('A', 0), saved('B', 1), saved('C', 2), saved('D', 3)], now).map((s) => s.reference)).toEqual(['A', 'B', 'C']);
  });
  it('drops anything older than 14 days or with an unreadable date', () => {
    expect(guestCandidates([saved('A', 15), { reference: 'B', accessKey: 'k', savedAt: 'nonsense' }, saved('C', 13)], now).map((s) => s.reference)).toEqual(['C']);
  });
  it('is empty with nothing saved', () => {
    expect(guestCandidates([], now)).toEqual([]);
  });
});

describe('prompt order', () => {
  it('a signed-in unpaid order goes to its account page', () => {
    expect(fromUnpaid({ reference: 'K4M2QP', accessKey: 'abc', createdAt: '', totalAmount: 46.03, outstandingBalance: 46.03, payBy: null, canCancel: true, cancelBlockedBy: null }))
      .toEqual({ reference: 'K4M2QP', accessKey: 'abc', amount: 46.03, payPath: '/account/orders/K4M2QP', viaLink: false, canCancel: true, cancelBlockedBy: null });
  });
  it('a guest order goes to its order link, and only when it can still be paid', () => {
    const order = { reference: 'K4M2QP', totals: { totalAmount: 46.03 }, payment: { canPay: true, payBy: null, activePayment: null, canCancel: false, cancelBlockedBy: 'bank_transfer' } };
    expect(fromPublic({ reference: 'K4M2QP', accessKey: 'abc', savedAt: '' }, order as never))
      .toEqual({ reference: 'K4M2QP', accessKey: 'abc', amount: 46.03, payPath: '/order/K4M2QP/abc', viaLink: true, canCancel: false, cancelBlockedBy: 'bank_transfer' });
    expect(fromPublic({ reference: 'K4M2QP', accessKey: 'abc', savedAt: '' }, { ...order, payment: { ...order.payment, canPay: false } } as never)).toBeNull();
    expect(fromPublic({ reference: 'K4M2QP', accessKey: 'abc', savedAt: '' }, { reference: 'K4M2QP', totals: { totalAmount: 1 } } as never)).toBeNull();
  });
});
```

Check the `PublicOrder` type for where the total lives (`totals.totalAmount` is assumed above; use the real field and adjust the test and the code together).

- [ ] **Step 2: Implement the rules**

Create `web/src/features/unpaid-prompt/rules.ts`:

```ts
// The unpaid-order pop-up: every decision that needs no React.
import type { SavedOrder } from '@/stores/saved-orders.ts';
import type { UnpaidOrder } from '@/types/orders.ts';
import type { CancelBlockedBy, PublicOrder } from '@/types/public-order.ts';

/** Paths where the pop-up would be in the way of paying, or is already the subject of the page. */
const BLOCKED = [/^\/checkout(\/|$)/, /^\/order\//, /^\/payment\//, /^\/order-placed(\/|$)/, /^\/account\/orders\/[^/]+/, /^\/login(\/|$)/, /^\/auth\//, /^\/__builder/];

export function promptAllowedOn(pathname: string): boolean {
  return !BLOCKED.some((re) => re.test(pathname));
}

const MAX_GUEST_CHECKS = 3;
const MAX_AGE_MS = 14 * 86_400_000;

/** The saved order links worth asking about: the newest few, placed recently. */
export function guestCandidates(saved: readonly SavedOrder[], now: Date): SavedOrder[] {
  return saved
    .filter((s) => {
      const at = Date.parse(s.savedAt);
      return Number.isFinite(at) && now.getTime() - at <= MAX_AGE_MS;
    })
    .slice(0, MAX_GUEST_CHECKS);
}

export interface PromptOrder {
  reference: string;
  accessKey: string | null;
  amount: number;
  /** Where "Complete payment" goes. */
  payPath: string;
  /** Cancel through the order link (a guest) rather than the session. */
  viaLink: boolean;
  canCancel: boolean;
  cancelBlockedBy: CancelBlockedBy | null;
}

export function fromUnpaid(order: UnpaidOrder): PromptOrder {
  return {
    reference: order.reference, accessKey: order.accessKey, amount: order.outstandingBalance,
    payPath: `/account/orders/${encodeURIComponent(order.reference)}`, viaLink: false,
    canCancel: order.canCancel, cancelBlockedBy: order.cancelBlockedBy,
  };
}

/** A guest's saved order, if it can still be paid. */
export function fromPublic(saved: SavedOrder, order: PublicOrder): PromptOrder | null {
  if (!order.payment?.canPay) return null;
  return {
    reference: saved.reference, accessKey: saved.accessKey, amount: order.totals.totalAmount,
    payPath: `/order/${encodeURIComponent(saved.reference)}/${encodeURIComponent(saved.accessKey)}`, viaLink: true,
    canCancel: order.payment.canCancel ?? false, cancelBlockedBy: order.payment.cancelBlockedBy ?? null,
  };
}
```

`saved-orders` lists newest first already. Run the rules test: PASS.

- [ ] **Step 3: Text keys**

In `web/src/text/keys/order.ts`, after the `cancel.*` keys:

```ts
  'prompt.title': { en: 'You have an unpaid order', max: 80 },
  'prompt.body': { en: 'Order {reference} is waiting for payment.', max: 160 },
  'prompt.amount': { en: 'Amount due', max: 40 },
  'prompt.pay': { en: 'Complete payment', max: 40 },
  'prompt.later': { en: 'Not now', max: 40 },
  'prompt.more': { en: 'You have other unpaid orders too. See all orders', max: 120 },
```

with a note each.

- [ ] **Step 4: Write the failing component test**

Create `web/test/unpaid-order-prompt.test.tsx`. Mock `@/api/orders.ts` (`fetchUnpaidOrders`, `cancelOrder`), `@/api/public-order.ts` (`fetchPublicOrder`, `cancelPublicOrder`, keeping the real error classes), `@/stores/saved-orders.ts` (`listSavedOrders`), `@/app/settings.ts` (`useSettings` returning `{ supportLinks: [], currency: 'GBP' }` plus whatever the component reads), and the builder-mode hook the app uses to know it is inside the editor (find it: `useBuilderMode` in `@/builder/…`). Render inside `MantineProvider`, a `QueryClientProvider` and a `MemoryRouter` with an initial path, and set the session with `useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Ada' } })` or `{ token: null, customer: null }`. Clear `sessionStorage` in `beforeEach`.

```tsx
it('signed in: shows the newest unpaid order with its amount and the three actions', async () => {
  // fetchUnpaidOrders → [K4M2QP 46.03, older one]; on '/' → dialog titled 'You have an unpaid order',
  // text 'Order K4M2QP is waiting for payment.', buttons 'Complete payment', 'Cancel order', 'Not now',
  // and the 'other unpaid orders' line because there are two.
  // fetchPublicOrder and listSavedOrders are NOT consulted.
});
it('signed in: Complete payment goes to the account order page and closes the dialog', async () => { /* path becomes /account/orders/K4M2QP */ });
it('guest: checks the saved order links and shows one that can still be paid', async () => {
  // token null; listSavedOrders → two recent; fetchPublicOrder resolves canPay false for the first, true for the second
  // → dialog for the second; Complete payment → /order/<ref>/<key>; fetchUnpaidOrders NOT called.
});
it('guest: a saved link that no longer resolves is skipped, and nothing shows if none qualifies', async () => { /* fetchPublicOrder rejects InvalidLinkError → no dialog */ });
it('Not now hides it for the rest of the visit, across route changes and remounts', async () => {
  // click Not now → gone; sessionStorage flag set; remount on another allowed path → still gone; fetchUnpaidOrders not called again
});
it.each(['/checkout', '/order/K4M2QP/abc', '/payment/success', '/account/orders/K4M2QP', '/login'])('never shows on %s', async (path) => { /* no dialog, and no request is made on those paths */ });
it('never shows in the page builder', async () => { /* builder mode on → nothing */ });
it('cancelling from the dialog closes it and refreshes', async () => { /* Cancel order → Yes, cancel it → cancelOrder called → dialog gone */ });
it('an order that cannot be cancelled shows the contact line instead of Cancel', async () => { /* canCancel false, cancelBlockedBy 'bank_transfer' */ });
it('a failed lookup shows nothing and does not throw', async () => { /* fetchUnpaidOrders rejects (older backend 404) */ });
it('signing out mid-visit never shows a signed-in customer’s order to the next visitor', async () => {
  // signed in with an unpaid order showing; set token null → the dialog closes; the guest path runs from saved orders only
});
```

Write each in full. Run: FAIL.

- [ ] **Step 5: Implement the hook and the component**

`web/src/features/unpaid-prompt/useUnpaidOrder.ts`: a hook returning `{ order: PromptOrder | null; more: boolean }`:

- disabled (returns null, makes no request) when: the current path is not allowed (`promptAllowedOn(useLocation().pathname)`), builder mode is on, the visit is snoozed (`sessionStorage.getItem('sf-unpaid-prompt-snoozed') === '1'`, read through a small `try/catch` helper), or the shop is closed / access denied (read the same gates the app shell uses; if that is not available from a hook without prop drilling, rely on the frames only mounting it for visitors who are let in, and say so);
- signed in (`useSessionStore(selectIsLoggedIn)`): `useQuery({ queryKey: ['orders', 'unpaid'], queryFn: fetchUnpaidOrders, retry: false, staleTime: 60_000, refetchOnWindowFocus: false })`; the first entry via `fromUnpaid`; `more` when there are two or more;
- signed out: `useQuery({ queryKey: ['unpaid-prompt', 'guest', candidates.map((c) => c.reference).join(',')], enabled: candidates.length > 0, retry: false, staleTime: 60_000, refetchOnWindowFocus: false, queryFn })` where `queryFn` fetches the candidates one after another with `fetchPublicOrder`, catching each failure, and returns the first non-null `fromPublic`; `more` is false;
- the query key includes whether the visitor is signed in, so a sign-out never serves the signed-in result to a guest.

`web/src/features/unpaid-prompt/UnpaidOrderPrompt.tsx`: uses Mantine's `Modal` (as `LoginModal` does; read it for the props and the classes it passes so the dialog matches the templates), opened when the hook returns an order and it has not been dismissed in this mount. Content: title `order.prompt.title`; body `order.prompt.body` with the reference; the amount (`order.prompt.amount` + `<Money>`); a primary button `order.prompt.pay` that calls `navigate(order.payPath)` and closes; `<CancelOrder reference accessKey viaLink canCancel blockedBy onCancelled={close-and-invalidate} />`; a text button `order.prompt.later` that snoozes (`sessionStorage.setItem('sf-unpaid-prompt-snoozed', '1')`) and closes; the `order.prompt.more` line as a link to `/account/orders` when `more`. Closing the dialog by its close button or Escape counts as "Not now". `onCancelled` invalidates `['orders']` (which includes `['orders','unpaid']`) and the guest query.

Mount `<UnpaidOrderPrompt />` in the three frames beside `LoginModal` (`web/src/layouts/StorefrontShell.tsx`, `MenuShell.tsx`, `WebAppShell.tsx`). Unlike `LoginModal` it does not depend on `features.accounts` (guests get it too) or on `native`.

Add `'order.prompt.*'` and `'order.cancel.*'` wherever the text guards require a declaration for a frame-level component (read how `LoginModal`'s `auth.*` keys satisfy the guards and do the same).

- [ ] **Step 6: Run and check rendered**

Run: `npx vitest run test/unpaid-prompt-rules.test.ts test/unpaid-order-prompt.test.tsx && npx tsc -b && npm test`
Expected: fully green; no golden changes (the frames' goldens render with no unpaid order, so the modal is closed; if a frame golden changes because a closed Mantine modal adds markup, mount the modal only when there is an order to show, as a conditional render).

Rendered check with a throwaway Playwright script on the mock backend (delete it afterwards): the dialog for a signed-in customer and for a guest, the confirmation step inside it, the contact variant, at 390 and 1280 px, in the storefront, menu and webapp layouts and two templates. Check it does not appear on `/checkout`. Look at each screenshot. Say what was checked.

- [ ] **Step 7: Commit**

```bash
git add web/src/features/unpaid-prompt web/src/layouts/StorefrontShell.tsx web/src/layouts/MenuShell.tsx web/src/layouts/WebAppShell.tsx web/src/text/keys/order.ts web/src/text/notes/order.ts web/test/unpaid-prompt-rules.test.ts web/test/unpaid-order-prompt.test.tsx
git commit -m "feat(orders): ask a returning customer whether to complete or cancel an unpaid order"
```

---

### Task 8: End-to-end tests, baselines, docs, then stop

**Files:**
- Modify: `e2e/mocks.ts` (cancel routes, the unpaid lookup, `canCancel` on fixtures, a `payment-method` answer that updates the mock order)
- Create: `e2e/unpaid-orders.spec.ts`
- Modify: `docs/builder.md`
- Regenerate: only baselines named by Step 3

Run from the repo root.

- [ ] **Step 1: Mocks**

In `e2e/mocks.ts`, in the style of the existing public-order and account routes (read lines around the `orders/` and `storefront/orders` handlers first):

- `InstallMocksOptions` gains `unpaidOrders?: UnpaidOrder[]` (default `[]`), `cancelAnswers?: number | 'ok'` (default `'ok'`; a number answers that status with `ORDER_NOT_CANCELLABLE:bank_transfer` for 409), and the mock state gains `cancels: string[]`;
- `GET storefront/orders/unpaid` (matched BEFORE the `storefront/orders/:ref` handler) answers `options.unpaidOrders`, minus any reference already in `state.cancels`;
- `POST storefront/orders/:ref/cancel` and `POST orders/:ref/:key/cancel` record the reference in `state.cancels` and answer `{ reference, status: 'cancelled' }`, then make the mocked order detail and public order read `status: 'cancelled'`, `outstandingBalance: 0`, `payment.canPay: false`, `canCancel: false`; or answer the configured failure;
- the default order fixtures gain `payment.canCancel: true`, `payment.cancelBlockedBy: null` on the public order and `accessKey`, `canCancel: true`, `cancelBlockedBy: null` on the account order detail ONLY through new options (`tweakOrderDetail` already exists; add the equivalent hook for the public order if there is none), so every existing spec and baseline keeps the fixtures it has.

- [ ] **Step 2: End-to-end tests**

Create `e2e/unpaid-orders.spec.ts` using `installMocks` and the helpers the existing specs use to sign in and open a path (read `e2e/shell-cart-account-parts.spec.ts` and the account-order tests added to `e2e/checkout-parts.spec.ts` for the patterns). Synthetic data only. Tests:

1. signed-in customer on `/account/orders/K4M2QP`, unpaid with no method: the payment picker is shown; choosing a method posts it (`mocks.state.methods`).
2. the same page with a pending hosted payment: a checkout link with the mocked URL.
3. cancel from the account order page: Cancel order → confirmation → Yes → the page shows the order as cancelled; `mocks.state.cancels` is `['K4M2QP']`.
4. cancel refused: the mock answers 409 → the in-flight message is shown and the order is refreshed.
5. cancel from the public order page (`/order/K4M2QP/<key>`).
6. the pop-up for a signed-in customer on `/`: title, reference, amount; Complete payment lands on `/account/orders/K4M2QP`.
7. the pop-up: Not now → gone; navigate to `/account` and back to `/` → still gone; a fresh page load in the same context (session storage survives a reload) → still gone.
8. the pop-up for a guest: seed `sf-orders-v1` with one saved order whose public order has `canPay: true` → shown; Complete payment lands on `/order/<ref>/<key>`.
9. the pop-up never appears on `/checkout` with an unpaid order present.
10. cancel from the pop-up: the dialog closes and does not come back on the next navigation.
11. inside Telegram (`installTelegramStub`): the pop-up appears and Complete payment works.

Click radios and buttons the way a shopper does (labels and roles; never `force`). Run: `npm run test:e2e -- unpaid-orders.spec.ts --repeat-each=3`: all pass three times.

- [ ] **Step 3: Full runs and baselines**

Run `TZ=UTC npm test` and `npm run test:e2e` (output to a file outside the repo; read the whole summary). Unit suites: all green. End to end: known pre-existing flakes are `core-options.spec.ts:41` and, under full-suite load, guest "default arrangement" and "exactly one Turnstile mint" tests in `checkout-parts.spec.ts`; re-run any failure alone three times and report both results. No baseline is expected to change: existing fixtures carry no `accessKey`, no `canCancel` and no unpaid orders, so every existing page renders as before and the pop-up never opens. A baseline that differs is unexpected: read its diff; if it is not an intended change of this plan, the code is wrong — stop and report.

- [ ] **Step 4: Docs**

In `docs/builder.md`: in the account order parts section, replace the statement that the balance part only displays the figure with: the `OrderBalance` part shows the balance and, when the order can still be paid, the same payment section as the order page (through the order's access key) and the cancel control; in the order-status parts section note the cancel control in the payment part; add a short section "Unpaid order prompt" describing `features/unpaid-prompt/` (frame-level, not a block; where it never shows; "Not now" lasts for the visit; wording under `order.prompt.*` and `order.cancel.*`).

- [ ] **Step 5: Commit**

```bash
git add e2e/mocks.ts e2e/unpaid-orders.spec.ts docs/builder.md
git commit -m "test(orders): end-to-end unpaid order recovery on the mock backend; docs"
```

- [ ] **Step 6: Stop and report**

Report to the owner: both branches and their commits, unit and e2e results, which rendered checks were done, and what was not verified (no real backend; no real cancellation of an order with store credit, a coupon or a live hosted checkout; no payment actually arriving after a cancel; the bot untouched). Merging, the `web 0.16.0` bump, the `v0.16.0` tag and any push or deploy happen only on their say-so, backend first.
