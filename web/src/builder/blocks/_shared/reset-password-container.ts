import { part, type ContainerSpec } from '@/builder/parts.ts';

const PARTS = ['ResetPasswordHeading', 'ResetPasswordForm'] as const;

/** The heading, then the form (or the expired / checking panel the form part draws). Both required: a reset page without either is not one. */
export const RESET_PASSWORD_CONTAINER: ContainerSpec = {
  family: 'reset-password',
  required: PARTS,
  unique: PARTS,
  insertSlot: 'content',
  defaultSlots: (_props, { id }) => ({ content: PARTS.map((p) => part(p, id)) }),
};
