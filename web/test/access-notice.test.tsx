import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));

import { AccessNotice } from '@/features/auth/AccessNotice.tsx';

const LEDE = 'Sign in to view the shop.';
const CLOSED = 'New accounts aren’t being opened right now.';
const DEFAULT_MESSAGE = 'This shop is private. Get in touch if you’d like access.';

function configure(access?: Record<string, unknown>) {
  h.settings = access ? { access: { deniedMessage: '', deniedButtons: [], ...access } } : {};
}

afterEach(cleanup);

describe('AccessNotice', () => {
  it('renders nothing without access settings', () => {
    configure();
    const { container } = render(<AccessNotice />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for a public shop with open registration', () => {
    configure({ storefront: 'public', registration: true });
    const { container } = render(<AccessNotice />);
    expect(container.innerHTML).toBe('');
  });

  it('login mode with open registration is the sign-in line only', () => {
    configure({ storefront: 'login', registration: true, deniedMessage: 'Ignored here' });
    render(<AccessNotice />);
    expect(screen.getByText(LEDE)).toBeTruthy();
    expect(screen.queryByText(CLOSED)).toBeNull();
    expect(screen.queryByText('Ignored here')).toBeNull();
    expect(screen.queryByText(DEFAULT_MESSAGE)).toBeNull();
  });

  it('restricted shows the lede, the owner’s message and the buttons', () => {
    configure({
      storefront: 'restricted', registration: true, deniedMessage: 'Ask us on chat.',
      deniedButtons: [{ label: 'Message us', url: 'https://example.invalid/chat' }],
    });
    render(<AccessNotice />);
    expect(screen.getByText(LEDE)).toBeTruthy();
    expect(screen.getByText('Ask us on chat.')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Message us' });
    expect(link.getAttribute('href')).toBe('https://example.invalid/chat');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('restricted with no message falls back to the default message', () => {
    configure({ storefront: 'restricted', registration: true });
    render(<AccessNotice />);
    expect(screen.getByText(DEFAULT_MESSAGE)).toBeTruthy();
  });

  it('public with closed registration says so, with the message and buttons, and no sign-in line', () => {
    configure({
      storefront: 'public', registration: false, deniedMessage: 'Invite only for now.',
      deniedButtons: [{ label: 'Request access', url: 'https://example.invalid/request' }],
    });
    render(<AccessNotice />);
    expect(screen.getByText(CLOSED)).toBeTruthy();
    expect(screen.getByText('Invite only for now.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Request access' })).toBeTruthy();
    expect(screen.queryByText(LEDE)).toBeNull();
  });

  it('restricted with closed registration shows lede, registration line, message and buttons in that order', () => {
    configure({
      storefront: 'restricted', registration: false, deniedMessage: 'Invite only for now.',
      deniedButtons: [{ label: 'Request access', url: 'https://example.invalid/request' }],
    });
    render(<AccessNotice />);
    const text = document.body.textContent ?? '';
    const order = [LEDE, CLOSED, 'Invite only for now.', 'Request access'].map((s) => text.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
