import type { ArrayField } from '@puckeditor/core';
import { blockFields } from '@/builder/editor/derive-fields.ts';

const items = blockFields('FAQ').items as ArrayField;

/**
 * FAQ: fields derived from the block's zod schema. A new question starts filled in: the block
 * drops rows with an empty question, so a blank row would not appear on the canvas at all.
 */
export const fields = blockFields('FAQ', {
  items: { ...items, defaultItemProps: { question: 'New question', answerHtml: '<p>Write the answer here.</p>' } },
});
