import { blockFields } from '@/builder/editor/derive-fields.ts';

/** Button: fields derived from the block's zod schema; put overrides in the second argument. */
export const fields = blockFields('Button');
