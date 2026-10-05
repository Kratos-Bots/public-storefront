import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, Link, RouterProvider, useNavigate } from 'react-router';
import { FixtureRoutes, fixtureLocation, useNavigationLock } from '@/builder/editor/fixture-routes.tsx';
import { useEditorStore } from '@/builder/editor/store.ts';

vi.mock('@/features/catalog/use-catalog.ts', () => ({ useCatalog: () => ({ data: undefined }) }));
import { FIXTURE_ORDER_REF } from '@/builder/editor/fixtures.ts';

function Harness() {
  useNavigationLock();
  const navigate = useNavigate();
  return (
    <div data-sf-builder-canvas="">
      <button onClick={() => navigate('/cart')}>leave</button>
      <button onClick={() => navigate('/__builder/doc/cart')}>stay</button>
      <Link to="/checkout">link out</Link>
      <a href="https://shop.example/elsewhere">external</a>
    </div>
  );
}

afterEach(cleanup);

function setup() {
  const router = createMemoryRouter(
    [{ path: '/__builder/*', element: <Harness /> }, { path: '*', element: <p>left the editor</p> }],
    { initialEntries: ['/__builder/doc/catalog'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('editor navigation lock', () => {
  it('blocks programmatic navigation out of /__builder but allows it within', async () => {
    const router = setup();
    await act(async () => fireEvent.click(screen.getByText('leave')));
    expect(router.state.location.pathname).toBe('/__builder/doc/catalog');
    await act(async () => fireEvent.click(screen.getByText('stay')));
    expect(router.state.location.pathname).toBe('/__builder/doc/cart');
  });

  it('swallows link clicks inside the canvas', async () => {
    const router = setup();
    await act(async () => { expect(fireEvent.click(screen.getByText('link out'))).toBe(false); });
    expect(router.state.location.pathname).toBe('/__builder/doc/catalog');
    expect(fireEvent.click(screen.getByText('external'))).toBe(false);
  });
});

describe('fixture locations', () => {
  it('gives param routes fixture params and everything else a stable path', () => {
    expect(fixtureLocation('product', 101)).toEqual({ pattern: 'p/:id', path: 'p/101' });
    expect(fixtureLocation('product', null)).toEqual({ pattern: 'p/:id', path: 'p/0' });
    expect(fixtureLocation('account.order', null)).toEqual({ pattern: 'account/orders/:ref', path: `account/orders/${FIXTURE_ORDER_REF}` });
    expect(fixtureLocation('page:about', null)).toEqual({ pattern: 'doc/:docKey', path: 'doc/page-about' });
    expect(fixtureLocation('account.orders', null)).toEqual({ pattern: 'doc/:docKey', path: 'doc/account.orders' });
  });
});

describe('FixtureRoutes', () => {
  it('keeps ?sf-builder=1 (and any other search) when it moves to the open doc fixture path', async () => {
    useEditorStore.setState({ docKey: 'cart' });
    const router = createMemoryRouter(
      [{ path: '/__builder/*', element: <FixtureRoutes><p>canvas</p></FixtureRoutes> }],
      { initialEntries: ['/__builder?sf-builder=1&x=2'] },
    );
    render(<RouterProvider router={router} />);
    await screen.findByText('canvas');
    expect(router.state.location.pathname).toBe('/__builder/doc/cart');
    expect(router.state.location.search).toBe('?sf-builder=1&x=2');
    await act(async () => useEditorStore.setState({ docKey: 'account.order' }));
    expect(router.state.location.pathname).toBe(`/__builder/account/orders/${FIXTURE_ORDER_REF}`);
    expect(router.state.location.search).toBe('?sf-builder=1&x=2');
  });
});
