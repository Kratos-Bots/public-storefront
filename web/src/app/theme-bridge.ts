import { ActionIcon, Button, Drawer, Input, Modal, createTheme, type MantineThemeOverride } from '@mantine/core';
import { generateColors } from '@mantine/colors-generator';
import type { Brand } from '@/types/settings.ts';
import type { ButtonFill } from '@/templates/define.ts';
import type { ResolvedFonts, ResolvedTheme } from '@/templates/resolve.ts';
import { ROOT_ATTRIBUTE_NAMES, rootAttributes, tokenVariables } from '@/templates/tokens.ts';
import { mediaUrl } from '@/lib/media-url.ts';

/** The storefront's own face, self-hosted via @fontsource-variable/inter (imported in main.tsx). */
export const INTER = '"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SYSTEM_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export const THEME_STORAGE_KEY = 'sf-theme-v2';
export const LEGACY_THEME_STORAGE_KEY = 'sf-theme-v1';

function family(name: string | null | undefined, fallback: string): string { return name ? `"${name}", ${fallback}` : fallback; }

/**
 * Button's own varsResolver computes --button-bg/--button-color/--button-hover/
 * --button-hover-color/--button-bd/--button-fz and injects them as an inline
 * `style` attribute on the root (see @mantine/core's Button.tsx), so a
 * classNames-based CSS override (mantine.css's old `.sf-button[data-variant=…]`
 * rules) can never win — inline style always beats a stylesheet rule. Mantine
 * merges a theme-level `components.Button.vars` resolver in *after* the
 * component's own, so returning the values here instead is what actually wins.
 */
function buttonVariantVars(variant: string | undefined, fill: ButtonFill): Record<string, string> {
  switch (variant ?? 'filled') {
    case 'filled':
      if (fill === 'outline-glow') {
        return { '--button-bg': 'var(--sf-bg)', '--button-color': 'var(--sf-primary)', '--button-bd': '1px solid var(--sf-primary)', '--button-hover': 'var(--sf-surface)', '--button-hover-color': 'var(--sf-primary)' };
      }
      if (fill === 'ghost') {
        return { '--button-bg': 'transparent', '--button-color': 'var(--sf-primary)', '--button-bd': '1px solid var(--sf-line-strong)', '--button-hover': 'var(--sf-surface)', '--button-hover-color': 'var(--sf-primary)' };
      }
      return { '--button-bg': 'var(--sf-primary)', '--button-color': 'var(--sf-bg)', '--button-hover': 'var(--sf-primary-soft)', '--button-hover-color': 'var(--sf-bg)' };
    case 'default':
      return { '--button-bg': 'transparent', '--button-bd': '1px solid var(--sf-line-strong)', '--button-color': 'var(--sf-text)', '--button-hover': 'var(--sf-surface)' };
    case 'subtle':
      return { '--button-bg': 'transparent', '--button-color': 'var(--sf-muted)', '--button-hover': 'var(--sf-surface)', '--button-hover-color': 'var(--sf-text)' };
    default:
      return {};
  }
}

/** The size-responsive half of the mono voice — mirrors the letter-spacing steps in mantine.css. */
function buttonSizeVars(size: string | undefined): Record<string, string> {
  if (size === 'xs' || size === 'sm' || size === 'compact-xs' || size === 'compact-sm') return { '--button-fz': '11px' };
  if (size === 'lg' || size === 'xl') return { '--button-fz': '13px' };
  return { '--button-fz': '12px' };
}

/** Body, heading and "mono voice" stacks. The mono voice is the body face with
 *  tabular figures (the ecommerce-menu idiom) unless the store picks a real mono font. */
export function fontStacks(fonts: ResolvedFonts): { body: string; heading: string; mono: string } {
  const body = family(fonts.body?.family, INTER);
  return {
    body,
    heading: family((fonts.heading ?? fonts.body)?.family, INTER),
    mono: fonts.mono ? family(fonts.mono.family, SYSTEM_MONO) : body,
  };
}

/** Mix `hex` toward `toward` by `t` (0..1) in sRGB — enough for derived surfaces/lines. */
export function mix(hex: string, toward: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(toward);
  return '#' + a.map((c, i) => Math.round(c + (b[i]! - c) * t).toString(16).padStart(2, '0')).join('');
}

