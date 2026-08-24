import { readFileSync } from 'node:fs';
import type { Page, Route } from '@playwright/test';
import type { Catalog, Product } from '../web/src/types/catalog.ts';
import type { CheckoutResult, PaymentMethod, Quote } from '../web/src/types/checkout.ts';
import type { ServerCart, ServerCartLine, CartLineInput } from '../web/src/types/cart.ts';
import type { OrderDetail, OrderSummary, PageMeta } from '../web/src/types/orders.ts';
import type { Profile, RedeemOptions } from '../web/src/types/profile.ts';
import type { PublicOrder, SelectPaymentResult } from '../web/src/types/public-order.ts';
import type { StorefrontSettings } from '../web/src/types/settings.ts';
import type { TrackingLookup } from '../web/src/types/tracking.ts';
import type { LoginResult, WhatsappStart } from '../web/src/types/auth.ts';

/** The dev server the suite starts (see playwright.config.ts). Route globs are
 *  anchored to it: a bare `**\/api\/**` also matches Vite's own module URLs
 *  (`/src/api/cart.ts`) and kills the boot. */
export const ORIGIN = 'http://localhost:5199';

export const ORDER_REF = 'E2E1';
export const ORDER_KEY = 'KEY1';
export const ORDER_PATH = `/order/${ORDER_REF}/${ORDER_KEY}`;

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(fileUrl(`./fixtures/${name}`), 'utf8')) as T;

function fileUrl(relative: string): URL {
  return new URL(relative, import.meta.url);
}

interface ProfileFixture {
  profile: Profile;
  redeemOptions: RedeemOptions;
  orders: OrderSummary[];
  orderDetail: OrderDetail;
}

interface TrackingFixture {
  lookup: TrackingLookup;
  verification: { createdAt: string; expiryDate: string };
}

const TURNSTILE_SHIM = readFileSync(fileUrl('./turnstile-shim.js'), 'utf8');

/** 1×1 fully transparent PNG: every `<img>` loads cleanly (no broken-image
 *  branch) and the well's own plate shows through, which is what a catalogue
 *  with no photo on file looks like. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=',
  'base64',
);

export type Layout = 'storefront' | 'menu';

export interface InstallMocksOptions {
  /** Which settings fixture to serve. Ignored when `settings` is given outright. */
  layout?: Layout;
  settings?: StorefrontSettings;
  catalog?: Catalog;
  quote?: Quote;
  order?: PublicOrder;
  profile?: Profile;
  /** Seed `sf-session-v1` so the app boots signed in. */
  session?: boolean;
  /** Mutate the settings fixture before it is served (flags, theme, kill switch). */
  tweakSettings?: (settings: StorefrontSettings) => void;
}

export interface MockState {
  settings: StorefrontSettings;
  catalog: Catalog;
  quote: Quote;
  order: PublicOrder;
  profile: Profile;
  redeemOptions: RedeemOptions;
  orders: OrderSummary[];
  orderDetail: OrderDetail;
  tracking: TrackingLookup;
  verification: { createdAt: string; expiryDate: string };
  cart: ServerCart;
  /** Kill switch: everything but the order routes answers 503 STOREFRONT_DISABLED. */
  disabled: boolean;
  /** How many times the login attempt has been polled — pending ×2, then completed. */
  attemptPolls: number;
  /** Every API path the page has asked for, in order. */
  requests: string[];
  /** Bodies posted to the checkout routes, for assertions. */
  checkouts: Array<Record<string, unknown>>;
  /** Bodies posted to the guest quote route, for assertions. */
  guestQuotes: Array<Record<string, unknown>>;
  /** Bodies posted to the crypto-txid route, for assertions. */
  txids: Array<Record<string, unknown>>;
}

export interface MockHandle {
  state: MockState;
  /** Flip the shop off mid-session, exactly as the backend's kill switch does:
   *  settings answers `enabled: false` and every non-order route 503s. */
  closeShop: () => void;
  /** API paths seen so far (without the `/api/` prefix). */
  requests: () => string[];
}

