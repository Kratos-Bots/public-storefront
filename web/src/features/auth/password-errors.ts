import { ApiError, errorMessage } from '@/lib/errors.ts';
import { textSnapshot } from '@/text/snapshot.ts';

export type PasswordContext = 'signin' | 'signup' | 'forgot' | 'reset' | 'set' | 'verify';

/**
 * The shopper-facing sentence for a failed password call. The backend's own strings for 401/409/403 are
 * deliberately never shown (they are developer-facing and, for 409, intentionally generic). Everything not
 * listed falls through to `errorMessage` (429 → the shared rate-limit sentence, 502, transport failures,
 * a 422's validation text). A wrong current password is `422 CURRENT_PASSWORD_INCORRECT`; callers with a
 * current-password field show it there rather than as a form-level error. Reads the text snapshot: call from handlers only.
 */
export function passwordErrorMessage(err: unknown, context: PasswordContext): string {
  const { t } = textSnapshot();
  if (err instanceof ApiError) {
    if (err.isBanned) return t('auth.password.banned');
    if (err.status === 401 && context === 'signin') return t('auth.password.invalid');
    if (err.isCurrentPasswordIncorrect) return t('auth.password.wrongCurrent');
    if (err.status === 409) return t('auth.password.taken');
    if (err.status === 404) return t('auth.password.unavailable');
  }
  return errorMessage(err);
}

/** The words the shop's WhatsApp bot recognises. Fixed (the backend matches it), so deliberately not a registry key. */
export const RESET_KEYWORD = 'RESET PASSWORD';

/** `https://wa.me/<digits>?text=RESET%20PASSWORD`, or null when there is no number to message. */
export function whatsappResetHref(number: string | null): string | null {
  const digits = (number ?? '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(RESET_KEYWORD)}` : null;
}
