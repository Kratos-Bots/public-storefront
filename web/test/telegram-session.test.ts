import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

import { bootTelegramSession, forgetAccount, type TelegramSessionDeps } from '@/app/telegram-session.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useCartStore } from '@/stores/cart.ts';
import { useTelegramAuthStore } from '@/stores/telegram.ts';
import { ApiError } from '@/lib/errors.ts';
import { listSavedOrders, saveOrder } from '@/stores/saved-orders.ts';
import { accessGate } from '@/app/access-gate.ts';
import { textSnapshot } from '@/text/snapshot.ts';
import type { LoginResult } from '@/types/auth.ts';

const RESULT: LoginResult = { token: 'tg-token', customer: { id: 7, nickname: 'Ada' } };

function deps(overrides: Partial<TelegramSessionDeps> = {}): TelegramSessionDeps {
  return {
    inTelegram: () => true,
    initData: () => 'user=%7B%22id%22%3A1%7D&hash=abc',
    login: vi.fn(async () => RESULT),
    adoptCart: vi.fn(async () => undefined),
    forgetAccount: vi.fn(forgetAccount),
    ...overrides,
  };
}

function seedCart() {
  useCartStore.setState({
    mode: 'server',
    lines: [{ productId: 5, displayName: 'X', sku: 'x', unitPrice: 1, basePrice: 1, pricingTiers: [], quantity: 2, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null }],
  });
}

beforeEach(() => {
  useSessionStore.getState().clear();
  useCartStore.getState().clear();
  useTelegramAuthStore.getState().setStatus('none');
});

describe('bootTelegramSession', () => {
  it('stays out of the way in an ordinary browser', async () => {
    const d = deps({ inTelegram: () => false });
    await bootTelegramSession(d);
    expect(useTelegramAuthStore.getState().status).toBe('none');
    expect(d.login).not.toHaveBeenCalled();
  });

  it('is pending synchronously, before the request resolves', () => {
    void bootTelegramSession(deps({ login: () => new Promise(() => undefined) }));
    expect(useTelegramAuthStore.getState().status).toBe('pending');
  });

  it('posts the raw initData and signs the shopper in', async () => {
    const d = deps();
    await bootTelegramSession(d);
    expect(d.login).toHaveBeenCalledWith('user=%7B%22id%22%3A1%7D&hash=abc');
    expect(useSessionStore.getState().token).toBe('tg-token');
    expect(useSessionStore.getState().customer).toEqual({ id: 7, nickname: 'Ada' });
    expect(useTelegramAuthStore.getState()).toMatchObject({ status: 'ready', error: null });
  });

  it('merges a guest basket when there was no session before this launch', async () => {
    const d = deps();
    await bootTelegramSession(d);
    expect(d.adoptCart).toHaveBeenCalledWith(true);
  });

  it('replaces an existing session and adopts the server cart without merging', async () => {
    useSessionStore.getState().setSession('someone-elses-token', { id: 99, nickname: 'Bea' });
    const d = deps();
    await bootTelegramSession(d);
    expect(useSessionStore.getState().token).toBe('tg-token');
    expect(d.adoptCart).toHaveBeenCalledWith(false);
  });

  it('clears any stored session and reports the error when Telegram sign-in fails', async () => {
    useSessionStore.getState().setSession('stale', { id: 99, nickname: 'Bea' });
    const d = deps({ login: vi.fn(async () => { throw new ApiError(401, 'Telegram web app session expired'); }) });
    await bootTelegramSession(d);
    expect(useSessionStore.getState().token).toBeNull();
    expect(useTelegramAuthStore.getState()).toMatchObject({ status: 'failed', error: 'Telegram web app session expired' });
    expect(d.adoptCart).not.toHaveBeenCalled();
  });

  it('records a refused registration and shows the mapped sentence', async () => {
    accessGate.getState().reset();
    const d = deps({ login: vi.fn(async () => { throw new ApiError(403, 'REGISTRATION_CLOSED'); }) });
    await bootTelegramSession(d);
    expect(accessGate.getState().registrationRefused).toBe(true);
    expect(useTelegramAuthStore.getState()).toMatchObject({
      status: 'failed',
      error: textSnapshot().t('errors.registrationClosed'),
    });
    accessGate.getState().reset();
  });

  it('clears a stale refusal when a retry starts', async () => {
    accessGate.getState().setRegistrationRefused(true);
    await bootTelegramSession(deps());
    expect(accessGate.getState().registrationRefused).toBe(false);
    await bootTelegramSession(deps({ login: vi.fn(async () => { throw new ApiError(500, 'boom'); }) }));
    expect(accessGate.getState().registrationRefused).toBe(false);
  });

  it('does not mark registration refused for other failures', async () => {
    accessGate.getState().reset();
    await bootTelegramSession(deps({ login: vi.fn(async () => { throw new ApiError(500, 'boom'); }) }));
    expect(accessGate.getState().registrationRefused).toBe(false);
  });

  it('fails cleanly if Telegram handed over no initData', async () => {
    const d = deps({ initData: () => null });
    await bootTelegramSession(d);
    expect(useTelegramAuthStore.getState().status).toBe('failed');
    expect(d.login).not.toHaveBeenCalled();
  });

  it('a failed launch keeps the saved order links: it is not a deliberate sign-out', async () => {
    saveOrder('K4M2QP', 'abc');
    await bootTelegramSession(deps({ login: vi.fn(async () => { throw new Error('offline'); }) }));
    await bootTelegramSession(deps({ initData: () => null }));
    expect(listSavedOrders()).toHaveLength(1);
    localStorage.clear();
  });

  it('forgets the previous account on every failure path', async () => {
    for (const d of [
      deps({ login: vi.fn(async () => { throw new ApiError(401, 'expired'); }) }),
      deps({ initData: () => null }),
    ]) {
      useSessionStore.getState().setSession('stale', { id: 99, nickname: 'Bea' });
      seedCart();
      await bootTelegramSession(d);
      expect(d.forgetAccount).toHaveBeenCalledTimes(1);
      expect(useSessionStore.getState().token).toBeNull();
      expect(useCartStore.getState().lines).toEqual([]);
      expect(useCartStore.getState().mode).toBe('local');
    }
  });

  it('does not carry the previous account basket into a different account after a failed launch', async () => {
    useSessionStore.getState().setSession('bea-token', { id: 99, nickname: 'Bea' });
    seedCart();
    await bootTelegramSession(deps({ login: vi.fn(async () => { throw new ApiError(500, 'boom'); }) }));

    let localAtAdopt: unknown = null;
    const retry = deps({
      adoptCart: vi.fn(async () => { localAtAdopt = useCartStore.getState().lines; }),
    });
    await bootTelegramSession(retry);
    expect(localAtAdopt).toEqual([]);
  });
});
