import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ApiError } from '@/lib/errors.ts';
import type { ServicePoint } from '@/types/service-points.ts';

vi.mock('@/api/service-points.ts', () => ({ searchServicePoints: vi.fn() }));
import { searchServicePoints } from '@/api/service-points.ts';
import { PointPicker } from '@/features/checkout/PointPicker.tsx';

const searchMock = vi.mocked(searchServicePoints);
const point = (over: Partial<ServicePoint> = {}): ServicePoint => ({
  id: '1', carrier: 'inpost', name: 'Tesco Express', street: 'Kirkgate', houseNumber: '14', postalCode: 'LS1 6BY', city: 'Leeds',
  country: 'GB', latitude: null, longitude: null, distance: 340, ...over,
});

const mount = (over: Partial<Parameters<typeof PointPicker>[0]> = {}) => {
  const props = { country: 'GB', value: null, postcode: '', onPostcodeChange: vi.fn(), onChoose: vi.fn(), ...over };
  render(<MantineProvider env="test"><PointPicker {...props} /></MantineProvider>);
  return props;
};
const search = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Search' })); }); };

beforeEach(() => searchMock.mockReset());
afterEach(cleanup);

describe('PointPicker', () => {
  it('prompts before any search', () => {
    mount();
    expect(screen.getByText('Enter a postcode to find collection points near you.')).toBeTruthy();
  });

  it('searches the typed postcode and lists the points with address, carrier and distance', async () => {
    searchMock.mockResolvedValueOnce({ available: true, carriers: ['inpost'], points: [point(), point({ id: '2', name: 'News Plus', distance: null })] });
    mount({ postcode: 'LS1 6BY' });
    await search();
    expect(searchMock).toHaveBeenCalledWith('GB', 'LS1 6BY', expect.any(AbortSignal));
    const rows = screen.getAllByRole('radio');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('Tesco Express')).toBeTruthy();
    expect(screen.getAllByText('Kirkgate 14, Leeds')).toHaveLength(2);
    expect(screen.getByText('0.3 km')).toBeTruthy();
    expect(screen.getAllByText('inpost')).toHaveLength(2);
  });

  it('Enter in the postcode box searches', async () => {
    searchMock.mockResolvedValueOnce({ available: true, carriers: [], points: [point()] });
    mount({ postcode: 'LS1' });
    await act(async () => { fireEvent.keyDown(screen.getByLabelText('Postcode'), { key: 'Enter' }); });
    expect(searchMock).toHaveBeenCalledTimes(1);
  });

  it('choosing a row reports the point', async () => {
    searchMock.mockResolvedValueOnce({ available: true, carriers: [], points: [point(), point({ id: '2', name: 'News Plus' })] });
    const props = mount({ postcode: 'LS1' });
    await search();
    fireEvent.click(screen.getByRole('radio', { name: /News Plus/ }));
    expect(props.onChoose).toHaveBeenCalledWith(point({ id: '2', name: 'News Plus' }));
  });

  it('shows the chosen point with a Change action, and Change brings the search back', () => {
    mount({ value: point(), postcode: 'LS1 6BY' });
    expect(screen.getByText('Your collection point')).toBeTruthy();
    expect(screen.getByText('Tesco Express')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();
  });

  it('says so when nothing is found, when the lookup fails and when searching too often', async () => {
    searchMock.mockResolvedValueOnce({ available: true, carriers: [], points: [] });
    mount({ postcode: 'ZZ1' });
    await search();
    expect(screen.getByText('No collection points found near that postcode. Try another.')).toBeTruthy();
    searchMock.mockRejectedValueOnce(new ApiError(502, 'down'));
    await search();
    expect(screen.getByText("We couldn't load collection points. Please try again.")).toBeTruthy();
    searchMock.mockRejectedValueOnce(new ApiError(429, 'slow down'));
    await search();
    expect(screen.getByText('Too many searches. Please wait a minute and try again.')).toBeTruthy();
  });

  it('shows the step’s error', () => {
    mount({ error: 'Choose a collection point' });
    expect(screen.getByText('Choose a collection point')).toBeTruthy();
  });
});
