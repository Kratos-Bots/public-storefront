// web/test/builder-editor-store-text.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREVIEW_AS, TEXT_INITIAL, editorTextOf, isTextReady, setPuckHistorySource, textIssuesOf, textLanguage, useEditorStore } from '@/builder/editor/store.ts';
import { COALESCE_MS, TEXT_HISTORY_MAX, type PuckHistoryView } from '@/builder/editor/text/history.ts';
import { plainKey, pluralKey } from './helpers/text-keys.ts';

const reset = () => useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null, ...TEXT_INITIAL });
const S = () => useEditorStore.getState();
const SITE = { schemaVersion: 1 as const, language: { locale: 'en', formatLocale: '' }, strings: { en: { 'zz.kept.unknown': 'kept' } } };

describe('editor store: text', () => {
  beforeEach(() => { reset(); vi.useRealTimers(); });
  const key = plainKey();

  it('load: siteText absent → not editable; null → an empty doc; a doc → itself; pageSet.text → pageText', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false });
    expect(S().sharedEditable).toBe(false);
    expect(S().siteText).toBeNull();
    expect(isTextReady(S())).toBe(false);
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    expect(S().sharedEditable).toBe(true);
    expect(S().siteText).toEqual({ schemaVersion: 1, language: { locale: 'en', formatLocale: '' }, strings: {} });
    expect(isTextReady(S())).toBe(true);
    const shell = { root: { props: { title: '', description: '', chrome: 'shell' as const } }, content: [] };
    S().load({ layout: 'menu', pageSet: { schemaVersion: 1, shell, pages: {}, text: { strings: { en: { [key]: 'Menu words' } } } }, readOnly: false, siteText: SITE });
    expect(S().siteText).toEqual(SITE);
    expect(S().pageText).toEqual({ strings: { en: { [key]: 'Menu words' } } });
    expect(S().textPast).toEqual([]);
  });

  it('setText writes the chosen scope; clearing resets; shared refused when not editable', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    expect(S().setText('shared', key, 'Shared words', null)).toBe(true);
    expect(S().siteText!.strings.en![key]).toBe('Shared words');
    expect(S().setText('layout', key, 'Mine', null)).toBe(true);
    expect(S().pageText.strings.en![key]).toBe('Mine');
    S().setText('layout', key, '', null);
    expect(S().pageText.strings).toEqual({});
    S().load({ layout: 'storefront', pageSet: null, readOnly: false });
    expect(S().setText('shared', key, 'x', null)).toBe(false);
    expect(S().setText('layout', key, 'x', null)).toBe(true);
    expect(S().setText('layout', 'zz.not.a.key', 'x', null)).toBe(false);
    expect(S().setText('layout', 'zz.not.a.key', null, null)).toBe(true);   // deleting an unused key is fine
  });

  it('read-only loads refuse every text edit', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: true, siteText: null });
    expect(S().setText('shared', key, 'x', null)).toBe(false);
    expect(S().setLanguage({ locale: 'de' }, null)).toBe(false);
  });

  it('typing into one key coalesces into one undo step; another key or a pause starts a new one', () => {
    vi.useFakeTimers();
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    S().setText('shared', key, 'N', 'a');
    S().setText('shared', key, 'No', 'a');
    S().setText('shared', key, 'Nor', 'a');
    expect(S().textPast).toHaveLength(1);
    vi.advanceTimersByTime(1500);
    S().setText('shared', key, 'Nort', 'a');
    expect(S().textPast).toHaveLength(2);
    S().setText('layout', key, 'L', 'a');
    expect(S().textPast).toHaveLength(3);
    expect(S().undoText()).toBe(true);
    expect(S().pageText.strings).toEqual({});
    expect(S().undoText()).toBe(true);
    expect(S().siteText!.strings.en![key]).toBe('Nor');
    expect(S().redoText()).toBe(true);
    expect(S().siteText!.strings.en![key]).toBe('Nort');
    expect(S().textFuture).toHaveLength(1);
    S().setText('shared', key, 'New branch', 'a');
    expect(S().textFuture).toEqual([]);
  });

  it('setLanguage: validates tags, resets the format on a language change, keeps other locales', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: { ...SITE, language: { locale: 'en', formatLocale: 'en-GB' } } });
    S().setText('shared', key, 'English words', null);
    expect(S().setLanguage({ locale: 'en-gb' }, null)).toBe(false);
    expect(S().setLanguage({ locale: 'pl' }, null)).toBe(true);
    expect(textLanguage(S())).toEqual({ locale: 'pl', formatLocale: '' });
    expect(S().siteText!.strings.en![key]).toBe('English words');
    S().setText('shared', key, 'Polskie słowa', null);
    expect(S().siteText!.strings.pl![key]).toBe('Polskie słowa');
    expect(S().setLanguage({ formatLocale: 'pl-PL' }, null)).toBe(true);
    expect(textLanguage(S()).formatLocale).toBe('pl-PL');
    S().undoText();
    expect(textLanguage(S()).formatLocale).toBe('');
  });

  it('without siteText the language comes from the published read', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false });
    expect(textLanguage(S())).toEqual({ locale: 'en', formatLocale: '' });
    S().setPublishedText({ language: { locale: 'de', formatLocale: '' }, shared: { [key]: 'Geteilt' } });
    expect(isTextReady(S())).toBe(true);
    expect(textLanguage(S()).locale).toBe('de');
    S().setText('layout', key, 'Nur hier', null);
    expect(S().pageText.strings.de![key]).toBe('Nur hier');
  });

  it('textIssuesOf covers both scopes and is memoised', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    S().setText('shared', key, 'Hi {', null);
    S().setText('layout', pluralKey(), { one: '{count} x' }, null);
    const a = textIssuesOf(S());
    expect(a.map((i) => [i.scope, i.rule])).toEqual([['shared', 'bad-brace'], ['layout', 'empty']]);
    expect(textIssuesOf(S())).toBe(a);
  });
});

