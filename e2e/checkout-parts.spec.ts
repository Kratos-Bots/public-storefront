import { expect, test, type Page } from '@playwright/test';
import {
  COUPON_CODE, installMocks, installTelegramStub, type InstallMocksOptions, type Layout, type MockHandle,
} from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';
import {
  arrangedCheckoutSet, defaultCheckoutSet, illegalCheckoutSet, LEGAL_STEP_ORDERS, noCouponCheckoutSet,
  SHIPS_NOTE, type IllegalCheckout, type StepKind,
} from './page-sets.ts';
import type { PageSet } from '../web/src/builder/types.ts';

/**
 * Checkout parts, as a shopper meets them (spec 2026-09-30-checkout-parts §12, §13):
 * the checkout rearranged and in every legal step order, the default arrangement's request payloads, a
 * removed coupon or notes part never sending a saved value, an illegal document serving the default
 * checkout, and no horizontal overflow at 360 px under every template. All
 * against the mocked backend; nothing leaves the dev server.
 */

const NAME = 'Alpine Extract 10ml';
const NOTE = 'Please leave it with the neighbour';
const LAYOUTS: Layout[] = ['storefront', 'menu', 'webapp'];
const WIDTHS = [390, 1280] as const;

interface OpenOptions {
  width?: number;
  /** Signed in (the default) or a guest, who needs the shop's guest checkout on and a local cart. */
  guest?: boolean;
  telegram?: boolean;
  tweakSettings?: InstallMocksOptions['tweakSettings'];
  /** localStorage keys seeded once, before the app boots. */
  seed?: Record<string, unknown>;
  /** What the collection-point search answers with (see InstallMocksOptions.servicePoints). */
  servicePoints?: InstallMocksOptions['servicePoints'];
  tweakOrderDetail?: InstallMocksOptions['tweakOrderDetail'];
}

const LINE = {
  productId: 101, displayName: NAME, sku: 'ALP-10', unitPrice: 42.5, basePrice: 42.5, pricingTiers: [], quantity: 1,
  isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
};

/** One line of product 101 on the server (signed in) or in the local cart (guest). */
async function seedCart(page: Page, mocks: MockHandle, guest: boolean): Promise<void> {
  if (guest) {
    await page.addInitScript((line) => {
      if (!window.localStorage.getItem('sf-cart-v1')) window.localStorage.setItem('sf-cart-v1', JSON.stringify({ state: { lines: [line] }, version: 0 }));
    }, LINE);
    return;
  }
  mocks.state.cart = {
    items: [{
      productId: 101, name: NAME, quantity: 1, unitPrice: 42.5, lineTotal: 42.5, imageUrl: null, isPreorder: false, outOfStock: false, priceChanged: false,
      inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null,
    }],
    subtotal: 42.5, itemCount: 1,
  };
}

/** Counts every Turnstile token the (shimmed) widget hands out: the shim's own counter is private. */
const COUNT_MINTS = `
  (function () {
    window.__mints = [];
    var real;
    Object.defineProperty(window, 'turnstile', {
      configurable: true,
      get: function () { return real; },
      set: function (v) {
        var render = v.render;
        v.render = function (el, params) {
          if (params && typeof params.callback === 'function') {
            var cb = params.callback;
            params = Object.assign({}, params, { callback: function (t) { window.__mints.push(t); cb(t); } });
          }
          return render.call(this, el, params);
        };
        real = v;
      },
    });
  })();
`;
const mints = (page: Page) => page.evaluate(() => (window as unknown as { __mints: string[] }).__mints);

interface Opened { mocks: MockHandle; logs: string[] }

/** Opens `path` with the page set installed for `layout`; collects the console's builder / checkout messages. */
async function open(page: Page, layout: Layout, set: PageSet | null, path: string, o: OpenOptions = {}): Promise<Opened> {
  const width = o.width ?? 1280;
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.clock.setFixedTime(FIXED_NOW);
  const logs: string[] = [];
  page.on('console', (m) => { if (/^\[(builder|checkout)\]/.test(m.text())) logs.push(`${m.type()}: ${m.text()}`); });
  if (o.telegram) await installTelegramStub(page);
  await page.addInitScript(COUNT_MINTS);
  const mocks = await installMocks(page, {
    layout,
    session: !o.guest && !o.telegram,
    pages: { [layout]: set },
    servicePoints: o.servicePoints,
    tweakOrderDetail: o.tweakOrderDetail,
    tweakSettings: (s) => { if (o.guest) s.features.guestCheckout = true; o.tweakSettings?.(s); },
  });
  if (o.seed) {
    await page.addInitScript((seed) => {
      for (const [k, v] of Object.entries(seed)) if (!window.localStorage.getItem(k)) window.localStorage.setItem(k, JSON.stringify(v));
    }, o.seed);
  }
  if (path.startsWith('/checkout')) await seedCart(page, mocks, !!o.guest);
  await page.goto(path);
  return { mocks, logs };
}

// ---- the checkout, walked --------------------------------------------------------------------------

const HEADING: Record<StepKind, string | RegExp> = {
  contact: 'Your details', address: 'Delivery address', shipping: 'Delivery and discounts', payment: /How you.ll pay/, review: 'Review your order',
};

