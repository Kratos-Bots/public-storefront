// web/test/builder-editor-text-hooks.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/api/pages.ts', async (orig) => ({
  ...(await orig<typeof import('@/api/pages.ts')>()),
  fetchPublished: vi.fn(async () => ({ pageSet: null, text: { version: 3, locale: 'de', formatLocale: '', shared: {}, layout: {} } })),
}));

import { fetchPublished } from '@/api/pages.ts';
import { DEFAULT_PREVIEW_AS, TEXT_INITIAL, editorTextOf, useEditorStore } from '@/builder/editor/store.ts';
import { applyLanguage, applyText, useEditorText, usePublishedTextSync, useTextCell, useTextIssues } from '@/builder/editor/text/hooks.ts';
import { useTextUi } from '@/builder/editor/text/ui-store.ts';
import { CanvasTextScope } from '@/builder/editor/text/scope.tsx';
import { setAnchorSource } from '@/builder/editor/text/history.ts';
import { useText } from '@/text/runtime.tsx';
import { defaultOf, plainKey } from './helpers/text-keys.ts';

const S = () => useEditorStore.getState();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

describe('editor text hooks', () => {
  const key = plainKey();
  beforeEach(() => {
    useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null, ...TEXT_INITIAL });
    useTextUi.setState({ open: false, filter: 'all', query: '', focus: null });
  });
  afterEach(() => { cleanup(); setAnchorSource(null); });

  it('useEditorText gives both layers for the active locale; stable until text changes', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    const { result, rerender } = renderHook(() => useEditorText());
    const first = result.current;
    expect(first).toEqual({ locale: 'en', formatLocale: '', shared: {}, layout: {} });
    rerender();
    expect(result.current).toBe(first);
    act(() => { applyText('shared', key, 'Shared'); applyText('layout', key, 'Mine'); });
    expect(result.current.shared[key]).toBe('Shared');
    expect(result.current.layout[key]).toBe('Mine');
  });

  it('useEditorText is the store\'s memoised editorTextOf (identity-stable across unrelated updates)', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    const { result } = renderHook(() => useEditorText());
    const first = result.current;
    expect(first).toBe(editorTextOf(S()));
    act(() => { S().setViewport(360); S().setPreviewAs({ cart: 'empty' }); });
    expect(result.current).toBe(first);
  });

  it('applyText stamps the Puck anchor', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    setAnchorSource(() => 'h-3');
    applyText('shared', key, 'x');
    expect(S().textPast.at(-1)!.anchor).toBe('h-3');
  });

  it('applyText / applyLanguage with a loadEpoch from an earlier load are dropped', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    const started = S().loadEpoch;
    expect(applyText('layout', key, 'Mine', started)).toBe(true);
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    expect(applyText('layout', key, 'Late', started)).toBe(false);
    expect(applyLanguage({ locale: 'de' }, started)).toBe(false);
    expect(S().pageText.strings).toEqual({});
    expect(S().siteText!.language.locale).toBe('en');
    expect(applyLanguage({ locale: 'de' }, S().loadEpoch)).toBe(true);
  });

  it('useTextCell: effective value, layer, fallback below the override, issues', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    const { result } = renderHook(() => useTextCell(key));
    expect(result.current.effective).toEqual({ value: defaultOf(key), from: 'default' });
    act(() => { applyText('shared', key, 'Shared'); applyText('layout', key, 'Bad {nope}'); });
    expect(result.current.effective).toEqual({ value: 'Shared', from: 'shared' });
    expect(result.current.below).toEqual({ value: 'Shared', from: 'shared' });
    expect(result.current.issues.map((i) => i.scope)).toEqual(['layout']);
    const issues = renderHook(() => useTextIssues()).result.current;
    expect(issues).toHaveLength(1);
  });

  it('without siteText, the published shared layer and language are fetched once and shown read-only', async () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false });
    renderHook(() => usePublishedTextSync(), { wrapper });
    await vi.waitFor(() => expect(S().published).toEqual({ language: { locale: 'de', formatLocale: '' }, shared: {} }));
    expect(renderHook(() => useEditorText()).result.current.locale).toBe('de');
  });

  it('a published read that started under an earlier load never lands in the next one', async () => {
    const mock = vi.mocked(fetchPublished);
    const resolvers: Array<(v: Awaited<ReturnType<typeof fetchPublished>>) => void> = [];
    mock.mockImplementation(() => new Promise((r) => { resolvers.push(r); }));
    try {
      S().load({ layout: 'storefront', pageSet: null, readOnly: false });
      renderHook(() => usePublishedTextSync(), { wrapper });
      await vi.waitFor(() => expect(resolvers).toHaveLength(1));
      act(() => { S().load({ layout: 'storefront', pageSet: null, readOnly: false }); });
      await vi.waitFor(() => expect(resolvers).toHaveLength(2));
      await act(async () => { resolvers[0]!({ pageSet: null, text: { version: 1, locale: 'fr', formatLocale: '', shared: {}, layout: {} } }); });
      expect(S().published).toBeNull();
      await act(async () => { resolvers[1]!({ pageSet: null, text: null }); });
      await vi.waitFor(() => expect(S().published).toEqual({ language: { locale: 'en', formatLocale: '' }, shared: {} }));
    } finally {
      mock.mockReset();
      mock.mockImplementation(async () => ({ pageSet: null, text: { version: 3, locale: 'de', formatLocale: '', shared: {}, layout: {} } }));
    }
  });

  it('with siteText the published read is never started', async () => {
    const mock = vi.mocked(fetchPublished);
    mock.mockClear();
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    renderHook(() => usePublishedTextSync(), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(mock).not.toHaveBeenCalled();
    expect(S().published).toBeNull();
  });

  it('the canvas scope makes useText() read the draft wording on every keystroke', () => {
    S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
    function Probe() { return <p data-testid="probe">{useText().t(key as never)}</p>; }
    render(<CanvasTextScope><Probe /></CanvasTextScope>, { wrapper });
    expect(screen.getByTestId('probe')).toHaveTextContent(String(defaultOf(key)));
    act(() => { applyText('shared', key, 'Northbound wording'); });
    expect(screen.getByTestId('probe')).toHaveTextContent('Northbound wording');
    act(() => { applyText('layout', key, 'Only here'); });
    expect(screen.getByTestId('probe')).toHaveTextContent('Only here');
  });

  it('ui store: show with a key bumps focus; hide closes', () => {
    useTextUi.getState().show({ key, filter: 'issues' });
    const a = useTextUi.getState().focus!;
    expect(useTextUi.getState()).toMatchObject({ open: true, filter: 'issues', focus: { key } });
    useTextUi.getState().show({ key });
    expect(useTextUi.getState().focus!.seq).toBeGreaterThan(a.seq);
    useTextUi.getState().hide();
    expect(useTextUi.getState().open).toBe(false);
  });
});
