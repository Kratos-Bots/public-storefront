import account from '@/text/notes/account.ts';
import auth from '@/text/notes/auth.ts';
import boot from '@/text/notes/boot.ts';
import cart from '@/text/notes/cart.ts';
import catalog from '@/text/notes/catalog.ts';
import checkout from '@/text/notes/checkout.ts';
import closed from '@/text/notes/closed.ts';
import common from '@/text/notes/common.ts';
import errors from '@/text/notes/errors.ts';
import notices from '@/text/notes/notices.ts';
import order from '@/text/notes/order.ts';
import payment from '@/text/notes/payment.ts';
import product from '@/text/notes/product.ts';
import shell from '@/text/notes/shell.ts';
import templates from '@/text/notes/templates.ts';
import tracking from '@/text/notes/tracking.ts';
import verify from '@/text/notes/verify.ts';
import webapp from '@/text/notes/webapp.ts';
import wholesale from '@/text/notes/wholesale.ts';

/*
 * Editor-only side table (final review): the Text panel's notes ("where the line appears") and
 * optional short labels. Kept out of `@/text/keys/*` so the shopper bundle carries only what renders
 * (en / max / fixed). Import this ONLY from `builder/editor/**` — a registry test enforces it.
 */
const byArea: Record<string, Readonly<Record<string, string>>> = {
  account, auth, boot, cart, catalog, checkout, closed, common, errors, notices, order, payment, product, shell,
  templates, tracking, verify, webapp, wholesale,
};

/** Full key → note. */
export const TEXT_NOTES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(byArea).flatMap(([area, notes]) => Object.entries(notes).map(([k, note]) => [`${area}.${k}`, note])),
);

/** Full key → short name, where the one derived from the key's last segment reads badly. None yet. */
export const TEXT_LABELS: Readonly<Record<string, string>> = {};
