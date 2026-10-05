import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { installMocks, installTelegramStub, type Layout, type OrderFixtureName } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';
import type { UnpaidOrder } from '../web/src/types/orders.ts';

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

const unpaidRow = (): UnpaidOrder => ({
  reference: REF, createdAt: '2026-08-24T08:30:00.000Z', totalAmount: 46.03, outstandingBalance: 46.03,
  payBy: null, canCancel: true, cancelBlockedBy: null,
});

interface Setup { template: string; preset: string; layout: Layout; width: number; fixture: OrderFixtureName }

async function setup(page: Page, s: Setup, unpaidOrders?: UnpaidOrder[]): Promise<void> {
  await page.setViewportSize({ width: s.width, height: s.width < 768 ? 844 : 900 });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The Mini App frame only renders inside Telegram, so the webapp layout gets the same stub the other specs use.
  if (s.layout === 'webapp') await installTelegramStub(page);
  const tweakSettings = await presetTheme(page, s.template, s.preset);
  await installMocks(page, {
    layout: s.layout, session: true, orderFixture: s.fixture, orderReference: REF, tweakSettings, ...(unpaidOrders ? { unpaidOrders } : {}),
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
            await page.screenshot({
              path: `${SHOTS}${t.template}/${t.template}-${layout}-${width}-${fixture}.png`,
              fullPage: true, animations: 'disabled', caret: 'hide',
            });
          });
        }
      }
    }

    for (const width of WIDTHS) {
      test(`storefront ${width} cancel dialog`, async ({ page }) => {
        await setup(page, { ...t, layout: 'storefront', width, fixture: 'unpaid' });
        await page.goto(`/account/orders/${REF}`);
        await settle(page, 'unpaid');
        await page.getByRole('region', { name: 'Payment needed' }).getByRole('button', { name: 'Cancel order' }).click();
        await expect(page.getByRole('dialog', { name: `Cancel order ${REF}?` })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: `${SHOTS}${t.template}/${t.template}-storefront-${width}-cancel-dialog.png`, animations: 'disabled', caret: 'hide',
        });
      });

      test(`storefront ${width} popup`, async ({ page }) => {
        await setup(page, { ...t, layout: 'storefront', width, fixture: 'unpaid' }, [unpaidRow()]);
        await page.goto('/');
        await expect(page.getByRole('dialog', { name: 'You have an unpaid order' })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForLoadState('networkidle');
        await page.screenshot({
          path: `${SHOTS}${t.template}/${t.template}-storefront-${width}-popup.png`, animations: 'disabled', caret: 'hide',
        });
      });
    }
  });
}
