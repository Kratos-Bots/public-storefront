import { blockFields } from '@/builder/editor/derive-fields.ts';

/** FAQ: fields derived from the block's zod schema; put overrides in the second argument. */
export const fields = blockFields('FAQ');
