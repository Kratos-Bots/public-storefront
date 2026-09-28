import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { OptionValues, SlotBaseProps } from '@/templates/contract.ts';
import { cssRules, readFromTest, splitSelectors } from './helpers/css-rules.ts';

const h = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));

import { LuxuryOverlay } from '@/templates/dark-luxury/slots/LuxuryOverlay.tsx';
import { LuxuryCatalogHero } from '@/templates/dark-luxury/slots/LuxuryCatalogHero.tsx';
import { LuxurySectionLabel } from '@/templates/dark-luxury/slots/LuxurySectionLabel.tsx';
import { LuxuryFooter } from '@/templates/dark-luxury/slots/LuxuryFooter.tsx';
import manifest from '@/templates/dark-luxury/manifest.ts';
import { validateManifest } from '@/templates/define.ts';
import { allTemplates, getTemplate, lookupManifest } from '@/templates/registry.ts';
import { resolveTheme } from '@/templates/resolve.ts';
import { splitHeadline } from '@/templates/dark-luxury/slots/headline.ts';
import type { Theme } from '@/types/settings.ts';

describe('dark-luxury manifest', () => {
  it('is a valid contract-1 manifest discovered as a built-in', () => {
    expect(validateManifest(manifest, 'dark-luxury')).toEqual([]);
    expect(allTemplates().map((t) => t.manifest.id)).toContain('dark-luxury');
    expect(getTemplate('dark-luxury').builtIn).toBe(true);
  });

  it('offers Gold (default), Silver, Emerald and Crimson — all dark', () => {
    expect(manifest.defaultPreset).toBe('gold');
    expect(manifest.presets.map((p) => p.id)).toEqual(['gold', 'silver', 'emerald', 'crimson']);
    expect(manifest.schemes).toEqual(['dark']);
    expect(manifest.presets.every((p) => p.scheme === 'dark' && p.radius === 'lg')).toBe(true);
    expect(manifest.presets[0]!.colors).toMatchObject({ primary: '#d4a03c', bg: '#0a0907', surface: '#161412', text: '#f0ebe0' });
  });

  it('never fills buttons with the accent and never borders cards', () => {
    expect(manifest.tokens.button.fill).toBe('outline-glow');
    expect(manifest.tokens.card.border).toBe('none');
    expect(manifest.tokens.card.shadow).toContain('inset 0 1px 0');
    expect(manifest.tokens.label.style).toBe('bracket');
    expect(manifest.tokens.chassis).toBe('flat');
  });
});

describe('dark-luxury locks', () => {
  const gold = manifest.presets[0]!;
  const stored: Theme = {
    template: 'dark-luxury', preset: 'gold', options: {},
    scheme: 'light',
    colors: { ...gold.colors, primary: '#ff0000' },
    fonts: { heading: 'Comic Neue', body: null, mono: null },
    radius: 'sm', density: 'compact', customCss: '',
  };

  it('keeps colours and density, forces scheme, radius and fonts back to the preset', () => {
    const r = resolveTheme(stored, lookupManifest);
    expect(r.templateId).toBe('dark-luxury');
    expect(r.scheme).toBe('dark');
    expect(r.radius).toBe('lg');
    expect(r.fonts.heading).toBeNull();
    expect(r.fonts.body).toBeNull();
    expect(r.fonts.mono).toEqual({ family: 'JetBrains Mono', weights: [400, 500] });
    expect(r.colors.primary).toBe('#ff0000');
    expect(r.density).toBe('compact');
  });

  it('defaults every option on', () => {
    expect(resolveTheme(stored, lookupManifest).options).toEqual({ grain: true, orb: true, statusBadge: true });
  });
});

describe('splitHeadline', () => {
  it('brightens the last third of the words (at least one)', () => {
    expect(splitHeadline('Pure botanical extracts, lab verified')).toEqual({ muted: 'Pure botanical extracts,', bright: 'lab verified' });
    expect(splitHeadline('Small batch oils')).toEqual({ muted: 'Small batch', bright: 'oils' });
    expect(splitHeadline('Handmade candles')).toEqual({ muted: 'Handmade', bright: 'candles' });
  });
  it('handles one word, blanks and messy spacing', () => {
    expect(splitHeadline('Aurum')).toEqual({ muted: '', bright: 'Aurum' });
    expect(splitHeadline('   ')).toEqual({ muted: '', bright: '' });
    expect(splitHeadline('  Rare   resins  here ')).toEqual({ muted: 'Rare resins', bright: 'here' });
  });
});

