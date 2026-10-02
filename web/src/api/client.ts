import ky, { HTTPError } from 'ky';
import { ApiError } from '@/lib/errors.ts';
import { useSessionStore } from '@/stores/session.ts';
import { closedGate } from '@/app/closed-gate.ts';
import { accessGate } from '@/app/access-gate.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { textSnapshot } from '@/text/snapshot.ts';

// Re-exported so callers (and this task's test) can `import { ApiError } from '@/api/client.ts'`
// without also reaching into `@/lib/errors.ts`; the class itself still lives there.
export { ApiError };

interface Envelope<T> { success: boolean; data: T; error: string | null; meta?: unknown }

// ky's URL resolution needs an absolute base in this environment: the browser accepts a
// relative `prefixUrl` (resolved against document.baseURI), but under Vitest/jsdom (and any
// non-DOM SSR context) `new URL('/api/...')` with no base throws. `window.location.origin` is
// always present in the browser and in jsdom (defaults to http://localhost:3000), so anchor to
// it when available and fall back to the bare relative prefix otherwise.
const prefixUrl = typeof window !== 'undefined' ? `${window.location.origin}/api` : '/api';

/**
 * A seam for the page builder's fixture mode (spec §6), which must answer session-bound
 * calls with fake data and never let a fake token or a mutation reach the backend. Runs after
 * the Authorization header is set. Returning a Response short-circuits the network (ky still
 * applies its `ok` check, so a 4xx becomes an ApiError); returning a Request replaces the
 * request; returning nothing lets it through.
 *
 * Nothing in the shopper bundle ever installs one, and it cannot be installed outside builder
 * mode: setApiInterceptor throws unless isBuilderMode() (a framed /__builder?sf-builder=1),
 * and an installed interceptor is only consulted while that still holds. With none installed
 * the request path is exactly the pre-seam one.
 */
export type ApiInterceptor = (request: Request) => Response | Request | void | Promise<Response | Request | void>;

let interceptor: ApiInterceptor | null = null;

/** Installs `fn` (or clears with null); the returned off() removes only its own interceptor. */
export function setApiInterceptor(fn: ApiInterceptor | null): () => void {
  if (fn && !isBuilderMode()) throw new Error('setApiInterceptor is only available in builder mode');
  interceptor = fn;
  return () => {
    if (interceptor === fn) interceptor = null;
  };
}

export const api = ky.create({
  prefixUrl,
  timeout: 20_000,
  retry: { limit: 1, methods: ['get'] },
  hooks: {
    beforeRequest: [
      (request) => {
        const token = useSessionStore.getState().token;
        if (token) request.headers.set('Authorization', `Bearer ${token}`);
      },
      // Must stay last: ky stops running beforeRequest hooks once one returns a Request.
      (request) => (interceptor && isBuilderMode() ? interceptor(request) : undefined),
    ],
  },
});

async function toApiError(err: unknown): Promise<never> {
  if (err instanceof HTTPError) {
    let message = err.response.statusText || textSnapshot().t('errors.requestFailed');
    try { const body = (await err.response.clone().json()) as Partial<Envelope<unknown>>; if (typeof body.error === 'string' && body.error) message = body.error; } catch { /* non-JSON */ }
    const apiErr = new ApiError(err.response.status, message);
    if (apiErr.isUnauthorized) useSessionStore.getState().clear();
    if (apiErr.isStorefrontDisabled) closedGate.getState().setClosed(true);
    if (apiErr.isAccessDenied) accessGate.getState().setDenied(true);
    throw apiErr;
  }
  if (err instanceof Error && err.name === 'TimeoutError') throw new ApiError(0, textSnapshot().t('errors.timeout'));
  throw new ApiError(0, textSnapshot().t('errors.network'));
}

export async function unwrap<T>(p: Promise<Response>): Promise<T> {
  try {
    const body = (await (await p).json()) as Envelope<T>;
    if (!body.success) throw new ApiError(500, body.error ?? textSnapshot().t('errors.requestFailed'));
    return body.data;
  } catch (err) { if (err instanceof ApiError) throw err; return toApiError(err); }
}

export async function unwrapWithMeta<T, M>(p: Promise<Response>): Promise<{ data: T; meta: M }> {
  try {
    const body = (await (await p).json()) as Envelope<T> & { meta: M };
    if (!body.success) throw new ApiError(500, body.error ?? textSnapshot().t('errors.requestFailed'));
    return { data: body.data, meta: body.meta };
  } catch (err) { if (err instanceof ApiError) throw err; return toApiError(err); }
}
