import common from '@/text/packs/es/common.ts';
import shell from '@/text/packs/es/shell.ts';
import catalog from '@/text/packs/es/catalog.ts';
import product from '@/text/packs/es/product.ts';
import cart from '@/text/packs/es/cart.ts';
import checkout from '@/text/packs/es/checkout.ts';
import auth from '@/text/packs/es/auth.ts';
import account from '@/text/packs/es/account.ts';
import order from '@/text/packs/es/order.ts';
import payment from '@/text/packs/es/payment.ts';
import tracking from '@/text/packs/es/tracking.ts';
import reviews from '@/text/packs/es/reviews.ts';
import faq from '@/text/packs/es/faq.ts';
import support from '@/text/packs/es/support.ts';
import verify from '@/text/packs/es/verify.ts';
import wholesale from '@/text/packs/es/wholesale.ts';
import webapp from '@/text/packs/es/webapp.ts';
import notices from '@/text/packs/es/notices.ts';
import errors from '@/text/packs/es/errors.ts';
import templates from '@/text/packs/es/templates.ts';
import type { Pack } from '@/text/packs/index.ts';

/** The es built-in pack: every non-fixed area, frozen. */
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
