import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';

const ctx = vi.hoisted(() => ({
  features: { ordering: true, guestCheckout: true, wholesale: false } as Record<string, boolean>,
  issues: [] as Array<Record<string, boolean>>,
}));
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ currency: 'GBP', theme: { colors: {} }, features: ctx.features }),
}));
vi.mock('@/features/cart/useServerCart.ts', () => ({ useServerCart: () => ({ issues: ctx.issues, server: null }) }));

import { PrimaryActionBar, usePrimaryBarShowing } from '@/features/webapp/PrimaryActionBar.tsx';
import { WebAppCartBar } from '@/features/webapp/WebAppCartBar.tsx';
import { useTelegramChrome } from '@/features/webapp/useTelegramChrome.ts';
import { backControls } from '@/features/webapp/back-controls.ts';
import { useCartStore } from '@/stores/cart.ts';
import { usePrimaryActionStore } from '@/stores/primary-action.ts';
import { useBackActionStore } from '@/stores/back-action.ts';

type Handlers = Array<() => void>;

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
  const impactOccurred = vi.fn();
  (window as unknown as { Telegram: unknown }).Telegram = {
    WebApp: {
      initData: 'user=1&hash=abc', version, isVersionAtLeast: atLeast,
      ready: vi.fn(), expand: vi.fn(), close: vi.fn(),
      setHeaderColor: vi.fn(), setBackgroundColor: vi.fn(), setBottomBarColor: vi.fn(),
      enableClosingConfirmation: vi.fn(), disableClosingConfirmation: vi.fn(),
      enableVerticalSwipes: vi.fn(), disableVerticalSwipes: vi.fn(),
      HapticFeedback: { impactOccurred, notificationOccurred: vi.fn() },
      onEvent: vi.fn(), offEvent: vi.fn(), openLink: vi.fn(),
      MainButton: main, SecondaryButton: atLeast('7.10') ? secondary : undefined, BackButton: back,
    },
  };
  return { handlers, main, secondary, back, impactOccurred };
}

function Harness() {
  useTelegramChrome();
  return (
    <>
      <PrimaryActionBar />
      <WebAppCartBar />
      <span data-testid="where">{useLocation().pathname}</span>
    </>
  );
}

const mount = (path: string | string[], index?: number) =>
  render(<MemoryRouter initialEntries={Array.isArray(path) ? path : [path]} initialIndex={index}><Harness /></MemoryRouter>);

function openDialog() {
  const el = document.createElement('div');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  document.body.appendChild(el);
  return el;
}

const line = { productId: 7, displayName: 'Sample tea', sku: 'T-1', unitPrice: 12, basePrice: 12, pricingTiers: [], quantity: 2, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null };
const bar = () => document.querySelector('[data-sf-part="cart-bar"]');
const claim = (label = 'Pay now') => usePrimaryActionStore.setState({ override: { label, onClick: vi.fn() } });

beforeEach(() => {
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  ctx.features = { ordering: true, guestCheckout: true, wholesale: false };
  ctx.issues = [];
  usePrimaryActionStore.setState({ override: null });
  useBackActionStore.setState({ override: null });
  useCartStore.setState({ lines: [line], mode: 'local' });
});
afterEach(() => {
  cleanup();
  document.body.querySelectorAll('[aria-modal]').forEach((n) => n.remove());
});

