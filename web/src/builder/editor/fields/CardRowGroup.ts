import { blockFields } from '@/builder/editor/derive-fields.ts';

/** CardRowGroup: the kind names what the wrapper holds, not its CSS class. */
export const fields = blockFields('CardRowGroup', {
  kind: { type: 'radio', label: 'Arrangement', options: [{ label: 'Text column', value: 'text' }] },
});
