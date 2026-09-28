import { expect, test, type Locator, type Page } from '@playwright/test';
import { installMocks, type InstallMocksOptions, type Layout } from './mocks.ts';
import { addFirstToCart, FIXED_NOW, openProduct } from './flows.ts';
import { presetTheme } from './template-theme.ts';

type Settings = Parameters<NonNullable<InstallMocksOptions['tweakSettings']>>[0];

async function open(page: Page, template: string, preset: string, width: number, opts: { options?: Record<string, boolean | string>; layout?: Layout; extra?: (s: Settings) => void } = {}) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.clock.setFixedTime(FIXED_NOW);
  const tweak = await presetTheme(page, template, preset, opts.options);
  const layout = opts.layout ?? 'storefront';
  const mocks = await installMocks(page, { layout, session: true, tweakSettings: (s) => { tweak(s); opts.extra?.(s); } });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-sf-template', template);
  return { mocks, layout };
}

const style = (loc: Locator, prop: string) => loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** WCAG contrast of an element's computed text colour on its computed background, plus both colours. */
const paint = (loc: Locator) => loc.evaluate((el) => {
  const channels = (c: string) => {
    const m = /^rgba?\(([^)]+)\)$/.exec(c) ?? /^color\(srgb ([^)]+)\)$/.exec(c);
    if (!m) throw new Error(`unparsed colour ${c}`);
    const v = m[1]!.split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number);
    return c.startsWith('color(') ? v.map((x) => x * 255) : v;
  };
  const lum = (c: string) => {
    const [r, g, b] = channels(c).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const cs = getComputedStyle(el);
  const probe = document.createElement('i');
  probe.style.color = 'var(--sf-bg)';
  document.body.appendChild(probe);
  const pageBg = getComputedStyle(probe).color;
  probe.remove();
  const [hi, lo] = [lum(cs.color), lum(cs.backgroundColor)].sort((a, b) => b - a);
  return { background: cs.backgroundColor, color: cs.color, pageBg, ratio: (hi! + 0.05) / (lo! + 0.05) };
});

