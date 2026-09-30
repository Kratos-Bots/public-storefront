// web/test/builder-editor-use-issues.test.tsx — the header's issues are the ones the admin receives.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIssues } from '@/builder/editor/use-issues.ts';
import { DEFAULT_PREVIEW_AS, useEditorStore } from '@/builder/editor/store.ts';
import { collectIssues, normalizeDoc } from '@/builder/editor/page-set.ts';
import { prepareDocs } from '@/builder/editor/prepare.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import type { PuckDoc } from '@/builder/types.ts';

const L = 'storefront' as const;
const shell = () => normalizeDoc(defaultDoc('shell', L), 'shell');
const featured = (items: unknown[]): PuckDoc => ({
  root: { props: { title: 'About', description: '', chrome: 'shell' } },
  content: [{ type: 'FeaturedProducts', props: { id: 'fp', title: 'Picks', source: 'picked', items, categoryId: null, limit: 4 } }],
});

function setDocs(docs: Record<string, PuckDoc>) {
  useEditorStore.setState({ status: 'ready', layout: L, readOnly: false, docs, docKey: 'page:about', epoch: 1, previewAs: DEFAULT_PREVIEW_AS, viewport: null });
}

afterEach(() => vi.restoreAllMocks());

describe('useIssues', () => {
  it('ignores an unpicked Featured row, as the posted change does', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const docs = { shell: shell(), 'page:about': featured([{ productId: 7 }, {}]) };
    // Control: the raw doc would raise a field issue for the row the admin never sees.
    expect(collectIssues(docs, L).length).toBeGreaterThan(0);
    expect(collectIssues(prepareDocs(docs), L)).toEqual([]);
    setDocs(docs);
    const { result } = renderHook(() => useIssues());
    expect(result.current).toEqual([]);
  });

  it('lists a required block hidden in a Columns column (exactly-one)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const base = shell();
    const outlet = base.content.find((b) => b.type === 'PageOutlet')!;
    const columns = { type: 'Columns', props: { id: 'cols', columns: '2', stackBelow: 'md', gap: 'md', col1: [], col2: [], col3: [outlet], col4: [] } };
    setDocs({ shell: { ...base, content: [...base.content.filter((b) => b !== outlet), columns] } });
    const { result } = renderHook(() => useIssues());
    expect(result.current.map((i) => i.rule)).toContain('exactly-one:PageOutlet');
  });
});
