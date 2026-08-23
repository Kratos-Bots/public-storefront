export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = 'ApiError'; this.status = status; }
  get isStorefrontDisabled(): boolean { return this.status === 503 && this.message === 'STOREFRONT_DISABLED'; }
  get isUnauthorized(): boolean { return this.status === 401; }
}
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Too many attempts — please wait a moment and try again';
    if (err.status === 502) return 'The store is temporarily unavailable';
    return err.message || fallback;
  }
  return fallback;
}
