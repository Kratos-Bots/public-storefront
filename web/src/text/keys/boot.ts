import { defineTextArea } from '@/text/define.ts';

/** Area `boot`: the screen shown when the shop's settings cannot load; every key is fixed (editable-text spec §6.1, §6.2). */
export default defineTextArea('boot', {
  'eyebrow': { en: 'Connection', note: 'Small heading when the shop cannot be reached at all (not editable)', fixed: true },
  'titleNamed': { en: "We can't reach {shop}", note: 'Heading when the shop cannot be reached and its name is known; {shop} is the shop name (not editable)', fixed: true },
  'title': { en: "We can't reach the shop", note: 'Heading when the shop cannot be reached and its name is unknown (not editable)', fixed: true },
  'description': { en: 'Check your connection and try again.', note: 'Text under the "can\'t reach" heading (not editable)', fixed: true },
  'retry': { en: 'Try again', note: 'Retry button when the shop cannot be reached (not editable)', max: 40, fixed: true },
});