export function buildMantineTheme(theme: ResolvedTheme): MantineThemeOverride {
  const compact = theme.density === 'compact';
  const stacks = fontStacks(theme.fonts);
  const fill = theme.tokens.button.fill;
  return createTheme({
    primaryColor: 'brand',
    primaryShade: { light: 6, dark: 5 },
    colors: { brand: generateColors(theme.colors.primary) },
    fontFamily: stacks.body,
    fontFamilyMonospace: stacks.mono,
    headings: { fontFamily: stacks.heading, fontWeight: '600' },
    defaultRadius: theme.radius === 'none' ? 0 : theme.radius,
    respectReducedMotion: true,
    ...(compact
      ? {
          spacing: { xs: '0.5rem', sm: '0.625rem', md: '0.875rem', lg: '1.125rem', xl: '1.5rem' },
          fontSizes: { xs: '0.7rem', sm: '0.8rem', md: '0.9rem', lg: '1rem', xl: '1.15rem' },
        }
      : {}),
    other: { density: theme.density },
    components: {
      Drawer: Drawer.extend({ defaultProps: { transitionProps: { duration: 300, timingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }, overlayProps: { backgroundOpacity: 0.7, blur: 2 } } }),
      Modal: Modal.extend({ defaultProps: { transitionProps: { transition: 'pop', duration: 200, timingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }, overlayProps: { backgroundOpacity: 0.7, blur: 2 } } }),
      Button: Button.extend({
        defaultProps: { 'data-sf-part': 'button' },
        classNames: { root: 'sf-button' },
        vars: (_theme, props) => ({
          root: { '--button-radius': 'var(--sf-btn-radius)', ...buttonVariantVars(props.variant, fill), ...buttonSizeVars(props.size) },
        }),
      }),
      ActionIcon: ActionIcon.extend({ classNames: { root: 'sf-icon-button' } }),
      Input: Input.extend({ defaultProps: { 'data-sf-part': 'input' }, classNames: { input: 'sf-input' } }),
    },
  });
}

export function cssVariablesFor(theme: ResolvedTheme, brand: Pick<Brand, 'logoHeight'>): Record<string, string> {
  const dark = theme.scheme === 'dark';
  const c = theme.colors;
  const towardText = dark ? '#ffffff' : '#000000';
  const stacks = fontStacks(theme.fonts);
  return {
    '--sf-bg': c.bg,
    '--sf-bg-deep': mix(c.bg, dark ? '#000000' : '#ffffff', 0.18),
    '--sf-surface': c.surface,
    '--sf-surface-2': mix(c.surface, towardText, 0.07),
    '--sf-surface-3': mix(c.surface, towardText, 0.14),
    '--sf-line': mix(c.surface, towardText, 0.12),
    '--sf-line-strong': mix(c.surface, towardText, 0.24),
    '--sf-text': c.text,
    '--sf-muted': c.muted,
    '--sf-faint': mix(c.muted, c.bg, 0.35),
    '--sf-primary': c.primary,
    '--sf-primary-soft': mix(c.primary, c.bg, 0.75),
    '--sf-success': c.success,
    '--sf-warn': c.warn,
    '--sf-danger': c.danger,
    '--sf-logo-h': `${brand.logoHeight}px`,
    '--sf-font-heading': stacks.heading,
    '--sf-font-body': stacks.body,
    '--sf-font-mono': stacks.mono,
    ...tokenVariables(theme.tokens),
  };
}

/** One stylesheet for every distinct family; weights merged per family. A family whose only
 *  weight is 400 gets no wght axis — single-weight families (Share Tech Mono) 400 otherwise. */
