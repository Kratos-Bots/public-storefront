import { describe, expect, it } from 'vitest';
import { BASE_TOKENS, defineTemplate, validateManifest, type TemplateManifest, type TemplateTokens } from '@/templates/define.ts';

function manifest(overrides: Partial<TemplateManifest> = {}): TemplateManifest {
  return defineTemplate({
    contractVersion: 1, id: 'acme', name: 'Acme', version: '1.0.0', description: 'd', author: 'a',
    schemes: ['dark'],
    presets: [{ id: 'gold', name: 'Gold', scheme: 'dark',
      colors: { primary: '#d4a03c', bg: '#0a0907', surface: '#161412', text: '#f0ebe0', muted: '#8a8070', success: '#3d9e5c', warn: '#e0a33e', danger: '#b83c38' },
      fonts: { heading: { family: 'Inter', weights: [700, 800] }, body: null, mono: { family: 'Share Tech Mono', weights: [400] } },
      radius: 'lg' }],
    defaultPreset: 'gold',
    tokens: BASE_TOKENS,
    editable: { colors: ['primary'], fonts: false, radius: false, density: true },
    options: [{ key: 'grain', type: 'boolean', label: 'Grain', default: true }],
    ...overrides,
  });
}

describe('validateManifest', () => {
  it('accepts a well-formed manifest', () => {
    expect(validateManifest(manifest(), 'acme')).toEqual([]);
  });
  it.each<[string, unknown, string]>([
    ['non-object', null, 'not an object'],
    ['contract version', { ...manifest(), contractVersion: 2 }, 'contractVersion'],
    ['folder mismatch', manifest({ id: 'other' }), 'folder'],
    ['no presets', manifest({ presets: [] }), 'preset'],
    ['unknown default preset', manifest({ defaultPreset: 'nope' }), 'defaultPreset'],
    ['preset scheme not supported', manifest({ presets: [{ ...manifest().presets[0]!, scheme: 'light' }] }), 'scheme'],
    ['bad hex', manifest({ presets: [{ ...manifest().presets[0]!, colors: { ...manifest().presets[0]!.colors, bg: 'red' } }] }), 'hex'],
    ['bad font family', manifest({ presets: [{ ...manifest().presets[0]!, fonts: { heading: { family: 'Bad;Font', weights: [400] }, body: null, mono: null } }] }), 'font'],
    ['bad font weight', manifest({ presets: [{ ...manifest().presets[0]!, fonts: { heading: { family: 'Inter', weights: [450] }, body: null, mono: null } }] }), 'weight'],
    ['unknown editable colour', manifest({ editable: { colors: ['nope' as never], fonts: true, radius: true, density: true } }), 'editable'],
    ['bad option key', manifest({ options: [{ key: 'bad key', type: 'boolean', label: 'x', default: true }] }), 'option key'],
    ['duplicate option key', manifest({ options: [{ key: 'a', type: 'boolean', label: 'x', default: true }, { key: 'a', type: 'boolean', label: 'y', default: false }] }), 'duplicate'],
    ['select default not a choice', manifest({ options: [{ key: 'a', type: 'select', label: 'x', default: 'z', choices: [{ value: 'y', label: 'Y' }] }] }), 'choices'],
    ['text maxLength > 100', manifest({ options: [{ key: 'a', type: 'text', label: 'x', default: '', maxLength: 101 }] }), 'maxLength'],
    ['text default too long', manifest({ options: [{ key: 'a', type: 'text', label: 'x', default: 'abcdef', maxLength: 3 }] }), 'maxLength'],
    ['bad preview path', manifest({ preview: 'https://x/y.png' }), 'preview'],
  ])('rejects %s', (_name, value, fragment) => {
    const errors = validateManifest(value, 'acme');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toContain(fragment);
  });
  it('rejects more than 30 options', () => {
    const options = Array.from({ length: 31 }, (_, i) => ({ key: `o${i}`, type: 'boolean' as const, label: 'x', default: true }));
    expect(validateManifest(manifest({ options }), 'acme').join('\n')).toContain('30');
  });
  it('rejects a bad id with exactly one, fully specified message', () => {
    expect(validateManifest(manifest({ id: 'Bad_Id' }), 'acme')).toEqual(['acme: id must match /^[a-z0-9-]{1,40}$/']);
  });
  it.each<[string, Partial<TemplateManifest>, string]>([
    ['name', { name: 'n'.repeat(61) }, 'acme: name must be at most 60 characters'],
    ['version', { version: '1'.repeat(41) }, 'acme: version must be at most 40 characters'],
    ['description', { description: 'd'.repeat(501) }, 'acme: description must be at most 500 characters'],
    ['author', { author: 'a'.repeat(101) }, 'acme: author must be at most 100 characters'],
  ])('caps %s at Plan 1\'s catalog limit', (_field, over, message) => {
    expect(validateManifest(manifest(over), 'acme')).toEqual([message]);
  });
  it('accepts text fields exactly at their caps', () => {
    expect(validateManifest(manifest({ name: 'n'.repeat(60), version: '1'.repeat(40), description: 'd'.repeat(500), author: 'a'.repeat(100) }), 'acme')).toEqual([]);
  });
  it('caps select choices at 20 and font weights at 9', () => {
    const choices = Array.from({ length: 21 }, (_, i) => ({ value: `v${i}`, label: `V${i}` }));
    expect(validateManifest(manifest({ options: [{ key: 'm', type: 'select', label: 'M', default: 'v0', choices }] }), 'acme'))
      .toEqual(['acme: option "m": choices must list 1..20 entries']);
    const weights = [100, 200, 300, 400, 500, 600, 700, 800, 900, 900];
    expect(validateManifest(manifest({ presets: [{ ...manifest().presets[0]!, fonts: { heading: { family: 'Inter', weights }, body: null, mono: null } }] }), 'acme'))
      .toEqual(['acme: preset "gold".fonts.heading: font weights must be 1..9 values of 100..900 in steps of 100']);
  });
});

