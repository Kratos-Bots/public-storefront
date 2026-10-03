import { defineTextArea } from '@/text/define.ts';

/** Area `errors`: fallback error wording when the backend gives no message of its own (editable-text spec §6.1). */
export default defineTextArea('errors', {
  'generic': { en: 'Something went wrong', max: 120 },
  'rateLimited': { en: 'Too many attempts — please wait a moment and try again', max: 120 },
  'unavailable': { en: 'The store is temporarily unavailable', max: 120 },
  'requestFailed': { en: 'Request failed', max: 120 },
  'timeout': { en: 'The request timed out', max: 120 },
  'network': { en: 'Network error', max: 120 },
  'loginRequired': { en: 'Please sign in to continue.', max: 120 },
  'accessDenied': { en: 'Your account doesn’t have access to this shop.', max: 160 },
  'registrationClosed': { en: 'This shop isn’t taking new customers right now.', max: 160 },
});
