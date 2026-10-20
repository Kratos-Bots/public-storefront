import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { SETTINGS_KEY, queryClient } from '@/lib/query-client.ts';
import { resetWarehouseStore, useWarehouseStore } from '@/features/warehouses/store.ts';
import { QuoteSummary } from '@/features/checkout/QuoteSummary.tsx';
import UnpaidOrderDialog from '@/features/unpaid-prompt/UnpaidOrderDialog.tsx';
import type { Quote } from '@/types/checkout.ts';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Warehouse } from '@/types/warehouses.ts';

const MAIN: Warehouse = { id: 1, name: 'Main', country: 'GB', isDefault: true, currency: 'GBP' };
const US: Warehouse = { id: 3, name: 'US', country: 'US', isDefault: false, currency: 'USD' };

const wrap = (ui: React.ReactNode) => render(
  <QueryClientProvider client={queryClient}><MantineProvider env="test"><MemoryRouter>{ui}</MemoryRouter></MantineProvider></QueryClientProvider>,
);

beforeEach(() => {
  localStorage.clear();
  resetWarehouseStore();
  queryClient.clear();
  queryClient.setQueryData(SETTINGS_KEY, { currency: 'GBP', features: { warehouseSelect: true }, access: { storefront: 'public' } } as unknown as StorefrontSettings);
  // The shopper has just switched to the USD warehouse.
  useWarehouseStore.setState({ warehouseId: 3, ctx: { enabled: true, list: [MAIN, US], failed: false, carried: null } });
});
afterEach(cleanup);

describe('which currency wins', () => {
  it('QuoteSummary shows the shown quote\'s currency (EUR) while the selected warehouse is USD', () => {
    const quote = {
      items: [], subtotal: 40, coupon: null, shippingOptions: [], selectedShippingOptionId: null, shippingAmount: 5,
      storeCredit: { balance: 0, applied: 0, remaining: 0 }, grandTotal: 45, amountDue: 45, paymentMethods: [], currency: 'EUR',
    } as unknown as Quote;
    const { container } = wrap(<QuoteSummary quote={quote} isFetching={false} stale={false} method={undefined} combo={null} defaultOpen />);
    expect(container.textContent).toContain('€45.00');
    expect(container.textContent).not.toContain('$');
  });

  it('an order screen shows the order\'s own currency (EUR), not the warehouse default (USD)', () => {
    const { baseElement } = wrap(
      <UnpaidOrderDialog order={{ reference: 'AB12CD', amount: 25, currency: 'EUR', reviewPath: '/account/orders/AB12CD' }} more={false} onLater={() => {}} onReview={() => {}} />,
    );
    expect(baseElement.textContent).toContain('€25.00');
    expect(baseElement.textContent).not.toContain('$25');
  });
});
