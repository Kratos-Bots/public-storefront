import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_BOOTSTRAP } from '@/app/theme-bootstrap.ts';
import { cssVariablesFor, THEME_STORAGE_KEY } from '@/app/theme-bridge.ts';
import type { Theme, Brand } from '@/types/settings.ts';

const theme: Theme = {
  scheme: 'dark',
  colors: { primary: '#3355ff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: 'Space Grotesk', body: 'Inter', mono: null },
  radius: 'lg', density: 'compact', customCss: '',
};
const brand: Brand = {
  name: 'Acme', shortName: 'Acme', tagline: 'tag', title: 'Acme Shop', description: 'desc',
  logoUrl: null, faviconUrl: null, logoHeight: 32,
  links: { whatsapp: null, telegram: null },
};

describe('theme bootstrap (inlined first-paint script)', () => {
  beforeEach(() => {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ theme, brand }));
  });
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-mantine-color-scheme');
  });

  it('sets the same --sf-* variables cssVariablesFor() computes, from seeded localStorage', () => {
    // eslint-disable-next-line no-new-func
    new Function(THEME_BOOTSTRAP)();

    const expected = cssVariablesFor(theme, brand);
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--sf-surface-2')).toBe(expected['--sf-surface-2']);
    expect(root.getPropertyValue('--sf-line')).toBe(expected['--sf-line']);
    expect(root.getPropertyValue('--sf-faint')).toBe(expected['--sf-faint']);
    expect(root.getPropertyValue('--sf-primary-soft')).toBe(expected['--sf-primary-soft']);
    expect(document.documentElement.getAttribute('data-mantine-color-scheme')).toBe('dark');
  });

  it('does nothing (does not throw) when localStorage is empty', () => {
    localStorage.clear();
    expect(() => new Function(THEME_BOOTSTRAP)()).not.toThrow();
  });
});
