import { create } from 'zustand';
import type { PreviewAs } from '@/builder/mode.ts';
import { isDocKey, type ViewportWidth } from '@/builder/editor/protocol.ts';
import { docFor, docsFromPageSet, isCustomKey, isShownIn, newCustomPage, normalizeDoc, withDoc, withoutDoc, type DocMap } from '@/builder/editor/page-set.ts';
import type { DocKey, LayoutKind, PageSet, PuckDoc } from '@/builder/types.ts';
import type { EditorText, LocaleStrings, PageText, SiteText, TextLanguage } from '@/text/types.ts';
import { DEFAULT_LANGUAGE, emptyPageText, emptySiteText, withValue, type DraftValue, type TextIssue, type TextScope } from '@/builder/editor/text/model.ts';
import { rowFor } from '@/builder/editor/text/catalog.ts';
import { isStoreLocale } from '@/builder/editor/text/languages.ts';
import { textIssues } from '@/builder/editor/text/issues.ts';
import { COALESCE_MS, TEXT_HISTORY_MAX, type PuckHistoryView, type TextHistoryEntry } from '@/builder/editor/text/history.ts';

export const DEFAULT_PREVIEW_AS: PreviewAs = { session: 'signed-in-orders', cart: 'items' };

/** One text undo/redo snapshot: both drafts as they were. */
export interface TextSnap { siteText: SiteText | null; pageText: PageText }
/** The published shared layer and language, for a load without siteText (read-only shared text). */
export interface PublishedShared { language: TextLanguage; shared: LocaleStrings }

/**
 * Editor state. Load identity (spec A6) is the bridge's job, not the store's: the bridge adopts
 * each load's loadId and drops any pending debounced change before calling its onLoad handler,
 * which calls `load()` here; session.ts (Task 10) then posts exactly one change built from the
 * freshly loaded `docs` (none when read-only).
 */
export interface EditorState {
  status: 'waiting' | 'ready';
  layout: LayoutKind;
  readOnly: boolean;
  /** The sparse set being edited: always `shell`, plus every touched page. */
  docs: DocMap;
  docKey: DocKey;
  /** Bumped whenever the canvas must remount from the store (load, reset, new page). */
  epoch: number;
  previewAs: PreviewAs;
  /** The frame width the admin should give us; null = fill. Survives reloads of the set. */
  viewport: ViewportWidth | null;
  /** The shared Site text draft (spec §7.4); null when the load carried no siteText (not editable). */
  siteText: SiteText | null;
  /** The load carried `siteText` (object or null): shared text can be edited and is posted. */
  sharedEditable: boolean;
  /** This layout's overrides (PageSet.text), including values not yet postable (they raise issues). */
  pageText: PageText;
  /** Without siteText: the published shared layer and language, read-only (text/hooks.ts fills it). */
  published: PublishedShared | null;
  /**
   * Text undo stack, oldest first, at most TEXT_HISTORY_MAX. Each entry is anchored to Puck's
   * history entry current when it was made (text/history.ts decides the unified order).
   */
  textPast: TextHistoryEntry<TextSnap>[];
  /** Text redo stack (top = last). Cleared by any new text edit and by any block edit. */
  textFuture: TextHistoryEntry<TextSnap>[];
  /**
   * Bumped by every `load()` only (unlike `epoch`, not by a page reset or new page). Text callers
   * capture it when an edit starts and pass it back, so a commit landing after a load (a blur
   * during a layout switch) cannot write into the new load's text.
   */
  loadEpoch: number;
  /** `siteText` absent = shared text not editable; null = none stored yet (starts empty). */
  load(input: { layout: LayoutKind; pageSet: PageSet | null; readOnly: boolean; siteText?: SiteText | null }): void;
  /**
   * One key at one scope in the active locale; null or '' resets. `anchor` = Puck's current history
   * id. Keystrokes into the same key and anchor within COALESCE_MS of the previous one are one undo
   * step. Refused (false) when read-only, not loaded, `loadEpoch` is given and not the current one,
   * shared without siteText, or an unknown key is given a value (resetting an unknown key is
   * allowed: it cleans up leftovers).
   */
  setText(scope: TextScope, key: string, value: DraftValue | null, anchor: string | null, loadEpoch?: number): boolean;
  /** Language or number format of the shared doc; a new language resets the format to built-in. */
  setLanguage(patch: Partial<TextLanguage>, anchor: string | null, loadEpoch?: number): boolean;
  undoText(): boolean;
  redoText(): boolean;
  discardTextFuture(): void;
  /** Ignored when `loadEpoch` is given and not the current one (a fetch started under an earlier load). */
  setPublishedText(p: PublishedShared, loadEpoch?: number): void;
  selectDoc(docKey: DocKey): void;
  /**
   * Puck's onChange for the selected doc. Ignored unless `docKey` is the selected page, and ignored
   * when `epoch` is given and is not the current one (a late onChange from a canvas mounted before a
   * load/reset/new page). It never creates a custom page — only `createPage` does.
   */
  updateDoc(docKey: DocKey, raw: unknown, epoch?: number): void;
  resetDoc(docKey: DocKey): void;
  /**
   * Edits a doc that is NOT on the canvas (Puck owns the open doc's state; see late-upload.ts for
   * that case). Refused — returns false — when read-only, when `epoch` is no longer current (a
   * load, reset or new page replaced the set), when the doc is the open one, or when `patch`
   * returns null (say, the block is gone).
   */
  patchOffCanvas(docKey: DocKey, epoch: number, patch: (doc: PuckDoc) => PuckDoc | null): boolean;
  createPage(slug: string, title: string): string | null;
  setPreviewAs(patch: Partial<PreviewAs>): void;
  setViewport(width: ViewportWidth | null): void;
}

