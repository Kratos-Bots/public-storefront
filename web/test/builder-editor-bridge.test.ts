import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANGE_DEBOUNCE_MS, createBridge, getActiveBridge, setActiveBridge, UPLOAD_TIMEOUT_MS } from '@/builder/editor/bridge.ts';
import type { PageSet } from '@/builder/types.ts';
import { THEME } from './helpers/builder-theme.ts';

const ADMIN = 'https://admin.shop.example';
const PAGE_SET: PageSet = { schemaVersion: 1, shell: { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [] }, pages: {} };
const LOAD = { type: 'sf-builder-load', protocol: 1, loadId: 'load-1', layout: 'storefront', pageSet: null, theme: THEME, readOnly: false };

function fakeWindow() {
  const listeners: Array<(e: MessageEvent) => void> = [];
  const parent = { postMessage: vi.fn() };
  const win = {
    parent,
    addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.splice(listeners.indexOf(fn), 1),
  } as unknown as Window;
  const send = (data: unknown, opts: { source?: unknown; origin?: string } = {}) =>
    [...listeners].forEach((fn) => fn({ data, source: opts.source ?? parent, origin: opts.origin ?? ADMIN } as unknown as MessageEvent));
  return { win, parent, send, listeners };
}

function handlers() {
  return { onLoad: vi.fn(), onTheme: vi.fn(), onSelectPage: vi.fn() };
}

