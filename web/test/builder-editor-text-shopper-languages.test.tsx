// web/test/builder-editor-text-shopper-languages.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';

// A stand-in French pack with one key, so the tests do not depend on the real translations.
const pack = vi.hoisted(() => ({ value: undefined as Record<string, string> | undefined }));
vi.mock('@/text/packs/index.ts', async (orig) => ({
  ...(await orig<typeof import('@/text/packs/index.ts')>()),
  packFor: (locale: string) => (locale.split('-')[0] === 'fr' ? pack.value : undefined),
  preloadPacks: async () => undefined,
}));

import { DEFAULT_PREVIEW_AS, TEXT_INITIAL, editingLocaleOf, editorTextOf, languageRoom, textIssuesOf, useEditorStore } from '@/builder/editor/store.ts';
import { TEXT_LIMITS } from '@/text/types.ts';
import { postableSiteText } from '@/builder/editor/text/model.ts';
import { builtInFor, rowFor } from '@/builder/editor/text/catalog.ts';
import { applyText, notifyPacksLoaded, publishedLanguage, useEditingLocale, useEditorText } from '@/builder/editor/text/hooks.ts';
import { useTextUi } from '@/builder/editor/text/ui-store.ts';
import { TextPanel } from '@/builder/editor/text/TextPanel.tsx';
import { TextRow } from '@/builder/editor/text/TextRow.tsx';
import { nativeName } from '@/builder/editor/text/languages.ts';
import { defaultOf, pluralKey, plainKey } from './helpers/text-keys.ts';

const S = () => useEditorStore.getState();
const reset = () => {
  useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null, ...TEXT_INITIAL });
  useTextUi.setState({ open: true, filter: 'all', query: '', focus: null, editLocale: null });
  pack.value = undefined;
};
const SITE = { schemaVersion: 1 as const, language: { locale: 'en', formatLocale: '' as const }, strings: {} };
const load = (language: { locale: string; formatLocale: '' | string; offered?: string[] } = SITE.language) =>
  S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: { ...SITE, language: language as typeof SITE.language } });

/** A layer holding wording in TEXT_LIMITS.locales languages: en plus q-b, q-c, … */
const fullStrings = (key: string) => {
  const strings: Record<string, Record<string, string>> = {};
  for (let i = 0; i < TEXT_LIMITS.locales; i += 1) strings[i === 0 ? 'en' : `q${String.fromCharCode(97 + i)}`] = { [key]: 'x' };
  return strings;
};

describe('store: offered languages', () => {
  beforeEach(reset);
  const key = plainKey();

  it('setLanguage accepts offered; unique, canonical, never the default, within the cap', () => {
    load();
    expect(S().setLanguage({ offered: ['fr', 'it'] }, null)).toBe(true);
    expect(S().siteText!.language).toEqual({ locale: 'en', formatLocale: '', offered: ['fr', 'it'] });
    expect(S().setLanguage({ offered: ['fr', 'fr'] }, null)).toBe(false);
    expect(S().setLanguage({ offered: ['en'] }, null)).toBe(false);
    expect(S().setLanguage({ offered: ['fr-fr'] }, null)).toBe(false);
    expect(S().setLanguage({ offered: Array.from({ length: TEXT_LIMITS.locales }, (_, i) => `x${String.fromCharCode(97 + i)}`) }, null)).toBe(false);
    expect(S().setLanguage({ offered: ['fr', 'it'] }, null)).toBe(true);   // unchanged: a no-op, no history entry
    expect(S().textPast).toHaveLength(1);
    expect(S().setLanguage({ offered: [] }, null)).toBe(true);
    expect(S().siteText!.language).toEqual({ locale: 'en', formatLocale: '' });   // no empty `offered` key
  });

  it('a language no layer has room for cannot be offered (room check)', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: { ...SITE, strings: fullStrings(key) } });
    expect(languageRoom(S(), 'fr')).toEqual(['shared']);
    expect(S().setLanguage({ offered: ['fr'] }, null)).toBe(false);
    expect(S().setLanguage({ offered: ['qb'] }, null)).toBe(true);   // already holds wording: not a new language
  });

  it('changing the default removes it from offered', () => {
    load({ locale: 'en', formatLocale: '', offered: ['fr', 'it'] });
    expect(S().setLanguage({ locale: 'fr' }, null)).toBe(true);
    expect(S().siteText!.language).toEqual({ locale: 'fr', formatLocale: '', offered: ['it'] });
    expect(S().setLanguage({ locale: 'it' }, null)).toBe(true);
    expect(S().siteText!.language).toEqual({ locale: 'it', formatLocale: '' });
  });

  it('postableSiteText keeps offered only when non-empty (old documents round-trip byte-identically)', () => {
    const old = { ...SITE, strings: { en: { [key]: 'Hi' } } };
    expect(JSON.stringify(postableSiteText(old))).toBe(JSON.stringify(old));
    expect(JSON.stringify(postableSiteText({ ...old, language: { ...old.language, offered: [] } }))).toBe(JSON.stringify(old));
    expect(postableSiteText({ ...old, language: { ...old.language, offered: ['fr'] } }).language.offered).toEqual(['fr']);
  });

  it('un-offering keeps the wording', () => {
    load({ locale: 'en', formatLocale: '', offered: ['fr'] });
    useTextUi.getState().setEditLocale('fr');
    S().setText('shared', key, 'Bonjour', null);
    S().setLanguage({ offered: [] }, null);
    expect(S().siteText!.strings.fr![key]).toBe('Bonjour');
  });
});