/** The text part of a fresh store (also what tests reset to). */
export const TEXT_INITIAL = {
  siteText: null, sharedEditable: false, pageText: emptyPageText(), published: null, textPast: [], textFuture: [], loadEpoch: 0,
} satisfies Partial<EditorState>;

type TextState = Pick<EditorState, 'sharedEditable' | 'siteText' | 'published'>;

export function textLanguage(s: TextState): TextLanguage {
  if (s.sharedEditable && s.siteText) return s.siteText.language;
  return s.published?.language ?? DEFAULT_LANGUAGE;
}

/** Text can be edited once we know the language: from siteText, or from the published read. */
export const isTextReady = (s: TextState): boolean => s.sharedEditable || s.published !== null;

const EMPTY_STRINGS: LocaleStrings = Object.freeze({}) as LocaleStrings;

let issueMemo: { inputs: unknown[]; issues: TextIssue[] } | null = null;
/** Every blocking text issue (spec §7.1) — the header and the posted change use this one list. */
export function textIssuesOf(s: Pick<EditorState, 'sharedEditable' | 'siteText' | 'published' | 'pageText'>): TextIssue[] {
  const { locale } = textLanguage(s);
  const inputs = [s.sharedEditable, s.siteText, s.pageText, locale];
  if (issueMemo && inputs.every((v, i) => v === issueMemo!.inputs[i])) return issueMemo.issues;
  const issues = textIssues({
    shared: s.sharedEditable && s.siteText ? s.siteText.strings[locale] ?? EMPTY_STRINGS : null,
    layout: s.pageText.strings[locale] ?? EMPTY_STRINGS,
  });
  issueMemo = { inputs, issues };
  return issues;
}

let textMemo: { inputs: unknown[]; text: EditorText } | null = null;
/**
 * What the canvas resolves text from (PageSetOverrideProvider `text`, spec §7.2). Identity-stable:
 * the same object until the language or one of the two active-locale layers changes, so the
 * provider does not re-render every text consumer on unrelated store updates.
 */
export function editorTextOf(s: Pick<EditorState, 'sharedEditable' | 'siteText' | 'published' | 'pageText'>): EditorText {
  const { locale, formatLocale } = textLanguage(s);
  const shared = (s.sharedEditable ? s.siteText?.strings[locale] : s.published?.shared) ?? EMPTY_STRINGS;
  const layout = s.pageText.strings[locale] ?? EMPTY_STRINGS;
  const inputs = [locale, formatLocale, shared, layout];
  if (textMemo && inputs.every((v, i) => v === textMemo!.inputs[i])) return textMemo.text;
  const text: EditorText = { locale, formatLocale, shared, layout };
  textMemo = { inputs, text };
  return text;
}

/** Consecutive keystrokes into one field are one undo step. */
let lastTextEdit: { target: string; at: number; anchor: string | null } | null = null;

const pushCapped = <T>(stack: T[], entry: T): T[] => [...stack, entry].slice(-TEXT_HISTORY_MAX);

