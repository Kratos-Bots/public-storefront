import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { installMocks, installTelegramStub, type Layout, type OrderFixtureName } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';
import type { OrderDetail, UnpaidOrder } from '../web/src/types/orders.ts';
import type { PaymentMethod } from '../web/src/types/checkout.ts';

/**
 * Screenshots of the account order page for a visual review: every template x layout x width x order state, plus the
 * cancel dialog and the unpaid-order pop-up per template and width. Not an assertion suite, so it only runs when asked:
 * `ORDER_OVERVIEW_SHOTS=1 TZ=UTC npx playwright test -c e2e/playwright.config.ts e2e/order-overview-visual.spec.ts`
 * (add `E2E_REAL_FONTS=1` for the templates' real web fonts). Synthetic data only.
 */

test.skip(process.env.ORDER_OVERVIEW_SHOTS !== '1', 'set ORDER_OVERVIEW_SHOTS=1 to capture the order page screenshots');

const SHOTS = fileURLToPath(new URL('./screenshots/order-overview/', import.meta.url));
const REF = 'K4M2QP';

const TEMPLATES = [
  { template: 'modern', preset: 'default' },
  { template: 'bento', preset: 'tech-dark' },
  { template: 'cyber-brutalism', preset: 'acid-dark' },
  { template: 'dark-luxury', preset: 'gold' },
] as const;
const LAYOUTS: Layout[] = ['storefront', 'menu', 'webapp'];
const WIDTHS = [390, 1280] as const;
const STATES: OrderFixtureName[] = ['unpaid', 'hosted', 'crypto', 'shipped', 'collection', 'cancelled'];
const UNPAID_STATES: OrderFixtureName[] = ['unpaid', 'hosted', 'crypto'];

const LONG_ITEM = 'Alpine Extract 10ml, Limited Winter Reserve Edition with presentation box and a hand-written card';

/**
 * The shop's ways to pay, all on one base of 47.45 (42.50 + 4.95 delivery): a card with a 3% fee (1.42, so 48.87),
 * crypto with a 3% discount (-1.42, so 46.03), and a bank transfer under a long name (no fee, so 47.45).
 */
const METHODS: PaymentMethod[] = [
  { method: 'sushipp', displayName: 'Pay by card', type: 'gateway', details: null, feeType: 'percent', feeValue: 3, feeRateText: '+3%', feeLabel: 'Card fee', fee: 1.42, chargeTotal: 48.87 },
  { method: 'crypto_static', displayName: 'Pay with crypto', type: 'crypto', details: null, feeType: 'percent', feeValue: -3, feeRateText: '−3%', feeLabel: 'Crypto discount', fee: -1.42, chargeTotal: 46.03,
    cryptoOptions: [
      { coin: 'btc', network: 'bitcoin', coinLabel: 'BTC', networkLabel: 'Bitcoin', feeType: 'percent', feeValue: -3, feeRateText: '−3%', feeLabel: 'Crypto discount', fee: -1.42, chargeTotal: 46.03 },
      { coin: 'usdt', network: 'polygon', coinLabel: 'USDT', networkLabel: 'Polygon', feeType: 'percent', feeValue: -3, feeRateText: '−3%', feeLabel: 'Crypto discount', fee: -1.42, chargeTotal: 46.03 },
    ] },
  { method: 'uk_bank_transfer', displayName: 'Bank transfer from a UK account, settled the same day for orders placed before 3pm', type: 'offline', details: { 'Account Name': 'Example Shop Ltd', 'Sort Code': '00-00-00', 'Account Number': '00000000' }, feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 47.45 },
];

const unpaidRow = (): UnpaidOrder => ({
  reference: REF, createdAt: '2026-08-24T08:30:00.000Z', totalAmount: 46.03, outstandingBalance: 46.03,
  payBy: null, canCancel: true, cancelBlockedBy: null,
});

const STATE_TOTALS: Record<OrderFixtureName, number> = { unpaid: 47.45, hosted: 48.87, crypto: 46.03, shipped: 46.03, collection: 46.03, cancelled: 47.45 };

