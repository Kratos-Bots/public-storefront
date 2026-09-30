import { defineTextArea } from '@/text/define.ts';

/** Area `notices`: banner controls and the dispatch cut-off bar. The notices' own wording is owner content. */
export default defineTextArea('notices', {
  'banners.pinnedLabel': { en: 'Pinned store notices', max: 60 },
  'banners.label': { en: 'Store notices', max: 60 },
  'banners.dismissTitled': { en: 'Dismiss: {title}', max: 120 },
  'banners.dismiss': { en: 'Dismiss notice', max: 60 },
  'cutoff.ariaLabel': { en: 'Dispatch cut-off', max: 60 },
  'cutoff.message': { en: 'Order by {time} for {dispatch} dispatch', max: 120 },
  'cutoff.left': { en: '{time} left', max: 40 },
  'cutoff.days.mon': { en: 'Mon', max: 20 },
  'cutoff.days.tue': { en: 'Tue', max: 20 },
  'cutoff.days.wed': { en: 'Wed', max: 20 },
  'cutoff.days.thu': { en: 'Thu', max: 20 },
  'cutoff.days.fri': { en: 'Fri', max: 20 },
  'cutoff.days.sat': { en: 'Sat', max: 20 },
  'cutoff.days.sun': { en: 'Sun', max: 20 },
});
