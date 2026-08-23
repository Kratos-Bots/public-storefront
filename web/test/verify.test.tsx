import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StorefrontSettings } from '@/types/settings.ts';

const state = vi.hoisted(() => ({
  settings: { brand: { links: { whatsapp: null, telegram: null } } } as unknown as StorefrontSettings,
}));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

vi.mock('@/api/verify.ts', () => ({ verifyProductUnit: vi.fn() }));

import { verifyProductUnit } from '@/api/verify.ts';
import { ApiError } from '@/lib/errors.ts';
import { VerifyPage } from '@/features/verify/VerifyPage.tsx';

const verifyMock = vi.mocked(verifyProductUnit);

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  verifyMock.mockReset();
  state.settings = {
    brand: { links: { whatsapp: null, telegram: null } },
  } as unknown as StorefrontSettings;
});

afterEach(cleanup);

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MantineProvider env="test">
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/verify']}>{children}</MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>
  );
}

function mount() {
  return render(
    <Wrapper>
      <VerifyPage />
    </Wrapper>,
  );
}

function fillAndSubmit(code = 'AB3D-SKU12', auth = '123456') {
  fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: code } });
  fireEvent.change(screen.getByLabelText(/authentication code/i), { target: { value: auth } });
  fireEvent.click(screen.getByRole('button', { name: /verify product/i }));
}

describe('VerifyPage', () => {
  it('renders the verification form', () => {
    mount();
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/authentication code/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verify product/i })).toBeInTheDocument();
  });

  it('shows the authentic-product card with both dates on a verified result', async () => {
    verifyMock.mockResolvedValue({
      status: 'verified',
      data: { createdAt: '2026-01-15T00:00:00.000Z', expiryDate: '2027-01-15T00:00:00.000Z' },
    });
    mount();
    fillAndSubmit();

    expect(await screen.findByText(/authentic product/i)).toBeInTheDocument();
    expect(screen.getByText('15 Jan 2026')).toBeInTheDocument();
    expect(screen.getByText('15 Jan 2027')).toBeInTheDocument();
    expect(verifyMock).toHaveBeenCalledWith('AB3D-SKU12', 123456);
  });

  it('shows "Not Verified" when the backend answers 404 (invalid)', async () => {
    verifyMock.mockResolvedValue({ status: 'invalid' });
    mount();
    fillAndSubmit();
    expect(await screen.findByText(/not verified/i)).toBeInTheDocument();
  });

  it('shows "Connection Error" when the lookup throws', async () => {
    verifyMock.mockRejectedValue(new ApiError(0, 'Network error'));
    mount();
    fillAndSubmit();
    expect(await screen.findByText(/connection error/i)).toBeInTheDocument();
  });

  it('resets to idle when a field is edited after a verdict', async () => {
    verifyMock.mockResolvedValue({ status: 'invalid' });
    mount();
    fillAndSubmit();
    await screen.findByText(/not verified/i);

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: 'AB3D-SKU13' } });

    expect(screen.queryByText(/not verified/i)).toBeNull();
  });
});
