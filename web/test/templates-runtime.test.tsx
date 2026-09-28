import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { StorefrontSettings } from '@/types/settings.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

import { loadTemplateModule, Slot, TemplateProvider, useTemplateContext } from '@/templates/runtime.tsx';
import { resolveTheme } from '@/templates/resolve.ts';
import { getTemplate, lookupManifest } from '@/templates/registry.ts';
import type { TemplateModule, TemplateSlots } from '@/templates/slots.ts';
import { ArrowUpRightIcon } from '@/templates/contract.ts';

state.settings = {
  brand: { name: 'Acme', shortName: 'Acme', tagline: '', title: 'Acme', description: '', logoUrl: null, faviconUrl: null, logoHeight: 28, links: { whatsapp: null, telegram: null } },
  features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
  theme: { scheme: 'dark', colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' }, fonts: { heading: null, body: null, mono: null }, radius: 'none', density: 'comfortable', customCss: '' },
} as unknown as StorefrontSettings;

const resolved = resolveTheme(state.settings.theme, lookupManifest);
const custom: TemplateModule = { slots: { TopBar: ({ brand, layout }) => <p>top {brand.name} {layout}</p> } };

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('TemplateProvider', () => {
  it('shows the fallback until the module loads, then custom slots (wrapped) and defaults (unwrapped)', async () => {
    let resolveLoad!: (m: TemplateModule) => void;
    const load = () => new Promise<TemplateModule>((r) => { resolveLoad = r; });
    render(
      <TemplateProvider resolved={resolved} fallback={<p>loading</p>} load={load} peek={() => undefined}>
        <Slot name="TopBar" />
        <Slot name="SectionLabel" index={1} title="All" level="page" />
      </TemplateProvider>,
    );
    expect(screen.getByText('loading')).toBeInTheDocument();
    await act(async () => resolveLoad(custom));
    const top = screen.getByText('top Acme storefront');
    expect(top.parentElement).toHaveAttribute('data-sf-slot', 'TopBar');
    expect(document.querySelector('[data-sf-part="section-label"]')).toBeNull(); // plain label → nothing
  });

  it('renders immediately from an already-loaded module', () => {
    render(
      <TemplateProvider resolved={resolved} fallback={<p>loading</p>} load={() => Promise.resolve(custom)} peek={() => custom}>
        <Slot name="TopBar" />
      </TemplateProvider>,
    );
    expect(screen.getByText('top Acme storefront')).toBeInTheDocument();
  });

  it('load failure → default slots, with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <TemplateProvider resolved={resolved} fallback={<p>loading</p>} load={() => Promise.reject(new Error('404'))} peek={() => undefined}>
        <p>app</p><Slot name="TopBar" />
      </TemplateProvider>,
    );
    expect(await screen.findByText('app')).toBeInTheDocument();
    expect(screen.queryByText(/^top /)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('failed to load'), expect.anything());
    warn.mockRestore();
  });

  it('timeout then late load → defaults first, custom slots when the chunk finally arrives', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let resolveLoad!: (m: TemplateModule) => void;
    render(
      <TemplateProvider resolved={resolved} fallback={<p>loading</p>} timeoutMs={100} load={() => new Promise((r) => { resolveLoad = r; })} peek={() => undefined}>
        <p>app</p><Slot name="TopBar" />
      </TemplateProvider>,
    );
    await act(async () => { vi.advanceTimersByTime(150); });
    expect(screen.getByText('app')).toBeInTheDocument();
    expect(screen.queryByText(/^top /)).toBeNull();
    await act(async () => resolveLoad(custom));
    expect(screen.getByText('top Acme storefront')).toBeInTheDocument();
    warn.mockRestore();
  });

  it('timeout then eventual rejection → stays on default slots (no crash, fallback never returns)', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let rejectLoad!: (err: Error) => void;
    render(
      <TemplateProvider resolved={resolved} fallback={<p>loading</p>} timeoutMs={100} load={() => new Promise((_r, rej) => { rejectLoad = rej; })} peek={() => undefined}>
        <p>app</p><Slot name="TopBar" />
      </TemplateProvider>,
    );
    await act(async () => { vi.advanceTimersByTime(150); });
    expect(screen.getByText('app')).toBeInTheDocument();
    expect(screen.queryByText(/^top /)).toBeNull();
    await act(async () => rejectLoad(new Error('boom')));
    expect(screen.getByText('app')).toBeInTheDocument();
    expect(screen.queryByText('loading')).toBeNull();
    expect(screen.queryByText(/^top /)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('taking longer than'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('failed to load'), expect.anything());
    warn.mockRestore();
  });

  it('Slot outside a provider renders defaults (existing component tests keep working)', () => {
    render(<Slot name="SectionLabel" index={2} title="Oils" level="group" />);
    expect(document.body.textContent).toBe('');
  });
});

