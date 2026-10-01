/**
 * Block styling (spec 2026-09-30-block-styling §3): the stored `blockStyle` prop. Runtime-safe and
 * import-free — define.ts imports this module, so it must never import define.ts back.
 * Mirrored by the backend's BLOCK_STYLE_VALUES (storefront-pages/schemas.ts): change both, backend first.
 */

/** PALETTE_TOKENS without 'none' (a test pins the equality). */
export const STYLE_TOKENS = ['bg', 'bg-deep', 'surface', 'surface-2', 'surface-3', 'line', 'line-strong',
  'text', 'muted', 'faint', 'primary', 'primary-soft', 'success', 'warn', 'danger'] as const;
/** = keys of define.ts SPACING (a test pins the equality). */
export const STYLE_SPACE = ['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const;

export const STYLE_KEYS = {
  bg: STYLE_TOKENS,
  fg: STYLE_TOKENS,
  padTop: STYLE_SPACE,
  padBottom: STYLE_SPACE,
  padX: STYLE_SPACE,
  marginTop: STYLE_SPACE,
  marginBottom: STYLE_SPACE,
  border: ['thin', 'medium', 'thick'],
  borderColor: STYLE_TOKENS,
  borderStyle: ['solid', 'dashed', 'dotted'],
  radius: ['none', 'sm', 'md', 'lg', 'card', 'pill'],
  shadow: ['card', 'raised'],
  textSize: ['sm', 'lg', 'xl'],
  align: ['start', 'center', 'end'],
  maxWidth: ['narrow', 'text', 'wide'],
  hide: ['mobile', 'desktop'],
} as const;

export type StyleKey = keyof typeof STYLE_KEYS;
export type BlockStyle = { [K in StyleKey]?: (typeof STYLE_KEYS)[K][number] };
/** Canonical key order: the guard and the editor write keys in this order so diffs stay quiet. */
export const STYLE_KEY_ORDER = Object.keys(STYLE_KEYS) as StyleKey[];

export const BOX: readonly StyleKey[] = ['bg', 'padTop', 'padBottom', 'padX', 'marginTop', 'marginBottom', 'border',
  'borderColor', 'borderStyle', 'radius', 'shadow', 'maxWidth'];
export const TEXT: readonly StyleKey[] = ['fg', 'textSize', 'align'];
export const VIS: readonly StyleKey[] = ['hide'];

/** Where a block's style attributes land (spec §4/§5.1). */
export type StyleTarget = 'root' | 'wrap' | 'pass';
export interface StyleSupport { target: StyleTarget; keys: readonly StyleKey[] }

export function styleSupport(target: StyleTarget, include: readonly StyleKey[], exclude: readonly StyleKey[] = []): StyleSupport {
  return { target, keys: STYLE_KEY_ORDER.filter((k) => include.includes(k) && !exclude.includes(k)) };
}

/** `data-sfs-<suffix>`; `hide` becomes `data-sfs-ghost` on the editor canvas (apply.tsx). */
export const STYLE_ATTR: Record<StyleKey, string> = {
  bg: 'bg', fg: 'fg', padTop: 'pt', padBottom: 'pb', padX: 'px', marginTop: 'mt', marginBottom: 'mb', border: 'border',
  borderColor: 'bc', borderStyle: 'bs', radius: 'radius', shadow: 'shadow', textSize: 'text', align: 'align', maxWidth: 'max', hide: 'hide',
};

export const isStyleKey = (k: string): k is StyleKey => Object.hasOwn(STYLE_KEYS, k);

export function isStyleValue(key: StyleKey, v: unknown): boolean {
  return typeof v === 'string' && (STYLE_KEYS[key] as readonly string[]).includes(v);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

export interface ParsedStyle { style?: BlockStyle; issues: string[] }

/**
 * Spec §10.1. Unknown keys drop silently (forward compatibility); a known key the block doesn't
 * accept, or a value outside the key's list, drops with an issue (`blockStyle.<key>`); a non-object
 * is one issue (`blockStyle`). Nothing left ⇒ no `style`. Output keys are in canonical order.
 */
export function parseBlockStyle(support: StyleSupport | false, raw: unknown): ParsedStyle {
  if (raw === undefined) return { issues: [] };
  if (!isPlainObject(raw)) return { issues: ['blockStyle'] };
  const allowed = support ? support.keys : [];
  const out: Record<string, string> = {};
  const issues: string[] = [];
  for (const key of STYLE_KEY_ORDER) {
    if (!Object.hasOwn(raw, key)) continue;
    const value = raw[key];
    if (value === undefined) continue;
    if (!allowed.includes(key) || !isStyleValue(key, value)) {
      issues.push(`blockStyle.${key}`);
      continue;
    }
    out[key] = value as string;
  }
  return Object.keys(out).length > 0 ? { style: out as BlockStyle, issues } : { issues };
}
