import { blockFields } from '@/builder/editor/derive-fields.ts';

/** ProductGroup: the kind names what the wrapper looks like, not its CSS class. */
export const fields = blockFields('ProductGroup', {
  kind: { type: 'radio', label: 'Arrangement', options: [
    { label: 'Side by side', value: 'priceRow' }, { label: 'Text beside thumbnail', value: 'identity' }, { label: 'Text column', value: 'identityText' },
  ] },
});
