import { blockFields } from '@/builder/editor/derive-fields.ts';

/** VerifyForm: fields derived from the block's zod schema; put overrides in the second argument. */
export const fields = blockFields('VerifyForm');
