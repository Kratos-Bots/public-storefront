import { createFamily } from '@/builder/parts.ts';
import type { TrackingLookup } from '@/types/tracking.ts';

// Type-only feature imports: this module is in the shopper's entry bundle.

export type TrackingPhase = 'idle' | 'pending' | 'found' | 'notFound' | 'error' | 'blocked';

export interface TrackingData {
  phase: TrackingPhase;
  /** A strip instead of the masthead: an answer exists or is a moment away. */
  compact: boolean;
  data: TrackingLookup | undefined;
  isRefreshing: boolean;
  /** On the skeleton with no token yet: drives the "checking you're human" line. */
  awaitingToken: boolean;
  /** The status behind an `error` phase (0 = network). */
  errorStatus: number | null;
  /** Look the same reference up again. */
  retry(): void;
  /** Ask the courier network for a fresher answer. */
  refresh(): void;
  /** Reload the page (the blocked screen's only honest action). */
  reload(): void;
}
export const TrackingFamily = createFamily<TrackingData>('tracking');

/** What the editor previews a tracking state as (no network, no challenge). */
export interface TrackingPreview { phase: TrackingPhase; compact: boolean; data?: TrackingLookup; errorStatus?: number | null }
