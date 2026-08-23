import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { installMocks, ORDER_PATH, ORIGIN, type Layout } from './mocks.ts';

/**
 * The mocked end-to-end pass. Vite serves the real app; every `/api/*`,
 * `/media/*` and Cloudflare-challenge request is answered from `mocks.ts`, so
 * nothing here needs the Worker, the backend, or a network.
 *
 * Scenarios 1 and 2 run for both layouts at both viewports — that matrix is the
 * point of them. The rest are layout-independent (the checkout, account,
 * tracking, verify and order pages render the same tree under either shell) and
 * say so where they are collapsed.
 */

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const VIEWPORTS = [
  ['mobile', MOBILE],
  ['desktop', DESKTOP],
] as const;
const LAYOUTS: Layout[] = ['storefront', 'menu'];

const SHOTS = fileURLToPath(new URL('./screenshots/', import.meta.url));

const PRODUCTS = [
  'Alpine Extract 10ml',
  'Borealis Drops 25ml',
  'Citrine Capsules 60ct',
  'Dune Starter Kit',
  'Echo Balm 12ml',
  'Fennec Tincture 30ml',
];

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}${name}.png` });
}

/** Both shells keep the phone and desktop variants of a control in the DOM and
 *  let CSS choose — so every shared-name query resolves through visibility. */
function onlyVisible(locator: Locator): Locator {
  return locator.filter({ visible: true }).first();
}

function searchBox(page: Page): Locator {
  return onlyVisible(page.getByRole('textbox', { name: 'Search products' }));
}

/** What opens a product: a card link in the storefront grid, a row button in the menu list. */
function productOpener(page: Page, layout: Layout, name: string): Locator {
  return layout === 'menu'
    ? page.getByRole('button', { name, exact: true })
    : page.getByRole('link', { name, exact: true });
}

async function expectProducts(page: Page, layout: Layout, names: string[]): Promise<void> {
  for (const name of PRODUCTS) {
    const opener = productOpener(page, layout, name);
    if (names.includes(name)) await expect(opener).toBeVisible();
    else await expect(opener).toHaveCount(0);
  }
}

async function openCategory(page: Page, layout: Layout, name: string): Promise<void> {
  if (layout === 'menu') {
    await page.getByRole('button', { name: 'Categories', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Categories' });
    await sheet.getByRole('link', { name: new RegExp(`^${name}`) }).click();
    await expect(sheet).toBeHidden();
    return;
  }
  await onlyVisible(page.getByRole('link', { name: new RegExp(`^${name}`) })).click();
}

async function openProduct(page: Page, layout: Layout, name: string): Promise<void> {
  await productOpener(page, layout, name).click();
  if (layout === 'menu') await expect(page.getByRole('dialog', { name })).toBeVisible();
  else await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

/** The cart, wherever this viewport keeps it: a page on a phone, a drawer on a desktop. */
async function openCart(page: Page, viewport: 'mobile' | 'desktop'): Promise<Locator> {
  await onlyVisible(page.getByRole('link', { name: /^Cart, / })).click();
  if (viewport === 'desktop') {
    const drawer = page.getByRole('dialog', { name: 'Your cart' });
    await expect(drawer).toBeVisible();
    return drawer;
  }
  await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
  return page.locator('body');
}

/** Contact → Address → Shipping → Payment (crypto) → Review, stopping on Review. */
async function fillCheckout(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
  await page.getByRole('textbox', { name: 'First name' }).fill('Ada');
  await page.getByRole('textbox', { name: 'Surname' }).fill('Sterling');
  await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.invalid');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Delivery address' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Address line 1' }).fill('14 Kirkgate');
  await page.getByRole('textbox', { name: 'City' }).fill('Leeds');
  await page.getByRole('textbox', { name: 'ZIP / Postcode' }).fill('LS1 6BY');
  // Pre-seeded from the shop's `defaultPhoneCountry`; the quote is keyed on it.
  await expect(page.getByRole('combobox', { name: 'Country' })).toHaveValue('GB');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Delivery and discounts' })).toBeVisible();
  // The options only exist once the backend has priced the order.
  await expect(page.getByText('Tracked 24')).toBeVisible();
  await page.getByText('Tracked 24').click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: /How you.ll pay/ })).toBeVisible();
  await page.locator('label').filter({ hasText: 'Crypto' }).first().click();
  await page.locator('label').filter({ hasText: 'USDT' }).first().click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
  await expect(page.getByText('ada@example.invalid')).toBeVisible();
  await expect(page.getByText('USDT · Polygon')).toBeVisible();
}

/** The crypto card on the public order page, through to a submitted txid. */
async function payWithCrypto(page: Page): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`${ORDER_PATH}$`));
  await expect(page.getByRole('heading', { name: 'Send 46.03 USDT' })).toBeVisible();
  await expect(page.getByText('0xE2E1a2b3c4d5e6f7089aabbccddeeff0011223344')).toBeVisible();

  await page.getByRole('textbox', { name: 'Transaction ID' }).fill('0xabc123def4567890abcdef1234567890');
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page.getByRole('heading', { name: 'Verifying your payment' })).toBeVisible();
  await expect(page.getByText('Verifying', { exact: true })).toBeVisible();
}

// ---------------------------------------------------------------------------
// 1 + 2 — the catalogue and the buy, in both shells at both sizes
// ---------------------------------------------------------------------------

for (const layout of LAYOUTS) {
  for (const [size, viewport] of VIEWPORTS) {
    test.describe(`${layout} · ${size}`, () => {
      test.use({ viewport });

      test('1 · catalogue renders, search filters, a category filters', async ({ page }) => {
        const mocks = await installMocks(page, { layout });
        await page.goto('/');

        await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
        await expectProducts(page, layout, PRODUCTS);
        await shot(page, `1-catalog-${layout}-${size}`);

        await searchBox(page).fill('Borealis');
        await expectProducts(page, layout, ['Borealis Drops 25ml']);

        await searchBox(page).fill('');
        await expectProducts(page, layout, PRODUCTS);

        await openCategory(page, layout, 'Concentrates');
        await expect(page).toHaveURL(/\/c\/concentrates$/);
        await expect(page.getByRole('heading', { name: 'Concentrates', level: 1 })).toBeVisible();
        await expectProducts(page, layout, ['Alpine Extract 10ml', 'Borealis Drops 25ml']);
        await shot(page, `1-category-${layout}-${size}`);

        expect(mocks.requests()).toEqual(
          expect.arrayContaining(['GET storefront/settings', 'GET catalog']),
        );
      });

      test('2 · detail → cart → checkout → order page → txid', async ({ page }) => {
        const mocks = await installMocks(page, { layout, session: true });
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();

        await openProduct(page, layout, 'Alpine Extract 10ml');
        await expect(page.getByText('£42.50').first()).toBeVisible();
        await shot(page, `2-detail-${layout}-${size}`);

        await page.getByRole('button', { name: /^Add · / }).first().click();
        await expect(page.getByRole('button', { name: /^(Added|Add another)/ })).toBeVisible();
        if (layout === 'menu') {
          await page.getByRole('button', { name: 'Close' }).first().click();
          await expect(page.getByRole('dialog', { name: 'Alpine Extract 10ml' })).toBeHidden();
        }

        // The line is mirrored to the server on a 400 ms debounce. Wait for that
        // write before opening the cart: a cart opened inside the debounce window
        // races its own PUT (see the task report), and the flow — not the race —
        // is what this test is about.
        await expect.poll(() => mocks.state.cart.itemCount).toBe(1);
        expect(mocks.requests()).toContain('PUT storefront/cart');
        expect(mocks.state.cart.items[0]).toMatchObject({ productId: 101, quantity: 1 });

        const cart = await openCart(page, size);
        await expect(cart.getByText('Alpine Extract 10ml')).toBeVisible();
        await expect(
          cart.getByRole('textbox', { name: 'Alpine Extract 10ml quantity' }),
        ).toHaveValue('1');
        await shot(page, `2-cart-${layout}-${size}`);

        await onlyVisible(cart.getByRole('link', { name: 'Checkout' })).click();
        await expect(page).toHaveURL(/\/checkout$/);

        await fillCheckout(page);
        await shot(page, `2-checkout-review-${layout}-${size}`);

        await page.getByRole('button', { name: /^Place order/ }).click();
        await payWithCrypto(page);
        await shot(page, `2-order-crypto-${layout}-${size}`);

        expect(mocks.state.checkouts).toHaveLength(1);
        expect(mocks.state.checkouts[0]).toMatchObject({
          shippingOptionId: 11,
          paymentMethod: 'crypto_static',
          coin: 'usdt',
          network: 'polygon',
          email: 'ada@example.invalid',
        });
      });
    });
  }
}

// ---------------------------------------------------------------------------
// 3 — guest checkout (layout-independent: the checkout renders inside either
//     shell unchanged, so it runs once, on a phone)
// ---------------------------------------------------------------------------

test.describe('guest checkout', () => {
  test.use({ viewport: MOBILE });

  test('3 · a guest quotes and orders behind Turnstile', async ({ page }) => {
    const mocks = await installMocks(page, {
      layout: 'storefront',
      tweakSettings: (s) => {
        s.features.guestCheckout = true;
      },
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
    await openProduct(page, 'storefront', 'Alpine Extract 10ml');
    await page.getByRole('button', { name: /^Add · / }).first().click();
    await expect(page.getByRole('button', { name: /^(Added|Add another)/ })).toBeVisible();

    // A guest has no server cart: the lines ride along inside the guest calls.
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: 'Guest checkout', level: 1 })).toBeVisible();
    // No session, so the contact step offers the way in rather than assuming one.
    await expect(page.getByRole('main').getByRole('link', { name: 'Sign in' })).toBeVisible();
    await shot(page, '3-guest-contact');

    // The first quote is minted by the (shimmed) invisible widget, not by a form edit.
    await expect.poll(() => mocks.state.guestQuotes.length).toBeGreaterThan(0);
    expect(String(mocks.state.guestQuotes[0]!.turnstileToken)).toMatch(/^e2e-turnstile-token-/);
    expect(mocks.state.guestQuotes[0]).toMatchObject({
      items: [{ productId: 101, quantity: 1 }],
      country: 'GB',
    });

    await fillCheckout(page);
    await shot(page, '3-guest-review');

    await page.getByRole('button', { name: /^Place order/ }).click();
    await payWithCrypto(page);
    await shot(page, '3-guest-order');

    expect(mocks.requests()).toContain('POST storefront/checkout/guest');
    expect(mocks.state.checkouts).toHaveLength(1);
    // Every guest call carries its own token — a spent one is never re-sent.
    const tokens = [
      ...mocks.state.guestQuotes.map((q) => q.turnstileToken),
      mocks.state.checkouts[0]!.turnstileToken,
    ];
    expect(new Set(tokens).size).toBe(tokens.length);
  });
});

// ---------------------------------------------------------------------------
// 4 — sign-in and the account (layout-independent; run at both sizes because
//     the account rail and the login column are the responsive parts)
// ---------------------------------------------------------------------------

for (const [size, viewport] of VIEWPORTS) {
  test.describe(`account · ${size}`, () => {
    test.use({ viewport });

    test('4 · WhatsApp sign-in lands on the account, tabs render', async ({ page }) => {
      const mocks = await installMocks(page, { layout: 'storefront' });
      await page.goto('/login');

      await expect(page.getByRole('heading', { name: 'Sign in to Northbound Supply' })).toBeVisible();
      await page.getByRole('button', { name: 'Continue with WhatsApp' }).click();

      await expect(page.getByText('NB-4417')).toBeVisible();
      await expect(page.getByText('Waiting for your message')).toBeVisible();
      await shot(page, `4-login-waiting-${size}`);

      // Two pending polls, then completed → complete → session → /account.
      await expect(page).toHaveURL(/\/account\/orders$/, { timeout: 30_000 });
      expect(mocks.requests().filter((r) => r.startsWith('GET storefront/auth/attempts/')).length)
        .toBeGreaterThanOrEqual(3);
      expect(mocks.requests()).toContain('POST storefront/auth/whatsapp/complete');

      await expect(page.getByRole('heading', { name: 'Ada', level: 1 })).toBeVisible();
      await expect(page.getByText('Member since 11 February 2026')).toBeVisible();
      await expect(page.getByRole('link', { name: /^E2E1/ })).toBeVisible();
      await expect(page.getByText('Balance due')).toBeVisible();
      await shot(page, `4-account-orders-${size}`);

      await page.getByRole('link', { name: 'Loyalty', exact: true }).click();
      await expect(page.getByText('1,240')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Redeem' }).first()).toBeEnabled();
      await shot(page, `4-account-loyalty-${size}`);

      await page.getByRole('link', { name: 'Referrals', exact: true }).click();
      await expect(page.getByText('NB-ADA-7788')).toBeVisible();
      await expect(page.getByText('People referred')).toBeVisible();
      await shot(page, `4-account-referrals-${size}`);

      await page.getByRole('link', { name: 'Profile', exact: true }).click();
      await expect(page.getByText('WhatsApp linked')).toBeVisible();
      await expect(page.getByText('Telegram not linked')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
      await shot(page, `4-account-profile-${size}`);
    });
  });
}

// ---------------------------------------------------------------------------
// 5 — the kill switch (layout-independent: ClosedPage replaces the whole app)
// ---------------------------------------------------------------------------

test.describe('closed shop', () => {
  test.use({ viewport: MOBILE });

  test('5a · a shop with enabled:false shows the closed page', async ({ page }) => {
    await installMocks(page, {
      layout: 'storefront',
      tweakSettings: (s) => {
        s.enabled = false;
      },
    });
    await page.goto('/');

    await expect(page.getByText('Currently closed')).toBeVisible();
    await expect(
      page.getByText("We're closed while we restock. Back on Monday morning."),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'All products' })).toHaveCount(0);
    await shot(page, '5-closed');
  });

  test('5b · a mid-session 503 flips a browsing tab to closed', async ({ page }) => {
    const mocks = await installMocks(page, { layout: 'storefront', session: true });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();

    // Survives client-side navigation, not a reload — the proof that the flip
    // came from a 503 rather than from a fresh boot on `enabled: false`.
    await page.evaluate(() => {
      (window as unknown as { __sameDocument?: boolean }).__sameDocument = true;
    });

    const before = mocks.requests().length;
    mocks.closeShop();
    await onlyVisible(page.getByRole('link', { name: /^Cart, / })).click();

    await expect(page.getByText('Currently closed')).toBeVisible();
    expect(mocks.requests().slice(before)).toContain('GET storefront/cart');
    expect(
      await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument),
    ).toBe(true);
    await shot(page, '5-closed-midsession');
  });

  test('5c · an order link still opens while the shop is closed', async ({ page }) => {
    await installMocks(page, {
      layout: 'storefront',
      tweakSettings: (s) => {
        s.enabled = false;
      },
    });
    await page.goto(ORDER_PATH);

    await expect(page.getByRole('heading', { name: 'Order received' })).toBeVisible();
    await expect(page.getByText('Order E2E1')).toBeVisible();
    await expect(page.getByText('Currently closed')).toHaveCount(0);
    await shot(page, '5-order-while-closed');
  });
});

// ---------------------------------------------------------------------------
// 6 — tracking and verify (layout-independent pages)
// ---------------------------------------------------------------------------

test.describe('tracking and verify', () => {
  for (const [size, viewport] of VIEWPORTS) {
    test.describe(`${size}`, () => {
      test.use({ viewport });

      test('6a · a reference in the URL tracks the parcel', async ({ page }) => {
        const mocks = await installMocks(page, { layout: 'storefront' });
        await page.goto('/tracking/E2E1');

        await expect(page.getByRole('heading', { name: 'In transit' })).toBeVisible();
        await expect(page.getByText('AB123456789GB').first()).toBeVisible();
        await expect(page.getByText('Departed the national hub')).toBeVisible();
        await shot(page, `6-tracking-${size}`);

        expect(mocks.requests()).toContain('POST storefront/tracking');
      });
    });
  }

  test.describe('mobile forms', () => {
    test.use({ viewport: MOBILE });

    test('6b · the lookup form tracks a typed reference', async ({ page }) => {
      await installMocks(page, { layout: 'storefront' });
      await page.goto('/tracking');

      await expect(page.getByRole('heading', { name: 'Track your order' })).toBeVisible();
      await shot(page, '6-tracking-lookup');
      await page.getByRole('textbox', { name: 'Order number' }).fill('e2e1');
      await page.getByRole('button', { name: 'Track order' }).click();

      await expect(page).toHaveURL(/\/tracking\/E2E1$/);
      await expect(page.getByRole('heading', { name: 'In transit' })).toBeVisible();
    });

    test('6c · a genuine code pair verifies', async ({ page }) => {
      const mocks = await installMocks(page, { layout: 'storefront' });
      await page.goto('/verify');

      await page.getByRole('textbox', { name: 'Verification code' }).fill('AB3D-SKU12');
      await page.getByRole('textbox', { name: 'Authentication code' }).fill('123456');
      await page.getByRole('button', { name: 'Verify product' }).click();

      await expect(page.getByText('Authentic Product')).toBeVisible();
      await expect(page.getByText('04 Mar 2028')).toBeVisible();
      await shot(page, '6-verify');

      expect(mocks.requests()).toContain('GET verify/AB3D-SKU12/123456');
    });

    test('6d · tracking switched off 404s rather than redirecting', async ({ page }) => {
      await installMocks(page, {
        layout: 'storefront',
        tweakSettings: (s) => {
          s.features.tracking = false;
        },
      });
      await page.goto('/tracking');

      await expect(page.getByText("This page isn't here")).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Track your order' })).toHaveCount(0);
      await shot(page, '6-tracking-off');
    });
  });
});

// ---------------------------------------------------------------------------
// 7 — first paint (layout-independent: the bootstrap is in index.html)
// ---------------------------------------------------------------------------

test.describe('theme first paint', () => {
  test.use({ viewport: MOBILE });

  test('7 · a returning visitor gets the palette before any app JS runs', async ({ page }) => {
    await installMocks(page, { layout: 'storefront' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();

    const stored = await page.evaluate(() => window.localStorage.getItem('sf-theme-v1'));
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!).theme.colors.bg).toBe('#0b0c0e');

    // Reload with the app's entry module blocked: whatever paints now is the
    // inline bootstrap in index.html, not React.
    await page.route(`${ORIGIN}/src/main.tsx*`, (route) => route.abort());
    await page.reload();

    expect(await page.locator('#root').innerHTML()).toBe('');
    const painted = await page.evaluate(() => ({
      bg: document.documentElement.style.getPropertyValue('--sf-bg'),
      surface: document.documentElement.style.getPropertyValue('--sf-surface'),
      scheme: document.documentElement.getAttribute('data-mantine-color-scheme'),
      title: document.title,
    }));
    expect(painted).toEqual({
      bg: '#0b0c0e',
      surface: '#14161a',
      scheme: 'dark',
      title: 'Northbound Supply',
    });
  });
});
