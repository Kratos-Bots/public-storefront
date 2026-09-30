import { textSnapshot } from '@/text/runtime.tsx';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = 'ApiError'; this.status = status; }
  get isStorefrontDisabled(): boolean { return this.status === 503 && this.message === 'STOREFRONT_DISABLED'; }
  get isUnauthorized(): boolean { return this.status === 401; }
}
/** Resolved at call time (playbook rule 8), so the mounted provider's wording applies and nothing freezes at import. */
export function errorMessage(err: unknown, fallback?: string): string {
  const { t } = textSnapshot();
  const fb = fallback ?? t('errors.generic');
  if (err instanceof ApiError) {
    if (err.status === 429) return t('errors.rateLimited');
    if (err.status === 502) return t('errors.unavailable');
    return err.message || fb;
  }
  return fb;
}
