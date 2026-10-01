import { part, type ContainerSpec } from '@/builder/parts.ts';

const PARTS = ['VerifyIntro', 'VerifyFields', 'VerifyResult', 'VerifyBack'] as const;

/** Spec §5.8: one slot, the intro, the form, the verdict, the way back. */
export const VERIFY_CONTAINER: ContainerSpec = {
  family: 'verify',
  required: ['VerifyIntro', 'VerifyFields', 'VerifyResult'],
  unique: PARTS,
  insertSlot: 'content',
  defaultSlots: (_props, { id }) => ({ content: PARTS.map((p) => part(p, id)) }),
};
