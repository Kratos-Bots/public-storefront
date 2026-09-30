// web/test/builder-editor-text-room.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { DEFAULT_PREVIEW_AS, TEXT_INITIAL, useEditorStore } from '@/builder/editor/store.ts';
import { useTextUi } from '@/builder/editor/text/ui-store.ts';
import { TextRow } from '@/builder/editor/text/TextRow.tsx';
import { TextPanel } from '@/builder/editor/text/TextPanel.tsx';
import { SIZE_ISSUE } from '@/builder/editor/text/issues.ts';
import { rowFor, allRows } from '@/builder/editor/text/catalog.ts';
import { plainKey } from './helpers/text-keys.ts';

const counter = vi.hoisted(() => ({ noRoomFor: 0 }));
vi.mock('@/builder/editor/text/model.ts', async (orig) => {
  const actual = await orig<typeof import('@/builder/editor/text/model.ts')>();
  return { ...actual, noRoomFor: (...a: Parameters<typeof actual.noRoomFor>) => { counter.noRoomFor++; return actual.noRoomFor(...a); } };
});

const S = () => useEditorStore.getState();
const ready = () => {
  useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null, ...TEXT_INITIAL });
  S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: null });
};

describe('language room is computed once per change, not once per row', () => {
  beforeEach(() => useTextUi.setState({ open: true, filter: 'all', query: '', focus: null }));
  afterEach(cleanup);

  it('a keystroke scans the layers a fixed number of times however many rows are mounted', () => {
    ready();
    const keys = allRows().slice(0, 40).map((r) => r.key);
    render(<>{keys.map((k) => <TextRow key={k} row={rowFor(k)!} />)}</>);
    const key = plainKey();
    const before = counter.noRoomFor;
    act(() => { S().setText('shared', key, 'One', null); });
    // setText's own guard + one scan per layer for the active language; never 40 rows' worth.
    const used = counter.noRoomFor - before;
    expect(used).toBeLessThanOrEqual(4);
  });
});

describe('the "Amount of wording" issue', () => {
  beforeEach(() => useTextUi.setState({ open: true, filter: 'all', query: '', focus: null }));
  afterEach(cleanup);

  it('focuses the Room notice, the one element that explains it', async () => {
    ready();
    const TEN = ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt', 'pl', 'sv', 'da'];
    const strings = Object.fromEntries(TEN.map((l) => [l, Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`zz.big.k${i}`, 'é'.repeat(1000)]))]));
    act(() => { S().load({ layout: 'storefront', pageSet: null, readOnly: false, siteText: { schemaVersion: 1, language: { locale: 'en', formatLocale: '' }, strings } as never }); });
    expect(S().siteText).not.toBeNull();
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this); };
    render(<TextPanel />);
    act(() => { useTextUi.getState().show({ key: SIZE_ISSUE, filter: 'issues' }); });
    await vi.waitFor(() => expect(scrolled.some((el) => el.getAttribute('data-text-key') === 'languages')).toBe(true));
    fireEvent.blur(document.body);
  });
});
