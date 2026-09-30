// web/src/builder/editor/text/TextRow.tsx
import { memo, useId, useMemo, useRef, useState } from 'react';
import type { TextValue } from '@/text/types.ts';
import { editorTextOf, languageRoom, textIssuesOf, textLanguage, useEditorStore } from '@/builder/editor/store.ts';
import { TEXT_LIMITS } from '@/text/types.ts';
import { LAYOUT_LABELS } from '@/builder/editor/page-catalog.ts';
import { WarnIcon } from '@/builder/editor/icons.tsx';
import { applyText, useLoadEpoch, type TextCell } from '@/builder/editor/text/hooks.ts';
import type { DraftValue, PluralForm, TextIssue, TextScope } from '@/builder/editor/text/model.ts';
import type { TextRowDef } from '@/builder/editor/text/catalog.ts';
import { countWarnings, resolveCell } from '@/builder/editor/text/issues.ts';
import { fillExample, pluralFormsFor, sampleCount } from '@/builder/editor/text/languages.ts';
import styles from '@/builder/editor/text/Text.module.css';

const domId = (reactId: string) => reactId.replace(/[^A-Za-z0-9_-]/g, '');
export const SHARED_LOCKED = 'Shared wording can’t be changed from this version of the admin.';
export const READ_ONLY = 'This version is read-only.';
export const NO_ROOM = `This already has wording in ${TEXT_LIMITS.locales} other languages, the most the shop keeps. Clear one under Language to type in this one.`;
export const TEXT_LOADING = 'Loading the shop’s wording…';
export const TEXT_UNREADABLE = 'The shop’s wording couldn’t be read, so text can’t be edited here. Reload the editor to try again.';

type Forms = Partial<Record<PluralForm, string>>;
const isForms = (v: DraftValue | TextValue | undefined): v is Forms => typeof v === 'object' && v !== null;

/** The form a plural shows when a category has none of its own (spec §6.3: its own `other`). */
const formOf = (value: DraftValue | TextValue, category: string): string =>
  typeof value === 'string' ? value : (value as Record<string, string | undefined>)[category] ?? value.other ?? '';
export const summary = (value: DraftValue | TextValue): string => formOf(value, 'other');

/** Non-blocking hints for the value at the chosen scope: {count} left out, edge spaces dropped. */
function warningsFor(row: TextRowDef, value: DraftValue | undefined): string[] {
  if (value === undefined) return [];
  const out = countWarnings(row.key, value).map(
    (form) => `The “${form}” form leaves out {count}, so shoppers won’t see the number.`,
  );
  const pairs: Array<[string | null, string]> = isForms(value)
    ? Object.entries(value).filter((e): e is [string, string] => typeof e[1] === 'string').map(([f, s]) => [f, s])
    : [[null, value]];
  for (const [form, text] of pairs) {
    if (text === '') continue;
    const def = formOf(row.def, form ?? 'other');
    const where = form ? `The “${form}” form` : 'Yours';
    if (/^\s/.test(def) && !/^\s/.test(text)) out.push(`The built-in wording starts with a space. ${where} doesn’t, so it may run into the words before it.`);
    if (/\s$/.test(def) && !/\s$/.test(text)) out.push(`The built-in wording ends with a space. ${where} doesn’t, so it may run into the words after it.`);
  }
  return out;
}

type Field = HTMLInputElement | HTMLTextAreaElement;

const EMPTY_ISSUES: TextIssue[] = [];
const own = (map: Record<string, TextValue>, key: string): DraftValue | undefined => (Object.hasOwn(map, key) ? map[key] : undefined);

/**
 * `useTextCell`, narrowed to this key's own store slices: a keystroke in another row changes
 * neither this key's layer values (same references in the copied maps) nor its issue signature,
 * so this row does not re-render. With ~700 rows, that is what keeps typing responsive.
 */
