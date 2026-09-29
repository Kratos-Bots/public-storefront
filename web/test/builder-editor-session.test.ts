import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

vi.mock('@/app/builder-gate.ts', async (orig) => ({ ...(await orig<typeof import('@/app/builder-gate.ts')>()), isBuilderMode: () => true }));

import { startBuilderSession } from '@/builder/editor/session.ts';
import { DEFAULT_PREVIEW_AS, useEditorStore } from '@/builder/editor/store.ts';
import { builderOverrides } from '@/app/builder-gate.ts';
import { CHANGE_DEBOUNCE_MS, getActiveBridge } from '@/builder/editor/bridge.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { useSessionStore } from '@/stores/session.ts';
import type { PageSet, PuckDoc } from '@/builder/types.ts';
import { THEME } from './helpers/builder-theme.ts';

const ADMIN = 'https://admin.shop.example';

function fakeWindow() {
  const listeners: Array<(e: MessageEvent) => void> = [];
  const parent = { postMessage: vi.fn() };
  const win = {
    parent,
    addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.splice(listeners.indexOf(fn), 1),
  } as unknown as Window;
  const send = (data: unknown) => [...listeners].forEach((fn) => fn({ data, source: parent, origin: ADMIN } as unknown as MessageEvent));
  const changes = () => parent.postMessage.mock.calls.filter(([m]) => m.type === 'sf-builder-change');
  return { win, parent, send, changes, listeners };
}
let loadSeq = 0;
const load = (extra: Record<string, unknown> = {}) => ({
  type: 'sf-builder-load', protocol: 1, loadId: `load-${++loadSeq}`, layout: 'menu', pageSet: null, theme: THEME, readOnly: false, ...extra,
});
const page = (title: string, content: PuckDoc['content'] = []): PuckDoc => ({ root: { props: { title, description: '', chrome: 'shell' } }, content });

