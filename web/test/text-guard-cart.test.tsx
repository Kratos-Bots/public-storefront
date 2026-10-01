import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { TextLayerProvider } from '@/text/runtime.tsx';

vi.mock('@/app/settings.ts', async (orig) => ({ ...(await orig<typeof import('@/app/settings.ts')>()), useSettings: () => ({ currency: 'GBP', features: { guestCheckout: true, layout: 'storefront' } }) }));
import { CartSummary } from '@/features/cart/CartSummary.tsx';
import { useCartStore } from '@/stores/cart.ts';

afterEach(cleanup);
describe('cart wording follows published text', () => {
  it('the summary ledger uses the plural and subtotal keys', () => {
    useCartStore.setState({ lines: [{ productId: 1, quantity: 1, unitPrice: 2, basePrice: 2, displayName: 'Oats', sku: 'O', pricingTiers: [], isPreorder: false, excludedFromFreeShipping: false, imageProductId: null }] });
    render(<MemoryRouter><TextLayerProvider text={{ locale: 'en', formatLocale: '', shared: { 'common.totals.subtotal': 'Sub-total', 'cart.summary.items': { one: '{count} thing', other: '{count} things' } }, layout: {} }}><CartSummary blocked={false} /></TextLayerProvider></MemoryRouter>);
    expect(screen.getByText('Sub-total')).toBeInTheDocument();
    expect(screen.getByText('1 thing')).toBeInTheDocument();
  });
});
