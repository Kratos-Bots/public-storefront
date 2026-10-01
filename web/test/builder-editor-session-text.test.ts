// web/test/builder-editor-session-text.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

vi.mock('@/app/builder-gate.ts', async (orig) => ({ ...(await orig<typeof import('@/app/builder-gate.ts')>()), isBuilderMode: () => true }));

import { startBuilderSession } from '@/builder/editor/session.ts';
import { DEFAULT_PREVIEW_AS, TEXT_INITIAL, useEditorStore } from '@/builder/editor/store.ts';
import { builderOverrides } from '@/app/builder-gate.ts';
import { CHANGE_DEBOUNCE_MS } from '@/builder/editor/bridge.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { THEME } from './helpers/builder-theme.ts';
import { plainKey, pluralKey } from './helpers/text-keys.ts';

const ADMIN = 'https://admin.shop.example';
function fakeWindow() {
  const listeners: Array<(e: MessageEvent) => void> = [];
  const parent = { postMessage: vi.fn() };
  const win = { parent, addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn), removeEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.splice(listeners.indexOf(fn), 1) } as unknown as Window;
  const send = (data: unknown) => [...listeners].forEach((fn) => fn({ data, source: parent, origin: ADMIN } as unknown as MessageEvent));
  const changes = () => parent.postMessage.mock.calls.filter(([m]) => m.type === 'sf-builder-change').map(([m]) => m);
  return { win, send, changes };
}
let seq = 0;
const load = (extra: Record<string, unknown> = {}) => ({ type: 'sf-builder-load', protocol: 1, loadId: `t-${++seq}`, layout: 'storefront', pageSet: null, theme: THEME, readOnly: false, ...extra });
const shell = () => defaultDoc('shell', 'storefront')!;

describe('builder session: text', () => {
  const key = plainKey();
  beforeEach(() => {
    vi.useFakeTimers();
    useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null, ...TEXT_INITIAL });
    builderOverrides.setState({ theme: null, layout: null });
  });
  afterEach(() => vi.useRealTimers());

  it('siteText null: the baseline carries a full empty doc and no text issues', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load({ siteText: null }));
    expect(changes()).toHaveLength(1);
    expect(changes()[0].siteText).toEqual({ schemaVersion: 1, language: { locale: 'en', formatLocale: '' }, strings: {} });
    expect(changes()[0].textIssues).toEqual([]);
    expect('text' in changes()[0].pageSet).toBe(false);
    stop();
  });

  it('siteText absent: no change ever carries siteText, layout overrides still go out', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load());
    expect('siteText' in changes()[0]).toBe(false);
    useEditorStore.getState().setPublishedText({ language: { locale: 'en', formatLocale: '' }, shared: {} });
    useEditorStore.getState().setText('layout', key, 'Only here', null);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    const last = changes().at(-1);
    expect('siteText' in last).toBe(false);
    expect(last.pageSet.text).toEqual({ strings: { en: { [key]: 'Only here' } } });
    stop();
  });

  it('overrides loaded with the page set survive into the baseline unchanged', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    const text = { strings: { en: { [key]: 'Kept' }, de: { [key]: 'Behalten' } } };
    send(load({ pageSet: { schemaVersion: 1, shell: shell(), pages: {}, text }, siteText: null }));
    expect(changes()[0].pageSet.text).toEqual(text);
    stop();
  });

  it('a half-typed placeholder is an issue but is not posted (the backend would refuse the autosave)', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load({ siteText: null }));
    useEditorStore.getState().setText('shared', key, 'Only {avail', null);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    const last = changes().at(-1);
    expect(last.siteText.strings).toEqual({});
    expect(last.textIssues).toEqual([expect.objectContaining({ scope: 'shared', key, rule: 'bad-brace' })]);
    useEditorStore.getState().setText('shared', key, 'Only {avail}', null);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    // Unknown placeholder: structurally fine, so posted — and still blocks Publish.
    expect(changes().at(-1).siteText.strings.en[key]).toBe('Only {avail}');
    expect(changes().at(-1).textIssues[0].rule).toBe('unknown-placeholder');
    stop();
  });

  it('read-only loads post nothing, text included', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load({ readOnly: true, siteText: null }));
    useEditorStore.getState().setText('shared', key, 'x', null);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS * 2);
    expect(changes()).toEqual([]);
    stop();
  });

  it('a text-only edit is posted; an identical re-edit is not', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load({ siteText: null }));
    useEditorStore.getState().setText('shared', key, 'Once', null);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    const n = changes().length;
    useEditorStore.getState().setText('shared', key, 'Once', null);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    expect(changes()).toHaveLength(n);
    stop();
  });
});

