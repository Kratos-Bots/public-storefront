import { expect, test, type Page } from '@playwright/test';
import { installMocks, type MockText } from './mocks.ts';
import { FIXED_NOW, onlyVisible } from './flows.ts';
import { languageHeaderSet } from './page-sets.ts';

/**
 * Storefront languages (spec 2026-10-21): built-in fr/it/es packs, the offered-languages read, the phone menu's Language
 * group, the HeaderLanguage part and the `?lang=` / `sf.lang` preference. Synthetic data only.
 */
const PRODUCT = 'Alpine Extract 10ml';
const OFFERED: MockText = { languages: ['en', 'fr', 'it', 'es'] };

async function boot(page: Page, text?: MockText, extra: Parameters<typeof installMocks>[1] = {}) {
  await page.clock.setFixedTime(FIXED_NOW);
  // Browser language must not leak into the tests: pin it to English.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US'] });
    Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
  });
  return installMocks(page, { layout: 'storefront', session: true, text, ...extra });
}

/** Open the product and add it, in whatever language the page is in (the shared flow helpers are English-only). */
async function cartPage(page: Page, mocks: Awaited<ReturnType<typeof boot>>, add: RegExp, path = '/') {
  await page.goto(path);
  await page.getByRole('link', { name: PRODUCT, exact: true }).click();
  await expect(page.getByRole('heading', { name: PRODUCT, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: add }).first().click();
  await expect.poll(() => mocks.state.cart.itemCount).toBe(1);
}

test.describe('storefront languages', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('(a) a French store with no overrides shows the built-in French and <html lang="fr">', async ({ page }) => {
    const mocks = await boot(page, { locale: 'fr' });
    await cartPage(page, mocks, /^Ajouter · /);
    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'Votre panier' })).toBeVisible();
    await expect(onlyVisible(page.getByText(/^Sous-total/))).toBeVisible();
    await expect(page.getByText(/^Subtotal/)).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });

  test('(b) the phone menu lists the languages by native name; picking Français reloads in French', async ({ page }) => {
    await boot(page, OFFERED);
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    const group = page.locator('[data-sf-menu="language"]');
    await expect(group.getByRole('heading', { name: 'Language' })).toBeVisible();
    for (const name of ['English', 'Français', 'Italiano', 'Español']) await expect(group.getByRole('button', { name })).toBeVisible();
    await expect(group.getByRole('button', { name: 'English' })).toHaveAttribute('aria-current', 'true');
    await group.getByRole('button', { name: 'Français' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    expect(await page.evaluate(() => localStorage.getItem('sf.lang'))).toBe('fr');
    await expect(page.getByRole('button', { name: 'Ouvrir le menu' })).toBeVisible();
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
    await expect(page.locator('[data-sf-menu="language"]').getByRole('heading', { name: 'Langue' })).toBeVisible();
    await expect(page.locator('[data-sf-menu="language"]').getByRole('button', { name: 'Français' })).toHaveAttribute('aria-current', 'true');
    // The choice survives a plain reload.
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });

  test('(c) ?lang=es serves Spanish', async ({ page }) => {
    const mocks = await boot(page, OFFERED);
    await cartPage(page, mocks, /^Añadir · /, '/?lang=es');
    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'Tu carrito' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });

  test('(d) an English store with no text is unchanged English', async ({ page }) => {
    const mocks = await boot(page);
    await cartPage(page, mocks, /^Add · /);
    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
    await expect(onlyVisible(page.getByText(/^Subtotal/))).toBeVisible();
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.locator('[data-sf-menu="language"]')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('a store offering one language shows no switcher', async ({ page }) => {
    await boot(page, { languages: ['en'] });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.locator('[data-sf-menu="language"]')).toHaveCount(0);
  });
});

test.describe('the HeaderLanguage part (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a compact button opens the language menu and switches the page', async ({ page }) => {
    await boot(page, OFFERED, { pages: { storefront: languageHeaderSet('storefront') } });
    await page.goto('/');
    const btn = page.locator('[data-sf-part="header"]').getByRole('button', { name: /Change language/ });
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('EN');
    await btn.click();
    await page.getByRole('menuitem', { name: 'Italiano' }).or(page.getByRole('button', { name: 'Italiano' })).first().click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
    await expect(page.locator('[data-sf-part="header"]').getByRole('button', { name: /Cambia lingua/ })).toContainText('IT');
  });
});

test.describe('the automatic desktop language switcher', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  const switchers = (page: Page) => page.locator('[data-sf-part="header"]').getByRole('button', { name: /Change language/ });

  test('the default header carries one when the shop offers several languages, and it switches the page', async ({ page }) => {
    await boot(page, OFFERED);
    await page.goto('/');
    const btn = switchers(page);
    await expect(btn).toHaveCount(1);
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('EN');
    // Ahead of Cart in the actions group.
    const order = await page.locator('[data-sf-part="header"]').evaluate((h) => {
      const all = [...h.querySelectorAll('button, a')];
      const at = (m: RegExp) => all.findIndex((e) => m.test(e.getAttribute('aria-label') ?? ''));
      return { lang: at(/Change language/), cart: at(/cart/i) };
    });
    expect(order.lang).toBeGreaterThan(-1);
    expect(order.lang).toBeLessThan(order.cart);
    await btn.click();
    await page.getByRole('menuitem', { name: 'Italiano' }).or(page.getByRole('button', { name: 'Italiano' })).first().click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
    await expect(page.locator('[data-sf-part="header"]').getByRole('button', { name: /Cambia lingua/ })).toContainText('IT');
  });

  test('a placed HeaderLanguage part is the only switcher', async ({ page }) => {
    await boot(page, OFFERED, { pages: { storefront: languageHeaderSet('storefront') } });
    await page.goto('/');
    await expect(switchers(page)).toHaveCount(1);
    await expect(switchers(page)).toBeVisible();
  });

  test('a store offering one language has none', async ({ page }) => {
    await boot(page, { languages: ['en'] });
    await page.goto('/');
    await expect(page.locator('[data-sf-part="header"]')).toBeVisible();
    await expect(switchers(page)).toHaveCount(0);
  });

  test('on a phone it is hidden while the header menu is on, shown when the menu is off', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, OFFERED);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
    await expect(switchers(page)).toBeHidden();

    const off = await page.context().newPage();
    await boot(off, OFFERED, { tweakSettings: (s) => { s.theme = { ...s.theme, options: { ...s.theme.options, showHeaderMenu: false } }; } });
    await off.setViewportSize({ width: 390, height: 844 });
    await off.goto('/');
    await expect(switchers(off)).toBeVisible();
  });
});
