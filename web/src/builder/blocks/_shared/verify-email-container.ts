import { part, type ContainerSpec } from '@/builder/parts.ts';

const PARTS = ['VerifyEmailHeading', 'VerifyEmailStatus'] as const;

/** The heading, then the status panel that carries the outcome. Both required. */
export const VERIFY_EMAIL_CONTAINER: ContainerSpec = {
  family: 'verify-email',
  required: PARTS,
  unique: PARTS,
  insertSlot: 'content',
  defaultSlots: (_props, { id }) => ({ content: PARTS.map((p) => part(p, id)) }),
};
