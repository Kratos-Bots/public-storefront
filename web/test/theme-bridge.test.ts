import { describe, expect, it } from 'vitest';
import { buildMantineTheme, cssVariablesFor, googleFontsHref } from '@/app/theme-bridge.ts';
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
});
