import { useCallback, useEffect, useRef, useState } from 'react';
import { searchServicePoints } from '@/api/service-points.ts';
import { ApiError } from '@/lib/errors.ts';
import type { ServicePoint } from '@/types/service-points.ts';

export type PointSearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'results'; points: ServicePoint[] }
  | { status: 'empty' }
  /** `busy`: the shopper has searched too often (429). `failed`: anything else. */
  | { status: 'error'; kind: 'busy' | 'failed' };

const IDLE: PointSearchState = { status: 'idle' };

/**
 * Collection points near a postcode in `country`. Each search aborts the one
 * before it and carries a sequence number, so a slow earlier answer can never
 * replace a later one, and an answer for a country the shopper has since left
 * is dropped. Results are not kept across a country change.
 */
export function usePointSearch(country: string): { state: PointSearchState; search: (postcode: string) => void } {
  const [state, setState] = useState<PointSearchState>(IDLE);
  const seq = useRef(0);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    seq.current += 1;
    inFlight.current?.abort();
    setState(IDLE);
  }, [country]);

  useEffect(() => () => inFlight.current?.abort(), []);

  const search = useCallback(
    (postcode: string) => {
      const query = postcode.trim();
      if (query.length < 2 || !country) return;
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      const mine = (seq.current += 1);
      setState({ status: 'searching' });
      searchServicePoints(country, query, controller.signal).then(
        (found) => {
          if (mine !== seq.current) return;
          // A point the order endpoint would reject (no city, postcode, id or carrier) is never offered.
          const usable = found.available ? found.points.filter((p) => [p.id, p.carrier, p.city, p.postalCode].every((v) => typeof v === 'string' && v.trim() !== '')) : [];
          setState(usable.length > 0 ? { status: 'results', points: usable } : { status: 'empty' });
        },
        (err: unknown) => {
          if (mine !== seq.current) return;
          setState({ status: 'error', kind: err instanceof ApiError && err.status === 429 ? 'busy' : 'failed' });
        },
      );
    },
    [country],
  );

  return { state, search };
}
