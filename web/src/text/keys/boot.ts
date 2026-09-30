import { defineTextArea } from '@/text/define.ts';

/** Area `boot`: the screen shown when the shop's settings cannot load; every key is fixed (editable-text spec §6.1, §6.2). */
export default defineTextArea('boot', {
  'eyebrow': { en: 'Connection', fixed: true },
  'titleNamed': { en: "We can't reach {shop}", fixed: true },
  'title': { en: "We can't reach the shop", fixed: true },
  'description': { en: 'Check your connection and try again.', fixed: true },
  'retry': { en: 'Try again', max: 40, fixed: true },
});
