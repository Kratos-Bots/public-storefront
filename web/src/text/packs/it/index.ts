import common from '@/text/packs/it/common.ts';
import shell from '@/text/packs/it/shell.ts';
import catalog from '@/text/packs/it/catalog.ts';
import product from '@/text/packs/it/product.ts';
import cart from '@/text/packs/it/cart.ts';
import checkout from '@/text/packs/it/checkout.ts';
import auth from '@/text/packs/it/auth.ts';
import account from '@/text/packs/it/account.ts';
import order from '@/text/packs/it/order.ts';
import payment from '@/text/packs/it/payment.ts';
import tracking from '@/text/packs/it/tracking.ts';
import reviews from '@/text/packs/it/reviews.ts';
import faq from '@/text/packs/it/faq.ts';
import support from '@/text/packs/it/support.ts';
import verify from '@/text/packs/it/verify.ts';
import wholesale from '@/text/packs/it/wholesale.ts';
import webapp from '@/text/packs/it/webapp.ts';
import notices from '@/text/packs/it/notices.ts';
import errors from '@/text/packs/it/errors.ts';
import templates from '@/text/packs/it/templates.ts';
import type { Pack } from '@/text/packs/index.ts';

/** The it built-in pack: every non-fixed area, frozen. */
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
