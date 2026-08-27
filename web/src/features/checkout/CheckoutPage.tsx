import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Stepper } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore } from '@/stores/cart.ts';
import { saveOrder } from '@/stores/saved-orders.ts';
import { useServerCart } from '@/features/cart/useServerCart.ts';
import { placeGuestOrder, placeOrder } from '@/api/checkout.ts';
import { ApiError, errorMessage } from '@/lib/errors.ts';
import { EmptyState } from '@/components/EmptyState.tsx';
import { Money } from '@/components/Money.tsx';
import type { CheckoutInput, CryptoOption, PaymentMethod, Quote } from '@/types/checkout.ts';
import {
  DEFAULT_FORM,
  clearPersistedCheckout,
  loadPersistedForm,
  persistForm,
  type CheckoutForm,
} from '@/features/checkout/form-state.ts';
import {
  addressSchema,
  buildContactSchema,
  buildPaymentSchema,
  shippingSchema,
} from '@/features/checkout/schemas.ts';
import { useQuote } from '@/features/checkout/useQuote.ts';
import { publicOrderPath, resolveCheckoutOutcome } from '@/features/checkout/outcome.ts';
import { QuoteSummary } from '@/features/checkout/QuoteSummary.tsx';
import { GuestTurnstile, type GuestTurnstileHandle } from '@/features/checkout/GuestTurnstile.tsx';
import { ContactStep } from '@/features/checkout/steps/ContactStep.tsx';
import { AddressStep } from '@/features/checkout/steps/AddressStep.tsx';
import { ShippingStep } from '@/features/checkout/steps/ShippingStep.tsx';
import { PaymentStep } from '@/features/checkout/steps/PaymentStep.tsx';
import { ReviewStep } from '@/features/checkout/steps/ReviewStep.tsx';
import { DIAL_CODES } from '@/lib/dial-codes.ts';
import { FADE } from '@/lib/motion.ts';
import classes from '@/features/checkout/CheckoutPage.module.css';

const STEPS = [
  { label: 'Contact', title: 'Your details' },
  { label: 'Address', title: 'Delivery address' },
  { label: 'Shipping', title: 'Delivery and discounts' },
  { label: 'Payment', title: 'How you’ll pay' },
  { label: 'Review', title: 'Review your order' },
] as const;

/**
 * The guest quote driver's debounce. Deliberately longer than `useQuote`'s own
 * 300 ms: this effect mints a token and then re-runs the hook's *current* query
 * key, so the hook's debounced key has to have settled first or the fresh quote
 * would be written against the key the shopper has already moved off.
 */
const GUEST_QUOTE_DEBOUNCE_MS = 350;

/** How long the submit button stays down after a `409`, per STOREFRONT.md §3.5. */
const LOCK_MS = 3000;

/** Form field → the error key its message hangs on, where the two differ. */
const ERROR_KEY: Record<string, string> = {
  phonePrefix: 'phone',
  paymentMethod: 'method',
  network: 'coin',
};

export type QuoteErrorTarget = 'coupon' | 'shipping' | 'address' | null;

/**
 * Which step owns a failed quote. The backend's `422` messages are written for
 * the shopper but don't say which field to fix, so the form's own state decides:
 * a `404` is only ever an unknown coupon code, and a `422` belongs to whichever
 * of the three inputs the shopper has most recently supplied.
 */
export function classifyQuoteError(err: ApiError | null, form: CheckoutForm): QuoteErrorTarget {
  if (!err) return null;
  // A `404` is an unknown coupon — but only when a code is actually on the form.
  // The guest routes also 404 when the feature gate is off, and that belongs at
  // the top of the page, not against the coupon field.
  if (err.status === 404) return form.couponCode.trim() ? 'coupon' : null;
  if (err.status !== 422) return null;
  if (form.couponCode.trim()) return 'coupon';
  if (form.shippingOptionId !== null) return 'shipping';
  return 'address';
}