// Ledger CARRY lines for Task 7 (binding).
describe('editor store: text history limits and block edits', () => {
  const key = plainKey();
  beforeEach(() => { reset(); vi.useFakeTimers(); });
  afterEach(() => { setPuckHistorySource(null); vi.useRealTimers(); });

  const flush = () => Promise.resolve();
  const catalogEdit = (title: string) =>
    S().updateDoc('catalog', { root: { props: { title, description: '', chrome: 'shell' } }, content: [] }, S().epoch);
  /** One text edit undone, so the redo stack holds one entry. */
  function withTextRedo() {
    S().setText('shared', key, 'Undone', 'd0');
    S().undoText();
    expect(S().textFuture).toHaveLength(1);
  }

  it('COALESCE_MS is the coalescing window, measured from the latest keystroke', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    S().setText('shared', key, 'a', 'd0');
    vi.advanceTimersByTime(COALESCE_MS - 1);
    S().setText('shared', key, 'ab', 'd0');
    vi.advanceTimersByTime(COALESCE_MS - 1);
    S().setText('shared', key, 'abc', 'd0');
    expect(S().textPast).toHaveLength(1);
    vi.advanceTimersByTime(COALESCE_MS);
    S().setText('shared', key, 'abcd', 'd0');
    expect(S().textPast).toHaveLength(2);
  });

  it('a different Puck anchor (a block edit in between) starts a new step', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    S().setText('shared', key, 'a', 'd0');
    S().setText('shared', key, 'ab', 'd1');
    expect(S().textPast.map((e) => e.anchor)).toEqual(['d0', 'd1']);
  });

  it('TEXT_HISTORY_MAX caps the undo stack, dropping the oldest steps', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    for (let i = 0; i <= TEXT_HISTORY_MAX + 4; i++) {
      vi.advanceTimersByTime(COALESCE_MS);
      S().setText('shared', key, `v${i}`, 'd0');
    }
    expect(S().textPast).toHaveLength(TEXT_HISTORY_MAX);
    // The oldest kept step restores v4 (the first five snapshots were dropped).
    expect(S().textPast[0]!.snap.siteText!.strings.en![key]).toBe('v4');
    S().setLanguage({ locale: 'de' }, 'd0');
    expect(S().textPast).toHaveLength(TEXT_HISTORY_MAX);
  });

  it('redo cannot grow past TEXT_HISTORY_MAX either', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    for (let i = 0; i < TEXT_HISTORY_MAX; i++) {
      vi.advanceTimersByTime(COALESCE_MS);
      S().setText('shared', key, `v${i}`, 'd0');
    }
    while (S().undoText());
    expect(S().textFuture).toHaveLength(TEXT_HISTORY_MAX);
    while (S().redoText());
    expect(S().textPast).toHaveLength(TEXT_HISTORY_MAX);
    expect(S().siteText!.strings.en![key]).toBe(`v${TEXT_HISTORY_MAX - 1}`);
  });

  it('a block edit on the canvas clears the text redo stack', async () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    withTextRedo();
    catalogEdit('Edited');
    await flush();
    expect(S().textFuture).toEqual([]);
    expect(S().redoText()).toBe(false);
  });

  /** A fake Puck history read live, as Task 10's source must (appStore.getState(), not a render snapshot). */
  function fakePuck(ids: (string | null)[]) {
    const h = { ids: [...ids], index: ids.length - 1 };
    setPuckHistorySource((): PuckHistoryView => ({
      anchor: h.ids[h.index] ?? null, anchors: [...h.ids], index: h.index, hasPast: h.index > 0, hasFuture: h.index < h.ids.length - 1,
    }));
    return {
      back: () => { h.index -= 1; },
      forward: () => { h.index += 1; },
      record: (id: string | null) => { h.ids = [...h.ids.slice(0, h.index + 1), id]; h.index = h.ids.length - 1; },
    };
  }

  it('a canvas undo/redo (Puck moves to an existing entry) keeps the text redo stack', async () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    const puck = fakePuck(['d0', 'd1']);
    withTextRedo();
    // Puck's back(): onChange fires inside its dispatch, then the index moves (same task).
    catalogEdit('Before');
    puck.back();
    await flush();
    expect(S().textFuture).toHaveLength(1);
    catalogEdit('After');
    puck.forward();
    await flush();
    expect(S().textFuture).toHaveLength(1);
  });

  it('undoing the first block edit of a mount (onto Puck\'s id-less first entry) keeps the text redo', async () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    const puck = fakePuck([null, 'd1']);
    withTextRedo();
    catalogEdit('Before');
    puck.back();
    await flush();
    expect(S().textFuture).toHaveLength(1);
    catalogEdit('After');
    puck.forward();
    await flush();
    expect(S().textFuture).toHaveLength(1);
  });

  it('a new edit from Puck\'s id-less first entry still clears the text redo', async () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    const puck = fakePuck([null, 'd1']);
    catalogEdit('Back');
    puck.back();
    await flush();
    withTextRedo();
    catalogEdit('Branch');
    puck.record('d7');          // replaces d1 at the same position: a new id there, not a step
    await flush();
    expect(S().textFuture).toEqual([]);
  });

  it('a new block edit with Puck recording later (debounced) clears the text redo stack', async () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    fakePuck(['d0', 'd1']);
    withTextRedo();
    catalogEdit('Branch');
    await flush();
    expect(S().textFuture).toEqual([]);
  });

  it('a Puck that records synchronously (before or after onChange) still clears the text redo stack', async () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    const puck = fakePuck(['d0', 'd1']);
    withTextRedo();
    puck.record('d2');          // recorded before onChange: the fresh id is already current
    catalogEdit('Branch A');
    await flush();
    expect(S().textFuture).toEqual([]);

    withTextRedo();
    catalogEdit('Branch B');
    puck.record('d3');          // recorded right after onChange: an id not in the history before
    await flush();
    expect(S().textFuture).toEqual([]);
  });

  it('after an undo, a new edit that truncates Puck future clears the text redo stack', async () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    const puck = fakePuck(['d0', 'd1', 'd2']);
    catalogEdit('At d1');
    puck.back();
    await flush();
    withTextRedo();
    catalogEdit('Branch');
    puck.record('d9');          // drops d2; d9 was not in the history before the change
    await flush();
    expect(S().textFuture).toEqual([]);
  });

  it('an edit that leaves the docs unchanged keeps the text redo stack', async () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    catalogEdit('Same');
    await flush();
    withTextRedo();
    catalogEdit('Same');
    await flush();
    expect(S().textFuture).toHaveLength(1);
  });

  it('off-canvas patches, page resets and new pages clear the text redo stack at once', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    withTextRedo();
    expect(S().createPage('about', 'About')).toBeNull();
    expect(S().textFuture).toEqual([]);

    withTextRedo();
    S().resetDoc('page:about');
    expect(S().textFuture).toEqual([]);

    withTextRedo();
    expect(S().patchOffCanvas('shell', S().epoch, (d) => ({ ...d, root: { props: { ...d.root.props, title: 'Shell' } } }))).toBe(true);
    expect(S().textFuture).toEqual([]);
  });

  it('a block edit ends the typing run: the next keystroke is a new undo step', async () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    S().setText('shared', key, 'a', null);
    catalogEdit('Edited');
    await flush();
    S().setText('shared', key, 'ab', null);
    expect(S().textPast).toHaveLength(2);
  });
});

