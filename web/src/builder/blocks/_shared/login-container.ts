import { part, type ContainerSpec } from '@/builder/parts.ts';

/** Spec §5.5: the heading, then the ways in. Both required: a sign-in page without either is not one. */
export const LOGIN_CONTAINER: ContainerSpec = {
  family: 'login',
  defaultSlots: (_props, { id }) => ({ content: [part('LoginHeading', id), part('LoginMethods', id)] }),
  required: ['LoginHeading', 'LoginMethods'],
  unique: ['LoginHeading', 'LoginMethods'],
  insertSlot: 'content',
};
