import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { Cutoffs, DayKey, StorefrontSettings, Theme } from '@/types/settings.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

import { CutoffBar, fillCutoffMessage } from '@/features/notices/CutoffBar.tsx';
import { TemplateProvider } from '@/templates/runtime.tsx';
import { resolveTheme } from '@/templates/resolve.ts';
import { lookupManifest } from '@/templates/registry.ts';
import type { OptionValues } from '@/templates/define.ts';
import type { TemplateModule } from '@/templates/slots.ts';

const DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function everyDay(enabled: boolean, cutoff = '15:00', shipsOn = 'same day'): Cutoffs {
  return {
    timezone: 'UTC',
    days: Object.fromEntries(DAYS.map((d) => [d, { enabled, cutoff, shipsOn }])) as Cutoffs['days'],
  };
}

const THEME: Theme = {
  scheme: 'dark',
  colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: null, body: null, mono: null }, radius: 'none', density: 'comfortable', customCss: '',
};
const MODULE: TemplateModule = { slots: {} };

function mount(cutoffs: Cutoffs, serverTime = '2026-08-23T10:48:00.000Z') {
  state.settings = { cutoffs, serverTime } as StorefrontSettings;
  return render(
    <MantineProvider env="test">
      <CutoffBar />
    </MantineProvider>,
  );
}

/** Mounted under a resolved theme, so the core options reach the bar through useCoreOptions. */
function mountWith(options: OptionValues, cutoffs: Cutoffs = everyDay(true), serverTime = '2026-08-23T10:48:00.000Z') {
  state.settings = { cutoffs, serverTime } as StorefrontSettings;
  const resolved = resolveTheme({ ...THEME, options }, lookupManifest);
  return render(
    <MantineProvider env="test">
      <TemplateProvider resolved={resolved} fallback={null} load={() => Promise.resolve(MODULE)} peek={() => MODULE}>
        <CutoffBar />
      </TemplateProvider>
    </MantineProvider>,
  );
}

const rail = () => screen.queryByRole('region', { name: /dispatch cut-off/i });

// The server clock offset is computed against Date.now(); freeze it at the mocked serverTime so a
// millisecond tick between mount and assertion can't straddle a minute boundary ("4h 11m left").
beforeEach(() => { vi.useFakeTimers({ now: Date.parse('2026-08-23T10:48:00Z'), toFake: ['Date'] }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

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

describe('CutoffBar core options', () => {
  const meter = () => rail()?.querySelector('[aria-hidden]') ?? null;

  it('defaults under a theme: the built-in wording, the countdown and the meter', () => {
    mountWith({});
    expect(rail()).toHaveTextContent('Order by 15:00 for same day dispatch');
    expect(rail()).toHaveTextContent('4h 12m left');
    expect(meter()).not.toBeNull();
    expect(rail()?.querySelector('time')).toHaveAttribute('datetime', '2026-08-23T15:00:00.000Z');
  });

  it('showCutoffBar false renders nothing even with a cut-off scheduled', () => {
    const { container } = mountWith({ showCutoffBar: false });
    expect(rail()).toBeNull();
    expect(container.querySelector('section')).toBeNull();
  });

  it('cutoffMessage replaces the sentence, filling {time} and {dispatch}', () => {
    mountWith({ cutoffMessage: 'Get it {dispatch} if you order before {time}!' });
    expect(rail()).toHaveTextContent('Get it same day if you order before 15:00!');
    expect(rail()).not.toHaveTextContent('Order by');
    // The time is still the styled, machine-readable <time>.
    expect(rail()?.querySelector('time')).toHaveTextContent('15:00');
    expect(rail()).toHaveTextContent('4h 12m left');
  });

  it('a blank (whitespace) cutoffMessage keeps the default wording', () => {
    mountWith({ cutoffMessage: '   ' });
    expect(rail()).toHaveTextContent('Order by 15:00 for same day dispatch');
  });

  it('cutoffMessage still follows the day label when the cut-off is not today', () => {
    const cutoffs = everyDay(false);
    cutoffs.days.wed = { enabled: true, cutoff: '15:00', shipsOn: 'same day' };
    mountWith({ cutoffMessage: 'Before {time}' }, cutoffs);
    expect(rail()).toHaveTextContent('Wed · Before 15:00');
  });

  it('showCutoffCountdown false drops the time left and the meter', () => {
    mountWith({ showCutoffCountdown: false });
    expect(rail()).toHaveTextContent('Order by 15:00 for same day dispatch');
    expect(rail()).not.toHaveTextContent('left');
    expect(meter()).toBeNull();
  });
});

describe('fillCutoffMessage', () => {
  it('swaps each placeholder, every occurrence, and leaves unknown braces as typed', () => {
    const { container } = render(
      <p>{fillCutoffMessage('{time} / {dispatch} / {time} / {other}', <b>T</b>, <i>D</i>)}</p>,
    );
    expect(container.textContent).toBe('T / D / T / {other}');
    expect(container.querySelectorAll('b')).toHaveLength(2);
    expect(container.querySelectorAll('i')).toHaveLength(1);
  });

  it('returns the text unchanged when there are no placeholders', () => {
    expect(fillCutoffMessage('Plain text', 'T', 'D')).toEqual(['Plain text']);
  });
});
