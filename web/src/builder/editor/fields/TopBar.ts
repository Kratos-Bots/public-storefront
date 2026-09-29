import { blockFields } from '@/builder/editor/derive-fields.ts';

/** TopBar: fields derived from the block's zod schema; put overrides in the second argument. */
export const fields = blockFields('TopBar');
