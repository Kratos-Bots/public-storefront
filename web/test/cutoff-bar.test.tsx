import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { Cutoffs, DayKey, StorefrontSettings } from '@/types/settings.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

import { CutoffBar } from '@/features/notices/CutoffBar.tsx';

const DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function everyDay(enabled: boolean, cutoff = '15:00', shipsOn = 'same day'): Cutoffs {
  return {
    timezone: 'UTC',
    days: Object.fromEntries(DAYS.map((d) => [d, { enabled, cutoff, shipsOn }])) as Cutoffs['days'],
  };
}

function mount(cutoffs: Cutoffs, serverTime = '2026-08-23T10:48:00.000Z') {
  state.settings = { cutoffs, serverTime } as StorefrontSettings;
  return render(
    <MantineProvider env="test">
      <CutoffBar />
    </MantineProvider>,
  );
}

const rail = () => screen.queryByRole('region', { name: /dispatch cut-off/i });

afterEach(cleanup);

describe('CutoffBar', () => {
  it('announces the cut-off time and what it buys', () => {
    mount(everyDay(true));
    expect(rail()).toHaveTextContent('Order by 15:00 for same day');
  });

  it('counts down to the cut-off', () => {
    mount(everyDay(true));
    expect(rail()).toHaveTextContent('4h 12m left');
  });

  it('renders nothing when no cut-off is scheduled', () => {
    const { container } = mount(everyDay(false));
    expect(rail()).toBeNull();
    // Mantine injects its own <style> tags into the container, so assert on the bar itself.
    expect(container.querySelector('section')).toBeNull();
  });

  it('names the day when the next cut-off is not today', () => {
    const cutoffs = everyDay(false);
    cutoffs.days.wed = { enabled: true, cutoff: '15:00', shipsOn: 'same day' };
    mount(cutoffs); // 2026-08-23 is a Sunday
    expect(rail()).toHaveTextContent('Wed');
    expect(rail()).toHaveTextContent('Order by 15:00 for same day');
  });
});
