/** Editor-only notes for area `boot`: where each line appears, in shopper words (Text panel). */
export default {
  'eyebrow': 'Small heading when the shop cannot be reached at all (not editable)',
  'titleNamed': 'Heading when the shop cannot be reached and its name is known; {shop} is the shop name (not editable)',
  'title': 'Heading when the shop cannot be reached and its name is unknown (not editable)',
  'description': 'Text under the "can\'t reach" heading (not editable)',
  'retry': 'Retry button when the shop cannot be reached (not editable)',
} as const satisfies Record<string, string>;
