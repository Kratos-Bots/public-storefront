import ky, { HTTPError } from 'ky';
import { ApiError } from '@/lib/errors.ts';
import { useSessionStore } from '@/stores/session.ts';
import { closedGate } from '@/app/closed-gate.ts';

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

export const api = ky.create({
  prefixUrl,
  timeout: 20_000,
  retry: { limit: 1, methods: ['get'] },
  hooks: {
    beforeRequest: [(request) => {
      const token = useSessionStore.getState().token;
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
    }],
  },
});

async function toApiError(err: unknown): Promise<never> {
  if (err instanceof HTTPError) {
    let message = err.response.statusText || 'Request failed';
    try { const body = (await err.response.clone().json()) as Partial<Envelope<unknown>>; if (typeof body.error === 'string' && body.error) message = body.error; } catch { /* non-JSON */ }
    const apiErr = new ApiError(err.response.status, message);
    if (apiErr.isUnauthorized) useSessionStore.getState().clear();
    if (apiErr.isStorefrontDisabled) closedGate.getState().setClosed(true);
    throw apiErr;
  }
  if (err instanceof Error && err.name === 'TimeoutError') throw new ApiError(0, 'The request timed out');
  throw new ApiError(0, 'Network error');
}

export async function unwrap<T>(p: Promise<Response>): Promise<T> {
  try {
    const body = (await (await p).json()) as Envelope<T>;
    if (!body.success) throw new ApiError(500, body.error ?? 'Request failed');
    return body.data;
  } catch (err) { if (err instanceof ApiError) throw err; return toApiError(err); }
}

export async function unwrapWithMeta<T, M>(p: Promise<Response>): Promise<{ data: T; meta: M }> {
  try {
    const body = (await (await p).json()) as Envelope<T> & { meta: M };
    if (!body.success) throw new ApiError(500, body.error ?? 'Request failed');
    return { data: body.data, meta: body.meta };
  } catch (err) { if (err instanceof ApiError) throw err; return toApiError(err); }
}
