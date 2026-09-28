import { describe, expect, it } from 'vitest';
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
