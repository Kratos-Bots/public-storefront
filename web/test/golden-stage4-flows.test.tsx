import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef, useEffect, useImperativeHandle, type ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { TrackingLookup, TrackedParcel } from '@/types/tracking.ts';
import type { ComponentData, DocKey } from '@/builder/types.ts';
import { RenderDoc } from '@/builder/render.tsx';
import { validateDoc } from '@/builder/guard.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';

const state = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  /** Turnstile hands over a token synchronously on mount, or never. */
  token: false,
  lookup: (() => new Promise(() => {})) as () => Promise<unknown>,
  verify: (() => new Promise(() => {})) as () => Promise<unknown>,
}));

vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings as unknown as StorefrontSettings }));
vi.mock('@marsidev/react-turnstile', async () => ({
  Turnstile: forwardRef<{ reset: () => void }, { onSuccess?: (token: string) => void }>(function FakeTurnstile(props, ref) {
    useImperativeHandle(ref, () => ({ reset: () => {} }));
    useEffect(() => { if (state.token) props.onSuccess?.('tok'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
  }),
}));
vi.mock('@/api/tracking.ts', async (orig) => ({
  ...(await orig<typeof import('@/api/tracking.ts')>()),
  lookupTracking: () => state.lookup(),
}));
vi.mock('@/api/verify.ts', () => ({ verifyProductUnit: () => state.verify() }));

import { TrackingLookupError } from '@/api/tracking.ts';
import { ApiError } from '@/lib/errors.ts';
import { LoginPage } from '@/features/auth/LoginPage.tsx';
import { PaymentSuccessPage } from '@/features/payment-redirect/PaymentSuccessPage.tsx';
import { PaymentCancelPage } from '@/features/payment-redirect/PaymentCancelPage.tsx';
import { OrderPlacedPage } from '@/features/payment-redirect/OrderPlacedPage.tsx';
import { TrackingPage } from '@/features/tracking/TrackingPage.tsx';
import { VerifyPage } from '@/features/verify/VerifyPage.tsx';
import { useSessionStore } from '@/stores/session.ts';
import { useTelegramAuthStore } from '@/stores/telegram.ts';
import { useCartStore } from '@/stores/cart.ts';
import { saveOrder } from '@/stores/saved-orders.ts';
import { expectStage4, mountAt, mountDefault, mountDoc, type Mounted } from './helpers/stage4-golden.tsx';

const NOW = Date.parse('2026-07-07T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

type Links = { whatsapp: string | null; telegram: string | null };
const NO_LINKS: Links = { whatsapp: null, telegram: null };
const LINKS: Links = { whatsapp: 'https://wa.me/447700900000', telegram: 'https://t.me/northbound_bot' };

interface SettingsOpts {
  links?: Links; siteKey?: string | null;
  whatsapp?: boolean; telegramBot?: string | null; password?: boolean;
}
function useSettingsState(o: SettingsOpts = {}) {
  state.settings = {
    currency: 'GBP', enabled: true, supportLinks: [], notices: [], features: {},
    brand: { name: 'Northbound Supply', shortName: 'Northbound', title: 'Northbound Supply', tagline: null, links: o.links ?? NO_LINKS },
    turnstile: o.siteKey === null ? undefined : { siteKey: o.siteKey ?? 'site-key' },
    login: {
      whatsapp: { available: o.whatsapp ?? true, number: '447700900000' },
      telegram: { available: !!o.telegramBot, botUsername: o.telegramBot ?? null },
      ...(o.password ? { password: { available: true } } : {}),
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  useSettingsState();
  state.token = false;
  state.lookup = () => new Promise(() => {});
  state.verify = () => new Promise(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  useSessionStore.setState({ token: null, customer: null, returnTo: null });
  useTelegramAuthStore.setState({ status: 'none', error: null });
  useCartStore.setState({ lines: [], mode: 'local' });
});

/** Lazy blocks resolve a tick or two after mount: wait until the markup stops changing. */
async function settle(m: Mounted): Promise<string> {
  let prev = '';
  for (let i = 0; i < 80; i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 15)); });
    const cur = m.container.innerHTML;
    if (cur !== '' && cur === prev) return cur;
    prev = cur;
  }
  throw new Error('stage4 flows harness: the render never settled');
}

interface Surface {
  docKey: DocKey;
  block: string;
  entry: () => ReactNode;
  /** The Route pattern (default `*`). */
  route?: string;
}

/**
 * Entry component, default document and a stored v0.7.0-shaped document (the block with
 * only its id) must agree on one golden. `drive` runs after each mount (typing, submitting).
 */
async function threeWays(s: Surface, name: string, path: string, drive?: (m: Mounted) => Promise<void> | void): Promise<void> {
  const stored: ComponentData = { type: s.block, props: { id: `${s.block}-default` } };
  const mounts: (() => Mounted)[] = [
    () => mountAt(s.entry(), { path, route: s.route }),
    () => mountDefault(s.docKey, 'storefront', { path, route: s.route }),
    () => mountDoc(s.docKey, 'storefront', [stored], { path, route: s.route }),
  ];
  for (const mount of mounts) {
    const m = mount();
    if (drive) await drive(m);
    expectStage4(name, await settle(m));
    cleanup();
  }
}

/** A router with a stub at the redirect target; `ui` is the page under test. */
function mountRoutes(ui: ReactNode, entry: string, routes: Record<string, string>) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider env="test">
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/*" element={ui} />
            {Object.entries(routes).map(([path, label]) => <Route key={path} path={path} element={<p>{label}</p>} />)}
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

function mountGuardedRoutes(docKey: DocKey, entry: string, routes: Record<string, string>) {
  const guarded = validateDoc(defaultDoc(docKey, 'storefront'), docKey, 'storefront');
  if (!guarded.doc) throw new Error('flows harness: the default document was rejected');
  return mountRoutes(<RenderDoc doc={guarded.doc} docKey={docKey} layout="storefront" />, entry, routes);
}

// ---------------------------------------------------------------- login

const LOGIN: Surface = { docKey: 'login', block: 'LoginOptions', entry: () => <LoginPage /> };

describe('stage 4 login goldens (v0.7.0)', () => {
  const CASES: { name: string; opts: SettingsOpts; path?: string }[] = [
    { name: 'all-methods', opts: { whatsapp: true, telegramBot: 'northbound_bot', password: true } },
    { name: 'whatsapp-and-telegram', opts: { whatsapp: true, telegramBot: 'northbound_bot' } },
    { name: 'only-whatsapp', opts: { whatsapp: true } },
    { name: 'only-telegram', opts: { whatsapp: false, telegramBot: 'northbound_bot' } },
    { name: 'only-email', opts: { whatsapp: false, password: true } },
    { name: 'no-methods', opts: { whatsapp: false } },
    { name: 'no-methods-with-links', opts: { whatsapp: false, links: LINKS } },
    { name: 'return-to', opts: { whatsapp: true }, path: '/login?returnTo=%2Fcheckout' },
  ];
  it.each(CASES)('login-$name', async (c) => {
    useSettingsState(c.opts);
    await threeWays(LOGIN, `login-${c.name}`, c.path ?? '/login');
  });

  it.each([
    { name: 'telegram-error-detail', status: 'failed' as const, error: 'bad hash' },
    { name: 'telegram-error-bare', status: 'failed' as const, error: null },
    { name: 'telegram-pending', status: 'pending' as const, error: null },
  ])('login-$name', async (c) => {
    useTelegramAuthStore.setState({ status: c.status, error: c.error });
    await threeWays(LOGIN, `login-${c.name}`, '/login');
  });

  it.each([
    { label: 'the default landing', entry: '/login', target: 'ACCOUNT STUB', parked: null },
    { label: 'the requested return path', entry: '/login?returnTo=%2Fcheckout', target: 'CHECKOUT STUB', parked: null },
    { label: 'the parked return path', entry: '/login', target: 'CHECKOUT STUB', parked: '/checkout' },
    { label: 'the default landing for an off-site return path', entry: '/login?returnTo=https%3A%2F%2Fevil.example', target: 'ACCOUNT STUB', parked: null },
  ])('signed in: redirects to $label (no golden)', async ({ entry, target, parked }) => {
    useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Sam' }, returnTo: parked });
    const stubs = { '/account': 'ACCOUNT STUB', '/checkout': 'CHECKOUT STUB' };
    mountRoutes(<LoginPage />, entry, stubs);
    expect(screen.getByText(target)).toBeInTheDocument();
    cleanup();
    useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Sam' }, returnTo: parked });
    mountGuardedRoutes('login', entry, stubs);
    // The block is lazy, so the redirect lands a tick later.
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(screen.getByText(target)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------- payment pages

const SUCCESS: Surface = { docKey: 'payment-success', block: 'PaymentSuccess', entry: () => <PaymentSuccessPage /> };
const CANCEL: Surface = { docKey: 'payment-cancel', block: 'PaymentCancel', entry: () => <PaymentCancelPage /> };
const PLACED: Surface = { docKey: 'order-placed', block: 'OrderPlaced', entry: () => <OrderPlacedPage /> };

describe('stage 4 payment page goldens (v0.7.0)', () => {
  it('payment-success-reference', async () => {
    await threeWays(SUCCESS, 'payment-success-reference', '/payment/success?order=NB-1001');
  });
  it('payment-success-reference-chat-links', async () => {
    useSettingsState({ links: LINKS });
    await threeWays(SUCCESS, 'payment-success-reference-chat-links', '/payment/success?order=NB-1001');
  });
  it('payment-success-missing-reference', async () => {
    await threeWays(SUCCESS, 'payment-success-missing-reference', '/payment/success');
  });
  it('payment-success: a saved order hands off to its page (no golden)', async () => {
    saveOrder('NB-1001', 'key-1');
    const stubs = { '/order/:ref/:accessKey': 'ORDER PAGE STUB' };
    mountRoutes(<PaymentSuccessPage />, '/payment/success?order=NB-1001', stubs);
    expect(screen.getByText('ORDER PAGE STUB')).toBeInTheDocument();
    cleanup();
    mountGuardedRoutes('payment-success', '/payment/success?order=NB-1001', stubs);
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(screen.getByText('ORDER PAGE STUB')).toBeInTheDocument();
  });

  it('payment-cancel-saved-order', async () => {
    saveOrder('NB-1002', 'key-2');
    await threeWays(CANCEL, 'payment-cancel-saved-order', '/payment/cancel?order=NB-1002');
  });
  it('payment-cancel-no-saved-order', async () => {
    await threeWays(CANCEL, 'payment-cancel-no-saved-order', '/payment/cancel?order=NB-1002');
  });
  it('payment-cancel-no-reference', async () => {
    await threeWays(CANCEL, 'payment-cancel-no-reference', '/payment/cancel');
  });
  it('payment-cancel-chat-links', async () => {
    useSettingsState({ links: LINKS });
    await threeWays(CANCEL, 'payment-cancel-chat-links', '/payment/cancel?order=NB-1002');
  });

  it('order-placed-chat-links', async () => {
    useSettingsState({ links: LINKS });
    await threeWays(PLACED, 'order-placed-chat-links', '/order-placed?order=NB-1003');
  });
  it('order-placed-whatsapp-only', async () => {
    useSettingsState({ links: { whatsapp: LINKS.whatsapp, telegram: null } });
    await threeWays(PLACED, 'order-placed-whatsapp-only', '/order-placed?order=NB-1003');
  });
  it('order-placed-telegram-only', async () => {
    useSettingsState({ links: { whatsapp: null, telegram: LINKS.telegram } });
    await threeWays(PLACED, 'order-placed-telegram-only', '/order-placed?order=NB-1003');
  });
  it('order-placed-warning', async () => {
    await threeWays(PLACED, 'order-placed-warning', '/order-placed?order=NB-1003&warning=1');
  });
  it('order-placed-warning-chat-links', async () => {
    useSettingsState({ links: LINKS });
    await threeWays(PLACED, 'order-placed-warning-chat-links', '/order-placed?order=NB-1003&warning=1');
  });
  it('order-placed-no-chat-links', async () => {
    await threeWays(PLACED, 'order-placed-no-chat-links', '/order-placed?order=NB-1003');
  });
  it('order-placed-missing-reference', async () => {
    await threeWays(PLACED, 'order-placed-missing-reference', '/order-placed');
  });
});

// ---------------------------------------------------------------- tracking

const TRACKING: Surface = { docKey: 'tracking', block: 'TrackingLookup', entry: () => <TrackingPage />, route: '/tracking/:reference?' };

const evt = (code: string, text: string, msAgo: number | null, place: string | null = null) => ({ occurredAt: msAgo === null ? null : ago(msAgo), place, code, text });
const parcel = (n: number, status: string, events: ReturnType<typeof evt>[], over: Partial<TrackedParcel> = {}): TrackedParcel => ({
  trackingNumber: `NBTRK${n}00123`, shipmentStatus: status === 'DELIVERED' ? 'delivered' : 'in_transit', shippedAt: ago(5 * DAY), deliveredAt: status === 'DELIVERED' ? ago(DAY) : null,
  fallbackDescription: null,
  tracking: {
    outcome: 'ok', status, courierNumber: `CR${n}77`, destination: { code: 'GB', name: 'United Kingdom' },
    lastEventAt: events[0]?.occurredAt ?? null, deliveredAt: status === 'DELIVERED' ? ago(DAY) : null, events,
    lastMile: { name: 'Northbound Post', url: 'https://post.example/track' }, lastMileNumber: `LM${n}55`, checkedAt: ago(30 * MIN), errorCode: null,
  },
  ...over,
});
const TRANSIT_EVENTS = [
  evt('HANDED_TO_LAST_MILE', 'Handed to the local carrier', 3 * 60 * MIN, 'London'),
  evt('CUSTOMS_CLEARED', 'Cleared customs', 20 * 60 * MIN, 'London'),
  evt('FLIGHT_DEPARTED', 'Flight departed', 2 * DAY),
  evt('PICKED_UP', 'Picked up', 4 * DAY, 'Leeds'),
  evt('INFO_RECEIVED', 'Label created', 5 * DAY),
];
const DELIVERED_EVENTS = [evt('DELIVERED', 'Delivered', DAY, 'London'), ...TRANSIT_EVENTS];
const order = (parcels: TrackedParcel[], over: Partial<TrackingLookup> = {}): TrackingLookup => ({
  reference: 'NB-1001', status: 'shipped', createdAt: ago(6 * DAY), itemCount: 3, isPreorder: false, parcels, trackingAvailable: true, checkedAt: ago(30 * MIN), ...over,
});

const FOUND_2 = order([parcel(1, 'IN_TRANSIT', TRANSIT_EVENTS), parcel(2, 'OUT_FOR_DELIVERY', TRANSIT_EVENTS.slice(0, 2))]);
const FOUND_1 = order([parcel(1, 'IN_TRANSIT', TRANSIT_EVENTS)]);

interface TrackingCase {
  name: string; path?: string; siteKey?: string | null; token?: boolean; links?: Links;
  lookup?: () => Promise<unknown>; blockedTimer?: boolean; saved?: boolean;
}
const ok = (d: TrackingLookup) => () => Promise.resolve(d);
const fail = (status: number) => () => Promise.reject(new TrackingLookupError(status, 'nope'));
const REF = '/tracking/nb-1001';

const TRACKING_CASES: TrackingCase[] = [
  { name: 'no-site-key', siteKey: null, path: '/tracking' },
  { name: 'no-site-key-with-links', siteKey: null, path: '/tracking', links: LINKS },
  { name: 'idle-form', path: '/tracking' },
  { name: 'idle-form-recent-orders', path: '/tracking', saved: true },
  { name: 'pending-awaiting-token', path: REF },
  { name: 'pending-verifying', path: REF, token: true },
  { name: 'blocked', path: REF, blockedTimer: true, links: LINKS },
  { name: 'error-500', path: REF, token: true, lookup: fail(500) },
  { name: 'error-403', path: REF, token: true, lookup: fail(403) },
  { name: 'error-network', path: REF, token: true, lookup: fail(0) },
  { name: 'error-503', path: REF, token: true, lookup: fail(503), links: LINKS },
  { name: 'error-429', path: REF, token: true, lookup: fail(429) },
  { name: 'error-422', path: REF, token: true, lookup: fail(422) },
  { name: 'not-found', path: REF, token: true, lookup: fail(404) },
  { name: 'not-found-with-links', path: REF, token: true, lookup: fail(404), links: LINKS },
  { name: 'found-2-parcels', path: REF, token: true, lookup: ok(FOUND_2) },
  { name: 'found-1-parcel', path: REF, token: true, lookup: ok(FOUND_1) },
  { name: 'found-1-parcel-delivered', path: REF, token: true, lookup: ok(order([parcel(1, 'DELIVERED', DELIVERED_EVENTS)], { status: 'delivered' })) },
  { name: 'found-1-parcel-returned', path: REF, token: true, lookup: ok(order([parcel(1, 'RETURNED', [evt('RETURNED', 'Returned to sender', DAY), ...TRANSIT_EVENTS])], { status: 'shipped' })) },
  { name: 'found-1-parcel-lookup-failed', path: REF, token: true, lookup: ok(order([parcel(1, 'IN_TRANSIT', [], { tracking: { ...parcel(1, 'IN_TRANSIT', []).tracking!, outcome: 'error', status: null, errorCode: 'upstream' } })])) },
  { name: 'found-1-parcel-fallback-no-tracking', path: REF, token: true, lookup: ok(order([parcel(1, 'IN_TRANSIT', [], { tracking: null, fallbackDescription: 'Two boxes, hand delivered' })])) },
  { name: 'nothing-shipped', path: REF, token: true, lookup: ok(order([], { status: 'processing', checkedAt: null })), links: LINKS },
  { name: 'nothing-shipped-preorder', path: REF, token: true, lookup: ok(order([], { status: 'processing', isPreorder: true, checkedAt: null })) },
  { name: 'nothing-shipped-cancelled', path: REF, token: true, lookup: ok(order([], { status: 'cancelled', checkedAt: null })) },
  { name: 'degraded-notice', path: REF, token: true, lookup: ok(order([parcel(1, 'IN_TRANSIT', TRANSIT_EVENTS), parcel(2, 'IN_TRANSIT', TRANSIT_EVENTS)], { trackingAvailable: false })) },
  { name: 'refresh-shown-ready', path: REF, token: true, lookup: ok(FOUND_2) },
  { name: 'refresh-shown-cooldown', path: REF, token: true, lookup: ok(order(FOUND_2.parcels, { checkedAt: ago(2 * MIN) })) },
  { name: 'refresh-shown-never-checked', path: REF, token: true, lookup: ok(order(FOUND_2.parcels, { checkedAt: null })) },
  { name: 'refresh-hidden-all-delivered', path: REF, token: true, lookup: ok(order([parcel(1, 'DELIVERED', DELIVERED_EVENTS), parcel(2, 'DELIVERED', DELIVERED_EVENTS)], { status: 'delivered' })) },
  { name: 'refresh-hidden-degraded', path: REF, token: true, lookup: ok(order(FOUND_2.parcels, { trackingAvailable: false })) },
  { name: 'refresh-hidden-nothing-shipped', path: REF, token: true, lookup: ok(order([], { status: 'processing' })) },
];

describe('stage 4 tracking goldens (v0.7.0)', () => {
  it.each(TRACKING_CASES)('tracking-$name', async (c) => {
    useSettingsState({ siteKey: c.siteKey, links: c.links });
    state.token = c.token ?? false;
    state.lookup = c.lookup ?? (() => new Promise(() => {}));
    if (c.saved) { saveOrder('NB-1001', 'key-1'); saveOrder('NB-1002', 'key-2'); }
    if (c.blockedTimer) {
      // The 15 s token wait would stall the suite: shorten exactly that timer.
      const real = window.setTimeout.bind(window);
      vi.spyOn(window, 'setTimeout').mockImplementation(((fn: TimerHandler, ms?: number, ...a: unknown[]) =>
        real(fn, ms === 15_000 ? 1 : ms, ...a)) as typeof window.setTimeout);
    }
    await threeWays(TRACKING, `tracking-${c.name}`, c.path ?? '/tracking');
  });
});

// ---------------------------------------------------------------- verify

const VERIFY: Surface = { docKey: 'verify', block: 'VerifyForm', entry: () => <VerifyPage /> };

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fill = (code = 'NB3D-SKU12', auth = '123456') => {
  type(/verification code/i, code);
  type(/authentication code/i, auth);
};
const submit = async () => {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /verify product|checking/i })); });
};
const verified = (expiry: string) => () => Promise.resolve({ status: 'verified', data: { createdAt: '2026-01-15T12:00:00.000Z', expiryDate: expiry } });

describe('stage 4 verify goldens (v0.7.0)', () => {
  const run = (name: string, drive?: (m: Mounted) => Promise<void> | void) => threeWays(VERIFY, `verify-${name}`, '/verify', drive);

  it('verify-form', () => run('form'));
  it('verify-form-chat-links', () => { useSettingsState({ links: LINKS }); return run('form-chat-links'); });
  it('verify-errors-both-empty', () => run('errors-both-empty', submit));
  it('verify-errors-auth-not-digits', () => run('errors-auth-not-digits', async () => { fill('NB3D-SKU12', '12ab'); await submit(); }));
  it('verify-errors-code-empty', () => run('errors-code-empty', async () => { type(/authentication code/i, '123456'); await submit(); }));
  it('verify-pending', () => run('pending', async () => { fill(); await submit(); }));
  it('verify-authentic', () => {
    state.verify = verified('2027-01-15T12:00:00.000Z');
    return run('authentic', async () => { fill(); await submit(); });
  });
  it('verify-expired', () => {
    state.verify = verified('2026-02-15T12:00:00.000Z');
    return run('expired', async () => { fill(); await submit(); });
  });
  it('verify-not-verified', () => {
    state.verify = () => Promise.resolve({ status: 'invalid' });
    useSettingsState({ links: LINKS });
    return run('not-verified', async () => { fill(); await submit(); });
  });
  it('verify-error', () => {
    state.verify = () => Promise.reject(new ApiError(0, 'Network error'));
    return run('error', async () => { fill(); await submit(); });
  });
  it('verify-edit-after-verdict-drops-it', async () => {
    state.verify = () => Promise.resolve({ status: 'invalid' });
    await run('edit-after-verdict-drops-it', async () => {
      fill();
      await submit();
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(screen.getByText(/not verified/i)).toBeInTheDocument();
      type(/verification code/i, 'NB3D-SKU13');
      expect(screen.queryByText(/not verified/i)).toBeNull();
    });
  });
  it('verify-edit-after-authentic-drops-it', async () => {
    state.verify = verified('2027-01-15T12:00:00.000Z');
    await run('edit-after-authentic-drops-it', async () => {
      fill();
      await submit();
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(screen.getByText(/authentic product/i)).toBeInTheDocument();
      type(/authentication code/i, '654321');
      expect(screen.queryByText(/authentic product/i)).toBeNull();
    });
  });
});