describe('editor store: editorTextOf', () => {
  const key = plainKey();
  beforeEach(reset);

  it('gives both layers for the active locale and keeps its identity until they change', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    S().setText('shared', key, 'Shared', null);
    S().setText('layout', key, 'Mine', null);
    const a = editorTextOf(S());
    expect(a).toEqual({ locale: 'en', formatLocale: '', shared: { [key]: 'Shared' }, layout: { [key]: 'Mine' } });
    expect(editorTextOf(S())).toBe(a);
    S().setPreviewAs({ cart: 'empty' });
    expect(editorTextOf(S())).toBe(a);
    S().setText('layout', key, 'Mine again', null);
    const b = editorTextOf(S());
    expect(b).not.toBe(a);
    expect(b.layout[key]).toBe('Mine again');
  });

  it('empty layers are one stable object; without siteText the shared layer is the published one', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false });
    const a = editorTextOf(S());
    expect(a).toEqual({ locale: 'en', formatLocale: '', shared: {}, layout: {} });
    S().setPublishedText({ language: { locale: 'de', formatLocale: 'de-AT' }, shared: { [key]: 'Geteilt' } });
    const b = editorTextOf(S());
    expect(b).toEqual({ locale: 'de', formatLocale: 'de-AT', shared: { [key]: 'Geteilt' }, layout: {} });
    expect(b.layout).toBe(a.layout);
  });
});