describe('the editing language', () => {
  beforeEach(reset);
  afterEach(cleanup);
  const key = plainKey();

  it('defaults to the store language and falls back when the pick is not offered', () => {
    load({ locale: 'de', formatLocale: '', offered: ['fr'] });
    expect(editingLocaleOf(S())).toBe('de');
    useTextUi.getState().setEditLocale('fr');
    expect(editingLocaleOf(S())).toBe('fr');
    useTextUi.getState().setEditLocale('it');
    expect(editingLocaleOf(S())).toBe('de');
  });

  it('writes, issues and the canvas text follow it', () => {
    load({ locale: 'en', formatLocale: 'en-GB', offered: ['fr'] });
    S().setText('shared', key, 'English', null);
    useTextUi.getState().setEditLocale('fr');
    expect(S().setText('shared', key, 'Français', null)).toBe(true);
    expect(S().siteText!.strings).toMatchObject({ en: { [key]: 'English' }, fr: { [key]: 'Français' } });
    S().setText('layout', key, 'Bad {nope}', null);
    expect(textIssuesOf(S()).map((i) => [i.scope, i.locale])).toEqual([['layout', 'fr']]);
    useTextUi.getState().setEditLocale(null);
    // Switching away does not hide it: the French layer still blocks publishing.
    expect(textIssuesOf(S()).map((i) => [i.scope, i.locale])).toEqual([['layout', 'fr']]);
    expect(editorTextOf(S())).toMatchObject({ locale: 'en', formatLocale: 'en-GB', languages: ['en', 'fr'], shared: { [key]: 'English' } });
    useTextUi.getState().setEditLocale('fr');
    expect(editorTextOf(S())).toMatchObject({ locale: 'fr', formatLocale: '', languages: ['en', 'fr'], shared: { [key]: 'Français' } });
  });

  it('the room check is for the editing language', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: { ...SITE, language: { locale: 'en', formatLocale: '', offered: ['qb'] }, strings: fullStrings(key) } });
    useTextUi.getState().setEditLocale('qb');
    expect(S().setText('shared', key, 'still fits', null)).toBe(true);
    S().setLanguage({ offered: ['qb', 'fr'] }, null);   // refused: no room for a new language
    expect(S().siteText!.language.offered).toEqual(['qb']);
  });

  it('resets to the default when the pick leaves the list', () => {
    load({ locale: 'en', formatLocale: '', offered: ['fr'] });
    useTextUi.getState().setEditLocale('fr');
    const { result } = renderHook(() => useEditingLocale());
    expect(result.current).toBe('fr');
    act(() => { S().setLanguage({ offered: [] }, null); });
    expect(result.current).toBe('en');
    expect(useTextUi.getState().editLocale).toBeNull();
  });

  it('applyText writes into the editing language', () => {
    load({ locale: 'en', formatLocale: '', offered: ['it'] });
    useTextUi.getState().setEditLocale('it');
    applyText('layout', key, 'Ciao');
    expect(S().pageText.strings).toEqual({ it: { [key]: 'Ciao' } });
  });

  it('the Text panel has the select; choosing a language shows its counter', () => {
    load({ locale: 'en', formatLocale: '', offered: ['fr', 'de'] });
    render(<TextPanel />);
    const select = screen.getByRole('combobox', { name: 'Editing language' });
    expect([...select.querySelectorAll('option')].map((o) => o.getAttribute('value'))).toEqual(['en', 'fr', 'de']);
    expect(select).toHaveValue('en');
    expect(screen.getByText(/lines changed from the built-in wording/)).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'fr' } });
    expect(useTextUi.getState().editLocale).toBe('fr');
    expect(screen.getByText(new RegExp(`lines set in ${nativeName('fr')} — the rest show the built-in ${nativeName('fr')}$`))).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'de' } });
    expect(screen.getByText(new RegExp(`lines set in ${nativeName('de')} — the rest show the built-in English$`))).toBeInTheDocument();
  });

  it('plural inputs use the editing language\'s forms', () => {
    const plural = pluralKey();
    load({ locale: 'en', formatLocale: '', offered: ['pl'] });
    render(<TextRow row={rowFor(plural)!} />);
    const label = rowFor(plural)!.label;
    expect(screen.queryByRole('textbox', { name: `${label} — few` })).toBeNull();
    act(() => { useTextUi.getState().setEditLocale('pl'); });
    expect(screen.getByRole('textbox', { name: `${label} — few` })).toBeInTheDocument();
  });
});

