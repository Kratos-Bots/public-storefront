import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { LocalLine } from '@/stores/cart.ts';
import type { ServerCart, ServerCartLine } from '@/types/cart.ts';
import type { Product } from '@/types/catalog.ts';
import type { Quote } from '@/types/checkout.ts';
import type { PublicOrder } from '@/types/public-order.ts';

vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ currency: 'GBP', features: { ordering: true, guestCheckout: false, layout: 'storefront' } }) as unknown as StorefrontSettings,
}));

import { PromoBadge } from '@/features/catalog/PromoBadge.tsx';
import { ProductCard } from '@/features/catalog/ProductCard.tsx';
import { CartLine } from '@/features/cart/CartLine.tsx';
import { CartSummary } from '@/features/cart/CartSummary.tsx';
import { QuoteSummary } from '@/features/checkout/QuoteSummary.tsx';
import { ItemsCard } from '@/features/order-status/ItemsCard.tsx';
import { publicOrderPromotions } from '@/lib/promotions.ts';
import { resetCartSync, setPreviewServerCart } from '@/features/cart/useServerCart.ts';
import { useCartStore } from '@/stores/cart.ts';
import { baseProduct } from './helpers/product-fixtures.ts';

const wrap = (ui: ReactNode) => render(<MantineProvider env="test"><MemoryRouter>{ui}</MemoryRouter></MantineProvider>);

beforeEach(() => {
  resetCartSync();
  useCartStore.setState({ lines: [], mode: 'local' });
});
afterEach(cleanup);

const tea = (o: Partial<Product> = {}) => baseProduct({ displayName: 'Assam Tea', ...o });
const THREE_FOR_TWO = { id: 1, label: '3 for 2 on all teas' };

describe('PromoBadge', () => {
  it('draws nothing without a promotion', () => {
    const { container } = wrap(<PromoBadge promotions={undefined} />);
    expect(container.querySelector('[data-sf-part="badge"]')).toBeNull();
  });
  it('shows the one label alone', () => {
    wrap(<PromoBadge promotions={[THREE_FOR_TWO]} />);
    expect(screen.getByText('3 for 2 on all teas')).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).toBeNull();
  });
  it('shows the first label and +N, with every label reachable', () => {
    wrap(<PromoBadge promotions={[THREE_FOR_TWO, { id: 2, label: 'Free delivery' }, { id: 3, label: 'Summer sale' }]} />);
    expect(screen.getByText('3 for 2 on all teas')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.queryByText('Free delivery')).toBeNull();
    expect(screen.getByLabelText('3 for 2 on all teas, Free delivery, Summer sale')).toBeInTheDocument();
  });
});

describe('ProductCard badge', () => {
  it('carries the promotion in the flags slot', () => {
    wrap(<ProductCard product={tea({ promotions: [THREE_FOR_TWO] })} />);
    expect(screen.getByText('3 for 2 on all teas')).toBeInTheDocument();
  });
  it('is unchanged for a product with no promotions field (older backend)', () => {
    const { container } = wrap(<ProductCard product={tea()} />);
    expect(container.querySelector('[data-sf-part="badge"]')).toBeNull();
  });
});

const local = (o: Partial<LocalLine> = {}): LocalLine => ({
  productId: 7, displayName: 'Assam Tea', sku: 'TEA-1', unitPrice: 12.5, basePrice: 12.5, pricingTiers: [], quantity: 3,
  isPreorder: false, excludedFromFreeShipping: false, imageProductId: null, ...o,
});
const serverLine = (o: Partial<ServerCartLine> = {}): ServerCartLine => ({
  productId: 7, name: 'Assam Tea', quantity: 3, unitPrice: 12.5, lineTotal: 37.5, imageUrl: null, isPreorder: false, outOfStock: false,
  priceChanged: false, inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null, ...o,
});
const mountLine = (l: LocalLine, server?: ServerCartLine) =>
  wrap(<ul><CartLine line={l} {...(server ? { server } : {})} onQuantity={vi.fn()} onRemove={vi.fn()} /></ul>);

describe('CartLine promotions', () => {
  it('keeps the optimistic display until the server line arrives', () => {
    mountLine(local());
    expect(screen.getByText('£37.50')).toBeInTheDocument();
    expect(screen.queryByText('3 for 2 on all teas')).toBeNull();
  });
  it('strikes the line total and shows the label and the discounted total from the server figures', () => {
    mountLine(local(), serverLine({ promotionDiscount: 12.5, promotions: [THREE_FOR_TWO] }));
    expect(screen.getByText('£37.50').tagName).toBe('S');
    expect(screen.getByText('£25.00')).toBeInTheDocument();
    expect(screen.getByText('3 for 2 on all teas')).toBeInTheDocument();
  });
  it('reads a fully free line as Free, not £0.00', () => {
    mountLine(local({ quantity: 1, unitPrice: 12.5 }), serverLine({ quantity: 1, lineTotal: 12.5, promotionDiscount: 12.5, promotions: [{ id: 9, label: 'Free tea' }] }));
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.queryByText('£0.00')).toBeNull();
  });
  it('ignores a server line with a zero discount', () => {
    mountLine(local(), serverLine({ promotionDiscount: 0, promotions: [] }));
    expect(screen.getByText('£37.50').tagName).not.toBe('S');
  });
});