test.describe('cyber-brutalism', () => {
  test('desktop: system bar, readout, crosshairs, status strip, square cards', async ({ page }) => {
    await open(page, 'cyber-brutalism', 'acid-dark', 1280);
    const bar = page.locator('[data-cb="sysbar"]');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('SYS.TIME');
    await expect(bar).toContainText('SKU:');
    await expect(page.locator('.cb-hero .cb-readout')).toContainText('> ITEMS');
    await expect(page.locator('[data-cb="frame"] .cb-cross')).toHaveCount(4);
    await expect(page.locator('[data-cb="status"]')).toBeVisible();
    expect(await style(page.locator('[data-sf-part="product-card"]').first(), 'border-top-left-radius')).toBe('0px');
    expect(await style(page.locator('[data-sf-part="header"]').first(), 'backdrop-filter')).toBe('none');
  });

  test('phone: the bar collapses and the status strip gives way to the acid cart bar', async ({ page }) => {
    const { mocks, layout } = await open(page, 'cyber-brutalism', 'acid-dark', 360);
    await expect(page.locator('[data-cb="sysbar"]')).toBeVisible();
    await expect(page.locator('[data-cb="sysbar"] [data-cb-wide]').first()).toBeHidden();
    await expect(page.locator('.cb-cross').first()).toBeHidden();
    expect(await noOverflow(page)).toBe(true);
    // The card's quick-add omits the price (`Add`, not `Add · $…`) — addFirstToCart
    // matches the product page's priced CTA, so the product opens first.
    await openProduct(page, layout, 'Alpine Extract 10ml');
    await addFirstToCart(page, layout, mocks);
    const cartBar = page.locator('[data-sf-part="cart-bar"]');
    await expect(cartBar).toBeVisible();
    await expect(page.locator('[data-cb="status"]')).toHaveCount(0);
    expect(await style(cartBar, 'background-color')).toBe('rgb(212, 255, 0)');
    // the strip line lives inside the shells' 76px .withBar clearance
    expect((await cartBar.boundingBox())!.height).toBeLessThanOrEqual(76);
  });

  test('purple light cart bar is ink with acid text', async ({ page }) => {
    const { mocks, layout } = await open(page, 'cyber-brutalism', 'purple-light', 390);
    await openProduct(page, layout, 'Alpine Extract 10ml');
    await addFirstToCart(page, layout, mocks);
    const cartBar = page.locator('[data-sf-part="cart-bar"]');
    expect(await style(cartBar, 'background-color')).toBe('rgb(17, 17, 17)');
    expect(await style(cartBar, 'color')).toBe('rgb(212, 255, 0)');
  });

  test('options off remove every decoration', async ({ page }) => {
    await open(page, 'cyber-brutalism', 'acid-dark', 1280, { options: { systemBar: false, statusBar: false, crosshairs: false } });
    // the template is live (open() checked data-sf-template) and its slots have mounted —
    // otherwise the absence checks below would pass against modern's defaults
    await expect(page.locator('.cb-hero')).toBeVisible();
    await expect(page.locator('.cb-footer')).toBeVisible();
    await expect(page.locator('[data-cb="sysbar"]')).toHaveCount(0);
    await expect(page.locator('[data-cb="frame"]')).toHaveCount(0);
    await expect(page.locator('[data-cb="status"]')).toHaveCount(0);
    await expect(page.locator('.cb-cross')).toHaveCount(0);
  });

  test('long brand name does not overflow at 360px', async ({ page }) => {
    await open(page, 'cyber-brutalism', 'acid-dark', 360, {
      extra: (s) => { s.brand.name = 'MERIDIANBOTANICALAPOTHECARY SUPPLY COMPANY'; s.brand.tagline = 'Wholesale botanicals'; },
    });
    await expect(page.locator('.cb-hero__name')).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
  });

  for (const preset of ['acid-dark', 'purple-light']) {
    test(`${preset}: a hovered Add to cart stays readable (not the dark primary-soft mix)`, async ({ page }) => {
      const { layout } = await open(page, 'cyber-brutalism', preset, 1280);
      await openProduct(page, layout, 'Alpine Extract 10ml');
      const add = page.getByRole('button', { name: /^Add · / }).first();
      await add.hover();
      // measure the settled hover, not the first frame of the 140ms colour transition
      await add.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      const p = await paint(add);
      expect(p.background).not.toBe(p.pageBg);
      expect(p.ratio, `hover ${p.color} on ${p.background}`).toBeGreaterThanOrEqual(4.5);
    });
  }

  for (const width of [768, 1280]) {
    test(`${width}: the viewport crosshair frame clears the system bar`, async ({ page }) => {
      await open(page, 'cyber-brutalism', 'acid-dark', width);
      const cross = page.locator('[data-cb="frame"] .cb-cross[data-at="tl"]');
      await expect(cross).toBeVisible();
      const c = (await cross.boundingBox())!;
      const bar = (await page.locator('[data-cb="sysbar"]').boundingBox())!;
      const overlaps = c.x < bar.x + bar.width && c.x + c.width > bar.x && c.y < bar.y + bar.height && c.y + c.height > bar.y;
      expect(overlaps, `cross ${JSON.stringify(c)} vs bar ${JSON.stringify(bar)}`).toBe(false);
    });
  }

  test('menu layout keeps the bar and the strip', async ({ page }) => {
    await open(page, 'cyber-brutalism', 'acid-dark', 390, { layout: 'menu' });
    await expect(page.locator('[data-cb="sysbar"]')).toBeVisible();
    await expect(page.locator('.cb-footer--compact [data-cb="status"]')).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
  });
});