describe('validateManifest — at least as strict as the backend catalog parser', () => {
  const preset = () => manifest().presets[0]!;
  const select = (choices: unknown, def = 'v') => manifest({ options: [{ key: 'm', type: 'select', label: 'M', default: def, choices: choices as never }] });
  it.each<[string, unknown, string]>([
    ['preset name over 60', manifest({ presets: [{ ...preset(), name: 'n'.repeat(61) }] }), 'acme: preset "gold": name must be at most 60 characters'],
    ['duplicate schemes', manifest({ schemes: ['dark', 'dark'] }), 'acme: schemes must list dark and/or light, each at most once'],
    ['three schemes', manifest({ schemes: ['dark', 'light', 'dark'] }), 'acme: schemes must list dark and/or light, each at most once'],
    ['editable.fonts not boolean', manifest({ editable: { colors: [], fonts: 'yes' as never, radius: true, density: true } }), 'acme: editable.fonts must be a boolean'],
    ['editable.radius missing', manifest({ editable: { colors: [], fonts: true, density: true } as never }), 'acme: editable.radius must be a boolean'],
    ['editable.density not boolean', manifest({ editable: { colors: [], fonts: true, radius: true, density: 1 as never } }), 'acme: editable.density must be a boolean'],
    ['duplicate editable colours', manifest({ editable: { colors: ['primary', 'primary'], fonts: true, radius: true, density: true } }), 'acme: editable.colors must list each colour key at most once'],
    ['more than 8 editable colours', manifest({ editable: { colors: ['primary', 'bg', 'surface', 'text', 'muted', 'success', 'warn', 'danger', 'primary'], fonts: true, radius: true, density: true } }), 'acme: editable.colors must list each colour key at most once'],
    ['option label over 80', manifest({ options: [{ key: 'a', type: 'boolean', label: 'l'.repeat(81), default: true }] }), 'acme: option "a": label must be at most 80 characters'],
    ['option help over 200', manifest({ options: [{ key: 'a', type: 'boolean', label: 'A', help: 'h'.repeat(201), default: true }] }), 'acme: option "a": help must be a string of at most 200 characters'],
    ['option help not a string', manifest({ options: [{ key: 'a', type: 'boolean', label: 'A', help: 5 as never, default: true }] }), 'acme: option "a": help must be a string of at most 200 characters'],
    ['empty choice value', select([{ value: '', label: 'Empty' }, { value: 'v', label: 'V' }]), 'acme: option "m": choice values must be 1..100 characters'],
    ['choice value over 100', select([{ value: 'x'.repeat(101), label: 'X' }, { value: 'v', label: 'V' }]), 'acme: option "m": choice values must be 1..100 characters'],
    ['empty choice label', select([{ value: 'v', label: '' }]), 'acme: option "m": choice labels must be 1..80 characters'],
    ['choice label over 80', select([{ value: 'v', label: 'l'.repeat(81) }]), 'acme: option "m": choice labels must be 1..80 characters'],
  ])('rejects %s', (_name, value, message) => {
    expect(validateManifest(value, 'acme')).toEqual([message]);
  });
  it('rejects more than 20 presets', () => {
    const presets = Array.from({ length: 21 }, (_, i) => ({ ...preset(), id: `p${i}` }));
    expect(validateManifest(manifest({ presets, defaultPreset: 'p0' }), 'acme')).toEqual(['acme: at most 20 presets']);
  });
  it('accepts every limit exactly at its cap', () => {
    const presets = Array.from({ length: 20 }, (_, i) => ({ ...preset(), id: `p${i}`, name: 'n'.repeat(60) }));
    expect(validateManifest(manifest({
      schemes: ['dark', 'light'],
      presets, defaultPreset: 'p0',
      editable: { colors: ['primary', 'bg', 'surface', 'text', 'muted', 'success', 'warn', 'danger'], fonts: true, radius: false, density: true },
      options: [
        { key: 'a', type: 'boolean', label: 'l'.repeat(80), help: 'h'.repeat(200), default: true },
        { key: 'm', type: 'select', label: 'M', default: 'x'.repeat(100), choices: [{ value: 'x'.repeat(100), label: 'l'.repeat(80) }] },
      ],
    }), 'acme')).toEqual([]);
  });
});

