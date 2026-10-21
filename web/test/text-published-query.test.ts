import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { packFor } from '@/text/packs/index.ts';

const mocks = vi.hoisted(() => ({ fetchPublished: vi.fn(), builder: false, preview: false }));
vi.mock('@/api/pages.ts', () => ({ fetchPublished: mocks.fetchPublished }));
vi.mock('@/app/builder-gate.ts', () => ({ isBuilderMode: () => mocks.builder }));
vi.mock('@/app/preview-listener.ts', () => ({ isPreviewMode: () => mocks.preview }));
import { pageSetQueryFn } from '@/builder/published.ts';

const text = (locale: string) => ({ version: 1, locale, formatLocale: '', shared: {}, layout: {} });
afterEach(() => { mocks.fetchPublished.mockReset(); mocks.builder = false; mocks.preview = false; window.localStorage.clear(); });

describe('pageSetQueryFn languages', () => {
  it('loads the pack of the served language before it resolves', async () => {
    mocks.fetchPublished.mockResolvedValue({ pageSet: null, text: text('es') });
    expect(packFor('es')).toBeUndefined();
    const out = await pageSetQueryFn(new QueryClient(), 'menu')();
    expect(out.text?.locale).toBe('es');
    expect(packFor('es')).toBeDefined();
  });
  it('does not load a pack for English, and swallows a failed pack load', async () => {
    mocks.fetchPublished.mockResolvedValue({ pageSet: null, text: text('en') });
    await expect(pageSetQueryFn(new QueryClient(), 'menu')()).resolves.toMatchObject({ text: { locale: 'en' } });
    expect(packFor('en')).toBeUndefined();
  });
  it('sends the shopper preference, but nothing in builder or preview mode', async () => {
    mocks.fetchPublished.mockResolvedValue({ pageSet: null, text: null });
    window.localStorage.setItem('sf.lang', 'it');
    await pageSetQueryFn(new QueryClient(), 'menu')();
    expect(mocks.fetchPublished.mock.calls[0]![1][0]).toBe('it');
    mocks.builder = true;
    await pageSetQueryFn(new QueryClient(), 'menu')();
    expect(mocks.fetchPublished.mock.calls[1]![1]).toEqual([]);
    mocks.builder = false; mocks.preview = true;
    await pageSetQueryFn(new QueryClient(), 'menu')();
    expect(mocks.fetchPublished.mock.calls[2]![1]).toEqual([]);
  });
});
