import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { DayKey, StorefrontSettings } from '@/types/settings.ts';
import type { OptionValues, SlotBaseProps } from '@/templates/contract.ts';
import { cssRules, readFromTest, splitSelectors } from './helpers/css-rules.ts';

const h = vi.hoisted(() => ({
  settings: {} as StorefrontSettings,
  bar: false,
  stats: { productCount: 128 as number | null, categoryCount: 6 as number | null },
}));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));
vi.mock('@/templates/contract.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/templates/contract.ts')>()),
  useMobileCartBar: () => h.bar,
  useCatalogStats: () => h.stats,
}));

import { CyberTopBar } from '@/templates/cyber-brutalism/slots/CyberTopBar.tsx';
import { CyberOverlay } from '@/templates/cyber-brutalism/slots/CyberOverlay.tsx';
import { CyberCatalogHero } from '@/templates/cyber-brutalism/slots/CyberCatalogHero.tsx';
import { CyberFooter } from '@/templates/cyber-brutalism/slots/CyberFooter.tsx';
import { CyberButtonAdornment } from '@/templates/cyber-brutalism/slots/CyberButtonAdornment.tsx';
import manifest from '@/templates/cyber-brutalism/manifest.ts';
import { validateManifest } from '@/templates/define.ts';
import { allTemplates, getTemplate, lookupManifest } from '@/templates/registry.ts';
import { resolveTheme } from '@/templates/resolve.ts';
import { DEFAULT_NODE, nodeName, readoutLines } from '@/templates/cyber-brutalism/slots/readout.ts';
import type { Theme } from '@/types/settings.ts';

describe('cyber-brutalism manifest', () => {
  it('is a valid contract-1 manifest discovered as a built-in', () => {
    expect(validateManifest(manifest, 'cyber-brutalism')).toEqual([]);
    expect(allTemplates().map((t) => t.manifest.id)).toContain('cyber-brutalism');
    expect(getTemplate('cyber-brutalism').builtIn).toBe(true);
  });

  it('ships Acid Dark (default) and Purple Light', () => {
    expect(manifest.schemes).toEqual(['dark', 'light']);
    expect(manifest.defaultPreset).toBe('acid-dark');
    const [dark, light] = manifest.presets;
    expect(dark).toMatchObject({ id: 'acid-dark', scheme: 'dark', radius: 'none' });
    expect(dark!.colors).toMatchObject({ primary: '#d4ff00', bg: '#0d0d0d', surface: '#1a1a1a', text: '#ffffff' });
    expect(light).toMatchObject({ id: 'purple-light', scheme: 'light', radius: 'none' });
    expect(light!.colors).toMatchObject({ primary: '#6b3ff6', bg: '#f4f4ee', surface: '#e8e8e2', text: '#111111' });
    expect(dark!.fonts).toEqual({
      heading: { family: 'Tektur', weights: [400, 600, 700, 900] },
      body: { family: 'Tektur', weights: [400, 600, 700, 900] },
      mono: { family: 'Share Tech Mono', weights: [400] },
    });
  });

  it('is square, flat and numbered', () => {
    expect(manifest.tokens.button).toMatchObject({ radius: 0, fill: 'solid', transform: 'uppercase', font: 'heading' });
    expect(manifest.tokens.card).toMatchObject({ radius: 0, shadow: 'none', shadowHover: 'none' });
    expect(manifest.tokens.badge.radius).toBe(0);
    expect(manifest.tokens.glass).toBe('off');
    expect(manifest.tokens.label.style).toBe('numbered');
    expect(manifest.tokens.heading.transform).toBe('uppercase');
  });
});

describe('cyber-brutalism locks', () => {
  const light = manifest.presets[1]!;
  const stored: Theme = {
    template: 'cyber-brutalism', preset: 'purple-light', options: { nodeLabel: 'LDN_02' },
    scheme: 'light', colors: light.colors,
    fonts: { heading: 'Inter', body: 'Inter', mono: null },
    radius: 'xl', density: 'compact', customCss: '',
  };

  it('forces radius none and the template fonts, keeps the light scheme and density', () => {
    const r = resolveTheme(stored, lookupManifest);
    expect(r.radius).toBe('none');
    expect(r.scheme).toBe('light');
    expect(r.fonts.heading?.family).toBe('Tektur');
    expect(r.fonts.mono).toEqual({ family: 'Share Tech Mono', weights: [400] });
    expect(r.density).toBe('compact');
    expect(r.options).toEqual({ systemBar: true, statusBar: true, crosshairs: true, nodeLabel: 'LDN_02' });
  });
});