interface Walk {
  order: StepKind[];
  advance?: () => Promise<void>;
  /** Apply this code from wherever the coupon part is (the aside), before the steps. */
  coupon?: string;
  notes?: string;
  /** Expect the owner's RichText and Heading around the Delivery fields. */
  content?: boolean;
}

/** Fills the five steps in `order` and stops on Review (the shopper's own button, or the Mini App's). */
async function walk(page: Page, w: Walk): Promise<void> {
  const advance = w.advance ?? (() => page.getByRole('button', { name: 'Continue' }).click());
  if (w.coupon) {
    const box = page.getByRole('textbox', { name: 'Coupon code' }).locator('visible=true').first();
    await box.fill(w.coupon);
    await page.getByRole('button', { name: 'Apply' }).locator('visible=true').first().click();
    await expect(page.getByText(w.coupon, { exact: true }).first()).toBeVisible();
  }
  for (const kind of w.order) {
    await expect(page.getByRole('heading', { name: HEADING[kind] })).toBeVisible();
    if (kind === 'contact') {
      await page.getByRole('textbox', { name: 'First name' }).fill('Ada');
      await page.getByRole('textbox', { name: 'Surname' }).fill('Sterling');
      await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.invalid');
    } else if (kind === 'address') {
      await expect(page.getByRole('combobox', { name: 'Country' })).toHaveValue('GB');
      await page.getByRole('textbox', { name: 'Address line 1' }).fill('14 Kirkgate');
      await page.getByRole('textbox', { name: 'Town / City' }).fill('Leeds');
      await page.getByRole('textbox', { name: 'Postcode' }).fill('LS1 6BY');
    } else if (kind === 'shipping') {
      await expect(page.getByText('Tracked 24')).toBeVisible();
      if (w.content) {
        await expect(page.getByText(SHIPS_NOTE)).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Tracked and insured' })).toBeVisible();
      }
      await page.getByText('Tracked 24').click();
    } else if (kind === 'payment') {
      await page.locator('label').filter({ hasText: 'Crypto' }).first().click();
      await page.locator('label').filter({ hasText: 'USDT' }).first().click();
      if (w.notes) await page.getByRole('textbox', { name: /Order notes/ }).fill(w.notes);
    } else if (kind === 'review') {
      break;
    }
    await advance();
  }
  await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
  await expect(page.getByText('ada@example.invalid')).toBeVisible();
  await expect(page.getByText('USDT on Polygon')).toBeVisible();
}

/** Where placing an order leaves a shopper: the account order page when signed in, the thank-you page for a guest. */
const AFTER_ORDER = { account: /\/account\/orders\/E2E1$/, guest: /\/order-placed\?order=E2E1$/ };

async function placeOrder(page: Page, after: keyof typeof AFTER_ORDER, via?: () => Promise<void>): Promise<void> {
  if (via) await via();
  else await page.getByRole('button', { name: /^Place order/ }).click();
  await expect(page).toHaveURL(AFTER_ORDER[after]);
}

/** What the existing checkout e2e (storefront.spec.ts) asserts of the posted order: v0.7.0's behaviour. */
const BASE_BODY = {
  shippingOptionId: 11, paymentMethod: 'crypto_static', coin: 'usdt', network: 'polygon', email: 'ada@example.invalid',
  shippingAddress: { firstName: 'Ada', surname: 'Sterling', addressLine1: '14 Kirkgate', city: 'Leeds', zip: 'LS1 6BY', country: 'GB' },
};

/**
 * A guest's quote is debounced (300 ms) and mints a token of its own, and the Place order button is down while it does.
 * Picking the shipping option starts that run, and the walk reaches Review well inside a second: a click landing in the
 * gap before it starts is answered by an error, and one landing as it starts hits a disabled button and does nothing.
 * So wait for the quote priced for the pick to be asked for and finished, as a shopper would see the button come back.
 */
async function guestQuoteSettled(page: Page, mocks: MockHandle): Promise<void> {
  await expect.poll(() => mocks.state.guestQuotes.some((q) => q.shippingOptionId === 11)).toBe(true);
  await expect(page.getByText('Verifying')).toHaveCount(0);
}

/** The cart is spent and the saved checkout form is gone. */
async function expectSpent(page: Page): Promise<void> {
  const left = await page.evaluate(() => ({
    cart: JSON.parse(window.localStorage.getItem('sf-cart-v1') ?? '{"state":{"lines":[]}}').state.lines.length as number,
    form: window.localStorage.getItem('sf-checkout-v1'),
  }));
  expect(left).toEqual({ cart: 0, form: null });
}

// 1 — default arrangement: v0.7.0's request payloads --------------------------------------------------

