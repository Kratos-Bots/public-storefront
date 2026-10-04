import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Suspense } from 'react';

vi.mock('@/features/payment-redirect/PaymentSuccessPage.tsx', () => ({ PaymentSuccessPage: () => <p>payment success page</p> }));
vi.mock('@/features/payment-redirect/PaymentCancelPage.tsx', () => ({ PaymentCancelPage: () => <p>payment cancel page</p> }));
vi.mock('@/features/payment-redirect/OrderPlacedPage.tsx', () => ({ OrderPlacedPage: () => <p>order placed page</p> }));
vi.mock('@/features/verify/VerifyPage.tsx', () => ({ VerifyPage: () => <p>verify page</p> }));
vi.mock('@/features/tracking/TrackingPage.tsx', () => ({ TrackingPage: () => <p>tracking page</p> }));

import { RenderDoc } from '@/builder/render.tsx';
import { defaultDoc } from '@/builder/defaults/index.ts';
import type { FixedRouteKey } from '@/builder/types.ts';

afterEach(cleanup);

describe('post-order default documents', () => {
  it.each<[FixedRouteKey, string]>([
    ['payment-success', 'payment success page'], ['payment-cancel', 'payment cancel page'],
    ['order-placed', 'order placed page'], ['verify', 'verify page'], ['tracking', 'tracking page'],
  ])('%s renders its page', async (key, text) => {
    render(<MemoryRouter><Suspense fallback={null}><RenderDoc doc={defaultDoc(key, 'menu')!} docKey={key} layout="menu" /></Suspense></MemoryRouter>);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });
  it('every post-order page keeps the shop shell', () => {
    for (const key of ['payment-success', 'payment-cancel', 'order-placed', 'verify', 'tracking'] as const) {
      expect(defaultDoc(key, 'storefront')!.root.props.chrome).toBe('shell');
    }
  });
});
