import { textSnapshot } from '@/text/snapshot.ts';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = 'ApiError'; this.status = status; }
  get isStorefrontDisabled(): boolean { return this.status === 503 && this.message === 'STOREFRONT_DISABLED'; }
  get isUnauthorized(): boolean { return this.status === 401; }
  /** `403 ACCOUNT_BANNED`, the backend's sentinel for a banned customer (session creation, sign-in, reset). */
  get isBanned(): boolean { return this.status === 403 && this.message === 'ACCOUNT_BANNED'; }
  /** `503 WAREHOUSE_ORDERING_PAUSED`: the chosen warehouse stopped taking storefront orders. */
  get isWarehouseOrderingPaused(): boolean { return this.status === 503 && this.message === 'WAREHOUSE_ORDERING_PAUSED'; }
  /** `400 RESET_LINK_INVALID`: the reset token is unknown, expired or already used. */
  get isResetLinkInvalid(): boolean { return this.status === 400 && this.message === 'RESET_LINK_INVALID'; }
  /** `400 VERIFY_LINK_INVALID`: the verification token is unknown, expired or already used. */
  get isVerifyLinkInvalid(): boolean { return this.status === 400 && this.message === 'VERIFY_LINK_INVALID'; }
  /** `422 CURRENT_PASSWORD_INCORRECT`: the current password typed in Account was wrong. A 422 on purpose: this client clears the session on every 401. */
  get isCurrentPasswordIncorrect(): boolean { return this.status === 422 && this.message === 'CURRENT_PASSWORD_INCORRECT'; }
  /** The shop is not public and this request carried no session. */
  get isLoginRequired(): boolean { return this.status === 401 && this.message === 'LOGIN_REQUIRED'; }
  /** Signed in, but not an allowed customer of a restricted shop. */
  get isAccessDenied(): boolean { return this.status === 403 && this.message === 'ACCESS_DENIED'; }
  /** No new customers are being taken. */
  get isRegistrationClosed(): boolean { return this.status === 403 && this.message === 'REGISTRATION_CLOSED'; }
}
/** Resolved at call time (playbook rule 8), so the mounted provider's wording applies and nothing freezes at import. */
export function errorMessage(err: unknown, fallback?: string): string {
  const { t } = textSnapshot();
  const fb = fallback ?? t('errors.generic');
  if (err instanceof ApiError) {
    if (err.isLoginRequired) return t('errors.loginRequired');
    if (err.isAccessDenied) return t('errors.accessDenied');
    if (err.isRegistrationClosed) return t('errors.registrationClosed');
    if (err.status === 429) return t('errors.rateLimited');
    if (err.status === 502) return t('errors.unavailable');
    return err.message || fb;
  }
  return fb;
}
