export interface WhatsappStart { attemptId: string; attemptSecret: string; code: string; waLink: string; expiresAt: string }
export type AttemptStatus = 'pending' | 'completed' | 'expired' | 'rejected';
export interface LoginResult { token: string; customer: { id: number; nickname: string | null } }
export interface TelegramAuthPayload { id: number | string; auth_date: number | string; hash: string; first_name?: string; last_name?: string; username?: string; photo_url?: string }
/** Exactly one of an email or a phone. `phoneCountry` is the dial-code picker's ISO-2: the same normalisation hint guest checkout sends. */
export type PasswordIdentifier = { email: string } | { phone: string; phoneCountry?: string };
/** `POST /auth/password/reset/check`. `mode: 'set'` means the customer has no password yet. */
export interface ResetCheck { valid: boolean; mode: 'reset' | 'set' | null }
/** `PUT /account/password`. Identifiers are sent only by a customer who has neither an email nor a phone. */
export interface SetPasswordInput { newPassword: string; currentPassword?: string; email?: string; phone?: string; phoneCountry?: string }
/** Where a sign-in code goes. */
export type CodeChannel = 'whatsapp' | 'sms' | 'email';
/**
 * A code was sent. `resendAfter` is the wait in whole seconds before another may be asked for; `maskedTo` is
 * computed by the backend (`j•••@gmail.com`, `+44 ••• ••• 789`) and shown as is.
 */
export interface CodeSent { next: 'code'; attemptId: string; channel: CodeChannel; maskedTo: string; resendAfter: number }
/** `POST /auth/code/email`: a live password login answers `password` and nothing is sent. */
export type CodeEmailResult = { next: 'password' } | CodeSent;
/** `POST /auth/code/verify`. A wrong code is a normal 200 answer (an error cannot carry the tries left). */
export type CodeVerifyResult =
  | ({ status: 'signed_in'; isNew: boolean } & LoginResult)
  | { status: 'incorrect'; attemptsRemaining: number };
