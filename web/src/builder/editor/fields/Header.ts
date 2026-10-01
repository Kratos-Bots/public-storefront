import type { Field, Fields } from '@puckeditor/core';
import { blockFields } from '@/builder/editor/derive-fields.ts';
import { HEADER_TOP_BAR_NOTICE } from '@/builder/editor/container-parts.ts';

const base = blockFields('Header');

/**
 * Header: fields derived from the block's zod schema (put overrides in `blockFields`' second argument).
 * `topBar` carries a `description`; Puck draws none, so the Parts panel also shows it (container-parts.ts).
 */
export const fields: Fields = { ...base, topBar: { ...base.topBar, description: HEADER_TOP_BAR_NOTICE } as unknown as Field };