describe('built-in wording per language', () => {
  beforeEach(reset);
  afterEach(cleanup);
  const key = plainKey();

  it('builtInFor: the pack value for a pack language, the English default otherwise', () => {
    const row = rowFor(key)!;
    expect(builtInFor(row, 'fr')).toBe(defaultOf(key));
    pack.value = { [key]: 'Texte intégré' };
    expect(builtInFor(row, 'fr')).toBe('Texte intégré');
    expect(builtInFor(row, 'fr-CA')).toBe('Texte intégré');
    expect(builtInFor(row, 'en')).toBe(defaultOf(key));
    expect(builtInFor(row, 'de')).toBe(defaultOf(key));
    expect(rowFor(key)!.def).toBe(defaultOf(key));   // the cached row itself is untouched
  });

  it('a row shows "Built-in:" and the placeholder for the editing language', () => {
    pack.value = { [key]: 'Texte intégré' };
    load({ locale: 'en', formatLocale: '', offered: ['fr'] });
    render(<TextRow row={rowFor(key)!} />);
    expect(screen.getByText(`Built-in: ${String(defaultOf(key))}`)).toBeInTheDocument();
    act(() => { useTextUi.getState().setEditLocale('fr'); });
    expect(screen.getByText('Built-in: Texte intégré')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: rowFor(key)!.label })).toHaveAttribute('placeholder', 'Texte intégré');
  });

  it('a pack that arrives later re-renders the canvas text and the row', () => {
    load({ locale: 'en', formatLocale: '', offered: ['fr'] });
    useTextUi.getState().setEditLocale('fr');
    const hook = renderHook(() => useEditorText());
    const before = hook.result.current;
    render(<TextRow row={rowFor(key)!} />);
    expect(screen.getByText(`Built-in: ${String(defaultOf(key))}`)).toBeInTheDocument();
    pack.value = { [key]: 'Texte intégré' };
    act(() => { notifyPacksLoaded(); });
    expect(hook.result.current).not.toBe(before);
    expect(screen.getByText('Built-in: Texte intégré')).toBeInTheDocument();
  });
});

describe('Shopper languages checklist', () => {
  beforeEach(reset);
  afterEach(cleanup);
  const box = (name: string) => within(screen.getByRole('group', { name: 'Shopper languages' })).getByRole('checkbox', { name: new RegExp(nativeName(name)) });

  it('lists every language but the default; pack languages say "Built-in translation"', () => {
    load({ locale: 'en', formatLocale: '' });
    render(<TextPanel />);
    const group = screen.getByRole('group', { name: 'Shopper languages' });
    expect(within(group).queryByRole('checkbox', { name: new RegExp(`^\\s*${nativeName('en')}$`) })).toBeNull();
    expect(box('fr').closest('li')).toHaveTextContent('Built-in translation');
    expect(box('de').closest('li')).not.toHaveTextContent('Built-in translation');
  });

  it('ticking offers a language, un-ticking removes it', () => {
    load();
    render(<TextPanel />);
    fireEvent.click(box('fr'));
    expect(S().siteText!.language.offered).toEqual(['fr']);
    fireEvent.click(box('it'));
    expect(S().siteText!.language.offered).toEqual(['fr', 'it']);
    fireEvent.click(box('fr'));
    expect(S().siteText!.language.offered).toEqual(['it']);
  });

  it('is disabled when shared text is not editable', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false });
    S().setPublishedText({ language: { locale: 'en', formatLocale: '', offered: ['fr'] }, shared: {} });
    render(<TextPanel />);
    expect(screen.getByRole('group', { name: 'Shopper languages' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Editing language' }).querySelectorAll('option')).toHaveLength(2);
  });
});

describe('seeding from the public read', () => {
  it('offered = languages.slice(1)', () => {
    expect(publishedLanguage({ locale: 'en', formatLocale: '', languages: ['en', 'fr', 'it'] })).toEqual({ locale: 'en', formatLocale: '', offered: ['fr', 'it'] });
    expect(publishedLanguage({ locale: 'en', formatLocale: '', languages: ['en'] })).toEqual({ locale: 'en', formatLocale: '' });
    expect(publishedLanguage({ locale: 'en', formatLocale: '' })).toEqual({ locale: 'en', formatLocale: '' });
  });
});
