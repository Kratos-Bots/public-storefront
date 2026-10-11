import { expect, test, type Page } from '@playwright/test';
import { installMocks, type Layout, type MockHandle } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';

/**
 * The checkout on a phone is the lightest it can be: one heading, no stepper, no order summary until the review,
 * where the summary is open with nothing to collapse. From 62em up nothing is hidden. Mocked backend only.
 *
 * Set SF_SHOTS to a directory to also save a screenshot of every step (the review pass for this change).
 */

const LAYOUTS: Layout[] = ['storefront', 'menu', 'webapp'];
const SHOTS = process.env.SF_SHOTS;
const PRESETS = [
  { template: 'cyber-brutalism', preset: 'acid-dark' },
  { template: 'modern', preset: 'default' },
];

const LINE_NAME = 'Alpine Extract 10ml';

async function seedCart(mocks: MockHandle): Promise<void> {
  mocks.state.cart = {
    items: [{
      productId: 101, name: LINE_NAME, quantity: 1, unitPrice: 42.5, lineTotal: 42.5, imageUrl: null, isPreorder: false, outOfStock: false, priceChanged: false,
      inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null,
    }],
    subtotal: 42.5, itemCount: 1,
  };
}

const stepper = (page: Page) => page.locator('[data-sf-part="stepper"]');
const summary = (page: Page) => page.getByRole('region', { name: 'Order summary' });

/** Fill the current step (default order: contact, address, shipping, payment, review) and press Continue. */
async function fillAndContinue(page: Page, kind: string): Promise<void> {
  if (kind === 'contact') {
    await page.getByRole('textbox', { name: 'First name' }).fill('Ada');
    await page.getByRole('textbox', { name: 'Surname' }).fill('Sterling');
    await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.invalid');
  } else if (kind === 'address') {
    await page.getByRole('textbox', { name: 'Address line 1' }).fill('14 Kirkgate');
    await page.getByRole('textbox', { name: 'Town / City' }).fill('Leeds');
    await page.getByRole('textbox', { name: 'Postcode' }).fill('LS1 6BY');
  } else if (kind === 'shipping') {
    await page.getByText('Tracked 24').click();
  } else if (kind === 'payment') {
    await page.locator('label').filter({ hasText: 'Crypto' }).first().click();
    await page.locator('label').filter({ hasText: 'USDT' }).first().click();
  }
  await page.getByRole('button', { name: 'Continue' }).click();
}

const KINDS = ['contact', 'address', 'shipping', 'payment', 'review'];
const TITLE: Record<string, string | RegExp> = {
  contact: 'Your details', address: 'Delivery address', shipping: 'Delivery and discounts', payment: /How you.ll pay/, review: 'Review your order',
};

for (const layout of LAYOUTS) {
  for (const t of PRESETS) {
    for (const width of [390, 1280] as const) {
      test(`${layout} · ${t.template} · ${width}px: one heading; ${width < 992 ? 'no stepper, summary only on the review, open' : 'stepper and summary on every step'}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        await page.clock.setFixedTime(FIXED_NOW);
        const mocks = await installMocks(page, { layout, session: true, tweakSettings: await presetTheme(page, t.template, t.preset) });
        await seedCart(mocks);
        await page.goto('/checkout');

        // C1: the word is on the page once, as the heading.
        await expect(page.getByRole('heading', { name: 'Checkout', level: 1 })).toBeVisible();
        await expect(page.getByText('Checkout', { exact: true })).toHaveCount(1);

        for (const [i, kind] of KINDS.entries()) {
          await expect(page.getByRole('heading', { name: TITLE[kind]!, level: 2 }).first()).toBeVisible();
          await page.waitForTimeout(800);
          const review = kind === 'review';
          if (width >= 992) {
            await expect(stepper(page)).toBeVisible();
            await expect(summary(page)).toBeVisible();
          } else {
            await expect(stepper(page)).toBeHidden();
            // The step count stays: it is the shopper's only "where am I".
            await expect(page.getByText(`Step ${i + 1} of 5`)).toBeVisible();
            if (review) {
              await expect(summary(page)).toBeVisible();
              await expect(summary(page)).toHaveAttribute('data-open', 'true');
              await expect(summary(page).getByRole('button')).toHaveCount(0);
              await expect(summary(page).getByText(LINE_NAME)).toBeVisible();
              await expect(summary(page).getByText('Total', { exact: true })).toBeVisible();
            } else {
              await expect(summary(page)).toBeHidden();
            }
          }
          if (SHOTS && (width === 390 || kind === 'contact' || review)) {
            await page.screenshot({ path: `${SHOTS}/${layout}-${t.template}-${width}-${i + 1}-${kind}.png`, fullPage: true });
          }
          if (!review) await fillAndContinue(page, kind);
        }
      });
    }
  }
}
