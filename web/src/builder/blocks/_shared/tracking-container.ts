import { part, type ContainerSpec } from '@/builder/parts.ts';

const PARTS = ['TrackingIntro', 'TrackingState', 'TrackingForm', 'TrackingHero', 'TrackingProgress', 'TrackingRefresh',
  'TrackingNotice', 'TrackingParcels'] as const;

/** Spec §5.7. `State` before `Form` reproduces v0.7.0's not-found order (screen, then the retry form). */
export const TRACKING_CONTAINER: ContainerSpec = {
  family: 'tracking',
  insertSlot: 'main',
  required: ['TrackingIntro', 'TrackingState', 'TrackingForm', 'TrackingHero', 'TrackingParcels'],
  unique: PARTS,
  // `result` only renders once an answer exists: these would vanish exactly when they matter.
  slotRejects: { result: ['TrackingIntro', 'TrackingState', 'TrackingForm'] },
  defaultSlots: (_props, { id }) => ({
    top: [part('TrackingIntro', id)],
    main: [part('TrackingState', id), part('TrackingForm', id)],
    result: ['TrackingHero', 'TrackingProgress', 'TrackingRefresh', 'TrackingNotice', 'TrackingParcels'].map((t) => part(t, id)),
  }),
};