const CART: ServerCart = {
  items: [serverLine({ promotionDiscount: 12.5, promotions: [THREE_FOR_TWO] })],
  subtotal: 37.5, itemCount: 3, promotionDiscount: 12.5, total: 25,
  promotions: [{ ...THREE_FOR_TWO, amount: 12.5 }],
  nudge: { promotionId: 5, label: '5% off orders over £100', kind: 'spend', missing: 75 },
};

describe('CartSummary promotions', () => {
  const mountSummary = () => wrap(<CartSummary />);
  beforeEach(() => useCartStore.setState({ lines: [local()], mode: 'server' }));

  it('shows the plain subtotal before the server has priced anything', () => {
    mountSummary();
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.queryByText('Basket after promotions')).toBeNull();
  });
  it('adds a row per promotion, the basket after promotions and the nudge sentence', () => {
    act(() => setPreviewServerCart(CART));
    mountSummary();
    expect(screen.getByText('3 for 2 on all teas')).toBeInTheDocument();
    expect(screen.getByText('−£12.50')).toBeInTheDocument();
    expect(screen.getByText('Basket after promotions')).toBeInTheDocument();
    expect(screen.getByText('£25.00')).toBeInTheDocument();
    expect(screen.getByText('Spend £75.00 more to get 5% off orders over £100')).toBeInTheDocument();
  });
  it('falls back to the optimistic subtotal the moment the shopper edits a line', () => {
    act(() => setPreviewServerCart(CART));
    mountSummary();
    act(() => useCartStore.getState().setQuantity(7, 4));
    expect(screen.queryByText('Basket after promotions')).toBeNull();
    expect(screen.queryByText('−£12.50')).toBeNull();
    expect(screen.getByText('£50.00')).toBeInTheDocument();
  });
  it('reads a free-shipping promotion beside a money one as "Free shipping: label", with no £0.00 row', () => {
    act(() => setPreviewServerCart({ ...CART, promotions: [...(CART.promotions ?? []), { id: 2, label: 'Free delivery over £20', amount: 0, freeShipping: true }] }));
    mountSummary();
    expect(screen.getByText('−£12.50')).toBeInTheDocument();
    expect(screen.getByText('Free shipping: Free delivery over £20')).toBeInTheDocument();
    expect(screen.queryByText('−£0.00')).toBeNull();
    expect(screen.getByText('Basket after promotions')).toBeInTheDocument();
  });
  it('still shows free shipping earned when it is the only promotion, without an after-promotions total', () => {
    act(() => setPreviewServerCart({ ...CART, nudge: null, promotionDiscount: 0, total: 37.5, promotions: [{ id: 2, label: 'Free delivery over £20', amount: 0, freeShipping: true }] }));
    mountSummary();
    expect(screen.getByText('Free shipping: Free delivery over £20')).toBeInTheDocument();
    expect(screen.queryByText('−£0.00')).toBeNull();
    expect(screen.queryByText('Basket after promotions')).toBeNull();
    expect(screen.getByText('£37.50')).toBeInTheDocument();
  });
  it('shows only the nudge when nothing applies yet', () => {
    act(() => setPreviewServerCart({ ...CART, promotionDiscount: 0, promotions: [], total: 37.5 }));
    mountSummary();
    expect(screen.getByText('Spend £75.00 more to get 5% off orders over £100')).toBeInTheDocument();
    expect(screen.queryByText('Basket after promotions')).toBeNull();
  });
});

const QUOTE = {
  items: [{ productId: 7, name: 'Assam Tea', sku: null, quantity: 3, unitPrice: 12.5, lineTotal: 37.5, tierApplied: false, isPreorder: false, promotionDiscount: 12.5, promotions: [THREE_FOR_TWO] }],
  subtotal: 37.5, coupon: { code: 'WELCOME', discountAmount: 2, shippingDiscount: 0, autoApplied: false },
  promotionDiscount: 12.5, promotions: [{ ...THREE_FOR_TWO, amount: 12.5, freeShipping: false }],
  shippingOptions: [], selectedShippingOptionId: 1, shippingAmount: 3, storeCredit: { balance: 0, applied: 0, remaining: 0 },
  grandTotal: 26, amountDue: 26, paymentMethods: [], contactModes: { phoneMode: 'optional', emailMode: 'required', defaultPhoneCountry: null },
} as unknown as Quote;

