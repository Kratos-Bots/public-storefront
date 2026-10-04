import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { OrderLinkRedirect } from '@/app/OrderLinkRedirect.tsx';

afterEach(cleanup);

const Where = () => <p data-testid="at">{useLocation().pathname}</p>;
const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/order/:ref/:accessKey" element={<OrderLinkRedirect />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

describe('an old order link', () => {
  it('goes to the account order page for that reference and drops the key', () => {
    open('/order/K4M2QP/abcdef0123456789');
    expect(screen.getByTestId('at').textContent).toBe('/account/orders/K4M2QP');
  });
  it('keeps a reference that needs encoding intact', () => {
    open('/order/A%2F1/key');
    expect(screen.getByTestId('at').textContent).toBe('/account/orders/A%2F1');
  });
});