describe('readout helpers', () => {
  it('nodeName trims, clamps to 24 and falls back', () => {
    expect(nodeName('  LDN_02 ')).toBe('LDN_02');
    expect(nodeName('')).toBe(DEFAULT_NODE);
    expect(nodeName('   ')).toBe(DEFAULT_NODE);
    expect(nodeName(undefined)).toBe(DEFAULT_NODE);
    expect(nodeName(true)).toBe(DEFAULT_NODE);
    expect(nodeName('X'.repeat(100))).toBe('X'.repeat(24));
  });

  it('readoutLines reports real data, cut-off first when there is one', () => {
    expect(readoutLines({ productCount: 128, cutoff: '16:00', accepting: true })).toEqual(['DISPATCH CUTOFF 16:00', 'ITEMS 128', 'ORDERING ONLINE']);
    expect(readoutLines({ productCount: null, cutoff: null, accepting: false })).toEqual(['ITEMS ---', 'ORDERING PAUSED']);
  });
});

const DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function settings(over: { ordering?: boolean; cutoffsOn?: boolean } = {}): StorefrontSettings {
  return {
    enabled: true,
    serverTime: '2026-08-24T09:05:07.000Z',
    cutoffs: { timezone: 'UTC', days: Object.fromEntries(DAYS.map((d) => [d, { enabled: over.cutoffsOn ?? false, cutoff: '16:00', shipsOn: 'same day' }])) },
    brand: { name: 'Voltline', shortName: 'Voltline', tagline: 'Parts for the grid', title: 'Voltline', description: '', logoUrl: null, faviconUrl: null, logoHeight: 28, links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront', ordering: over.ordering ?? true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
    supportLinks: [],
    welcomeMessage: null,
    currency: 'GBP',
  } as unknown as StorefrontSettings;
}

const DEFAULTS: OptionValues = Object.fromEntries(manifest.options.map((o) => [o.key, o.default]));
function base(options: OptionValues = {}, over: Partial<SlotBaseProps> = {}): SlotBaseProps {
  return { brand: h.settings.brand, options: { ...DEFAULTS, ...options }, scheme: 'dark', layout: 'storefront', tokens: manifest.tokens, ...over };
}

afterEach(() => { cleanup(); vi.useRealTimers(); h.bar = false; h.stats = { productCount: 128, categoryCount: 6 }; });

describe('CyberTopBar', () => {
  it('ticks SYS.TIME every second in the store timezone and shows node + SKU', () => {
    vi.useFakeTimers({ now: new Date('2026-08-24T09:05:07.000Z') });
    h.settings = settings();
    const { container } = render(<CyberTopBar {...base({ nodeLabel: 'LDN_02' })} />);
    expect(container.querySelector('.cb-sysbar__time')).toHaveTextContent('09:05:07');
    expect(container).toHaveTextContent('/ UTC+0');
    expect(container).toHaveTextContent('NODE: LDN_02');
    expect(container).toHaveTextContent('SKU: 128');
    expect(container.querySelectorAll('.cb-sysbar__sep')).toHaveLength(2); // SYS.TIME · NODE · SKU (spec §4.3)
    act(() => { vi.advanceTimersByTime(1000); });
    expect(container.querySelector('.cb-sysbar__time')).toHaveTextContent('09:05:08');
  });

  it('marks the offset and SKU as wide-only (hidden under 480px) and shows --- while loading', () => {
    h.settings = settings();
    h.stats = { productCount: null, categoryCount: null };
    const { container } = render(<CyberTopBar {...base()} />);
    const wide = [...container.querySelectorAll('[data-cb-wide]')].map((e) => e.textContent);
    expect(wide).toEqual([expect.stringContaining('UTC'), '·', 'SKU: ---']); // the NODE · SKU separator goes with SKU
    expect(container).toHaveTextContent('NODE: NODE_01');
  });

  it('renders nothing when the system bar is off', () => {
    h.settings = settings();
    const { container } = render(<CyberTopBar {...base({ systemBar: false })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('CyberOverlay', () => {
  it('draws four corner crosshairs only when crosshairs are on', () => {
    h.settings = settings();
    const { container, rerender } = render(<CyberOverlay {...base()} />);
    expect(container.querySelectorAll('[data-cb="frame"] .cb-cross')).toHaveLength(4);
    rerender(<CyberOverlay {...base({ crosshairs: false })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('CyberCatalogHero', () => {
  const hero = { tagline: 'Parts for the grid', welcomeMessage: 'Same-day dispatch.', productCount: 128, categoryCount: 6 };

  it('grid: brand name, tagline, crosshairs and a readout of real data', () => {
    h.settings = settings({ cutoffsOn: true });
    const { container } = render(<CyberCatalogHero {...base()} surface="grid" {...hero} />);
    expect(container.querySelector('.cb-hero__name')).toHaveTextContent('Voltline');
    expect(container.querySelector('.cb-hero__tagline')).toHaveTextContent('Parts for the grid');
    expect(container.querySelectorAll('.cb-hero .cb-cross')).toHaveLength(4);
    const lines = [...container.querySelectorAll('.cb-readout li')].map((li) => li.textContent);
    expect(lines).toEqual(['> DISPATCH CUTOFF 16:00', '> ITEMS 128', '> ORDERING ONLINE']);
    expect(container.querySelector('.cb-readout li:last-child')).toHaveClass('cb-cursor');
    expect(screen.queryByRole('heading')).toBeNull(); // the page h1 stays the only heading
  });

  it('reports ORDERING PAUSED for a catalogue-only store; no crosshairs when off', () => {
    h.settings = settings({ ordering: false });
    const { container } = render(<CyberCatalogHero {...base({ crosshairs: false })} surface="grid" {...hero} />);
    expect(container).toHaveTextContent('> ORDERING PAUSED');
    expect(container).not.toHaveTextContent('DISPATCH CUTOFF');
    expect(container.querySelector('.cb-cross')).toBeNull();
  });

  it('list surface: a one-line readout plus the welcome', () => {
    h.settings = settings();
    const { container } = render(<CyberCatalogHero {...base()} surface="list" {...hero} />);
    expect(container.querySelector('.cb-hero')).toBeNull();
    expect(container.querySelector('.cb-readout--inline')).toHaveTextContent('> ITEMS 128');
    expect(screen.getByText('Same-day dispatch.')).toBeInTheDocument();
  });
});

describe('CyberFooter', () => {
  const links = [{ label: 'Shipping', url: 'https://example.com/shipping' }];

  it('storefront dark: hazard stripe, numbered columns, node row and the status strip', () => {
    h.settings = settings();
    const { container } = render(<CyberFooter {...base({ nodeLabel: 'LDN_02' })} supportLinks={links} hasChat={false} />);
    expect(container.querySelector('.cb-hazard')).toBeInTheDocument();
    expect(container.querySelector('.cb-rule')).toBeNull();
    expect(screen.getByRole('heading', { name: '/02 Support' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shipping' })).toHaveAttribute('href', 'https://example.com/shipping');
    expect(container.querySelector('.cb-footer__nodes')).toHaveTextContent('LDN_02');
    expect(container.querySelector('[data-cb="status"]')).toHaveTextContent('CONNECTION SECURE');
  });

  it('light scheme swaps the hazard stripe for a bold rule', () => {
    h.settings = settings();
    const { container } = render(<CyberFooter {...base({}, { scheme: 'light' })} supportLinks={[]} hasChat={false} />);
    expect(container.querySelector('.cb-hazard')).toBeNull();
    expect(container.querySelector('.cb-rule')).toBeInTheDocument();
  });

  it('the status strip gives way to the phone cart bar, and to the option', () => {
    h.settings = settings();
    h.bar = true;
    const { container, rerender } = render(<CyberFooter {...base()} supportLinks={[]} hasChat={false} />);
    expect(container.querySelector('[data-cb="status"]')).toBeNull();
    h.bar = false;
    rerender(<CyberFooter {...base({ statusBar: false })} supportLinks={[]} hasChat={false} />);
    expect(container.querySelector('[data-cb="status"]')).toBeNull();
  });

  it('menu layout: only the status strip, or nothing', () => {
    h.settings = settings();
    const { container, rerender } = render(<CyberFooter {...base({}, { layout: 'menu' })} supportLinks={links} hasChat={false} />);
    expect(container.querySelector('.cb-footer--compact [data-cb="status"]')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Shipping' })).toBeNull();
    rerender(<CyberFooter {...base({ statusBar: false }, { layout: 'menu' })} supportLinks={links} hasChat={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('CyberButtonAdornment', () => {
  it('adds ↗ to primary buttons only, flagged for the main CTA', () => {
    h.settings = settings();
    const { container, rerender } = render(<CyberButtonAdornment {...base()} variant="primary" cta />);
    expect(container.querySelector('svg.cb-arrow')).toHaveAttribute('data-cta', 'true');
    rerender(<CyberButtonAdornment {...base()} variant="primary" cta={false} />);
    expect(container.querySelector('svg.cb-arrow')).toHaveAttribute('data-cta', 'false');
    rerender(<CyberButtonAdornment {...base()} variant="secondary" cta={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('cyber-brutalism template.css', () => {
  const css = readFromTest('../src/templates/cyber-brutalism/template.css');
  const rules = cssRules(css);
  const ROOT = ':root[data-sf-template="cyber-brutalism"]';
  const find = (sel: string, atRule: string | null = null) => rules.find((r) => r.selector === sel && r.atRule === atRule);

  it('scopes every selector under the template root', () => {
    expect(rules.length).toBeGreaterThan(40);
    for (const r of rules) for (const s of splitSelectors(r.selector)) expect(s.startsWith(ROOT), s).toBe(true);
  });

  it('has zero radius everywhere except the round status dot', () => {
    for (const r of rules) {
      for (const m of r.body.matchAll(/border-radius:\s*([^;]+);/g)) {
        if (r.selector.includes('.cb-status__dot')) continue;
        expect(m[1]!.trim(), r.selector).toBe('0');
      }
    }
  });

  it('casts no shadows and blurs nothing', () => {
    for (const r of rules) {
      for (const m of r.body.matchAll(/box-shadow:\s*([^;]+);/g)) expect(m[1]!.trim(), r.selector).toBe('none');
      for (const m of r.body.matchAll(/backdrop-filter:\s*([^;]+);/g)) expect(m[1]!.trim(), r.selector).toBe('none');
    }
    // blur removal itself comes from tokens.glass = 'off' (asserted in the manifest test) — the stylesheet
    // must not re-target the glass classes
    expect(css).not.toMatch(/\.glass|\.mantine-Overlay-root/);
  });

  it('runs every animation only when motion is welcome', () => {
    for (const r of rules) {
      const m = /animation:\s*([^;]+);/.exec(r.body);
      if (m && m[1]!.trim() !== 'none') expect(r.atRule ?? '', r.selector).toContain('prefers-reduced-motion: no-preference');
    }
  });

  it('collapses the wide system readouts under 480px and keeps the bar one line', () => {
    const narrow = rules.filter((r) => r.atRule?.includes('max-width: 29.99em'));
    expect(narrow.some((r) => r.selector.includes('[data-cb-wide]') && r.body.includes('display: none'))).toBe(true);
    expect(narrow.some((r) => r.selector.includes('.cb-cross') && r.body.includes('display: none'))).toBe(true);
    const bar = find(`${ROOT} .cb-sysbar`)!;
    expect(bar.body).toContain('white-space: nowrap');
    expect(bar.body).toContain('overflow: hidden');
  });

  it('restyles the phone cart bar as the status strip, ink-and-acid in light mode', () => {
    expect(find(`${ROOT} [data-sf-part="cart-bar"]`)!.body).toContain('background: var(--cb-bar-bg)');
    const light = find(`${ROOT}[data-mantine-color-scheme="light"]`)!;
    expect(light.body).toContain('--cb-bar-bg: #111111');
    expect(light.body).toContain('--cb-bar-fg: var(--cb-signal)');
  });

  it('keeps the strip line inside the shell 76px cart-bar clearance and leaves a blocked checkout looking disabled', () => {
    // bar = 12px strip + .inner (0.5rem + 48px checkout + 0.5rem) = 76px; the brutalist border-top is 0
    expect(find(`${ROOT} [data-sf-part="cart-bar"]`)!.body).toContain('padding-top: 12px');
    const line = find(`${ROOT} [data-sf-part="cart-bar"]::before`)!.body;
    expect(line).toContain('position: absolute');
    expect(line).toContain('height: 12px');
    const btn = rules.filter((r) => r.selector.includes('[data-sf-part="cart-bar"] [data-sf-part="button"]'));
    expect(btn.length).toBeGreaterThan(0);
    for (const r of btn) for (const s of splitSelectors(r.selector)) expect(s, s).toContain(':not(:disabled)');
  });

  it('leaves the native solid fill alone (no fill/text/border on filled buttons, no disabled override)', () => {
    for (const r of rules.filter((x) => x.selector.includes('[data-variant="filled"]'))) {
      expect(r.body, r.selector).not.toMatch(/(^|;)\s*(background|color|border)(-color)?\s*:/);
    }
    expect(rules.some((r) => r.selector.includes(':is(:disabled'))).toBe(false);
  });

  it('gives every button part the locked button voice (custom CTAs hard-code theirs)', () => {
    const b = find(`${ROOT} [data-sf-part="button"]`)!.body;
    for (const v of ['font-family: var(--sf-btn-font)', 'text-transform: var(--sf-btn-transform)', 'font-weight: var(--sf-btn-weight)', 'letter-spacing: var(--sf-btn-tracking-md)']) expect(b).toContain(v);
  });

  it('applies the heading tokens (uppercase 700) to every page and group title', () => {
    for (const part of ['page-title', 'group-title']) {
      const b = find(`${ROOT} [data-sf-part="${part}"]`)!.body;
      for (const v of ['var(--sf-heading-weight)', 'var(--sf-heading-tracking)', 'var(--sf-heading-transform)']) expect(b, part).toContain(v);
    }
  });

  it('pads product cards so content never touches the 1px border', () => {
    expect(find(`${ROOT} [data-sf-part="product-card"]`)!.body).toMatch(/padding:/);
  });

  it('keeps footer crosshairs inside the footer (no horizontal overflow at 768/1280)', () => {
    expect(find(`${ROOT} .cb-footer`)!.body).toContain('overflow-x: clip');
    for (const at of ['tr', 'br']) expect(find(`${ROOT} .cb-footer__inner > .cb-cross[data-at="${at}"]`)!.body, at).toContain('right: 0');
    for (const at of ['tl', 'bl']) expect(find(`${ROOT} .cb-footer__inner > .cb-cross[data-at="${at}"]`)!.body, at).toContain('left: 0');
  });

  it('keeps overlays tap-transparent and footer links 44px tall', () => {
    expect(find(`${ROOT} .cb-frame`)!.body).toContain('pointer-events: none');
    expect(find(`${ROOT} .cb-cross`)!.body).toContain('pointer-events: none');
    expect(find(`${ROOT} .cb-footer__link`)!.body).toContain('min-height: 44px');
    expect(find(`${ROOT} [data-sf-slot="Footer"] a`)!.body).toContain('min-height: 44px');
  });

  it('gives footer links a 44px tap target in both dimensions (controller ruling)', () => {
    expect(find(`${ROOT} .cb-footer__link`)!.body).toContain('min-width: 44px');
    expect(find(`${ROOT} [data-sf-slot="Footer"] a`)!.body).toContain('min-width: 44px');
  });

  it('wraps a long brand name instead of widening the page, at the spec size', () => {
    const name = find(`${ROOT} .cb-hero__name`)!.body;
    expect(name).toContain('overflow-wrap: anywhere');
    expect(name).toContain('font-size: clamp(2.5rem, 10vw, 7rem)'); // spec §4.3
  });
});

describe('cyber-brutalism preview', () => {
  it('declares the committed preview image', () => {
    expect(manifest.preview).toBe('./preview.webp');
    expect(readFromTest('../src/templates/cyber-brutalism/preview.webp').length).toBeGreaterThan(1000);
  });
});
