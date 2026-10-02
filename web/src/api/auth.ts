import { api, unwrap } from '@/api/client.ts';
import type { WhatsappStart, AttemptStatus, LoginResult, TelegramAuthPayload, PasswordIdentifier, ResetCheck, SetPasswordInput } from '@/types/auth.ts';

export const startWhatsapp = () =>
  unwrap<WhatsappStart>(api.post('storefront/auth/whatsapp/start', { json: {} }));

export const pollAttempt = (id: string) =>
  unwrap<{ status: AttemptStatus }>(api.get(`storefront/auth/attempts/${id}`));

export const completeWhatsapp = (attemptId: string, attemptSecret: string) =>
  unwrap<LoginResult>(api.post('storefront/auth/whatsapp/complete', { json: { attemptId, attemptSecret } }));

export const loginTelegram = (payload: TelegramAuthPayload) =>
  unwrap<LoginResult>(api.post('storefront/auth/telegram', { json: payload }));

export const logout = () => unwrap<null>(api.post('storefront/auth/logout'));

/** Mini App sign-in: `initData` is posted exactly as Telegram handed it over. */
export const loginTelegramWebApp = (initData: string) =>
  unwrap<LoginResult>(api.post('storefront/auth/telegram-webapp', { json: { initData } }));

/** Creates a new account. `409` = the email/phone is taken (one generic message); the token is the Turnstile one when the shop has it. */
export const passwordSignup = (id: PasswordIdentifier, password: string, turnstileToken?: string) =>
  unwrap<LoginResult>(api.post('storefront/auth/password/signup', { json: { ...id, password, ...(turnstileToken ? { turnstileToken } : {}) } }));

export const passwordLogin = (id: PasswordIdentifier, password: string) =>
  unwrap<LoginResult>(api.post('storefront/auth/password/login', { json: { ...id, password } }));

/** Always `{ ok: true }` for a well-formed request: the answer never says whether the address has an account. */
export const passwordForgot = (email: string, turnstileToken?: string) =>
  unwrap<{ ok: true }>(api.post('storefront/auth/password/forgot', { json: { email, ...(turnstileToken ? { turnstileToken } : {}) } }));

/** Does not consume the token. */
export const checkResetToken = (token: string) =>
  unwrap<ResetCheck>(api.post('storefront/auth/password/reset/check', { json: { token } }));

/** Consumes the token, replaces the password, signs every other device out and returns a fresh session. */
export const passwordReset = (token: string, password: string) =>
  unwrap<LoginResult>(api.post('storefront/auth/password/reset', { json: { token, password } }));

/**
 * Session required. With a password already set `currentPassword` is required; a wrong one is `422 CURRENT_PASSWORD_INCORRECT`
 * (never a 401, which would clear the session). Identifiers are sent only by a customer with no email and no phone on record;
 * the backend answers 422 to anyone else who sends them.
 */
export const setAccountPassword = (input: SetPasswordInput) =>
  unwrap<{ ok: true }>(api.put('storefront/account/password', { json: input }));

export const requestEmailVerification = () =>
  unwrap<{ ok: true }>(api.post('storefront/auth/email/verification', { json: {} }));

/** Session required, and the token must belong to the session's customer (`403` otherwise). */
export const verifyEmail = (token: string) =>
  unwrap<{ ok: true }>(api.post('storefront/auth/email/verify', { json: { token } }));
