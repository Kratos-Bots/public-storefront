// TODO(translate)
import type verify from '@/text/keys/verify.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "verify.page.eyebrow": "Authenticity",
  "verify.page.title": "Verify a product",
  "verify.page.lead": "Enter the codes printed on your product label to confirm it's genuine.",
  "verify.form.codeLabel": "Verification code",
  "verify.form.codePlaceholder": "AB3D-SKU12",
  "verify.form.authLabel": "Authentication code",
  "verify.form.submit": "Verify product",
  "verify.errors.digitsOnly": "Digits only",
  "verify.result.verifiedHead": "Authentic Product",
  "verify.result.verifiedBody": "This code matches a genuine unit from our records.",
  "verify.result.issued": "Issued",
  "verify.result.expires": "Expires",
  "verify.result.expiredNote": "Note: this unit is past its expiry date.",
  "verify.result.invalidHead": "Not Verified",
  "verify.result.invalidBody": "We couldn't match this code pair to a genuine unit. Double-check both codes exactly as printed on the label.",
  "verify.result.invalidHint": "If they're correct and still don't verify, contact us and our team will check manually.",
  "verify.result.errorHead": "Connection Error",
  "verify.result.errorBody": "We couldn't reach the verification service. Try again in a moment, or contact us below.",
} satisfies AreaPack<typeof verify>;