describe('browser-mode web app', () => {
  it.each(['/', '/p/sample-tea', '/c/tea', '/account'])('shows the running tab on %s instead of a View cart button', (path) => {
    mount(path);
    expect(bar()).not.toBeNull();
    expect(bar()!.textContent).toContain('£24.00');
    expect(bar()!.textContent).toMatch(/2 items/i);
    expect(document.querySelector('[data-sf-part="primary-bar"]')).toBeNull();
    expect(screen.queryByText(/View cart/)).toBeNull();
  });

  it('the figures go to the cart and Checkout goes to checkout', () => {
    mount('/');
    expect(bar()!.querySelector('a[href="/cart"]')).not.toBeNull();
    expect(bar()!.querySelector('a[href="/checkout"]')).not.toBeNull();
    fireEvent.click(bar()!.querySelector('a[href="/checkout"]')!);
    expect(screen.getByTestId('where').textContent).toBe('/checkout');
  });

  it('a guest goes to sign-in first when guest checkout is off', () => {
    ctx.features.guestCheckout = false;
    mount('/');
    expect(bar()!.querySelector('a[href="/login?returnTo=%2Fcheckout"]')).not.toBeNull();
  });

  it('Checkout is disabled, and not a link, while the server flags a line', () => {
    ctx.issues = [{ belowMin: true }];
    mount('/');
    const checkout = bar()!.querySelector('button[data-sf-cta="main"]') as HTMLButtonElement;
    expect(checkout.disabled).toBe(true);
    expect(bar()!.querySelector('a[href="/checkout"]')).toBeNull();
  });

  it('keeps the single-button bar on /cart', () => {
    mount('/cart');
    expect(bar()).toBeNull();
    expect(document.querySelector('[data-sf-part="primary-bar"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Checkout · £24\.00/ })).toBeTruthy();
  });

  it.each(['/checkout', '/order-placed', '/payment/abc'])('draws neither bar on %s', (path) => {
    mount(path);
    expect(bar()).toBeNull();
    expect(document.querySelector('[data-sf-part="primary-bar"]')).toBeNull();
  });

  it('a page that claims an action keeps the single-button bar, and no running tab', () => {
    claim();
    mount('/p/sample-tea');
    expect(bar()).toBeNull();
    expect(screen.getByRole('button', { name: 'Pay now' })).toBeTruthy();
  });

  it('is not drawn with an empty cart, ordering off, or in wholesale mode', () => {
    useCartStore.setState({ lines: [], mode: 'local' });
    mount('/');
    expect(bar()).toBeNull();
    cleanup();
    useCartStore.setState({ lines: [line], mode: 'local' });
    ctx.features.ordering = false;
    mount('/');
    expect(bar()).toBeNull();
    cleanup();
    ctx.features = { ordering: true, guestCheckout: true, wholesale: true };
    mount('/');
    expect(bar()).toBeNull();
    // Wholesale keeps its old behaviour: the standing View cart button.
    expect(screen.getByRole('button', { name: /View cart · £24\.00/ })).toBeTruthy();
  });

  it('steps aside under a dialog but the shell keeps its room', async () => {
    mount('/');
    const { result } = renderHook(() => usePrimaryBarShowing(), { wrapper: ({ children }) => <MemoryRouter initialEntries={['/']}>{children}</MemoryRouter> });
    expect(result.current).toBe(true);
    let dialog!: HTMLElement;
    act(() => { dialog = openDialog(); });
    await waitFor(() => expect(bar()).toBeNull());
    expect(result.current).toBe(true);
    act(() => { dialog.remove(); });
    await waitFor(() => expect(bar()).not.toBeNull());
  });

  it('uses the browser-tab inset class, not the in-Telegram one', () => {
    mount('/');
    expect(bar()!.className).toMatch(/webapp/);
    expect(bar()!.className).not.toMatch(/telegram/);
  });
});

describe('inside Telegram', () => {
  it('draws the running tab in the page and hides the MainButton, on the catalogue and a product', async () => {
    const tg = installTelegram('8.0');
    mount('/');
    expect(bar()).not.toBeNull();
    expect(bar()!.className).toMatch(/telegram/);
    expect(bar()!.className).not.toMatch(/webapp/);
    await new Promise((r) => setTimeout(r, 10));
    expect(tg.main.isVisible).toBe(false);
    expect(tg.handlers.main).toHaveLength(0);
    cleanup();
    mount('/p/sample-tea');
    expect(bar()).not.toBeNull();
    await new Promise((r) => setTimeout(r, 10));
    expect(tg.main.isVisible).toBe(false);
  });

  it('shows the native MainButton on /cart, with no running tab', async () => {
    const tg = installTelegram('8.0');
    mount('/cart');
    await waitFor(() => expect(tg.main.isVisible).toBe(true));
    expect(tg.main.text).toBe('Checkout · £24.00');
    expect(bar()).toBeNull();
  });

  it('shows the native MainButton for a page that claims an action, with no running tab', async () => {
    const tg = installTelegram('8.0');
    claim('Pay now');
    mount('/p/sample-tea');
    await waitFor(() => expect(tg.main.isVisible).toBe(true));
    expect(tg.main.text).toBe('Pay now');
    expect(bar()).toBeNull();
  });

  it('the MainButton returns with one live handler when the shopper reaches /cart from a product', async () => {
    const tg = installTelegram('8.0');
    mount(['/', '/p/sample-tea'], 1);
    expect(bar()).not.toBeNull();
    fireEvent.click(bar()!.querySelector('a[href="/cart"]')!);
    await waitFor(() => expect(tg.main.isVisible).toBe(true));
    expect(bar()).toBeNull();
    expect(tg.handlers.main).toHaveLength(1);
  });

  it('Back moves to the header arrow alone: no SecondaryButton stacked under the running tab', async () => {
    const tg = installTelegram('8.0');
    mount(['/', '/p/sample-tea'], 1);
    await waitFor(() => expect(tg.back.isVisible).toBe(true));
    await new Promise((r) => setTimeout(r, 10));
    expect(tg.secondary.isVisible).toBe(false);
    expect(tg.handlers.secondary).toHaveLength(0);
    expect(tg.main.isVisible).toBe(false);
    act(() => tg.handlers.back.slice().forEach((h) => h()));
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  it('an older client keeps the header arrow too', async () => {
    const tg = installTelegram('7.9');
    mount(['/', '/p/sample-tea'], 1);
    await waitFor(() => expect(tg.back.isVisible).toBe(true));
    expect(bar()).not.toBeNull();
    expect(tg.main.isVisible).toBe(false);
  });

  it('Checkout is disabled with a blocking issue', () => {
    installTelegram('8.0');
    ctx.issues = [{ inactive: true }];
    mount('/');
    expect((bar()!.querySelector('button[data-sf-cta="main"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a tap ticks like the native button does', () => {
    const tg = installTelegram('8.0');
    mount('/');
    fireEvent.click(bar()!.querySelector('a[href="/checkout"]')!);
    expect(tg.impactOccurred).toHaveBeenCalledWith('light');
  });

  it('hides under a dialog and the header Back stands down too, then everything returns', async () => {
    const tg = installTelegram('8.0');
    mount(['/', '/p/sample-tea'], 1);
    await waitFor(() => expect(tg.back.isVisible).toBe(true));
    let dialog!: HTMLElement;
    act(() => { dialog = openDialog(); });
    await waitFor(() => expect(bar()).toBeNull());
    await waitFor(() => expect(tg.back.isVisible).toBe(false));
    expect(tg.secondary.isVisible).toBe(false);
    act(() => { dialog.remove(); });
    await waitFor(() => expect(bar()).not.toBeNull());
    await waitFor(() => expect(tg.back.isVisible).toBe(true));
    expect(tg.handlers.back).toHaveLength(1);
  });

  it('reserves room for the bar inside Telegram too', () => {
    installTelegram('8.0');
    const { result } = renderHook(() => usePrimaryBarShowing(), { wrapper: ({ children }) => <MemoryRouter initialEntries={['/']}>{children}</MemoryRouter> });
    expect(result.current).toBe(true);
  });
});

describe('backControls with the running tab', () => {
  it('uses the header arrow only, whatever the SecondaryButton support', () => {
    expect(backControls({ supportsSecondary: true, hasPrimaryAction: false, modalOpen: false, backAvailable: true, cartBar: true }))
      .toEqual({ showHeaderBack: true, showBottomBack: false });
    expect(backControls({ supportsSecondary: false, hasPrimaryAction: false, modalOpen: false, backAvailable: true, cartBar: true }))
      .toEqual({ showHeaderBack: true, showBottomBack: false });
  });

  it('still shows nothing where there is no way back or under a modal', () => {
    expect(backControls({ supportsSecondary: true, hasPrimaryAction: false, modalOpen: false, backAvailable: false, cartBar: true }))
      .toEqual({ showHeaderBack: false, showBottomBack: false });
    expect(backControls({ supportsSecondary: true, hasPrimaryAction: false, modalOpen: true, backAvailable: true, cartBar: true }))
      .toEqual({ showHeaderBack: false, showBottomBack: false });
  });
});
