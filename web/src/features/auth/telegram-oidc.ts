import { ApiError } from '@/lib/errors.ts';

/** Where the per-attempt binding waits while the shopper is at Telegram. sessionStorage: this tab only, never the URL. */
export const BINDING_KEY = 'sf-tg-oidc-binding';

/** The path Telegram sends the browser back to; it must match what the owner registered with BotFather. */
export const TELEGRAM_CALLBACK_PATH = '/auth/telegram/callback';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 32 random bytes as base64url: 43 characters, inside the backend's 43-128 window. */
export function generateBinding(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Keep the binding for the return trip. False when storage is unavailable (the sign-in cannot be completed then). */
export function storeBinding(binding: string): boolean {
  try {
    sessionStorage.setItem(BINDING_KEY, binding);
    return true;
  } catch {
    return false;
  }
}

/** Read the binding and remove it: an attempt gets exactly one try. Null when this tab never started one. */
export function takeBinding(): string | null {
  try {
    const binding = sessionStorage.getItem(BINDING_KEY);
    sessionStorage.removeItem(BINDING_KEY);
    return binding && binding.length > 0 ? binding : null;
  } catch {
    return null;
  }
}

/** Drop the binding of an attempt that never left this page. */
export function clearBinding(): void {
  try {
    sessionStorage.removeItem(BINDING_KEY);
  } catch {
    /* nothing to clear */
  }
}

export type TelegramOidcFailure =
  | 'expired'
  | 'failed'
  | 'unavailable'
  | 'closed'
  | 'banned'
  | 'cancelled'
  | 'rateLimited'
  | 'generic';

/** The backend's error sentinels (they arrive as the envelope's error string) mapped to what the shopper should be told. */
export function classifyTelegramOidcError(err: unknown): TelegramOidcFailure {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'rateLimited';
    if (err.isBanned) return 'banned';
    if (err.isRegistrationClosed) return 'closed';
    if (err.message === 'TELEGRAM_LOGIN_EXPIRED') return 'expired';
    if (err.message === 'TELEGRAM_LOGIN_FAILED') return 'failed';
    if (err.message === 'TELEGRAM_LOGIN_UNAVAILABLE') return 'unavailable';
  }
  return 'generic';
}