/** Seed the blanks a shop can pre-fill, without ever overwriting the shopper. */
function seedForm(form: CheckoutForm, defaultCountry: string | null): CheckoutForm {
  const iso = defaultCountry && DIAL_CODES[defaultCountry] ? defaultCountry : '';
  if (!iso) return form;
  return {
    ...form,
    country: form.country || iso,
    phonePrefix: form.phonePrefixTouched ? form.phonePrefix : form.phonePrefix || iso,
  };
}

function firstIssues(issues: Array<{ path: PropertyKey[]; message: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '_');
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

export function CheckoutPage() {
  const settings = useSettings();
  const { contactModes, currency, features } = settings;
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const guest = !loggedIn && features.guestCheckout;
  const navigate = useNavigate();

  const lines = useCartStore((s) => s.lines);
  const clearCart = useCartStore((s) => s.clear);
  const { sync } = useServerCart();

  const [form, setForm] = useState<CheckoutForm>(() =>
    seedForm(loadPersistedForm() ?? DEFAULT_FORM, contactModes.defaultPhoneCountry),
  );
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const turnstileRef = useRef<GuestTurnstileHandle | null>(null);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The submit latch. `submitting` state drives the button's label and disabled
   * mark, but it cannot be the guard: two taps inside one tick both read the
   * pre-update value and both place an order. The backend's per-customer lock is
   * explicitly best-effort (STOREFRONT.md §3.5), so the client has to hold this
   * one itself.
   */
  const submitLatch = useRef(false);

  useEffect(() => {
    persistForm(form);
  }, [form]);

  useEffect(
    () => () => {
      if (lockTimer.current) clearTimeout(lockTimer.current);
    },
    [],
  );

  const patch = useCallback((next: Partial<CheckoutForm>) => {
    setForm((f) => ({ ...f, ...next }));
    setErrors((prev) => {
      let changed = false;
      const out = { ...prev };
      for (const field of Object.keys(next)) {
        const key = ERROR_KEY[field] ?? field;
        if (key in out) {
          delete out[key];
          changed = true;
        }
      }
      return changed ? out : prev;
    });
  }, []);

  // The guest path never hands `useQuote` a token: the hook would then be free to
  // fire a query of its own, and a Turnstile token is spent the first time it is
  // sent (STOREFRONT.md §3.5a). With no token the hook's automatic query stays
  // disabled and every guest quote goes out through `refetchWithToken` below,
  // each with a token minted for that one request.
  const { quote, isFetching, error: quoteError, needsToken, refetchWithToken } = useQuote(form, {
    guest,
  });

  // A quote that fails takes its own query key's data with it — `keepPreviousData`
  // only covers a key while it is still pending. Holding the last good one keeps
  // the shipping list and the docket on screen while the shopper fixes whatever
  // the 422/404 was about, greyed out rather than blanked (spec §6).
  const lastGoodQuote = useRef<Quote | undefined>(undefined);
  if (quote) lastGoodQuote.current = quote;
  const shownQuote = quote ?? lastGoodQuote.current;

  // Latest-value ref: `refetchWithToken` is a fresh closure every render, so it
  // can't be an effect dependency without re-running the effect on every render.
  const refetchRef = useRef(refetchWithToken);
  refetchRef.current = refetchWithToken;

  const guestQuoteKey = useMemo(
    () =>
      JSON.stringify({
        country: form.country,
        couponCode: form.couponCode.trim().toUpperCase(),
        shippingOptionId: form.shippingOptionId,
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      }),
    [form.country, form.couponCode, form.shippingOptionId, lines],
  );
  const [debouncedGuestKey] = useDebouncedValue(guestQuoteKey, GUEST_QUOTE_DEBOUNCE_MS);
  const quotedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!guest || !form.country) return;
    if (!settings.turnstile) return;
    if (!needsToken) return;
    // The order is away and the cart has been emptied; the empty cart is a key
    // change this must not chase while the browser is on its way somewhere else.
    if (placed) return;
    if (debouncedGuestKey === quotedKey.current) return;

    let cancelled = false;
    let settled = false;
    quotedKey.current = debouncedGuestKey;
    setVerifying(true);
    setVerifyError(null);

    void (async () => {
      let token: string;
      // Two failures, two meanings. A mint that fails is *this page's* problem and
      // retrying it is the fix, so it gets the alert and the Try again button.
      try {
        const widget = turnstileRef.current;
        if (!widget) throw new Error('Verification is still loading — one moment');
        token = await widget.mint();
      } catch (err) {
        if (cancelled) return;
        settled = true;
        quotedKey.current = null;
        setVerifyError(errorMessage(err, "We couldn't verify your browser"));
        setVerifying(false);
        return;
      }
      if (cancelled) return;

      // A quote that fails is the *shop's* answer — an unserviceable country, a
      // coupon that doesn't apply. `useQuote` already holds it and the step it
      // belongs to renders it inline (spec §6); offering "Try again" over the top
      // would just spend another token on the same answer.
      try {
        await refetchRef.current(token);
      } catch {
        quotedKey.current = null;
      } finally {
        settled = true;
        if (!cancelled) setVerifying(false);
      }
    })();

    return () => {
      cancelled = true;
      // Hand the key back if this run never finished. The claim is staked before
      // the await — it has to be, or a re-render would start a second mint — so
      // an interrupted run must release it, or nothing ever quotes this key again
      // and the shopper sits on "Verifying…" forever. React's development
      // double-invoke is the guaranteed way to hit that; a form edit landing mid-mint
      // is the way a shopper hits it.
      if (!settled && quotedKey.current === debouncedGuestKey) quotedKey.current = null;
    };
  }, [guest, settings.turnstile, form.country, needsToken, placed, debouncedGuestKey, retryTick]);

  const contactSchema = useMemo(
    () => buildContactSchema(contactModes, { guest }),
    [contactModes, guest],
  );
  const paymentMethods = shownQuote?.paymentMethods;
  const paymentSchema = useMemo(() => buildPaymentSchema(paymentMethods ?? []), [paymentMethods]);

  const method: PaymentMethod | undefined = paymentMethods?.find(
    (m) => m.method === form.paymentMethod,
  );
  const combo: CryptoOption | null =
    method?.cryptoOptions?.find((o) => o.coin === form.coin && o.network === form.network) ?? null;
  const shippingOption =
    shownQuote?.shippingOptions.find((o) => o.id === form.shippingOptionId) ?? null;

  /**
   * A selection the current quote no longer offers. The form outlives any one
   * quote — it is restored from localStorage and it survives a country change —
   * so `shippingOptionId`, `paymentMethod` and `coin`/`network` can all name
   * something that has since stopped being on the menu. Naming that here keeps
   * the button honest (a stale method would otherwise fall through to
   * `amountDue` and advertise a figure nobody is going to be charged) and
   * `validate` sends the shopper back to re-pick.
   */
  const shippingStale = Boolean(shownQuote && form.shippingOptionId !== null && !shippingOption);
  const methodStale = Boolean(shownQuote && form.paymentMethod && !method);
  const comboStale = Boolean(method?.cryptoOptions && form.coin && !combo);
  const selectionsStale = shippingStale || methodStale || comboStale;

  const chargeTotal = selectionsStale
    ? null
    : (combo?.chargeTotal ?? method?.chargeTotal ?? shownQuote?.amountDue ?? null);

  const errorTarget = classifyQuoteError(quoteError, form);
  const quoteMessage = quoteError
    ? quoteError.status === 404
      ? 'Unknown code'
      : errorMessage(quoteError)
    : undefined;
  // Anything the steps can't own (429, 502, a timeout) belongs at the top of the page.
  const pageQuoteError = quoteError && !errorTarget ? errorMessage(quoteError) : null;

  function contactValues(): { email?: string; phone?: string } {
    const parsed = contactSchema.safeParse({
      firstName: form.firstName,
      surname: form.surname,
      email: form.email,
      phone: form.phone,
      phonePrefix: form.phonePrefix,
    });
    return parsed.success ? { email: parsed.data.email, phone: parsed.data.phone } : {};
  }

  function validate(index: number): boolean {
    if (index === 0) {
      const parsed = contactSchema.safeParse({
        firstName: form.firstName,
        surname: form.surname,
        email: form.email,
        phone: form.phone,
        phonePrefix: form.phonePrefix,
      });
      if (parsed.success) return true;
      setErrors(firstIssues(parsed.error.issues));
      return false;
    }
    if (index === 1) {
      const parsed = addressSchema.safeParse({
        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2,
        city: form.city,
        county: form.county,
        zip: form.zip,
        country: form.country,
      });
      if (parsed.success) return true;
      setErrors(firstIssues(parsed.error.issues));
      return false;
    }
    if (index === 2) {
      const parsed = shippingSchema.safeParse({
        shippingOptionId: form.shippingOptionId ?? undefined,
      });
      if (!parsed.success) {
        setErrors(firstIssues(parsed.error.issues));
        return false;
      }
      if (!shownQuote) {
        setErrors({ shippingOptionId: 'Still pricing your order — one moment' });
        return false;
      }
      // The schema can only say "a positive integer". Whether that integer is
      // still on the menu is the quote's business, and the quote changes under
      // the form (a new country, a restored session) without touching it.
      if (shippingStale) {
        setForm((f) => ({ ...f, shippingOptionId: null }));
        setErrors({
          shippingOptionId: 'That delivery option is no longer available — choose another',
        });
        return false;
      }
      return true;
    }
    if (index === 3) {
      if (!shownQuote) {
        setErrors({ method: 'Still pricing your order — one moment' });
        return false;
      }
      // Store credit covers the order: no method is required, and a method left
      // over from before it did has to go rather than ride along on the body.
      if (shownQuote.amountDue === 0) {
        if (form.paymentMethod || form.coin || form.network) {
          setForm((f) => ({ ...f, paymentMethod: '', coin: '', network: '' }));
        }
        return true;
      }
      if (!form.paymentMethod) {
        setErrors({ method: 'Choose how you’d like to pay' });
        return false;
      }
      if (methodStale) {
        setForm((f) => ({ ...f, paymentMethod: '', coin: '', network: '' }));
        setErrors({ method: 'That payment method is no longer available — choose another' });
        return false;
      }
      if (comboStale) {
        setForm((f) => ({ ...f, coin: '', network: '' }));
        setErrors({ coin: 'That coin and network are no longer available — choose another' });
        return false;
      }
      const parsed = paymentSchema.safeParse({
        method: form.paymentMethod || undefined,
        coin: form.coin || undefined,
        network: form.network || undefined,
        useStoreCredit: form.useStoreCredit,
      });
      if (parsed.success) return true;
      setErrors(firstIssues(parsed.error.issues));
      return false;
    }
    return true;
  }

  function focusCard() {
    const el = cardRef.current;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
  }

  function goTo(index: number) {
    setErrors({});
    setStep(index);
    focusCard();
  }

  function next() {
    if (!validate(step)) return;
    goTo(Math.min(step + 1, STEPS.length - 1));
  }

  function back() {
    goTo(Math.max(step - 1, 0));
  }

  function buildBody(): Omit<CheckoutInput, 'useStoreCredit'> {
    const { email, phone } = contactValues();
    return {
      shippingAddress: {
        firstName: form.firstName.trim(),
        surname: form.surname.trim(),
        addressLine1: form.addressLine1.trim(),
        addressLine2: form.addressLine2.trim() || null,
        addressLine3: null,
        city: form.city.trim(),
        county: form.county.trim() || null,
        zip: form.zip.trim(),
        country: form.country,
      },
      email,
      phone,
      // Taken from the quote's own objects, not from the raw form: `validate`
      // blocks a stale selection before we get here, and reading them back off
      // the quote means the body can never carry one even if it ever didn't.
      shippingOptionId: shippingOption?.id ?? form.shippingOptionId ?? 0,
      couponCode: form.couponCode.trim().toUpperCase() || undefined,
      paymentMethod: method?.method || undefined,
      coin: combo?.coin || undefined,
      network: combo?.network || undefined,
      notes: form.notes.trim() || undefined,
    };
  }

  async function submit() {
    if (submitLatch.current || locked) return;
    // Re-check every step, and go back to the first one that no longer holds —
    // a shipping option can stop being offered, or a method can drop out of the
    // quote, while the shopper is still reading the review. `validate` has set
    // the errors that explain why, so this deliberately isn't `goTo` (which
    // clears them).
    for (let index = 0; index < STEPS.length - 1; index += 1) {
      if (validate(index)) continue;
      setStep(index);
      focusCard();
      return;
    }

    submitLatch.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = buildBody();
      const result = guest
        ? await (async () => {
            const widget = turnstileRef.current;
            if (!widget) throw new Error('Verification is still loading — one moment');
            setVerifying(true);
            try {
              const token = await widget.mint();
              return await placeGuestOrder({
                ...body,
                turnstileToken: token,
                items: useCartStore.getState().mergeForLogin(),
              });
            } finally {
              setVerifying(false);
            }
          })()
        : await (async () => {
            // Any cart edit still sitting in the debounce window has to land
            // before the backend prices what it thinks is on the order.
            await sync();
            return placeOrder({ ...body, useStoreCredit: form.useStoreCredit });
          })();

      setPlaced(true);
      // The backend clears the server cart itself; this is the local mirror.
      clearCart();
      clearPersistedCheckout();

      // Keep the order's access key: it is the only way back to `/order/:ref/:key`
      // once this tab is gone, and a guest has no account to find it in.
      const orderPath = publicOrderPath(result.publicUrl);
      const match = orderPath ? /^\/order\/([^/]+)\/([^/]+)$/.exec(orderPath) : null;
      if (match) saveOrder(decodeURIComponent(match[1]!), decodeURIComponent(match[2]!));

      const outcome = resolveCheckoutOutcome(result);
      if (outcome.kind === 'external') window.location.assign(outcome.url);
      else navigate(outcome.to, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        notifications.show({
          message: err.message || 'Checkout already in progress',
          color: 'red',
        });
        setLocked(true);
        if (lockTimer.current) clearTimeout(lockTimer.current);
        lockTimer.current = setTimeout(() => setLocked(false), LOCK_MS);
      } else {
        setSubmitError(errorMessage(err, "We couldn't place your order"));
      }
    } finally {
      submitLatch.current = false;
      setSubmitting(false);
    }
  }

  // Guest checkout is two switches, not one: the feature flag AND a configured
  // Turnstile site key. With the flag on and no key the widget can never mount,
  // so every quote would hang on a token that will never come — and the backend
  // answers those routes `503 Guest checkout is not configured` anyway
  // (STOREFRONT.md §3.5a). Say so and offer the way through instead.
  if (guest && !settings.turnstile) {
    return (
      <EmptyState
        eyebrow="Checkout"
        title="Guest checkout isn't available right now"
        description="Sign in and we'll pick your order up from here."
        action={
          <Button component={Link} to="/login?returnTo=%2Fcheckout" variant="default" size="sm">
            Sign in
          </Button>
        }
      />
    );
  }

  if (lines.length === 0 && !placed) {
    return (
      <EmptyState
        eyebrow="Checkout"
        title="There's nothing to check out"
        description="Add something to your cart and we'll pick this back up."
        action={
          <Button component={Link} to="/" variant="default" size="sm">
            Browse the catalogue
          </Button>
        }
      />
    );
  }

  const meta = STEPS[step]!;
  const onReview = step === STEPS.length - 1;
  const nextDisabled = submitting || locked || (onReview && guest && verifying);

  return (
    <div className={classes.page}>
      <header className={classes.head}>
        <span className={classes.eyebrow}>Checkout</span>
        <h1 className={classes.title}>{guest ? 'Guest checkout' : 'Checkout'}</h1>
      </header>

      <div className={classes.grid}>
        <div>
          <Stepper
            active={step}
            onStepClick={goTo}
            allowNextStepsSelect={false}
            size="xs"
            iconSize={26}
            classNames={{
              root: classes.stepper,
              steps: classes.steps,
              step: classes.step,
              stepIcon: classes.stepIcon,
              stepBody: classes.stepBody,
              stepLabel: classes.stepLabel,
              separator: classes.separator,
              content: classes.content,
            }}
          >
            {STEPS.map((s) => (
              <Stepper.Step key={s.label} label={s.label} />
            ))}
          </Stepper>

          <div className={`${classes.card} ${FADE}`} ref={cardRef}>
            <header className={classes.cardHead}>
              <span className={classes.cardCount}>
                Step {step + 1} of {STEPS.length}
              </span>
              <h2 className={classes.cardTitle}>{meta.title}</h2>
            </header>

            {pageQuoteError ? <p className={classes.alert}>{pageQuoteError}</p> : null}
            {verifyError ? (
              <p className={classes.alert}>
                {verifyError}
                <button
                  type="button"
                  className={classes.alertAction}
                  onClick={() => setRetryTick((t) => t + 1)}
                >
                  Try again
                </button>
              </p>
            ) : null}
            {submitError ? <p className={classes.alert}>{submitError}</p> : null}
            {guest && verifying ? (
              <p className={classes.verifying}>
                <span className={classes.pulse} aria-hidden />
                Verifying…
              </p>
            ) : null}

            {step === 0 ? (
              <ContactStep
                form={form}
                patch={patch}
                errors={errors}
                contactModes={contactModes}
                guest={guest}
              />
            ) : null}
            {step === 1 ? (
              <AddressStep
                form={form}
                patch={patch}
                errors={errors}
                notice={errorTarget === 'address' ? quoteMessage : undefined}
              />
            ) : null}
            {step === 2 ? (
              <ShippingStep
                quote={shownQuote}
                form={form}
                patch={patch}
                errors={errors}
                busy={isFetching || verifying}
                couponError={errorTarget === 'coupon' ? quoteMessage : undefined}
                notice={errorTarget === 'shipping' ? quoteMessage : undefined}
              />
            ) : null}
            {step === 3 ? (
              <PaymentStep
                quote={shownQuote}
                form={form}
                patch={patch}
                errors={errors}
                guest={guest}
                currency={currency}
              />
            ) : null}
            {step === 4 ? (
              <ReviewStep
                form={form}
                patch={patch}
                quote={shownQuote}
                method={method}
                combo={combo}
                onEdit={goTo}
              />
            ) : null}
          </div>

          <div className={classes.nav}>
            {step > 0 ? (
              <button type="button" className={classes.back} onClick={back}>
                Back
              </button>
            ) : null}
            {onReview ? (
              <button
                type="button"
                className={classes.next}
                onClick={() => void submit()}
                disabled={nextDisabled}
              >
                {submitting ? (
                  'Placing order…'
                ) : chargeTotal !== null && chargeTotal > 0 ? (
                  <>
                    Place order · <Money amount={chargeTotal} />
                  </>
                ) : (
                  'Place order'
                )}
              </button>
            ) : (
              <button type="button" className={classes.next} onClick={next}>
                Continue
              </button>
            )}
          </div>

          {onReview ? (
            <p className={classes.terms}>
              Placing the order confirms the details above. We&rsquo;ll send you a link to track it.
            </p>
          ) : null}
        </div>

        <aside className={classes.aside}>
          <QuoteSummary
            defaultOpen={onReview}
            quote={shownQuote}
            isFetching={isFetching || verifying}
            stale={Boolean(quoteError)}
            method={method}
            combo={combo}
          />
        </aside>
      </div>

      {guest && settings.turnstile ? (
        <GuestTurnstile ref={turnstileRef} siteKey={settings.turnstile.siteKey} />
      ) : null}
    </div>
  );
}
