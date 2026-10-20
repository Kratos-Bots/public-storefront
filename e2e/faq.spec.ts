import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { FaqSection } from '../web/src/types/faq.ts';
import { installMocks, installTelegramStub, type InstallMocksOptions, type Layout } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';

/**
 * The shop's FAQ as a section of the Help page (/help, which /faq redirects to), and Help's place in the header menu and
 * the phone bottom bar. Synthetic data only. With FAQ_SHOTS=<dir> the visual tests save screenshots there.
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
  test('390x844: one Help item whatever the FAQ, and the burger menu has it once', async ({ page }) => {
    await setup(page);
    await page.goto('/');
    await expect(bar(page)).toBeVisible();
    expect(await barLabels(page)).toEqual(['Catalog', 'Profile', 'Cart', 'Reviews', 'Help']);
    await page.getByRole('button', { name: 'Open menu' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('link')).toHaveText(['Catalog', 'Reviews', 'Help', 'Sign in']);
    await dialog.getByRole('link', { name: 'Help' }).click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Common questions' })).toBeVisible();
    await expect(bar(page).locator('[aria-current="page"]')).toHaveText('Help');
  });

  test('390x844: with no FAQ the bar and the burger still show Help', async ({ page }) => {
    await setup(page, { faq: { available: false } });
    await page.goto('/');
    await expect(bar(page)).toBeVisible();
    expect(await barLabels(page)).toEqual(['Catalog', 'Profile', 'Cart', 'Reviews', 'Help']);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('dialog').getByRole('link')).toHaveText(['Catalog', 'Reviews', 'Help', 'Sign in']);
  });

  test('390x844: an older backend (no faq key) behaves like a shop with no FAQ', async ({ page }) => {
    await setup(page, { faq: { older: true } });
    await page.goto('/');
    await expect(bar(page)).toBeVisible();
    expect(await barLabels(page)).toEqual(['Catalog', 'Profile', 'Cart', 'Reviews', 'Help']);
    await page.goto('/help');
    await expect(page.getByText(/coming soon/i)).toBeVisible();
    await expect(page.getByText('Common questions')).toHaveCount(0);
  });
});

test.describe('the old links', () => {
  test('/faq lands on the FAQ section of /help', async ({ page }) => {
    await setup(page);
    await page.goto('/faq');
    await expect(page).toHaveURL(/\/help#faq$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Common questions' })).toBeVisible();
    await expect(bar(page).locator('[aria-current="page"]')).toHaveText('Help');
  });

  test('/support lands on /help', async ({ page }) => {
    await setup(page);
    await page.goto('/support');
    await expect(page).toHaveURL(/\/help$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
  });
});

test.describe('the FAQ section', () => {
  test('lists the sections, the first open, one open at a time', async ({ page }) => {
    await setup(page);
    await page.goto('/support');
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
    await page.goto('/help');
    const triggers = page.locator('[data-sf-part="faq-list"] button[aria-expanded]');
    await triggers.nth(0).focus();
    await page.keyboard.press('ArrowDown');
    await expect(triggers.nth(1)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(triggers.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Enter');
    await expect(triggers.nth(1)).toHaveAttribute('aria-expanded', 'false');
  });

  test('a shop with no FAQ and no support shows the shell copy', async ({ page }) => {
    await setup(page, { faq: { available: false } });
    await page.goto('/help');
    await expect(page.getByText(/coming soon/i)).toBeVisible();
    await expect(page.getByText('Common questions')).toHaveCount(0);
  });

  test('a failing FAQ hides the section quietly: no error, no Try again', async ({ page }) => {
    await setup(page, { faq: { status: 500, message: 'The FAQ is down' } });
    await page.goto('/help');
    await expect(page.getByText(/coming soon/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('The FAQ is down')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  });

  for (const width of [360, 390]) {
    test(`${width}px: no horizontal overflow, even with a long unbroken word`, async ({ page }) => {
      await setup(page, {
        width,
        faq: { sections: [{ id: 'ordering', title: 'Ordering Process', body: `Here is a very long link: https://example.com/${'a'.repeat(120)} and ${'b'.repeat(120)}` }, { id: 'xlong00001', title: 'A'.repeat(90), body: 'Short.' }] },
      });
      await page.goto('/help');
      await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
      await expect(page.locator('[data-sf-part="faq-list"]')).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.locator('[data-sf-part="faq-list"] button[aria-expanded]').nth(1).click();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('a warehouse with its own FAQ', () => {
  const OWN_EU: FaqSection[] = [
    { id: 'xeu000001', title: 'Dispatch from the EU hub', body: 'Parcels from Test EU leave on Tuesdays and Fridays.' },
    { id: 'xeu000002', title: 'Duties and VAT', body: 'Prices at Test EU include VAT.' },
  ];
  const WAREHOUSES = (rows: { eu?: { available: boolean } | null; overseas?: { available: boolean } | null }): NonNullable<InstallMocksOptions['warehouses']> => ({
    list: [
      { id: 1, name: 'Main', country: 'GB', isDefault: true },
      { id: 2, name: 'Test EU', country: 'DE', isDefault: false, ...(rows.eu === undefined ? {} : { faq: rows.eu }) },
      { id: 3, name: 'Test Overseas', country: null, isDefault: false, ...(rows.overseas === undefined ? {} : { faq: rows.overseas }) },
    ],
    carries: { 2: [102, 104], 3: [101] },
    faqs: { 2: OWN_EU },
  });
  const picker = (page: Page) => page.getByLabel('Shipping from');
  const faqUrls = (urls: string[]) => urls.filter((u) => /^GET storefront\/faq(\?|$)/.test(u));
  const openFaq = async (page: Page) => {
    await bar(page).getByRole('link', { name: 'Help' }).click();
    await expect(page).toHaveURL(/\/help$/);
  };
  const titles = (page: Page) => page.locator('[data-sf-part="faq-list"] button[aria-expanded]');

  test('picking it shows its sections on /help, and picking the default shows the shop\'s again', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    const mocks = await installMocks(page, { layout: 'storefront', session: false, reviews: {}, warehouses: WAREHOUSES({ eu: { available: true } }) });
    await page.goto('/');
    await expect(picker(page)).toHaveValue('1');
    await picker(page).selectOption({ label: 'Test EU · DE' });
    await openFaq(page);
    await expect(titles(page)).toHaveText(['Dispatch from the EU hub', 'Duties and VAT']);
    await expect(page.getByText('Parcels from Test EU leave on Tuesdays and Fridays.')).toBeVisible();
    expect(faqUrls(mocks.state.urls)).toEqual(['GET storefront/faq?warehouse=2']);

    await bar(page).getByRole('link', { name: 'Catalog' }).click();
    await picker(page).selectOption({ label: 'Main · GB' });
    await openFaq(page);
    await expect(titles(page)).toHaveText(['Ordering Process', 'Shipping Info', 'Payment']);
    expect(faqUrls(mocks.state.urls)).toEqual(['GET storefront/faq?warehouse=2', 'GET storefront/faq']);
  });

  test('it adds its own FAQ to Help even when the shop has none, with the same bar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    await installMocks(page, { layout: 'storefront', session: false, reviews: {}, faq: { available: false }, warehouses: WAREHOUSES({ eu: { available: true } }) });
    await page.goto('/');
    await expect(bar(page)).toBeVisible();
    expect(await barLabels(page)).toEqual(['Catalog', 'Profile', 'Cart', 'Reviews', 'Help']);
    await picker(page).selectOption({ label: 'Test EU · DE' });
    expect(await barLabels(page)).toEqual(['Catalog', 'Profile', 'Cart', 'Reviews', 'Help']);
    await openFaq(page);
    await expect(titles(page)).toHaveText(['Dispatch from the EU hub', 'Duties and VAT']);
  });

  test('one whose own FAQ is unavailable leaves Help without the section', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    await installMocks(page, { layout: 'storefront', session: false, reviews: {}, warehouses: WAREHOUSES({ overseas: { available: false } }) });
    await page.goto('/');
    await expect(bar(page)).toBeVisible();
    await picker(page).selectOption({ label: 'Test Overseas' });
    expect(await barLabels(page)).toEqual(['Catalog', 'Profile', 'Cart', 'Reviews', 'Help']);
    await openFaq(page);
    await expect(page.getByText(/coming soon/i)).toBeVisible();
    await expect(page.locator('[data-sf-part="faq-list"]')).toHaveCount(0);
  });

  test('with the picker off, the FAQ is asked for without any warehouse parameter', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    // A stale stored choice must do nothing while the feature is off.
    await page.addInitScript(() => window.localStorage.setItem('sf-warehouse-v1', JSON.stringify({ state: { warehouseId: 2 }, version: 0 })));
    const mocks = await installMocks(page, { layout: 'storefront', session: false, reviews: {} });
    await page.goto('/help');
    await expect(titles(page)).toHaveText(['Ordering Process', 'Shipping Info', 'Payment']);
    expect(faqUrls(mocks.state.urls)).toEqual(['GET storefront/faq']);
    expect(mocks.state.urls.filter((u) => /warehouse/.test(u))).toEqual([]);
  });
});

test.describe('in every template', () => {
  for (const [template, preset] of THEMES) {
    for (const width of [390, 1280]) {
      test(`${template} at ${width}px`, async ({ page }) => {
        await setup(page, { width, template: [template, preset] });
        await page.goto('/help');
        await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
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
    await expect(page.getByRole('dialog').getByRole('link', { name: 'Help' })).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(SHOTS!, 'burger-open-390.png'), animations: 'disabled', caret: 'hide' });
  });
});

test.describe('inside Telegram', () => {
  test('/help claims no primary action: no bottom Back, the header arrow alone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    await installTelegramStub(page, '8.0');
    await installMocks(page, { layout: 'storefront' });
    await page.goto('/help');
    await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
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
