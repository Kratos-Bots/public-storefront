import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { installMocks, type Layout } from './mocks.ts';
import { addFirstToCart, FIXED_NOW, onlyVisible, openCart, openProduct } from './flows.ts';

interface TemplateCase {
  template: string;
  preset: string;
  /** Enforce ≥ 44px tap targets inside template-provided slots (modern has none). */
  tapTargets: boolean;
}

/** Every template in /templates.json needs at least one case (guarded below). Plan 3 appends. */
export const TEMPLATE_CASES: TemplateCase[] = [
  { template: 'modern', preset: 'default', tapTargets: false },
];

const WIDTHS = [360, 390, 768, 1280] as const;
const MENU_WIDTHS = [390, 1280] as const;
const SHOTS = fileURLToPath(new URL('../docs/screenshots/templates/', import.meta.url));

interface CatalogPreset { id: string; scheme: 'dark' | 'light'; colors: Record<string, string>; fonts: Record<'heading' | 'body' | 'mono', { family: string } | null>; radius: 'none' | 'sm' | 'md' | 'lg' | 'xl' }
interface CatalogJson { templates: Array<{ id: string; presets: CatalogPreset[] }> }

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
  const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('[data-sf-part="cart-bar"]'), [box.x + box.width / 2, box.y + box.height / 2]);
  expect(hit, 'something covers the cart bar checkout').toBe(true);
}

export async function expectSlotTapTargets(page: Page): Promise<void> {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-sf-slot] a, [data-sf-slot] button')]
      .filter((el) => el.offsetParent !== null && el.getBoundingClientRect().height < 44)
      .map((el) => el.outerHTML.slice(0, 80)),
  );
  expect(small, 'slot tap targets under 44px').toEqual([]);
}

test('every template in the catalog has a matrix case', async ({ page }) => {
  const cat = await catalogJson(page);
  const covered = new Set(TEMPLATE_CASES.map((c) => c.template));
  expect(cat.templates.map((t) => t.id).filter((id) => !covered.has(id))).toEqual([]);
});

for (const c of TEMPLATE_CASES) {
  const run = (layout: Layout, width: number) =>
    test(`${c.template}/${c.preset} · ${layout} · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.clock.setFixedTime(FIXED_NOW);
      const preset = (await catalogJson(page)).templates.find((t) => t.id === c.template)!.presets.find((p) => p.id === c.preset)!;
      const mocks = await installMocks(page, {
        layout,
        session: true,
        tweakSettings: (s) => {
          s.theme = {
            ...s.theme,
            template: c.template,
            preset: c.preset,
            options: {},
            scheme: preset.scheme,
            colors: preset.colors as typeof s.theme.colors,
            fonts: { heading: preset.fonts.heading?.family ?? null, body: preset.fonts.body?.family ?? null, mono: preset.fonts.mono?.family ?? null },
            radius: preset.radius,
          };
        },
      });
      const name = `${c.template}-${c.preset}-${layout}-${width}`;
      const phone = width < 992;

      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-sf-template', c.template);
      await expectNoHorizontalOverflow(page, 'catalog');
      if (c.tapTargets) await expectSlotTapTargets(page);
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
}
