import type { QueryClient } from '@tanstack/react-query';
import { setApiInterceptor } from '@/api/client.ts';
import { builderOverrides } from '@/app/builder-gate.ts';
import type { DocKey, LayoutKind } from '@/builder/types.ts';
import { createBridge, setActiveBridge, type Bridge } from '@/builder/editor/bridge.ts';
import { createFixtureInterceptor } from '@/builder/editor/fixture-api.ts';
import { applyPreviewAs, enterFixtureMode } from '@/builder/editor/fixture-mode.ts';
import { configureCatalogSource } from '@/builder/editor/custom-fields/pickers.ts';
import { collectIssues, toPageSet, type DocMap } from '@/builder/editor/page-set.ts';
import { parseInbound } from '@/builder/editor/protocol.ts';
import { prepareDoc } from '@/builder/editor/config.ts';
import { useEditorStore } from '@/builder/editor/store.ts';

/** What the admin receives: the sparse set with editor-only leftovers (unpicked rows) removed, and its issues. */
function postDocs(bridge: Bridge, docs: DocMap, layout: LayoutKind): void {
  const emitted: DocMap = {};
  for (const [key, doc] of Object.entries(docs)) if (doc) emitted[key as DocKey] = prepareDoc(doc);
  bridge.postChange(toPageSet(emitted, layout), collectIssues(emitted, layout));
}

/**
 * Everything the editor needs outside React: fixture mode, the api interceptor, the parent bridge
 * and the store → admin change feed. Returns a cleanup.
 *
 * Call it once per frame boot, as early as possible (before anything can fire a query) — not from
 * a StrictMode-doubled effect: each call creates a bridge, and each bridge announces
 * `sf-builder-ready`.
 *
 * Load identity: the bridge adopts each load's loadId and drops any pending change first; the
 * store's `load` bumps `epoch`, so a canvas keyed on `epoch` remounts and a late onChange from the
 * old canvas (passed with its mount epoch to `updateDoc`) is ignored. Right after each accepted
 * load exactly one change goes out, built from the loaded docs (none when read-only), followed by
 * the current viewport.
 */
export function startBuilderSession(win: Window, client: QueryClient): () => void {
  // Fixture mode and the interceptor come first: from here on no request reaches the live shop
  // with shopper state, and no store writes to the frame's real storage.
  enterFixtureMode();
  const offApi = setApiInterceptor(createFixtureInterceptor(() => useEditorStore.getState().previewAs));
  configureCatalogSource(client);

  // The store's load() replaces `docs`; the change it triggers is the baseline, posted explicitly below.
  let loading = false;
  const bridge = createBridge(win, {
    onLoad(msg) {
      builderOverrides.setState({ theme: msg.theme, layout: msg.layout });
      loading = true;
      try {
        useEditorStore.getState().load({ layout: msg.layout, pageSet: msg.pageSet, readOnly: msg.readOnly });
      } finally {
        loading = false;
      }
      if (!msg.readOnly) {
        const s = useEditorStore.getState();
        postDocs(bridge, s.docs, s.layout);
        bridge.flushChange();
      }
      // The admin (re)builds its frame on load; tell it which width we are showing.
      bridge.postViewport(useEditorStore.getState().viewport);
    },
    onTheme(theme) {
      builderOverrides.setState({ theme });
    },
    onSelectPage(docKey) {
      useEditorStore.getState().selectDoc(docKey);
    },
  });
  setActiveBridge(bridge);
  applyPreviewAs(useEditorStore.getState().previewAs, client);

  const offStore = useEditorStore.subscribe((s, prev) => {
    if (s.previewAs !== prev.previewAs) applyPreviewAs(s.previewAs, client);
    // Media queries only follow a real frame width, so the admin resizes the iframe itself.
    if (s.viewport !== prev.viewport) bridge.postViewport(s.viewport);
    if (loading || s.docs === prev.docs || s.readOnly || s.status !== 'ready') return;
    postDocs(bridge, s.docs, s.layout);
  });

  // The bridge drops anything it can't parse without a word; in development, say so.
  let offWarn = () => {};
  if (import.meta.env.DEV) {
    const warnUnreadable = (event: MessageEvent) => {
      if (event.source !== win.parent || parseInbound(event.data) !== null) return;
      console.warn('[builder] ignored an unreadable message from the admin', event.data);
    };
    win.addEventListener('message', warnUnreadable);
    offWarn = () => win.removeEventListener('message', warnUnreadable);
  }

  return () => {
    offWarn();
    offStore();
    offApi();
    setActiveBridge(null);
    configureCatalogSource(null);
    bridge.dispose();
  };
}
