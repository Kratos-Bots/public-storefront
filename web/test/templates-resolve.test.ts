import { describe, expect, it } from 'vitest';
import { BASE_TOKENS, defineTemplate, type TemplateManifest } from '@/templates/define.ts';
import { resolveTheme } from '@/templates/resolve.ts';
import { lookupManifest } from '@/templates/registry.ts';
import modern from '@/templates/modern/manifest.ts';
import type { Theme } from '@/types/settings.ts';

const locked: TemplateManifest = defineTemplate({
  ...modern,
  id: 'locked',
  schemes: ['dark'],
  presets: [
    { id: 'gold', name: 'Gold', scheme: 'dark', colors: { primary: '#d4a03c', bg: '#0a0907', surface: '#161412', text: '#f0ebe0', muted: '#8a8070', success: '#3d9e5c', warn: '#e0a33e', danger: '#b83c38' }, fonts: { heading: { family: 'Inter', weights: [700, 800] }, body: { family: 'Inter', weights: [400, 600] }, mono: { family: 'JetBrains Mono', weights: [400, 500] } }, radius: 'lg' },
    { id: 'silver', name: 'Silver', scheme: 'dark', colors: { primary: '#b4c0d4', bg: '#080809', surface: '#141416', text: '#eef0f4', muted: '#7d8494', success: '#3d9e5c', warn: '#e0a33e', danger: '#b83c38' }, fonts: { heading: null, body: null, mono: null }, radius: 'lg' },
  ],
  defaultPreset: 'gold',
  tokens: { ...BASE_TOKENS, chassis: 'flat' },
  editable: { colors: ['primary', 'bg'], fonts: false, radius: false, density: false },
  options: [
    { key: 'grain', type: 'boolean', label: 'Grain', default: true },
    { key: 'node', type: 'text', label: 'Node', default: 'NODE_01', maxLength: 8 },
    { key: 'mode', type: 'select', label: 'Mode', default: 'a', choices: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
  ],
});
const lookup = (id: string | null | undefined) => (id === 'locked' ? locked : modern);

const stored: Theme = {
  scheme: 'light',
  colors: { primary: '#111111', bg: '#fafafa', surface: '#eeeeee', text: '#000000', muted: '#555555', success: '#00aa00', warn: '#aaaa00', danger: '#aa0000' },
  fonts: { heading: 'Space Grotesk', body: 'Inter', mono: null },
  radius: 'sm', density: 'compact', customCss: 'a{}',
};

describe('resolveTheme', () => {
  it('old-shape theme (no template fields) resolves to modern with stored values untouched', () => {
    const r = resolveTheme(stored, lookup);
    expect(r.templateId).toBe('modern');
    expect(r.presetId).toBe('default');
    expect(r.fallback).toBe(false);
    expect(r.colors).toEqual(stored.colors);
    expect(r.scheme).toBe('light');
    expect(r.radius).toBe('sm');
    expect(r.density).toBe('compact');
    expect(r.customCss).toBe('a{}');
    expect(r.fonts.heading).toEqual({ family: 'Space Grotesk', weights: [400, 500, 600, 700] });
    expect(r.fonts.mono).toBeNull();
    expect(r.tokens).toBe(BASE_TOKENS);
    expect(r.options).toEqual({});
  });
  it('enforces locks from the chosen preset', () => {
    const r = resolveTheme({ ...stored, template: 'locked', preset: 'silver' }, lookup);
    expect(r.presetId).toBe('silver');
    expect(r.colors.primary).toBe('#111111');          // editable
    expect(r.colors.bg).toBe('#fafafa');               // editable
    expect(r.colors.surface).toBe('#141416');          // locked → preset
    expect(r.fonts).toEqual({ heading: null, body: null, mono: null }); // fonts locked
    expect(r.radius).toBe('lg');                       // radius locked
    expect(r.density).toBe('comfortable');             // density locked
    expect(r.scheme).toBe('dark');                     // light not in schemes
  });
  it('a foreign or missing preset id falls back to the default preset', () => {
    expect(resolveTheme({ ...stored, template: 'locked', preset: 'default' }, lookup).presetId).toBe('gold');
    expect(resolveTheme({ ...stored, template: 'locked', preset: null }, lookup).presetId).toBe('gold');
  });
  it('unknown template id resolves to modern and flags the fallback', () => {
    const r = resolveTheme({ ...stored, template: 'gone', preset: 'gold' }, lookup);
    expect(r.templateId).toBe('modern');
    expect(r.presetId).toBe('default');
    expect(r.fallback).toBe(true);
    expect(r.colors).toEqual(stored.colors);
  });
  it('keeps a preset font weight list when the stored name matches the preset', () => {
    const editableFonts = defineTemplate({ ...locked, id: 'locked', editable: { ...locked.editable, fonts: true } });
    const r = resolveTheme({ ...stored, template: 'locked', preset: 'gold', fonts: { heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono' } }, () => editableFonts);
    expect(r.fonts.heading).toEqual({ family: 'Inter', weights: [700, 800] });
    expect(r.fonts.mono).toEqual({ family: 'JetBrains Mono', weights: [400, 500] });
  });
  it('resolves options: defaults, stored values, wrong types and unknown keys', () => {
    const r = resolveTheme({ ...stored, template: 'locked', options: { grain: 'yes', node: 'X'.repeat(20), mode: 'b', extra: true } }, lookup);
    expect(r.options).toEqual({ grain: true, node: 'NODE_01', mode: 'b' });
    const r2 = resolveTheme({ ...stored, template: 'locked', options: { grain: false, node: 'N2', mode: 'zzz' } }, lookup);
    expect(r2.options).toEqual({ grain: false, node: 'N2', mode: 'a' });
  });
  it('treats a missing customCss as empty', () => {
    const { customCss: _drop, ...rest } = stored;
    expect(resolveTheme(rest as Theme, lookup).customCss).toBe('');
  });
  it('every registered template resolves the core options, shown by default, hidden when stored false', () => {
    for (const id of ['modern', 'bento', 'dark-luxury', 'cyber-brutalism']) {
      const r = resolveTheme({ ...stored, template: id }, lookupManifest);
      expect(r.options, id).toMatchObject({ showPageTitle: true, showCatalogIntro: true, showSectionLabels: true });
      const hidden = resolveTheme({ ...stored, template: id, options: { showPageTitle: false, showCatalogIntro: false, showSectionLabels: false } }, lookupManifest);
      expect(hidden.options, id).toMatchObject({ showPageTitle: false, showCatalogIntro: false, showSectionLabels: false });
    }
  });
});
