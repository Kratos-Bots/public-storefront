import { expect, test, type Page } from '@playwright/test';
import { installMocks, installTelegramStub, type Layout } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';

/**
 * The phone header: the menu button at its right end (core option `showHeaderMenu`) and the Account and Cart buttons
 * that give way to the bottom bar. Four combinations (bar on/off x menu on/off) at the two narrowest phones, in each
 * layout: nothing overflows, no two header controls overlap, and the menu opens, navigates and closes. Synthetic data only.
 */
interface Setup {
  width: number; height: number; layout: Layout; bar?: boolean; menu?: boolean; session?: boolean; telegram?: boolean; template?: [string, string];
}

async function setup(page: Page, o: Setup) {
  await page.setViewportSize({ width: o.width, height: o.height });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (o.telegram) {
    await installTelegramStub(page);
    await page.addInitScript(() => {
      const wa = (window as unknown as { Telegram: { WebApp: { safeAreaInset: Record<string, number>; contentSafeAreaInset: Record<string, number> } } }).Telegram.WebApp;
      wa.safeAreaInset.top = 47;
      wa.safeAreaInset.bottom = 34;
      wa.contentSafeAreaInset.top = 44;
    });
  }
  const options = { ...(o.bar === false ? { showMobileBottomNav: false } : {}), ...(o.menu === false ? { showHeaderMenu: false } : {}) };
  const theme = o.template ? await presetTheme(page, o.template[0], o.template[1], options) : null;
  return installMocks(page, {
    layout: o.layout,
    session: o.session ?? false,
    reviews: {},
    tweakSettings: (s) => {
      theme?.(s);
      if (!theme && Object.keys(options).length > 0) s.theme = { ...s.theme, options: { ...s.theme.options, ...options } };
    },
  });
}

const header = (page: Page) => page.locator('[data-sf-part="header"]');
const burger = (page: Page) => header(page).getByRole('button', { name: 'Open menu' });
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** Every visible control of the header, with its box. */
const controls = (page: Page) => page.evaluate(() => {
  const h = document.querySelector('[data-sf-part="header"]')!;
  return Array.from(h.querySelectorAll('a, button, input'))
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0)
    .map(({ el, r }) => ({ name: el.getAttribute('aria-label') ?? el.textContent ?? el.tagName, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }));
});

const LAYOUTS: Layout[] = ['storefront', 'menu', 'webapp'];
const SIZES = [[390, 844], [360, 640]] as const;
const COMBOS: Array<[boolean, boolean]> = [[true, true], [true, false], [false, true], [false, false]];

