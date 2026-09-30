import { createUsePuck } from '@puckeditor/core';

/** Typed selector hook over Puck's internal store; only valid inside <Puck>. */
export const usePuck = createUsePuck();
export { useGetPuck } from '@puckeditor/core';
