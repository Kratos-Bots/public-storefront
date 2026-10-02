import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';

const signOut = vi.hoisted(() => ({ signOutAndReload: vi.fn(async () => undefined) }));
vi.mock('@/features/auth/sign-out.ts', () => signOut);
const profile = vi.hoisted(() => ({ fetchProfile: vi.fn() }));
vi.mock('@/api/profile.ts', () => profile);

import { LockedPage } from '@/features/access/LockedPage.tsx';
import { SETTINGS_KEY } from '@/app/settings.ts';
import { accessGate } from '@/app/access-gate.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

let client: QueryClient;

function settings(access: Record<string, unknown> = {}): StorefrontSettings {
  return {
    enabled: true,
    closedMessage: '',
    supportLinks: [],
    brand: {
      name: 'Example Shop', shortName: 'EXAMPLE', tagline: '', title: 'Example Shop', description: '',
      logoUrl: null, faviconUrl: null, logoHeight: 28,
      links: { whatsapp: null, telegram: null },
    },
    access: {
      storefront: 'restricted',
      registration: true,
      deniedMessage: 'Members only.\nAsk us for an invite.',
      deniedButtons: [{ label: 'Message us', url: 'https://t.me/example' }],
      ...access,
    },
  } as unknown as StorefrontSettings;
}

function renderLocked(variant: 'denied' | 'closed', access: Record<string, unknown> = {}) {
  client.setQueryData(SETTINGS_KEY, settings(access));
  return render(
    <QueryClientProvider client={client}>
      <MantineProvider env="test">
        <MemoryRouter>
          <LockedPage variant={variant} />
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  cleanup();
  signOut.signOutAndReload.mockClear();
  profile.fetchProfile.mockReset();
  accessGate.getState().reset();
});

describe('LockedPage', () => {
  it("shows the owner's message and buttons to a customer who is not allowed", () => {
    renderLocked('denied');
    expect(screen.getByText(/Members only\./)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Message us' });
    expect(link).toHaveAttribute('href', 'https://t.me/example');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'My orders' })).toHaveAttribute('href', '/account/orders');
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('falls back to the built-in message when the owner set none', () => {
    renderLocked('denied', { deniedMessage: '' });
    expect(screen.getByText('This shop is private. Get in touch if you’d like access.')).toBeInTheDocument();
  });

  it('shows the owner message as plain text, never as markup', () => {
    renderLocked('denied', { deniedMessage: '<b>bold</b>' });
    expect(screen.getByText('<b>bold</b>')).toBeInTheDocument();
  });

  it('offers no account actions on the closed variant', () => {
    renderLocked('closed');
    expect(screen.queryByRole('link', { name: 'My orders' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Message us' })).toBeInTheDocument();
  });

  it('renders no button row when the owner set no buttons', () => {
    renderLocked('denied', { deniedButtons: [] });
    expect(screen.queryByRole('navigation', { name: 'Contact the shop' })).toBeNull();
  });

  describe('"Check again" asks the profile before letting anyone in', () => {
    async function checkAgain() {
      accessGate.getState().setDenied(true);
      const invalidate = vi.spyOn(client, 'invalidateQueries');
      renderLocked('denied');
      fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
      return invalidate;
    }

    it('stays locked, and invalidates nothing, while the customer is still not allowed', async () => {
      profile.fetchProfile.mockResolvedValue({ shopAccess: false });
      const invalidate = await checkAgain();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Check again' })).not.toBeDisabled());
      expect(profile.fetchProfile).toHaveBeenCalledOnce();
      expect(accessGate.getState().denied).toBe(true);
      expect(invalidate).not.toHaveBeenCalled();
    });

    it('lets the customer in and refetches once they are allowed', async () => {
      profile.fetchProfile.mockResolvedValue({ shopAccess: true });
      const invalidate = await checkAgain();
      await waitFor(() => expect(accessGate.getState().denied).toBe(false));
      expect(invalidate).toHaveBeenCalled();
    });

    it('lets the customer in when an older backend does not say', async () => {
      profile.fetchProfile.mockResolvedValue({});
      const invalidate = await checkAgain();
      await waitFor(() => expect(accessGate.getState().denied).toBe(false));
      expect(invalidate).toHaveBeenCalled();
    });

    it('stays locked when the probe fails', async () => {
      profile.fetchProfile.mockRejectedValue(new Error('boom'));
      const invalidate = await checkAgain();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Check again' })).not.toBeDisabled());
      expect(accessGate.getState().denied).toBe(true);
      expect(invalidate).not.toHaveBeenCalled();
      expect(screen.queryByText(/boom/)).toBeNull();
    });

    it('is disabled and busy while the probe is pending', async () => {
      let resolve!: (v: unknown) => void;
      profile.fetchProfile.mockReturnValue(new Promise((r) => { resolve = r; }));
      await checkAgain();
      const button = screen.getByRole('button', { name: 'Check again' });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
      await act(async () => { resolve({ shopAccess: false }); });
      expect(button).not.toBeDisabled();
    });
  });

  it('"Sign out" runs the shared sign-out and disables itself while it runs', () => {
    signOut.signOutAndReload.mockImplementationOnce(() => new Promise(() => undefined));
    renderLocked('denied');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut.signOutAndReload).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDisabled();
  });
});
