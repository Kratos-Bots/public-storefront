import common from '@/text/packs/fr/common.ts';
import shell from '@/text/packs/fr/shell.ts';
import catalog from '@/text/packs/fr/catalog.ts';
import product from '@/text/packs/fr/product.ts';
import cart from '@/text/packs/fr/cart.ts';
import checkout from '@/text/packs/fr/checkout.ts';
import auth from '@/text/packs/fr/auth.ts';
import account from '@/text/packs/fr/account.ts';
import order from '@/text/packs/fr/order.ts';
import payment from '@/text/packs/fr/payment.ts';
import tracking from '@/text/packs/fr/tracking.ts';
import reviews from '@/text/packs/fr/reviews.ts';
import faq from '@/text/packs/fr/faq.ts';
import support from '@/text/packs/fr/support.ts';
import verify from '@/text/packs/fr/verify.ts';
import wholesale from '@/text/packs/fr/wholesale.ts';
import webapp from '@/text/packs/fr/webapp.ts';
import notices from '@/text/packs/fr/notices.ts';
import errors from '@/text/packs/fr/errors.ts';
import templates from '@/text/packs/fr/templates.ts';
import type { Pack } from '@/text/packs/index.ts';

/** The fr built-in pack: every non-fixed area, frozen. */
const pack: Pack = Object.freeze({
  ...common,
  ...shell,
  ...catalog,
  ...product,
  ...cart,
  ...checkout,
  ...auth,
  ...account,
  ...order,
  ...payment,
  ...tracking,
  ...reviews,
  ...faq,
  ...support,
  ...verify,
  ...wholesale,
  ...webapp,
  ...notices,
  ...errors,
  ...templates,
});
export default pack;
