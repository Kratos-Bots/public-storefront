import { describe, expect, it } from 'vitest';
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
