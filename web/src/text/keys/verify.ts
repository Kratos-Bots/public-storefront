import { defineTextArea } from '@/text/define.ts';

/** Area `verify`: the product-verification page (/verify). */
export default defineTextArea('verify', {
  'page.eyebrow': { en: 'Authenticity', max: 40 },
  'page.title': { en: 'Verify a product', max: 80 },
  'page.lead': { en: 'Enter the codes printed on your product label to confirm it\'s genuine.' },
  'form.codeLabel': { en: 'Verification code', max: 40 },
  'form.codePlaceholder': { en: 'AB3D-SKU12', max: 40 },
  'form.authLabel': { en: 'Authentication code', max: 40 },
  'form.submit': { en: 'Verify product', max: 40 },
  'errors.digitsOnly': { en: 'Digits only', max: 60 },
  'result.verifiedHead': { en: 'Authentic Product', max: 60 },
  'result.verifiedBody': { en: 'This code matches a genuine unit from our records.' },
  'result.issued': { en: 'Issued', max: 30 },
  'result.expires': { en: 'Expires', max: 30 },
  'result.expiredNote': { en: 'Note: this unit is past its expiry date.' },
  'result.invalidHead': { en: 'Not Verified', max: 60 },
  'result.invalidBody': { en: 'We couldn\'t match this code pair to a genuine unit. Double-check both codes exactly as printed on the label.' },
  'result.invalidHint': { en: 'If they\'re correct and still don\'t verify, contact us and our team will check manually.' },
  'result.errorHead': { en: 'Connection Error', max: 60 },
  'result.errorBody': { en: 'We couldn\'t reach the verification service. Try again in a moment, or contact us below.' },
});
