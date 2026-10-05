import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';

vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ currency: 'GBP', theme: { colors: {} }, features: { ordering: true, guestCheckout: true } }),
}));
vi.mock('@/features/cart/useServerCart.ts', () => ({ useServerCart: () => ({ issues: [] }) }));

import { PrimaryActionBar, usePrimaryBarShowing } from '@/features/webapp/PrimaryActionBar.tsx';
import { useTelegramChrome } from '@/features/webapp/useTelegramChrome.ts';
import { useModalOpen } from '@/lib/use-modal-open.ts';
import { usePrimaryActionStore } from '@/stores/primary-action.ts';
import { useBackActionStore } from '@/stores/back-action.ts';

type Handlers = Array<() => void>;

/** A Telegram client that keeps the live handler list of each button, like the e2e stub does. */
function installTelegram(version: string) {
  const handlers: Record<'main' | 'secondary' | 'back', Handlers> = { main: [], secondary: [], back: [] };
  const button = (key: 'main' | 'secondary') => ({
    isVisible: false,
    text: '',
    setParams(p: { text?: string; is_visible?: boolean }) {
      if (p.text !== undefined) this.text = p.text;
      if (p.is_visible !== undefined) this.isVisible = p.is_visible;
    },
    hide() { this.isVisible = false; },
    showProgress: vi.fn(),
    hideProgress: vi.fn(),
    onClick(fn: () => void) { handlers[key].push(fn); },
    offClick(fn: () => void) { handlers[key] = handlers[key].filter((h) => h !== fn); },
  });
  const main = button('main');
  const secondary = button('secondary');
  const back = {
    isVisible: false,
    show() { this.isVisible = true; },
    hide() { this.isVisible = false; },
    onClick(fn: () => void) { handlers.back.push(fn); },
    offClick(fn: () => void) { handlers.back = handlers.back.filter((h) => h !== fn); },
  };
  const parts = version.split('.').map(Number);
  const atLeast = (v: string) => {
    const want = v.split('.').map(Number);
    for (let i = 0; i < 2; i++) if ((parts[i] ?? 0) !== (want[i] ?? 0)) return (parts[i] ?? 0) > (want[i] ?? 0);
    return true;
  };
  (window as unknown as { Telegram: unknown }).Telegram = {
    WebApp: {
      initData: 'user=1&hash=abc', version, isVersionAtLeast: atLeast,
      ready: vi.fn(), expand: vi.fn(), close: vi.fn(),
      setHeaderColor: vi.fn(), setBackgroundColor: vi.fn(), setBottomBarColor: vi.fn(),
      enableClosingConfirmation: vi.fn(), disableClosingConfirmation: vi.fn(),
      enableVerticalSwipes: vi.fn(), disableVerticalSwipes: vi.fn(),
      HapticFeedback: { impactOccurred: vi.fn(), notificationOccurred: vi.fn() },
      onEvent: vi.fn(), offEvent: vi.fn(), openLink: vi.fn(),
      MainButton: main, SecondaryButton: atLeast('7.10') ? secondary : undefined, BackButton: back,
    },
  };
  return { handlers, main, secondary, back };
}

function Harness() {
  useTelegramChrome();
  return (
    <>
      <PrimaryActionBar />
      <span data-testid="where">{useLocation().pathname}</span>
    </>
  );
}

const mount = (path: string) => render(<MemoryRouter initialEntries={[path]}><Harness /></MemoryRouter>);

/** What Mantine draws for any Modal or Drawer: a dialog that says it is modal. */
function openDialog() {
  const el = document.createElement('div');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  document.body.appendChild(el);
  return el;
}

const claim = (label = 'Checkout · £10.00') => usePrimaryActionStore.setState({ override: { label, onClick: vi.fn() } });

beforeEach(() => {
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  usePrimaryActionStore.setState({ override: null });
  useBackActionStore.setState({ override: null });
});
afterEach(() => {
  cleanup();
  document.body.querySelectorAll('[aria-modal]').forEach((n) => n.remove());
});