export const useEditorStore = create<EditorState>()((set, get) => ({
  status: 'waiting',
  layout: 'storefront',
  readOnly: false,
  docs: {},
  docKey: 'catalog',
  epoch: 0,
  previewAs: DEFAULT_PREVIEW_AS,
  viewport: null,
  ...TEXT_INITIAL,

  load({ layout, pageSet, readOnly, siteText }) {
    const docs = docsFromPageSet(pageSet, layout);
    const current = get().docKey;
    const keep = !(isCustomKey(current) && !docs[current]) && isShownIn(current, layout);
    lastTextEdit = null;
    const editable = siteText !== undefined;
    set((s) => ({
      status: 'ready', layout, readOnly, docs, docKey: keep ? current : 'catalog', epoch: s.epoch + 1,
      siteText: editable ? siteText ?? emptySiteText() : null,
      sharedEditable: editable,
      pageText: pageSet?.text ? { strings: pageSet.text.strings } : emptyPageText(),
      published: null,
      textPast: [],
      textFuture: [],
      loadEpoch: s.loadEpoch + 1,
    }));
  },

  selectDoc(docKey) {
    if (typeof docKey !== 'string' || !isDocKey(docKey)) return;
    const s = get();
    if (isCustomKey(docKey) && !s.docs[docKey]) return;
    if (!isShownIn(docKey, s.layout)) return;
    if (docKey !== s.docKey) set({ docKey });
  },

  updateDoc(docKey, raw, epoch) {
    const s = get();
    if (s.readOnly || s.status !== 'ready') return;
    if (docKey !== s.docKey || (epoch !== undefined && epoch !== s.epoch)) return;
    if (!isShownIn(docKey, s.layout)) return;
    if (isCustomKey(docKey) && !s.docs[docKey]) return;
    const docs = withDoc(s.docs, docKey, normalizeDoc(raw, docKey), s.layout);
    if (docs === s.docs) return;
    set({ docs });
    blockEdited(true);
  },

  resetDoc(docKey) {
    const s = get();
    if (s.readOnly || s.status !== 'ready') return;
    set({
      docs: withoutDoc(s.docs, docKey, s.layout),
      docKey: isCustomKey(docKey) && docKey === s.docKey ? 'catalog' : s.docKey,
      epoch: s.epoch + 1,
    });
    blockEdited(false);
  },

  patchOffCanvas(docKey, epoch, patch) {
    const s = get();
    if (s.readOnly || s.status !== 'ready' || epoch !== s.epoch || docKey === s.docKey) return false;
    if (!isShownIn(docKey, s.layout) || (isCustomKey(docKey) && !s.docs[docKey])) return false;
    const next = patch(docFor(s.docs, docKey, s.layout));
    if (!next) return false;
    const docs = withDoc(s.docs, docKey, normalizeDoc(next, docKey), s.layout);
    if (docs !== s.docs) {
      set({ docs });
      blockEdited(false);
    }
    return true;
  },

  createPage(slug, title) {
    const s = get();
    if (s.readOnly) return 'This version is read-only.';
    if (s.status !== 'ready') return 'The editor is still loading.';
    const result = newCustomPage(s.docs, slug, title);
    if ('error' in result) return result.error;
    set({ docs: result.docs, docKey: result.docKey, epoch: s.epoch + 1 });
    blockEdited(false);
    return null;
  },

  setPreviewAs(patch) {
    set((s) => ({ previewAs: { ...s.previewAs, ...patch } }));
  },

  setViewport(viewport) {
    if (viewport !== get().viewport) set({ viewport });
  },

  setText(scope, key, value, anchor, loadEpoch) {
    const s = get();
    if (s.readOnly || s.status !== 'ready' || (loadEpoch !== undefined && loadEpoch !== s.loadEpoch)) return false;
    if (scope === 'shared' && (!s.sharedEditable || !s.siteText)) return false;
    if (value !== null && value !== '' && !rowFor(key)) return false;
    const { locale } = textLanguage(s);
    let patch: Partial<EditorState>;
    if (scope === 'shared') {
      const strings = withValue(s.siteText!.strings, locale, key, value);
      if (strings === s.siteText!.strings) return true;
      patch = { siteText: { ...s.siteText!, strings } };
    } else {
      const strings = withValue(s.pageText.strings, locale, key, value);
      if (strings === s.pageText.strings) return true;
      patch = { pageText: { strings } };
    }
    const target = `${scope}:${key}`;
    const now = Date.now();
    const coalesce = lastTextEdit !== null && lastTextEdit.target === target && lastTextEdit.anchor === anchor
      && now - lastTextEdit.at < COALESCE_MS && s.textPast.length > 0;
    lastTextEdit = { target, at: now, anchor };
    const textPast = coalesce ? s.textPast : pushCapped(s.textPast, { snap: { siteText: s.siteText, pageText: s.pageText }, anchor });
    set({ ...patch, textPast, textFuture: [] });
    return true;
  },

  setLanguage(patch, anchor, loadEpoch) {
    const s = get();
    if (s.readOnly || s.status !== 'ready' || (loadEpoch !== undefined && loadEpoch !== s.loadEpoch)) return false;
    if (!s.sharedEditable || !s.siteText) return false;
    const cur = s.siteText.language;
    const locale = patch.locale ?? cur.locale;
    const formatLocale = patch.formatLocale !== undefined ? patch.formatLocale : locale !== cur.locale ? '' : cur.formatLocale;
    if (!isStoreLocale(locale) || (formatLocale !== '' && !isStoreLocale(formatLocale))) return false;
    if (locale === cur.locale && formatLocale === cur.formatLocale) return true;
    lastTextEdit = null;
    set({
      siteText: { ...s.siteText, language: { locale, formatLocale } },
      textPast: pushCapped(s.textPast, { snap: { siteText: s.siteText, pageText: s.pageText }, anchor }),
      textFuture: [],
    });
    return true;
  },

  undoText() {
    const s = get();
    const top = s.textPast.at(-1);
    if (!top || s.readOnly) return false;
    lastTextEdit = null;
    set({
      siteText: top.snap.siteText, pageText: top.snap.pageText,
      textPast: s.textPast.slice(0, -1),
      textFuture: pushCapped(s.textFuture, { snap: { siteText: s.siteText, pageText: s.pageText }, anchor: top.anchor }),
    });
    return true;
  },

  redoText() {
    const s = get();
    const top = s.textFuture.at(-1);
    if (!top || s.readOnly) return false;
    lastTextEdit = null;
    set({
      siteText: top.snap.siteText, pageText: top.snap.pageText,
      textFuture: s.textFuture.slice(0, -1),
      textPast: pushCapped(s.textPast, { snap: { siteText: s.siteText, pageText: s.pageText }, anchor: top.anchor }),
    });
    return true;
  },

  discardTextFuture() {
    if (get().textFuture.length > 0) set({ textFuture: [] });
  },

  setPublishedText(published, loadEpoch) {
    if (loadEpoch !== undefined && loadEpoch !== get().loadEpoch) return;
    set({ published });
  },
}));

