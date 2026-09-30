import { defineTextArea } from '@/text/define.ts';

/** Area `closed`: the page shown while the shop is closed; every key is fixed (editable-text spec §6.1, §6.2). */
export default defineTextArea('closed', {
  'eyebrow': { en: 'Currently closed', note: 'Small heading on the page shown while the shop is closed (not editable)', fixed: true },
});
