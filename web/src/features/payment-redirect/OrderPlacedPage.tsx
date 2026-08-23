import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useCartStore } from '@/stores/cart.ts';
import { clearPersistedCheckout } from '@/features/checkout/form-state.ts';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';
import { CheckIcon, TelegramIcon, WhatsAppIcon } from '@/components/icons.tsx';
import { orderChatMessage, withPrefilledText } from '@/lib/chat-links.ts';
import { ReferenceRow } from '@/features/payment-redirect/ReferenceRow.tsx';
import classes from '@/features/payment-redirect/PaymentRedirect.module.css';

/**
 * Where checkout hands off an order with no online payment attached — a
 * chat-settled method (bank transfer, manual), or a hosted checkout that
 * failed to start (`warning=1`). The order already exists on the backend;
 * paying happens over chat from here, so the WhatsApp/Telegram links carry
 * the reference pre-typed rather than asking the shopper to repeat it.
 */
export function OrderPlacedPage() {
  const [params] = useSearchParams();
  const orderRef = params.get('order');
  const warning = params.get('warning') === '1';
  const clearCart = useCartStore((s) => s.clear);
  const { brand } = useSettings();

  // The order was created on the backend before navigating here — start the
  // next visit from a clean slate, same as /payment/success.
  useEffect(() => {
    clearCart();
    clearPersistedCheckout();
  }, [clearCart]);

  if (!orderRef) {
    return (
      <div className={classes.page}>
        <EmptyState
          eyebrow="Order link"
          title="Order reference missing"
          description="Return to the shop and try again, or message us for help."
        />
        <ContactLinks />
        <Link to="/" className={classes.back}>
          ← Back to shop
        </Link>
      </div>
    );
  }

  const message = orderChatMessage(orderRef);
  const whatsapp = withPrefilledText(brand.links.whatsapp, message);
  const telegram = withPrefilledText(brand.links.telegram, message);

  return (
    <div className={classes.page}>
      <span className={`${classes.ring} ${classes.ringSuccess}`} aria-hidden>
        <CheckIcon size={20} />
      </span>
      <p className={classes.eyebrow} data-tone="success">
        Order confirmed
      </p>
      <h1 className={classes.headline}>Order placed</h1>

      {warning ? (
        <p className={classes.alert} role="status">
          We couldn&rsquo;t set up online payment for this order — message us and we&rsquo;ll
          help you pay.
        </p>
      ) : (
        <p className={classes.detail}>
          Message us on WhatsApp or Telegram to arrange payment — your order reference
          is already filled in for you.
        </p>
      )}

      <ReferenceRow value={orderRef} />

      {whatsapp || telegram ? (
        <div className={classes.actions}>
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={classes.cta}>
              <WhatsAppIcon size={16} />
              Pay via WhatsApp
            </a>
          ) : null}
          {telegram ? (
            <a href={telegram} target="_blank" rel="noopener noreferrer" className={classes.cta}>
              <TelegramIcon size={16} />
              Pay via Telegram
            </a>
          ) : null}
        </div>
      ) : (
        <p className={classes.fallback}>
          Contact us through your usual channel and quote your order reference to
          arrange payment.
        </p>
      )}

      <Link to="/" className={classes.back}>
        ← Back to shop
      </Link>
    </div>
  );
}