// Ledger CARRY lines for Task 7 (binding): postable text only, textIssues always sent, no empty pageSet.text.
describe('builder session: only postable text goes out', () => {
  const key = plainKey();
  beforeEach(() => {
    vi.useFakeTimers();
    useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null, ...TEXT_INITIAL });
    builderOverrides.setState({ theme: null, layout: null });
  });
  afterEach(() => vi.useRealTimers());

  it('a plural without `other` (the admin would drop the whole change) stays out of pageSet.text; its issue goes out', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load({ siteText: null }));
    const plural = pluralKey();
    useEditorStore.getState().setText('layout', plural, { one: '{count} item' }, null);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    const last = changes().at(-1);
    expect('text' in last.pageSet).toBe(false);
    expect(last.textIssues).toEqual([expect.objectContaining({ scope: 'layout', key: plural })]);
    // Alongside a postable override, only the postable one is sent.
    useEditorStore.getState().setText('layout', key, 'Fine', null);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    expect(changes().at(-1).pageSet.text).toEqual({ strings: { en: { [key]: 'Fine' } } });
    stop();
  });

  it('a half-typed layout override is left out of the shared-less change too', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load());
    useEditorStore.getState().setText('layout', key, 'Oops }', null);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    const last = changes().at(-1);
    expect('text' in last.pageSet).toBe(false);
    expect('siteText' in last).toBe(false);
    expect(last.textIssues).toEqual([expect.objectContaining({ scope: 'layout', key, rule: 'bad-brace' })]);
    stop();
  });

  it('textIssues is on every change, including the baseline of a load without siteText', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load());
    expect(changes()[0].textIssues).toEqual([]);
    useEditorStore.getState().updateDoc('catalog', { root: { props: { title: 'Block edit', description: '', chrome: 'shell' } }, content: [] }, useEditorStore.getState().epoch);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    expect(changes().length).toBeGreaterThan(1);
    expect(changes().every((c) => Array.isArray(c.textIssues))).toBe(true);
    stop();
  });

  it('clearing the last override removes pageSet.text (never an empty object)', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load({ pageSet: { schemaVersion: 1, shell: shell(), pages: {}, text: { strings: { en: { [key]: 'Kept' } } } }, siteText: null }));
    expect(changes()[0].pageSet.text).toBeDefined();
    useEditorStore.getState().setText('layout', key, '', null);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    expect('text' in changes().at(-1).pageSet).toBe(false);
    stop();
  });

  it('a language change is posted with the shared doc', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load({ siteText: null }));
    useEditorStore.getState().setLanguage({ locale: 'de' }, null);
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    expect(changes().at(-1).siteText.language).toEqual({ locale: 'de', formatLocale: '' });
    stop();
  });
});

// Fix round 1: the published read arriving after the baseline.
describe('builder session: published text arrival', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null, ...TEXT_INITIAL });
    builderOverrides.setState({ theme: null, layout: null });
  });
  afterEach(() => vi.useRealTimers());

  it('in the default language it posts nothing after the baseline', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    send(load());
    useEditorStore.getState().setPublishedText({ language: { locale: 'en', formatLocale: '' }, shared: { [plainKey()]: 'Shared' } });
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS * 2);
    expect(changes()).toHaveLength(1);
    stop();
  });

  it('in another language only textIssues change: pageSet equals the baseline (the admin never re-saves an equal value)', () => {
    const { win, send, changes } = fakeWindow();
    const stop = startBuilderSession(win, new QueryClient());
    const bad = { strings: { de: { [plainKey()]: 'Kaputt {' } } };
    send(load({ pageSet: { schemaVersion: 1, shell: shell(), pages: {}, text: bad } }));
    expect(changes()[0].textIssues).toEqual([]);
    useEditorStore.getState().setPublishedText({ language: { locale: 'de', formatLocale: '' }, shared: {} });
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS);
    expect(changes()).toHaveLength(2);
    expect(changes()[1].pageSet).toEqual(changes()[0].pageSet);
    expect('siteText' in changes()[1]).toBe(false);
    expect(changes()[1].textIssues).toEqual([expect.objectContaining({ scope: 'layout', rule: 'bad-brace' })]);
    stop();
  });
});