let historySource: (() => PuckHistoryView | null) | null = null;
/**
 * The live canvas (EditorHeader, Task 10) registers how to read Puck's history. It MUST read Puck's
 * app store live at call time (`getPuck().history` / `appStore.getState().history`), never a value
 * captured at render: the store reads it inside Puck's onChange and again a microtask later.
 */
export function setPuckHistorySource(fn: (() => PuckHistoryView | null) | null): void {
  historySource = fn;
}

/**
 * A block edit ends the typing run and invalidates the text redo stack (a redo anchored to a Puck
 * entry the edit branched away from would otherwise read as "another mount" and replay).
 *
 * `deferred` is for Puck's onChange, which also fires for Puck's own undo/redo. Those only move
 * Puck's index to an entry that already exists; a new edit records a freshly minted id (after a
 * debounce in current Puck, but possibly synchronously in another version). So the history is
 * read at change time and again once the current task ends, and the stack is kept only when the
 * position moved to an entry that was already in the history at change time — same position,
 * same id (Puck's first entry of a mount has no id: compared by position, null matches null, so
 * undoing the first block edit keeps the redo). Anything else — no source registered, the position
 * unchanged (record still pending), a position past the old end, or a new id at an old position
 * (a truncating record) — clears it. Losing a text redo is the safe failure; replaying a
 * branched-away one is not.
 */
function blockEdited(deferred: boolean): void {
  lastTextEdit = null;
  if (useEditorStore.getState().textFuture.length === 0) return;
  const before = deferred ? historySource?.() ?? null : null;
  if (!before) {
    useEditorStore.setState({ textFuture: [] });
    return;
  }
  queueMicrotask(() => {
    const after = historySource?.() ?? null;
    const stepped = after !== null && after.index !== before.index
      && after.index >= 0 && after.index < before.anchors.length
      && after.anchor === before.anchors[after.index];
    if (!stepped) useEditorStore.getState().discardTextFuture();
  });
}
