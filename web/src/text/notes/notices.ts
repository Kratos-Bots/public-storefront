/** Editor-only notes for area `notices`: where each line appears, in shopper words (Text panel). */
const DAY_NOTE = 'Day shown before the cut-off sentence when the cut-off is not today';

export default {
  'banners.pinnedLabel': 'Screen-reader label of the notices pinned at the top',
  'banners.label': 'Screen-reader label of the notices under the header',
  'banners.dismissTitled': "Screen-reader label of a notice's close button; {title} is the notice title",
  'banners.dismiss': "Screen-reader label of a notice's close button when it has no title",
  'pushInvite.aria': 'Screen-reader label of the banner that invites a phone shopper to turn on order notifications',
  'pushInvite.message': 'Sentence of that banner',
  'pushInvite.turnOn': 'Button of that banner that turns notifications on',
  'pushInvite.notNow': 'Button of that banner that dismisses it for a week',
  'cutoff.ariaLabel': 'Screen-reader label of the dispatch cut-off bar',
  'cutoff.message': 'Dispatch cut-off bar sentence; {time} is the cut-off time and {dispatch} the dispatch day',
  'cutoff.left': 'Countdown at the end of the dispatch cut-off bar; {time} is the time remaining',
  'cutoff.days.mon': DAY_NOTE,
  'cutoff.days.tue': DAY_NOTE,
  'cutoff.days.wed': DAY_NOTE,
  'cutoff.days.thu': DAY_NOTE,
  'cutoff.days.fri': DAY_NOTE,
  'cutoff.days.sat': DAY_NOTE,
  'cutoff.days.sun': DAY_NOTE,
} as const satisfies Record<string, string>;