test.describe('the phone header, bar x menu', () => {
  for (const layout of LAYOUTS) {
    for (const [width, height] of SIZES) {
      for (const [bar, menu] of COMBOS) {
        test(`${layout} ${width}x${height}, bar ${bar ? 'on' : 'off'}, menu ${menu ? 'on' : 'off'}: no overflow, no overlap, the right controls`, async ({ page }) => {
          await setup(page, { layout, width, height, bar, menu });
          await page.goto('/');
          await expect(header(page)).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          expect(await noOverflow(page), 'no horizontal overflow').toBe(true);

          const all = await controls(page);
          for (const c of all) {
            expect(c.left, `${c.name} inside the viewport (left)`).toBeGreaterThanOrEqual(-0.5);
            expect(c.right, `${c.name} inside the viewport (right)`).toBeLessThanOrEqual(width + 0.5);
          }
          for (let i = 0; i < all.length; i++) {
            for (let j = i + 1; j < all.length; j++) {
              const a = all[i]!;
              const b = all[j]!;
              const apart = a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5;
              expect(apart, `${a.name} overlaps ${b.name}`).toBe(true);
            }
          }

          // Account and Cart: only where the bar is not there to carry them.
          const account = header(page).getByRole('link', { name: /Sign in/ });
          const cart = header(page).getByRole('link', { name: /^Cart,/ });
          if (bar) {
            await expect(account).toHaveCount(0);
            await expect(cart).toHaveCount(0);
          } else {
            await expect(account).toBeVisible();
            await expect(cart).toBeVisible();
          }
          // The menu button: a 44px target at the right end of the header, in the row's end position.
          if (menu) {
            const b = (await burger(page).boundingBox())!;
            expect(b.width).toBeGreaterThanOrEqual(44);
            expect(b.height).toBeGreaterThanOrEqual(44);
            const rightmost = Math.max(...all.map((c) => c.right));
            expect(Math.abs(b.x + b.width - rightmost), 'the button is the last control').toBeLessThanOrEqual(1);
            expect(width - (b.x + b.width), 'at the right edge, one gutter in').toBeLessThanOrEqual(20);
          } else {
            await expect(burger(page)).toHaveCount(0);
          }
          // The phone star: gone with the menu on, back (bar off only) with it off.
          const star = header(page).getByRole('link', { name: 'Reviews' });
          if (menu || bar) await expect(star).toBeHidden();
          else await expect(star).toBeVisible();
          // The header is as tall as ever.
          const h = (await header(page).boundingBox())!.height;
          expect(h).toBeLessThanOrEqual(layout === 'storefront' ? 57 : 53);
        });
      }
    }
  }

  for (const [layout, width, height] of [['menu', 390, 844], ['webapp', 390, 844], ['menu', 360, 640], ['webapp', 360, 640]] as const) {
    test(`${layout} at ${width}, bar off, menu on: the search shows its whole placeholder or goes icon-only, never a clipped word`, async ({ page }) => {
      await setup(page, { layout, width, height, bar: false, menu: true });
      await page.goto('/');
      const field = header(page).getByRole('textbox', { name: 'Search products' });
      await expect(field).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const need = await field.evaluate((el) => {
        const cs = getComputedStyle(el);
        const c = document.createElement('canvas').getContext('2d')!;
        c.font = `${cs.fontSize} ${cs.fontFamily}`;
        return c.measureText((el as HTMLInputElement).placeholder).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      });
      const box = (await field.boundingBox())!;
      const hidden = await field.evaluate((el) => getComputedStyle(el, '::placeholder').color === 'rgba(0, 0, 0, 0)');
      // At 390 the placeholder was readable in v0.32.0 and still is. At 360 the star made it icon-only; so does the menu.
      if (width >= 390) expect(hidden, 'placeholder shown at 390').toBe(false);
      if (!hidden) expect(box.width, 'search field wide enough for its placeholder').toBeGreaterThanOrEqual(need + 4);
    });
  }
});

// The bar never shows on /checkout, so the header keeps Account and Cart beside the burger there even with the bar option on.
for (const layout of ['menu', 'webapp', 'storefront'] as const) {
  test(`${layout} at 360, /checkout with the bar option on: no overlapping hit boxes, no horizontal overflow`, async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sf-cart-v1', JSON.stringify({ state: { lines: [{
      productId: 101, displayName: 'Alpine Extract 10ml', sku: 'ALP-10', unitPrice: 42.5, basePrice: 42.5, pricingTiers: [], quantity: 2,
      isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
    }] }, version: 0 })));
    await setup(page, { layout, width: 360, height: 640, bar: true, menu: true, session: true });
    await page.goto('/checkout');
    await expect(header(page)).toBeVisible();
    await expect(burger(page)).toBeVisible();
    await expect(page.locator('[data-sf-part="bottom-nav"]')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    expect(await noOverflow(page), 'no horizontal overflow').toBe(true);
    const all = await controls(page);
    expect(all.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]!;
        const b = all[j]!;
        const apart = a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5;
        expect(apart, `${a.name} overlaps ${b.name}`).toBe(true);
      }
    }
  });
}