function settings(over: { ordering?: boolean; tagline?: string } = {}): StorefrontSettings {
  return {
    enabled: true,
    serverTime: '2026-08-24T09:05:07.000Z',
    cutoffs: { timezone: 'UTC', days: {} },
    brand: { name: 'Aurum', shortName: 'Aurum', tagline: over.tagline ?? 'Rare resins, slow made', title: 'Aurum', description: '', logoUrl: null, faviconUrl: null, logoHeight: 28, links: { whatsapp: null, telegram: null } },
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

afterEach(cleanup);

describe('LuxuryOverlay', () => {
  it('renders the grain layer when the option is on, nothing when off', () => {
    h.settings = settings();
    const { container, rerender } = render(<LuxuryOverlay {...base()} />);
    expect(container.querySelector('[data-lux="grain"]')).toBeInTheDocument();
    rerender(<LuxuryOverlay {...base({ grain: false })} />);
    expect(container.querySelector('[data-lux="grain"]')).toBeNull();
  });
});

describe('LuxuryCatalogHero', () => {
  const hero = { tagline: 'Rare resins, slow made', welcomeMessage: 'Dispatched daily.', productCount: 42, categoryCount: 5 };

  it('grid: badge with real counts, colour-split headline, welcome and orb', () => {
    h.settings = settings();
    const { container } = render(<LuxuryCatalogHero {...base()} surface="grid" {...hero} />);
    expect(screen.getByText('42 products · 5 categories')).toBeInTheDocument();
    expect(container.querySelector('.lux-hero__muted')).toHaveTextContent('Rare resins,');
    expect(container.querySelector('.lux-hero__bright')).toHaveTextContent('slow made');
    expect(screen.getByText('Dispatched daily.')).toBeInTheDocument();
    expect(container.querySelector('[data-lux="orb"]')).toBeInTheDocument();
    expect(container.querySelector('[data-sf-part="hero"]')).toBeInTheDocument();
  });

  it('grid: orb off, no category count, headline absent without a tagline', () => {
    h.settings = settings();
    const { container } = render(<LuxuryCatalogHero {...base({ orb: false })} surface="grid" {...hero} tagline="" categoryCount={0} />);
    expect(container.querySelector('[data-lux="orb"]')).toBeNull();
    expect(container.querySelector('.lux-hero__headline')).toBeNull();
    expect(screen.getByText('42 products')).toBeInTheDocument();
  });

  it('grid with neither tagline nor welcome renders nothing (same as modern)', () => {
    h.settings = settings();
    const { container } = render(<LuxuryCatalogHero {...base()} surface="grid" {...hero} tagline="" welcomeMessage={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('list and wholesale surfaces render only the welcome line', () => {
    h.settings = settings();
    const { container, rerender } = render(<LuxuryCatalogHero {...base()} surface="list" {...hero} />);
    expect(container.querySelector('.lux-welcome')).toHaveTextContent('Dispatched daily.');
    expect(container.querySelector('.lux-hero')).toBeNull();
    rerender(<LuxuryCatalogHero {...base()} surface="wholesale" {...hero} welcomeMessage={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('LuxurySectionLabel', () => {
  it('labels the page [Catalogue] and groups [01], [02]…', () => {
    h.settings = settings();
    const { container, rerender } = render(<LuxurySectionLabel {...base()} index={1} title="All products" level="page" />);
    expect(container.querySelector('[data-sf-part="section-label"]')).toHaveTextContent('[Catalogue]');
    rerender(<LuxurySectionLabel {...base()} index={7} title="Resins" level="group" />);
    expect(container.querySelector('[data-sf-part="section-label"]')).toHaveTextContent('[07]');
  });
});

describe('LuxuryFooter', () => {
  const links = [{ label: 'Shipping', url: 'https://example.com/shipping' }];

  it('storefront: panel with tagline, [Support] links and an open status badge', () => {
    h.settings = settings();
    const { container } = render(<LuxuryFooter {...base()} supportLinks={links} hasChat={false} />);
    expect(container.querySelector('[data-sf-part="footer"]')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '[Support]' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shipping' })).toHaveAttribute('href', 'https://example.com/shipping');
    expect(container.querySelector('.lux-status')).toHaveAttribute('data-state', 'open');
    expect(container.querySelector('.lux-status')).toHaveTextContent('[ACCEPTING ORDERS]');
  });

  it('reads [ORDERING PAUSED] when ordering is off', () => {
    h.settings = settings({ ordering: false });
    const { container } = render(<LuxuryFooter {...base()} supportLinks={[]} hasChat={false} />);
    expect(container.querySelector('.lux-status')).toHaveAttribute('data-state', 'paused');
    expect(container.querySelector('.lux-status')).toHaveTextContent('[ORDERING PAUSED]');
  });

  it('statusBadge off hides the badge; menu layout gets the compact panel or nothing', () => {
    h.settings = settings();
    const { container, rerender } = render(<LuxuryFooter {...base({ statusBadge: false })} supportLinks={[]} hasChat={false} />);
    expect(container.querySelector('.lux-status')).toBeNull();
    rerender(<LuxuryFooter {...base({}, { layout: 'menu' })} supportLinks={links} hasChat={false} />);
    expect(container.querySelector('.lux-footer--compact')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Shipping' })).toBeNull();
    rerender(<LuxuryFooter {...base({ statusBadge: false }, { layout: 'menu' })} supportLinks={links} hasChat={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('dark-luxury template.css', () => {
  const css = readFromTest('../src/templates/dark-luxury/template.css');
  const rules = cssRules(css);
  const ROOT = ':root[data-sf-template="dark-luxury"]';
  const find = (sel: string, atRule: string | null = null) => rules.find((r) => r.selector === sel && r.atRule === atRule);

  it('scopes every selector under the template root', () => {
    expect(rules.length).toBeGreaterThan(30);
    for (const r of rules) for (const s of splitSelectors(r.selector)) expect(s.startsWith(ROOT), s).toBe(true);
  });

  it('pulses only the main call to action', () => {
    const pulsing = rules.filter((r) => r.body.includes('sf-lux-pulse'));
    expect(pulsing.length).toBeGreaterThan(0);
    for (const r of pulsing) for (const s of splitSelectors(r.selector)) expect(s).toContain('[data-sf-cta="main"]');
  });

  it('runs every animation only when motion is welcome', () => {
    for (const r of rules) {
      const m = /animation:\s*([^;]+);/.exec(r.body);
      if (m && m[1]!.trim() !== 'none') expect(r.atRule ?? '', r.selector).toContain('prefers-reduced-motion: no-preference');
    }
  });

  it('keeps decoration out of the way of taps', () => {
    for (const cls of ['.lux-grain', '.lux-orb']) {
      const r = rules.find((x) => x.selector === `${ROOT} ${cls}` && x.atRule === null)!;
      expect(r.body, cls).toContain('pointer-events: none');
    }
    const hero = rules.find((x) => x.selector === `${ROOT} .lux-hero` && x.atRule === null)!;
    expect(hero.body).toContain('overflow: hidden'); // the 900px orb never widens the page
  });

  it('never fills a button with the accent', () => {
    for (const r of rules.filter((x) => x.selector.includes('[data-sf-part="button"]'))) {
      expect(r.body, r.selector).not.toMatch(/background(-color)?:\s*var\(--sf-primary\)/);
    }
  });

  it('leaves fill, text and border of filled buttons to the shared outline-glow rules', () => {
    const filled = rules.filter((x) => x.selector.includes('[data-variant="filled"]'));
    expect(filled.length).toBeGreaterThan(0);
    for (const r of filled) expect(r.body, r.selector).not.toMatch(/(^|;)\s*(background|color|border)(-color)?\s*:/);
    const disabled = filled.find((x) => x.selector.includes(':is(:disabled, [data-disabled])'))!;
    expect(disabled.body).toContain('box-shadow: none');
  });

  it('gives every button part the locked button voice (custom CTAs hard-code theirs)', () => {
    const b = find(`${ROOT} [data-sf-part="button"]`)!.body;
    for (const v of ['font-family: var(--sf-btn-font)', 'text-transform: var(--sf-btn-transform)', 'font-weight: var(--sf-btn-weight)', 'letter-spacing: var(--sf-btn-tracking-md)']) expect(b).toContain(v);
  });

  it('applies the heading tokens to every page and group title', () => {
    for (const part of ['page-title', 'group-title']) {
      const b = find(`${ROOT} [data-sf-part="${part}"]`)!.body;
      for (const v of ['var(--sf-heading-weight)', 'var(--sf-heading-tracking)', 'var(--sf-heading-transform)']) expect(b, part).toContain(v);
    }
  });

  it('rounds product cards to the card radius and pads their content', () => {
    const b = find(`${ROOT} [data-sf-part="product-card"]`)!.body;
    expect(b).toContain('border-radius: var(--sf-card-radius)');
    expect(b).toMatch(/padding:/);
  });

  it('lifts on hover only when motion is welcome', () => {
    for (const r of rules.filter((x) => /transform:\s*translateY/.test(x.body))) {
      expect(r.atRule ?? '', r.selector).toContain('prefers-reduced-motion: no-preference');
    }
  });

  it('gives footer links a 44×44 target', () => {
    const link = find(`${ROOT} .lux-footer__link`)!.body;
    expect(link).toContain('min-height: 44px');
    expect(link).toContain('min-width: 44px');
    expect(find(`${ROOT} [data-sf-slot="Footer"] a`)!.body).toContain('min-height: 44px');
  });
});

describe('dark-luxury preview', () => {
  it('declares the committed preview image', () => {
    expect(manifest.preview).toBe('./preview.webp');
    expect(readFromTest('../src/templates/dark-luxury/preview.webp').length).toBeGreaterThan(1000);
  });
});
