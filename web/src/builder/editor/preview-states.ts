import { useMemo } from 'react';
import { PREVIEW_STATE_IDS, type BuilderMode } from '@/builder/mode.ts';
import type { LayoutKind, DocKey } from '@/builder/types.ts';
import type { LoyaltyPreview } from '@/builder/family-loyalty.ts';
import type { OrdersPreview } from '@/builder/family-orders.ts';
import type { PaymentPreview } from '@/builder/family-payment.ts';
import type { ProfilePreview } from '@/builder/family-profile.ts';
import type { ReferralsPreview } from '@/builder/family-referrals.ts';
import type { TrackingPreview } from '@/builder/family-tracking.ts';
import type { VerifyPreview } from '@/builder/family-verify.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import {
  FIXTURE_CHAT_LINKS, FIXTURE_ORDERS, FIXTURE_ORDER_REF, FIXTURE_REDEEM, FIXTURE_TRACKING, fixtureProfile, fixtureVerification,
} from '@/builder/editor/fixtures.ts';

export type ContainerName = keyof typeof PREVIEW_STATE_IDS;

type Labelled = Array<{ id: string; label: string }>;

/** The "Preview state" options per container (spec §11.3); the first of each is the default. */
export const PREVIEW_STATE_LABELS: Record<ContainerName, Labelled> = {
  OrdersList: [{ id: 'orders', label: 'Orders' }, { id: 'none', label: 'No orders' }, { id: 'more', label: 'More to load' }],
  Loyalty: [{ id: 'rewards', label: 'With rewards' }, { id: 'no-points', label: 'No points' }],
  Referrals: [{ id: 'new', label: 'Not referred yet' }, { id: 'referred', label: 'Referred' }],
  Profile: [{ id: 'website', label: 'Website' }, { id: 'webapp', label: 'Web app (contact section)' }],
  PaymentSuccess: [{ id: 'reference', label: 'With reference' }, { id: 'missing', label: 'Missing reference' }],
  PaymentCancel: [{ id: 'saved', label: 'Saved order' }, { id: 'unsaved', label: 'No saved order' }, { id: 'no-reference', label: 'No reference' }],
  OrderPlaced: [
    { id: 'chat', label: 'Chat links' }, { id: 'warning', label: 'Warning' }, { id: 'no-chat', label: 'No chat links' }, { id: 'missing', label: 'Missing reference' },
  ],
  TrackingLookup: [
    { id: 'form', label: 'Lookup form' }, { id: 'found-2', label: 'Found (2 parcels)' }, { id: 'found-1', label: 'Found (1 parcel)' },
    { id: 'nothing-shipped', label: 'Nothing shipped' }, { id: 'not-found', label: 'Not found' }, { id: 'error', label: 'Error' },
  ],
  VerifyForm: [
    { id: 'form', label: 'Form' }, { id: 'authentic', label: 'Authentic' }, { id: 'expired', label: 'Expired' },
    { id: 'not-verified', label: 'Not verified' }, { id: 'error', label: 'Error' },
  ],
};

const CONTAINERS = Object.keys(PREVIEW_STATE_IDS) as ContainerName[];

/** The state a container previews in: the pick when it is one of its ids, else the default (first). */
function stateOf(container: ContainerName, states: Readonly<Record<string, string>>): string {
  const ids = PREVIEW_STATE_IDS[container] as readonly string[];
  const pick = Object.hasOwn(states, container) ? states[container] : undefined;
  return pick !== undefined && ids.includes(pick) ? pick : ids[0]!;
}

const PREVIEW_AS = { session: 'signed-in-orders', cart: 'items' } as const;

