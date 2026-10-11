import { useId, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchLastCheckoutDetails } from '@/api/orders.ts';
import { selectIsLoggedIn, useSessionStore } from '@/stores/session.ts';
import type { CheckoutForm } from '@/features/checkout/form-state.ts';
import {
  currentDismissed,
  dismissLastDetails,
  lastDetailsPatch,
  offerSummary,
  shouldOfferLastDetails,
  subscribeDismissed,
} from '@/features/checkout/last-details.ts';
import { useText } from '@/text/runtime.tsx';
import type { ContactModes } from '@/types/settings.ts';
import classes from '@/features/checkout/LastDetailsOffer.module.css';

export interface LastDetailsOfferProps {
  form: CheckoutForm;
  patch: (patch: Partial<CheckoutForm>) => void;
  contactModes: ContactModes;
  shipCountries: readonly string[];
  shipsNowhere?: boolean;
}

/**
 * "Use the details from your last order?" at the top of the contact step and of the address step, for a signed-in
 * shopper whose address is still empty (a saved draft's name and contact details do not hide it). It fills the blank
 * fields through `patch` and nothing more: no step is skipped and nothing is submitted. "No thanks" is remembered for
 * this tab, once for both steps. A guest, an older backend (no such route) and a failed lookup all show nothing, silently.
 */
export function LastDetailsOffer({ form, patch, contactModes, shipCountries, shipsNowhere = false }: LastDetailsOfferProps) {
  const { t } = useText();
  const headingId = useId();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const customerId = useSessionStore((s) => s.customer?.id ?? null);
  // One dismissal shared by every mount (see `dismissLastDetails`): it holds across the steps even with storage blocked.
  const dismissedFor = useSyncExternalStore(subscribeDismissed, currentDismissed, () => null);
  const [filled, setFilled] = useState(false);

  const { data: details } = useQuery({
    // Keyed by customer: signing in as someone else without a reload never reads the previous one's order.
    queryKey: ['checkout', 'last-details', customerId],
    queryFn: fetchLastCheckoutDetails,
    enabled: loggedIn && customerId !== null,
    staleTime: 10 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const offer = shouldOfferLastDetails({
    loggedIn,
    customerId,
    details,
    form,
    dismissedFor,
  });

  return (
    <>
      {filled ? <p role="status" className="sf-visually-hidden">{t('checkout.contact.autofillDone')}</p> : null}
      {offer && details ? (
        <section className={classes.offer} aria-labelledby={headingId} data-last-details="">
          <h3 id={headingId} className={classes.title}>{t('checkout.contact.autofillTitle')}</h3>
          <p className={classes.summary}>
            <span className={classes.name}>{offerSummary(details).name}</span>
            <span className={classes.address}>{offerSummary(details).address ?? t('checkout.contact.autofillCollectionPoint')}</span>
          </p>
          <div className={classes.actions}>
            <button
              type="button"
              className={classes.use}
              data-sf-part="button"
              data-variant="filled"
              onClick={() => {
                patch(lastDetailsPatch(details, { contactModes, shipCountries, shipsNowhere, form }));
                setFilled(true);
              }}
            >
              {t('checkout.contact.autofillUse')}
            </button>
            <button
              type="button"
              className={classes.dismiss}
              onClick={() => {
                if (customerId !== null) dismissLastDetails(customerId);
              }}
            >
              {t('checkout.contact.autofillDismiss')}
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