test.describe('dark-luxury', () => {
  test('desktop: grain, orb, borderless raised cards, open badge, calm grid buttons', async ({ page }) => {
    await open(page, 'dark-luxury', 'gold', 1280);
    const grain = page.locator('[data-lux="grain"]');
    await expect(grain).toHaveCount(1);
    expect(await style(grain, 'pointer-events')).toBe('none');
    await expect(page.locator('[data-lux="orb"]')).toHaveCount(1);
    expect(await style(page.locator('[data-lux="orb"]'), 'animation-name')).toBe('sf-lux-orb'); // breathes ≥ 62em
    const card = page.locator('[data-sf-part="product-card"]').first();
    expect(await style(card, 'border-top-left-radius')).toBe('16px');
    // Pinned per controller review: the card's full radius (all four corners), not just one.
    expect(await style(card, 'border-radius')).toBe('16px');
    expect(await style(card, 'border-top-style')).toBe('none');
    expect(await style(card, 'box-shadow')).toContain('inset');
    await expect(page.locator('.lux-status')).toHaveText('[ACCEPTING ORDERS]');
    const add = page.locator('[data-sf-part="product-card"] [data-sf-part="button"]').first();
    expect(await style(add, 'animation-name')).toBe('none');
    expect(await style(add, 'background-color')).not.toBe('rgb(212, 160, 60)');
    // Pinned per controller review: the cascade against mantine.css's shared
    // outline-glow fill rules — the filled AddToCart at rest sits on --sf-bg
    // (gold preset: #0a0907) with luxury's own always-on glow, never a flat
    // accent fill and never no shadow at all.
    expect(await style(add, 'background-color')).toBe('rgb(10, 9, 7)');
    expect(await style(add, 'box-shadow')).not.toBe('none');
  });

  test('a keyboard-focused product card shows its focus ring (the card does not clip it)', async ({ page }) => {
    await open(page, 'dark-luxury', 'gold', 1280);
    const card = page.locator('[data-sf-part="product-card"]').first();
    expect(await style(card, 'overflow')).toBe('visible');
    const link = card.getByRole('link').first();
    await link.focus();
    const ring = await link.evaluate((el) => ({ focusVisible: el.matches(':focus-visible'), outline: getComputedStyle(el, '::after').outlineStyle }));
    expect(ring).toEqual({ focusVisible: true, outline: 'solid' });
  });

  test('a disabled filled CTA has no glow', async ({ page }) => {
    // Echo Balm 12ml (e2e/fixtures/catalog.json) is inStock: false, isActive: true,
    // isPreorder: false — AddToCart derives it out of stock and disables the button,
    // still rendered [data-sf-part="button"][data-variant="filled"]. mantine.css's
    // shared disabled rule only covers background/color/border for the outline-glow
    // and ghost fills; the glow is luxury's own box-shadow, so this pins luxury's own
    // `:is(:disabled, [data-disabled])` rule zeroing it out.
    await open(page, 'dark-luxury', 'gold', 1280);
    const outOfStockCard = page.locator('[data-sf-part="product-card"]', { has: page.getByRole('link', { name: 'Echo Balm 12ml', exact: true }) });
    const disabledCta = outOfStockCard.locator('[data-sf-part="button"]');
    await expect(disabledCta).toBeDisabled();
    expect(await style(disabledCta, 'box-shadow')).toBe('none');
  });

  test('phone: only the main CTA pulses', async ({ page }) => {
    const { mocks, layout } = await open(page, 'dark-luxury', 'gold', 390);
    await openProduct(page, layout, 'Alpine Extract 10ml');
    await addFirstToCart(page, layout, mocks);
    const cta = page.locator('[data-sf-part="cart-bar"] [data-sf-cta="main"]');
    await expect(cta).toBeVisible();
    expect(await style(cta, 'animation-name')).toBe('sf-lux-pulse');
    expect(await noOverflow(page)).toBe(true);
  });

  test('reduced motion (phone): the main CTA does not pulse', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { mocks, layout } = await open(page, 'dark-luxury', 'gold', 390);
    await openProduct(page, layout, 'Alpine Extract 10ml');
    await addFirstToCart(page, layout, mocks);
    const cta = page.locator('[data-sf-part="cart-bar"] [data-sf-cta="main"]');
    await expect(cta).toBeVisible();
    expect(await style(cta, 'animation-name')).toBe('none');
  });

  test('reduced motion (desktop): the orb does not breathe', async ({ page }) => {
    // 1280, not a phone: the orb only animates at ≥ 62em, so a phone check would pass vacuously
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'dark-luxury', 'gold', 1280);
    const orb = page.locator('[data-lux="orb"]');
    await expect(orb).toHaveCount(1);
    expect(await style(orb, 'animation-name')).toBe('none');
  });

  test('options off remove grain, orb and badge', async ({ page }) => {
    await open(page, 'dark-luxury', 'gold', 1280, { options: { grain: false, orb: false, statusBadge: false } });
    // the template is live and its slots have mounted — otherwise the absence checks pass against modern
    await expect(page.locator('.lux-hero')).toBeVisible();
    await expect(page.locator('.lux-footer')).toBeVisible();
    await expect(page.locator('[data-lux="grain"]')).toHaveCount(0);
    await expect(page.locator('[data-lux="orb"]')).toHaveCount(0);
    await expect(page.locator('.lux-status')).toHaveCount(0);
  });
});
