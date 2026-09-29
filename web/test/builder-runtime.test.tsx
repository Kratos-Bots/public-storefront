import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { z } from 'zod';
import type { ReactNode } from 'react';
import type { PageSet, PuckDoc } from '@/builder/types.ts';

const fetched = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('@/api/pages.ts', () => ({ fetchPageSet: fetched.fn }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ brand: { name: 'Northbound Supply', title: 'Northbound Supply' } }) }));
vi.mock('@/app/layout.ts', () => ({ useEffectiveLayout: () => 'storefront' }));
vi.mock('@/builder/registry.ts', async () => {
  const { defineBlock } = await import('@/builder/define.ts');
  return {
    BLOCKS: {
      Text: defineBlock<{ id: string; text: string }>({ name: 'Text', label: 'Text', category: 'content', layouts: 'all', routeBound: false, slots: [], schema: z.object({ text: z.string() }), defaultProps: { text: '' }, render: ({ text }) => <p>{text}</p> }),
      CheckoutFlow: defineBlock<{ id: string }>({ name: 'CheckoutFlow', label: 'Checkout flow', category: 'commerce', layouts: 'all', routeBound: true, slots: [], schema: z.object({}), defaultProps: {}, render: () => <p>checkout flow</p> }),
    },
  };
});
const DEFAULT_CHECKOUT: PuckDoc = { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [{ type: 'CheckoutFlow', props: { id: 'CheckoutFlow-default' } }] };
vi.mock('@/builder/defaults/index.ts', () => ({ defaultDoc: (key: string) => (key === 'checkout' ? DEFAULT_CHECKOUT : null) }));

import { PageSetOverrideProvider, pagesKey, PuckPage, usePageSet } from '@/builder/runtime.tsx';
import type { RouteKey } from '@/builder/types.ts';

const root = (title = '') => ({ props: { title, description: '', chrome: 'shell' as const } });
const set = (pages: PageSet['pages']): PageSet => ({ schemaVersion: 1, shell: { root: root(), content: [] }, pages });

function mount(routeKey: RouteKey, pageSet: PageSet | null | undefined, extra: ReactNode = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/', element: <p>home</p> },
    { path: '/x', element: <><PuckPage routeKey={routeKey} />{extra}<Link to="/">leave</Link></> },
  ], { initialEntries: ['/x'] });
  const tree = <RouterProvider router={router} />;
  render(
    <QueryClientProvider client={client}>
      {pageSet === undefined ? tree : <PageSetOverrideProvider pageSet={pageSet}>{tree}</PageSetOverrideProvider>}
    </QueryClientProvider>,
  );
  return { client, router };
}

afterEach(() => { cleanup(); fetched.fn.mockReset(); vi.restoreAllMocks(); document.title = ''; });

describe('PuckPage', () => {
  it('renders the default document when there is no published set', () => {
    mount('checkout', null);
    expect(screen.getByText('checkout flow')).toBeInTheDocument();
  });
  it('renders a valid published document', () => {
    mount('checkout', set({ checkout: { root: root(), content: [{ type: 'Text', props: { id: 't', text: 'Owner note' } }, { type: 'CheckoutFlow', props: { id: 'c' } }] } }));
    expect(screen.getByText('Owner note')).toBeInTheDocument();
    expect(screen.getByText('checkout flow')).toBeInTheDocument();
  });
  it('falls back to the default when the published document breaks a rule', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount('checkout', set({ checkout: { root: root(), content: [{ type: 'Text', props: { id: 't', text: 'No flow' } }] } }));
    expect(screen.queryByText('No flow')).toBeNull();
    expect(screen.getByText('checkout flow')).toBeInTheDocument();
  });
  it('redirects home for a custom page that is not in the set', async () => {
    mount('page:missing', set({}));
    expect(await screen.findByText('home')).toBeInTheDocument();
  });
  it('sets the root title and restores the brand title on the way out', async () => {
    const { router } = mount('page:our-story', set({ 'page:our-story': { root: root('Our story'), content: [{ type: 'Text', props: { id: 't', text: 'Since 2019' } }] } }));
    expect(screen.getByText('Since 2019')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Our story'));
    await act(() => router.navigate('/'));
    expect(document.title).toBe('Northbound Supply');
  });
});

describe('usePageSet', () => {
  function Probe() {
    const { pageSet, isLoading } = usePageSet('storefront');
    return <p>{isLoading ? 'loading' : pageSet ? 'published' : 'none'}</p>;
  }
  it('fetches once per layout and reports the set', async () => {
    fetched.fn.mockResolvedValue(set({}));
    mount('checkout', undefined, <Probe />);
    expect(await screen.findByText('published')).toBeInTheDocument();
    expect(fetched.fn).toHaveBeenCalledWith('storefront');
  });
  it('shows the skeleton, not the default page, while the published set is loading', () => {
    fetched.fn.mockReturnValue(new Promise(() => {}));
    mount('checkout', undefined, <Probe />);
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('checkout flow')).toBeNull();
  });
  it('never shows the skeleton under an override', () => {
    mount('checkout', null);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('checkout flow')).toBeInTheDocument();
  });
  it('treats a failed fetch as no published set', async () => {
    fetched.fn.mockResolvedValue(null);
    mount('checkout', undefined, <Probe />);
    expect(await screen.findByText('none')).toBeInTheDocument();
    expect(screen.getByText('checkout flow')).toBeInTheDocument();
  });
  it('never fetches under an override', () => {
    mount('checkout', null, <Probe />);
    expect(screen.getByText('none')).toBeInTheDocument();
    expect(fetched.fn).not.toHaveBeenCalled();
  });
  it('does not refetch on window focus (a publish must not swap a page mid-checkout)', async () => {
    fetched.fn.mockResolvedValue(set({}));
    const { client } = mount('checkout', undefined, <Probe />);
    await screen.findByText('published');
    const query = client.getQueryCache().find({ queryKey: pagesKey('storefront') })!;
    expect(query.observers[0]!.options.refetchOnWindowFocus).toBe(false);
  });
});
