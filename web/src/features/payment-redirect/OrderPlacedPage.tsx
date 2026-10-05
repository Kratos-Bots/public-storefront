import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useCartStore } from '@/stores/cart.ts';
import { clearPersistedCheckout } from '@/features/checkout/form-state.ts';
import { orderChatMessage, withPrefilledText } from '@/lib/chat-links.ts';
import { MissingReferenceScreen } from '@/features/payment-redirect/MissingReferenceScreen.tsx';
import { PAYMENT_VIEWS, useSignInTarget, type PaymentSlots } from '@/features/payment-redirect/payment-parts.tsx';
import { PaymentFamily, type PaymentData, type PaymentPreview } from '@/builder/family-payment.ts';
import { usePreviewFixture } from '@/builder/mode.ts';
import type { FamilyValue } from '@/builder/parts.ts';
import { defaultSlotRenders } from '@/builder/render.tsx';
import { FADE } from '@/lib/motion.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/payment-redirect/PaymentRedirect.module.css';

/**
 * Where checkout hands off an order with no online payment attached — a
 * chat-settled method (bank transfer, manual), or a hosted checkout that
 * failed to start (`warning=1`). The order already exists on the backend;
 * paying happens over chat from here, so the WhatsApp/Telegram links carry
 * the reference pre-typed rather than asking the shopper to repeat it. A
 * container of payment parts (spec 5.6): without `slots` it draws the default
 * arrangement, exactly v0.7.0's.
 */
export function OrderPlacedPage({ slots }: { slots?: PaymentSlots } = {}) {
  const legacy = useMemo(() => (slots ? null : (defaultSlotRenders('OrderPlaced', 'storefront', {}, 'order-placed') as unknown as PaymentSlots)), [slots]);
  const preview = usePreviewFixture<PaymentPreview>('OrderPlaced');
  const previewing = preview !== null;
  const [params] = useSearchParams();
  const orderRef = preview ? preview.orderRef : params.get('order');
  const warning = preview ? preview.warning : params.get('warning') === '1';
  const clearCart = useCartStore((s) => s.clear);
  const { brand } = useSettings();
  const liveSignIn = useSignInTarget(orderRef);
  const signIn = preview ? preview.signIn : liveSignIn;
  const { t } = useText();

  // The order was created on the backend before navigating here — start the
  // next visit from a clean slate, same as /payment/success. (Not while the editor previews the page.)
  useEffect(() => {
    if (previewing) return;
    clearCart();
    clearPersistedCheckout();
  }, [clearCart, previewing]);

  const whatsappLink = brand.links.whatsapp;
  const telegramLink = brand.links.telegram;
  const value = useMemo<FamilyValue<PaymentData>>(() => {
    let whatsapp: string | null = null;
    let telegram: string | null = null;
    if (preview) {
      whatsapp = preview.whatsapp;
      telegram = preview.telegram;
    } else if (orderRef) {
      const message = orderChatMessage(orderRef);
      whatsapp = withPrefilledText(whatsappLink, message);
      telegram = withPrefilledText(telegramLink, message);
    }
    return { data: { kind: 'placed', orderRef, signIn, warning, whatsapp, telegram }, views: PAYMENT_VIEWS };
  }, [orderRef, signIn, warning, preview, whatsappLink, telegramLink, t]);

  if (!orderRef) {
    return <MissingReferenceScreen />;
  }

  return (
    <PaymentFamily.Provider value={value}>{(slots ?? legacy!).content({ className: `${classes.page} ${FADE}` })}</PaymentFamily.Provider>
  );
}