const quoteEl = (quote: Quote) => (
  <MantineProvider env="test"><MemoryRouter><QuoteSummary quote={quote} isFetching={false} stale={false} method={undefined} combo={null} defaultOpen /></MemoryRouter></MantineProvider>
);

describe('QuoteSummary promotions', () => {
  it('lists each promotion above the coupon row, and the coupon row keeps only its own amount', () => {
    const { container } = render(quoteEl(QUOTE));
    const labels = [...container.querySelectorAll('[class*="rowLabel"]')].map((e) => e.textContent ?? '');
    expect(labels.indexOf('3 for 2 on all teas')).toBeGreaterThan(-1);
    expect(labels.indexOf('3 for 2 on all teas')).toBeLessThan(labels.findIndex((l) => l.startsWith('Discount')));
    const rowText = (label: string) => screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === label && el.className.includes('rowLabel')).parentElement!.textContent;
    expect(rowText('3 for 2 on all teas')).toBe('3 for 2 on all teas−£12.50');
    expect(rowText('Discount WELCOME')).toBe('Discount WELCOME−£2.00'); // the coupon's own amount, not 14.50
  });
  it('strikes the discounted item and names its promotion', () => {
    render(quoteEl(QUOTE));
    const item = screen.getByText('Assam Tea').closest('li')!;
    expect(within(item).getByText('£37.50').tagName).toBe('S');
    expect(within(item).getByText('£25.00')).toBeInTheDocument();
    expect(within(item).getByText('3 for 2 on all teas')).toBeInTheDocument();
  });
  it('reads a free-shipping promotion with no amount as "Free shipping: label"', () => {
    render(quoteEl({ ...QUOTE, promotionDiscount: 0, promotions: [{ id: 4, label: 'Free delivery over £30', amount: 0, freeShipping: true }] }));
    expect(screen.getByText('Free shipping: Free delivery over £30')).toBeInTheDocument();
  });
  it('renders the nudge, and is unchanged for a quote without promotion fields', () => {
    const { unmount } = render(quoteEl({ ...QUOTE, nudge: { promotionId: 1, label: '3 for 2 on all teas', kind: 'quantity', missing: 1, target: 'buy' } }));
    expect(screen.getByText('Add 1 more to get 3 for 2 on all teas')).toBeInTheDocument();
    unmount();
    const legacy = { ...QUOTE } as Partial<Quote>;
    delete legacy.promotions; delete legacy.promotionDiscount; delete legacy.nudge;
    legacy.items = [{ ...QUOTE.items[0]!, promotionDiscount: undefined, promotions: undefined }];
    render(quoteEl(legacy as Quote));
    expect(screen.queryByText(/Add 1 more/)).toBeNull();
    expect(screen.queryByText('3 for 2 on all teas')).toBeNull();
    expect(screen.getAllByText('£37.50').length).toBeGreaterThan(0);
  });
});

const ORDER = {
  items: [{ productName: 'Assam Tea', quantity: 3, unitPrice: 12.5, totalPrice: 37.5, isPreorder: false, promotionDiscount: 12.5 }],
  totals: { subtotal: 37.5, shippingAmount: 3, discountAmount: 14.5, taxAmount: 0, totalAmount: 26 },
  promotionDiscount: 12.5, promotions: [{ label: '3 for 2 on all teas', amount: 12.5 }],
} as unknown as PublicOrder;

describe('ItemsCard promotions', () => {
  const mountItems = (o: PublicOrder) => wrap(<ItemsCard items={o.items} totals={o.totals} promotions={publicOrderPromotions(o)} currency="GBP" />);
  it('adds a promotion row and shows the discount row without the promotion part, so the rows add up', () => {
    mountItems(ORDER);
    expect(screen.getByText('3 for 2 on all teas')).toBeInTheDocument();
    expect(screen.getByText('− £12.50')).toBeInTheDocument();
    expect(screen.getByText('Discount')).toBeInTheDocument();
    expect(screen.getByText('− £2.00')).toBeInTheDocument(); // 14.50 − 12.50
  });
  it('hides the discount row when the promotions account for all of it', () => {
    mountItems({ ...ORDER, totals: { ...ORDER.totals, discountAmount: 12.5 } });
    expect(screen.queryByText('Discount')).toBeNull();
  });
  it('is unchanged for an order with no promotion fields', () => {
    const legacy = { items: [{ ...ORDER.items[0]!, promotionDiscount: undefined }], totals: ORDER.totals } as unknown as PublicOrder;
    mountItems(legacy);
    expect(screen.getByText('− £14.50')).toBeInTheDocument();
    expect(screen.queryByText('3 for 2 on all teas')).toBeNull();
  });
});
