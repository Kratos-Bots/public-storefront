import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { ApiError } from '@/lib/errors.ts';
import type { ServicePoint, ServicePointSearch } from '@/types/service-points.ts';

vi.mock('@/api/service-points.ts', () => ({ searchServicePoints: vi.fn() }));
import { searchServicePoints } from '@/api/service-points.ts';
import { usePointSearch } from '@/features/checkout/usePointSearch.ts';

const searchMock = vi.mocked(searchServicePoints);
const point = (id: string): ServicePoint => ({
  id, carrier: 'inpost', name: `Point ${id}`, street: 'Kirkgate', houseNumber: '14', postalCode: 'LS1 6BY', city: 'Leeds',
  country: 'GB', latitude: null, longitude: null, distance: 300,
});
const found = (...ids: string[]): ServicePointSearch => ({ available: true, carriers: ['inpost'], points: ids.map(point) });
/** A promise the test settles by hand, to order responses. */
function deferred<T>() {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => searchMock.mockReset());
afterEach(cleanup);

describe('usePointSearch', () => {
  it('starts idle, shows searching, then the results', async () => {
    const d = deferred<ServicePointSearch>();
    searchMock.mockReturnValueOnce(d.promise);
    const { result } = renderHook(() => usePointSearch('GB'));
    expect(result.current.state).toEqual({ status: 'idle' });
    act(() => result.current.search(' LS1 6BY '));
    expect(result.current.state).toEqual({ status: 'searching' });
    expect(searchMock).toHaveBeenCalledWith('GB', 'LS1 6BY', expect.any(AbortSignal));
    await act(async () => { d.resolve(found('1', '2')); await d.promise; });
    expect(result.current.state).toEqual({ status: 'results', points: [point('1'), point('2')] });
  });

  it('no points, or collection reported unavailable, is the empty state', async () => {
    searchMock.mockResolvedValueOnce(found());
    const { result } = renderHook(() => usePointSearch('GB'));
    await act(async () => { result.current.search('LS1'); });
    expect(result.current.state).toEqual({ status: 'empty' });
    searchMock.mockResolvedValueOnce({ available: false, carriers: [], points: [] });
    await act(async () => { result.current.search('LS2'); });
    expect(result.current.state).toEqual({ status: 'empty' });
  });

  it('drops points with no city, postcode, id or carrier; none left is empty', async () => {
    const noCity = { ...point('2'), city: '  ' };
    searchMock.mockResolvedValueOnce({ available: true, carriers: ['inpost'], points: [point('1'), noCity] });
    const { result } = renderHook(() => usePointSearch('GB'));
    await act(async () => { result.current.search('LS1'); });
    expect(result.current.state).toEqual({ status: 'results', points: [point('1')] });
    searchMock.mockResolvedValueOnce({ available: true, carriers: ['inpost'], points: [noCity, { ...point('3'), postalCode: '' }, { ...point('4'), carrier: ' ' }, { ...point('5'), id: '' }] });
    await act(async () => { result.current.search('LS2'); });
    expect(result.current.state).toEqual({ status: 'empty' });
  });

  it('a 429 is "busy"; any other failure is "failed"', async () => {
    const { result } = renderHook(() => usePointSearch('GB'));
    searchMock.mockRejectedValueOnce(new ApiError(429, 'Too many requests'));
    await act(async () => { result.current.search('LS1'); });
    expect(result.current.state).toEqual({ status: 'error', kind: 'busy' });
    searchMock.mockRejectedValueOnce(new ApiError(502, 'down'));
    await act(async () => { result.current.search('LS1'); });
    expect(result.current.state).toEqual({ status: 'error', kind: 'failed' });
  });

  it('ignores a postcode shorter than two characters and a search with no country', () => {
    const { result, rerender } = renderHook(({ c }) => usePointSearch(c), { initialProps: { c: 'GB' } });
    act(() => result.current.search(' L '));
    rerender({ c: '' });
    act(() => result.current.search('LS1 6BY'));
    expect(searchMock).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('an older response never replaces a newer one', async () => {
    const first = deferred<ServicePointSearch>(); const second = deferred<ServicePointSearch>();
    searchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => usePointSearch('GB'));
    act(() => result.current.search('LS1'));
    act(() => result.current.search('LS2'));
    expect((searchMock.mock.calls[0]![2] as AbortSignal).aborted).toBe(true);
    await act(async () => { second.resolve(found('new')); await second.promise; });
    await act(async () => { first.resolve(found('old')); await first.promise; });
    expect(result.current.state).toEqual({ status: 'results', points: [point('new')] });
  });

  it('changing the country drops a search in flight and returns to idle', async () => {
    const d = deferred<ServicePointSearch>();
    searchMock.mockReturnValueOnce(d.promise);
    const { result, rerender } = renderHook(({ c }) => usePointSearch(c), { initialProps: { c: 'GB' } });
    act(() => result.current.search('LS1'));
    rerender({ c: 'FR' });
    expect(result.current.state).toEqual({ status: 'idle' });
    await act(async () => { d.resolve(found('gb-point')); await d.promise; });
    expect(result.current.state).toEqual({ status: 'idle' });
  });
});
