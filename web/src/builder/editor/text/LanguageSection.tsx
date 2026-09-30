// web/src/builder/editor/text/LanguageSection.tsx
import { useId, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '@/builder/editor/store.ts';
import { applyLanguage, useEditorText, useLoadEpoch, useTextLanguage } from '@/builder/editor/text/hooks.ts';
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
        <select value={locale} disabled={!editable} onChange={(e) => applyLanguage({ locale: e.target.value }, loadEpoch)}>
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
    </section>
  );
}
