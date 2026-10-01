import { defineTextArea } from '@/text/define.ts';

/** Area `closed`: the page shown while the shop is closed; every key is fixed (editable-text spec §6.1, §6.2). */
export default defineTextArea('closed', {
  'eyebrow': { en: 'Currently closed', fixed: true },
  'message': { en: "{shop} isn't taking orders right now. Check back shortly.", fixed: true },
  'supportAriaLabel': { en: 'Support', max: 40, fixed: true },
});
