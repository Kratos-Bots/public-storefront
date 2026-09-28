import { COLOR_KEYS, type ColorKey, type Density, type FontSpec, type OptionValues, type RadiusName, type Scheme, type TemplateManifest, type TemplateTokens } from '@/templates/define.ts';
import type { Theme } from '@/types/settings.ts';

export const DEFAULT_WEIGHTS = [400, 500, 600, 700];

export interface ResolvedFonts { heading: FontSpec | null; body: FontSpec | null; mono: FontSpec | null }

export interface ResolvedTheme {
  templateId: string;
  presetId: string;
  manifest: TemplateManifest;
  /** True when the stored template id is not in this release and modern stands in. */
  fallback: boolean;
  scheme: Scheme;
  colors: Record<ColorKey, string>;
  fonts: ResolvedFonts;
  radius: RadiusName;
  density: Density;
  customCss: string;
  options: OptionValues;
  tokens: TemplateTokens;
}

export function resolveOptions(manifest: TemplateManifest, stored: Theme['options']): OptionValues {
  const out: OptionValues = {};
  for (const o of manifest.options) {
    const v = stored?.[o.key];
    if (o.type === 'boolean') out[o.key] = typeof v === 'boolean' ? v : o.default;
    else if (o.type === 'select') out[o.key] = typeof v === 'string' && o.choices.some((c) => c.value === v) ? v : o.default;
    else out[o.key] = typeof v === 'string' && v.length <= o.maxLength ? v : o.default;
  }
  return out;
}

function fontFor(name: string | null, presetFont: FontSpec | null): FontSpec | null {
  if (!name) return null;
  return { family: name, weights: presetFont && presetFont.family === name ? presetFont.weights : DEFAULT_WEIGHTS };
}

export function resolveTheme(stored: Theme, lookup: (id: string | null | undefined) => TemplateManifest): ResolvedTheme {
  const manifest = lookup(stored.template);
  const fallback = !!stored.template && manifest.id !== stored.template;
  const preset = manifest.presets.find((p) => p.id === stored.preset) ?? manifest.presets.find((p) => p.id === manifest.defaultPreset)!;
  const e = manifest.editable;

  const colors = { ...stored.colors } as Record<ColorKey, string>;
  for (const k of COLOR_KEYS) if (!e.colors.includes(k)) colors[k] = preset.colors[k];

  const fonts: ResolvedFonts = e.fonts
    ? {
        heading: fontFor(stored.fonts.heading, preset.fonts.heading),
        body: fontFor(stored.fonts.body, preset.fonts.body),
        mono: fontFor(stored.fonts.mono, preset.fonts.mono),
      }
    : preset.fonts;

  return {
    templateId: manifest.id,
    presetId: preset.id,
    manifest,
    fallback,
    scheme: manifest.schemes.includes(stored.scheme) ? stored.scheme : preset.scheme,
    colors,
    fonts,
    radius: e.radius ? stored.radius : preset.radius,
    density: e.density ? stored.density : 'comfortable',
    customCss: stored.customCss ?? '',
    options: resolveOptions(manifest, stored.options),
    tokens: manifest.tokens,
  };
}
