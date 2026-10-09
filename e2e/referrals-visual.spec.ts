import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { installMocks } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';

/**
 * The referral field under the coupon (guest checkout) and the link on the Referrals page, for a visual review.
 * Only runs when asked, and writes outside the repo:
 * `REFERRAL_SHOTS=<output dir> TZ=UTC npx playwright test -c e2e/playwright.config.ts e2e/referrals-visual.spec.ts`
 * Synthetic data only.
 */
const OUT = process.env.REFERRAL_SHOTS ?? '';
test.skip(!OUT, 'set REFERRAL_SHOTS to an output directory to capture the referral screenshots');

const LINE = {
  productId: 101, displayName: 'Alpine Extract 10ml', sku: 'ALP-10', unitPrice: 42.5, basePrice: 42.5, pricingTiers: [], quantity: 1,
  isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
};

const THEMES: Array<[string, string]> = [['bento', 'tech-light'], ['modern', ''], ['dark-luxury', '']];
const WIDTHS = [390, 1366] as const;
interface CatalogJson { templates: Array<{ id: string; presets: Array<{ id: string; scheme: 'dark' | 'light' }> }> }

for (const [template, wanted] of THEMES) {
  for (const width of WIDTHS) {
    test(`${template} · ${width}`, async ({ page }) => {
      const res = await page.request.get('/templates.json');
      const presets = ((await res.json()) as CatalogJson).templates.find((t) => t.id === template)?.presets ?? [];
      const preset = wanted || presets.find((p) => p.scheme === (template === 'dark-luxury' ? 'dark' : 'light'))?.id || presets[0]!.id;
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.clock.setFixedTime(FIXED_NOW);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const theme = await presetTheme(page, template, preset, { showSku: false });
      await installMocks(page, {
        layout: 'storefront',
        tweakSettings: (s) => { s.features.guestCheckout = true; theme(s); },
      });
      await page.addInitScript((line) => {
        window.localStorage.setItem('sf-cart-v1', JSON.stringify({ state: { lines: [line] }, version: 0 }));
      }, LINE);
      mkdirSync(OUT, { recursive: true });
      const name = `${template}-${preset}-${width}`;

      await page.goto('/checkout');
      const next = () => page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('textbox', { name: 'First name' }).fill('Ada');
      await page.getByRole('textbox', { name: 'Surname' }).fill('Sterling');
      await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.invalid');
      await next();
      await page.getByRole('textbox', { name: 'Address line 1' }).fill('14 Kirkgate');
      await page.getByRole('textbox', { name: 'Town / City' }).fill('Leeds');
      await page.getByRole('textbox', { name: 'Postcode' }).fill('LS1 6BY');
      await expect(page.getByRole('combobox', { name: 'Country' })).toHaveValue('GB');
      await next();
      await expect(page.getByText('Tracked 24')).toBeVisible();
      const referral = page.getByRole('textbox', { name: 'Referral code' });
      await expect(referral).toBeVisible();
      await referral.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: resolve(OUT, `${name}-checkout.png`), animations: 'disabled', caret: 'hide' });
      await referral.fill('TESTCODE1');
      await page.screenshot({ path: resolve(OUT, `${name}-checkout-filled.png`), animations: 'disabled', caret: 'hide' });
    });

    test(`${template} · ${width} · referrals page`, async ({ page }) => {
      const res = await page.request.get('/templates.json');
      const presets = ((await res.json()) as CatalogJson).templates.find((t) => t.id === template)?.presets ?? [];
      const preset = wanted || presets.find((p) => p.scheme === (template === 'dark-luxury' ? 'dark' : 'light'))?.id || presets[0]!.id;
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.clock.setFixedTime(FIXED_NOW);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const theme = await presetTheme(page, template, preset, { showSku: false });
      await installMocks(page, { layout: 'storefront', session: true, tweakSettings: theme });
      mkdirSync(OUT, { recursive: true });
      await page.goto('/account/referrals');
      await expect(page.getByText('Your referral link')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: resolve(OUT, `${template}-${preset}-${width}-referrals.png`), animations: 'disabled', caret: 'hide' });
    });
  }
}
