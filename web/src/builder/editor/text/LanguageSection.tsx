// web/src/builder/editor/text/LanguageSection.tsx
import { useId, useMemo, useRef, useState } from 'react';
import { TEXT_LIMITS } from '@/text/types.ts';
import { languageRoom, useEditorStore } from '@/builder/editor/store.ts';
import { applyClearLanguage, applyLanguage, useEditorText, useLoadEpoch, useTextIssues, useTextLanguage } from '@/builder/editor/text/hooks.ts';
import { isLayerIssue } from '@/builder/editor/text/issues.ts';
import { wordingLanguages, type TextScope } from '@/builder/editor/text/model.ts';
import { LAYOUT_LABELS } from '@/builder/editor/page-catalog.ts';
import { WarnIcon } from '@/builder/editor/icons.tsx';
import { allRows } from '@/builder/editor/text/catalog.ts';
import { canonicalTag, formatOptions, LANGUAGES, nativeName } from '@/builder/editor/text/languages.ts';
import { READ_ONLY, SHARED_LOCKED } from '@/builder/editor/text/TextRow.tsx';
import styles from '@/builder/editor/text/Text.module.css';

const OTHER = '__other__';

/** Store language and number/date format (spec §7.2). Remounted per load, like the rows. */
export function LanguageSection() {
  const loadEpoch = useLoadEpoch();
  return <LanguageForLoad key={loadEpoch} loadEpoch={loadEpoch} />;
}

