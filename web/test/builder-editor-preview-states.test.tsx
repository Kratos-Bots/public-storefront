import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { Suspense, type ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';

vi.hoisted(() => { process.env.TZ = 'Europe/London'; });

const settings = vi.hoisted(() => ({
  // No Turnstile site key on purpose: the tracking preview must not need one.
  value: {
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [], turnstile: null,
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
    telegramWebApp: { mode: 'off' }, features: { layout: 'storefront', ordering: true, accounts: true },
  } as unknown,
}));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => settings.value as StorefrontSettings }));
vi.mock('@/app/layout.ts', () => ({ useEffectiveLayout: () => 'storefront' }));
vi.mock('@/api/orders.ts', async (orig) => ({ ...(await orig<typeof import('@/api/orders.ts')>()), fetchOrders: vi.fn(), fetchOrder: vi.fn() }));
vi.mock('@/api/profile.ts', async (orig) => ({ ...(await orig<typeof import('@/api/profile.ts')>()), fetchProfile: vi.fn(), fetchRedeemOptions: vi.fn() }));

import { fetchOrders } from '@/api/orders.ts';
import { fetchProfile, fetchRedeemOptions } from '@/api/profile.ts';
import { BuilderModeProvider, PREVIEW_STATE_IDS, usePreviewFixture, usePreviewState } from '@/builder/mode.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { PreviewStateControl, BLOCK_RULE_RE } from '@/builder/editor/EditorHeader.tsx';
import {
  containerOfDoc, PREVIEW_STATE_LABELS, previewFixturesFor, useEditorMode, type ContainerName,
} from '@/builder/editor/preview-states.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { OrdersPage } from '@/features/account/OrdersPage.tsx';
import { LoyaltyPage } from '@/features/account/LoyaltyPage.tsx';
import { ReferralsPage } from '@/features/account/ReferralsPage.tsx';
import { ProfilePage } from '@/features/account/ProfilePage.tsx';
import { TrackingPage } from '@/features/tracking/TrackingPage.tsx';
import { VerifyPage } from '@/features/verify/VerifyPage.tsx';
import type { LoyaltyPreview } from '@/builder/family-loyalty.ts';
import type { OrdersPreview } from '@/builder/family-orders.ts';
import type { PaymentPreview } from '@/builder/family-payment.ts';
import type { ProfilePreview } from '@/builder/family-profile.ts';
import type { ReferralsPreview } from '@/builder/family-referrals.ts';
import type { TrackingPreview } from '@/builder/family-tracking.ts';
import type { VerifyPreview } from '@/builder/family-verify.ts';

const CONTAINERS = Object.keys(PREVIEW_STATE_IDS) as ContainerName[];

function load(readOnly = false) {
  useEditorStore.getState().load({ layout: 'storefront', pageSet: { schemaVersion: 1, shell: defaultDoc('shell', 'storefront')!, pages: {} }, readOnly });
}

