import { createContext, createElement, useContext, type ReactNode } from 'react';

export type PreviewAs = { session: 'signed-out' | 'signed-in' | 'signed-in-orders'; cart: 'empty' | 'items' };
export interface BuilderMode {
  editing: boolean;
  previewAs: PreviewAs | null;
  /** Container name to the state id the editor previews it in (stage 4). */
  previewStates?: Readonly<Record<string, string>> | null;
  /** Container name to a fixture object, built by the editor. */
  previewFixtures?: Readonly<Record<string, unknown>> | null;
}

/** State ids per container; the first of each is the editor's default. */
export const PREVIEW_STATE_IDS = {
  OrdersList: ['orders', 'none', 'more'], Loyalty: ['rewards', 'no-points'], Referrals: ['new', 'referred'],
  Profile: ['website', 'webapp'], PaymentSuccess: ['reference', 'missing'], PaymentCancel: ['saved', 'unsaved', 'no-reference'],
  OrderPlaced: ['chat', 'warning', 'no-chat', 'missing'],
  TrackingLookup: ['form', 'found-2', 'found-1', 'nothing-shipped', 'not-found', 'error'],
  VerifyForm: ['form', 'authentic', 'expired', 'not-verified', 'error'],
  ResetPassword: ['form', 'set', 'expired', 'checking', 'unreachable'],
  VerifyEmail: ['verifying', 'done', 'invalid', 'otherAccount', 'error'],
  OrderStatus: ['shipped', 'awaiting-payment', 'hosted-open', 'crypto-checking', 'two-parcels', 'cancelled'],
} as const;

const SHOPPER: BuilderMode = { editing: false, previewAs: null };
const BuilderModeContext = createContext<BuilderMode>(SHOPPER);

/** The editor (Plan 3) wraps its canvas in this; shoppers never see it. (.ts, so no JSX.) */
export function BuilderModeProvider({ value, children }: { value: BuilderMode; children: ReactNode }) {
  return createElement(BuilderModeContext.Provider, { value }, children);
}

export function useBuilderMode(): BuilderMode {
  return useContext(BuilderModeContext);
}

/** The state the editor previews `container` in; null for shoppers and when unset. Own-key lookup. */
export function usePreviewState(container: string): string | null {
  const states = useContext(BuilderModeContext).previewStates;
  return states && Object.hasOwn(states, container) ? states[container] ?? null : null;
}

/**
 * The fixture the editor supplies for `container`; null for shoppers and when unset.
 *
 * THE PREVIEW RULE (every container): a container is in preview iff its fixture is non-null. The
 * state id (usePreviewState) only picks a variant inside that preview and is never a switch on its
 * own; a preview never fires the container's queries or lookups.
 */
export function usePreviewFixture<T>(container: string): T | null {
  const fixtures = useContext(BuilderModeContext).previewFixtures;
  return fixtures && Object.hasOwn(fixtures, container) ? (fixtures[container] as T) : null;
}
