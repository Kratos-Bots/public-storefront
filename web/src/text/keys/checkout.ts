import { defineTextArea } from '@/text/define.ts';

/** Area `checkout`: the checkout steps and their field errors (editable-text spec §6.1). */
export default defineTextArea('checkout', {
  'errors.required': { en: 'Required', note: 'Under a checkout (or verification) field left empty', max: 60 },
  'errors.paymentMissing': { en: 'Choose how you’d like to pay', note: 'Checkout payment step, when Continue is pressed with no method chosen', max: 80 },
});
