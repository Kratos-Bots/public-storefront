import { expect, test, type Page } from '@playwright/test';
import { installMocks, type InstallMocksOptions, type Layout } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';
import type { PublicReview, ReviewableOrder } from '../web/src/types/reviews.ts';

/**
 * Screenshots of the review surfaces for a visual review: the form and a sent review on the order page, the reminder in
 * the storefront and web app layouts, and the reviews page (with reviews and empty), per template and width. Not an
 * assertion suite, so it only runs when asked:
 * `REVIEWS_SHOTS=1 REVIEWS_SHOTS_DIR=<dir> TZ=UTC npx playwright test -c e2e/playwright.config.ts e2e/reviews-visual.spec.ts`
 * Synthetic data only.
 */

test.skip(process.env.REVIEWS_SHOTS !== '1', 'set REVIEWS_SHOTS=1 to capture the review screenshots');

const SHOTS = (process.env.REVIEWS_SHOTS_DIR ?? 'e2e/screenshots/reviews').replace(/\\/g, '/').replace(/\/?$/, '/');
const REF = 'K4M2QP';

const TEMPLATES = [
  { template: 'modern', preset: 'default' },
  { template: 'bento', preset: 'tech-dark' },
  { template: 'cyber-brutalism', preset: 'acid-dark' },
  { template: 'dark-luxury', preset: 'gold' },
] as const;
const WIDTHS = [390, 1280] as const;

const reviewable: ReviewableOrder = {
  reference: REF,
  eligibleSince: new Date(FIXED_NOW.getTime() - 2 * 24 * 3_600_000).toISOString(),
  remindUntil: new Date(FIXED_NOW.getTime() + 5 * 24 * 3_600_000).toISOString(),
};
const COMMENTS = [
  'Arrived in two days, well packed and exactly as described.',
  null,
  'Good. The box was a little dented but everything inside was fine, and the dispatch email came the same afternoon.',
  'Quick delivery.',
  'Packaging was excellent and the tracking was accurate to the hour. Will order again.',
  null,
  'Fine.',
  'Smaller than I pictured but a good price, and support answered my question within minutes.',
];
const LIST: PublicReview[] = COMMENTS.map((comment, i) => ({
  id: 100 - i, rating: [5, 4, 5, 3, 5, 4, 2, 5][i]!, comment, createdAt: `2026-08-${String(20 - i).padStart(2, '0')}T09:00:00.000Z`,
}));

async function noOverflow(page: Page): Promise<void> {
  const o = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(o.scroll, 'horizontal overflow').toBeLessThanOrEqual(o.inner);
}

async function setup(page: Page, template: string, preset: string, width: number, layout: Layout, reviews: NonNullable<InstallMocksOptions['reviews']>, session = true) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const tweakSettings = await presetTheme(page, template, preset);
  return installMocks(page, { layout, session, tweakSettings, reviews });
}

const shot = (page: Page, name: string, fullPage = true) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage, animations: 'disabled', caret: 'hide' });

for (const t of TEMPLATES) {
  test.describe(`review shots · ${t.template}`, () => {
    for (const width of WIDTHS) {
      test(`order form ${width}`, async ({ page }) => {
        await setup(page, t.template, t.preset, width, 'storefront', {});
        await page.goto(`/account/orders/${REF}`);
        await page.getByLabel('4 stars').check();
        await page.getByLabel(/Your comments/).fill('Well packed, arrived quickly.');
        await page.evaluate(() => document.fonts.ready);
        await noOverflow(page);
        await shot(page, `${t.template}-form-${width}`);
      });

      test(`sent review ${width}`, async ({ page }) => {
        await setup(page, t.template, t.preset, width, 'storefront', { existing: { rating: 4, comment: 'Well packed, arrived quickly.', status: 'pending', createdAt: '2026-08-23T10:00:00.000Z' } });
        await page.goto(`/account/orders/${REF}`);
        await expect(page.getByRole('heading', { name: 'Your review' })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await noOverflow(page);
        await shot(page, `${t.template}-sent-${width}`);
      });

      test(`reminder ${width}`, async ({ page }) => {
        await setup(page, t.template, t.preset, width, 'storefront', { reviewable: [reviewable] });
        await page.goto('/');
        await expect(page.getByRole('dialog', { name: 'How was your order?' })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await shot(page, `${t.template}-reminder-${width}`, false);
      });

      test(`reviews page ${width}`, async ({ page }) => {
        await setup(page, t.template, t.preset, width, 'storefront', { list: LIST }, false);
        await page.goto('/reviews');
        await expect(page.getByText(COMMENTS[0]!)).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await noOverflow(page);
        await shot(page, `${t.template}-reviews-${width}`);
      });
    }

    test('reviews page empty 390', async ({ page }) => {
      await setup(page, t.template, t.preset, 390, 'storefront', { list: [] }, false);
      await page.goto('/reviews');
      await expect(page.getByText('No reviews yet')).toBeVisible();
      await shot(page, `${t.template}-reviews-empty-390`);
    });

    for (const layout of ['menu', 'webapp'] as const) {
      test(`reviews in the bottom bar, ${layout} 390`, async ({ page }) => {
        await setup(page, t.template, t.preset, 390, layout, { list: LIST }, false);
        await page.goto('/');
        const link = page.locator('[data-sf-part="bottom-nav"]').getByRole('link', { name: 'Reviews' });
        await expect(link).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await shot(page, `${t.template}-link-${layout}-390`, false);
      });
    }

    test('reminder in the web app layout 390', async ({ page }) => {
      await setup(page, t.template, t.preset, 390, 'webapp', { reviewable: [reviewable] });
      await page.goto('/');
      await expect(page.getByRole('dialog', { name: 'How was your order?' })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await shot(page, `${t.template}-reminder-webapp-390`, false);
    });
  });
}