/** Nothing on the page pokes out sideways: the one thing this spec asserts of every capture. */
async function expectNoOverflow(page: Page): Promise<void> {
  const o = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(o.scroll, 'horizontal overflow').toBeLessThanOrEqual(o.inner);
}

interface Setup { template: string; preset: string; layout: Layout; width: number; fixture: OrderFixtureName; browser?: boolean }

async function setup(page: Page, s: Setup, unpaidOrders?: UnpaidOrder[], tweak?: (d: OrderDetail) => void) {
  await page.setViewportSize({ width: s.width, height: s.width < 768 ? 844 : 900 });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The Mini App frame only renders inside Telegram, so the webapp layout gets the same stub the other specs use.
  if (s.layout === 'webapp' && !s.browser) await installTelegramStub(page);
  const tweakSettings = await presetTheme(page, s.template, s.preset);
  return installMocks(page, {
    layout: s.layout, session: true, orderFixture: s.fixture, orderReference: REF, tweakSettings, paymentMethods: METHODS,
    // Long names, so wrapping is exercised. The total is the 47.45 base plus whatever the state's method adds: nothing
    // while none is chosen, the card's fee for the hosted checkout, the crypto discount for crypto and for the paid states.
    tweakOrderDetail: (d) => {
      d.items[0]!.name = LONG_ITEM;
      const total = STATE_TOTALS[s.fixture];
      d.totalAmount = total;
      if (d.outstandingBalance > 0) d.outstandingBalance = total;
      for (const p of d.payments) p.amount = total;
      tweak?.(d);
    },
    ...(unpaidOrders ? { unpaidOrders } : {}),
  });
}

