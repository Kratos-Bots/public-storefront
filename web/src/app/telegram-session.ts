import { loginTelegramWebApp } from '@/api/auth.ts';
import { fetchCart } from '@/api/cart.ts';
import { adoptAccountCart } from '@/features/auth/useLoginSuccess.ts';
import { resetCartSync } from '@/features/cart/useServerCart.ts';
import { ApiError, errorMessage } from '@/lib/errors.ts';
import { accessGate } from '@/app/access-gate.ts';
import { textSnapshot } from '@/text/snapshot.ts';
import { isTelegramWebApp, telegramInitData } from '@/lib/telegram-webapp.ts';
import { useCartStore } from '@/stores/cart.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useTelegramAuthStore } from '@/stores/telegram.ts';
import type { LoginResult } from '@/types/auth.ts';

export interface TelegramSessionDeps {
  inTelegram: () => boolean;
  initData: () => string | null;
  login: (initData: string) => Promise<LoginResult>;
  /** `merge` = fold local (guest) lines in; otherwise adopt the server cart as-is. */
  adoptCart: (merge: boolean) => Promise<void>;
  /** Forget the previous account: stored session, basket and any armed cart sync. */
  forgetAccount: () => void;
}

/** A signed-in launch: the persisted lines mirror *some* account's server cart, so never merge them. */
async function adoptServerCart(): Promise<void> {
  try {
    useCartStore.getState().replaceFromServer(await fetchCart());
  } catch {
    // Silent, like useBootCart: the local cart stands in until the next sync.
  }
}

/**
 * The same reset as signing out (ProfilePage), without the revoke and the reload: this runs when initData is
 * missing or the login failed, which can be a passing failure rather than a deliberate sign-out.
 */
export function forgetAccount(): void {
  useSessionStore.getState().clear();
  useCartStore.getState().clear();
  useCartStore.getState().setMode('local');
  resetCartSync();
}

const DEFAULT_DEPS: TelegramSessionDeps = {
  inTelegram: isTelegramWebApp,
  initData: telegramInitData,
  login: loginTelegramWebApp,
  adoptCart: (merge) => (merge ? adoptAccountCart() : adoptServerCart()),
  forgetAccount,
};

/**
 * Inside Telegram the shopper's Telegram account *is* their identity: exchange
 * the signed initData for a storefront session on every launch, replacing any
 * token already stored — a phone shared by two Telegram accounts must always
 * land on the account that opened the shop. A failure clears the stored session
 * for the same reason: showing the previous account's orders is worse than
 * asking the shopper to reopen the shop.
 *
 * Sets `pending` synchronously, before the first await, so the first render
 * (which main.tsx starts right after calling this) already holds the skeleton.
 */
export async function bootTelegramSession(overrides: Partial<TelegramSessionDeps> = {}): Promise<void> {
  const d = { ...DEFAULT_DEPS, ...overrides };
  const auth = useTelegramAuthStore.getState();
  if (!d.inTelegram()) {
    auth.setStatus('none');
    return;
  }

  const initData = d.initData();
  if (!initData) {
    d.forgetAccount();
    auth.setStatus('failed', textSnapshot().t('auth.telegram.noAccount'));
    return;
  }

  auth.setStatus('pending');
  // A retry starts clean: a refusal from an earlier launch must not outlive it.
  accessGate.getState().setRegistrationRefused(false);
  const hadSession = useSessionStore.getState().token !== null;
  try {
    const result = await d.login(initData);
    useSessionStore.getState().setSession(result.token, result.customer);
    // A previous session can have left a debounce timer armed; it doesn't belong to this account.
    resetCartSync();
    await d.adoptCart(!hadSession);
    useTelegramAuthStore.getState().setStatus('ready');
  } catch (err) {
    if (err instanceof ApiError && err.isRegistrationClosed) accessGate.getState().setRegistrationRefused(true);
    d.forgetAccount();
    useTelegramAuthStore.getState().setStatus('failed', errorMessage(err, textSnapshot().t('auth.telegram.signInFailed')));
  }
}
