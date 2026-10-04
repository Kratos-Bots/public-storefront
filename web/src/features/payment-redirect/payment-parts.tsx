import { Link } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { accountOrderPath } from '@/features/checkout/outcome.ts';
import { selectIsLoggedIn, useSessionStore } from '@/stores/session.ts';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { CheckIcon, CloseIcon, TelegramIcon, WhatsAppIcon } from '@/components/icons.tsx';
import { orderChatMessage, orderInquiryMessage } from '@/lib/chat-links.ts';
import { ReferenceRow } from '@/features/payment-redirect/ReferenceRow.tsx';
import { PaymentFamily, type PaymentData } from '@/builder/family-payment.ts';
import type { FamilyValue, PartViewProps } from '@/builder/parts.ts';
import type { SlotRender } from '@/builder/define.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/payment-redirect/PaymentRedirect.module.css';

/** The one slot every payment container renders (spec §5.6). */
export interface PaymentSlots { content: SlotRender }

/** The way to an order for someone who placed it signed out: sign in with the same contact, land on the order. */
export const signInToOrder = (reference: string) => `/login?returnTo=${encodeURIComponent(accountOrderPath(reference))}`;

/** The sign-in link to offer on a payment page, or null when there is nothing to offer (signed in, accounts off, no order). */
export function useSignInTarget(orderRef: string | null): string | null {
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const { features } = useSettings();
  return !loggedIn && features.accounts && orderRef ? signInToOrder(orderRef) : null;
}

// Views of the payment parts: the v0.7.0 JSX of the three pages, branching on `data.kind`.

function MarkView({ styleAttrs }: PartViewProps) {
  const { kind } = PaymentFamily.useData();
  return kind === 'cancel' ? (
    <span className={`${classes.ring} ${classes.ringWarn}`} aria-hidden {...styleAttrs}>
      <CloseIcon size={18} />
    </span>
  ) : (
    <span className={`${classes.ring} ${classes.ringSuccess}`} aria-hidden {...styleAttrs}>
      <CheckIcon size={20} />
    </span>
  );
}

function EyebrowView({ styleAttrs }: PartViewProps) {
  const { kind } = PaymentFamily.useData();
  const { t } = useText();
  const text = kind === 'success' ? t('payment.success.eyebrow') : kind === 'cancel' ? t('payment.cancel.eyebrow') : t('payment.placed.eyebrow');
  return (
    <p className={classes.eyebrow} data-tone={kind === 'cancel' ? 'warn' : 'success'} {...styleAttrs}>
      {text}
    </p>
  );
}

function HeadlineView({ styleAttrs }: PartViewProps) {
  const { kind } = PaymentFamily.useData();
  const { t } = useText();
  const text = kind === 'success' ? t('payment.success.headline') : kind === 'cancel' ? t('payment.cancel.headline') : t('payment.placed.headline');
  return <h1 className={classes.headline} {...styleAttrs}>{text}</h1>;
}

function MessageView({ styleAttrs }: PartViewProps) {
  const { kind, warning, whatsapp, telegram } = PaymentFamily.useData();
  const { t } = useText();
  if (kind === 'success') return <p className={classes.detail} {...styleAttrs}>{t('payment.success.detail')}</p>;
  if (kind === 'cancel') return <p className={classes.detail} {...styleAttrs}>{t('payment.cancel.detail')}</p>;
  if (warning) {
    return (
      <p className={classes.alert} role="status" {...styleAttrs}>
        {t('payment.placed.warning')}
      </p>
    );
  }
  return whatsapp || telegram ? <p className={classes.detail} {...styleAttrs}>{t('payment.placed.chatHint')}</p> : null;
}

function ReferenceView({ styleAttrs }: PartViewProps) {
  const { orderRef } = PaymentFamily.useData();
  return orderRef ? <ReferenceRow value={orderRef} rootAttrs={styleAttrs} /> : null;
}

function ActionsView({ styleAttrs }: PartViewProps) {
  const { kind, orderRef, signIn, whatsapp, telegram } = PaymentFamily.useData();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const { t } = useText();
  const signInCta = signIn ? (
    <>
      <Link to={signIn} className={classes.cta} data-sf-part="button" data-variant="filled">
        {t('payment.signIn.action')}
      </Link>
      <p className={classes.detail}>{t('payment.signIn.hint')}</p>
    </>
  ) : null;

  if (kind === 'success') return signIn ? <div className={classes.actions} {...styleAttrs}>{signInCta}</div> : null;

  if (kind === 'cancel') {
    return (
      <div className={classes.actions} {...styleAttrs}>
        {loggedIn && orderRef ? (
          <Link to={accountOrderPath(orderRef)} className={classes.cta} data-sf-part="button" data-variant="filled">
            {t('payment.cancel.returnToOrder')}
          </Link>
        ) : signIn ? (
          signInCta
        ) : (
          <Link to="/" className={classes.cta} data-sf-part="button" data-variant="filled">
            {t('payment.cancel.backToShop')}
          </Link>
        )}
      </div>
    );
  }

  return whatsapp || telegram ? (
    <div className={classes.actions} {...styleAttrs}>
      {signInCta}
      {whatsapp ? (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={classes.cta}
          data-sf-part="button"
          data-variant="filled"
        >
          <WhatsAppIcon size={16} />
          {t('payment.placed.payViaWhatsapp')}
        </a>
      ) : null}
      {telegram ? (
        <a
          href={telegram}
          target="_blank"
          rel="noopener noreferrer"
          className={classes.cta}
          data-sf-part="button"
          data-variant="filled"
        >
          <TelegramIcon size={16} />
          {t('payment.placed.payViaTelegram')}
        </a>
      ) : null}
    </div>
  ) : signIn ? (
    <div {...styleAttrs}>
      <div className={classes.actions}>{signInCta}</div>
      <p className={classes.fallback}>{t('payment.placed.fallback')}</p>
    </div>
  ) : (
    <p className={classes.fallback} {...styleAttrs}>
      {t('payment.placed.fallback')}
    </p>
  );
}

function ContactView({ styleAttrs }: PartViewProps) {
  const { kind, orderRef } = PaymentFamily.useData();
  useText(); // the prefilled message reads the text snapshot: re-render when the owner's copy changes
  const prefill = !orderRef ? undefined : kind === 'success' ? orderInquiryMessage(orderRef) : orderChatMessage(orderRef);
  return (
    <div className={classes.contact} {...styleAttrs}>
      <ContactLinks prefill={prefill} />
    </div>
  );
}

function BackView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  return (
    <Link to="/" className={classes.back} {...styleAttrs}>
      {t('common.actions.backToShop')}
    </Link>
  );
}

export const PAYMENT_VIEWS: FamilyValue<PaymentData>['views'] = {
  PaymentMark: MarkView, PaymentEyebrow: EyebrowView, PaymentHeadline: HeadlineView, PaymentMessage: MessageView,
  PaymentReference: ReferenceView, PaymentActions: ActionsView, PaymentContact: ContactView, PaymentBack: BackView,
};
