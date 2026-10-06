import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { installMocks } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';
import type { CryptoOption, PaymentMethod } from '../web/src/types/checkout.ts';

/**
 * Screenshots of the crypto network picker for a visual review: the checkout's payment step and the account order
 * page, on every template, at 390 and 1280, with a realistic eight-option shop and one row chosen. Not an assertion
 * suite beyond "nothing overflows sideways", so it only runs when asked, and it writes outside the repo:
 * `CRYPTO_GROUP_SHOTS=<output dir> TZ=UTC npx playwright test -c e2e/playwright.config.ts e2e/crypto-groups-visual.spec.ts`
 * Synthetic data only.
 */

const OUT = process.env.CRYPTO_GROUP_SHOTS ?? '';
test.skip(!OUT, 'set CRYPTO_GROUP_SHOTS to an output directory to capture the crypto picker screenshots');

const REF = 'K4M2QP';
const TEMPLATES = [
  { template: 'modern', preset: 'default' },
  { template: 'bento', preset: 'tech-dark' },
  { template: 'cyber-brutalism', preset: 'acid-dark' },
  { template: 'dark-luxury', preset: 'gold' },
] as const;
const WIDTHS = [390, 1280] as const;

const rate = { feeType: 'percent', feeValue: -3, feeRateText: '−3%', feeLabel: 'Crypto discount', fee: -1.42, chargeTotal: 46.03 };
const opt = (coin: string, network: string, coinLabel: string, networkLabel: string, extra: Partial<CryptoOption> = {}): CryptoOption =>
  ({ coin, network, coinLabel, networkLabel, ...rate, ...extra });

const OPTIONS: CryptoOption[] = [
  opt('btc', 'bitcoin', 'BTC', 'Bitcoin'),
  opt('ltc', 'litecoin', 'LTC', 'Litecoin'),
  opt('eth', 'ethereum', 'ETH', 'Ethereum'),
  opt('usdt', 'ethereum', 'USDT', 'Ethereum', { feeRateText: '+2%', chargeTotal: 48.4, fee: 0.95 }),
  opt('usdc', 'ethereum', 'USDC', 'Ethereum', { feeRateText: '+2%', chargeTotal: 48.4, fee: 0.95 }),
  opt('usdt', 'tron', 'USDT', 'Tron'),
  opt('usdt', 'polygon', 'USDT', 'Polygon'),
  opt('usdc', 'polygon', 'USDC', 'Polygon'),
];

const METHODS: PaymentMethod[] = [
  { method: 'crypto', displayName: 'Pay with crypto', type: 'crypto', details: null, ...rate, cryptoOptions: OPTIONS },
  { method: 'stripe', displayName: 'Pay by card', type: 'gateway', details: null, feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 47.45 },
];

async function expectNoOverflow(page: Page): Promise<void> {
  const o = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(o.scroll, 'horizontal overflow').toBeLessThanOrEqual(o.inner);
}

async function open(page: Page, t: (typeof TEMPLATES)[number], width: number, orderFixture?: 'unpaid') {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const tweakSettings = await presetTheme(page, t.template, t.preset);
  return installMocks(page, {
    layout: 'storefront', session: true, tweakSettings, paymentMethods: METHODS,
    ...(orderFixture ? { orderFixture, orderReference: REF } : {}),
  });
}

const shot = (page: Page, name: string) => {
  mkdirSync(OUT, { recursive: true });
  return page.screenshot({ path: resolve(OUT, name), fullPage: true, animations: 'disabled', caret: 'hide' });
};

for (const t of TEMPLATES) {
  for (const width of WIDTHS) {
    test(`checkout payment · ${t.template} · ${width}`, async ({ page }) => {
      const mocks = await open(page, t, width);
      mocks.state.cart = {
        items: [{
          productId: 101, name: 'Alpine Extract 10ml', quantity: 1, unitPrice: 42.5, lineTotal: 42.5, imageUrl: null, isPreorder: false, outOfStock: false,
          priceChanged: false, inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null,
        }],
        subtotal: 42.5, itemCount: 1,
      };
      await page.goto('/checkout');
      const next = () => page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('textbox', { name: 'First name' }).fill('Ada');
      await page.getByRole('textbox', { name: 'Surname' }).fill('Sterling');
      await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.invalid');
      await next();
      await page.getByRole('textbox', { name: 'Address line 1' }).fill('14 Kirkgate');
      await page.getByRole('textbox', { name: 'Town / City' }).fill('Leeds');
      await page.getByRole('textbox', { name: 'Postcode' }).fill('LS1 6BY');
      await next();
      await expect(page.getByText('Tracked 24')).toBeVisible();
      const asked = mocks.state.quotes.length;
      await page.getByText('Tracked 24').click();
      await expect.poll(() => mocks.state.quotes.length).toBeGreaterThan(asked);
      await next();
      await expect(page.getByRole('heading', { name: /How you.ll pay/ })).toBeVisible();
      await page.locator('label').filter({ hasText: 'Pay with crypto' }).first().click();
      await page.getByRole('radio', { name: /^USDT on Polygon/ }).check({ force: true });
      await page.evaluate(() => document.fonts.ready);
      await expectNoOverflow(page);
      await shot(page, `checkout-${t.template}-${width}.png`);
    });

    test(`order page · ${t.template} · ${width}`, async ({ page }) => {
      await open(page, t, width, 'unpaid');
      await page.goto(`/account/orders/${REF}`);
      await expect(page.getByRole('heading', { name: REF, level: 1 })).toBeVisible();
      await page.getByRole('button', { name: /^Pay with crypto/ }).click();
      await page.getByRole('radio', { name: /^USDT on Polygon/ }).check({ force: true });
      await expect(page.getByRole('button', { name: 'Pay with USDT on Polygon' })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expectNoOverflow(page);
      await shot(page, `order-${t.template}-${width}.png`);
    });
  }
}
