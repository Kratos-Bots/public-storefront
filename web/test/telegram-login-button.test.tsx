import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ApiError } from '@/lib/errors.ts';

const h = vi.hoisted(() => ({ start: vi.fn(), builder: false }));
vi.mock('@/api/auth.ts', () => ({ startTelegramOidc: h.start }));
vi.mock('@/app/builder-gate.ts', () => ({ isBuilderMode: () => h.builder }));

import { BINDING_KEY } from '@/features/auth/telegram-oidc.ts';
import { TELEGRAM_WIDGET_SRC, TelegramLogin } from '@/features/auth/TelegramLogin.tsx';
import { useSessionStore } from '@/stores/session.ts';

const assign = vi.fn();
const widgetScript = () => [...document.querySelectorAll('script')].find((s) => s.src === TELEGRAM_WIDGET_SRC);

function mount(props: { oidc?: boolean; botUsername?: string | null } = {}) {
  return render(
    <MantineProvider env="test"><TelegramLogin botUsername={'botUsername' in props ? props.botUsername! : 'northbound_bot'} onAuth={vi.fn()} oidc={props.oidc} /></MantineProvider>,
  );
}

beforeEach(() => {
  h.builder = false;
  h.start.mockReset().mockResolvedValue({ url: 'https://oauth.telegram.org/auth?state=s1' });
  assign.mockReset();
  vi.stubGlobal('location', { ...window.location, assign });
  sessionStorage.clear();
  useSessionStore.setState({ returnTo: null });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OpenID Connect mode', () => {
  it('is a real button in the shop voice, with no widget script', () => {
    mount({ oidc: true });
    expect(screen.getByRole('button', { name: 'Continue with Telegram' })).toBeTruthy();
    expect(widgetScript()).toBeUndefined();
  });

  it('keeps a binding for the return trip, sends it with the return path, then goes to the assigned URL', async () => {
    useSessionStore.setState({ returnTo: '/checkout' });
    mount({ oidc: true });
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Telegram' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://oauth.telegram.org/auth?state=s1'));
    const stored = sessionStorage.getItem(BINDING_KEY);
    expect(stored).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(h.start).toHaveBeenCalledWith(stored, '/checkout');
  });

  it('sends no return path when there is none, and refuses an off-site one', async () => {
    useSessionStore.setState({ returnTo: '//evil.example' });
    mount({ oidc: true });
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(h.start.mock.calls[0][1]).toBeNull();
  });

  it('shows a busy state while starting and ignores a second tap', async () => {
    let resolve!: (v: { url: string }) => void;
    h.start.mockReturnValue(new Promise((r) => { resolve = r; }));
    mount({ oidc: true });
    const button = screen.getByRole('button');
    fireEvent.click(button);
    await waitFor(() => expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByRole('button').textContent).toBe('Opening Telegram…');
    expect(screen.getByRole('button').getAttribute('aria-busy')).toBe('true');
    fireEvent.click(screen.getByRole('button'));
    expect(h.start).toHaveBeenCalledTimes(1);
    resolve({ url: 'https://oauth.telegram.org/auth?x=1' });
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  });

  it('says so in a plain sentence when starting fails, and can be tried again', async () => {
    h.start.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mount({ oidc: true });
    fireEvent.click(screen.getByRole('button'));
    expect((await screen.findByRole('alert')).textContent).toBe("We couldn't open Telegram. Please try again.");
    expect(assign).not.toHaveBeenCalled();
    const button = screen.getByRole('button', { name: 'Continue with Telegram' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  });

  it('removes the stored binding when start fails', async () => {
    h.start.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mount({ oidc: true });
    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('alert');
    expect(sessionStorage.getItem(BINDING_KEY)).toBeNull();
  });

  it.each([['http://oauth.telegram.org/auth'], ['javascript:alert(1)'], ['not a url'], ['/relative']])(
    'refuses to go to %s: generic sentence, binding removed',
    async (url) => {
      h.start.mockResolvedValueOnce({ url });
      mount({ oidc: true });
      fireEvent.click(screen.getByRole('button'));
      expect((await screen.findByRole('alert')).textContent).toBe("We couldn't open Telegram. Please try again.");
      expect(assign).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(BINDING_KEY)).toBeNull();
    },
  );

  it('keeps the Telegram icon while busy so the button does not change shape', async () => {
    h.start.mockReturnValue(new Promise(() => {}));
    mount({ oidc: true });
    expect(screen.getByRole('button').querySelector('svg')).toBeTruthy();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByRole('button').querySelector('svg')).toBeTruthy();
    expect(screen.getByRole('button').textContent).toBe('Opening Telegram…');
  });

  it('says Telegram sign-in is unavailable on 404 TELEGRAM_LOGIN_UNAVAILABLE', async () => {
    h.start.mockRejectedValueOnce(new ApiError(404, 'TELEGRAM_LOGIN_UNAVAILABLE'));
    mount({ oidc: true });
    fireEvent.click(screen.getByRole('button'));
    expect((await screen.findByRole('alert')).textContent).toBe('Telegram sign-in isn’t available right now.');
  });

  it('shows the shared rate-limit sentence on 429', async () => {
    h.start.mockRejectedValueOnce(new ApiError(429, 'Too many requests'));
    mount({ oidc: true });
    fireEvent.click(screen.getByRole('button'));
    expect((await screen.findByRole('alert')).textContent).toBe('Too many attempts — please wait a moment and try again');
  });

  it('does not call the backend when the binding cannot be kept', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    mount({ oidc: true });
    fireEvent.click(screen.getByRole('button'));
    expect((await screen.findByRole('alert')).textContent).toBe("We couldn't open Telegram. Please try again.");
    expect(h.start).not.toHaveBeenCalled();
  });
});

describe('widget fallback', () => {
  it.each([[false], [undefined]])('with oidc %s Telegram’s own widget is loaded as Telegram provides it', (oidc) => {
    const { container } = mount({ oidc });
    const script = widgetScript()!;
    expect(script).toBeTruthy();
    expect(script.getAttribute('data-telegram-login')).toBe('northbound_bot');
    expect(script.getAttribute('data-size')).toBe('large');
    expect(script.getAttribute('data-request-access')).toBe('write');
    expect(script.getAttribute('data-onauth')).toBe('onSfTelegramAuth(user)');
    // No drawn button and nothing laid over the widget.
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.textContent).not.toContain('Continue with Telegram');
    expect(container.querySelector('svg')).toBeNull();
    expect(h.start).not.toHaveBeenCalled();
  });

  it('renders nothing at all in widget mode without a bot username', () => {
    const { container } = mount({ oidc: false, botUsername: null });
    expect(container.querySelector('div')).toBeNull();
    expect(widgetScript()).toBeUndefined();
  });

  it('forwards the widget payload untouched', () => {
    const onAuth = vi.fn();
    render(<MantineProvider env="test"><TelegramLogin botUsername="northbound_bot" onAuth={onAuth} /></MantineProvider>);
    const payload = { id: 1, auth_date: 2, hash: 'h' };
    window.onSfTelegramAuth?.(payload);
    expect(onAuth).toHaveBeenCalledWith(payload);
  });
});

describe('page builder frame', () => {
  it('shows a placeholder and neither starts a redirect nor loads the widget', () => {
    h.builder = true;
    mount({ oidc: true });
    expect(screen.getByText(/Preview/)).toBeTruthy();
    expect(widgetScript()).toBeUndefined();
    expect(h.start).not.toHaveBeenCalled();
  });
});
