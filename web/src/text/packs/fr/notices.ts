// TODO(translate)
import type notices from '@/text/keys/notices.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "notices.banners.pinnedLabel": "Pinned store notices",
  "notices.banners.label": "Store notices",
  "notices.banners.dismissTitled": "Dismiss: {title}",
  "notices.banners.dismiss": "Dismiss notice",
  "notices.pushInvite.aria": "Order updates",
  "notices.pushInvite.message": "Get order updates on this phone",
  "notices.pushInvite.turnOn": "Turn on",
  "notices.pushInvite.notNow": "Not now",
  "notices.cutoff.ariaLabel": "Dispatch cut-off",
  "notices.cutoff.message": "Order by {time} for {dispatch} dispatch",
  "notices.cutoff.left": "{time} left",
  "notices.cutoff.days.mon": "Mon",
  "notices.cutoff.days.tue": "Tue",
  "notices.cutoff.days.wed": "Wed",
  "notices.cutoff.days.thu": "Thu",
  "notices.cutoff.days.fri": "Fri",
  "notices.cutoff.days.sat": "Sat",
  "notices.cutoff.days.sun": "Sun",
} satisfies AreaPack<typeof notices>;
