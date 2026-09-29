import { api, unwrap } from '@/api/client.ts';
import { isRecord, type LayoutKind, type PageSet } from '@/builder/types.ts';

/** `{ version, data }` from the public route → the set, or null for anything that is not a schema-1 set. */
export function toPageSet(body: unknown): PageSet | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  const set = body.data;
  if (set.schemaVersion !== 1 || !isRecord(set.shell) || !isRecord(set.pages)) return null;
  return set as unknown as PageSet;
}

/**
 * The latest published set for a layout. Never rejects: a 404 (backend older than
 * v0.7.0), a 503 (kill switch), a network error or a malformed body all mean
 * "no published set", and every page renders its default document. `retry: 0`: the shared
 * client retries a GET once, which would make a 503 two requests on every page load.
 */
export async function fetchPageSet(layout: LayoutKind): Promise<PageSet | null> {
  try {
    return toPageSet(await unwrap<unknown>(api.get(`storefront/pages/${layout}`, { retry: 0 })));
  } catch {
    return null;
  }
}
