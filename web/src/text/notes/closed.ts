/** Editor-only notes for area `closed`: where each line appears, in shopper words (Text panel). */
export default {
  'eyebrow': 'Small heading on the page shown while the shop is closed (not editable)',
  'message': 'Shown while the shop is closed when no closed message is set in settings; {shop} is the shop name (not editable)',
  'supportAriaLabel': 'Screen-reader name of the support links on the closed page (not editable)',
} as const satisfies Record<string, string>;
