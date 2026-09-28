import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { installMocks, type Layout } from './mocks.ts';
import { addFirstToCart, FIXED_NOW, onlyVisible, openCart, openProduct } from './flows.ts';
import { presetTheme } from './template-theme.ts';

interface TemplateCase {
  template: string;
  preset: string;
  /** Enforce ≥ 44px tap targets inside template-provided slots (modern has none). */
  tapTargets: boolean;
}

/** Every template in /templates.json needs at least one case (guarded below). Plan 3 appends. */
export const TEMPLATE_CASES: TemplateCase[] = [
  { template: 'modern', preset: 'default', tapTargets: false },
  { template: 'dark-luxury', preset: 'gold', tapTargets: true },
  { template: 'cyber-brutalism', preset: 'acid-dark', tapTargets: true },
  { template: 'cyber-brutalism', preset: 'purple-light', tapTargets: true },
];

const WIDTHS = [360, 390, 768, 1280] as const;
const MENU_WIDTHS = [390, 1280] as const;
const SHOTS = fileURLToPath(new URL('../docs/screenshots/templates/', import.meta.url));

interface CatalogJson { templates: Array<{ id: string }> }

async function catalogJson(page: Page): Promise<CatalogJson> {
  const res = await page.request.get('/templates.json');
  expect(res.ok()).toBe(true);
  return (await res.json()) as CatalogJson;
}

export async function expectNoHorizontalOverflow(page: Page, where: string): Promise<void> {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(o.sw, `horizontal overflow on ${where}`).toBeLessThanOrEqual(o.w);
}

export async function expectCartBarUnobstructed(page: Page): Promise<void> {
  const link = page.locator('[data-sf-part="cart-bar"]').getByRole('link', { name: 'Checkout' });
  await expect(link).toBeVisible();
  const box = (await link.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
  const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('[data-sf-part="cart-bar"]'), [box.x + box.width / 2, box.y + box.height / 2]);
  expect(hit, 'something covers the cart bar checkout').toBe(true);
}

/**
 * Slot tap targets under 44×44px (in either dimension), excluding anything not actually
 * rendered or not actually interactive. `offsetParent` is unusable here: it is null for
 * `position: fixed` elements even when they are visible and hit-testable, so a fixed slot
 * control would silently escape the check. `pointer-events: none` elements are decorations,
 * not tap targets, so they are skipped regardless of size.
 */
export async function findSmallSlotTapTargets(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-sf-slot] a, [data-sf-slot] button')]
      .filter((el) => {
        const cs = getComputedStyle(el);
        const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
        if (!visible || cs.pointerEvents === 'none') return false;
        const r = el.getBoundingClientRect();
        return r.width < 44 || r.height < 44;
      })
      .map((el) => el.outerHTML.slice(0, 80)),
  );
}

/** Every product card's price and its quick-add button occupy separate boxes (the foot wraps when it must). */
export async function expectCardPricesClear(page: Page): Promise<void> {
  // Measured once the web fonts have landed (the fallback mono is narrower), on the glyphs themselves.
  const overlaps = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.querySelectorAll<HTMLElement>('[data-sf-part="product-card"]')].flatMap((card) => {
      const price = card.querySelector('[data-sf-part="price"]');
      const button = card.querySelector('[data-sf-part="button"]');
      if (!price || !button) return [];
      const text = document.createRange();
      text.selectNodeContents(price);
      const a = text.getBoundingClientRect();
      const b = button.getBoundingClientRect();
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return w > 0.5 && h > 0.5 ? [`${price.textContent} under ${button.textContent}`] : [];
    });
  });
  expect(overlaps, 'card prices covered by their button').toEqual([]);
}

export async function expectSlotTapTargets(page: Page): Promise<void> {
  const small = await findSmallSlotTapTargets(page);
  expect(small, 'slot tap targets under 44px').toEqual([]);
}

test('every template in the catalog has a matrix case', async ({ page }) => {
  const cat = await catalogJson(page);
  const covered = new Set(TEMPLATE_CASES.map((c) => c.template));
  expect(cat.templates.map((t) => t.id).filter((id) => !covered.has(id))).toEqual([]);
});

