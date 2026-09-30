import { isPluralForms, type TextValue } from '@/text/types.ts';

export interface TextEntry {
  /** The built-in default — the rendered English of v0.7.0, character for character. */
  readonly en: TextValue;
  // Editor-only notes and labels live in `@/text/notes/*` (imported only by builder/editor/**), so
  // the shopper bundle does not carry them.
  /** Max length of every form (default DEFAULT_MAX, never above TEXT_LIMITS.value). */
  readonly max?: number;
  /** Goes through useText but is never editable (closed.*, boot.* — spec §6.2). */
  readonly fixed?: boolean;
}

export interface TextArea<A extends string, E> {
  readonly area: A;
  readonly entries: { readonly [K in keyof E & string as `${A}.${K}`]: E[K] };
}

/** One registry file per area (spec §6.1). `const` type parameters keep every key and default literal. */
export function defineTextArea<const A extends string, const E extends Record<string, TextEntry>>(area: A, entries: E): TextArea<A, E> {
  const out: Record<string, TextEntry> = {};
  for (const [k, v] of Object.entries(entries)) out[`${area}.${k}`] = v;
  return { area, entries: out as TextArea<A, E>['entries'] };
}

const PLACEHOLDER_RE = /\{([A-Za-z][A-Za-z0-9]{0,31})\}/g;

export function placeholdersIn(s: string): string[] {
  const names: string[] = [];
  for (const m of s.matchAll(PLACEHOLDER_RE)) if (!names.includes(m[1]!)) names.push(m[1]!);
  return names;
}

/** A `{` or `}` left once every valid placeholder is removed — there is no escape syntax. */
export function hasBadBrace(s: string): boolean {
  return /[{}]/.test(s.replace(PLACEHOLDER_RE, ''));
}

export function formsOf(v: TextValue): string[] {
  return typeof v === 'string' ? [v] : Object.values(v).filter((f): f is string => typeof f === 'string');
}

/** The union of names in every default form; a plural key always accepts `count`. */
export function placeholdersOf(entry: TextEntry): ReadonlySet<string> {
  const names = new Set(formsOf(entry.en).flatMap(placeholdersIn));
  if (isPluralForms(entry.en)) names.add('count');
  return names;
}

// ── type helpers ────────────────────────────────────────────────────────────
type Holes<S> = S extends `${string}{${infer N}}${infer R}` ? N | Holes<R> : never;
/** `ParamsOf<'Only {available} left'>` → `{ available: string | number }`. */
export type ParamsOf<S extends string> = { [N in Holes<S>]: string | number };
/** Placeholder names of an entry type: string default → its holes; plural → holes of every form + 'count'. */
export type EntryParams<E> = E extends { readonly en: infer V }
  ? V extends string ? Holes<V> : Holes<V[keyof V] & string> | 'count'
  : never;
