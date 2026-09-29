import { blockFields } from '@/builder/editor/derive-fields.ts';

/** Video: fields derived from the block's zod schema; provider names spelled properly, `videoId` is the provider's id. */
export const fields = blockFields('Video', {
  provider: { type: 'radio', label: 'Provider', options: [{ label: 'YouTube', value: 'youtube' }, { label: 'Vimeo', value: 'vimeo' }] },
  videoId: { type: 'text', label: 'Video ID' },
});
