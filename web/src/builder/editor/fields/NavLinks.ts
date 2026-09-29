import type { ArrayField } from '@puckeditor/core';
import { blockFields } from '@/builder/editor/derive-fields.ts';

const items = blockFields('NavLinks').items as ArrayField;

/**
 * NavLinks: fields derived from the block's zod schema. A new link starts with a label and the
 * home page: the block drops links without a label, so a blank one would not appear on the canvas.
 */
export const fields = blockFields('NavLinks', {
  items: { ...items, defaultItemProps: { label: 'New link', href: '/' } },
});