describe('TemplateProvider template switch', () => {
  it('never renders the fallback again once mounted, and the new id\'s slots take over once its module lands', async () => {
    const altId = 'alt';
    const altResolved = { ...resolved, templateId: altId };
    const altCustom: TemplateModule = { slots: { TopBar: ({ brand, layout }) => <p>alt {brand.name} {layout}</p> } };
    let resolveAlt!: (m: TemplateModule) => void;
    const load = (tid: string) => (tid === altId ? new Promise<TemplateModule>((r) => { resolveAlt = r; }) : Promise.resolve(custom));
    const peek = (tid: string) => (tid === resolved.templateId ? custom : undefined);

    const { rerender } = render(
      <TemplateProvider resolved={resolved} fallback={<p>loading</p>} load={load} peek={peek}>
        <p>app</p>
        <Slot name="TopBar" />
      </TemplateProvider>,
    );
    expect(screen.getByText('top Acme storefront')).toBeInTheDocument();

    rerender(
      <TemplateProvider resolved={altResolved} fallback={<p>loading</p>} load={load} peek={peek}>
        <p>app</p>
        <Slot name="TopBar" />
      </TemplateProvider>,
    );
    // Never falls back to the loading screen on a switch — the app stays mounted throughout.
    expect(screen.queryByText('loading')).toBeNull();
    expect(screen.getByText('app')).toBeInTheDocument();
    // The old template's slot drops immediately; the new one hasn't landed yet → defaults.
    expect(screen.queryByText(/^top /)).toBeNull();

    await act(async () => resolveAlt(altCustom));
    expect(screen.getByText('alt Acme storefront')).toBeInTheDocument();
  });

  it('a switch to a template whose chunk fails stays on default slots, without unmounting the app', async () => {
    const altId = 'broken';
    const altResolved = { ...resolved, templateId: altId };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const load = (tid: string) => (tid === altId ? Promise.reject(new Error('404')) : Promise.resolve(custom));
    const peek = (tid: string) => (tid === resolved.templateId ? custom : undefined);

    const { rerender } = render(
      <TemplateProvider resolved={resolved} fallback={<p>loading</p>} load={load} peek={peek}>
        <p>app</p>
        <Slot name="TopBar" />
      </TemplateProvider>,
    );
    expect(screen.getByText('top Acme storefront')).toBeInTheDocument();

    rerender(
      <TemplateProvider resolved={altResolved} fallback={<p>loading</p>} load={load} peek={peek}>
        <p>app</p>
        <Slot name="TopBar" />
      </TemplateProvider>,
    );
    expect(await screen.findByText('app')).toBeInTheDocument();
    expect(screen.queryByText('loading')).toBeNull();
    expect(screen.queryByText(/^top /)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('failed to load'), expect.anything());
    warn.mockRestore();
  });
});

describe('TemplateProvider slot identity', () => {
  // Consumers memoise on the context value; a fresh `{}` per render would churn every one of them.
  const seen: TemplateSlots[] = [];
  function Probe() { seen.push(useTemplateContext().slots); return null; }
  afterEach(() => { seen.length = 0; });

  it('keeps one stable empty slots object through the switch window and after a failed load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const altResolved = { ...resolved, templateId: 'alt' };
    let rejectAlt!: (err: Error) => void;
    const load = (tid: string) => (tid === 'alt' ? new Promise<TemplateModule>((_r, rej) => { rejectAlt = rej; }) : Promise.resolve(custom));
    const peek = (tid: string) => (tid === resolved.templateId ? custom : undefined);
    const tree = (r: typeof resolved, n: number) => (
      <TemplateProvider resolved={r} fallback={<p>loading</p>} load={load} peek={peek}><Probe key={n} /></TemplateProvider>
    );
    const { rerender } = render(tree(resolved, 0));
    rerender(tree(altResolved, 0));
    const during = seen.length;
    rerender(tree(altResolved, 0));
    expect(seen.length).toBeGreaterThan(during);
    expect(seen[seen.length - 1]).toBe(seen[during - 1]); // same object across switch-window renders
    await act(async () => rejectAlt(new Error('404')));
    const afterFail = seen.length;
    rerender(tree(altResolved, 0));
    expect(seen[seen.length - 1]).toBe(seen[afterFail - 1]);
    expect(seen[seen.length - 1]).toBe(seen[during - 1]); // failure path reuses the same empty object
    warn.mockRestore();
  });
});

describe('Slot wrapper element', () => {
  it('wraps a template ButtonAdornment in a display:contents <span> (valid inside <button>), other slots in a <div>', () => {
    const mod: TemplateModule = { slots: { ...custom.slots, ButtonAdornment: () => <i>adorn</i> } };
    render(
      <TemplateProvider resolved={resolved} fallback={<p>loading</p>} load={() => Promise.resolve(mod)} peek={() => mod}>
        <button type="button"><Slot name="ButtonAdornment" variant="primary" cta /></button>
        <Slot name="TopBar" />
      </TemplateProvider>,
    );
    const adorn = screen.getByText('adorn').parentElement!;
    expect(adorn.tagName).toBe('SPAN');
    expect(adorn).toHaveAttribute('data-sf-slot', 'ButtonAdornment');
    expect(adorn).toHaveStyle({ display: 'contents' });
    const top = screen.getByText('top Acme storefront').parentElement!;
    expect(top.tagName).toBe('DIV');
    expect(top).toHaveAttribute('data-sf-slot', 'TopBar');
  });
});

describe('loadTemplateModule', () => {
  it('forgets a failed load, so a later call retries rather than replaying the rejection', async () => {
    const entry = getTemplate('modern');
    const originalLoad = entry.load;
    let calls = 0;
    entry.load = () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('boom')) : Promise.resolve({ slots: {} });
    };
    try {
      await expect(loadTemplateModule('modern')).rejects.toThrow('boom');
      // Let the internal `p.catch(() => pending.delete(key))` run before retrying.
      await Promise.resolve().then(() => Promise.resolve());
      await expect(loadTemplateModule('modern')).resolves.toEqual({ slots: {} });
      expect(calls).toBe(2);
    } finally {
      entry.load = originalLoad;
    }
  });
});

describe('contract icons', () => {
  it('ArrowUpRightIcon forwards className, data-* and a CSS size', () => {
    const { container } = render(<ArrowUpRightIcon size="1em" className="x-arrow" data-cta="true" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveClass('x-arrow');
    expect(svg).toHaveAttribute('data-cta', 'true');
    expect(svg).toHaveAttribute('width', '1em');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});