test('findSmallSlotTapTargets: fixed-position and pointer-events edge cases', async ({ page }) => {
  // A minimal, app-free page: four fixed-position links inside a `[data-sf-slot]` wrapper.
  // `offsetParent` is null for ALL of these (position: fixed), which is exactly the bug this
  // proves is fixed — the old check used `offsetParent !== null` as its visibility test, so it
  // silently skipped every fixed element regardless of size.
  await page.setContent(`
    <div data-sf-slot="TopBar">
      <a id="tiny" href="#" style="position:fixed;top:0;left:0;width:100px;height:20px;">tiny</a>
      <a id="ok" href="#" style="position:fixed;top:40px;left:0;width:44px;height:44px;">ok</a>
      <a id="decor" href="#" style="position:fixed;top:100px;left:0;width:10px;height:10px;pointer-events:none;">decor</a>
      <a id="narrow" href="#" style="position:fixed;top:200px;left:0;width:20px;height:60px;">n</a>
    </div>
  `);
  const small = await findSmallSlotTapTargets(page);
  expect(small.some((html) => html.includes('id="tiny"')), 'a visible 100×20 fixed link must be flagged').toBe(true);
  expect(small.some((html) => html.includes('id="ok"')), 'a 44×44 fixed link must not be flagged').toBe(false);
  expect(small.some((html) => html.includes('id="decor"')), 'a pointer-events:none element must not be flagged, even though it is 10×10').toBe(false);
  expect(small.some((html) => html.includes('id="narrow"')), 'a 20×60 fixed link (too narrow, tall enough) must be flagged').toBe(true);
  expect(small.length, 'exactly two violations are expected').toBe(2);
});

for (const c of TEMPLATE_CASES) {
  const run = (layout: Layout, width: number) =>
    test(`${c.template}/${c.preset} · ${layout} · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.clock.setFixedTime(FIXED_NOW);
      const mocks = await installMocks(page, {
        layout,
        session: true,
        tweakSettings: await presetTheme(page, c.template, c.preset),
      });
      const name = `${c.template}-${c.preset}-${layout}-${width}`;
      const phone = width < 992;

      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-sf-template', c.template);
      await expectNoHorizontalOverflow(page, 'catalog');
      if (c.tapTargets) await expectSlotTapTargets(page);
      // Modern is exempt: its narrow-tile foot is frozen by the committed pixel baseline (see ProductCard.module.css).
      if (layout === 'storefront' && width === 360 && c.template !== 'modern') await expectCardPricesClear(page);
      await page.screenshot({ path: `${SHOTS}${name}-1-catalog.png`, fullPage: true });

      await openProduct(page, layout, 'Alpine Extract 10ml');
      await expectNoHorizontalOverflow(page, 'detail');
      await page.screenshot({ path: `${SHOTS}${name}-2-detail.png` });

      // Both layouts continue to cart → checkout (the menu layout at 390 and 1280; the
      // baseline spec proves the same flow works in the menu shell). addFirstToCart closes
      // the menu's product dialog; MenuShell renders the same MobileCartBar on phones.
      await addFirstToCart(page, layout, mocks);
      if (phone) await expectCartBarUnobstructed(page);
      await openCart(page, phone ? 'mobile' : 'desktop');
      await expectNoHorizontalOverflow(page, 'cart');
      await page.screenshot({ path: `${SHOTS}${name}-3-cart.png` });

      await onlyVisible(page.getByRole('link', { name: 'Checkout' })).click();
      await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
      await expectNoHorizontalOverflow(page, 'checkout');
      await page.screenshot({ path: `${SHOTS}${name}-4-checkout.png` });
    });

  for (const w of WIDTHS) run('storefront', w);
  for (const w of MENU_WIDTHS) run('menu', w);

  // The wholesale trade list replaces the catalogue under either layout; not in the screenshot matrix.
  test(`${c.template}/${c.preset} · wholesale · 360px`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.clock.setFixedTime(FIXED_NOW);
    const tweak = await presetTheme(page, c.template, c.preset);
    await installMocks(page, { layout: 'storefront', session: true, tweakSettings: (s) => { tweak(s); s.features.wholesale = true; } });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Trade list', level: 1 })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-sf-template', c.template);
    await expectNoHorizontalOverflow(page, 'wholesale');
    if (c.tapTargets) await expectSlotTapTargets(page);
  });
}