describe('validateManifest — tokens', () => {
  const tok = (over: Partial<TemplateTokens>) => manifest({ tokens: { ...BASE_TOKENS, ...over } });

  it('accepts the value shapes the built-in templates use', () => {
    // dark-luxury: numeric radii, zero tracking, borderless cards, body-font buttons, glow fill
    expect(validateManifest(tok({
      button: { radius: 10, fill: 'outline-glow', transform: 'none', tracking: { sm: '0', md: '0', lg: '0' }, weight: 600, font: 'body' },
      card: { radius: 16, border: 'none', shadow: 'inset 0 1px 0 rgba(255,248,230,0.08), 0 4px 24px rgba(0,0,0,0.45)', shadowHover: 'inset 0 1px 0 rgba(255,248,230,0.10), 0 12px 40px rgba(0,0,0,0.55)' },
      heading: { weight: 700, tracking: '-0.03em', transform: 'none' },
      badge: { radius: 'pill' },
    }), 'acme')).toEqual([]);
    // cyber-brutalism: zero radii everywhere, em tracking, heading-font buttons, glass off
    expect(validateManifest(tok({
      button: { radius: 0, fill: 'solid', transform: 'uppercase', tracking: { sm: '0.04em', md: '0.04em', lg: '0.04em' }, weight: 600, font: 'heading' },
      card: { radius: 0, border: '1px solid var(--sf-line)', shadow: 'none', shadowHover: 'none' },
      heading: { weight: 700, tracking: '-0.02em', transform: 'uppercase' },
      glass: 'off',
      badge: { radius: 0 },
    }), 'acme')).toEqual([]);
  });

  it.each<[string, Partial<TemplateTokens>, string]>([
    ['negative radius', { badge: { radius: -2 } }, 'badge.radius'],
    ['fractional radius', { card: { ...BASE_TOKENS.card, radius: 1.5 } }, 'card.radius'],
    ['unknown radius keyword', { button: { ...BASE_TOKENS.button, radius: 'round' as never } }, 'button.radius'],
    ['bad tracking', { button: { ...BASE_TOKENS.button, tracking: { sm: '2px', md: '0.2em', lg: '0.2em' } } }, 'tracking.sm'],
    ['bad fill', { button: { ...BASE_TOKENS.button, fill: 'neon' as never } }, 'button.fill'],
    ['bad font slot', { button: { ...BASE_TOKENS.button, font: 'serif' as never } }, 'button.font'],
    ['bad weight', { heading: { ...BASE_TOKENS.heading, weight: 650 } }, 'heading.weight'],
    ['css injection in border', { card: { ...BASE_TOKENS.card, border: '1px solid red; } body { display:none' } }, 'card.border'],
    ['bad glass', { glass: 'maybe' as never }, 'glass'],
    ['bad chassis', { chassis: 'shiny' as never }, 'chassis'],
  ])('rejects %s', (_name, over, fragment) => {
    expect(validateManifest(tok(over), 'acme').join('\n')).toContain(fragment);
  });
});