test.describe('the menu panel', () => {
  for (const layout of LAYOUTS) {
    test(`${layout} 390x844: opens, lists the pages, navigates and closes`, async ({ page }) => {
      await setup(page, { layout, width: 390, height: 844, session: true });
      await page.goto('/');
      await expect(burger(page)).toBeVisible();
      await burger(page).click();
      const dialog = page.getByRole('dialog', { name: 'Menu' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('link')).toHaveText(['Catalog', 'Reviews', 'Help', 'Your account']);
      await expect(dialog.locator('[aria-current="page"]')).toHaveText('Catalog');
      // It lies against the right edge, sits above the bottom bar, and the page behind it does not scroll.
      const box = (await dialog.boundingBox())!;
      expect(Math.round(box.x + box.width)).toBe(390);
      expect(box.width).toBeLessThanOrEqual(0.86 * 390 + 1);
      const covers = await page.evaluate(() => {
        const nav = document.querySelector('[data-sf-part="bottom-nav"]')!.getBoundingClientRect();
        const at = document.elementFromPoint(390 - 20, nav.top + nav.height / 2);
        return !!at?.closest('[data-sf-part="menu-panel"]');
      });
      expect(covers, 'the panel is above the bottom bar').toBe(true);
      expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
      for (const link of await dialog.getByRole('link').all()) {
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await dialog.getByRole('link', { name: 'Help' }).click();
      await expect(page).toHaveURL(/\/help$/);
      await expect(dialog).toBeHidden();
      await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
      expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
    });
  }

  test('Escape closes it and the button has focus again; the scrim closes it too', async ({ page }) => {
    await setup(page, { layout: 'storefront', width: 390, height: 844 });
    await page.goto('/');
    await burger(page).click();
    const dialog = page.getByRole('dialog', { name: 'Menu' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('a, button').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(burger(page)).toBeFocused();
    await burger(page).click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(30, 400);
    await expect(dialog).toBeHidden();
  });

  test('a signed-out visitor sees Sign in, which goes to the sign-in page', async ({ page }) => {
    await setup(page, { layout: 'menu', width: 390, height: 844 });
    await page.goto('/');
    await burger(page).click();
    await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('inside Telegram the panel clears the notch and the home indicator, and still sits above the bar', async ({ page }) => {
    await setup(page, { layout: 'webapp', width: 390, height: 844, telegram: true, session: true });
    await page.goto('/');
    await burger(page).click();
    const dialog = page.getByRole('dialog', { name: 'Menu' });
    await expect(dialog).toBeVisible();
    const pad = await dialog.evaluate((el) => { const cs = getComputedStyle(el); return { top: parseFloat(cs.paddingTop), bottom: parseFloat(cs.paddingBottom) }; });
    expect(pad.top).toBe(47 + 44);
    expect(pad.bottom).toBe(34);
    const firstRow = (await dialog.getByRole('button', { name: 'Close menu' }).boundingBox())!;
    expect(firstRow.y).toBeGreaterThanOrEqual(47 + 44);
    const lastLink = (await dialog.getByRole('link').last().boundingBox())!;
    expect(lastLink.y + lastLink.height).toBeLessThanOrEqual(844 - 34);
  });
});

test.describe('1280 wide', () => {
  for (const layout of LAYOUTS) {
    test(`${layout}: no menu button, and the header still carries Account, Cart and the Reviews link`, async ({ page }) => {
      await setup(page, { layout, width: 1280, height: 900 });
      await page.goto('/');
      await expect(header(page)).toBeVisible();
      await expect(page.locator('[data-sf-part="header-menu"]')).toHaveCount(0);
      await expect(header(page).getByRole('link', { name: /Sign in/ })).toBeVisible();
      await expect(header(page).getByRole('link', { name: /^Cart,/ })).toBeVisible();
      await expect(header(page).getByRole('link', { name: 'Reviews' })).toBeVisible();
      await expect(page.locator('[data-sf-part="bottom-nav"]')).toHaveCount(0);
    });
  }

  test('resizing from a phone to a desktop takes the menu button away', async ({ page }) => {
    await setup(page, { layout: 'storefront', width: 390, height: 844 });
    await page.goto('/');
    await expect(burger(page)).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(burger(page)).toHaveCount(0);
  });
});

test.describe('templates', () => {
  const TEMPLATES: Array<[string, string]> = [['modern', 'default'], ['bento', 'tech-light'], ['cyber-brutalism', 'acid-dark'], ['dark-luxury', 'gold']];
  for (const template of TEMPLATES) {
    for (const bar of [true, false]) {
      test(`${template.join('/')}, bar ${bar ? 'on' : 'off'}: the menu opens, nothing overflows`, async ({ page }) => {
        await setup(page, { layout: 'storefront', width: 390, height: 844, template, bar });
        await page.goto('/');
        await burger(page).click();
        await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
        expect(await noOverflow(page)).toBe(true);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'Menu' })).toBeHidden();
      });
    }
  }
});
