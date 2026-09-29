import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { BuilderRoute } from '@/app/builder-route.tsx';

afterEach(cleanup);

describe('BuilderRoute', () => {
  it.each(['/__builder', '/__builder?sf-builder=1', '/__builder/doc/cart'])(
    'outside a builder frame, %s redirects to /',
    async (entry) => {
      const router = createMemoryRouter(
        [
          { path: '/__builder/*', element: <BuilderRoute /> },
          { path: '/', element: <p>shop home</p> },
        ],
        { initialEntries: [entry] },
      );
      render(<RouterProvider router={router} />);
      expect(await screen.findByText('shop home')).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/');
    },
  );
});