function useRowCell(key: string): TextCell {
  // The store's draft layers may hold a DraftValue (a plural without `other` while typing).
  const shared = useEditorStore((s) => own(editorTextOf(s).shared, key));
  const layout = useEditorStore((s) => own(editorTextOf(s).layout, key));
  const sharedEditable = useEditorStore((s) => s.sharedEditable);
  const signature = useEditorStore((s) => {
    const mine = textIssuesOf(s).filter((i) => i.key === key);
    return mine.length === 0 ? '' : JSON.stringify(mine);
  });
  const issues = useMemo(() => (signature ? (JSON.parse(signature) as TextIssue[]) : EMPTY_ISSUES), [signature]);
  return useMemo(() => ({
    shared, layout, sharedEditable,
    // resolveCell only returns a layer that passes ruleFor (a usable `other`), i.e. a real TextValue.
    effective: resolveCell(key, { layout: layout as TextValue | undefined, shared: shared as TextValue | undefined }),
    below: resolveCell(key, { shared: shared as TextValue | undefined }),
    issues,
  }), [key, shared, layout, sharedEditable, issues]);
}

/**
 * One editable line (spec §7.2). Remounted on every editor load, so the scope, the caret target
 * and the edit's load are never carried from one load into the next.
 */
export const TextRow = memo(function TextRow(props: { row: TextRowDef; compact?: boolean }) {
  const loadEpoch = useLoadEpoch();
  return <RowForLoad key={loadEpoch} loadEpoch={loadEpoch} {...props} />;
});