test.describe('checkout · the default arrangement sends what v0.7.0 sent', () => {
  for (const layout of LAYOUTS) {
    test(`${layout} · signed in: the order, and the requests, equal the no-page-set checkout`, async ({ page, browser }) => {
      const first = await open(page, layout, defaultCheckoutSet(layout), '/checkout', { width: 390 });
      await walk(page, { order: LEGAL_STEP_ORDERS[0]! });
      await placeOrder(page, 'account');
      await expectSpent(page);
      expect(first.mocks.state.checkouts).toHaveLength(1);
      expect(first.mocks.state.checkouts[0]).toMatchObject(BASE_BODY);
      // Nothing was asked of the code or the notes: the keys are simply absent.
      expect(Object.keys(first.mocks.state.checkouts[0]!)).not.toEqual(expect.arrayContaining(['couponCode']));
      expect(first.mocks.state.checkouts[0]!.notes).toBeUndefined();
      expect(first.mocks.state.checkouts[0]!.couponCode).toBeUndefined();
      expect(first.logs).toEqual([]);

      // The same flow with no published page set at all (the built-in default).
      const ctx = await browser.newContext();
      try {
        const p2 = await ctx.newPage();
        const second = await open(p2, layout, null, '/checkout', { width: 390 });
        await walk(p2, { order: LEGAL_STEP_ORDERS[0]! });
        await placeOrder(p2, 'account');
        expect(second.mocks.state.checkouts[0]).toEqual(first.mocks.state.checkouts[0]);
        expect(second.mocks.state.quotes).toEqual(first.mocks.state.quotes);
      } finally {
        await ctx.close();
      }
    });

    test(`${layout} · guest: one token per request, the order carries the guest body`, async ({ page }) => {
      const { mocks } = await open(page, layout, defaultCheckoutSet(layout), '/checkout', { width: 390, guest: true });
      await expect(page.getByRole('heading', { name: 'Guest checkout', level: 1 })).toBeVisible();
      await walk(page, { order: LEGAL_STEP_ORDERS[0]! });
      await guestQuoteSettled(page, mocks);
      await placeOrder(page, 'guest');
      await expectSpent(page);
      expect(mocks.state.checkouts).toHaveLength(1);
      const body = mocks.state.checkouts[0]!;
      expect(body).toMatchObject({ ...BASE_BODY, items: [{ productId: 101, quantity: 1 }] });
      expect(String(body.turnstileToken)).toMatch(/^e2e-turnstile-token-/);
      expect(body.couponCode).toBeUndefined();
      expect(body.notes).toBeUndefined();
      const used = [...mocks.state.guestQuotes.map((q) => q.turnstileToken), body.turnstileToken];
      expect(new Set(used).size).toBe(used.length);
      // One mint per guest request: no token is minted that no request carries.
      expect((await mints(page)).length).toBe(used.length);
      for (const q of mocks.state.guestQuotes) expect(q.couponCode).toBeUndefined();
    });
  }
});

test.describe('checkout · the contact and address form', () => {
  test('prefix-only phone, the shop\'s countries, country-aware labels, line 3 on the order', async ({ page }) => {
    const { mocks } = await open(page, 'storefront', null, '/checkout', {
      tweakSettings: (s) => { s.shipping = { countries: ['GB', 'IE', 'US'] }; },
    });
    const next = () => page.getByRole('button', { name: 'Continue' }).click();

    // Contact: the closed picker shows the prefix alone.
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    await expect(page.locator('[data-phone-code]')).toHaveText('+44');
    await page.getByRole('textbox', { name: 'First name' }).fill('Ada');
    await page.getByRole('textbox', { name: 'Surname' }).fill('Sterling');
    await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.invalid');
    await page.getByRole('textbox', { name: 'Phone' }).fill('07801 123456');
    await next();

    // Address: three countries, and the wording follows the one chosen.
    await expect(page.getByRole('heading', { name: 'Delivery address' })).toBeVisible();
    const country = page.getByRole('combobox', { name: 'Country' });
    await expect(country.locator('option:not([value=""])')).toHaveCount(3);
    await country.selectOption('US');
    await expect(page.getByRole('textbox', { name: 'ZIP code' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'State' })).toBeVisible();
    await country.selectOption('GB');
    await page.getByRole('textbox', { name: 'Address line 1' }).fill('14 Kirkgate');
    await page.getByRole('textbox', { name: 'Address line 3' }).fill('Flat 2');
    await page.getByRole('textbox', { name: 'Town / City' }).fill('Leeds');
    await page.getByRole('textbox', { name: 'Postcode' }).fill('LS1 6BY');
    await next();

    await page.getByText('Tracked 24').click();
    await next();
    await page.locator('label').filter({ hasText: 'Crypto' }).first().click();
    await page.locator('label').filter({ hasText: 'USDT' }).first().click();
    await next();

    // Review reads the phone back without the trunk zero and shows the third line.
    await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
    await expect(page.getByText('+447801123456')).toBeVisible();
    await expect(page.getByText('Flat 2')).toBeVisible();

    await placeOrder(page, 'account');
    const body = mocks.state.checkouts[0]!;
    expect(body.shippingAddress).toMatchObject({ addressLine1: '14 Kirkgate', addressLine3: 'Flat 2', city: 'Leeds', zip: 'LS1 6BY', country: 'GB' });
    // What is sent is unchanged: the backend strips the zero.
    expect(body.phone).toBe('+4407801123456');
  });
});

