import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { installMocks, type Layout, type MockHandle } from './mocks.ts';
import { addFirstToCart, FIXED_NOW, fillCheckout, onlyVisible, openCart, openProduct, productOpener } from './flows.ts';
import { presetTheme } from './template-theme.ts';
import { checkoutWithoutFlowSet, doubledShellSet, everyBlockSet, layoutLabSet, LONG_LABEL, storySet } from './page-sets.ts';

/** Same cases as templates.spec.ts (a spec may not import another spec). Guarded below. */
const CASES: Array<[string, string]> = [
  ['modern', 'default'], ['dark-luxury', 'gold'], ['cyber-brutalism', 'acid-dark'],
  ['cyber-brutalism', 'purple-light'], ['bento', 'tech-dark'], ['bento', 'fashion-light'],
];
const LAYOUTS = ['storefront', 'menu', 'webapp'] as const satisfies readonly Layout[];
const SHOTS = fileURLToPath(new URL('./screenshots/builder/', import.meta.url));

async function noOverflow(page: Page, where: string) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(o.sw, `horizontal overflow on ${where}`).toBeLessThanOrEqual(o.w);
}

/** Block-owned tap targets under 44×44 (inline prose links and the existing product cards excluded). */
async function smallBlockTargets(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-sf-block] a, [data-sf-block] button, [data-sf-block] summary')]
      .filter((el) => {
        if (el.closest('[data-sf-prose]') || el.closest('[data-sf-part="product-card"]')) return false;
        const cs = getComputedStyle(el);
        const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
        if (!visible || cs.pointerEvents === 'none') return false;
        const r = el.getBoundingClientRect();
        return r.width < 44 || r.height < 44;
      })
      .map((el) => el.outerHTML.slice(0, 100)),
  );
}

/** Exactly one `GET storefront/pages/<layout>` per page load (client-side navigation never refetches). */
function pageSetGets(mocks: MockHandle, layout: Layout): number {
  return mocks.requests().filter((r) => r === `GET storefront/pages/${layout}`).length;
}

test('every template in the catalog has a content-block case', async ({ page }) => {
  const res = await page.request.get('/templates.json');
  const cat = (await res.json()) as { templates: Array<{ id: string }> };
  const covered = new Set(CASES.map(([t]) => t));
  expect(cat.templates.map((t) => t.id).filter((id) => !covered.has(id))).toEqual([]);
});