async function settle(page: Page, fixture: OrderFixtureName): Promise<void> {
  await expect(page.getByRole('heading', { name: REF, level: 1 })).toBeVisible();
  if (UNPAID_STATES.includes(fixture)) {
    const card = page.getByRole('region', { name: 'Payment needed' });
    await expect(card).toBeVisible();
    await expect(card.getByText(/loading/i)).toHaveCount(0);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
}

for (const t of TEMPLATES) {
  test.describe(`order overview shots · ${t.template}`, () => {
    for (const layout of LAYOUTS) {
      for (const width of WIDTHS) {
        for (const fixture of STATES) {
          test(`${layout} ${width} ${fixture}`, async ({ page }) => {
            await setup(page, { ...t, layout, width, fixture });
            await page.goto(`/account/orders/${REF}`);
            await settle(page, fixture);
            await expectNoOverflow(page);
            await page.screenshot({
              path: `${SHOTS}${t.template}/${t.template}-${layout}-${width}-${fixture}.png`,
              fullPage: true, animations: 'disabled', caret: 'hide',
            });
          });
        }
      }
    }

    // Keyboard focus lands on the pop-up's primary button after one Tab (the dialog opens on its sentence): one ring,
    // no heavier than the template's other focus rings.
    // The web app layout in a plain browser: Back beside the primary action in the in-page bar.
    test('webapp 390 bottom bar', async ({ page }) => {
      const mocks = await setup(page, { ...t, layout: 'webapp', width: 390, fixture: 'unpaid', browser: true });
      mocks.state.cart = {
        items: [{
          productId: 101, name: 'Alpine Extract 10ml', quantity: 1, unitPrice: 42.5, lineTotal: 42.5, imageUrl: null, isPreorder: false,
          outOfStock: false, priceChanged: false, inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null,
        }],
        subtotal: 42.5, itemCount: 1,
      };
      await page.goto('/cart');
      const bar = page.locator('[data-sf-part="primary-bar"]');
      await expect(bar.getByRole('button', { name: 'Back' })).toBeVisible();
      await expect(bar.getByRole('button', { name: /^Checkout · / })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expectNoOverflow(page);
      await page.screenshot({
        path: `${SHOTS}${t.template}/${t.template}-webapp-390-bottom-bar.png`, animations: 'disabled', caret: 'hide',
      });
    });

    test('storefront 390 popup focus', async ({ page }) => {
      await setup(page, { ...t, layout: 'storefront', width: 390, fixture: 'unpaid' }, [unpaidRow()]);
      await page.goto('/');
      const dialog = page.getByRole('dialog', { name: 'You have an unpaid order' });
      await expect(dialog).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.keyboard.press('Tab');
      const primary = dialog.getByRole('button', { name: 'Review or cancel order' });
      await expect(primary).toBeFocused();
      expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('Review or cancel order');
      await page.waitForLoadState('networkidle');
      const ring = await primary.evaluate((el) => {
        const s = getComputedStyle(el);
        return { outline: `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`, offset: s.outlineOffset, shadow: s.boxShadow };
      });
      console.log(`FOCUS ${t.template}: ${JSON.stringify(ring)}`);
      await page.screenshot({
        path: `${SHOTS}${t.template}/${t.template}-storefront-390-popup-focus.png`, animations: 'disabled', caret: 'hide',
      });
    });

    for (const width of WIDTHS) {
      test(`storefront ${width} cancel dialog`, async ({ page }) => {
        await setup(page, { ...t, layout: 'storefront', width, fixture: 'unpaid' });
        await page.goto(`/account/orders/${REF}`);
        await settle(page, 'unpaid');
        await page.getByRole('region', { name: 'Payment needed' }).getByRole('button', { name: 'Cancel order' }).click();
        await expect(page.getByRole('dialog', { name: `Cancel order ${REF}?` })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await expectNoOverflow(page);
        await page.screenshot({
          path: `${SHOTS}${t.template}/${t.template}-storefront-${width}-cancel-dialog.png`, animations: 'disabled', caret: 'hide',
        });
      });

      // The payment card's foot: the Cancel order button, and (an order the customer cannot cancel) the contact line.
      // The space under the foot's visible content should match the card's own padding in both.
      for (const foot of ['button', 'contact'] as const) {
        test(`storefront ${width} payment card foot (${foot})`, async ({ page }, info) => {
          await setup(page, { ...t, layout: 'storefront', width, fixture: 'unpaid' }, undefined,
            foot === 'contact' ? (d) => { d.canCancel = false; d.cancelBlockedBy = 'bank_transfer'; } : undefined);
          await page.goto(`/account/orders/${REF}`);
          await settle(page, 'unpaid');
          const card = page.getByRole('region', { name: 'Payment needed' });
          if (foot === 'contact') await expect(card.getByText(/To cancel this order, contact us/)).toBeVisible();
          else await expect(card.getByRole('button', { name: 'Cancel order' })).toBeVisible();
          const m = await card.evaluate((el) => {
            const box = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            const foot = el.querySelector('[data-sf-part="cancel"]')!;
            // The visible content: the text of the button, or the last link / paragraph of the contact line.
            const range = document.createRange();
            const items = [...foot.querySelectorAll('button[aria-haspopup], a, p')].filter((n) => (n as HTMLElement).innerText.trim() !== '');
            range.selectNodeContents(items[items.length - 1]!);
            const text = range.getBoundingClientRect();
            return {
              underContent: Math.round((box.bottom - parseFloat(style.borderBottomWidth) - text.bottom) * 10) / 10,
              sidePadding: parseFloat(style.paddingLeft),
              bottomPadding: parseFloat(style.paddingBottom),
            };
          });
          console.log(`MEASURE ${t.template} ${width} ${foot}: ${JSON.stringify(m)}`);
          info.annotations.push({ type: 'measure', description: JSON.stringify(m) });
          await card.screenshot({
            path: `${SHOTS}${t.template}/${t.template}-storefront-${width}-foot-${foot}.png`, animations: 'disabled', caret: 'hide',
          });
        });
      }

      test(`storefront ${width} popup`, async ({ page }) => {
        await setup(page, { ...t, layout: 'storefront', width, fixture: 'unpaid' }, [unpaidRow()]);
        await page.goto('/');
        await expect(page.getByRole('dialog', { name: 'You have an unpaid order' })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForLoadState('networkidle');
        await expectNoOverflow(page);
        await page.screenshot({
          path: `${SHOTS}${t.template}/${t.template}-storefront-${width}-popup.png`, animations: 'disabled', caret: 'hide',
        });
      });
    }
  });
}