const BUILDERS: { [C in ContainerName]: (state: string, now: Date) => unknown } = {
  OrdersList: (state): OrdersPreview => ({ rows: state === 'none' ? [] : FIXTURE_ORDERS, hasNextPage: state === 'more' }),
  Loyalty: (state): LoyaltyPreview => {
    const none = state === 'no-points';
    const profile = { ...fixtureProfile(PREVIEW_AS), ...(none ? { loyaltyPoints: 0 } : {}) };
    return {
      profile,
      options: none
        ? { loyaltyPoints: 0, options: FIXTURE_REDEEM.options.map((o) => ({ ...o, affordable: false })) }
        : FIXTURE_REDEEM,
    };
  },
  Referrals: (state): ReferralsPreview => {
    const referred = state === 'referred';
    return { info: { ...fixtureProfile(PREVIEW_AS), hasReferrer: referred, referrerNickname: referred ? 'Ada' : null } };
  },
  Profile: (state): ProfilePreview => ({ surface: state === 'webapp' ? 'webapp' : 'website', profile: fixtureProfile(PREVIEW_AS) }),
  PaymentSuccess: (state): PaymentPreview => ({
    orderRef: state === 'missing' ? null : FIXTURE_ORDER_REF, saved: state !== 'missing', warning: false, whatsapp: null, telegram: null,
  }),
  PaymentCancel: (state): PaymentPreview => ({
    orderRef: state === 'no-reference' ? null : FIXTURE_ORDER_REF, saved: state === 'saved', warning: false, whatsapp: null, telegram: null,
  }),
  OrderPlaced: (state): PaymentPreview => {
    const chat = state === 'chat' || state === 'warning';
    return {
      orderRef: state === 'missing' ? null : FIXTURE_ORDER_REF, saved: false, warning: state === 'warning',
      whatsapp: chat ? FIXTURE_CHAT_LINKS.whatsapp : null, telegram: chat ? FIXTURE_CHAT_LINKS.telegram : null,
    };
  },
  TrackingLookup: (state): TrackingPreview => {
    switch (state) {
      case 'found-2': return { phase: 'found', compact: true, data: FIXTURE_TRACKING.twoParcels };
      case 'found-1': return { phase: 'found', compact: true, data: FIXTURE_TRACKING.oneParcel };
      case 'nothing-shipped': return { phase: 'found', compact: true, data: FIXTURE_TRACKING.nothingShipped };
      case 'not-found': return { phase: 'notFound', compact: false };
      case 'error': return { phase: 'error', compact: false, errorStatus: 500 };
      default: return { phase: 'idle', compact: false };
    }
  },
  VerifyForm: (state, now): VerifyPreview => {
    const v = fixtureVerification(now);
    switch (state) {
      case 'authentic': return { status: 'authentic', result: v.authentic };
      case 'expired': return { status: 'expired', result: v.expired };
      case 'not-verified': return { status: 'not-verified' };
      case 'error': return { status: 'error' };
      default: return { status: 'idle' };
    }
  },
};

/** A fixture for every stateful container, each in its picked state (default: its first). */
export function previewFixturesFor(states: Readonly<Record<string, string>>, now: Date = new Date()): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of CONTAINERS) out[c] = BUILDERS[c](stateOf(c, states), now);
  return out;
}

/** The effective state per container: the pick, or the default. */
export function previewStatesFor(states: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(CONTAINERS.map((c) => [c, stateOf(c, states)]));
}

const DOC_CONTAINER: Partial<Record<DocKey, ContainerName>> = {
  'account.orders': 'OrdersList',
  'account.loyalty': 'Loyalty',
  'account.referrals': 'Referrals',
  'account.profile': 'Profile',
  'payment-success': 'PaymentSuccess',
  'payment-cancel': 'PaymentCancel',
  'order-placed': 'OrderPlaced',
  tracking: 'TrackingLookup',
  verify: 'VerifyForm',
};

/** The stateful container a document holds (its Preview state applies), or null. */
export function containerOfDoc(docKey: DocKey, _layout: LayoutKind): ContainerName | null {
  return Object.hasOwn(DOC_CONTAINER, docKey) ? DOC_CONTAINER[docKey]! : null;
}

/**
 * The mode the editor's canvas and exact preview run in. A read-only view (a published version) is
 * the shopper's view, so it carries no preview states or fixtures: the containers read live data.
 */
export function useEditorMode(editing: boolean): BuilderMode {
  const previewAs = useEditorStore((s) => s.previewAs);
  const readOnly = useEditorStore((s) => s.readOnly);
  const picked = useEditorStore((s) => s.previewStates);
  return useMemo(() => {
    if (readOnly) return { editing, previewAs, previewStates: null, previewFixtures: null };
    return { editing, previewAs, previewStates: previewStatesFor(picked), previewFixtures: previewFixturesFor(picked) };
  }, [editing, previewAs, readOnly, picked]);
}