function RowForLoad({ row, compact = false, loadEpoch }: { row: TextRowDef; compact?: boolean; loadEpoch: number }) {
  const cell = useRowCell(row.key);
  const layout = useEditorStore((s) => s.layout);
  const readOnly = useEditorStore((s) => s.readOnly);
  const locale = useEditorStore((s) => textLanguage(s).locale);
  /** Layers that can't take wording in the active language (the backend's language cap). */
  const full = useEditorStore((s) => languageRoom(s, textLanguage(s).locale).join(' '));
  const id = domId(useId());
  const [scope, setScope] = useState<TextScope>(() => (cell.layout !== undefined || !cell.sharedEditable ? 'layout' : 'shared'));
  /** The load the current edit started under: captured on focus, else the load this row mounted in. */
  const editEpoch = useRef(loadEpoch);
  const last = useRef<{ el: Field; form: string | null } | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const layoutLabel = LAYOUT_LABELS[layout];
  const stored = scope === 'shared' ? cell.shared : cell.layout;
  const under: DraftValue | TextValue = scope === 'layout' ? cell.below.value : row.def;
  const noRoom = full.split(' ').includes(scope);
  const locked = readOnly || (scope === 'shared' && !cell.sharedEditable) || noRoom;
  const scopeIssues = cell.issues.filter((i) => i.scope === scope);
  const fromLabel = cell.effective.from === 'default' ? 'Built-in' : cell.effective.from === 'shared' ? 'Shared' : layoutLabel;
  const forms = row.plural ? pluralFormsFor(locale) : [];
  const storedForms: Forms = isForms(stored) ? stored : {};
  const storedText = typeof stored === 'string' ? stored : '';
  const warnings = warningsFor(row, stored);

  const write = (value: DraftValue | null) => { applyText(scope, row.key, value, editEpoch.current); };
  const writeForm = (form: string, text: string) => write({ ...storedForms, [form]: text });
  const track = (el: Field, form: string | null) => { last.current = { el, form }; setActive(form ?? ''); };
  const start = (el: Field, form: string | null) => { editEpoch.current = useEditorStore.getState().loadEpoch; track(el, form); };

  // The chip's caret target belongs to the scope it was taken in.
  const switchScope = (next: TextScope) => { setScope(next); setActive(null); last.current = null; };

  const insert = (name: string) => {
    const target = last.current?.el.isConnected ? last.current : null;
    const token = `{${name}}`;
    const form = target?.form ?? (row.plural ? 'other' : null);
    const current = form ? storedForms[form as PluralForm] ?? '' : storedText;
    const at = Math.min(target?.el.selectionStart ?? current.length, current.length);
    const end = Math.min(target?.el.selectionEnd ?? at, current.length);
    const next = current.slice(0, at) + token + current.slice(end);
    if (form) writeForm(form, next);
    else write(next);
    const el = target?.el;
    if (el) requestAnimationFrame(() => { if (el.isConnected) { el.focus(); el.setSelectionRange(at + token.length, at + token.length); } });
  };

  const described = compact ? `${id}-issues` : `${id}-note ${id}-issues`;
  const Input = row.multiline ? 'textarea' : 'input';
  const length = active ? (storedForms[active as PluralForm] ?? '').length : row.plural ? summary(stored ?? '').length : storedText.length;
  const lockReason = readOnly ? READ_ONLY : scope === 'shared' && !cell.sharedEditable ? SHARED_LOCKED : NO_ROOM;

  return (
    <div className={styles.row} data-text-key={row.key} data-compact={compact ? '' : undefined} data-sfb-text="">
      <div className={styles.rowHead}>
        {row.plural
          ? <span id={`${id}-label`} className={styles.rowLabel}>{row.label}</span>
          : <label className={styles.rowLabel} htmlFor={`${id}-v`}>{row.label}</label>}
        <span className={styles.layer} data-from={cell.effective.from} title="Where the shop takes this line from">{fromLabel}</span>
      </div>
      {!compact && (
        <p id={`${id}-note`} className={styles.note}>
          {row.note && <span>{row.note}. </span>}
          <span className={styles.builtIn}>Built-in: {summary(row.def)}</span>
        </p>
      )}
      <div className={styles.scope} role="group" aria-label="Applies to">
        <button
          type="button"
          aria-pressed={scope === 'shared'}
          disabled={!cell.sharedEditable}
          title={cell.sharedEditable ? undefined : SHARED_LOCKED}
          onClick={() => switchScope('shared')}
        >
          All layouts
        </button>
        <button type="button" aria-pressed={scope === 'layout'} onClick={() => switchScope('layout')}>
          Only {layoutLabel}
        </button>
      </div>
      {row.plural ? (
        <div className={styles.forms} role="group" aria-labelledby={`${id}-label`}>
          {forms.map((form) => {
            const value = storedForms[form as PluralForm] ?? '';
            const n = sampleCount(locale, form);
            return (
              <label key={form} className={styles.form}>
                <span className={styles.formName}>{form}</span>
                <input
                  aria-label={`${row.label} — ${form}`}
                  aria-describedby={described}
                  aria-invalid={scopeIssues.length > 0 || undefined}
                  value={value}
                  placeholder={formOf(under, form)}
                  readOnly={locked}
                  title={locked ? lockReason : undefined}
                  onFocus={(e) => start(e.currentTarget, form)}
                  onSelect={(e) => track(e.currentTarget, form)}
                  onChange={(e) => writeForm(form, e.target.value)}
                />
                <span className={styles.example}>e.g. {fillExample(value || formOf(cell.effective.value, form), n)}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <Input
          id={`${id}-v`}
          className={styles.input}
          aria-describedby={described}
          aria-invalid={scopeIssues.length > 0 || undefined}
          value={storedText}
          placeholder={summary(under)}
          readOnly={locked}
          title={locked ? lockReason : undefined}
          rows={row.multiline ? 3 : undefined}
          onFocus={(e) => start(e.currentTarget, null)}
          onSelect={(e) => track(e.currentTarget, null)}
          onChange={(e) => write(e.target.value)}
        />
      )}
      <div className={styles.rowFoot}>
        <span className={styles.chips}>
          {row.placeholders.map((name) => (
            <button
              key={name}
              type="button"
              className={styles.chip}
              aria-label={`Insert {${name}}`}
              disabled={locked}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(name)}
            >
              {`{${name}}`}
            </button>
          ))}
        </span>
        <span className={styles.count} data-over={length > row.max ? '' : undefined}>{length} / {row.max}</span>
        <button type="button" className={styles.reset} disabled={stored === undefined || locked} onClick={() => write(null)}>Reset</button>
      </div>
      <ul id={`${id}-issues`} className={styles.rowIssues} aria-live="polite">
        {cell.issues.map((i) => {
          const prefix = i.scope !== scope ? `${i.scope === 'shared' ? 'All layouts' : `Only ${layoutLabel}`}: ` : '';
          return (
            <li key={`${i.scope}-${i.rule}`} className={styles.issue}>
              <WarnIcon />
              <span>{prefix}{i.message}</span>
            </li>
          );
        })}
        {warnings.map((w) => (
          <li key={w} className={styles.warning}>
            <WarnIcon />
            <span>{w}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
