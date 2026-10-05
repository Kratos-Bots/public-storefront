import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore } from '@/stores/cart.ts';
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
import { applyShipCountries } from '@/features/checkout/ship-countries.ts';
import { collectionAddress, modeForCountry, pickerCountries, quoteDeliveryFields, reconcileDelivery, shipListsOf } from '@/features/checkout/collection-mode.ts';
import { useQuote } from '@/features/checkout/useQuote.ts';
import { accountOrderPath, resolveCheckoutOutcome } from '@/features/checkout/outcome.ts';
import { GuestTurnstile, type GuestTurnstileHandle } from '@/features/checkout/GuestTurnstile.tsx';
import { CHECKOUT_VIEWS, InertActionBand } from '@/features/checkout/checkout-parts.tsx';
import { STEP_META } from '@/features/checkout/step-meta.ts';
import { defaultSlotRenders } from '@/builder/render.tsx';
import { useBuilderMode } from '@/builder/mode.ts';
import { containsVisibleType } from '@/builder/rules.ts';
import {
  CheckoutFamily,
  DEFAULT_STEP_ORDER,
  isLegalStepOrder,
  stepKindsOf,
  type CheckoutData,
  type CheckoutSlots,
  type StepKind,
} from '@/builder/family-checkout.ts';
import { DIAL_CODES } from '@/lib/dial-codes.ts';
import { formatMoney } from '@/lib/format.ts';
import { haptic, isTelegramWebApp, openExternalLink } from '@/lib/telegram-webapp.ts';
import { usePrimaryAction } from '@/stores/primary-action.ts';
import { FADE } from '@/lib/motion.ts';
import { Slot } from '@/templates/runtime.tsx';
import { textKey, useText } from '@/text/runtime.tsx';
import classes from '@/features/checkout/CheckoutPage.module.css';

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

export interface CheckoutPageProps {
  /** The CheckoutFlow block's slots; omitted = the default arrangement (tests, v0.7.0 call sites). */
  slots?: CheckoutSlots;
}