// Fix round 1: text edits and the published read are tied to the load they were made under.
describe('editor store: stale text edits across a load', () => {
  const key = plainKey();
  beforeEach(reset);

  it('setText / setLanguage with the loadEpoch of an earlier load are dropped', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    const first = S().loadEpoch;
    expect(S().setText('layout', key, 'Mine', null, first)).toBe(true);
    S().load({ layout: 'menu', pageSet: null, readOnly: false, siteText: null });
    expect(S().loadEpoch).not.toBe(first);
    expect(S().setText('layout', key, 'Late blur', null, first)).toBe(false);
    expect(S().setText('shared', key, 'Late blur', null, first)).toBe(false);
    expect(S().setLanguage({ locale: 'de' }, null, first)).toBe(false);
    expect(S().pageText.strings).toEqual({});
    expect(S().siteText!.strings).toEqual({});
    expect(textLanguage(S()).locale).toBe('en');
    expect(S().setText('layout', key, 'Now', null, S().loadEpoch)).toBe(true);
    expect(S().setLanguage({ locale: 'de' }, null, S().loadEpoch)).toBe(true);
  });

  it('a failed published read belongs to its load: an earlier load's is ignored, a new load clears it', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false });
    const first = S().loadEpoch;
    S().setPublishedFailed(first);
    expect(S().publishedFailed).toBe(true);
    S().load({ layout: 'storefront', pageSet: null, readOnly: false });
    expect(S().publishedFailed).toBe(false);
    S().setPublishedFailed(first);
    expect(S().publishedFailed).toBe(false);
  });

  it('page resets and new pages do not invalidate a text edit (only a load does)', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    const at = S().loadEpoch;
    expect(S().createPage('about', 'About')).toBeNull();
    S().resetDoc('page:about');
    expect(S().setText('layout', key, 'Still mine', null, at)).toBe(true);
  });

  it('setPublishedText from an earlier load is ignored', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false });
    const first = S().loadEpoch;
    S().load({ layout: 'menu', pageSet: null, readOnly: false });
    S().setPublishedText({ language: { locale: 'de', formatLocale: '' }, shared: {} }, first);
    expect(S().published).toBeNull();
    S().setPublishedText({ language: { locale: 'de', formatLocale: '' }, shared: {} }, S().loadEpoch);
    expect(textLanguage(S()).locale).toBe('de');
  });
});
