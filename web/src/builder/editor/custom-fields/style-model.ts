import { STYLE_KEY_ORDER, STYLE_KEYS, STYLE_SPACE, STYLE_TOKENS, type BlockStyle, type StyleKey, type StyleSupport } from '@/builder/style/model.ts';

/** Spec §9.1 row groups, in panel order. */
export const STYLE_GROUPS: ReadonlyArray<{ title: string; keys: readonly StyleKey[] }> = [
  { title: 'Colours', keys: ['bg', 'fg'] },
  { title: 'Spacing', keys: ['padTop', 'padBottom', 'padX', 'marginTop', 'marginBottom'] },
  { title: 'Border', keys: ['border', 'borderColor', 'borderStyle'] },
  { title: 'Shape', keys: ['radius', 'shadow'] },
  { title: 'Text', keys: ['textSize', 'align'] },
  { title: 'Width', keys: ['maxWidth'] },
  { title: 'Visibility', keys: ['hide'] },
];

export function groupsFor(support: StyleSupport) {
  return STYLE_GROUPS.map((g) => ({ ...g, keys: g.keys.filter((k) => support.keys.includes(k)) })).filter((g) => g.keys.length > 0);
}

export interface StyleOption { value: string | undefined; label: string; title?: string }

const DEFAULT: StyleOption = { value: undefined, label: 'Default', title: 'Default — the template decides' };
const SHORT: Record<string, string> = { none: '0', xs: 'XS', sm: 'S', md: 'M', lg: 'L', xl: 'XL' };
const PX: Record<string, number> = { none: 0, xs: 8, sm: 16, md: 24, lg: 40, xl: 64 };
/** Phone caps (spec §7), below 48em. */
const PHONE_BLOCK: Record<string, number> = { lg: 24, xl: 40 };
const PHONE_X: Record<string, number> = { md: 16, lg: 16, xl: 16 };
const SPACE_KEYS: ReadonlySet<StyleKey> = new Set(['padTop', 'padBottom', 'padX', 'marginTop', 'marginBottom']);
const COLOUR_KEYS: ReadonlySet<StyleKey> = new Set(['bg', 'fg', 'borderColor']);

const FIXED: Partial<Record<StyleKey, StyleOption[]>> = {
  border: [{ value: 'thin', label: 'Thin', title: '1 px' }, { value: 'medium', label: 'Medium', title: '2 px' }, { value: 'thick', label: 'Thick', title: '4 px' }],
  borderStyle: [{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }],
  radius: [{ value: 'none', label: 'None' }, { value: 'sm', label: 'S' }, { value: 'md', label: 'M' }, { value: 'lg', label: 'L' }, { value: 'card', label: 'Card', title: 'The template’s card corners' }, { value: 'pill', label: 'Pill', title: 'The template’s pill corners' }],
  shadow: [{ value: 'card', label: 'Card', title: 'The template’s card shadow' }, { value: 'raised', label: 'Raised', title: 'The template’s hover shadow' }],
  textSize: [{ value: 'sm', label: 'Small' }, { value: 'lg', label: 'Large' }, { value: 'xl', label: 'Extra large', title: 'Extra large (large on phones)' }],
  align: [{ value: 'start', label: 'Start' }, { value: 'center', label: 'Centre' }, { value: 'end', label: 'End' }],
  maxWidth: [{ value: 'narrow', label: 'Narrow', title: '36 rem' }, { value: 'text', label: 'Text', title: '68 characters' }, { value: 'wide', label: 'Wide', title: '60 rem' }],
};

export function optionsFor(key: StyleKey): StyleOption[] {
  if (key === 'hide') {
    return [
      { value: undefined, label: 'Shown everywhere' },
      { value: 'mobile', label: 'Hide below 992 px (phones and tablets)' },
      { value: 'desktop', label: 'Hide from 992 px (desktop)' },
    ];
  }
  if (SPACE_KEYS.has(key)) {
    return [DEFAULT, ...STYLE_SPACE.map((step) => {
      const phone = key === 'padX' ? PHONE_X[step] : PHONE_BLOCK[step];
      const title = `${SHORT[step]} — ${PX[step]} px${phone === undefined ? '' : `, ${phone} px on phones`}`;
      return { value: step, label: SHORT[step]!, title };
    })];
  }
  if (COLOUR_KEYS.has(key)) return [DEFAULT, ...STYLE_TOKENS.map((t) => ({ value: t, label: t }))];
  return [DEFAULT, ...(FIXED[key] ?? [])];
}

/** Border colour and style mean nothing without a width: clearing the width clears them too. */
const NEEDS_BORDER: ReadonlySet<StyleKey> = new Set(['borderColor', 'borderStyle']);

/**
 * One key changed; allowed keys only, canonical order; an empty result is `undefined` (never `{}`).
 * Clearing `border` also clears `borderColor` and `borderStyle`.
 */
export function setStyleKey(style: BlockStyle | undefined, key: StyleKey, value: string | undefined, support: StyleSupport): BlockStyle | undefined {
  const next: Record<string, string> = {};
  const noBorder = key === 'border' && value === undefined;
  for (const k of STYLE_KEY_ORDER) {
    if (!support.keys.includes(k)) continue;
    if (noBorder && NEEDS_BORDER.has(k)) continue;
    const v = k === key ? value : style?.[k];
    if (v !== undefined && (STYLE_KEYS[k] as readonly string[]).includes(v)) next[k] = v;
  }
  return Object.keys(next).length > 0 ? (next as BlockStyle) : undefined;
}

export const countSet = (style: BlockStyle | undefined, support: StyleSupport): number =>
  support.keys.filter((k) => style?.[k] !== undefined).length;

export type Rgb = [number, number, number];

/** An opaque sRGB colour as getComputedStyle reports it, else null (no hint beats a wrong one). */
export function parseCssColor(s: string): Rgb | null {
  const t = s.trim();
  const opaque = (a: string | undefined) => a === undefined || (a.endsWith('%') ? Number.parseFloat(a) >= 100 : Number(a) >= 1);
  let m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i.exec(t);
  if (m) return opaque(m[4]) ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i.exec(t);
  if (m) return opaque(m[4]) ? [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255] : null;
  return null;
}

function luminance([r, g, b]: Rgb): number {
  const f = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Rounded down, so 4.49 never reads as a passing 4.5. */
export const formatRatio = (r: number): string => `${(Math.floor(r * 10) / 10).toFixed(1)} : 1`;
