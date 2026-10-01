import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublished, toPublished, toPublishedText } from '@/api/pages.ts';

const SET = { schemaVersion: 1, shell: { root: { props: {} }, content: [] }, pages: {} };
const TEXT = { version: 4, locale: 'en', formatLocale: '', shared: { 'common.totals.subtotal': 'Sub-total' }, layout: {} };
const respond = (data: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data, error: null }), { status: 200, headers: { 'content-type': 'application/json' } })));
afterEach(() => vi.unstubAllGlobals());

describe('fetchPublished', () => {
  it('parses the v0.7.0 shape (no text)', async () => {
    respond({ version: 3, data: SET });
    expect(await fetchPublished('menu')).toEqual({ pageSet: SET, text: null });
  });
  it('parses the new shape', async () => {
    respond({ version: 3, data: SET, text: TEXT });
    expect(await fetchPublished('menu')).toEqual({ pageSet: SET, text: TEXT });
  });
  it('parses text only (no published page set)', async () => {
    respond({ version: 0, data: null, text: TEXT });
    expect(await fetchPublished('storefront')).toEqual({ pageSet: null, text: TEXT });
  });
  it('drops a malformed text without dropping the page set', async () => {
    respond({ version: 3, data: SET, text: { version: 'x', locale: 'en' } });
    expect(await fetchPublished('storefront')).toEqual({ pageSet: SET, text: null });
  });
  it('null, 503 and network errors mean nothing published', async () => {
    respond(null);
    expect(await fetchPublished('webapp')).toEqual({ pageSet: null, text: null });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    expect(await fetchPublished('webapp')).toEqual({ pageSet: null, text: null });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await fetchPublished('webapp')).toEqual({ pageSet: null, text: null });
  });
});

describe('toPublishedText', () => {
  it('rejects a non-canonical locale or formatLocale', () => {
    expect(toPublishedText({ ...TEXT, locale: 'EN' })).toBeNull();
    expect(toPublishedText({ ...TEXT, formatLocale: 'de_DE' })).toBeNull();
  });
  it('drops individual malformed values but keeps the rest', () => {
    const t = toPublishedText({ ...TEXT, shared: { a: 'ok', b: 3, c: { one: 'x' } }, layout: { d: { one: 'x', other: 'y' } } });
    expect(t).toEqual({ ...TEXT, shared: { a: 'ok' }, layout: { d: { one: 'x', other: 'y' } } });
  });
  it('requires both layers to be objects', () => {
    expect(toPublishedText({ ...TEXT, layout: [] })).toBeNull();
  });
  it('toPublished ignores a non-object body', () => {
    expect(toPublished('nope')).toEqual({ pageSet: null, text: null });
  });
});
