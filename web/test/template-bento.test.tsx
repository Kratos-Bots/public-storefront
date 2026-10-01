import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { OptionValues, SlotBaseProps } from '@/templates/contract.ts';
import { cssRules, readFromTest, splitSelectors } from './helpers/css-rules.ts';

const h = vi.hoisted(() => ({ settings: {} as StorefrontSettings, next: null as null | { day: string; cutoff: string; shipsOn: string; isToday: boolean; at: Date; msRemaining: number } }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));
vi.mock('@/lib/server-clock.ts', () => ({
  useServerClock: () => new Date('2026-08-24T09:05:07.000Z'),
  useCutoffInfo: () => ({ timezone: 'UTC', next: h.next }),
}));

import { BentoCatalogHero } from '@/templates/bento/slots/BentoCatalogHero.tsx';
import { BentoFooter } from '@/templates/bento/slots/BentoFooter.tsx';
import { BentoOverlay } from '@/templates/bento/slots/BentoOverlay.tsx';
import manifest from '@/templates/bento/manifest.ts';
import { validateManifest } from '@/templates/define.ts';
import { allTemplates, getTemplate, lookupManifest } from '@/templates/registry.ts';
import { resolveTheme } from '@/templates/resolve.ts';
import type { Theme } from '@/types/settings.ts';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('bento manifest', () => {
  it('is a valid contract-1 manifest discovered as a built-in', () => {
    expect(validateManifest(manifest, 'bento')).toEqual([]);
    expect(allTemplates().map((t) => t.manifest.id)).toContain('bento');
    expect(getTemplate('bento').builtIn).toBe(true);
  });

  it('offers a dark and a light preset per store type, tech-dark by default', () => {
    expect(manifest.defaultPreset).toBe('tech-dark');
    const types = ['tech', 'fashion', 'wellness', 'home', 'grocery', 'mono'];
    expect(manifest.presets.map((p) => p.id)).toEqual(types.flatMap((t) => [`${t}-dark`, `${t}-light`]));
    for (const p of manifest.presets) expect(p.scheme, p.id).toBe(p.id.endsWith('-dark') ? 'dark' : 'light');
    expect(manifest.schemes).toEqual(['dark', 'light']);
  });

  it('keeps the brief\'s accent per store type', () => {
    const accent = Object.fromEntries(manifest.presets.map((p) => [p.id, p.colors.primary]));
    expect(accent).toMatchObject({ 'tech-dark': '#3b82f6', 'fashion-dark': '#f97316', 'home-dark': '#f59e0b' });
  });

  it('every preset accent reads at >= 4.5:1 on its background (and so does the --sf-bg label on an accent fill)', () => {
    for (const p of manifest.presets) expect(contrast(p.colors.primary, p.colors.bg), p.id).toBeGreaterThanOrEqual(4.5);
  });

  it('every preset keeps muted text at >= 4.5:1 on both ground and surface', () => {
    for (const p of manifest.presets) {
      expect(contrast(p.colors.muted, p.colors.bg), p.id).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.colors.muted, p.colors.surface), p.id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('uses one card radius with a smaller nested button radius, and a real display face', () => {
    expect(manifest.tokens.card.radius).toBe(18);
    expect(manifest.tokens.button.radius).toBe(12);
    expect(manifest.tokens.button.transform).toBe('none');
    expect(manifest.tokens.label.style).toBe('plain');
    for (const p of manifest.presets) {
      expect(p.fonts.heading?.family).toBe('Bricolage Grotesque');
      expect(p.fonts.mono).toBeNull();
    }
  });
});

describe('bento locks', () => {
  const tech = manifest.presets[0]!;
  const stored: Theme = {
    template: 'bento', preset: 'fashion-light', options: {},
    scheme: 'dark',
    colors: { ...tech.colors, primary: '#ff0000' },
    fonts: { heading: 'Comic Neue', body: null, mono: null },
    radius: 'sm', density: 'compact', customCss: '',
  };

  it('keeps colours, density and a supported scheme; forces radius and fonts back to the preset', () => {
    const r = resolveTheme(stored, lookupManifest);
    expect(r.templateId).toBe('bento');
    expect(r.scheme).toBe('dark');
    expect(r.radius).toBe('lg');
    expect(r.fonts.heading).toEqual({ family: 'Bricolage Grotesque', weights: [600, 700, 800] });
    expect(r.colors.primary).toBe('#ff0000');
    expect(r.density).toBe('compact');
  });

  it('defaults every option on', () => {
    expect(resolveTheme(stored, lookupManifest).options).toEqual({ showPageTitle: true, showCatalogIntro: true, showSectionLabels: true, showSku: true, showCategoryPicker: true, headerAccountIcon: 'all', headerCartIcon: 'all', showCutoffBar: true, cutoffMessage: '', showCutoffCountdown: true, showCategoryEmoji: true, showOutOfStockPrice: true, dispatch: true, contact: true, featured: true, showFooter: true });
  });
});

function settings(over: { ordering?: boolean; whatsapp?: string | null } = {}): StorefrontSettings {
  return {
    enabled: true,
    serverTime: '2026-08-24T09:05:07.000Z',
    cutoffs: { timezone: 'UTC', days: {} },
    brand: { name: 'Voltline', shortName: 'Voltline', tagline: 'Chargers and cables that last', title: 'Voltline', description: '', logoUrl: null, faviconUrl: null, logoHeight: 28, links: { whatsapp: over.whatsapp ?? null, telegram: null } },
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

const NEXT = { day: 'tue', cutoff: '15:00', shipsOn: 'same day', isToday: true, at: new Date('2026-08-24T15:00:00.000Z'), msRemaining: 6 * 3600_000 };

afterEach(() => {
  cleanup();
  h.next = null;
});

describe('BentoCatalogHero', () => {
  const hero = { tagline: 'Chargers and cables that last', welcomeMessage: 'Orders before 3pm ship today.', productCount: 42, categoryCount: 5 };
  const cells = (c: HTMLElement) => Array.from(c.querySelectorAll('.bento-board > .bento-cell'));

  it('grid: tagline hero, accent stock cell, categories and ordering status from real data', () => {
    h.settings = settings();
    const { container } = render(<BentoCatalogHero {...base()} surface="grid" {...hero} />);
    expect(container.querySelector('[data-sf-part="hero"]')).toHaveAttribute('data-hero', 'on');
    expect(container.querySelector('.bento-hero__headline')).toHaveTextContent('Chargers and cables that last');
    expect(screen.getByText('Orders before 3pm ship today.')).toBeInTheDocument();
    expect(container.querySelector('.bento-stat__num')).toHaveTextContent('42');
    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByText('Categories')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Taking orders')).toBeInTheDocument();
    expect(cells(container)).toHaveLength(4);
  });

  it('never promotes the welcome message to the display line: the shop name heads it instead', () => {
    h.settings = settings();
    const { container } = render(<BentoCatalogHero {...base()} surface="grid" {...hero} tagline="" />);
    expect(container.querySelector('.bento-hero__headline')).toHaveTextContent('Voltline');
    expect(container.querySelector('.bento-hero__body')).toHaveTextContent('Orders before 3pm ship today.');
  });

  it('without tagline or welcome, drops the hero cell and keeps the facts', () => {
    h.settings = settings();
    const { container } = render(<BentoCatalogHero {...base()} surface="grid" {...hero} tagline="" welcomeMessage={null} />);
    expect(container.querySelector('[data-sf-part="hero"]')).toHaveAttribute('data-hero', 'off');
    expect(container.querySelector('.bento-cell--hero')).toBeNull();
    expect(container.querySelector('.bento-stat__num')).toHaveTextContent('42');
  });

  it('singular counts, no categories cell, and the ordering cell stretches into its place', () => {
    h.settings = settings({ ordering: false });
    const { container } = render(<BentoCatalogHero {...base()} surface="grid" {...hero} productCount={1} categoryCount={0} />);
    expect(screen.getByText('Product')).toBeInTheDocument();
    expect(screen.queryByText('Categories')).toBeNull();
    const status = container.querySelector('[data-state]')!;
    expect(status).toHaveAttribute('data-state', 'paused');
    expect(status).toHaveTextContent('Paused');
    expect(status).toHaveTextContent('Ordering paused');
    expect(status).toHaveClass('bento-cell--tall');
  });

  it('dispatch cell shows the real next cut-off, and only when the option is on', () => {
    h.settings = settings();
    h.next = NEXT;
    const { container, rerender } = render(<BentoCatalogHero {...base()} surface="grid" {...hero} />);
    expect(screen.getByText(/Order by/)).toHaveTextContent('Order by 15:00 today');
    expect(screen.getByText('for same day dispatch')).toBeInTheDocument();
    expect(container.querySelector('time')).toHaveAttribute('dateTime', NEXT.at.toISOString());
    // alone in its row it spans the full width
    expect(container.querySelector('.bento-cell--wide')).toHaveClass('bento-cell--full');
    h.next = { ...NEXT, isToday: false, day: 'wed', shipsOn: 'next day' };
    rerender(<BentoCatalogHero {...base()} surface="grid" {...hero} />);
    expect(screen.getByText(/Order by/)).toHaveTextContent('Order by 15:00 Wednesday');
    rerender(<BentoCatalogHero {...base({ dispatch: false })} surface="grid" {...hero} />);
    expect(screen.queryByText(/Order by/)).toBeNull();
  });

  it('contact cell appears only with a chat link and the option on; paired with dispatch neither is full width', () => {
    h.settings = settings({ whatsapp: 'https://wa.me/447700900000' });
    h.next = NEXT;
    const { container, rerender } = render(<BentoCatalogHero {...base()} surface="grid" {...hero} />);
    expect(screen.getByText('Questions before you order?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/447700900000');
    expect(container.querySelectorAll('.bento-cell--wide')).toHaveLength(2);
    expect(container.querySelector('.bento-cell--full')).toBeNull();
    rerender(<BentoCatalogHero {...base({ contact: false })} surface="grid" {...hero} />);
    expect(screen.queryByText('Questions before you order?')).toBeNull();
  });

  it('never puts a button in the board', () => {
    h.settings = settings({ whatsapp: 'https://wa.me/447700900000' });
    h.next = NEXT;
    const { container } = render(<BentoCatalogHero {...base()} surface="grid" {...hero} />);
    expect(container.querySelector('button, [data-sf-part="button"]')).toBeNull();
  });

  it('list and wholesale surfaces render only the welcome line', () => {
    h.settings = settings();
    const { container, rerender } = render(<BentoCatalogHero {...base()} surface="list" {...hero} />);
    expect(container.querySelector('.bento-welcome')).toHaveTextContent('Orders before 3pm ship today.');
    expect(container.querySelector('.bento-board')).toBeNull();
    rerender(<BentoCatalogHero {...base()} surface="wholesale" {...hero} welcomeMessage={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('BentoFooter', () => {
  const links = [{ label: 'Shipping', url: 'https://example.com/shipping' }];

  it('storefront: brand, support and chat cells', () => {
    h.settings = settings({ whatsapp: 'https://wa.me/447700900000' });
    const { container } = render(<BentoFooter {...base()} supportLinks={links} hasChat />);
    expect(container.querySelector('[data-sf-part="footer"]')).toBeInTheDocument();
    expect(container.querySelectorAll('.bento-cell')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Support' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shipping' })).toHaveAttribute('href', 'https://example.com/shipping');
    expect(screen.getByRole('heading', { name: 'Talk to us' })).toBeInTheDocument();
  });

  it('showFooter off removes the footer entirely', () => {
    h.settings = settings({ whatsapp: 'https://wa.me/447700900000' });
    const { container } = render(<BentoFooter {...base({ showFooter: false })} supportLinks={links} hasChat />);
    expect(container).toBeEmptyDOMElement();
  });

  it('menu layout has no footer, same as modern', () => {
    h.settings = settings();
    const { container } = render(<BentoFooter {...base({}, { layout: 'menu' })} supportLinks={links} hasChat={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('BentoOverlay', () => {
  it('draws nothing, and only flags the featured option when it is off', () => {
    h.settings = settings();
    const { container, rerender } = render(<BentoOverlay {...base()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<BentoOverlay {...base({ featured: false })} />);
    expect(container.querySelector('[data-bento-featured="off"]')).toHaveAttribute('hidden');
  });
});

describe('bento template.css', () => {
  const css = readFromTest('../src/templates/bento/template.css');
  const rules = cssRules(css);
  const ROOT = ':root[data-sf-template="bento"]';
  const find = (sel: string, atRule: string | null = null) => rules.find((r) => r.selector === sel && r.atRule === atRule);
  const findPart = (part: string) => rules.find((r) => r.atRule === null && splitSelectors(r.selector).includes(`${ROOT} [data-sf-part="${part}"]`));

  it('scopes every selector under the template root', () => {
    expect(rules.length).toBeGreaterThan(30);
    for (const r of rules) for (const s of splitSelectors(r.selector)) expect(s.startsWith(ROOT), s).toBe(true);
  });

  it('runs every animation and every lift only when motion is welcome', () => {
    for (const r of rules) {
      const m = /animation:\s*([^;]+);/.exec(r.body);
      if (m && m[1]!.trim() !== 'none') expect(r.atRule ?? '', r.selector).toContain('prefers-reduced-motion: no-preference');
      if (/transform:\s*(translateY|scale)/.test(r.body)) expect(r.atRule ?? '', r.selector).toContain('prefers-reduced-motion: no-preference');
    }
  });

  it('never puts the accent on prices', () => {
    expect(findPart('price')!.body).toContain('color: var(--sf-text)');
    for (const r of rules.filter((x) => x.selector.includes('[data-sf-part="price"]'))) expect(r.body).not.toContain('var(--sf-primary)');
  });

  it('fills exactly one board cell with the accent', () => {
    const filled = rules.filter((r) => /background:\s*var\(--sf-primary\)/.test(r.body));
    expect(filled.map((r) => r.selector)).toEqual([`${ROOT} .bento-cell--stock`]);
    expect(filled[0]!.body).toContain('color: var(--sf-bg)');
  });

  it('applies the heading tokens to every page and group title, and to the menu sheet title', () => {
    for (const part of ['page-title', 'group-title', 'sheet-title']) {
      const b = findPart(part)!.body;
      for (const v of ['var(--sf-heading-weight)', 'var(--sf-heading-tracking)', 'var(--sf-heading-transform)']) expect(b, part).toContain(v);
    }
  });

  it('gives every button part the locked button voice (custom CTAs hard-code theirs)', () => {
    const b = find(`${ROOT} [data-sf-part="button"]`)!.body;
    for (const v of ['font-family: var(--sf-btn-font)', 'text-transform: var(--sf-btn-transform)', 'font-weight: var(--sf-btn-weight)', 'letter-spacing: var(--sf-btn-tracking-md)']) expect(b).toContain(v);
  });

  it('never clips product cards, so the stretched link keeps its outset focus ring', () => {
    for (const r of rules.filter((x) => x.selector.includes('[data-sf-part="product-card"]'))) {
      expect(r.body, r.selector).not.toMatch(/overflow(-[xy])?:\s*(hidden|clip)/);
    }
  });

  it('promotes only the first catalogue tile, and only while the featured option is on', () => {
    const promoted = rules.filter((r) => /grid-(column|row):\s*span 2/.test(r.body) && r.selector.includes('product-card'));
    expect(promoted.length).toBe(2);
    for (const r of promoted) {
      expect(r.selector).toContain(':not(:has([data-bento-featured="off"]))');
      expect(r.selector).toContain('[data-sf-part="product-grid"] > [data-sf-part="product-card"]:first-child');
    }
    // phones: 2 columns wide only; the 2×2 tile waits for 48em
    expect(promoted.find((r) => r.atRule === null)!.body).not.toContain('grid-row');
    expect(promoted.find((r) => r.atRule === '@media (min-width: 48em)')!.body).toContain('grid-row: span 2');
  });

  it('gives links inside cells a 44×44 target', () => {
    const a = find(`${ROOT} .bento-cell a`)!.body;
    expect(a).toContain('min-height: 44px');
    expect(a).toContain('min-width: 44px');
  });

  it('uses one radius for every cell and tile', () => {
    expect(css).toContain('--bento-radius: 18px;');
    for (const sel of ['.bento-cell', '.bento-welcome', '[data-sf-part="product-card"]']) {
      expect(find(`${ROOT} ${sel}`)!.body, sel).toContain('border-radius: var(--bento-radius)');
    }
  });

  it('respects the bottom safe area in the footer', () => {
    expect(find(`${ROOT} .bento-footer`)!.body).toContain('env(safe-area-inset-bottom');
  });
});

describe('bento preview', () => {
  it('declares the committed preview image', () => {
    expect(manifest.preview).toBe('./preview.webp');
    expect(readFromTest('../src/templates/bento/preview.webp').length).toBeGreaterThan(1000);
  });
});
