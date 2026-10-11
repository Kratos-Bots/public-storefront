import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const h = vi.hoisted(() => ({ reviews: { enabled: true, maxLength: 500 } as undefined | { enabled: boolean; maxLength: number } }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ currency: 'GBP', reviews: h.reviews }) }));
vi.mock('@/app/builder-gate.ts', () => ({ isBuilderMode: vi.fn(() => false) }));
vi.mock('@/app/preview-listener.ts', () => ({ isPreviewMode: vi.fn(() => false) }));

import { isBuilderMode } from '@/app/builder-gate.ts';
import { isPreviewMode } from '@/app/preview-listener.ts';
import { ReviewsLink } from '@/layouts/ReviewsLink.tsx';

const mount = (path: string) => render(<MemoryRouter initialEntries={[path]}><ReviewsLink /></MemoryRouter>);
const link = () => screen.queryByRole('link', { name: 'Customer reviews' });

beforeEach(() => {
  h.reviews = { enabled: true, maxLength: 500 };
  vi.mocked(isBuilderMode).mockReturnValue(false);
  vi.mocked(isPreviewMode).mockReturnValue(false);
});
afterEach(cleanup);

describe('ReviewsLink', () => {
  it.each(['/', '/c/serums', '/p/12', '/cart', '/account/orders', '/reviews', '/pages/about'])('is shown on %s', (path) => {
    mount(path);
    expect(link()?.getAttribute('href')).toBe('/reviews');
  });
  it.each(['/checkout', '/payment/success', '/payment/cancel', '/order-placed', '/login', '/auth/telegram/callback', '/reset-password', '/account/orders/K4M2QP'])(
    'is hidden on %s', (path) => {
      mount(path);
      expect(link()).toBeNull();
    });
  it('is hidden in the page builder and in a theme preview', () => {
    vi.mocked(isBuilderMode).mockReturnValue(true);
    mount('/');
    expect(link()).toBeNull();
    cleanup();
    vi.mocked(isBuilderMode).mockReturnValue(false);
    vi.mocked(isPreviewMode).mockReturnValue(true);
    mount('/');
    expect(link()).toBeNull();
  });
  it.each([[{ enabled: false, maxLength: 0 }], [undefined]])('is hidden when reviews are off (%j)', (reviews) => {
    h.reviews = reviews;
    mount('/');
    expect(link()).toBeNull();
  });
});
