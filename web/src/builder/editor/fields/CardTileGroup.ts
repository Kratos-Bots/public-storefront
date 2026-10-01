import { blockFields } from '@/builder/editor/derive-fields.ts';

/** CardTileGroup: the kind names what the wrapper holds, not its CSS class. */
export const fields = blockFields('CardTileGroup', {
  kind: { type: 'radio', label: 'Arrangement', options: [
    { label: 'Card body', value: 'body' }, { label: 'Card foot', value: 'foot' },
  ] },
});
