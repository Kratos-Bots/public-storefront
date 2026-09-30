import { defineTextArea } from '@/text/define.ts';

/** Area `closed`: the page shown while the shop is closed; every key is fixed (editable-text spec §6.1, §6.2). */
export default defineTextArea('closed', {
  'eyebrow': { en: 'Currently closed', note: 'Small heading on the page shown while the shop is closed (not editable)', fixed: true },
  'message': { en: "{shop} isn't taking orders right now. Check back shortly.", note: 'Shown while the shop is closed when no closed message is set in settings; {shop} is the shop name (not editable)', fixed: true },
  'supportAriaLabel': { en: 'Support', note: 'Screen-reader name of the support links on the closed page (not editable)', max: 40, fixed: true },
});
