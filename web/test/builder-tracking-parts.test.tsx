import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { forwardRef, Suspense, useEffect, useImperativeHandle } from 'react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { TrackedParcel, TrackingLookup } from '@/types/tracking.ts';

// Dates in the fixtures are relative to a fixed clock; pin the zone so formatting is stable.
vi.hoisted(() => { process.env.TZ = 'Europe/London'; });

const state = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  /** Turnstile hands over a token on mount, or never. */
  token: true,
  lookup: ((..._a: unknown[]) => new Promise(() => {})) as (...a: unknown[]) => Promise<unknown>,
  mounted: 0,
  mint: (() => {}) as () => void,
}));

vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings as unknown as StorefrontSettings }));
vi.mock('@marsidev/react-turnstile', async () => ({
  Turnstile: forwardRef<{ reset: () => void }, { onSuccess?: (token: string) => void }>(function FakeTurnstile(props, ref) {
    useImperativeHandle(ref, () => ({ reset: () => {} }));
    useEffect(() => {
      state.mounted += 1;
      state.mint = () => props.onSuccess?.('tok');
      if (state.token) props.onSuccess?.('tok');
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
  }),
}));
vi.mock('@/api/tracking.ts', async (orig) => ({
  ...(await orig<typeof import('@/api/tracking.ts')>()),
  lookupTracking: (...a: unknown[]) => state.lookup(...a),
}));

import { TrackingLookupError } from '@/api/tracking.ts';
import '@/builder/render.tsx';
import { RenderDoc } from '@/builder/render.tsx';
import { BLOCKS } from '@/builder/registry.ts';
import { validateDoc } from '@/builder/guard.ts';
import { checkRules } from '@/builder/rules.ts';
import { upgradeItems } from '@/builder/upgrade.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import type { StyleSupport } from '@/builder/style/model.ts';
import { BuilderModeProvider } from '@/builder/mode.ts';
import { TrackingFamily, type TrackingPreview } from '@/builder/family-tracking.ts';
import { TRACKING_CONTAINER } from '@/builder/blocks/_shared/tracking-container.ts';
import type { ComponentData, LayoutKind, PuckDoc } from '@/builder/types.ts';
import { LookupForm } from '@/features/tracking/LookupForm.tsx';
import { OrderHero } from '@/features/tracking/OrderHero.tsx';
import { RefreshButton } from '@/features/tracking/RefreshButton.tsx';
import { ProgressStepper } from '@/features/tracking/ProgressStepper.tsx';
import { DegradedNotice } from '@/features/tracking/StateScreens.tsx';
import { STAGE4_PARTS } from './helpers/stage4-parts.ts';

const PARTS = ['TrackingIntro', 'TrackingState', 'TrackingForm', 'TrackingHero', 'TrackingProgress', 'TrackingRefresh', 'TrackingNotice', 'TrackingParcels'] as const;
const OPTIONAL = ['TrackingProgress', 'TrackingRefresh', 'TrackingNotice'] as const;
const LAYOUTS: LayoutKind[] = ['storefront', 'menu', 'webapp'];
const NOW = Date.parse('2026-07-07T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

const evt = (code: string, text: string, msAgo: number) => ({ occurredAt: ago(msAgo), place: 'Leeds', code, text });
const parcel = (n: number, status = 'IN_TRANSIT'): TrackedParcel => ({
  trackingNumber: `NBTRK${n}00123`, shipmentStatus: 'in_transit', shippedAt: ago(5 * DAY), deliveredAt: null, fallbackDescription: null,
  tracking: {
    outcome: 'ok', status, courierNumber: `CR${n}77`, destination: { code: 'GB', name: 'United Kingdom' }, lastEventAt: ago(DAY), deliveredAt: null,
    events: [evt('IN_TRANSIT', 'Arrived at the depot', DAY)], lastMile: null, lastMileNumber: null, checkedAt: ago(30 * MIN), errorCode: null,
  },
});
const order = (parcels: TrackedParcel[], reference = 'NB-1001', over: Partial<TrackingLookup> = {}): TrackingLookup => ({
  reference, status: 'shipped', createdAt: ago(6 * DAY), itemCount: 3, isPreorder: false, parcels, trackingAvailable: true, checkedAt: ago(30 * MIN), ...over,
});
const FOUND_2 = order([parcel(1), parcel(2)]);
const FOUND_1 = order([parcel(1)]);

function setSettings(siteKey: string | null = 'site-key') {
  state.settings = {
    currency: 'GBP', enabled: true, supportLinks: [], notices: [], features: {},
    brand: { name: 'Northbound Supply', shortName: 'Northbound', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
    turnstile: siteKey === null ? undefined : { siteKey },
    login: { whatsapp: { available: false, number: null }, telegram: { available: false, botUsername: null } },
  };
}
beforeEach(() => {
  localStorage.clear();
  setSettings();
  state.token = true;
  state.mounted = 0;
  state.lookup = () => new Promise(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

const c = (type: string, id: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
const rich = (id: string, text: string) => c('RichText', id, { bodyHtml: `<p>${text}</p>`, width: 'narrow' });
const container = (slots: Record<string, ComponentData[]>, props: Record<string, unknown> = {}): ComponentData => c('TrackingLookup', 'tl', { top: [], main: [], result: [], ...slots, ...props });
const doc = (content: ComponentData[]): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content, zones: {} });
const rules = (content: ComponentData[], layout: LayoutKind = 'storefront') => checkRules(doc(content), 'tracking', layout).map((i) => i.rule);
const DEFAULTS = (layout: LayoutKind = 'storefront') => TRACKING_CONTAINER.defaultSlots({}, { layout, id: 'tl' });
const DEFAULT_CONTAINER = (): ComponentData => container(structuredClone(DEFAULTS()));
const without = (items: ComponentData[], type: string) => items.filter((i) => i.type !== type);
const types = (items: ComponentData[]) => items.map((i) => i.type);
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

function Nav({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(to)}>go-{to}</button>;
}

/** The container through the guard and RenderDoc, at `path`; `preview` supplies the editor's fixture. */
function mount(content: ComponentData[], path = '/tracking/nb-1001', opts: { preview?: TrackingPreview; nav?: string } = {}) {
  const guarded = validateDoc(doc(content), 'tracking', 'storefront');
  if (!guarded.doc) throw new Error(`rejected: ${JSON.stringify(guarded.issues)}`);
  const body = <RenderDoc doc={guarded.doc} docKey="tracking" layout="storefront" />;
  const wrapped = opts.preview
    ? <BuilderModeProvider value={{ editing: true, previewAs: null, previewFixtures: { TrackingLookup: opts.preview } }}>{body}</BuilderModeProvider>
    : body;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider env="test">
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/tracking/:reference?" element={<Suspense fallback={null}>{opts.nav ? <Nav to={opts.nav} /> : null}{wrapped}</Suspense>} />
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
}
const found = (d: TrackingLookup) => { state.lookup = () => Promise.resolve(d); };
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 200)); });

describe('contract', () => {
  it.each(PARTS)('%s is a tracking part with the binding style row', (name) => {
    const def = BLOCKS[name]!;
    expect(def.category).toBe('part');
    expect(def.part).toEqual({ family: 'tracking' });
    expect(def.container).toBeUndefined();
    expect((def.style as StyleSupport).target).toBe(STAGE4_PARTS[name]!.style.target);
    expect([...(def.style as StyleSupport).keys].sort()).toEqual([...STAGE4_PARTS[name]!.style.keys].sort());
  });

  it('required parts carry no hide', () => {
    for (const r of TRACKING_CONTAINER.required) expect((BLOCKS[r]!.style as StyleSupport).keys, r).not.toContain('hide');
  });

  it('every part declares the site-text keys it renders', () => {
    for (const name of PARTS) expect(BLOCKS[name]!.text!.length, name).toBeGreaterThan(0);
  });

  it('the container: slots, requirements, rejects, and the narrowed text', () => {
    const def = BLOCKS.TrackingLookup!;
    expect(def.slots).toEqual(['top', 'main', 'result']);
    expect(TRACKING_CONTAINER.required).toEqual(['TrackingIntro', 'TrackingState', 'TrackingForm', 'TrackingHero', 'TrackingParcels']);
    expect([...TRACKING_CONTAINER.unique].sort()).toEqual([...PARTS].sort());
    expect(TRACKING_CONTAINER.slotRejects).toEqual({ result: ['TrackingIntro', 'TrackingState', 'TrackingForm'] });
    expect(TRACKING_CONTAINER.insertSlot).toBe('main');
    expect(def.text).toEqual(expect.arrayContaining(['tracking.states.disabledTitle']));
    expect(def.text!.some((k) => k === 'tracking.*')).toBe(false);
  });

  it('PartHost outside a container renders nothing and does not throw', () => {
    const { container: el } = render(<TrackingFamily.PartHost name="TrackingHero" props={{}} />);
    expect(el.innerHTML).toBe('');
  });

  it('the default arrangement', () => {
    const d = DEFAULTS();
    expect(types(d.top!)).toEqual(['TrackingIntro']);
    expect(types(d.main!)).toEqual(['TrackingState', 'TrackingForm']);
    expect(types(d.result!)).toEqual(['TrackingHero', 'TrackingProgress', 'TrackingRefresh', 'TrackingNotice', 'TrackingParcels']);
  });

  it.each(LAYOUTS)('default ids are unique and at most 64 chars; defaults pass the rules (%s)', (layout) => {
    const item = container(DEFAULTS(layout));
    const ids = JSON.stringify(item).match(/"id":"([^"]+)"/g)!.map((s) => s.slice(6, -1));
    expect(ids.every((i) => i.length <= 64)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(rules([item], layout)).toEqual([]);
  });

  it('the shipped default document passes its rules', () => {
    for (const l of LAYOUTS) expect(checkRules(defaultDoc('tracking', l)!, 'tracking', l)).toEqual([]);
  });

  it('TEXT / BOX parts read the colour and size variables in the page CSS', () => {
    const css = readFileSync(resolve(__dirname, '../src/features/tracking/Tracking.module.css'), 'utf8');
    for (const cls of ['eyebrow', 'title', 'lead', 'stripLabel', 'stripLink']) {
      const rule = new RegExp(`\\n\\.${cls} \\{([^}]*)\\}`).exec(css)![1]!;
      expect(rule, cls).toMatch(/color:\s*var\(--sf-block-fg,/);
      expect(rule, cls).toMatch(/font-size:\s*calc\([^;]*var\(--sf-text-scale, 1\)/);
    }
  });
});

describe('rules', () => {
  it.each(TRACKING_CONTAINER.required)('removing %s is part-required', (name) => {
    const d = DEFAULTS();
    for (const k of Object.keys(d)) d[k] = without(d[k]!, name);
    expect(rules([container(d)])).toContain(`part-required:TrackingLookup.${name}`);
  });
  it.each(TRACKING_CONTAINER.required)('duplicating %s is part-required', (name) => {
    const d = DEFAULTS();
    d.main!.push(c(name, 'tl-dup'));
    expect(rules([container(d)])).toContain(`part-required:TrackingLookup.${name}`);
  });
  it.each(OPTIONAL)('duplicating %s is part-unique', (name) => {
    const d = DEFAULTS();
    d.result!.push(c(name, 'tl-dup'));
    expect(rules([container(d)])).toContain(`part-unique:TrackingLookup.${name}`);
  });
  it.each(OPTIONAL)('removing %s is fine', (name) => {
    const d = DEFAULTS();
    d.result = without(d.result!, name);
    expect(rules([container(d)])).toEqual([]);
  });
  it.each(['TrackingIntro', 'TrackingState', 'TrackingForm'])('%s in result is slot-rejects:TrackingLookup.result', (name) => {
    const d = DEFAULTS();
    d[name === 'TrackingIntro' ? 'top' : 'main'] = without(d[name === 'TrackingIntro' ? 'top' : 'main']!, name);
    d.result!.push(c(name, 'tl-moved'));
    expect(rules([container(d)])).toContain('slot-rejects:TrackingLookup.result');
  });
  it('a result part in top is allowed', () => {
    const d = DEFAULTS();
    d.result = without(d.result!, 'TrackingHero');
    d.top!.push(c('TrackingHero', 'tl-hero-top'));
    expect(rules([container(d)])).toEqual([]);
  });
  it('a tracking part inside another family\'s container is part-placement', () => {
    const wrong = c('ProductDetail', 'pd', { top: [], media: [], main: [c('TrackingHero', 'tl-x')], below: [], sku: 'inherit' });
    expect(checkRules(doc([wrong]), 'product', 'storefront').map((i) => i.rule)).toContain('part-placement:TrackingHero');
  });
  it('a part at the document root is part-placement', () => {
    expect(rules([c('TrackingHero', 'loose'), DEFAULT_CONTAINER()])).toContain('part-placement:TrackingHero');
  });
});

describe('upgrade (a stored v0.7.0 container: absent slots)', () => {
  const stored = () => c('TrackingLookup', 'tl');
  it('absent slots become the default arrangement', () => {
    const [out] = upgradeItems([stored()], 'storefront');
    expect({ top: out!.props.top, main: out!.props.main, result: out!.props.result }).toEqual(DEFAULTS());
  });
  it('slots present as [] are untouched', () => {
    const empty = container({});
    const [out] = upgradeItems([empty], 'storefront');
    expect(out!.props.top).toEqual([]);
    expect(out!.props.main).toEqual([]);
    expect(out!.props.result).toEqual([]);
  });
  it('is idempotent', () => {
    const once = upgradeItems([stored()], 'storefront');
    expect(upgradeItems(once, 'storefront')).toBe(once);
  });
});

describe('arrangement', () => {
  it('a stored container with absent slots renders the v0.7.0 page', async () => {
    found(FOUND_2);
    const { container: el } = mount([c('TrackingLookup', 'TrackingLookup-default')]);
    await settle();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(el.querySelector('[aria-busy]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /refresh|check/i })).toBeInTheDocument();
    expect(screen.getAllByText(/NBTRK/).length).toBeGreaterThan(0);
  });

  it('the idle form is the masthead then the form', async () => {
    const { container: el } = mount([DEFAULT_CONTAINER()], '/tracking');
    await settle();
    const title = screen.getByRole('heading', { level: 1 });
    const input = el.querySelector('input')!;
    expect(before(title, input)).toBe(true);
    expect(el.querySelector('[aria-busy]')).toBeNull();
  });

  it('result parts render in a reordered slot (parcels before the hero)', async () => {
    found(FOUND_2);
    const d = DEFAULTS();
    d.result = [d.result![4]!, d.result![0]!, ...d.result!.slice(1, 4)];
    const { container: el } = mount([container(d)]);
    await settle();
    const hero = screen.getByRole('heading', { level: 1 });
    const firstCard = screen.getAllByText(/NBTRK/)[0]!;
    expect(before(firstCard, hero)).toBe(true);
    expect(el.querySelector('[aria-busy]')).not.toBeNull();
  });

  it('an interleaved RichText above the parcels renders between the hero and the parcels', async () => {
    found(FOUND_2);
    const d = DEFAULTS();
    d.result!.splice(4, 0, rich('rt', 'Questions about delivery? Ask us.'));
    mount([container(d)]);
    await settle();
    const note = screen.getByText('Questions about delivery? Ask us.');
    expect(before(screen.getByRole('heading', { level: 1 }), note)).toBe(true);
    expect(before(note, screen.getAllByText(/NBTRK/)[0]!)).toBe(true);
  });

  it('removing TrackingRefresh leaves no refresh control', async () => {
    found(FOUND_2);
    const d = DEFAULTS();
    d.result = without(d.result!, 'TrackingRefresh');
    mount([container(d)]);
    await settle();
    expect(screen.queryByRole('button', { name: /refresh|check/i })).toBeNull();
    expect(screen.getAllByText(/NBTRK/).length).toBeGreaterThan(0);
  });

  it('hiding the optional parts: progress, refresh and notice are absent while the hero and parcels stay', async () => {
    found(FOUND_1);
    const d = DEFAULTS();
    d.result = without(without(without(d.result!, 'TrackingProgress'), 'TrackingRefresh'), 'TrackingNotice');
    const { container: el } = mount([container(d)]);
    await settle();
    expect(el.querySelector('[data-sf-part="stepper"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /refresh|check/i })).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText(/NBTRK/).length).toBeGreaterThan(0);
  });

  it('a block style on an optional part lands on its root; with the part hidden by blockStyle it stays styled', async () => {
    found(FOUND_1);
    const d = DEFAULTS();
    d.result = d.result!.map((i) => (i.type === 'TrackingProgress' ? { ...i, props: { ...i.props, blockStyle: { bg: 'surface' } } } : i));
    const { container: el } = mount([container(d)]);
    await settle();
    const stepper = el.querySelector('[data-sf-part="stepper"]')!;
    expect(stepper.getAttribute('data-sfs-bg')).toBe('surface');
  });

  it('the not-found order is the screen, then the retry form', async () => {
    state.lookup = () => Promise.reject(new TrackingLookupError(404, 'nope'));
    const { container: el } = mount([DEFAULT_CONTAINER()]);
    await settle();
    const retry = el.querySelector('input')!.closest('div[class*="retry"]')!;
    expect(retry).not.toBeNull();
    const screenEl = screen.getByText('No order found');
    expect(before(screenEl, retry)).toBe(true);
  });

  it('swapping State and Form puts the retry form above the screen', async () => {
    state.lookup = () => Promise.reject(new TrackingLookupError(404, 'nope'));
    const d = DEFAULTS();
    d.main = [d.main![1]!, d.main![0]!];
    const { container: el } = mount([container(d)]);
    await settle();
    const retry = el.querySelector('input')!.closest('div[class*="retry"]')!;
    const screenEl = screen.getByText('No order found');
    expect(before(retry, screenEl)).toBe(true);
  });

  it('TrackingHero placed in top renders nothing until found, and sits outside the aria-busy wrapper', async () => {
    let resolve!: (d: TrackingLookup) => void;
    state.lookup = () => new Promise<TrackingLookup>((r) => { resolve = r; });
    const d = DEFAULTS();
    d.result = without(d.result!, 'TrackingHero');
    d.top!.push(c('TrackingHero', 'tl-hero-top'));
    const { container: el } = mount([container(d)]);
    await settle();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    await act(async () => { resolve(FOUND_1); await new Promise((r) => setTimeout(r, 20)); });
    const hero = screen.getByRole('heading', { level: 1 });
    expect(hero.closest('[aria-busy]')).toBeNull();
    expect(el.querySelector('[aria-busy]')).not.toBeNull();
  });

  it('the aria-busy wrapper exists only once found', async () => {
    for (const [name, lookup, expected] of [
      ['pending', () => new Promise(() => {}), false],
      ['not found', () => Promise.reject(new TrackingLookupError(404, 'x')), false],
      ['error', () => Promise.reject(new TrackingLookupError(500, 'x')), false],
      ['found', () => Promise.resolve(FOUND_1), true],
    ] as const) {
      state.lookup = lookup as () => Promise<unknown>;
      const { container: el, unmount } = mount([DEFAULT_CONTAINER()]);
      await settle();
      expect(Boolean(el.querySelector('[aria-busy]')), name).toBe(expected);
      unmount();
    }
  });
});

describe('state ownership', () => {
  it('the no-site-key screen precedes any slot, with arranged slots', () => {
    setSettings(null);
    const d = DEFAULTS();
    d.top!.push(rich('rt', 'Above everything'));
    mount([container(d)], '/tracking');
    expect(screen.queryByText('Above everything')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('a lookup that fails with 403 shows the generic connection screen; retry looks up again', async () => {
    let calls = 0;
    state.lookup = () => { calls += 1; return Promise.reject(new TrackingLookupError(403, 'no')); };
    mount([DEFAULT_CONTAINER()]);
    await settle();
    expect(calls).toBe(1);
    const retry = screen.getByRole('button', { name: /try again|retry/i });
    state.mint();
    await act(async () => { fireEvent.click(retry); await new Promise((r) => setTimeout(r, 20)); });
    expect(calls).toBeGreaterThanOrEqual(1);
  });

  it('the token never arriving shows the blocked screen after the bounded wait', async () => {
    state.token = false;
    const real = window.setTimeout.bind(window);
    vi.spyOn(window, 'setTimeout').mockImplementation(((fn: TimerHandler, ms?: number, ...a: unknown[]) =>
      real(fn, ms === 15_000 ? 1 : ms, ...a)) as typeof window.setTimeout);
    mount([DEFAULT_CONTAINER()]);
    await settle();
    expect(screen.getByRole('button', { name: /reload|refresh page/i })).toBeInTheDocument();
  });

  it('the stale-response guard: two overlapping lookups, the first resolving last, the second wins', async () => {
    const pending: Array<(d: TrackingLookup) => void> = [];
    state.lookup = () => new Promise<TrackingLookup>((r) => { pending.push(r); });
    mount([DEFAULT_CONTAINER()], '/tracking/nb-1001', { nav: '/tracking/nb-2002' });
    await settle();
    expect(pending).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /go-/ }));
    await settle();
    state.mint();
    await settle();
    expect(pending).toHaveLength(2);
    await act(async () => { pending[1]!(order([parcel(2)], 'NB-2002')); await new Promise((r) => setTimeout(r, 20)); });
    await act(async () => { pending[0]!(order([parcel(1)], 'NB-1001')); await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByText('NB-2002')).toBeInTheDocument();
    expect(screen.queryByText('NB-1001')).toBeNull();
  });
});

describe('preview fixtures (the editor): no network, Turnstile never mounted', () => {
  const FIXTURES: Array<[string, TrackingPreview, RegExp | 'form']> = [
    ['form', { phase: 'idle', compact: false }, 'form'],
    ['found-2', { phase: 'found', compact: true, data: FOUND_2 }, /NBTRK/],
    ['found-1', { phase: 'found', compact: true, data: FOUND_1 }, /NBTRK/],
    ['nothing-shipped', { phase: 'found', compact: true, data: order([], 'NB-1001', { status: 'processing', checkedAt: null }) }, /NB-1001/],
    ['not-found', { phase: 'notFound', compact: false }, 'form'],
    ['error', { phase: 'error', compact: false, errorStatus: 500 }, /try again|retry/i],
    ['pending', { phase: 'pending', compact: true }, /./],
    ['blocked', { phase: 'blocked', compact: false }, /reload|refresh page/i],
  ];
  it.each(FIXTURES)('%s renders without a lookup or a challenge', async (_n, preview, expectation) => {
    const lookup = vi.fn(() => new Promise(() => {}));
    state.lookup = lookup;
    setSettings(null); // no site key: the editor preview must still draw the arrangement
    const { container: el } = mount([DEFAULT_CONTAINER()], '/tracking/nb-1001', { preview });
    await settle();
    expect(lookup).not.toHaveBeenCalled();
    expect(state.mounted).toBe(0);
    if (expectation === 'form') expect(el.querySelector('input')).not.toBeNull();
    else expect(el.textContent).toMatch(expectation);
  });
});

describe('rootAttrs on the leaves', () => {
  const attrs = { 'data-sfs-bg': 'surface' } as const;
  const wrap = (ui: React.ReactNode) => render(<MantineProvider env="test"><MemoryRouter>{ui}</MemoryRouter></MantineProvider>).container;
  it('spreads on each root and adds nothing when undefined', () => {
    const cases: Array<[string, (a?: typeof attrs) => React.ReactNode]> = [
      ['form', (a) => <LookupForm rootAttrs={a} />],
      ['section', (a) => <OrderHero data={FOUND_1} rootAttrs={a} />],
      ['refresh', (a) => <RefreshButton checkedAt={null} busy={false} onRefresh={() => {}} rootAttrs={a} />],
      ['stepper', (a) => <ProgressStepper stage={1} failed={false} rootAttrs={a} />],
      ['degraded', (a) => <DegradedNotice rootAttrs={a} />],
    ];
    for (const [name, ui] of cases) {
      const withAttrs = wrap(ui(attrs));
      const hit = withAttrs.querySelectorAll('[data-sfs-bg]');
      expect(hit.length, name).toBe(1);
      cleanup();
      const without = wrap(ui());
      expect(without.querySelector('[data-sfs-bg]'), name).toBeNull();
      cleanup();
    }
  });
});