for (const layout of LAYOUTS) {
  test(`published set · ${layout} · content above the list, a custom page from the nav`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    const mocks = await installMocks(page, { layout, session: true, pages: { [layout]: storySet(layout) } });
    await page.goto('/');

    const hero = page.getByRole('heading', { name: 'Small batches, shipped fast' });
    await expect(hero).toBeVisible();
    const intro = page.getByRole('heading', { name: 'Fresh this week' });
    await expect(intro).toBeVisible();
    const firstProduct = productOpener(page, layout, 'Alpine Extract 10ml');
    await expect(firstProduct).toBeVisible();
    const heroY = (await hero.boundingBox())!.y;
    const introY = (await intro.boundingBox())!.y;
    expect(heroY).toBeLessThan(introY);
    expect(introY).toBeLessThan((await firstProduct.boundingBox())!.y);
    await noOverflow(page, 'catalog');
    await page.screenshot({ path: `${SHOTS}story-${layout}-catalog.png`, fullPage: true });

    await onlyVisible(page.getByRole('link', { name: 'Our story' })).click();
    await expect(page).toHaveURL(/\/pages\/our-story$/);
    await expect(page.getByRole('heading', { name: 'Our story' })).toBeVisible();
    await expect(page).toHaveTitle('Our story · Northbound Supply');
    await noOverflow(page, 'custom page');

    await page.getByRole('link', { name: 'Back to the shop' }).click();
    await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
    await expect(page).not.toHaveTitle('Our story · Northbound Supply');
    expect(pageSetGets(mocks, layout), 'one pages GET per page load').toBe(1);

    await page.reload();
    await expect(hero).toBeVisible();
    expect(pageSetGets(mocks, layout), 'a reload is a second page load').toBe(2);
  });

  for (const status of [503, 404] as const) {
    test(`published set · ${layout} · pages route ${status} falls back to the built-in pages`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.clock.setFixedTime(FIXED_NOW);
      const mocks = await installMocks(page, { layout, session: true, pages: { [layout]: storySet(layout) }, pagesFail: status });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
      await expect(productOpener(page, layout, 'Alpine Extract 10ml')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Small batches, shipped fast' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Our story' })).toHaveCount(0);
      // One logical read per page load: fetchPageSet passes `retry: 0`, overriding the shared ky client's
      // one GET retry (`retry: { limit: 1 }` in api/client.ts), so 503 and 404 are both a single request.
      expect(pageSetGets(mocks, layout), 'no retry storm').toBe(1);
      // A custom page cannot exist without the set: it goes home.
      await page.goto('/pages/our-story');
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
    });
  }

  test(`published set · ${layout} · checkout without CheckoutFlow falls back and reaches Review`, async ({ page }) => {
    const desktop = layout === 'storefront';
    await page.setViewportSize(desktop ? { width: 1280, height: 900 } : { width: 390, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const mocks = await installMocks(page, { layout, session: true, pages: { [layout]: checkoutWithoutFlowSet(layout) } });
    await page.goto('/');
    // Let the personalised catalogue settle first: a late catalogue swap re-mounts the detail
    // page and resets the add button's "Added" phase that addFirstToCart waits for (seen under load).
    await page.waitForLoadState('networkidle');
    await openProduct(page, layout, 'Alpine Extract 10ml');
    await addFirstToCart(page, layout, mocks);
    if (layout === 'webapp') {
      // In a plain browser the web app drives the flow from its in-page primary bar.
      const bar = page.locator('[data-sf-part="primary-bar"]');
      await bar.getByRole('button', { name: /^View cart · / }).click();
      await expect(page).toHaveURL(/\/cart$/);
      await bar.getByRole('button', { name: /^Checkout · / }).click();
      await expect(page).toHaveURL(/\/checkout$/);
      await fillCheckout(page, () => onlyVisible(page.getByRole('button', { name: 'Continue' })).click());
    } else {
      await openCart(page, desktop ? 'desktop' : 'mobile');
      await onlyVisible(page.getByRole('link', { name: 'Checkout' })).click();
      await fillCheckout(page);
    }
    await expect(page.getByRole('heading', { name: 'Almost there' })).toHaveCount(0);
    expect(errors.some((e) => e.includes('exactly-one:CheckoutFlow'))).toBe(true);
    expect(pageSetGets(mocks, layout)).toBe(1);
  });

  test(`published set · ${layout} · two Headers in the shell → the default shell`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await installMocks(page, { layout, pages: { [layout]: doubledShellSet(layout, 'Header') } });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Our story' })).toHaveCount(0);
    await expect(page.locator('[data-sf-block="NavLinks"]')).toHaveCount(0);
    expect(errors.some((e) => e.includes('at-most-one:Header'))).toBe(true);
  });

  test(`published set · ${layout} · 360px layout lab: nested bleeds, CategoryNav, long button, scrolling header nav`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.clock.setFixedTime(FIXED_NOW);
    await installMocks(page, { layout, session: true, pages: { [layout]: layoutLabSet(layout) } });
    await page.goto('/pages/layout-lab');
    await expect(page.getByRole('heading', { name: 'Bleed in a column' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bleed in a section' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Jars on a shelf' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await noOverflow(page, `layout lab ${layout} 360`);

    // Nested full-bleeds stay inside their parent.
    const contained = await page.evaluate(() => {
      const box = (sel: string) => document.querySelector(`[data-sf-block="${sel}"]`)!.getBoundingClientRect();
      const cols = document.querySelector('[data-sf-block="Columns"]')!.getBoundingClientRect();
      const sections = [...document.querySelectorAll('[data-sf-block="Section"]')].map((s) => s.getBoundingClientRect());
      const img = box('Image');
      const inside = (a: DOMRect, b: DOMRect) => a.left >= b.left - 0.5 && a.right <= b.right + 0.5;
      // sections[0] is in the column; sections[1] the outer rail band; sections[2] nested inside it.
      return { secInCol: inside(sections[0]!, cols), imgInCol: inside(img, cols), secInSec: inside(sections[2]!, sections[1]!) };
    });
    expect(contained).toEqual({ secInCol: true, imgInCol: true, secInSec: true });

    // Standalone CategoryNav: fits its gutter, no dead "All categories" button.
    const cats = page.locator('[data-sf-block="CategoryNav"]');
    await expect(cats).toBeVisible();
    await expect(cats.getByRole('button', { name: /All categories/ })).toHaveCount(0);
    const catBox = (await cats.boundingBox())!;
    expect(catBox.x).toBeGreaterThanOrEqual(0);
    expect(catBox.x + catBox.width).toBeLessThanOrEqual(360.5);

    // A long Button label wraps (not clipped) and stays ≥ 44px.
    const long = page.getByRole('link', { name: LONG_LABEL });
    await expect(long).toBeVisible();
    const lb = (await long.boundingBox())!;
    expect(lb.height).toBeGreaterThanOrEqual(44);
    expect(lb.x + lb.width).toBeLessThanOrEqual(360.5);
    const clip = await long.evaluate((el) => {
      const label = el.querySelector<HTMLElement>('.mantine-Button-label') ?? el;
      const r = document.createRange();
      r.selectNodeContents(label);
      const text = r.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return { lines: Math.round(text.height / parseFloat(getComputedStyle(label).lineHeight)), fits: text.left >= b.left - 0.5 && text.right <= b.right + 0.5 };
    });
    expect(clip.fits, 'button label clipped').toBe(true);
    expect(clip.lines, 'long label wraps').toBeGreaterThan(1);

    // Header nav slot: the row scrolls inside itself, 44px targets.
    const nav = page.locator('header [data-sf-block="NavLinks"]').first();
    await expect(nav).toBeVisible();
    const row = await nav.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, ox: getComputedStyle(el).overflowX }));
    expect(row.ox).toBe('auto');
    expect(row.sw, 'six links overflow a phone header row').toBeGreaterThan(row.cw);
    const navBox = (await nav.boundingBox())!;
    expect(navBox.x + navBox.width).toBeLessThanOrEqual(360.5);
    await nav.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await expect.poll(() => nav.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    const smallNav = await nav.locator('a').evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length);
    expect(smallNav, 'header nav links under 44px').toBe(0);
    await noOverflow(page, `header nav ${layout} 360`);
    expect(await smallBlockTargets(page), 'block tap targets under 44px').toEqual([]);
    await page.screenshot({ path: `${SHOTS}lab-${layout}-360.png`, fullPage: true });
  });
}