export const SESSION_TOKEN = 'e2e-session-token';
export const SESSION_CUSTOMER = { id: 4242, nickname: 'Ada' };

const PENDING_POLLS = 2;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Mirrors the backend/`resolveUnitPrice`: highest `minQuantity` ≤ quantity wins. */
function unitPriceFor(product: Product, quantity: number): number {
  const tier = [...product.pricingTiers]
    .sort((a, b) => b.minQuantity - a.minQuantity)
    .find((t) => quantity >= t.minQuantity);
  return tier ? tier.price : product.price;
}

function buildCart(items: CartLineInput[], catalog: Catalog): ServerCart {
  const lines: ServerCartLine[] = [];
  for (const item of items) {
    const product = catalog.products.find((p) => p.id === item.productId);
    if (!product || item.quantity <= 0) continue;
    const unitPrice = unitPriceFor(product, item.quantity);
    lines.push({
      productId: product.id,
      name: product.displayName,
      quantity: item.quantity,
      unitPrice,
      lineTotal: Math.round(unitPrice * item.quantity * 100) / 100,
      imageUrl: null,
      isPreorder: product.isPreorder,
      outOfStock: !product.inStock && !product.isPreorder,
      priceChanged: false,
      inactive: !product.isActive,
    });
  }
  return {
    items: lines,
    subtotal: Math.round(lines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
  };
}

function maskTxid(txid: string): string {
  const t = txid.trim();
  return t.length > 14 ? `${t.slice(0, 6)}…${t.slice(-6)}` : t;
}

async function envelope(route: Route, data: unknown, meta?: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(meta === undefined ? { success: true, data, error: null } : { success: true, data, error: null, meta }),
  });
}

async function fail(route: Route, status: number, error: string): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, data: null, error }),
  });
}

