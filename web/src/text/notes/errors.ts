/** Editor-only notes for area `errors`: where each line appears, in shopper words (Text panel). */
export default {
  'generic': 'Error shown when something fails and there is no more specific message',
  'rateLimited': 'Error shown after too many attempts in a short time',
  'unavailable': 'Error shown when the shop\'s server cannot be reached for a moment',
  'requestFailed': 'Error shown when a request fails without any explanation from the server',
  'timeout': 'Error shown when the server takes too long to answer',
  'network': 'Error shown when the shopper\'s connection drops during a request',
  'loginRequired': 'Error shown when the shop needs a sign-in and the shopper is not signed in',
  'accessDenied': 'Error shown when a signed-in customer is not allowed into a private shop',
  'registrationClosed': 'Error shown when someone tries to create an account while the shop is not taking new customers',
} as const satisfies Record<string, string>;
