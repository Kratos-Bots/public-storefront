import { defineTextArea } from '@/text/define.ts';

/** Area `verify`: the product-verification page (/verify). */
export default defineTextArea('verify', {
  'page.eyebrow': { en: 'Authenticity', note: 'Small label above the title on the product-verification page', max: 40 },
  'page.title': { en: 'Verify a product', note: 'Title of the product-verification page', max: 80 },
  'page.lead': { en: 'Enter the codes printed on your product label to confirm it\'s genuine.', note: 'Line under the title on the product-verification page' },
  'form.codeLabel': { en: 'Verification code', note: 'Label of the first code box on the verification form', max: 40 },
  'form.codePlaceholder': { en: 'AB3D-SKU12', note: 'Example code shown inside the empty verification-code box', max: 40 },
  'form.authLabel': { en: 'Authentication code', note: 'Label of the second code box on the verification form', max: 40 },
  'form.submit': { en: 'Verify product', note: 'Button that checks the code pair', max: 40 },
  'errors.digitsOnly': { en: 'Digits only', note: 'Error beside the authentication-code label when it contains anything but digits', max: 60 },
  'result.verifiedHead': { en: 'Authentic Product', note: 'Heading when the code pair matches a genuine unit', max: 60 },
  'result.verifiedBody': { en: 'This code matches a genuine unit from our records.', note: 'Text when the code pair matches a genuine unit' },
  'result.issued': { en: 'Issued', note: 'Label of the date the unit was issued, on a genuine result', max: 30 },
  'result.expires': { en: 'Expires', note: 'Label of the date the unit expires, on a genuine result', max: 30 },
  'result.expiredNote': { en: 'Note: this unit is past its expiry date.', note: 'Note on a genuine result whose expiry date has passed' },
  'result.invalidHead': { en: 'Not Verified', note: 'Heading when the code pair matches nothing', max: 60 },
  'result.invalidBody': { en: 'We couldn\'t match this code pair to a genuine unit. Double-check both codes exactly as printed on the label.', note: 'Text when the code pair matches nothing' },
  'result.invalidHint': { en: 'If they\'re correct and still don\'t verify, contact us and our team will check manually.', note: 'Second line when the code pair matches nothing' },
  'result.errorHead': { en: 'Connection Error', note: 'Heading when the verification service could not be reached', max: 60 },
  'result.errorBody': { en: 'We couldn\'t reach the verification service. Try again in a moment, or contact us below.', note: 'Text when the verification service could not be reached' },
});