function body(route: Route): Record<string, unknown> {
  try {
    return (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Every network call the app can make, answered from fixtures. No backend, no
 * Worker: `installMocks` must be awaited before the first navigation, because
 * the session seed is an init script and the settings fetch is the app's very
 * first request.
 */
export async function installMocks(page: Page, options: InstallMocksOptions = {}): Promise<MockHandle> {
  const layout = options.layout ?? 'storefront';
  const profileFixture = read<ProfileFixture>('profile.json');
  const trackingFixture = read<TrackingFixture>('tracking.json');

  const state: MockState = {
    settings: options.settings ?? read<StorefrontSettings>(`settings.${layout}.json`),
    catalog: options.catalog ?? read<Catalog>('catalog.json'),
    quote: options.quote ?? read<Quote>('quote.json'),
    order: options.order ?? read<PublicOrder>('public-order.json'),
    profile: options.profile ?? clone(profileFixture.profile),
    redeemOptions: clone(profileFixture.redeemOptions),
    orders: clone(profileFixture.orders),
    orderDetail: clone(profileFixture.orderDetail),
    tracking: clone(trackingFixture.lookup),
    verification: clone(trackingFixture.verification),
    cart: { items: [], subtotal: 0, itemCount: 0 },
    disabled: false,
    attemptPolls: 0,
    requests: [],
    checkouts: [],
    guestQuotes: [],
    txids: [],
  };

  options.tweakSettings?.(state.settings);
  state.disabled = !state.settings.enabled;

  if (options.session) {
    await page.addInitScript(
      (seed: { token: string; customer: { id: number; nickname: string } }) => {
        window.localStorage.setItem(
          'sf-session-v1',
          JSON.stringify({ state: { token: seed.token, customer: seed.customer }, version: 0 }),
        );
      },
      { token: SESSION_TOKEN, customer: SESSION_CUSTOMER },
    );
  }

  // Nothing outside the dev server and the (shimmed) challenge script should
  // ever be reached — a real request would hang the run.
  await page.route(/^https?:\/\/(?!localhost:5199|challenges\.cloudflare\.com)/, (route) =>
    route.abort(),
  );

  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: TURNSTILE_SHIM }),
  );

  await page.route(`${ORIGIN}/media/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    // No branding logo on file, so the header falls back to the wordmark.
    if (path.startsWith('/media/settings/branding/')) {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL_PNG });
  });

  await page.route(`${ORIGIN}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\//, '');
    const method = route.request().method();
    state.requests.push(`${method} ${path}`);

    // The kill switch: the order link's own routes stay up, everything else 503s.
    if (state.disabled && path !== 'storefront/settings' && !path.startsWith('orders/')) {
      await fail(route, 503, 'STOREFRONT_DISABLED');
      return;
    }

    if (path === 'storefront/settings' && method === 'GET') {
      await envelope(route, state.settings);
      return;
    }

    if (path === 'catalog' && method === 'GET') {
      await envelope(route, state.catalog);
      return;
    }

    const product = /^catalog\/products\/(\d+)$/.exec(path);
    if (product && method === 'GET') {
      const found = state.catalog.products.find((p) => p.id === Number(product[1]));
      if (!found) {
        await fail(route, 404, 'Product not found');
        return;
      }
      await envelope(route, found);
      return;
    }

    if (path === 'storefront/cart') {
      if (method === 'GET') {
        await envelope(route, state.cart);
        return;
      }
      if (method === 'PUT') {
        const items = (body(route).items ?? []) as CartLineInput[];
        state.cart = buildCart(items, state.catalog);
        await envelope(route, state.cart);
        return;
      }
      if (method === 'DELETE') {
        state.cart = { items: [], subtotal: 0, itemCount: 0 };
        await envelope(route, state.cart);
        return;
      }
    }

    if ((path === 'storefront/checkout/quote' || path === 'storefront/checkout/guest/quote') && method === 'POST') {
      if (path.includes('guest')) state.guestQuotes.push(body(route));
      await envelope(route, state.quote);
      return;
    }

    if ((path === 'storefront/checkout' || path === 'storefront/checkout/guest') && method === 'POST') {
      state.checkouts.push(body(route));
      const result: CheckoutResult = {
        reference: ORDER_REF,
        publicUrl: `${ORIGIN}${ORDER_PATH}`,
        status: 'pending',
        total: 46.03,
        payment: {
          type: 'crypto',
          paymentId: 9001,
          method: 'crypto_static',
          coin: 'usdt',
          network: 'polygon',
          coinLabel: 'USDT',
          networkLabel: 'Polygon',
          address: '0xE2E1a2b3c4d5e6f7089aabbccddeeff0011223344',
          coinAmount: '46.030000',
          fiatAmount: 46.03,
          qrData: 'polygon:0xE2E1a2b3c4d5e6f7089aabbccddeeff0011223344?amount=46.03',
          walletLinks: [],
        },
      };
      await envelope(route, result);
      return;
    }

    const publicOrder = /^orders\/([^/]+)\/([^/]+)(?:\/(.+))?$/.exec(path);
    if (publicOrder) {
      const [, reference, key, tail] = publicOrder;
      if (reference !== ORDER_REF || key !== ORDER_KEY) {
        await fail(route, 404, 'Order not found');
        return;
      }
      if (!tail && method === 'GET') {
        await envelope(route, state.order);
        return;
      }
      if (tail === 'payment-options' && method === 'GET') {
        const methods: PaymentMethod[] = state.quote.paymentMethods;
        await envelope(route, methods);
        return;
      }
      if (tail === 'payment-method' && method === 'POST') {
        const selection = body(route);
        const result: SelectPaymentResult = {
          paymentId: 9002,
          method: String(selection.method ?? 'crypto_static'),
          kind: 'crypto',
          status: 'pending',
          checkoutUrl: null,
          crypto: {
            coin: String(selection.coin ?? 'usdt'),
            network: String(selection.network ?? 'polygon'),
            coinLabel: 'USDT',
            networkLabel: 'Polygon',
            address: '0xE2E1a2b3c4d5e6f7089aabbccddeeff0011223344',
            coinAmount: '46.030000',
            fiatAmount: 46.03,
            verificationStatus: 'pending',
          },
        };
        await envelope(route, result);
        return;
      }
      if (tail === 'crypto-txid' && method === 'POST') {
        const submitted = body(route);
        state.txids.push(submitted);
        const txid = String(submitted.txid ?? '');
        const payment = state.order.cryptoPayments?.[0];
        if (payment) {
          payment.verificationStatus = 'checking';
          payment.txidMasked = maskTxid(txid);
        }
        await envelope(route, { verificationStatus: 'checking' });
        return;
      }
    }

    if (path === 'storefront/orders' && method === 'GET') {
      const meta: PageMeta = {
        page: 1,
        limit: 10,
        totalItems: state.orders.length,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      };
      await envelope(route, state.orders, meta);
      return;
    }

    const orderDetail = /^storefront\/orders\/([^/]+)$/.exec(path);
    if (orderDetail && method === 'GET') {
      if (orderDetail[1] !== state.orderDetail.reference) {
        await fail(route, 404, 'Order not found');
        return;
      }
      await envelope(route, state.orderDetail);
      return;
    }

    if (path === 'storefront/profile' && method === 'GET') {
      await envelope(route, state.profile);
      return;
    }

    if (path === 'storefront/profile/redeem-options' && method === 'GET') {
      await envelope(route, state.redeemOptions);
      return;
    }

    if (path === 'storefront/profile/redeem' && method === 'POST') {
      await envelope(route, {
        pointsDeducted: 500,
        creditAwarded: 5,
        newPointsBalance: 740,
        newCreditBalance: 17.5,
      });
      return;
    }

    if (path === 'storefront/profile/referral-code' && method === 'POST') {
      await envelope(route, { referrerNickname: 'Bea' });
      return;
    }

    if (path === 'storefront/auth/whatsapp/start' && method === 'POST') {
      state.attemptPolls = 0;
      const start: WhatsappStart = {
        attemptId: 'attempt-e2e-1',
        attemptSecret: 'secret-e2e-1',
        code: 'NB-4417',
        waLink: 'https://wa.me/447700900123?text=NB-4417',
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      };
      await envelope(route, start);
      return;
    }

    if (/^storefront\/auth\/attempts\/[^/]+$/.test(path) && method === 'GET') {
      state.attemptPolls += 1;
      await envelope(route, {
        status: state.attemptPolls > PENDING_POLLS ? 'completed' : 'pending',
      });
      return;
    }

    if (path === 'storefront/auth/whatsapp/complete' && method === 'POST') {
      const result: LoginResult = { token: SESSION_TOKEN, customer: SESSION_CUSTOMER };
      await envelope(route, result);
      return;
    }

    if (path === 'storefront/auth/logout' && method === 'POST') {
      await envelope(route, null);
      return;
    }

    if (path === 'storefront/tracking' && method === 'POST') {
      const reference = String(body(route).reference ?? '');
      if (reference !== state.tracking.reference) {
        await fail(route, 404, 'Order not found');
        return;
      }
      await envelope(route, state.tracking);
      return;
    }

    const verify = /^verify\/([^/]+)\/(\d+)$/.exec(path);
    if (verify && method === 'GET') {
      if (verify[1] !== 'AB3D-SKU12' || verify[2] !== '123456') {
        await fail(route, 404, 'Not found');
        return;
      }
      await envelope(route, state.verification);
      return;
    }

    await fail(route, 404, `Unmocked route: ${method} ${path}`);
  });

  return {
    state,
    closeShop: () => {
      state.settings = { ...state.settings, enabled: false };
      state.disabled = true;
    },
    requests: () => [...state.requests],
  };
}
