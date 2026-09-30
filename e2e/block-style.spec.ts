import { expect, test, type Page } from '@playwright/test';
import { installMocks, type Layout } from './mocks.ts';
import { addFirstToCart, FIXED_NOW, fillCheckout, onlyVisible, openProduct } from './flows.ts';
import { presetTheme } from './template-theme.ts';
import { hiddenGridSet, maximumStyleSet, styledCatalogSet, styledFlowSet, styledHeaderSet } from './page-sets.ts';

/** Same cases as templates.spec.ts / builder.spec.ts (a spec may not import another spec). */
const CASES: Array<[string, string]> = [
  ['modern', 'default'], ['dark-luxury', 'gold'], ['cyber-brutalism', 'acid-dark'],
  ['cyber-brutalism', 'purple-light'], ['bento', 'tech-dark'], ['bento', 'fashion-light'],
];

/** A token's colour as the page resolves it (custom properties read raw, so paint a probe). */
function tokenColour(page: Page, token: string): Promise<string> {
  return page.evaluate((t) => {
    const el = document.createElement('div');
    el.style.background = `var(--sf-${t})`;
    document.body.append(el);
    const v = getComputedStyle(el).backgroundColor;
    el.remove();
    return v;
  }, token);
}
const cs = (page: Page, selector: string, prop: string) =>
  page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
async function noOverflow(page: Page, where: string) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(o.sw, `horizontal overflow on ${where}`).toBeLessThanOrEqual(o.w);
}

test('every template in the catalog has a block-style case', async ({ page }) => {
  const cat = (await (await page.request.get('/templates.json')).json()) as { templates: Array<{ id: string }> };
  const covered = new Set(CASES.map(([t]) => t));
  expect(cat.templates.map((t) => t.id).filter((id) => !covered.has(id))).toEqual([]);
});

for (const width of [390, 1280]) {
  test(`computed styles at ${width} resolve to the template's variables`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(FIXED_NOW);
    await installMocks(page, { layout: 'storefront', session: true, pages: { storefront: styledCatalogSet('storefront') } });
    await page.goto('/');
    const styled = '[data-sf-style="Heading"]';
    await expect(page.locator(styled)).toBeVisible();
    expect(await cs(page, styled, 'background-color')).toBe(await tokenColour(page, 'surface-2'));
    expect(await cs(page, styled, 'border-top-color')).toBe(await tokenColour(page, 'primary'));
    expect(await cs(page, styled, 'border-top-width')).toBe('1px');
    const radius = await page.evaluate(() => { const el = document.createElement('div'); el.style.borderRadius = 'var(--sf-card-radius)'; document.body.append(el); const v = getComputedStyle(el).borderTopLeftRadius; el.remove(); return v; });
    expect(await cs(page, styled, 'border-top-left-radius')).toBe(radius);
    // Phone cap: lg (40 px) is 24 px below 48em.
    expect(await cs(page, styled, 'padding-top')).toBe(width < 768 ? '24px' : '40px');
    // Text size lg scales the heading's own size by 1.125 against an unstyled twin.
    const size = (sel: string) => page.locator(sel).first().evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    const ratio = (await size(`${styled} h2`)) / (await size('[data-sf-block="Heading"]:not([data-sf-style]) h2'));
    expect(ratio).toBeCloseTo(1.125, 2);
    // bg with no padX: the inset keeps text off the tint.
    expect(await cs(page, styled, 'padding-left')).toBe('16px');
    // hide at the 62em breakpoint.
    const onPhone = width < 992;
    await expect(page.getByRole('heading', { name: 'Only from 992 px' })).toBeVisible({ visible: !onPhone });
    await expect(page.getByRole('heading', { name: 'Only below 992 px' })).toBeVisible({ visible: onPhone });
    // Empty wrap: a styled Upsells with nothing curated leaves no visible box.
    const box = await page.locator('[data-sf-style="Upsells"]').boundingBox();
    expect(box === null || box.height === 0).toBe(true);
    await noOverflow(page, `catalog at ${width}`);
  });
}

for (const [template, preset] of CASES) {
  test(`owner beats template · ${template}/${preset}: styled Header background, still sticky`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const tweak = await presetTheme(page, template, preset);
    await installMocks(page, { layout: 'storefront', session: true, tweakSettings: tweak, pages: { storefront: styledHeaderSet('storefront') } });
    await page.goto('/');
    const header = 'header[data-sf-part="header"][data-sf-style="Header"]';
    await expect(page.locator(header)).toBeVisible();
    expect(await cs(page, header, 'background-color')).toBe(await tokenColour(page, 'surface-3'));
    await page.mouse.wheel(0, 2500);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
    const top = await page.locator(header).evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(top)).toBeLessThanOrEqual(1);
  });

  test(`maximum styles · ${template}/${preset}: no overflow at 360; bg follows the template`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const tweak = await presetTheme(page, template, preset);
    await installMocks(page, { layout: 'storefront', session: true, tweakSettings: tweak, pages: { storefront: maximumStyleSet('storefront') } });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Deep and wide' })).toBeVisible();
    expect(await cs(page, '[data-sf-style="Columns"]', 'background-color')).toBe(await tokenColour(page, 'surface'));
    await noOverflow(page, `catalog · ${template}/${preset}`);
    // Whatever /checkout renders for this session (the styled set, or a redirect for an empty cart), it must not overflow.
    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');
    if (new URL(page.url()).pathname === '/checkout') await expect(page.getByRole('heading', { name: 'Deep and wide' })).toBeVisible();
    await noOverflow(page, `checkout · ${template}/${preset}`);
  });
}

test('flows survive styling: checkout reaches Review through a styled CheckoutFlow', async ({ page }) => {
  // /cart is a page only below 62em (a drawer above), so the styled cart page is exercised on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(FIXED_NOW);
  const mocks = await installMocks(page, { layout: 'storefront', session: true, pages: { storefront: styledFlowSet('storefront') } });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await openProduct(page, 'storefront', 'Alpine Extract 10ml');
  await addFirstToCart(page, 'storefront', mocks);
  await page.goto('/cart');
  // CartContents keeps its summary slot (the docket foot) inside the styled lines, below them.
  const contents = page.locator('[data-sf-style="CartContents"]');
  await expect(contents).toBeVisible();
  const summary = contents.locator('[data-sf-style="CartSummary"]');
  await expect(summary).toBeVisible();
  const lines = await contents.boundingBox();
  const foot = await summary.boundingBox();
  expect(foot!.y).toBeGreaterThan(lines!.y);
  expect(foot!.y + foot!.height).toBeLessThanOrEqual(lines!.y + lines!.height + 1);
  await noOverflow(page, 'styled cart page');
  await onlyVisible(page.getByRole('link', { name: 'Checkout' })).click();
  await expect(page.locator('[data-sf-style="CheckoutFlow"]')).toBeVisible();
  await fillCheckout(page);
});

for (const layout of ['storefront', 'menu'] as const satisfies readonly Layout[]) {
  test(`hidden-required · ${layout}: a grid inside a hidden Section renders the default catalogue`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await installMocks(page, { layout, session: true, pages: { [layout]: hiddenGridSet(layout) } });
    await page.goto('/');
    await expect(page.getByText('Alpine Extract 10ml').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Should not render' })).toHaveCount(0);
    expect(errors.some((e) => e.includes('hidden-required:Section'))).toBe(true);
  });
}