export function googleFontsHref(fonts: ResolvedFonts): string | null {
  const byFamily = new Map<string, Set<number>>();
  for (const f of [fonts.heading, fonts.body, fonts.mono]) {
    if (!f) continue;
    const name = f.family.trim();
    const set = byFamily.get(name) ?? new Set<number>();
    for (const w of f.weights) set.add(w);
    byFamily.set(name, set);
  }
  if (byFamily.size === 0) return null;
  const q = [...byFamily].map(([name, set]) => {
    const weights = [...set].sort((a, b) => a - b);
    const fam = `family=${name.replace(/\s+/g, '+')}`;
    return weights.length === 1 && weights[0] === 400 ? fam : `${fam}:wght@${weights.join(';')}`;
  }).join('&');
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

function upsert<T extends HTMLElement>(selector: string, create: () => T): T {
  const existing = document.head.querySelector<T>(selector);
  if (existing) return existing;
  const el = create(); document.head.appendChild(el); return el;
}

/** What the first-paint script replays. Pre-computed so the script needs no theme logic. */
export interface StoredThemePayload {
  v: 2;
  templateId: string;
  vars: Record<string, string>;
  attrs: Record<string, string>;
  title: string;
  brandName: string;
  fontsHref: string | null;
}

/** Only these look like our own CSS custom properties — anything else in a stored `vars` blob
 *  (foreign, tampered, or from a future release with new var names) is dropped rather than
 *  replayed onto `<html>.style`. */
const SF_VAR_NAME_RE = /^--sf-[a-z0-9-]+$/;
/** Only a Google Fonts stylesheet URL is ever turned into a `<link>` — anything else in a stored
 *  `fontsHref` is dropped silently. */
const GOOGLE_FONTS_ORIGIN = 'https://fonts.googleapis.com/';

function sanitizeVars(vars: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (vars && typeof vars === 'object') {
    for (const [k, v] of Object.entries(vars as Record<string, unknown>)) {
      if (SF_VAR_NAME_RE.test(k) && typeof v === 'string') out[k] = v;
    }
  }
  return out;
}

/** Allowlisted to exactly `ROOT_ATTRIBUTE_NAMES` — the set `rootAttributes` emits — so a stored
 *  `attrs` blob can never set an arbitrary attribute (e.g. an event handler) on `<html>`. */
function sanitizeAttrs(attrs: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (attrs && typeof attrs === 'object') {
    const allowed: readonly string[] = ROOT_ATTRIBUTE_NAMES;
    for (const [k, v] of Object.entries(attrs as Record<string, unknown>)) {
      if (allowed.includes(k) && typeof v === 'string') out[k] = v;
    }
  }
  return out;
}

function sanitizeFontsHref(href: unknown): string | null {
  return typeof href === 'string' && href.startsWith(GOOGLE_FONTS_ORIGIN) ? href : null;
}

export function readStoredTheme(): StoredThemePayload | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<StoredThemePayload> | null;
    if (!p || p.v !== 2 || typeof p.templateId !== 'string' || typeof p.vars !== 'object' || p.vars === null || typeof p.attrs !== 'object' || p.attrs === null) {
      return null;
    }
    return {
      v: 2,
      templateId: p.templateId,
      vars: sanitizeVars(p.vars),
      attrs: sanitizeAttrs(p.attrs),
      title: typeof p.title === 'string' ? p.title : '',
      brandName: typeof p.brandName === 'string' ? p.brandName : '',
      fontsHref: sanitizeFontsHref(p.fontsHref),
    };
  } catch {
    return null;
  }
}

export function readStoredTemplateId(): string | null {
  return readStoredTheme()?.templateId ?? null;
}

/** The last brand name we saw, so the retry screen can still name the shop. */
export function lastKnownBrandName(): string | null {
  const v2 = readStoredTheme()?.brandName;
  if (v2) return v2;
  try {
    const raw = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { brand?: { name?: unknown } };
    return typeof parsed.brand?.name === 'string' && parsed.brand.name ? parsed.brand.name : null;
  } catch {
    return null;
  }
}

export function applyDocumentTheme(theme: ResolvedTheme, brand: Brand, opts: { persist?: boolean } = {}): void {
  const persist = opts.persist ?? true;
  let payload: StoredThemePayload | null = null;
  try {
    const root = document.documentElement;
    const vars = cssVariablesFor(theme, brand);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    const attrs = rootAttributes(theme);
    for (const [k, v] of Object.entries(attrs)) root.setAttribute(k, v);
    root.style.colorScheme = theme.scheme;

    const href = googleFontsHref(theme.fonts);
    const link = upsert<HTMLLinkElement>('link#sf-fonts', () => Object.assign(document.createElement('link'), { id: 'sf-fonts', rel: 'stylesheet' }));
    if (href) link.href = href; else link.remove();

    const style = upsert<HTMLStyleElement>('style#sf-custom-css', () => Object.assign(document.createElement('style'), { id: 'sf-custom-css' }));
    style.textContent = theme.customCss || '';

    document.title = brand.title;
    upsert<HTMLMetaElement>('meta[name="description"]', () => Object.assign(document.createElement('meta'), { name: 'description' })).content = brand.description;
    upsert<HTMLMetaElement>('meta[name="theme-color"]', () => Object.assign(document.createElement('meta'), { name: 'theme-color' })).content = theme.colors.bg;
    const fav = mediaUrl(brand.faviconUrl) ?? '/favicon.svg';
    upsert<HTMLLinkElement>('link[rel="icon"]', () => Object.assign(document.createElement('link'), { rel: 'icon' })).href = fav;

    payload = { v: 2, templateId: theme.templateId, vars, attrs, title: brand.title, brandName: brand.name, fontsHref: href };
  } catch {
    /* never throw — first-paint / theme sync must not break the app */
  }
  if (persist && payload) {
    try { localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(payload)); } catch { /* private mode */ }
  }
}