beforeEach(() => { load(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.mocked(fetchOrders).mockReset(); vi.mocked(fetchProfile).mockReset(); vi.mocked(fetchRedeemOptions).mockReset(); });

describe('labels and fixtures', () => {
  it('every state id has a label and a fixture, and nothing else does', () => {
    expect(Object.keys(PREVIEW_STATE_LABELS).sort()).toEqual([...CONTAINERS].sort());
    for (const c of CONTAINERS) {
      const ids = PREVIEW_STATE_IDS[c] as readonly string[];
      expect(PREVIEW_STATE_LABELS[c].map((o) => o.id), c).toEqual([...ids]);
      for (const o of PREVIEW_STATE_LABELS[c]) expect(o.label.length, `${c}/${o.id}`).toBeGreaterThan(0);
      for (const id of ids) expect(previewFixturesFor({ [c]: id })[c], `${c}/${id}`).toBeTruthy();
    }
    expect(Object.keys(previewFixturesFor({})).sort()).toEqual([...CONTAINERS].sort());
  });

  it('an unknown or missing pick falls back to the container default', () => {
    expect(previewFixturesFor({ OrdersList: 'nope' }).OrdersList).toEqual(previewFixturesFor({}).OrdersList);
    expect(previewFixturesFor({ __proto__: 'x' } as never)).toBeTruthy();
  });

  it('builds the declared shapes', () => {
    const NOW = new Date('2026-06-15T12:00:00Z');
    const f = (c: string, id: string) => previewFixturesFor({ [c]: id }, NOW)[c];
    const orders = f('OrdersList', 'orders') as OrdersPreview;
    expect(orders.rows.length).toBeGreaterThan(0);
    expect(orders.hasNextPage).toBe(false);
    expect((f('OrdersList', 'none') as OrdersPreview).rows).toEqual([]);
    expect((f('OrdersList', 'more') as OrdersPreview).hasNextPage).toBe(true);

    const rewards = f('Loyalty', 'rewards') as LoyaltyPreview;
    expect(rewards.profile.loyaltyPoints).toBeGreaterThan(0);
    expect(rewards.options.options.some((o) => o.affordable)).toBe(true);
    const none = f('Loyalty', 'no-points') as LoyaltyPreview;
    expect(none.profile.loyaltyPoints).toBe(0);
    expect(none.options.loyaltyPoints).toBe(0);
    expect(none.options.options.some((o) => o.affordable)).toBe(false);

    expect((f('Referrals', 'new') as ReferralsPreview).info.hasReferrer).toBe(false);
    expect((f('Referrals', 'referred') as ReferralsPreview).info.hasReferrer).toBe(true);

    const website = f('Profile', 'website') as ProfilePreview;
    expect(website.surface).toBe('website');
    expect(website.profile?.nickname).toBeTruthy();
    expect((f('Profile', 'webapp') as ProfilePreview).surface).toBe('webapp');

    expect((f('PaymentSuccess', 'reference') as PaymentPreview).orderRef).toBeTruthy();
    expect((f('PaymentSuccess', 'missing') as PaymentPreview).orderRef).toBeNull();
    expect(f('PaymentCancel', 'saved')).toMatchObject({ saved: true });
    expect(f('PaymentCancel', 'unsaved')).toMatchObject({ saved: false });
    expect((f('PaymentCancel', 'no-reference') as PaymentPreview).orderRef).toBeNull();
    const chat = f('OrderPlaced', 'chat') as PaymentPreview;
    expect(chat.whatsapp).toContain('wa.me');
    expect((f('OrderPlaced', 'warning') as PaymentPreview).warning).toBe(true);
    expect(f('OrderPlaced', 'no-chat')).toMatchObject({ whatsapp: null, telegram: null });
    expect((f('OrderPlaced', 'missing') as PaymentPreview).orderRef).toBeNull();

    expect((f('TrackingLookup', 'found-2') as TrackingPreview).data?.parcels).toHaveLength(2);
    expect((f('TrackingLookup', 'found-1') as TrackingPreview).data?.parcels).toHaveLength(1);
    expect((f('TrackingLookup', 'nothing-shipped') as TrackingPreview).data?.parcels).toHaveLength(0);
    expect(f('TrackingLookup', 'not-found')).toMatchObject({ phase: 'notFound' });
    expect(f('TrackingLookup', 'error')).toMatchObject({ phase: 'error' });
    expect(f('TrackingLookup', 'form')).toMatchObject({ phase: 'idle' });

    const authentic = f('VerifyForm', 'authentic') as VerifyPreview;
    const expired = f('VerifyForm', 'expired') as VerifyPreview;
    expect(Date.parse(authentic.result!.expiryDate)).toBeGreaterThan(NOW.getTime());
    expect(Date.parse(expired.result!.expiryDate)).toBeLessThan(NOW.getTime());
    expect(f('VerifyForm', 'not-verified')).toMatchObject({ status: 'not-verified' });
    expect(f('VerifyForm', 'error')).toMatchObject({ status: 'error' });
  });

  it('containerOfDoc maps the stateful documents only', () => {
    expect(containerOfDoc('account.orders', 'storefront')).toBe('OrdersList');
    expect(containerOfDoc('tracking', 'menu')).toBe('TrackingLookup');
    expect(containerOfDoc('verify', 'webapp')).toBe('VerifyForm');
    for (const k of ['catalog', 'cart', 'shell', 'checkout', 'product', 'card:tile', 'page:about', 'constructor'] as const) {
      expect(containerOfDoc(k as never, 'storefront'), k).toBeNull();
    }
  });
});

describe('Preview state control', () => {
  it('shows only on a document with a stateful container, and resets on a document change', () => {
    const { container } = render(<PreviewStateControl />);
    expect(container).toBeEmptyDOMElement(); // catalogue

    act(() => useEditorStore.getState().selectDoc('tracking'));
    const select = screen.getByRole('combobox', { name: 'Preview state' }) as HTMLSelectElement;
    expect(select.value).toBe('form');
    expect([...select.options].map((o) => o.text)).toContain('Found (2 parcels)');

    fireEvent.change(select, { target: { value: 'found-2' } });
    expect(useEditorStore.getState().previewStates).toEqual({ TrackingLookup: 'found-2' });
    expect((screen.getByRole('combobox', { name: 'Preview state' }) as HTMLSelectElement).value).toBe('found-2');

    act(() => useEditorStore.getState().selectDoc('verify'));
    expect(useEditorStore.getState().previewStates).toEqual({});
    expect((screen.getByRole('combobox', { name: 'Preview state' }) as HTMLSelectElement).value).toBe('form');

    act(() => useEditorStore.getState().selectDoc('cart'));
    expect(screen.queryByRole('combobox', { name: 'Preview state' })).toBeNull();
  });

  it('a new load resets the picks', () => {
    act(() => useEditorStore.getState().setPreviewState('OrdersList', 'none'));
    expect(useEditorStore.getState().previewStates).toEqual({ OrdersList: 'none' });
    load();
    expect(useEditorStore.getState().previewStates).toEqual({});
  });
});

describe('the mode the editor builds', () => {
  const Probe = ({ children }: { children: ReactNode }) => <>{children}</>;
  const wrap = (mode: ReturnType<typeof useEditorMode>) => ({ children }: { children: ReactNode }) => <BuilderModeProvider value={mode}><Probe>{children}</Probe></BuilderModeProvider>;

  it('carries the picked state and its fixture (also for the exact preview, which builds it the same way)', () => {
    act(() => useEditorStore.getState().setPreviewState('TrackingLookup', 'found-1'));
    const mode = renderHook(() => useEditorMode(false)).result.current;
    expect(mode.editing).toBe(false);
    expect(mode.previewStates).toMatchObject({ TrackingLookup: 'found-1', OrdersList: 'orders' });
    expect(mode.previewFixtures).toBeTruthy();
    const hooks = renderHook(() => [usePreviewState('TrackingLookup'), usePreviewFixture<TrackingPreview>('TrackingLookup')] as const, { wrapper: wrap(mode) });
    expect(hooks.result.current[0]).toBe('found-1');
    expect(hooks.result.current[1]?.data?.parcels).toHaveLength(1);
  });

  it('is memoised: the same picks give the same object', () => {
    const { result, rerender } = renderHook(() => useEditorMode(true));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('outside any provider (a shopper page, a plain PuckPage render) both hooks read null', () => {
    const hooks = renderHook(() => [usePreviewState('OrdersList'), usePreviewFixture('OrdersList'), usePreviewState('TrackingLookup'), usePreviewFixture('TrackingLookup')] as const);
    expect(hooks.result.current).toEqual([null, null, null, null]);
    // The same through a rendered component, as a block under a bare render sees them.
    function Seen() { return <i data-testid="seen">{String(usePreviewState('OrdersList'))}|{String(usePreviewFixture('OrdersList'))}</i>; }
    render(<Seen />);
    expect(screen.getByTestId('seen').textContent).toBe('null|null');
  });

  it('is the shopper view when read-only: no states, no fixtures, hooks read null', () => {
    load(true);
    const mode = renderHook(() => useEditorMode(false)).result.current;
    expect(mode.previewStates).toBeNull();
    expect(mode.previewFixtures).toBeNull();
    const hooks = renderHook(() => [usePreviewState('OrdersList'), usePreviewFixture('OrdersList')] as const, { wrapper: wrap(mode) });
    expect(hooks.result.current).toEqual([null, null]);
  });
});

function Shell({ children, mode }: { children: ReactNode; mode: ReturnType<typeof useEditorMode> }) {
  return (
    <MantineProvider env="test">
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/tracking/nb0977']}>
          <BuilderModeProvider value={mode}><Suspense fallback={null}>{children}</Suspense></BuilderModeProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>
  );
}
const modeFor = (container: ContainerName, id: string) => {
  const picks = { [container]: id };
  return { editing: true, previewAs: null, previewStates: picks, previewFixtures: previewFixturesFor(picks) };
};

describe('previews draw from fixtures and never fetch', () => {
  it('tracking: "found (2 parcels)" draws the hero and two parcel cards, with no site key, no lookup, no challenge', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<Shell mode={modeFor('TrackingLookup', 'found-2')}><TrackingPage /></Shell>);
    expect(await screen.findByText('Parcel 1 of 2')).toBeTruthy();
    expect(screen.getByText('Parcel 2 of 2')).toBeTruthy();
    expect(screen.getByText(/2 parcels/i)).toBeTruthy(); // the hero's summary
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(['form', 'not-found', 'error', 'nothing-shipped', 'found-1'])('tracking: %s draws without a site key', async (id) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { container } = render(<Shell mode={modeFor('TrackingLookup', id)}><TrackingPage /></Shell>);
    await waitFor(() => expect(container.textContent?.length).toBeGreaterThan(0));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('account containers: the queries never fire in a preview', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const cases: Array<[ContainerName, string, ReactNode, RegExp?]> = [
      ['OrdersList', 'orders', <OrdersPage />],
      ['OrdersList', 'none', <OrdersPage />],
      ['Loyalty', 'rewards', <LoyaltyPage />],
      ['Referrals', 'referred', <ReferralsPage />],
      ['Profile', 'website', <ProfilePage />],
    ];
    for (const [c, id, node] of cases) {
      const { container, unmount } = render(<Shell mode={modeFor(c, id)}>{node}</Shell>);
      await waitFor(() => expect(container.textContent?.length).toBeGreaterThan(0));
      unmount();
    }
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fetchOrders).not.toHaveBeenCalled();
    expect(fetchProfile).not.toHaveBeenCalled();
    expect(fetchRedeemOptions).not.toHaveBeenCalled();
  });

  it('negative control: without a fixture the same containers do query', async () => {
    vi.mocked(fetchOrders).mockResolvedValue({ data: [], meta: { page: 1, hasNextPage: false, totalItems: 0 } } as never);
    vi.mocked(fetchProfile).mockReturnValue(new Promise(() => {}));
    vi.mocked(fetchRedeemOptions).mockReturnValue(new Promise(() => {}));
    const live = { editing: false, previewAs: null, previewStates: null, previewFixtures: null };
    render(<Shell mode={live}><OrdersPage /><LoyaltyPage /></Shell>);
    await waitFor(() => expect(fetchOrders).toHaveBeenCalled());
    expect(fetchProfile).toHaveBeenCalled();
    expect(fetchRedeemOptions).toHaveBeenCalled();
  });

  it('one preview rule: a state without a fixture is not a preview (queries stay live)', async () => {
    vi.mocked(fetchOrders).mockResolvedValue({ data: [], meta: { page: 1, hasNextPage: false, totalItems: 0 } } as never);
    render(<Shell mode={{ editing: true, previewAs: null, previewStates: { OrdersList: 'orders' }, previewFixtures: null }}><OrdersPage /></Shell>);
    await waitFor(() => expect(fetchOrders).toHaveBeenCalled());
  });

  it('verify: authentic is in date, expired carries the expiry note', async () => {
    const { unmount } = render(<Shell mode={modeFor('VerifyForm', 'authentic')}><VerifyPage /></Shell>);
    expect(await screen.findByText('Expires')).toBeTruthy();
    expect(screen.queryByText(/past its expiry date/i)).toBeNull();
    unmount();
    render(<Shell mode={modeFor('VerifyForm', 'expired')}><VerifyPage /></Shell>);
    expect(await screen.findByText(/past its expiry date/i)).toBeTruthy();
  });
});

describe('issue labels', () => {
  it('block-rule ids of the new containers read as block names', () => {
    for (const rule of ['slot-rejects:OrdersList.content', 'part-placement:OrdersRows', 'hidden-required:TrackingLookup', 'hidden-required:VerifyFields']) {
      expect(BLOCK_RULE_RE.exec(rule)?.[1], rule).toBeTruthy();
    }
    expect(BLOCK_RULE_RE.exec('slot-rejects:Header.left')?.[1]).toBe('Header');
  });
});

describe('fixtures stay out of the shopper bundle', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? (p.includes(`${join('builder', 'editor')}`) ? [] : walk(p)) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
  it('nothing outside builder/editor imports the editor fixtures or preview-states', () => {
    const offenders = walk(resolve(__dirname, '../src')).filter((f) => /from '@\/builder\/editor\/(fixtures|preview-states)\.ts'/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
