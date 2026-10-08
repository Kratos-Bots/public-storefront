// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, ScrollRestoration, useSearchParams, type RouteObject } from 'react-router';

/**
 * The scroll rules routes.tsx relies on: a new page goes to the top, and the product sheet's `?p=` change
 * (made with `preventScrollReset`, as ProductList does) leaves the list where it is.
 */

let setParams: ReturnType<typeof useSearchParams>[1];
function List() {
  [, setParams] = useSearchParams();
  return <p>list</p>;
}

const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <>
        <ScrollRestoration />
        <List />
      </>
    ),
  },
];

afterEach(() => vi.restoreAllMocks());

function mount() {
  const router = createMemoryRouter(routes, { initialEntries: ['/'] });
  const scrollTo = vi.spyOn(window, 'scrollTo');
  render(<RouterProvider router={router} />);
  scrollTo.mockClear();
  return { router, scrollTo };
}

describe('scroll reset', () => {
  it('goes to the top on a new page', async () => {
    const { router, scrollTo } = mount();
    await act(() => router.navigate('/?other=1'));
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('stays put when the sheet opens and closes with preventScrollReset', async () => {
    const { scrollTo } = mount();
    await act(async () => setParams(new URLSearchParams({ p: '101' }), { preventScrollReset: true }));
    await act(async () => setParams(new URLSearchParams(), { replace: true, preventScrollReset: true }));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
