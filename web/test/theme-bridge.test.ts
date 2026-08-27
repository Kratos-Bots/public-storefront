import { describe, expect, it } from 'vitest';
import { buildMantineTheme, cssVariablesFor, googleFontsHref } from '@/app/theme-bridge.ts';
import { fontStacks, INTER } from '@/app/theme-bridge.ts';
import type { Theme, Brand } from '@/types/settings.ts';

const theme: Theme = {
  scheme: 'dark',
  colors: { primary: '#3355ff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: 'Space Grotesk', body: 'Inter', mono: null },
  radius: 'lg', density: 'compact', customCss: '',
};
const brand = { logoHeight: 32 } as Brand;

describe('theme bridge', () => {
  it('builds a 10-shade brand ramp and maps radius/fonts', () => {
    const t = buildMantineTheme(theme);
    expect(t.primaryColor).toBe('brand');
    expect((t.colors as unknown as Record<string, string[]>).brand).toHaveLength(10);
    expect(t.defaultRadius).toBe('lg');
    expect(t.fontFamily).toContain('Inter');
    expect(t.headings?.fontFamily).toContain('Space Grotesk');
  });
  it('derives surface-2/3, line, faint from bg/surface/muted', () => {
    const v = cssVariablesFor(theme, brand);
    expect(v['--sf-bg']).toBe('#0f3965');
    expect(v['--sf-primary']).toBe('#3355ff');
    expect(v['--sf-logo-h']).toBe('32px');
    expect(v['--sf-surface-2']).toMatch(/^#[0-9a-f]{6}$/);
    expect(v['--sf-surface-2']).not.toBe(v['--sf-surface']);
    expect(v['--sf-line']).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('builds one Google Fonts href for the distinct families', () => {
    expect(googleFontsHref(theme.fonts)).toBe('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
    expect(googleFontsHref({ heading: null, body: null, mono: null })).toBeNull();
  });
  it('maps radius none to 0 and passes the named sizes through', () => {
    expect(buildMantineTheme({ ...theme, radius: 'none' }).defaultRadius).toBe(0);
    expect(buildMantineTheme({ ...theme, radius: 'md' }).defaultRadius).toBe('md');
  });
  it('slows Mantine sheets and modals to the shop timings', () => {
    const c = buildMantineTheme(theme).components as Record<string, { defaultProps?: Record<string, unknown> }>;
    expect(c.Drawer?.defaultProps?.transitionProps).toEqual({ duration: 300, timingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    expect(c.Drawer?.defaultProps?.overlayProps).toEqual({ backgroundOpacity: 0.7, blur: 2 });
    expect(c.Modal?.defaultProps?.transitionProps).toEqual({ transition: 'pop', duration: 200, timingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    expect(c.Button).toBeDefined();
    expect(c.ActionIcon).toBeDefined();
    expect(c.Input).toBeDefined();
  });
  it('feeds Button variant/size colours through a theme-level vars resolver, not CSS', () => {
    // Button's own varsResolver sets --button-bg/--button-color/etc as an inline style, which a
    // class-based CSS override can never beat. theme.components.Button.vars is merged in after
    // the component's own resolver, so it — not mantine.css — is what has to carry these.
    type ButtonVars = { vars: (theme: unknown, props: { variant?: string; size?: string }, ctx: unknown) => { root: Record<string, string | undefined> } };
    const button = (buildMantineTheme(theme).components as unknown as { Button: ButtonVars }).Button;
    const filled = button.vars({}, { variant: 'filled', size: 'md' }, {});
    expect(filled.root['--button-bg']).toBe('var(--sf-primary)');
    expect(filled.root['--button-color']).toBe('var(--sf-bg)');
    expect(filled.root['--button-hover']).toBe('var(--sf-primary-soft)');
    expect(filled.root['--button-hover-color']).toBe('var(--sf-bg)');
    expect(filled.root['--button-fz']).toBe('12px');

    const def = button.vars({}, { variant: 'default', size: 'md' }, {});
    expect(def.root['--button-bg']).toBe('transparent');
    expect(def.root['--button-bd']).toBe('1px solid var(--sf-line-strong)');
    expect(def.root['--button-color']).toBe('var(--sf-text)');

    const small = button.vars({}, { variant: 'filled', size: 'sm' }, {});
    expect(small.root['--button-fz']).toBe('11px');
  });
});

describe('font defaults', () => {
  const none = { heading: null, body: null, mono: null };

  it('falls back to the self-hosted Inter stack for body and heading', () => {
    const s = fontStacks(none);
    expect(s.body).toBe(INTER);
    expect(s.heading).toBe(INTER);
    expect(INTER.startsWith('"Inter Variable", Inter,')).toBe(true);
  });

  it('uses the body face as the mono voice unless a mono font is configured', () => {
    expect(fontStacks(none).mono).toBe(INTER);
    expect(fontStacks({ heading: null, body: 'Space Grotesk', mono: null }).mono).toBe(`"Space Grotesk", ${INTER}`);
    expect(fontStacks({ heading: null, body: null, mono: 'JetBrains Mono' }).mono).toBe('"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace');
  });

  it('feeds the same stacks to Mantine and the --sf-font-* variables', () => {
    const t = buildMantineTheme({ ...theme, fonts: none });
    const v = cssVariablesFor({ ...theme, fonts: none }, brand);
    expect(t.fontFamily).toBe(INTER);
    expect(t.fontFamilyMonospace).toBe(INTER);
    expect(t.headings?.fontFamily).toBe(INTER);
    expect(v['--sf-font-body']).toBe(INTER);
    expect(v['--sf-font-heading']).toBe(INTER);
    expect(v['--sf-font-mono']).toBe(INTER);
  });
});