describe('builder session', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null });
    builderOverrides.setState({ theme: null, layout: null });
  });
  afterEach(() => vi.useRealTimers());

  it('reports the viewport after every load and whenever the toggle changes', () => {
    const { win, parent, send } = fakeWindow();
    const viewports = () => parent.postMessage.mock.calls.filter(([m]) => m.type === 'sf-builder-viewport').map(([m, o]) => [m.width, o]);
    const stop = startBuilderSession(win, new QueryClient());
    useEditorStore.getState().setViewport(768);
    expect(viewports()).toEqual([]);
    send(load());
    expect(viewports()).toEqual([[768, ADMIN]]);
    useEditorStore.getState().setViewport(360);
    useEditorStore.getState().setViewport(360);
    useEditorStore.getState().setViewport(null);
    expect(viewports()).toEqual([[768, ADMIN], [360, ADMIN], [null, ADMIN]]);
    send(load({ readOnly: true }));
    expect(viewports().at(-1)).toEqual([null, ADMIN]);
    stop();
  });

  it('announces ready once, then answers a null load at once with the default shell and no issues', () => {
    const { win, parent, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'sf-builder-ready', protocol: 1 }, '*');
    send(load({ loadId: 'first' }));
    expect(changes()).toHaveLength(1);
    const [msg, origin] = changes()[0]!;
    expect(origin).toBe(ADMIN);
    expect(msg.loadId).toBe('first');
    expect(msg.pageSet.pages).toEqual({});
    expect(msg.pageSet.shell.content).toEqual(defaultDoc('shell', 'menu')!.content);
    expect(msg.issues).toEqual([]);
    expect(builderOverrides.getState()).toMatchObject({ layout: 'menu', theme: { customCss: '' } });
    expect(getActiveBridge()).not.toBeNull();
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS * 2);
    expect(changes()).toHaveLength(1);
    expect(parent.postMessage.mock.calls.filter(([m]) => m.type === 'sf-builder-ready')).toHaveLength(1);
    stop();
    expect(getActiveBridge()).toBeNull();
  });

  it('posts exactly one baseline per load, from the sparse set, even when the docs come back identical', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    const set: PageSet = { schemaVersion: 1, shell: defaultDoc('shell', 'menu')!, pages: { 'page:about': page('About') } };
    send(load({ loadId: 'a', pageSet: set }));
    send(load({ loadId: 'b', pageSet: set }));
    expect(changes().map(([m]) => m.loadId)).toEqual(['a', 'b']);
    expect(Object.keys(changes()[1]![0].pageSet.pages)).toEqual(['page:about']);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS * 2);
    expect(changes()).toHaveLength(2);
    stop();
  });

  it('never stamps an edit made under one load with the next', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load({ loadId: 'a' }));
    useEditorStore.getState().createPage('about', 'About');
    const staleEpoch = useEditorStore.getState().epoch;
    send(load({ loadId: 'b' }));
    // A late onChange from the canvas mounted under load A.
    useEditorStore.getState().updateDoc('page:about', page('Late'), staleEpoch);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS * 2);
    expect(changes().map(([m]) => m.loadId)).toEqual(['a', 'b']);
    expect(changes()[1]![0].pageSet.pages).toEqual({});
    stop();
  });

  it('posts a debounced change after an edit', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load());
    useEditorStore.getState().createPage('about', 'About');
    expect(changes()).toHaveLength(1);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    expect(changes()).toHaveLength(2);
    expect(Object.keys(changes()[1]![0].pageSet.pages)).toEqual(['page:about']);
    stop();
  });

  it("emits FeaturedProducts without rows the admin hasn't picked yet", () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load());
    useEditorStore.getState().createPage('picks', 'Picks');
    const { epoch } = useEditorStore.getState();
    const fp = { type: 'FeaturedProducts', props: { id: 'fp', title: 'Picks', source: 'picked', items: [{ productId: 3 }, {}], categoryId: null, limit: 4 } };
    useEditorStore.getState().updateDoc('page:picks', page('Picks', [fp]), epoch);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    const posted = changes().length;
    const last = changes().at(-1)![0];
    expect(last.pageSet.pages['page:picks'].content[0].props.items).toEqual([{ productId: 3 }]);
    expect(last.issues).toEqual([]);
    // The editor keeps the row so it can still be picked.
    expect((useEditorStore.getState().docs['page:picks']!.content[0]!.props.items as unknown[])).toHaveLength(2);
    // Another unpicked row changes nothing the admin sees: no change goes out.
    const more = { ...fp, props: { ...fp.props, items: [...fp.props.items, {}] } };
    useEditorStore.getState().updateDoc('page:picks', page('Picks', [more]), epoch);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS * 2);
    expect(changes()).toHaveLength(posted);
    stop();
  });

  it('never posts changes in read-only mode', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load({ readOnly: true }));
    useEditorStore.getState().createPage('about', 'About');
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS * 2);
    expect(changes()).toHaveLength(0);
    stop();
  });

  it('follows theme updates and page selection from the admin', () => {
    const { win, send } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load());
    send({ type: 'sf-builder-theme', theme: { ...THEME, colors: { ...THEME.colors, bg: '#123456' } } });
    expect(builderOverrides.getState().theme?.colors.bg).toBe('#123456');
    send({ type: 'sf-builder-select-page', docKey: 'checkout' });
    expect(useEditorStore.getState().docKey).toBe('checkout');
    stop();
  });

  it('applies "Preview as" through fixture mode', () => {
    const { win } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    expect(useSessionStore.getState().token).not.toBeNull();
    useEditorStore.getState().setPreviewAs({ session: 'signed-out' });
    expect(useSessionStore.getState().token).toBeNull();
    stop();
  });

  it('warns in development about parent messages it cannot read, and removes every listener on stop', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { win, send, listeners } = fakeWindow();
      const stop = startBuilderSession(win, new QueryClient());
      send({ type: 'sf-builder-load', protocol: 2 });
      expect(warn).toHaveBeenCalledWith('[builder] ignored an unreadable message from the admin', expect.anything());
      warn.mockClear();
      send(load());
      expect(warn).not.toHaveBeenCalled();
      stop();
      expect(listeners).toHaveLength(0);
    } finally {
      warn.mockRestore();
    }
  });
});
