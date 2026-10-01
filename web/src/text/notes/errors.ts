/** Editor-only notes for area `errors`: where each line appears, in shopper words (Text panel). */
export default {
  'generic': 'Error shown when something fails and there is no more specific message',
  'rateLimited': 'Error shown after too many attempts in a short time',
  'unavailable': 'Error shown when the shop\'s server cannot be reached for a moment',
  'requestFailed': 'Error shown when a request fails without any explanation from the server',
  'timeout': 'Error shown when the server takes too long to answer',
  'network': 'Error shown when the shopper\'s connection drops during a request',
} as const satisfies Record<string, string>;