describe('builder bridge', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("announces readiness to '*' once and nothing else before a load", () => {
    const { win, parent } = fakeWindow();
    const bridge = createBridge(win, handlers());
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'sf-builder-ready', protocol: 1 }, '*');
    bridge.postChange(PAGE_SET, []);
    bridge.flushChange();
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS * 2);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
  });

  it('locks the target origin to the first load and debounces changes to it, echoing the loadId', () => {
    const { win, parent, send } = fakeWindow();
    const h = handlers();
    const bridge = createBridge(win, h);
    send(LOAD);
    expect(h.onLoad).toHaveBeenCalledTimes(1);
    expect(h.onLoad.mock.calls[0]![0]).toMatchObject({ loadId: 'load-1', layout: 'storefront' });
    bridge.postChange(PAGE_SET, []);
    bridge.postChange(PAGE_SET, [{ docKey: 'cart', rule: 'cart.contents', message: 'Missing CartContents' }]);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS - 1);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(parent.postMessage).toHaveBeenLastCalledWith(
      { type: 'sf-builder-change', loadId: 'load-1', pageSet: PAGE_SET, issues: [{ docKey: 'cart', rule: 'cart.contents', message: 'Missing CartContents' }] },
      ADMIN,
    );
    expect(parent.postMessage).toHaveBeenCalledTimes(2);
  });

  it('flushChange sends a pending change immediately', () => {
    const { win, parent, send } = fakeWindow();
    const bridge = createBridge(win, handlers());
    send(LOAD);
    bridge.postChange(PAGE_SET, []);
    bridge.flushChange();
    expect(parent.postMessage).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    expect(parent.postMessage).toHaveBeenCalledTimes(2);
  });

  it('a new load cancels a change debounced under the previous load, before onLoad runs', () => {
    const { win, parent, send } = fakeWindow();
    const h = handlers();
    const bridge = createBridge(win, h);
    // What session.ts does: post exactly one change from the loaded data.
    h.onLoad.mockImplementation(() => {
      bridge.postChange(PAGE_SET, []);
      bridge.flushChange();
    });
    send(LOAD);
    bridge.postChange(PAGE_SET, [{ docKey: 'cart', rule: 'stale', message: 'stale' }]);
    send({ ...LOAD, loadId: 'load-2', layout: 'menu' });
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS * 2);
    const changes = parent.postMessage.mock.calls.filter(([m]) => m.type === 'sf-builder-change').map(([m]) => m);
    expect(changes.map((m) => m.loadId)).toEqual(['load-1', 'load-2']);
    expect(changes.every((m) => m.issues.length === 0)).toBe(true);
  });

  it('never posts a change while the current load is read-only', () => {
    const { win, parent, send } = fakeWindow();
    const bridge = createBridge(win, handlers());
    send({ ...LOAD, readOnly: true });
    bridge.postChange(PAGE_SET, []);
    bridge.flushChange();
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    send({ ...LOAD, loadId: 'load-2' });
    bridge.postChange(PAGE_SET, []);
    bridge.flushChange();
    expect(parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'sf-builder-change', loadId: 'load-2' }), ADMIN);
  });

  it('normalises the emitted page set (*Html strings) and filters drop:* issues', () => {
    const { win, parent, send } = fakeWindow();
    const bridge = createBridge(win, handlers());
    send(LOAD);
    const set = { ...PAGE_SET, pages: { catalog: { ...PAGE_SET.shell, content: [{ type: 'RichText', props: { id: 'RichText-1', bodyHtml: null } }] } } } as unknown as PageSet;
    bridge.postChange(set, [{ docKey: 'catalog', rule: 'drop:unknown', message: 'x' }]);
    bridge.flushChange();
    const [msg] = parent.postMessage.mock.calls.at(-1)!;
    expect(msg.pageSet.pages.catalog.content[0].props.bodyHtml).toBe('');
    expect(msg.issues).toEqual([]);
  });

  it('ignores messages not from the parent, from an opaque origin, or from a second origin', () => {
    const { win, send } = fakeWindow();
    const h = handlers();
    createBridge(win, h);
    send(LOAD, { source: { not: 'parent' } });
    send(LOAD, { origin: 'null' });
    expect(h.onLoad).not.toHaveBeenCalled();
    send(LOAD);
    send(LOAD, { origin: 'https://evil.example' });
    send({ type: 'sf-builder-select-page', docKey: 'cart' }, { origin: 'https://evil.example' });
    expect(h.onLoad).toHaveBeenCalledTimes(1);
    expect(h.onSelectPage).not.toHaveBeenCalled();
    send({ type: 'sf-builder-select-page', docKey: 'cart' });
    expect(h.onSelectPage).toHaveBeenCalledWith('cart');
  });

  it('ignores page selection before the first load', () => {
    const { win, send } = fakeWindow();
    const h = handlers();
    createBridge(win, h);
    send({ type: 'sf-builder-select-page', docKey: 'cart' });
    expect(h.onSelectPage).not.toHaveBeenCalled();
  });

  it('forwards themes with draft CSS dropped', () => {
    const { win, send } = fakeWindow();
    const h = handlers();
    createBridge(win, h);
    send({ type: 'sf-builder-theme', theme: THEME });
    expect(h.onTheme.mock.calls[0]![0].customCss).toBe('');
  });

  it('round-trips an upload through the parent, and ignores unknown request ids', async () => {
    const { win, parent, send } = fakeWindow();
    const bridge = createBridge(win, handlers());
    send(LOAD);
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    const pending = bridge.requestUpload(file);
    const request = parent.postMessage.mock.calls.at(-1)!;
    expect(request[0]).toMatchObject({ type: 'sf-builder-upload-request', file });
    expect(request[0].file).toBeInstanceOf(File);
    expect(request[0].requestId.length).toBeGreaterThan(0);
    expect(request[0].requestId.length).toBeLessThanOrEqual(100);
    expect(request[1]).toBe(ADMIN);
    const url = `/media/storefront-pages/media/${'b'.repeat(32)}.png`;
    send({ type: 'sf-builder-upload-result', requestId: 'someone-else', url, error: null });
    send({ type: 'sf-builder-upload-result', requestId: request[0].requestId, url, error: null });
    await expect(pending).resolves.toBe(url);
  });

  it('rejects an upload with the admin error, on timeout, and before any load', async () => {
    const { win, parent, send } = fakeWindow();
    const bridge = createBridge(win, handlers());
    await expect(bridge.requestUpload(new File(['x'], 'x.png'))).rejects.toThrow('not connected');
    send(LOAD);
    const failed = bridge.requestUpload(new File(['x'], 'x.png'));
    const id = parent.postMessage.mock.calls.at(-1)![0].requestId;
    send({ type: 'sf-builder-upload-result', requestId: id, url: null, error: 'Too big' });
    await expect(failed).rejects.toThrow('Too big');
    const slow = bridge.requestUpload(new File(['x'], 'x.png'));
    vi.advanceTimersByTime(UPLOAD_TIMEOUT_MS);
    await expect(slow).rejects.toThrow('timed out');
  });

  it('posts viewport changes at once to the admin origin, and nothing before a load', () => {
    const { win, parent, send } = fakeWindow();
    const bridge = createBridge(win, handlers());
    bridge.postViewport(360);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    send(LOAD);
    bridge.postViewport(768);
    bridge.postViewport(null);
    expect(parent.postMessage.mock.calls.slice(1)).toEqual([
      [{ type: 'sf-builder-viewport', width: 768 }, ADMIN],
      [{ type: 'sf-builder-viewport', width: null }, ADMIN],
    ]);
  });

  it('dispose removes the listener, cancels a pending change and rejects pending uploads', async () => {
    const { win, parent, send, listeners } = fakeWindow();
    const bridge = createBridge(win, handlers());
    send(LOAD);
    const upload = bridge.requestUpload(new File(['x'], 'x.png'));
    bridge.postChange(PAGE_SET, []);
    bridge.dispose();
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    expect(listeners).toHaveLength(0);
    expect(parent.postMessage).toHaveBeenCalledTimes(2); // ready + upload request
    await expect(upload).rejects.toThrow('closed');
  });

  it('keeps the active bridge for the image field', () => {
    const { win } = fakeWindow();
    const bridge = createBridge(win, handlers());
    setActiveBridge(bridge);
    expect(getActiveBridge()).toBe(bridge);
    setActiveBridge(null);
    expect(getActiveBridge()).toBeNull();
  });
});

