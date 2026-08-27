import { ActionIcon, Button, Drawer, Input, Modal, createTheme, type MantineThemeOverride } from '@mantine/core';
import { generateColors } from '@mantine/colors-generator';
import type { Theme, Brand } from '@/types/settings.ts';
import { mediaUrl } from '@/lib/media-url.ts';

/** The storefront's own face, self-hosted via @fontsource-variable/inter (imported in main.tsx). */
export const INTER = '"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SYSTEM_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export const THEME_STORAGE_KEY = 'sf-theme-v1';

function family(name: string | null, fallback: string): string { return name ? `"${name}", ${fallback}` : fallback; }

/**
 * Button's own varsResolver computes --button-bg/--button-color/--button-hover/
 * --button-hover-color/--button-bd/--button-fz and injects them as an inline
 * `style` attribute on the root (see @mantine/core's Button.tsx), so a
 * classNames-based CSS override (mantine.css's old `.sf-button[data-variant=…]`
 * rules) can never win — inline style always beats a stylesheet rule. Mantine
 * merges a theme-level `components.Button.vars` resolver in *after* the
 * component's own, so returning the values here instead is what actually wins.
 */
function buttonVariantVars(variant: string | undefined): Record<string, string> {
  switch (variant ?? 'filled') {
    case 'filled':
      return {
        '--button-bg': 'var(--sf-primary)',
        '--button-color': 'var(--sf-bg)',
        '--button-hover': 'var(--sf-primary-soft)',
        '--button-hover-color': 'var(--sf-bg)',
      };
    case 'default':
      return {
        '--button-bg': 'transparent',
        '--button-bd': '1px solid var(--sf-line-strong)',
        '--button-color': 'var(--sf-text)',
        '--button-hover': 'var(--sf-surface)',
      };
    case 'subtle':
      return {
        '--button-bg': 'transparent',
        '--button-color': 'var(--sf-muted)',
        '--button-hover': 'var(--sf-surface)',
        '--button-hover-color': 'var(--sf-text)',
      };
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
export function fontStacks(fonts: Theme['fonts']): { body: string; heading: string; mono: string } {
  const body = family(fonts.body, INTER);
  return {
    body,
    heading: family(fonts.heading ?? fonts.body, INTER),
    mono: fonts.mono ? family(fonts.mono, SYSTEM_MONO) : body,
  };
}

/** Mix `hex` toward `toward` by `t` (0..1) in sRGB — enough for derived surfaces/lines. */
export function mix(hex: string, toward: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(toward);
  return '#' + a.map((c, i) => Math.round(c + (b[i]! - c) * t).toString(16).padStart(2, '0')).join('');
}

export function buildMantineTheme(theme: Theme): MantineThemeOverride {
  const compact = theme.density === 'compact';
  return createTheme({
    primaryColor: 'brand',
    primaryShade: { light: 6, dark: 5 },
    colors: { brand: generateColors(theme.colors.primary) },
    fontFamily: fontStacks(theme.fonts).body,
    fontFamilyMonospace: fontStacks(theme.fonts).mono,
    headings: { fontFamily: fontStacks(theme.fonts).heading, fontWeight: '600' },
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
      Drawer: Drawer.extend({
        defaultProps: {
          transitionProps: { duration: 300, timingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' },
          overlayProps: { backgroundOpacity: 0.7, blur: 2 },
        },
      }),
      Modal: Modal.extend({
        defaultProps: {
          transitionProps: { transition: 'pop', duration: 200, timingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
          overlayProps: { backgroundOpacity: 0.7, blur: 2 },
        },
      }),
      Button: Button.extend({
        classNames: { root: 'sf-button' },
        vars: (_theme, props) => ({
          root: { ...buttonVariantVars(props.variant), ...buttonSizeVars(props.size) },
        }),
      }),
      ActionIcon: ActionIcon.extend({ classNames: { root: 'sf-icon-button' } }),
      Input: Input.extend({ classNames: { input: 'sf-input' } }),
    },
  });
}

export function cssVariablesFor(theme: Theme, brand: Pick<Brand, 'logoHeight'>): Record<string, string> {
  const dark = theme.scheme === 'dark';
  const c = theme.colors;
  const towardText = dark ? '#ffffff' : '#000000';
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
    '--sf-font-heading': fontStacks(theme.fonts).heading,
    '--sf-font-body': fontStacks(theme.fonts).body,
    '--sf-font-mono': fontStacks(theme.fonts).mono,
  };
}

export function googleFontsHref(fonts: Theme['fonts']): string | null {
  const names = [...new Set([fonts.heading, fonts.body, fonts.mono].filter((n): n is string => !!n))];
  if (names.length === 0) return null;
  const q = names.map((n) => `family=${n.trim().replace(/\s+/g, '+')}:wght@400;500;600;700`).join('&');
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

function upsert<T extends HTMLElement>(selector: string, create: () => T): T {
  const existing = document.head.querySelector<T>(selector);
  if (existing) return existing;
  const el = create(); document.head.appendChild(el); return el;
}

export function applyDocumentTheme(theme: Theme, brand: Brand): void {
  try {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(cssVariablesFor(theme, brand))) root.style.setProperty(k, v);
    root.setAttribute('data-mantine-color-scheme', theme.scheme);
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
  } catch {
    /* never throw — first-paint / theme sync must not break the app */
  }

  try { localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ theme, brand })); } catch { /* private mode */ }
}
