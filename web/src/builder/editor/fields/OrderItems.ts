import { blockFields } from '@/builder/editor/derive-fields.ts';

/** OrderItems: fields derived from the block's zod schema; put overrides in the second argument. */
export const fields = blockFields('OrderItems');