describe('builder bridge: flush when the owner leaves the frame', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A frame window with real, type-aware event targets (window + document). */
  function eventWindow() {
    const target = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
    const parent = { postMessage: vi.fn() };
    const win = {
      parent,
      document: doc,
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    } as unknown as Window;
    const send = (data: unknown) => {
      const e = new Event('message');
      Object.assign(e, { data, source: parent, origin: ADMIN });
      target.dispatchEvent(e);
    };
    const changes = () => parent.postMessage.mock.calls.filter(([m]) => m.type === 'sf-builder-change');
    return { win, doc, target, parent, send, changes };
  }

  it.each(['blur', 'pagehide'])('%s sends the pending change at once (no 500 ms wait)', (type) => {
    const { win, target, send, changes } = eventWindow();
    const bridge = createBridge(win, handlers());
    send(LOAD);
    bridge.postChange(PAGE_SET, []);
    expect(changes()).toHaveLength(0);
    target.dispatchEvent(new Event(type));
    expect(changes()).toHaveLength(1);
    expect(changes()[0]![0]).toMatchObject({ loadId: 'load-1' });
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS * 2);
    expect(changes()).toHaveLength(1); // the debounce timer was cancelled, not re-sent
    bridge.dispose();
  });

  it('visibilitychange flushes only when the frame becomes hidden', () => {
    const { win, doc, send, changes } = eventWindow();
    const bridge = createBridge(win, handlers());
    send(LOAD);
    bridge.postChange(PAGE_SET, []);
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(changes()).toHaveLength(0);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(changes()).toHaveLength(1);
    bridge.dispose();
  });

  it('nothing pending → a blur sends nothing; after dispose, leaving does nothing', () => {
    const { win, target, send, parent } = eventWindow();
    const bridge = createBridge(win, handlers());
    send(LOAD);
    target.dispatchEvent(new Event('blur'));
    expect(parent.postMessage).toHaveBeenCalledTimes(1); // ready only
    bridge.postChange(PAGE_SET, []);
    bridge.dispose();
    target.dispatchEvent(new Event('pagehide'));
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
  });
});
