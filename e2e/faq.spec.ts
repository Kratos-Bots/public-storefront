import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { installMocks, installTelegramStub, type InstallMocksOptions, type Layout } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';

/**
 * The shop's FAQ: its page at /faq, its place in the header menu and its slot in the phone bottom bar (where it takes
 * Support's place while the shop has one). Synthetic data only. With FAQ_SHOTS=<dir> the visual tests save screenshots there.
 */
const SHOTS = process.env.FAQ_SHOTS;
const THEMES: Array<[string, string]> = [['modern', 'default'], ['bento', 'tech-light'], ['cyber-brutalism', 'acid-dark'], ['dark-luxury', 'gold']];

async function setup(page: Page, o: { width?: number; faq?: InstallMocksOptions['faq']; layout?: Layout; template?: [string, string]; session?: boolean } = {}) {
  await page.setViewportSize({ width: o.width ?? 390, height: 844 });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const theme = o.template ? await presetTheme(page, o.template[0], o.template[1]) : null;
  return installMocks(page, { layout: o.layout ?? 'storefront', session: o.session ?? false, faq: o.faq, reviews: {}, tweakSettings: (s) => theme?.(s) });
}

const bar = (page: Page) => page.locator('[data-sf-part="bottom-nav"]');
const barLabels = (page: Page) => bar(page).getByRole('link').allTextContents();
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('the phone bottom bar', () => {
  test('390x844: FAQ takes Support\'s place, and the burger menu has both', async ({ page }) => {
    await setup(page);
    await page.goto('/');
    await expect(bar(page)).toBeVisible();
    expect(await barLabels(page)).toEqual(['Catalog', 'Profile', 'Cart', 'Reviews', 'FAQ']);
    await expect(bar(page).getByRole('link', { name: 'Support' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Open menu' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('link')).toHaveText(['Catalog', 'Reviews', 'FAQ', 'Support', 'Sign in']);
    await dialog.getByRole('link', { name: 'FAQ' }).click();
    await expect(page).toHaveURL(/\/faq$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Frequently asked questions' })).toBeVisible();
    await expect(bar(page).locator('[aria-current="page"]')).toHaveText('FAQ');
  });

  test('390x844: with no FAQ the bar shows Support and the burger has no FAQ', async ({ page }) => {
    await setup(page, { faq: { available: false } });
    await page.goto('/');
    await expect(bar(page)).toBeVisible();
    expect(await barLabels(page)).toEqual(['Catalog', 'Profile', 'Cart', 'Reviews', 'Support']);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('dialog').getByRole('link')).toHaveText(['Catalog', 'Reviews', 'Support', 'Sign in']);
  });

  test('390x844: an older backend (no faq key) behaves like a shop with no FAQ', async ({ page }) => {
    await setup(page, { faq: { older: true } });
    await page.goto('/');
    await expect(bar(page)).toBeVisible();
    expect(await barLabels(page)).toEqual(['Catalog', 'Profile', 'Cart', 'Reviews', 'Support']);
    await page.goto('/faq');
    await expect(page.getByText('No questions yet')).toBeVisible();
  });
});

test.describe('the page', () => {
  test('lists the sections, the first open, one open at a time', async ({ page }) => {
    await setup(page);
    await page.goto('/faq');
    const triggers = page.locator('[data-sf-part="faq-list"] button[aria-expanded]');
    await expect(triggers).toHaveText(['Ordering Process', 'Shipping Info', 'Payment']);
    await expect(triggers.nth(0)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Add what you want to your cart')).toBeVisible();
    await triggers.nth(1).click();
    await expect(triggers.nth(0)).toHaveAttribute('aria-expanded', 'false');
    await expect(triggers.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Add what you want to your cart')).toBeHidden();
    const link = page.getByRole('link', { name: 'https://example.com/track' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await triggers.nth(1).click();
    await expect(triggers.nth(1)).toHaveAttribute('aria-expanded', 'false');
  });

  test('works from the keyboard: Tab to a question, Space opens it, Down moves to the next', async ({ page }) => {
    await setup(page);
    await page.goto('/faq');
    const triggers = page.locator('[data-sf-part="faq-list"] button[aria-expanded]');
    await triggers.nth(0).focus();
    await page.keyboard.press('ArrowDown');
    await expect(triggers.nth(1)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(triggers.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Enter');
    await expect(triggers.nth(1)).toHaveAttribute('aria-expanded', 'false');
  });

  test('shows the empty state for a shop with no FAQ', async ({ page }) => {
    await setup(page, { faq: { available: false } });
    await page.goto('/faq');
    await expect(page.getByRole('heading', { level: 1, name: 'No questions yet' })).toBeVisible();
  });

  test('shows an error with a Try again button', async ({ page }) => {
    await setup(page, { faq: { status: 500, message: 'The FAQ is down' } });
    await page.goto('/faq');
    await expect(page.getByText('The FAQ is down')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  for (const width of [360, 390]) {
    test(`${width}px: no horizontal overflow, even with a long unbroken word`, async ({ page }) => {
      await setup(page, {
        width,
        faq: { sections: [{ id: 'ordering', title: 'Ordering Process', body: `Here is a very long link: https://example.com/${'a'.repeat(120)} and ${'b'.repeat(120)}` }, { id: 'xlong00001', title: 'A'.repeat(90), body: 'Short.' }] },
      });
      await page.goto('/faq');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.locator('[data-sf-part="faq-list"] button[aria-expanded]').nth(1).click();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('in every template', () => {
  for (const [template, preset] of THEMES) {
    for (const width of [390, 1280]) {
      test(`${template} at ${width}px`, async ({ page }) => {
        await setup(page, { width, template: [template, preset] });
        await page.goto('/faq');
        await expect(page.getByRole('heading', { level: 1, name: 'Frequently asked questions' })).toBeVisible();
        await expect(page.locator('[data-sf-part="faq-list"] button[aria-expanded]')).toHaveCount(3);
        await page.evaluate(() => document.fonts.ready);
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        if (SHOTS) {
          mkdirSync(SHOTS, { recursive: true });
          await page.screenshot({ path: resolve(SHOTS, `faq-${template}-${width}.png`), animations: 'disabled', caret: 'hide' });
          if (width === 390) {
            await page.locator('[data-sf-part="faq-list"] button[aria-expanded]').nth(1).click();
            await page.screenshot({ path: resolve(SHOTS, `faq-${template}-${width}-second-open.png`), animations: 'disabled', caret: 'hide' });
          }
        }
      });
    }
  }

  test('screenshots: the bottom bar and the open burger menu at 390px', async ({ page }) => {
    test.skip(!SHOTS, 'screenshots only with FAQ_SHOTS');
    mkdirSync(SHOTS!, { recursive: true });
    await setup(page, { template: ['cyber-brutalism', 'acid-dark'] });
    await page.goto('/');
    await expect(bar(page)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(SHOTS!, 'bottom-bar-390.png'), animations: 'disabled', caret: 'hide' });
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('dialog').getByRole('link', { name: 'FAQ' })).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(SHOTS!, 'burger-open-390.png'), animations: 'disabled', caret: 'hide' });
  });
});

test.describe('inside Telegram', () => {
  test('/faq claims no primary action: no bottom Back, the header arrow alone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    await installTelegramStub(page, '8.0');
    await installMocks(page, { layout: 'storefront' });
    await page.goto('/faq');
    await expect(page.getByRole('heading', { level: 1, name: 'Frequently asked questions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
    type Tg = { main: { isVisible: boolean }; secondary: { isVisible: boolean }; back: { isVisible: boolean }; secondaryHandlerCount(): number; backHandlerCount(): number };
    const tg = () => page.evaluate(() => {
      const g = (window as unknown as { __tg: Tg }).__tg;
      return { main: g.main.isVisible, secondary: g.secondary.isVisible, back: g.back.isVisible, secondaryHandlers: g.secondaryHandlerCount(), backHandlers: g.backHandlerCount() };
    });
    await expect.poll(async () => (await tg()).back).toBe(true);
    expect(await tg()).toMatchObject({ main: false, secondary: false, secondaryHandlers: 0, backHandlers: 1 });
  });
});