function LanguageForLoad({ loadEpoch }: { loadEpoch: number }) {
  const { locale, formatLocale } = useTextLanguage();
  const text = useEditorText();
  const sharedEditable = useEditorStore((s) => s.sharedEditable);
  const readOnly = useEditorStore((s) => s.readOnly);
  const editable = sharedEditable && !readOnly;
  const id = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const [typing, setTyping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A language the owner picked that a full layer had no room for; the notice explains it. */
  const [refused, setRefused] = useState<string | null>(null);
  /** The load a typed tag started under: a commit (Enter, blur) after another load is refused. */
  const tagEpoch = useRef(loadEpoch);

  const languages = useMemo(() => {
    const list = LANGUAGES.map((l) => ({ value: l.code, label: nativeName(l.code) }));
    return list.some((l) => l.value === locale) ? list : [{ value: locale, label: nativeName(locale) }, ...list];
  }, [locale]);
  const formats = useMemo(() => {
    const list = formatOptions(locale);
    return formatLocale && !list.some((o) => o.value === formatLocale) ? [...list, { value: formatLocale, label: formatLocale }] : list;
  }, [locale, formatLocale]);

  const rows = allRows();
  const set = rows.filter((r) => text.shared[r.key] !== undefined || text.layout[r.key] !== undefined).length;
  const counter = locale === 'en'
    ? `${set} of ${rows.length} lines changed from the built-in wording`
    : `${set} of ${rows.length} lines set in ${nativeName(locale)} — the rest show the built-in English`;

  const commitTag = () => {
    if (typing === null) return;
    const tag = canonicalTag(typing);
    if (!tag) { setError('Use a language tag like en-GB or pt-BR.'); return; }
    if (!applyLanguage({ formatLocale: tag }, tagEpoch.current)) return;
    setTyping(null);
    setError(null);
  };

  return (
    <section className={styles.language} aria-labelledby={`${id}-lang`}>
      <h3 id={`${id}-lang`} className={styles.sectionTitle}>Language</h3>
      {!editable && (
        <p className={styles.locked}>
          {readOnly ? READ_ONLY : `${SHARED_LOCKED} Update the admin to change it; this layout’s wording still saves.`}
        </p>
      )}
      <label className={styles.field}>
        <span>Store language</span>
        <select
          value={locale}
          disabled={!editable}
          onChange={(e) => {
            const next = e.target.value;
            if (next !== locale && languageRoom(useEditorStore.getState(), next).length > 0) { setRefused(next); return; }
            setRefused(null);
            applyLanguage({ locale: next }, loadEpoch);
          }}
        >
          {languages.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </label>
      <label className={styles.field}>
        <span>Numbers and dates</span>
        <select
          value={typing !== null ? OTHER : formatLocale}
          disabled={!editable}
          onChange={(e) => {
            if (e.target.value === OTHER) { tagEpoch.current = useEditorStore.getState().loadEpoch; setTyping(''); return; }
            setTyping(null);
            setError(null);
            applyLanguage({ formatLocale: e.target.value }, loadEpoch);
          }}
        >
          {formats.map((o) => <option key={o.value || 'builtin'} value={o.value}>{o.label}</option>)}
          <option value={OTHER}>Another language tag…</option>
        </select>
      </label>
      {typing !== null && (
        <label className={styles.field}>
          <span>Language tag</span>
          <input
            value={typing}
            placeholder="en-GB"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-tagerr`}
            onFocus={() => { tagEpoch.current = useEditorStore.getState().loadEpoch; }}
            onChange={(e) => { setTyping(e.target.value); setError(null); }}
            onBlur={commitTag}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitTag(); } }}
          />
          <span id={`${id}-tagerr`} className={styles.error} role={error ? 'alert' : undefined}>{error}</span>
        </label>
      )}
      <p className={styles.counter}>{counter}</p>
      <LanguageRoom locale={locale} refused={refused} loadEpoch={loadEpoch} />
    </section>
  );
}

const lines = (n: number) => `${n} line${n === 1 ? '' : 's'}`;

/**
 * The backend keeps wording in at most TEXT_LIMITS.locales languages per layer (spec §4.3). Shown
 * when a pick was refused, when a layer can't take the active language, or when stored wording is
 * already over a layer cap: says why, and lists the other languages holding wording, each with a
 * way to clear it (one undo step).
 */
function LanguageRoom({ locale, refused, loadEpoch }: { locale: string; refused: string | null; loadEpoch: number }) {
  const id = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const shared = useEditorStore((s) => (s.sharedEditable ? s.siteText?.strings : undefined));
  const layoutStrings = useEditorStore((s) => s.pageText.strings);
  const layout = useEditorStore((s) => s.layout);
  const readOnly = useEditorStore((s) => s.readOnly);
  const activeFull = useEditorStore((s) => languageRoom(s, locale).join(' '));
  const refusedFull = useEditorStore((s) => (refused ? languageRoom(s, refused).join(' ') : ''));
  const issues = useTextIssues().filter((i) => isLayerIssue(i.key));

  const where = (full: string) => full.split(' ').filter(Boolean)
    .map((sc) => ((sc as TextScope) === 'shared' ? 'the wording for all layouts' : `the wording only for ${LAYOUT_LABELS[layout]}`)).join(' and ');
  const messages: string[] = [];
  if (refused && refusedFull) {
    messages.push(`${nativeName(refused)} can’t be added: the shop keeps wording in at most ${TEXT_LIMITS.locales} languages, and ${where(refusedFull)} already holds ${TEXT_LIMITS.locales}. Clear a language you no longer use, then pick ${nativeName(refused)} again.`);
  } else if (refused) {
    messages.push(`There’s room for ${nativeName(refused)} now. Pick it again to switch.`);
  }
  if (activeFull) {
    messages.push(`${nativeName(locale)} can’t be added to ${where(activeFull)}: it already holds ${TEXT_LIMITS.locales} other languages, the most the shop keeps. Clear one you no longer use to type in ${nativeName(locale)}.`);
  }
  for (const i of issues) messages.push(i.message);
  if (messages.length === 0) return null;

  const held = new Map<string, number>();
  for (const strings of [shared, layoutStrings]) {
    if (!strings) continue;
    for (const l of wordingLanguages(strings)) held.set(l, (held.get(l) ?? 0) + Object.keys(strings[l]!).length);
  }
  const others = [...held].filter(([l]) => l !== locale);

  return (
    <section className={styles.room} aria-labelledby={`${id}-room`} data-text-key="languages">
      <h4 id={`${id}-room`} className={styles.roomTitle}><WarnIcon />Room for languages</h4>
      {messages.map((m) => <p key={m} className={styles.roomText}>{m}</p>)}
      {others.length > 0 && (
        <>
          <ul className={styles.roomList}>
            {others.map(([l, n]) => (
              <li key={l}>
                <span className={styles.roomName}>{nativeName(l)}</span>
                <span className={styles.roomCount}>{lines(n)}</span>
                <button
                  type="button"
                  className={styles.reset}
                  aria-label={`Clear wording in ${nativeName(l)}`}
                  disabled={readOnly}
                  onClick={() => applyClearLanguage(l, loadEpoch)}
                >
                  Clear wording
                </button>
              </li>
            ))}
          </ul>
          <p className={styles.note}>Undo brings cleared wording back.</p>
        </>
      )}
    </section>
  );
}