// 4 — collection points ------------------------------------------------------------------------------------

test.describe('checkout · collection points', () => {
  const withCollection = (s: Parameters<NonNullable<OpenOptions['tweakSettings']>>[0]) => {
    s.shipping = { countries: ['GB'], collectionCountries: ['GB'] };
  };
  const next = (page: Page) => page.getByRole('button', { name: 'Continue' }).click();

  async function fillContact(page: Page, phone: string | null) {
    await page.getByRole('textbox', { name: 'First name' }).fill('Ada');
    await page.getByRole('textbox', { name: 'Surname' }).fill('Sterling');
    await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.invalid');
    if (phone) await page.getByRole('textbox', { name: 'Phone' }).fill(phone);
  }

  /** Shipping, Payment and on to Review, from the step after the address. */
  async function toReview(page: Page) {
    await page.getByText('Tracked 24').click();
    await next(page);
    await page.locator('label').filter({ hasText: 'Crypto' }).first().click();
    await page.locator('label').filter({ hasText: 'USDT' }).first().click();
    await next(page);
  }

  /** The Home address / Collection point switch: click its visible segment, as a shopper does. */
  async function switchTo(page: Page, method: 'Home address' | 'Collection point') {
    await page.locator('label').filter({ hasText: new RegExp(`^${method}$`) }).click();
    await expect(page.getByRole('radio', { name: method })).toBeChecked();
  }

  /** Choosing a point swaps the list for the summary, so the proof is the summary naming it. */
  async function choosePoint(page: Page, name: string) {
    await page.locator('label').filter({ hasText: name }).click();
    await expect(page.locator('[data-point-summary]')).toContainText(name);
  }

  async function searchAndChoose(page: Page, postcode: string, name: string) {
    await switchTo(page, 'Collection point');
    await page.getByRole('textbox', { name: 'Postcode' }).fill(postcode);
    await page.getByRole('button', { name: 'Search' }).click();
    await choosePoint(page, name);
  }

  test('a signed-in shopper collects from a point: quote, order body, review', async ({ page }) => {
    const { mocks } = await open(page, 'storefront', null, '/checkout', { tweakSettings: withCollection });
    await fillContact(page, '07801 123456');
    await next(page);

    await expect(page.getByRole('heading', { name: 'Delivery address' })).toBeVisible();
    await switchTo(page, 'Collection point');
    await expect(page.getByRole('textbox', { name: 'Address line 1' })).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Postcode' }).fill('LS1 6BY');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('radio', { name: /Northbound Locker A/ })).toBeVisible();
    await expect(page.getByText('4 collection points found')).toBeVisible();
    await choosePoint(page, 'Corner News');
    await expect(page.getByText('Your collection point')).toBeVisible();
    await next(page);

    await toReview(page);
    await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
    await expect(page.getByText('Collect from')).toBeVisible();
    await expect(page.getByText('Corner News')).toBeVisible();

    await placeOrder(page, 'account');
    expect(mocks.state.servicePointSearches).toEqual([{ country: 'GB', postalCode: 'LS1 6BY' }]);
    await expect.poll(() => mocks.state.quotes.at(-1)).toMatchObject({ country: 'GB', deliveryMethod: 'collection', servicePointCarrier: 'evri' });
    expect(mocks.state.checkouts[0]!.shippingAddress).toEqual({
      firstName: 'Ada', surname: 'Sterling', addressLine1: 'Vicar Lane 2', addressLine2: null, addressLine3: null,
      city: 'Leeds', county: null, zip: 'LS1 7JH', country: 'GB',
      servicePointId: '9002', servicePointCarrier: 'evri', servicePointName: 'Corner News',
    });
  });

  test('a point with no street is sent by its name', async ({ page }) => {
    const { mocks } = await open(page, 'storefront', null, '/checkout', { tweakSettings: withCollection });
    await fillContact(page, '07801 123456');
    await next(page);
    await searchAndChoose(page, 'LS1 6BY', 'Quayside Parcel Box');
    await next(page);
    await toReview(page);
    await expect(page.getByText('Collect from')).toBeVisible();
    await placeOrder(page, 'account');
    expect(mocks.state.checkouts[0]!.shippingAddress).toMatchObject({
      addressLine1: 'Quayside Parcel Box', city: 'Leeds', zip: 'LS1 5AB', country: 'GB',
      servicePointId: '9004', servicePointCarrier: 'evri', servicePointName: 'Quayside Parcel Box',
    });
  });

  test('Change then Keep leaves the point as it was; Change then another point replaces it', async ({ page }) => {
    const { mocks } = await open(page, 'storefront', null, '/checkout', { tweakSettings: withCollection });
    await fillContact(page, '07801 123456');
    await next(page);
    await searchAndChoose(page, 'LS1 6BY', 'Corner News');

    await page.getByRole('button', { name: 'Change' }).click();
    await page.getByRole('button', { name: 'Keep Corner News' }).click();
    await expect(page.locator('[data-point-summary]')).toContainText('Corner News');
    await expect(page.getByRole('button', { name: 'Keep Corner News' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Change' }).click();
    await page.getByRole('button', { name: 'Search' }).click();
    await choosePoint(page, 'Northbound Locker A');
    await expect(page.locator('[data-point-summary]')).not.toContainText('Corner News');
    await next(page);
    await toReview(page);
    await expect(page.getByText('Northbound Locker A')).toBeVisible();
    await placeOrder(page, 'account');
    expect(mocks.state.checkouts[0]!.shippingAddress).toMatchObject({
      addressLine1: 'Kirkgate 14', servicePointId: '9001', servicePointCarrier: 'inpost', servicePointName: 'Northbound Locker A',
    });
    await expect.poll(() => mocks.state.quotes.at(-1)).toMatchObject({ deliveryMethod: 'collection', servicePointCarrier: 'inpost' });
  });

  test('switching back to home restores the address and sends no point', async ({ page }) => {
    const { mocks } = await open(page, 'storefront', null, '/checkout', { tweakSettings: withCollection });
    await fillContact(page, null);
    await next(page);
    await page.getByRole('textbox', { name: 'Address line 1' }).fill('14 Kirkgate');
    await page.getByRole('textbox', { name: 'Town / City' }).fill('Leeds');
    await page.getByRole('textbox', { name: 'Postcode' }).fill('LS1 6BY');
    await switchTo(page, 'Collection point');
    await expect(page.getByRole('textbox', { name: 'Postcode' })).toHaveValue('LS1 6BY');
    await switchTo(page, 'Home address');
    await expect(page.getByRole('textbox', { name: 'Address line 1' })).toHaveValue('14 Kirkgate');
    await next(page);
    await toReview(page);
    await placeOrder(page, 'account');
    expect(mocks.state.checkouts[0]).toMatchObject(BASE_BODY);
    expect(Object.keys(mocks.state.checkouts[0]!.shippingAddress as object)).not.toEqual(expect.arrayContaining(['servicePointId']));
    for (const q of mocks.state.quotes) expect(Object.keys(q)).not.toEqual(expect.arrayContaining(['deliveryMethod']));
  });

  test('collection needs a phone: placing sends the shopper back to their details', async ({ page }) => {
    await open(page, 'storefront', null, '/checkout', { tweakSettings: withCollection });
    await fillContact(page, null);
    await next(page);
    await searchAndChoose(page, 'LS1', 'Northbound Locker A');
    await next(page);
    await toReview(page);
    await page.getByRole('button', { name: /^Place order/ }).click();
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    await expect(page.getByText('Required')).toBeVisible();
  });

  test('a guest can collect', async ({ page }) => {
    const { mocks } = await open(page, 'storefront', null, '/checkout', { guest: true, tweakSettings: withCollection });
    await fillContact(page, '07801 123456');
    await next(page);
    await searchAndChoose(page, 'LS1 6BY', 'Northbound Locker A');
    await next(page);
    await toReview(page);
    // The guest quote is debounced and mints a token of its own: let the one priced for this point land before placing.
    await expect.poll(() => mocks.state.guestQuotes.some((q) => q.deliveryMethod === 'collection' && q.shippingOptionId === 11)).toBe(true);
    await expect(page.getByText('Verifying')).toHaveCount(0);
    await placeOrder(page, 'guest');
    expect(mocks.state.checkouts[0]!.shippingAddress).toMatchObject({ servicePointId: '9001', servicePointCarrier: 'inpost' });
    expect(mocks.state.guestQuotes.at(-1)).toMatchObject({ deliveryMethod: 'collection', servicePointCarrier: 'inpost' });
  });

  test('a failed search says so', async ({ page }) => {
    await open(page, 'storefront', null, '/checkout', { tweakSettings: withCollection, servicePoints: 502 });
    await fillContact(page, '07801 123456');
    await next(page);
    await switchTo(page, 'Collection point');
    await page.getByRole('textbox', { name: 'Postcode' }).fill('LS1 6BY');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('We couldn\'t load collection points. Please try again.')).toBeVisible();
  });

  test('a country that is collection only has no switch, says why, and shows the picker', async ({ page }) => {
    await open(page, 'storefront', null, '/checkout', {
      tweakSettings: (s) => { s.shipping = { countries: ['IE'], collectionCountries: ['GB'] }; },
    });
    await fillContact(page, '07801 123456');
    await next(page);
    await expect(page.getByRole('heading', { name: 'Delivery address' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Country' })).toHaveValue('GB');
    await expect(page.getByRole('radio', { name: 'Collection point' })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Home address' })).toHaveCount(0);
    await expect(page.getByText('Orders to United Kingdom are delivered to a collection point.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Address line 1' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Search' })).toBeVisible();
  });

  test('the account order page says where to collect from', async ({ page }) => {
    await open(page, 'storefront', null, '/account/orders/K4M2QP', {
      tweakOrderDetail: (d) => { d.servicePoint = { name: 'Corner News', carrier: 'evri' }; },
    });
    await expect(page.getByRole('heading', { name: 'Items' })).toBeVisible();
    await expect(page.getByText('Collect from Corner News')).toBeVisible();
  });

  test('an account order with no collection point has no Collect from line', async ({ page }) => {
    await open(page, 'storefront', null, '/account/orders/K4M2QP');
    await expect(page.getByRole('heading', { name: 'Items' })).toBeVisible();
    await expect(page.getByText('Collect from')).toHaveCount(0);
  });
});

// 1 — rearranged: storefront, menu and web app, at a phone and a desktop width -------------------------

test.describe('checkout · rearranged, end to end', () => {
  for (const layout of LAYOUTS) {
    for (const width of WIDTHS) {
      test(`${layout} · ${width}px · signed in: address first, coupon in the aside, notes after Payment, owner blocks around Delivery`, async ({ page }) => {
        const { mocks, logs } = await open(page, layout, arrangedCheckoutSet(layout), '/checkout', { width });
        // The progress bar is hidden below 992 px and drawn from there up.
        const stepper = page.locator('[data-sf-part="stepper"]');
        if (width < 992) await expect(stepper).toBeHidden();
        else await expect(stepper).toBeVisible();
        // Address is the first step now.
        await expect(page.getByRole('heading', { name: HEADING.address })).toBeVisible();
        await expect(page.getByRole('heading', { name: HEADING.contact })).toHaveCount(0);

        await walk(page, { order: LEGAL_STEP_ORDERS[1]!, coupon: COUPON_CODE, notes: NOTE, content: true });
        await placeOrder(page, 'account');
        await expectSpent(page);

        expect(mocks.state.checkouts).toHaveLength(1);
        expect(mocks.state.checkouts[0]).toMatchObject({ ...BASE_BODY, couponCode: COUPON_CODE, notes: NOTE });
        expect(mocks.state.quotes.some((q) => q.couponCode === COUPON_CODE)).toBe(true);
        expect(logs).toEqual([]);
      });
    }
  }

  for (const layout of LAYOUTS) {
    test(`${layout} · 390px · guest: same arrangement, a token per request, coupon and notes sent`, async ({ page }) => {
      const { mocks } = await open(page, layout, arrangedCheckoutSet(layout), '/checkout', { width: 390, guest: true });
      await walk(page, { order: LEGAL_STEP_ORDERS[1]!, coupon: COUPON_CODE, notes: NOTE, content: true });
      await guestQuoteSettled(page, mocks);
      await placeOrder(page, 'guest');
      await expectSpent(page);
      expect(mocks.state.checkouts).toHaveLength(1);
      const body = mocks.state.checkouts[0]!;
      expect(body).toMatchObject({ ...BASE_BODY, couponCode: COUPON_CODE, notes: NOTE, items: [{ productId: 101, quantity: 1 }] });
      expect(mocks.state.guestQuotes.some((q) => q.couponCode === COUPON_CODE)).toBe(true);
      const used = [...mocks.state.guestQuotes.map((q) => q.turnstileToken), body.turnstileToken];
      expect(new Set(used).size).toBe(used.length);
      expect((await mints(page)).length).toBe(used.length);
    });
  }
});

// 1 — inside Telegram ------------------------------------------------------------------------------------

type Tg = { calls: unknown[][]; main: { text: string; isVisible: boolean } };
const tg = (page: Page) => page.evaluate(() => (window as unknown as { __tg: Tg }).__tg);
const mainText = async (page: Page) => (await tg(page)).main.text;
const clickMain = (page: Page) => page.evaluate(() => (window as unknown as { __tg: { clickMain(): void } }).__tg.clickMain());

test.describe('checkout · inside Telegram', () => {
  for (const [name, set] of [['rearranged', arrangedCheckoutSet('webapp')], ['default', defaultCheckoutSet('webapp')]] as const) {
    test(`${name}: MainButton is Continue on every step (no band of its own), then Place order with the total`, async ({ page }) => {
      const arranged = name === 'rearranged';
      const { mocks } = await open(page, 'webapp', set, '/checkout', { width: 390, telegram: true });
      await expect.poll(() => mocks.state.webappLogins.length).toBe(1);
      await expect.poll(() => mainText(page)).toBe('Continue');
      // The first step has no Continue band of its own: the MainButton is it.
      await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
      const order = arranged ? LEGAL_STEP_ORDERS[1]! : LEGAL_STEP_ORDERS[0]!;
      await walk(page, { order, coupon: arranged ? COUPON_CODE : undefined, notes: arranged ? NOTE : undefined, content: arranged, advance: () => clickMain(page) });
      await expect.poll(() => mainText(page)).toMatch(/^Place order/);
      await expect(page.getByRole('button', { name: /^Place order/ })).toHaveCount(0);
      expect(await mainText(page)).toContain(arranged ? '41.78' : '46.03');
      await clickMain(page);
      await expect(page).toHaveURL(AFTER_ORDER.account);
      expect(mocks.state.checkouts).toHaveLength(1);
      expect(mocks.state.checkouts[0]).toMatchObject(arranged ? { ...BASE_BODY, couponCode: COUPON_CODE, notes: NOTE } : BASE_BODY);
      expect(((await tg(page)).calls.filter((c) => c[0] === 'haptic.notify')).map((c) => c[1])).toContain('success');
    });
  }
});

// 3 — every legal step order, and a document with an illegal one --------------------------------------------

test.describe('checkout · step orders', () => {
  for (const order of LEGAL_STEP_ORDERS) {
    test(`${order.join(' · ')}: each step shows in turn and the order is placed`, async ({ page }) => {
      const { mocks, logs } = await open(page, 'storefront', arrangedCheckoutSet('storefront', order), '/checkout');
      await expect(page.getByRole('heading', { name: HEADING[order[0]!] })).toBeVisible();
      // The stepper (drawn at 1280) lists the steps in the stored order.
      const labels: Record<StepKind, string> = { contact: 'Contact', address: 'Address', shipping: 'Shipping', payment: 'Payment', review: 'Review' };
      await expect(page.locator('[data-sf-part="stepper"]')).toHaveText(new RegExp(order.map((k) => labels[k]).join('[\\s\\S]*')));
      await walk(page, { order, coupon: COUPON_CODE, notes: NOTE, content: true });
      await placeOrder(page, 'account');
      expect(mocks.state.checkouts[0]).toMatchObject({ ...BASE_BODY, couponCode: COUPON_CODE, notes: NOTE });
      expect(logs).toEqual([]);
    });
  }

  const ILLEGAL: IllegalCheckout[] = ['payment-before-shipping', 'contact-after-review', 'coupon-in-contact', 'no-summary'];
  for (const kind of ILLEGAL) {
    test(`an illegal published document (${kind}) serves the default checkout, quietly`, async ({ page }) => {
      const { logs, mocks } = await open(page, 'storefront', illegalCheckoutSet('storefront', kind), '/checkout');
      // The default checkout: its heading, the five-step stepper, Contact first.
      await expect(page.getByRole('heading', { name: 'Checkout', level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { name: HEADING.contact })).toBeVisible();
      await expect(page.locator('[data-sf-part="stepper"]')).toHaveText(/Contact[\s\S]*Address[\s\S]*Shipping[\s\S]*Payment[\s\S]*Review/);
      await expect(page.locator('[data-sf-part="stepper"] [data-sf-part="stepper"], [data-sf-part="stepper"]')).toHaveCount(1);
      // Nothing shopper-visible: no error text, no banner naming the guard.
      await expect(page.getByText(/rendering the default|breaks part-|legal/i)).toHaveCount(0);
      // The guard says so once on the console (the builder's one line); the checkout's own fallback never fires.
      expect(logs.filter((l) => l.startsWith('error: [builder] "checkout"'))).toHaveLength(1);
      expect(logs.filter((l) => l.includes('[checkout]'))).toEqual([]);
      // And it is a working checkout, in the default order.
      await walk(page, { order: LEGAL_STEP_ORDERS[0]! });
      await placeOrder(page, 'account');
      expect(mocks.state.checkouts[0]).toMatchObject(BASE_BODY);
    });
  }
});

// 2 — a removed coupon or notes part ignores what the shopper saved ---------------------------------------------

const SAVED = { 'sf-checkout-v1': { couponCode: COUPON_CODE, notes: 'Saved note from a previous visit' } };

test.describe('checkout · removed coupon and notes parts', () => {
  test('signed in: a saved code and note are never sent (quote or order); with the parts back, both are', async ({ page, browser }) => {
    const gone = await open(page, 'storefront', noCouponCheckoutSet('storefront'), '/checkout', { seed: SAVED });
    await walk(page, { order: LEGAL_STEP_ORDERS[0]! });
    // No coupon row anywhere on a checkout without the part.
    await expect(page.getByRole('textbox', { name: 'Coupon code' })).toHaveCount(0);
    await placeOrder(page, 'account');
    expect(gone.mocks.state.quotes.length).toBeGreaterThan(0);
    for (const q of gone.mocks.state.quotes) expect(q.couponCode, JSON.stringify(q)).toBeUndefined();
    expect(gone.mocks.state.checkouts[0]).toMatchObject(BASE_BODY);
    expect(gone.mocks.state.checkouts[0]!.couponCode).toBeUndefined();
    expect(gone.mocks.state.checkouts[0]!.notes).toBeUndefined();

    // Control: the same saved values, the parts present again.
    const ctx = await browser.newContext();
    try {
      const p2 = await ctx.newPage();
      const back = await open(p2, 'storefront', noCouponCheckoutSet('storefront', { coupon: true, notes: true }), '/checkout', { seed: SAVED });
      await walk(p2, { order: LEGAL_STEP_ORDERS[0]! });
      await placeOrder(p2, 'account');
      expect(back.mocks.state.quotes.some((q) => q.couponCode === COUPON_CODE)).toBe(true);
      expect(back.mocks.state.checkouts[0]).toMatchObject({ ...BASE_BODY, couponCode: COUPON_CODE, notes: 'Saved note from a previous visit' });
    } finally {
      await ctx.close();
    }
  });

  test('guest: the same, and exactly one Turnstile mint per guest request', async ({ page, browser }) => {
    const gone = await open(page, 'storefront', noCouponCheckoutSet('storefront'), '/checkout', { guest: true, seed: SAVED });
    await walk(page, { order: LEGAL_STEP_ORDERS[0]! });
    await placeOrder(page, 'guest');
    expect(gone.mocks.state.guestQuotes.length).toBeGreaterThan(0);
    for (const q of gone.mocks.state.guestQuotes) expect(q.couponCode, JSON.stringify(q)).toBeUndefined();
    const body = gone.mocks.state.checkouts[0]!;
    expect(body).toMatchObject(BASE_BODY);
    expect(body.couponCode).toBeUndefined();
    expect(body.notes).toBeUndefined();
    const used = [...gone.mocks.state.guestQuotes.map((q) => q.turnstileToken), body.turnstileToken];
    expect(new Set(used).size).toBe(used.length);
    // Hiding the saved code from the quote means the quote key never moved: one mint per request, none spare.
    expect((await mints(page)).length).toBe(used.length);

    const ctx = await browser.newContext();
    try {
      const p2 = await ctx.newPage();
      const back = await open(p2, 'storefront', noCouponCheckoutSet('storefront', { coupon: true, notes: true }), '/checkout', { guest: true, seed: SAVED });
      await walk(p2, { order: LEGAL_STEP_ORDERS[0]! });
      await placeOrder(p2, 'guest');
      expect(back.mocks.state.guestQuotes.some((q) => q.couponCode === COUPON_CODE)).toBe(true);
      expect(back.mocks.state.checkouts[0]).toMatchObject({ ...BASE_BODY, couponCode: COUPON_CODE, notes: 'Saved note from a previous visit' });
      const used2 = [...back.mocks.state.guestQuotes.map((q) => q.turnstileToken), back.mocks.state.checkouts[0]!.turnstileToken];
      expect(new Set(used2).size).toBe(used2.length);
      expect((await mints(p2)).length).toBe(used2.length);
    } finally {
      await ctx.close();
    }
  });
});

// 6 — no horizontal overflow at 360 px under every template ---------------------------------------------------------

const TEMPLATES = [
  { template: 'modern', preset: 'default' },
  { template: 'dark-luxury', preset: 'gold' },
  { template: 'cyber-brutalism', preset: 'acid-dark' },
  { template: 'cyber-brutalism', preset: 'purple-light' },
  { template: 'bento', preset: 'tech-dark' },
  { template: 'bento', preset: 'fashion-light' },
];

test('every template in the catalog is covered by the checkout overflow matrix', async ({ page }) => {
  const res = await page.request.get('/templates.json');
  const ids = ((await res.json()) as { templates: Array<{ id: string }> }).templates.map((t) => t.id);
  expect(ids.filter((id) => !TEMPLATES.some((t) => t.template === id))).toEqual([]);
});

const overflow = (page: Page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));

for (const t of TEMPLATES) {
  for (const layout of ['storefront', 'menu', 'webapp'] as const) {
    test(`${t.template}/${t.preset} · ${layout} · rearranged checkout steps 1-5 at 360px have no horizontal overflow`, async ({ page }) => {
      const failures: string[] = [];
      const measure = async (where: string) => {
        await page.waitForTimeout(250);
        const o = await overflow(page);
        if (o.sw > o.w) failures.push(`${layout} ${where}: scrollWidth ${o.sw} > ${o.w}`);
      };
      await page.setViewportSize({ width: 360, height: 800 });
      await page.clock.setFixedTime(FIXED_NOW);
      const mocks = await installMocks(page, {
        layout, session: true, pages: { [layout]: arrangedCheckoutSet(layout) }, tweakSettings: await presetTheme(page, t.template, t.preset),
      });
      await seedCart(page, mocks, false);
      await page.goto('/checkout');
      await expect(page.locator('html')).toHaveAttribute('data-sf-template', t.template);
      // Steps 1-5, measured on each: the coupon in the aside and the notes on Payment are in play throughout.
      const order = LEGAL_STEP_ORDERS[1]!;
      const advance = () => page.getByRole('button', { name: 'Continue' }).click();
      for (const [i, kind] of order.entries()) {
        await expect(page.getByRole('heading', { name: HEADING[kind] })).toBeVisible();
        await measure(`checkout step ${i + 1} (${kind})`);
        if (kind === 'contact') {
          await page.getByRole('textbox', { name: 'First name' }).fill('Ada');
          await page.getByRole('textbox', { name: 'Surname' }).fill('Sterling');
          await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.invalid');
        } else if (kind === 'address') {
          await page.getByRole('textbox', { name: 'Address line 1' }).fill('14 Kirkgate');
          await page.getByRole('textbox', { name: 'Town / City' }).fill('Leeds');
          await page.getByRole('textbox', { name: 'Postcode' }).fill('LS1 6BY');
        } else if (kind === 'shipping') {
          await page.getByText('Tracked 24').click();
        } else if (kind === 'payment') {
          await page.locator('label').filter({ hasText: 'Crypto' }).first().click();
          await page.locator('label').filter({ hasText: 'USDT' }).first().click();
          await page.getByRole('textbox', { name: /Order notes/ }).fill(NOTE);
        }
        if (kind !== 'review') await advance();
      }
      expect(failures).toEqual([]);

      expect(failures).toEqual([]);
    });
  }
}
