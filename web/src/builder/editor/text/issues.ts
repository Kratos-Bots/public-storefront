import { checkValue, type TextRule } from '@/text/resolve.ts';
import type { LocaleStrings, TextValue } from '@/text/types.ts';
import { rowFor } from '@/builder/editor/text/catalog.ts';
import type { TextIssue, TextScope } from '@/builder/editor/text/model.ts';

/**
 * Text problems as the editor shows and posts them (spec §6.3, §7.1, §7.2). The rules are the
 * shopper resolver's own (`checkValue`), plus the two `checkValue` may not flag: a plural without
 * a usable `other` (`empty`) and control characters (`control-char`), which the backend refuses on
 * autosave — a live check that passed them would 400.
 */

export const NON_BLOCKING: ReadonlySet<string> = new Set(['unknown-key']);

const NAME_RE = /\{([A-Za-z][A-Za-z0-9]{0,31})\}/g;
// Every control character except newline (U+000A) — the backend's rule (spec §4.3).
const CONTROL_RE = /[\u0000-\u0009\u000B-\u001F\u007F]/;
const isForms = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const textsOf = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : isForms(v) ? Object.values(v).filter((s): s is string => typeof s === 'string') : [];

/** The rule id of Plan 2's `checkValue` result, or null when the value is valid. */
function checkedRule(key: string, value: unknown): TextRule | null {
  const c = checkValue(key, value);
  return c.ok ? null : c.rule;
}

export function ruleFor(key: string, value: unknown): string | null {
  // The editor keeps a plural whose `other` is blank while the owner types; the backend refuses it.
  if (isForms(value) && rowFor(key)?.plural && (typeof value.other !== 'string' || value.other.trim() === '')) return 'empty';
  const rule = checkedRule(key, value);
  if (rule) return rule;
  if (textsOf(value).some((s) => CONTROL_RE.test(s))) return 'control-char';
  return null;
}

/**
 * Non-blocking hint: plural forms other than `one` (some locales use `one` for 0/21/31…) that leave
 * out {count}. Returns the form names; empty when there is nothing to warn about.
 */
export function countWarnings(key: string, value: unknown): string[] {
  if (!rowFor(key)?.plural || !isForms(value)) return [];
  return Object.entries(value)
    .filter(([form, s]) => form !== 'one' && typeof s === 'string' && s !== '' && !s.includes('{count}'))
    .map(([form]) => form);
}

const list = (names: readonly string[]) => names.map((n) => `{${n}}`).join(', ');

const quoteList = (forms: readonly string[]) => {
  const q = forms.map((f) => `“${f}”`);
  return q.length < 2 ? q.join('') : `${q.slice(0, -1).join(', ')} and ${q.at(-1)}`;
};

/** `empty` on a plural: name the form(s) actually blank — `other` first, as it has no fallback. */
function emptyFormsMessage(value: Record<string, unknown>): string {
  if (typeof value.other !== 'string' || value.other.trim() === '') {
    return 'Fill in the “other” form — it’s used for every count without a form of its own.';
  }
  const blank = Object.entries(value).filter(([, s]) => typeof s === 'string' && s.trim() === '').map(([f]) => f);
  if (blank.length === 0) return 'Fill in every form, or clear the ones you don’t need to use “other”.';
  return `Fill in the ${quoteList(blank)} form${blank.length > 1 ? 's' : ''}, or clear ${blank.length > 1 ? 'them' : 'it'} to use “other”.`;
}

export function textIssueMessage(rule: string, key: string, value: unknown): string {
  const row = rowFor(key);
  switch (rule) {
    case 'unknown-placeholder': {
      const used = [...new Set(textsOf(value).flatMap((v) => [...v.matchAll(NAME_RE)].map((m) => m[1]!)))];
      const unknown = used.filter((n) => !row?.placeholders.includes(n));
      const lead = `${list(unknown)} isn’t available in this line.`;
      return row && row.placeholders.length > 0 ? `${lead} You can use ${list(row.placeholders)}.` : `${lead} This line takes no placeholders.`;
    }
    case 'bad-brace':
      return row && row.placeholders.length > 0
        ? `Curly braces only go around a placeholder, like {${row.placeholders[0]}}. Remove the stray brace.`
        : 'Remove the curly brace — this line takes no placeholders.';
    case 'too-long':
      return `Keep this line to ${row?.max ?? 200} characters.`;
    case 'type-mismatch':
      return row?.plural
        ? 'This line needs one wording per count. Reset it and fill in the forms again.'
        : 'This line takes a single wording. Reset it and type it again.';
    case 'empty':
      return isForms(value) ? emptyFormsMessage(value) : 'Type some wording, or reset the line.';
    case 'control-char':
      return 'Remove the tabs or other invisible control characters.';
    case 'fixed':
      return 'This line can’t be changed here. Delete the saved wording.';
    case 'unknown-key':
      return 'This line is no longer used by the shop.';
    default:
      return 'This wording can’t be used. Reset it and try again.';
  }
}

export function textIssues(input: { shared: LocaleStrings | null; layout: LocaleStrings }): TextIssue[] {
  const out: TextIssue[] = [];
  const scan = (scope: TextScope, strings: LocaleStrings) => {
    for (const [key, value] of Object.entries(strings)) {
      const rule = ruleFor(key, value);
      if (rule && !NON_BLOCKING.has(rule)) out.push({ scope, key, rule, message: textIssueMessage(rule, key, value) });
    }
  };
  if (input.shared) scan('shared', input.shared);
  scan('layout', input.layout);
  return out;
}

export interface ResolvedCell { value: TextValue; from: 'layout' | 'shared' | 'default' }

/** One key as the canvas shows it: the first valid layer (spec §6.3). */
export function resolveCell(key: string, layers: { layout?: TextValue; shared?: TextValue }): ResolvedCell {
  if (layers.layout !== undefined && ruleFor(key, layers.layout) === null) return { value: layers.layout, from: 'layout' };
  if (layers.shared !== undefined && ruleFor(key, layers.shared) === null) return { value: layers.shared, from: 'shared' };
  return { value: rowFor(key)?.def ?? '', from: 'default' };
}

export interface UnusedEntry { scope: TextScope; key: string; rule: 'unknown-key' | 'fixed'; value: TextValue }

/** Stored wording this release can't show (spec §7.2 "Unused" group): delete-only. */
export function unusedEntries(input: { shared: LocaleStrings | null; layout: LocaleStrings }): UnusedEntry[] {
  const out: UnusedEntry[] = [];
  const scan = (scope: TextScope, strings: LocaleStrings) => {
    for (const [key, value] of Object.entries(strings)) {
      const rule = checkedRule(key, value);
      if (rule === 'unknown-key' || rule === 'fixed') out.push({ scope, key, rule, value });
    }
  };
  if (input.shared) scan('shared', input.shared);
  scan('layout', input.layout);
  return out;
}
