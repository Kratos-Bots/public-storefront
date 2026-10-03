import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { MantineProvider } from '@mantine/core';

const profile = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('@/features/account/queries.ts', () => ({ useProfile: () => ({ data: profile.data }) }));

import { AccountLayout } from '@/features/account/AccountLayout.tsx';
import { accessGate } from '@/app/access-gate.ts';

function mount() {
  return render(
    <MantineProvider env="test">
      <MemoryRouter>
        <AccountLayout slots={{ head: Object.assign(() => null, { items: [] }) }}>
          <p>section</p>
        </AccountLayout>
      </MemoryRouter>
    </MantineProvider>,
  );
}

afterEach(() => {
  cleanup();
  accessGate.getState().reset();
});

describe('AccountLayout keeps the access gate in step with the profile', () => {
  it('marks the customer denied when the profile says shopAccess is false', () => {
    profile.data = { shopAccess: false, nickname: null, memberSince: '2026-01-01', totalOrders: 0 };
    mount();
    expect(accessGate.getState().denied).toBe(true);
  });

  it('clears a refusal when the profile says shopAccess is true', () => {
    accessGate.getState().setDenied(true);
    profile.data = { shopAccess: true, nickname: null, memberSince: '2026-01-01', totalOrders: 0 };
    mount();
    expect(accessGate.getState().denied).toBe(false);
  });

  it('leaves the gate alone when the profile does not say (older backend)', () => {
    accessGate.getState().setDenied(true);
    profile.data = { nickname: null, memberSince: '2026-01-01', totalOrders: 0 };
    mount();
    expect(accessGate.getState().denied).toBe(true);
  });
});
