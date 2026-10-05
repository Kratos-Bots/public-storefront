import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReviewStep } from '@/features/checkout/steps/ReviewStep.tsx';
import { OrderDetailPage } from '@/features/account/OrderDetailPage.tsx';
import { DEFAULT_FORM } from '@/features/checkout/form-state.ts';

const h = vi.hoisted(() => ({ order: {} as Record<string, unknown> }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ currency: 'GBP', brand: { name: 'Northbound Supply', links: {} } }) }));
vi.mock('@/features/account/queries.ts', () => ({
  useOrder: () => ({ data: h.order, isPending: false, isError: false }),
}));

afterEach(cleanup);
const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider env="test"><MemoryRouter>{ui}</MemoryRouter></MantineProvider>
    </QueryClientProvider>,
  );

const point = {
  id: '12345', carrier: 'inpost', name: 'Tesco Express', street: 'Kirkgate', houseNumber: '14', postalCode: 'LS1 6BY',
  city: 'Leeds', country: 'GB', latitude: null, longitude: null, distance: 300,
};

describe('ReviewStep address slip', () => {
  const review = (form: typeof DEFAULT_FORM) =>
    wrap(<ReviewStep form={form} quote={undefined} method={undefined} combo={null} order={['contact', 'address', 'shipping', 'payment', 'review']} onEdit={() => {}} />);

  it('a collection shows the point, not the home address the shopper typed earlier', () => {
    review({ ...DEFAULT_FORM, country: 'GB', addressLine1: '1 Home Street', city: 'York', zip: 'YO1 1AA', deliveryMethod: 'collection', servicePoint: point });
    expect(screen.getByText('Collect from')).toBeTruthy();
    expect(screen.getByText('Tesco Express')).toBeTruthy();
    expect(screen.getByText(/Kirkgate 14/)).toBeTruthy();
    expect(screen.queryByText('1 Home Street')).toBeNull();
  });
  it('a point with no street shows its name once', () => {
    review({ ...DEFAULT_FORM, country: 'GB', deliveryMethod: 'collection', servicePoint: { ...point, street: '', houseNumber: '' } });
    expect(screen.getAllByText('Tesco Express')).toHaveLength(1);
  });
  it('a home delivery shows the home address even when a point is remembered', () => {
    review({ ...DEFAULT_FORM, country: 'GB', addressLine1: '1 Home Street', city: 'York', zip: 'YO1 1AA', servicePoint: point });
    expect(screen.getByText('1 Home Street')).toBeTruthy();
    expect(screen.queryByText('Collect from')).toBeNull();
  });
});

describe('account order heading', () => {
  const base = {
    reference: 'NB-1001', totalAmount: 25, outstandingBalance: 0, createdAt: '2026-01-02T10:00:00Z', status: 'pending',
    subtotal: 20, shippingAmount: 5, discountAmount: 0, items: [], payments: [], shipments: []
  };
  it('says which point a collection order goes to', () => {
    h.order = { ...base, servicePoint: { name: 'Tesco Express', carrier: 'inpost' } };
    wrap(<OrderDetailPage />);
    expect(screen.getByText('Collect from Tesco Express')).toBeTruthy();
  });
  it('says nothing for a home delivery or an older backend', () => {
    h.order = base;
    wrap(<OrderDetailPage />);
    expect(screen.queryByText(/Collect from/)).toBeNull();
    cleanup();
    h.order = { ...base, servicePoint: null };
    wrap(<OrderDetailPage />);
    expect(screen.queryByText(/Collect from/)).toBeNull();
  });
});