export function CheckoutPage({ slots }: CheckoutPageProps = {}) {
  const { t, tn } = useText();
  const settings = useSettings();
  const { contactModes, currency, features } = settings;
  const rawShipping = settings.shipping;
  const shipLists = useMemo(() => shipListsOf({ shipping: rawShipping }), [rawShipping]);
  const shipCountries = useMemo(() => pickerCountries(shipLists), [shipLists]);
  const phoneMode = contactModes.phoneMode;
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const guest = !loggedIn && features.guestCheckout;
  // The editor canvas stacks every step (spec section 10.3). The only thing here that reads builder mode.
  const stack = useBuilderMode().editing;
  const navigate = useNavigate();
  // Inside Telegram the nav's primary button is Telegram's MainButton (Back stays in the page).
  const inTelegram = isTelegramWebApp();

  const lines = useCartStore((s) => s.lines);
  const clearCart = useCartStore((s) => s.clear);
  const { sync } = useServerCart();

  const legacy = useMemo(
    () => (slots ? null : (defaultSlotRenders('CheckoutFlow', 'storefront', {}, 'checkout') as unknown as CheckoutSlots)),
    [slots],
  );
  const s = slots ?? legacy!;

  // The steps in the owner's order. The guard refuses an illegal document, so the fallback is defence in depth.
  const warnedOrder = useRef(false);
  const storedKinds = useMemo(() => stepKindsOf(s.steps.items.map((i) => i.type)), [s.steps.items]);
  const orderLegal = isLegalStepOrder(storedKinds);
  const order: readonly StepKind[] = orderLegal ? storedKinds : DEFAULT_STEP_ORDER;
  // Say so once per mounted page, never per render and never on the editor canvas.
  useEffect(() => {
    if (orderLegal || stack || warnedOrder.current) return;
    warnedOrder.current = true;
    console.warn('[checkout] the stored step order is not legal; using the default order');
  }, [orderLegal, stack]);

  // A discount code or notes the owner took off the page must not travel with the order. The saved
  // value is kept (the persisted form is never rewritten) and comes back when the part does.
  const allItems = [...s.head.items, ...s.lead.items, ...s.steps.items, ...s.after.items, ...s.aside.items];
  const couponShown = containsVisibleType(allItems, 'CheckoutCoupon');
  const notesShown = containsVisibleType(allItems, 'CheckoutNotes');

  const [form, setForm] = useState<CheckoutForm>(() => {
    const seeded = applyShipCountries(seedForm(loadPersistedForm() ?? DEFAULT_FORM, contactModes.defaultPhoneCountry), shipCountries);
    return reconcileDelivery(seeded, seeded, shipLists, phoneMode);
  });
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

  // Settings refetch on window focus, so the shop's countries can change under an open checkout.
  useEffect(() => {
    setForm((f) => {
      const next = applyShipCountries(f, shipCountries);
      return reconcileDelivery(f, next, shipLists, phoneMode);
    });
  }, [shipCountries, shipLists, phoneMode]);

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
    setForm((f) => reconcileDelivery(f, { ...f, ...next }, shipLists, phoneMode));
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
  }, [shipLists, phoneMode]);

  const effective = useMemo<CheckoutForm>(
    () => ({ ...form, couponCode: couponShown ? form.couponCode : '', notes: notesShown ? form.notes : '' }),
    [form, couponShown, notesShown],
  );

  // The guest path never hands `useQuote` a token: the hook would then be free to
  // fire a query of its own, and a Turnstile token is spent the first time it is
  // sent (STOREFRONT.md §3.5a). With no token the hook's automatic query stays
  // disabled and every guest quote goes out through `refetchWithToken` below,
  // each with a token minted for that one request.
  const { quote, isFetching, error: quoteError, needsToken, refetchWithToken, optionsCurrent } = useQuote(effective, {
    guest,
  });

  // A quote that fails takes its own query key's data with it — `keepPreviousData`
  // only covers a key while it is still pending. Holding the last good one keeps
  // the shipping list and the docket on screen while the shopper fixes whatever
  // the 422/404 was about, greyed out rather than blanked (spec §6).
  const lastGoodQuote = useRef<Quote | undefined>(undefined);
  if (quote) lastGoodQuote.current = quote;
  const shownQuote = quote ?? lastGoodQuote.current;
  // The shown quote is priced for another country, delivery method or point carrier than
  // the form holds now (or none has arrived): its shipping options must not be offered
  // or accepted. Totals and the other steps keep the shown quote.
  const optionsPending = !stack && Boolean(form.country) && !optionsCurrent;

  // Latest-value ref: `refetchWithToken` is a fresh closure every render, so it
  // can't be an effect dependency without re-running the effect on every render.
  const refetchRef = useRef(refetchWithToken);
  refetchRef.current = refetchWithToken;

  const guestQuoteKey = useMemo(
    () =>
      JSON.stringify({
        country: form.country,
        couponCode: effective.couponCode.trim().toUpperCase(),
        shippingOptionId: form.shippingOptionId,
        ...quoteDeliveryFields(form),
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      }),
    [form.country, effective.couponCode, form.shippingOptionId, form.deliveryMethod, form.servicePoint, lines],
  );
  const [debouncedGuestKey] = useDebouncedValue(guestQuoteKey, GUEST_QUOTE_DEBOUNCE_MS);
  const quotedKey = useRef<string | null>(null);

  useEffect(() => {
    if (stack) return; // the canvas never mints a token or quotes as a guest
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
        setVerifyError(errorMessage(err, t('checkout.errors.verifyBrowser')));
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
    // `t` is left out on purpose: it only words an error set once per run, and a text edit
    // must not re-run the mint and quote.
  }, [stack, guest, settings.turnstile, form.country, needsToken, placed, debouncedGuestKey, retryTick]);

  // A carrier texts the pick-up code: while the order is a collection, the phone is required.
  const collecting = form.deliveryMethod === 'collection';
  const effectiveContactModes = useMemo(
    () => (collecting ? { ...contactModes, phoneMode: 'required' as const } : contactModes),
    [contactModes, collecting],
  );
  const contactSchema = useMemo(
    () => buildContactSchema(effectiveContactModes, { guest }),
    [effectiveContactModes, guest],
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

  const errorTarget = classifyQuoteError(quoteError, effective);
  const quoteMessage = quoteError
    ? quoteError.status === 404
      ? t('checkout.errors.unknownCode')
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

  function validate(kind: StepKind): boolean {
    if (kind === 'contact') {
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
    if (kind === 'address') {
      if (form.deliveryMethod === 'collection') {
        if (form.country.length !== 2) {
          setErrors({ country: textKey('checkout.errors.countryMissing') });
          return false;
        }
        if (!form.servicePoint) {
          setErrors({ servicePoint: textKey('checkout.errors.pointMissing') });
          return false;
        }
        return true;
      }
      const parsed = addressSchema.safeParse({
        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2,
        addressLine3: form.addressLine3,
        city: form.city,
        county: form.county,
        zip: form.zip,
        country: form.country,
      });
      if (parsed.success) return true;
      setErrors(firstIssues(parsed.error.issues));
      return false;
    }
    if (kind === 'shipping') {
      if (optionsPending) {
        setErrors({ shippingOptionId: textKey('checkout.errors.stillPricing') });
        return false;
      }
      const parsed = shippingSchema.safeParse({
        shippingOptionId: form.shippingOptionId ?? undefined,
      });
      if (!parsed.success) {
        setErrors(firstIssues(parsed.error.issues));
        return false;
      }
      if (!shownQuote) {
        setErrors({ shippingOptionId: textKey('checkout.errors.stillPricing') });
        return false;
      }
      // The schema can only say "a positive integer". Whether that integer is
      // still on the menu is the quote's business, and the quote changes under
      // the form (a new country, a restored session) without touching it.
      if (shippingStale) {
        setForm((f) => ({ ...f, shippingOptionId: null }));
        setErrors({
          shippingOptionId: textKey('checkout.errors.shippingStale'),
        });
        return false;
      }
      return true;
    }
    if (kind === 'payment') {
      if (!shownQuote) {
        setErrors({ method: textKey('checkout.errors.stillPricing') });
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
        setErrors({ method: textKey('checkout.errors.paymentMissing') });
        return false;
      }
      if (methodStale) {
        setForm((f) => ({ ...f, paymentMethod: '', coin: '', network: '' }));
        setErrors({ method: textKey('checkout.errors.methodStale') });
        return false;
      }
      if (comboStale) {
        setForm((f) => ({ ...f, coin: '', network: '' }));
        setErrors({ coin: textKey('checkout.errors.comboStale') });
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

  const focusCard = useCallback(() => {
    const el = cardRef.current;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
  }, []);

  const goTo = useCallback(
    (index: number) => {
      setErrors({});
      setStep(index);
      focusCard();
    },
    [focusCard],
  );

  function next() {
    if (!validate(order[step]!)) return;
    goTo(Math.min(step + 1, order.length - 1));
  }

  function back() {
    goTo(Math.max(step - 1, 0));
  }

  function buildBody(): Omit<CheckoutInput, 'useStoreCredit'> {
    const { email, phone } = contactValues();
    return {
      shippingAddress: collectionAddress(form) ?? {
        firstName: form.firstName.trim(),
        surname: form.surname.trim(),
        addressLine1: form.addressLine1.trim(),
        addressLine2: form.addressLine2.trim() || null,
        addressLine3: form.addressLine3.trim() || null,
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
      couponCode: effective.couponCode.trim().toUpperCase() || undefined,
      paymentMethod: method?.method || undefined,
      coin: combo?.coin || undefined,
      network: combo?.network || undefined,
      notes: effective.notes.trim() || undefined,
    };
  }

  async function submit() {
    if (submitLatch.current || locked) return;
    // Re-check every step, and go back to the first one that no longer holds —
    // a shipping option can stop being offered, or a method can drop out of the
    // quote, while the shopper is still reading the review. `validate` has set
    // the errors that explain why, so this deliberately isn't `goTo` (which
    // clears them).
    for (let index = 0; index < order.length - 1; index += 1) {
      if (validate(order[index]!)) continue;
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

      if (inTelegram) haptic.notify('success');
      const outcome = resolveCheckoutOutcome(result, loggedIn);
      if (outcome.kind === 'external' && inTelegram) {
        // Some gateways refuse to run inside Telegram's WebView: pay in the
        // browser, and leave the Mini App on the order so the shopper comes back
        // to its status rather than an empty checkout. A signed-in shopper lands
        // on their account order (inside the Mini App shell, with the BackButton);
        // a guest has no order page, so they get the order-placed screen.
        openExternalLink(outcome.url);
        navigate(
          loggedIn ? accountOrderPath(result.reference) : `/order-placed?${new URLSearchParams({ order: result.reference })}`,
          { replace: true },
        );
      } else if (outcome.kind === 'external') {
        window.location.assign(outcome.url);
      } else {
        navigate(outcome.to, { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        notifications.show({
          message: err.message || t('checkout.errors.inProgress'),
          color: 'red',
        });
        setLocked(true);
        if (lockTimer.current) clearTimeout(lockTimer.current);
        lockTimer.current = setTimeout(() => setLocked(false), LOCK_MS);
      } else {
        setSubmitError(errorMessage(err, t('checkout.errors.placeFailed')));
      }
    } finally {
      submitLatch.current = false;
      setSubmitting(false);
    }
  }

  const kind = order[step]!;
  const data = useMemo<CheckoutData>(
    () => ({
      form,
      patch,
      errors,
      contactModes: effectiveContactModes,
      shipCountries,
      countryMode: modeForCountry(form.country, shipLists, phoneMode),
      guest,
      currency,
      quote: shownQuote,
      optionsPending,
      method,
      combo,
      busy: isFetching || verifying,
      quoteStale: Boolean(quoteError),
      couponError: errorTarget === 'coupon' ? quoteMessage : undefined,
      shippingNotice: errorTarget === 'shipping' ? quoteMessage : undefined,
      addressNotice: errorTarget === 'address' ? quoteMessage : undefined,
      order,
      step,
      kind,
      onReview: step === order.length - 1,
      stack,
      goTo,
    }),
    [form, patch, errors, effectiveContactModes, shipCountries, shipLists, phoneMode, guest, currency, shownQuote, optionsPending, method, combo, isFetching, verifying, quoteError, errorTarget, quoteMessage, order, step, kind, stack, goTo],
  );
  const value = useMemo(() => ({ data, views: CHECKOUT_VIEWS }), [data]);

  // Registered before the early returns below — hooks can't sit behind them.
  const lastStep = step === order.length - 1;
  const showsForm = !(guest && !settings.turnstile) && !(lines.length === 0 && !placed);
  usePrimaryAction(
    inTelegram && showsForm && !stack
      ? {
          label: !lastStep
            ? t('checkout.actions.continue')
            : submitting
              ? t('checkout.actions.placing')
              : chargeTotal !== null && chargeTotal > 0
                ? t('checkout.actions.placeOrderTotal', { total: formatMoney(chargeTotal, currency) })
                : t('checkout.actions.placeOrder'),
          onClick: lastStep ? () => void submit() : next,
          disabled: submitting || locked || (lastStep && guest && verifying),
          busy: submitting,
        }
      : null,
  );

  // Guest checkout is two switches, not one: the feature flag AND a configured
  // Turnstile site key. With the flag on and no key the widget can never mount,
  // so every quote would hang on a token that will never come — and the backend
  // answers those routes `503 Guest checkout is not configured` anyway
  // (STOREFRONT.md §3.5a). Say so and offer the way through instead.
  if (guest && !settings.turnstile) {
    return (
      <EmptyState
        eyebrow={t('checkout.page.eyebrow')}
        title={t('checkout.page.guestUnavailableTitle')}
        description={t('checkout.page.guestUnavailableBody')}
        action={
          <Button component={Link} to="/login?returnTo=%2Fcheckout" variant="default" size="sm">
            {t('common.actions.signIn')}
          </Button>
        }
      />
    );
  }

  if (lines.length === 0 && !placed) {
    return (
      <EmptyState
        eyebrow={t('checkout.page.eyebrow')}
        title={t('checkout.page.emptyTitle')}
        description={t('checkout.page.emptyBody')}
        action={
          <Button component={Link} to="/" variant="default" size="sm">
            {t('common.actions.browseCatalogue')}
          </Button>
        }
      />
    );
  }

  const meta = STEP_META[kind];
  const onReview = step === order.length - 1;
  const nextDisabled = submitting || locked || (onReview && guest && verifying);

  return (
    <CheckoutFamily.Provider value={value}>
    <div className={classes.page}>
      {s.head()}

      <div className={classes.grid}>
        <div>
          {s.lead()}

          {stack ? (
            <div>{s.steps()}</div>
          ) : (
            <div key={step} className={`${classes.card} ${FADE}`} ref={cardRef} data-sf-part="card">
              <header className={classes.cardHead}>
                <span className={classes.cardCount}>
                  {t('checkout.steps.count', { current: step + 1, total: order.length })}
                </span>
                <h2 className={classes.cardTitle}>{t(meta.title)}</h2>
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
                    {t('common.actions.tryAgain')}
                  </button>
                </p>
              ) : null}
              {submitError ? <p className={classes.alert}>{submitError}</p> : null}
              {guest && verifying ? (
                <p className={classes.verifying}>
                  <span className={classes.pulse} aria-hidden />
                  {t('checkout.page.verifying')}
                </p>
              ) : null}

              {s.steps()}
            </div>
          )}

          {stack ? (
            <InertActionBand />
          ) : /* Inside Telegram the first step has nothing left in the nav — the MainButton
              is Continue — so the sticky band would be an empty strip over the form. */
          inTelegram && step === 0 ? null : (
            <div className={classes.nav}>
              {step > 0 ? (
                <button
                  type="button"
                  className={classes.back}
                  onClick={back}
                  data-sf-part="button"
                  data-variant="default"
                >
                  {t('checkout.actions.back')}
                </button>
              ) : null}
              {inTelegram ? null : onReview ? (
                <button
                  type="button"
                  className={classes.next}
                  onClick={() => void submit()}
                  disabled={nextDisabled}
                  data-sf-part="button"
                  data-variant="filled"
                  data-sf-cta="main"
                >
                  {submitting
                    ? t('checkout.actions.placing')
                    : chargeTotal !== null && chargeTotal > 0
                      ? tn('checkout.actions.placeOrderTotal', { total: <Money amount={chargeTotal} /> })
                      : t('checkout.actions.placeOrder')}
                  <Slot name="ButtonAdornment" variant="primary" cta busy={submitting} />
                </button>
              ) : (
                <button
                  type="button"
                  className={classes.next}
                  onClick={next}
                  data-sf-part="button"
                  data-variant="filled"
                  data-sf-cta="main"
                >
                  {t('checkout.actions.continue')}
                  <Slot name="ButtonAdornment" variant="primary" cta />
                </button>
              )}
            </div>
          )}

          {stack || onReview ? (
            <p className={classes.terms}>
              {t('checkout.page.terms')}
            </p>
          ) : null}

          {s.after()}
        </div>

        {s.aside({ className: classes.aside, as: 'aside' })}
      </div>

      {!stack && guest && settings.turnstile ? (
        <GuestTurnstile ref={turnstileRef} siteKey={settings.turnstile.siteKey} />
      ) : null}
    </div>
    </CheckoutFamily.Provider>
  );
}
