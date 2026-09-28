import { describe, expect, it } from 'vitest';
import { buildMantineTheme, cssVariablesFor, fontStacks, googleFontsHref, INTER } from '@/app/theme-bridge.ts';
import { BASE_TOKENS, defineTemplate } from '@/templates/define.ts';
import { resolveTheme, type ResolvedTheme } from '@/templates/resolve.ts';
import { lookupManifest } from '@/templates/registry.ts';
import modern from '@/templates/modern/manifest.ts';
import type { Brand, Theme } from '@/types/settings.ts';

const theme: Theme = {
  scheme: 'dark',
  colors: { primary: '#3355ff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: 'Space Grotesk', body: 'Inter', mono: null },
  radius: 'lg', density: 'compact', customCss: '',
};
const brand = { logoHeight: 32 } as Brand;
const resolve = (t: Theme): ResolvedTheme => resolveTheme(t, lookupManifest);
const none = { heading: null, body: null, mono: null };

describe('theme bridge', () => {
  it('builds a 10-shade brand ramp and maps radius/fonts', () => {
    const t = buildMantineTheme(resolve(theme));
    expect(t.primaryColor).toBe('brand');
    expect((t.colors as unknown as Record<string, string[]>).brand).toHaveLength(10);
    expect(t.defaultRadius).toBe('lg');
    expect(t.fontFamily).toContain('Inter');
    expect(t.headings?.fontFamily).toContain('Space Grotesk');
  });
  it('derives surface-2/3, line, faint from bg/surface/muted and adds the token variables', () => {
    const v = cssVariablesFor(resolve(theme), brand);
    expect(v['--sf-bg']).toBe('#0f3965');
    expect(v['--sf-primary']).toBe('#3355ff');
    expect(v['--sf-logo-h']).toBe('32px');
    expect(v['--sf-surface-2']).toMatch(/^#[0-9a-f]{6}$/);
    expect(v['--sf-surface-2']).not.toBe(v['--sf-surface']);
    expect(v['--sf-btn-font']).toBe('var(--sf-font-mono)');
    expect(v['--sf-pill-radius']).toBe('999px');
  });
  it('builds one Google Fonts href for the distinct families with their weights', () => {
    expect(googleFontsHref(resolve(theme).fonts)).toBe('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
    expect(googleFontsHref(none)).toBeNull();
  });
  it('omits the weight axis for single-weight 400 families and merges weights per family', () => {
    expect(googleFontsHref({ heading: { family: 'Tektur', weights: [900, 700] }, body: { family: 'Tektur', weights: [400] }, mono: { family: 'Share Tech Mono', weights: [400] } }))
      .toBe('https://fonts.googleapis.com/css2?family=Tektur:wght@400;700;900&family=Share+Tech+Mono&display=swap');
  });
  it('maps radius none to 0 and passes the named sizes through', () => {
    expect(buildMantineTheme(resolve({ ...theme, radius: 'none' })).defaultRadius).toBe(0);
    expect(buildMantineTheme(resolve({ ...theme, radius: 'md' })).defaultRadius).toBe('md');
  });
  it('slows Mantine sheets and modals to the shop timings and tags parts', () => {
    const c = buildMantineTheme(resolve(theme)).components as Record<string, { defaultProps?: Record<string, unknown> }>;
    expect(buildMantineTheme(resolve(theme)).respectReducedMotion).toBe(true);
    expect(c.Drawer?.defaultProps?.transitionProps).toEqual({ duration: 300, timingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    expect(c.Drawer?.defaultProps?.overlayProps).toEqual({ backgroundOpacity: 0.7, blur: 2 });
    expect(c.Modal?.defaultProps?.transitionProps).toEqual({ transition: 'pop', duration: 200, timingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    expect(c.Button?.defaultProps?.['data-sf-part']).toBe('button');
    expect(c.Input?.defaultProps?.['data-sf-part']).toBe('input');
    expect(c.ActionIcon).toBeDefined();
  });

  type ButtonVars = { vars: (theme: unknown, props: { variant?: string; size?: string }, ctx: unknown) => { root: Record<string, string | undefined> } };
  const buttonOf = (r: ResolvedTheme) => (buildMantineTheme(r).components as unknown as { Button: ButtonVars }).Button;

  it('feeds solid-fill Button variant/size colours through the vars resolver (modern)', () => {
    const button = buttonOf(resolve(theme));
    const filled = button.vars({}, { variant: 'filled', size: 'md' }, {});
    expect(filled.root).toMatchObject({ '--button-radius': 'var(--sf-btn-radius)', '--button-bg': 'var(--sf-primary)', '--button-color': 'var(--sf-bg)', '--button-hover': 'var(--sf-primary-soft)', '--button-hover-color': 'var(--sf-bg)', '--button-fz': '12px' });
    const def = button.vars({}, { variant: 'default', size: 'md' }, {});
    expect(def.root).toMatchObject({ '--button-bg': 'transparent', '--button-bd': '1px solid var(--sf-line-strong)', '--button-color': 'var(--sf-text)' });
    expect(button.vars({}, { variant: 'filled', size: 'sm' }, {}).root['--button-fz']).toBe('11px');
  });
  it('switches the filled variant for outline-glow and ghost fills', () => {
    const withFill = (fill: 'outline-glow' | 'ghost') => resolveTheme({ ...theme, template: 'x' }, () => defineTemplate({ ...modern, id: 'x', tokens: { ...BASE_TOKENS, button: { ...BASE_TOKENS.button, fill } } }));
    expect(buttonOf(withFill('outline-glow')).vars({}, { variant: 'filled' }, {}).root).toMatchObject({ '--button-bg': 'var(--sf-bg)', '--button-color': 'var(--sf-primary)', '--button-bd': '1px solid var(--sf-primary)' });
    expect(buttonOf(withFill('ghost')).vars({}, { variant: 'filled' }, {}).root).toMatchObject({ '--button-bg': 'transparent', '--button-color': 'var(--sf-primary)' });
  });
});

describe('font defaults', () => {
  it('falls back to the self-hosted Inter stack for body and heading', () => {
    const s = fontStacks(none);
    expect(s.body).toBe(INTER);
    expect(s.heading).toBe(INTER);
    expect(INTER.startsWith('"Inter Variable", Inter,')).toBe(true);
  });
  it('uses the body face as the mono voice unless a mono font is configured', () => {
    expect(fontStacks(none).mono).toBe(INTER);
    expect(fontStacks({ heading: null, body: { family: 'Space Grotesk', weights: [400] }, mono: null }).mono).toBe(`"Space Grotesk", ${INTER}`);
    expect(fontStacks({ heading: null, body: null, mono: { family: 'JetBrains Mono', weights: [400] } }).mono).toBe('"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace');
  });
  it('feeds the same stacks to Mantine and the --sf-font-* variables', () => {
    const r = resolve({ ...theme, fonts: { heading: null, body: null, mono: null } });
    const t = buildMantineTheme(r);
    const v = cssVariablesFor(r, brand);
    expect(t.fontFamily).toBe(INTER);
    expect(t.fontFamilyMonospace).toBe(INTER);
    expect(t.headings?.fontFamily).toBe(INTER);
    expect(v['--sf-font-body']).toBe(INTER);
    expect(v['--sf-font-heading']).toBe(INTER);
    expect(v['--sf-font-mono']).toBe(INTER);
  });
});