describe('useModalOpen', () => {
  it('follows a modal dialog coming and going, and when it is removed while open', async () => {
    const { result } = renderHook(() => useModalOpen());
    expect(result.current).toBe(false);
    let dialog!: HTMLElement;
    act(() => { dialog = openDialog(); });
    await waitFor(() => expect(result.current).toBe(true));
    act(() => { dialog.setAttribute('aria-modal', 'false'); });
    await waitFor(() => expect(result.current).toBe(false));
    act(() => { dialog.setAttribute('aria-modal', 'true'); });
    await waitFor(() => expect(result.current).toBe(true));
    act(() => { dialog.remove(); });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('ignores mutations that cannot matter: no document-wide query for them, one when a dialog arrives', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const { result } = renderHook(() => useModalOpen());
    const query = vi.spyOn(Document.prototype, 'querySelector');
    act(() => { host.appendChild(document.createElement('p')); });
    act(() => { host.setAttribute('data-x', '1'); });
    await new Promise((r) => setTimeout(r, 20));
    expect(query).not.toHaveBeenCalled();
    act(() => { host.appendChild(openDialog()); });
    await waitFor(() => expect(result.current).toBe(true));
    expect(query).toHaveBeenCalled();
    query.mockRestore();
    host.remove();
  });

  it('starts true when a dialog is already open', () => {
    openDialog();
    const { result } = renderHook(() => useModalOpen());
    expect(result.current).toBe(true);
  });
});

describe('inside Telegram with the SecondaryButton (7.10+)', () => {
  it('shows Back on the left of the main action, instead of the header back control', async () => {
    const tg = installTelegram('8.0');
    claim();
    mount('/cart');
    await waitFor(() => expect(tg.main.isVisible).toBe(true));
    await waitFor(() => expect(tg.secondary.isVisible).toBe(true));
    expect(tg.secondary.text).toBe('Back');
    expect(tg.back.isVisible).toBe(false);
    expect(tg.handlers.back).toHaveLength(0);
    expect(tg.handlers.main).toHaveLength(1);
    expect(tg.handlers.secondary).toHaveLength(1);
  });

  it('with no primary action, Back alone below and the header arrow too, one handler each, each going back', async () => {
    const tg = installTelegram('8.0');
    render(<MemoryRouter initialEntries={['/', '/account']} initialIndex={1}><Harness /></MemoryRouter>);
    await waitFor(() => expect(tg.secondary.isVisible).toBe(true));
    await waitFor(() => expect(tg.back.isVisible).toBe(true));
    expect(tg.main.isVisible).toBe(false);
    expect(tg.handlers.secondary).toHaveLength(1);
    expect(tg.handlers.back).toHaveLength(1);
    act(() => tg.handlers.back.slice().forEach((h) => h()));
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  it('with no primary action, the bottom Back goes back too', async () => {
    const tg = installTelegram('8.0');
    render(<MemoryRouter initialEntries={['/', '/account']} initialIndex={1}><Harness /></MemoryRouter>);
    await waitFor(() => expect(tg.secondary.isVisible).toBe(true));
    act(() => tg.handlers.secondary.slice().forEach((h) => h()));
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  it('with no primary action, a modal hides both back controls and they return', async () => {
    const tg = installTelegram('8.0');
    mount('/account');
    await waitFor(() => expect(tg.secondary.isVisible && tg.back.isVisible).toBe(true));
    let dialog!: HTMLElement;
    act(() => { dialog = openDialog(); });
    await waitFor(() => expect(tg.secondary.isVisible || tg.back.isVisible).toBe(false));
    expect(tg.handlers.secondary).toHaveLength(0);
    expect(tg.handlers.back).toHaveLength(0);
    act(() => { dialog.remove(); });
    await waitFor(() => expect(tg.secondary.isVisible && tg.back.isVisible).toBe(true));
    expect(tg.handlers.secondary).toHaveLength(1);
    expect(tg.handlers.back).toHaveLength(1);
  });

  it('no Back on the catalogue home', async () => {
    const tg = installTelegram('8.0');
    claim();
    mount('/');
    await waitFor(() => expect(tg.main.isVisible).toBe(true));
    expect(tg.secondary.isVisible).toBe(false);
    expect(tg.handlers.secondary).toHaveLength(0);
  });

  it('Back goes back', async () => {
    const tg = installTelegram('8.0');
    claim();
    render(<MemoryRouter initialEntries={['/', '/cart']} initialIndex={1}><Harness /></MemoryRouter>);
    await waitFor(() => expect(tg.secondary.isVisible).toBe(true));
    act(() => tg.handlers.secondary.slice().forEach((h) => h()));
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  it('hides both bottom buttons while a modal is open and restores them, one live handler each', async () => {
    const tg = installTelegram('8.0');
    claim();
    mount('/cart');
    await waitFor(() => expect(tg.secondary.isVisible && tg.main.isVisible).toBe(true));

    let dialog!: HTMLElement;
    act(() => { dialog = openDialog(); });
    await waitFor(() => expect(tg.main.isVisible).toBe(false));
    expect(tg.secondary.isVisible).toBe(false);
    expect(tg.back.isVisible).toBe(false);
    expect(tg.handlers.main).toHaveLength(0);
    expect(tg.handlers.secondary).toHaveLength(0);

    act(() => { dialog.remove(); });
    await waitFor(() => expect(tg.main.isVisible && tg.secondary.isVisible).toBe(true));
    expect(tg.handlers.main).toHaveLength(1);
    expect(tg.handlers.secondary).toHaveLength(1);
    expect(tg.handlers.back).toHaveLength(0);
  });
});

describe('inside Telegram without the SecondaryButton (older client)', () => {
  it('keeps the header back control exactly as it was and shows no bottom Back', async () => {
    const tg = installTelegram('7.9');
    claim();
    mount('/cart');
    await waitFor(() => expect(tg.back.isVisible).toBe(true));
    await waitFor(() => expect(tg.main.isVisible).toBe(true));
    expect(tg.handlers.back).toHaveLength(1);
    expect(tg.secondary.isVisible).toBe(false);
  });

  it('hides the header back control while a modal is open, and restores it', async () => {
    const tg = installTelegram('7.9');
    claim();
    mount('/cart');
    await waitFor(() => expect(tg.back.isVisible).toBe(true));
    let dialog!: HTMLElement;
    act(() => { dialog = openDialog(); });
    await waitFor(() => expect(tg.back.isVisible).toBe(false));
    expect(tg.main.isVisible).toBe(false);
    expect(tg.handlers.back).toHaveLength(0);
    act(() => { dialog.remove(); });
    await waitFor(() => expect(tg.back.isVisible).toBe(true));
    await waitFor(() => expect(tg.main.isVisible).toBe(true));
    expect(tg.handlers.back).toHaveLength(1);
  });
});

describe('in a browser (the in-page bar)', () => {
  it('draws Back beside the primary action', () => {
    claim('Checkout · £10.00');
    mount('/cart');
    const bar = document.querySelector('[data-sf-part="primary-bar"]')!;
    expect(bar.querySelectorAll('button')).toHaveLength(2);
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back.getAttribute('data-sf-part')).toBe('button');
    expect(screen.getByRole('button', { name: 'Checkout · £10.00' })).toBeTruthy();
    expect(bar.firstElementChild!.firstElementChild).toBe(back);
  });

  it('draws no bar at all without a primary action: no Back-only bar, and no room reserved for one', () => {
    mount('/account');
    expect(document.querySelector('[data-sf-part="primary-bar"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    const { result } = renderHook(() => usePrimaryBarShowing(), { wrapper: ({ children }) => <MemoryRouter initialEntries={['/account']}>{children}</MemoryRouter> });
    expect(result.current).toBe(false);
    cleanup();
    mount('/');
    expect(document.querySelector('[data-sf-part="primary-bar"]')).toBeNull();
  });

  it('reserves room for the bar when there is a primary action', () => {
    claim();
    const { result } = renderHook(() => usePrimaryBarShowing(), { wrapper: ({ children }) => <MemoryRouter initialEntries={['/cart']}>{children}</MemoryRouter> });
    expect(result.current).toBe(true);
  });

  it('Back goes back', () => {
    claim();
    render(<MemoryRouter initialEntries={['/', '/cart']} initialIndex={1}><Harness /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  it('is not drawn while a modal is open, and returns when it closes', async () => {
    claim();
    mount('/cart');
    expect(document.querySelector('[data-sf-part="primary-bar"]')).not.toBeNull();
    let dialog!: HTMLElement;
    act(() => { dialog = openDialog(); });
    await waitFor(() => expect(document.querySelector('[data-sf-part="primary-bar"]')).toBeNull());
    act(() => { dialog.remove(); });
    await waitFor(() => expect(document.querySelector('[data-sf-part="primary-bar"]')).not.toBeNull());
  });
});

describe('a page that claims Back', () => {
  it('both Telegram controls call the page handler instead of going back, one live handler each', async () => {
    const tg = installTelegram('8.0');
    claim();
    const handler = vi.fn();
    useBackActionStore.setState({ override: handler });
    render(<MemoryRouter initialEntries={['/', '/checkout']} initialIndex={1}><Harness /></MemoryRouter>);
    await waitFor(() => expect(tg.secondary.isVisible).toBe(true));
    expect(tg.handlers.secondary).toHaveLength(1);
    act(() => tg.handlers.secondary.slice().forEach((h) => h()));
    expect(handler).toHaveBeenCalledOnce();
    expect(screen.getByTestId('where').textContent).toBe('/checkout');
  });

  it('the header arrow of an older client calls it too', async () => {
    const tg = installTelegram('7.9');
    claim();
    const handler = vi.fn();
    useBackActionStore.setState({ override: handler });
    render(<MemoryRouter initialEntries={['/', '/checkout']} initialIndex={1}><Harness /></MemoryRouter>);
    await waitFor(() => expect(tg.back.isVisible).toBe(true));
    expect(tg.handlers.back).toHaveLength(1);
    act(() => tg.handlers.back.slice().forEach((h) => h()));
    expect(handler).toHaveBeenCalledOnce();
    expect(screen.getByTestId('where').textContent).toBe('/checkout');
  });

  it('releasing the claim puts history Back behind the controls again', async () => {
    const tg = installTelegram('8.0');
    claim();
    useBackActionStore.setState({ override: vi.fn() });
    render(<MemoryRouter initialEntries={['/', '/checkout']} initialIndex={1}><Harness /></MemoryRouter>);
    await waitFor(() => expect(tg.secondary.isVisible).toBe(true));
    act(() => useBackActionStore.setState({ override: null }));
    await waitFor(() => expect(tg.handlers.secondary).toHaveLength(1));
    act(() => tg.handlers.secondary.slice().forEach((h) => h()));
    expect(screen.getByTestId('where').textContent).toBe('/');
  });
});
