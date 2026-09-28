import { describe, expect, it } from 'vitest';
import { BASE_TOKENS } from '@/templates/define.ts';
import { radiusCss, rootAttributes, tokenVariables } from '@/templates/tokens.ts';
import { resolveTheme } from '@/templates/resolve.ts';
import { lookupManifest } from '@/templates/registry.ts';
import type { Theme } from '@/types/settings.ts';

describe('tokens', () => {
  it('maps radius tokens', () => {
    expect(radiusCss('theme')).toBe('var(--mantine-radius-default)');
    expect(radiusCss('pill')).toBe('999px');
    expect(radiusCss(10)).toBe('10px');
    expect(radiusCss(0)).toBe('0px');
  });
  it('emits numeric radii as px and passes none / zero tracking / body font through', () => {
    const v = tokenVariables({
      ...BASE_TOKENS,
      button: { radius: 10, fill: 'outline-glow', transform: 'none', tracking: { sm: '0', md: '0', lg: '0' }, weight: 600, font: 'body' },
      card: { radius: 16, border: 'none', shadow: 'none', shadowHover: 'none' },
      badge: { radius: 0 },
    });
    expect(v).toMatchObject({
      '--sf-btn-radius': '10px', '--sf-btn-font': 'var(--sf-font-body)', '--sf-btn-tracking-md': '0', '--sf-btn-transform': 'none',
      '--sf-card-radius': '16px', '--sf-card-border': 'none', '--sf-pill-radius': '0px',
    });
    expect(tokenVariables({ ...BASE_TOKENS, button: { ...BASE_TOKENS.button, font: 'heading' } })['--sf-btn-font']).toBe('var(--sf-font-heading)');
  });
  it('base tokens reproduce the modern declarations', () => {
    expect(tokenVariables(BASE_TOKENS)).toEqual({
      '--sf-btn-radius': 'var(--mantine-radius-default)',
      '--sf-btn-transform': 'uppercase',
      '--sf-btn-weight': '600',
      '--sf-btn-font': 'var(--sf-font-mono)',
      '--sf-btn-tracking-sm': '0.18em',
      '--sf-btn-tracking-md': '0.2em',
      '--sf-btn-tracking-lg': '0.22em',
      '--sf-card-radius': 'var(--mantine-radius-default)',
      '--sf-card-border': '1px solid var(--sf-line)',
      '--sf-card-shadow': 'none',
      '--sf-card-shadow-hover': 'none',
      '--sf-pill-radius': '999px',
      '--sf-heading-weight': '600',
      '--sf-heading-tracking': 'normal',
      '--sf-heading-transform': 'none',
    });
  });
  it('emits the root attributes', () => {
    const theme = { scheme: 'dark', colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' }, fonts: { heading: null, body: null, mono: null }, radius: 'none', density: 'comfortable', customCss: '' } satisfies Theme;
    expect(rootAttributes(resolveTheme(theme, lookupManifest))).toEqual({
      'data-sf-template': 'modern',
      'data-sf-preset': 'default',
      'data-sf-btn-fill': 'solid',
      'data-sf-input': 'underline',
      'data-sf-chassis': 'glow',
      'data-sf-label': 'plain',
      'data-sf-glass': 'on',
      'data-mantine-color-scheme': 'dark',
    });
  });
});
