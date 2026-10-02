import { z } from 'zod';
import type { PasswordIdentifier } from '@/types/auth.ts';
import { composePhoneNumber } from '@/lib/dial-codes.ts';
import { textSnapshot } from '@/text/snapshot.ts';

/** The backend's rule: 8 characters minimum, 72 bytes maximum (bcrypt ignores anything past 72 bytes). No composition rules. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

export type IdentifierKind = 'email' | 'phone';

export interface IdentifierInput {
  kind: IdentifierKind;
  email: string;
  /** The national number as typed (or an international one pasted), never the composed value. */
  phone: string;
  /** ISO-3166-1 alpha-2 the dial-code picker is set to, or ''. */
  prefix: string;
}

export type IdentifierResult =
  | { ok: true; identifier: PasswordIdentifier }
  | { ok: false; field: IdentifierKind; message: string };

const emailRule = z.string().trim().toLowerCase().email().max(255);
const E164 = /^\+\d{6,15}$/;
const ISO2 = /^[A-Za-z]{2}$/;

/**
 * Builds the one identifier the backend wants (`{ email }` or `{ phone, phoneCountry? }`). A phone goes through
 * the same `composePhoneNumber` guest checkout uses, so the stored login phone and the one typed at sign-in are
 * normalised from the same input. A number that cannot be made `+digits` is refused here rather than sent raw.
 * Reads the text snapshot: call from handlers only.
 */
export function buildIdentifier(input: IdentifierInput): IdentifierResult {
  const { t } = textSnapshot();
  if (input.kind === 'email') {
    const raw = input.email.trim();
    if (!raw) return { ok: false, field: 'email', message: t('checkout.errors.required') };
    const parsed = emailRule.safeParse(raw);
    if (!parsed.success) return { ok: false, field: 'email', message: t('checkout.errors.emailInvalid') };
    return { ok: true, identifier: { email: parsed.data } };
  }
  if (!input.phone.trim()) return { ok: false, field: 'phone', message: t('checkout.errors.required') };
  const composed = composePhoneNumber(input.prefix, input.phone);
  if (!composed || !E164.test(composed)) return { ok: false, field: 'phone', message: t('auth.password.phoneInvalid') };
  const country = input.prefix.trim().toUpperCase();
  return { ok: true, identifier: { phone: composed, ...(ISO2.test(country) ? { phoneCountry: country } : {}) } };
}

/** A new password: `null` when acceptable, else the resolved message. Never trims. Call from handlers only. */
export function checkNewPassword(password: string): string | null {
  const { t } = textSnapshot();
  if (password.length < PASSWORD_MIN_LENGTH) return t('auth.password.tooShort');
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return t('auth.password.tooLong');
  return null;
}

/** The password being proven (sign-in, "current password"): it only has to exist. Call from handlers only. */
export function checkCurrentPassword(password: string): string | null {
  return password.length === 0 ? textSnapshot().t('checkout.errors.required') : null;
}
