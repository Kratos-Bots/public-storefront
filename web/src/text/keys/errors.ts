import { defineTextArea } from '@/text/define.ts';

/** Area `errors`: fallback error wording when the backend gives no message of its own (editable-text spec §6.1). */
export default defineTextArea('errors', {
  'generic': { en: 'Something went wrong', note: 'Error shown when something fails and there is no more specific message', max: 120 },
  'rateLimited': { en: 'Too many attempts — please wait a moment and try again', note: 'Error shown after too many attempts in a short time', max: 120 },
  'unavailable': { en: 'The store is temporarily unavailable', note: 'Error shown when the shop\'s server cannot be reached for a moment', max: 120 },
  'requestFailed': { en: 'Request failed', note: 'Error shown when a request fails without any explanation from the server', max: 120 },
  'timeout': { en: 'The request timed out', note: 'Error shown when the server takes too long to answer', max: 120 },
  'network': { en: 'Network error', note: 'Error shown when the shopper\'s connection drops during a request', max: 120 },
});
