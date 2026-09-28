import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { StorefrontSettings } from '@/types/settings.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

import { Slot, TemplateProvider } from '@/templates/runtime.tsx';
import { resolveTheme } from '@/templates/resolve.ts';
import { lookupManifest } from '@/templates/registry.ts';
import type { TemplateModule } from '@/templates/slots.ts';
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

  it('Slot outside a provider renders defaults (existing component tests keep working)', () => {
    render(<Slot name="SectionLabel" index={2} title="Oils" level="group" />);
    expect(document.body.textContent).toBe('');
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
