import { defineTextArea } from '@/text/define.ts';

const DAY_NOTE = 'Day shown before the cut-off sentence when the cut-off is not today';

/** Area `notices`: banner controls and the dispatch cut-off bar. The notices' own wording is owner content. */
export default defineTextArea('notices', {
  'banners.pinnedLabel': { en: 'Pinned store notices', note: 'Screen-reader label of the notices pinned at the top', max: 60 },
  'banners.label': { en: 'Store notices', note: 'Screen-reader label of the notices under the header', max: 60 },
  'banners.dismissTitled': { en: 'Dismiss: {title}', note: "Screen-reader label of a notice's close button; {title} is the notice title", max: 120 },
  'banners.dismiss': { en: 'Dismiss notice', note: "Screen-reader label of a notice's close button when it has no title", max: 60 },
  'cutoff.ariaLabel': { en: 'Dispatch cut-off', note: 'Screen-reader label of the dispatch cut-off bar', max: 60 },
  'cutoff.message': { en: 'Order by {time} for {dispatch} dispatch', note: 'Dispatch cut-off bar sentence; {time} is the cut-off time and {dispatch} the dispatch day', max: 120 },
  'cutoff.left': { en: '{time} left', note: 'Countdown at the end of the dispatch cut-off bar; {time} is the time remaining', max: 40 },
  'cutoff.days.mon': { en: 'Mon', note: DAY_NOTE, max: 20 },
  'cutoff.days.tue': { en: 'Tue', note: DAY_NOTE, max: 20 },
  'cutoff.days.wed': { en: 'Wed', note: DAY_NOTE, max: 20 },
  'cutoff.days.thu': { en: 'Thu', note: DAY_NOTE, max: 20 },
  'cutoff.days.fri': { en: 'Fri', note: DAY_NOTE, max: 20 },
  'cutoff.days.sat': { en: 'Sat', note: DAY_NOTE, max: 20 },
  'cutoff.days.sun': { en: 'Sun', note: DAY_NOTE, max: 20 },
});
