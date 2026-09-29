import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { Notice, StorefrontSettings } from '@/types/settings.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

import { NoticeBanners, isDismissible } from '@/features/notices/NoticeBanners.tsx';

const STORAGE_KEY = 'sf-dismissed-notices-v1';

function notice(id: string, extra: Partial<Notice> = {}): Notice {
  return { id, style: 'info', title: `Title ${id}`, body: `Body ${id}`, startsAt: null, endsAt: null, active: true, ...extra };
}

function mount(notices: Notice[], pinned?: boolean) {
  state.settings = { notices } as StorefrontSettings;
  return render(
    <MantineProvider env="test">
      <NoticeBanners pinned={pinned} />
    </MantineProvider>,
  );
}

const pinH = () => document.documentElement.style.getPropertyValue('--sf-pin-h');

// jsdom lays nothing out, so every offsetHeight is 0; give the stack a height to publish.
const heightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 42 });
});
afterAll(() => {
  if (heightDescriptor) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', heightDescriptor);
});

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.style.removeProperty('--sf-pin-h');
});

describe('NoticeBanners pinned split', () => {
  const NOTICES = [notice('a', { pinned: true }), notice('b'), notice('c', { pinned: false })];

  it('the pinned stack shows only pinned notices', () => {
    mount(NOTICES, true);
    const aside = screen.getByRole('complementary', { name: 'Pinned store notices' });
    expect(aside).toHaveAttribute('data-sf-part', 'pinned-notices');
    expect(screen.getByText('Body a')).toBeInTheDocument();
    expect(screen.queryByText('Body b')).toBeNull();
    expect(screen.queryByText('Body c')).toBeNull();
  });

  it('the plain stack shows only the unpinned ones (absent pinned counts as unpinned)', () => {
    mount(NOTICES);
    const aside = screen.getByRole('complementary', { name: 'Store notices' });
    expect(aside).not.toHaveAttribute('data-sf-part');
    expect(screen.queryByText('Body a')).toBeNull();
    expect(screen.getByText('Body b')).toBeInTheDocument();
    expect(screen.getByText('Body c')).toBeInTheDocument();
  });

  it('renders nothing when the side has no live notices', () => {
    mount([notice('b'), notice('p', { pinned: true, active: false })], true);
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});

describe('NoticeBanners dismissal', () => {
  it('isDismissible defaults to true when the flag is absent', () => {
    expect(isDismissible(notice('x'))).toBe(true);
    expect(isDismissible(notice('x', { dismissible: true }))).toBe(true);
    expect(isDismissible(notice('x', { dismissible: false }))).toBe(false);
  });

  it('a notice without the flag can be dismissed, and the dismissal persists', () => {
    mount([notice('a'), notice('b')]);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss: Title a' }));
    expect(screen.queryByText('Body a')).toBeNull();
    expect(screen.getByText('Body b')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual(['a']);

    cleanup();
    mount([notice('a'), notice('b')]);
    expect(screen.queryByText('Body a')).toBeNull();
    expect(screen.getByText('Body b')).toBeInTheDocument();
  });

  it('an untitled notice gets a generic dismiss label', () => {
    mount([notice('a', { title: null })]);
    expect(screen.getByRole('button', { name: 'Dismiss notice' })).toBeInTheDocument();
  });

  it('dismissible false: no close button', () => {
    mount([notice('a', { dismissible: false })]);
    expect(screen.getByText('Body a')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('dismissible false: still shows even when its id was stored as dismissed', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['a', 'b']));
    mount([notice('a', { dismissible: false }), notice('b')]);
    expect(screen.getByText('Body a')).toBeInTheDocument();
    expect(screen.queryByText('Body b')).toBeNull(); // a dismissible one stays dismissed
  });

  it('dismissible false works in the pinned stack too', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['a']));
    mount([notice('a', { pinned: true, dismissible: false })], true);
    expect(screen.getByText('Body a')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('NoticeBanners --sf-pin-h', () => {
  it('publishes the pinned stack height while it shows, and clears it on unmount', () => {
    const view = mount([notice('a', { pinned: true })], true);
    expect(pinH()).toBe('42px');
    view.unmount();
    expect(pinH()).toBe('');
  });

  it('clears it once the last pinned notice is dismissed', () => {
    mount([notice('a', { pinned: true })], true);
    expect(pinH()).toBe('42px');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss: Title a' }));
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(pinH()).toBe('');
  });

  it('is not set when no pinned notice is visible', () => {
    mount([notice('b')], true);
    expect(pinH()).toBe('');
  });

  it('the unpinned stack never sets it', () => {
    mount([notice('b')]);
    expect(screen.getByText('Body b')).toBeInTheDocument();
    expect(pinH()).toBe('');
  });
});