for (const layout of ['storefront', 'menu'] as const) {
  test(`published set · ${layout} · two MobileCartBars in the shell → the default shell`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await installMocks(page, { layout, pages: { [layout]: doubledShellSet(layout, 'MobileCartBar') } });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Our story' })).toHaveCount(0);
    expect(errors.some((e) => e.includes('at-most-one:MobileCartBar'))).toBe(true);
  });
}

test('an unknown custom page goes home', async ({ page }) => {
  await installMocks(page, { layout: 'storefront', pages: { storefront: storySet('storefront') } });
  await page.goto('/pages/not-a-page');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
});

const MATRIX: Array<[Layout, number]> = [['storefront', 360], ['storefront', 1280], ['menu', 360], ['menu', 390], ['webapp', 360], ['webapp', 390]];

for (const [template, preset] of CASES) {
  for (const [layout, width] of MATRIX) {
    test(`every content block · ${template}/${preset} · ${layout} · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.clock.setFixedTime(FIXED_NOW);
      const tweak = await presetTheme(page, template, preset);
      const mocks = await installMocks(page, { layout, session: true, tweakSettings: tweak, pages: { [layout]: everyBlockSet(layout) } });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-sf-template', template);
      await expect(page.getByRole('img', { name: 'Oats in a jar' })).toBeVisible();
      await expect(page.locator('[data-sf-block="FeaturedProducts"] [data-sf-part="product-card"]')).toHaveCount(2);
      await expect(page.locator('[data-sf-block="Video"] iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/aB3_dE-fG9h$/);
      await expect(page.locator('[data-sf-block="Testimonial"]')).toBeVisible();
      await expect(page.locator('[data-sf-block="Divider"]')).toHaveCount(1);
      if (layout !== 'webapp') await expect(page.getByRole('navigation', { name: 'Help' })).toBeAttached();

      const faq = page.locator('[data-sf-block="FAQ"] details').first();
      await faq.locator('summary').click();
      await expect(faq).toHaveAttribute('open', '');

      await page.evaluate(() => document.fonts.ready);
      await noOverflow(page, `${template}/${preset} ${layout} ${width}`);
      expect(await smallBlockTargets(page), 'block tap targets under 44px').toEqual([]);
      expect(pageSetGets(mocks, layout)).toBe(1);
      if (width <= 390) await page.screenshot({ path: `${SHOTS}every-${template}-${preset}-${layout}-${width}.png`, fullPage: true });
    });
  }
}
