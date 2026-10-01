import type { ReactNode } from 'react';
import { Stepper } from '@mantine/core';
import { CheckoutFamily, type StepKind } from '@/builder/family-checkout.ts';
import type { SlotRender } from '@/builder/define.ts';
import type { FamilyValue, PartViewProps } from '@/builder/parts.ts';
import { CouponField } from '@/features/checkout/CouponField.tsx';
import { TextareaField } from '@/features/checkout/Field.tsx';
import { QuoteSummary } from '@/features/checkout/QuoteSummary.tsx';
import { STEP_META } from '@/features/checkout/step-meta.ts';
import { AddressStep } from '@/features/checkout/steps/AddressStep.tsx';
import { ContactStep } from '@/features/checkout/steps/ContactStep.tsx';
import { PaymentStep } from '@/features/checkout/steps/PaymentStep.tsx';
import { NOTES_MAX, ReviewStep } from '@/features/checkout/steps/ReviewStep.tsx';
import { ShippingStep } from '@/features/checkout/steps/ShippingStep.tsx';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/checkout/CheckoutPage.module.css';
import stepClasses from '@/features/checkout/steps/Steps.module.css';

// Views hold no state and no effects: every checkout / order decision stays in CheckoutPage.

const slotOf = (props: Record<string, unknown>, key: 'before' | 'after'): ReactNode => (props[key] as SlotRender | undefined)?.();

function Heading({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { guest } = CheckoutFamily.useData();
  return (
    <header className={classes.head} {...styleAttrs}>
      <span className={classes.eyebrow}>{t('checkout.page.eyebrow')}</span>
      <h1 className={classes.title}>{guest ? t('checkout.page.guestTitle') : t('checkout.page.title')}</h1>
    </header>
  );
}

function Progress({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const data = CheckoutFamily.useData();
  return (
    <Stepper
      active={data.step}
      onStepClick={data.goTo}
      allowNextStepsSelect={false}
      size="xs"
      iconSize={26}
      data-sf-part="stepper"
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
      {...styleAttrs}
    >
      {data.order.map((kind) => (
        <Stepper.Step key={kind} label={t(STEP_META[kind].label)} />
      ))}
    </Stepper>
  );
}

function Contact({ props, styleAttrs }: PartViewProps) {
  const d = CheckoutFamily.useData();
  if (d.kind !== 'contact') return null;
  return (
    <ContactStep
      form={d.form} patch={d.patch} errors={d.errors} contactModes={d.contactModes} guest={d.guest}
      before={slotOf(props, 'before')} after={slotOf(props, 'after')} rootAttrs={styleAttrs}
    />
  );
}

function Address({ props, styleAttrs }: PartViewProps) {
  const d = CheckoutFamily.useData();
  if (d.kind !== 'address') return null;
  return (
    <AddressStep
      form={d.form} patch={d.patch} errors={d.errors} notice={d.addressNotice}
      before={slotOf(props, 'before')} after={slotOf(props, 'after')} rootAttrs={styleAttrs}
    />
  );
}

function Shipping({ props, styleAttrs }: PartViewProps) {
  const d = CheckoutFamily.useData();
  if (d.kind !== 'shipping') return null;
  return (
    <ShippingStep
      quote={d.quote} form={d.form} patch={d.patch} errors={d.errors} notice={d.shippingNotice}
      before={slotOf(props, 'before')} after={slotOf(props, 'after')} rootAttrs={styleAttrs}
    />
  );
}

function Payment({ props, styleAttrs }: PartViewProps) {
  const d = CheckoutFamily.useData();
  if (d.kind !== 'payment') return null;
  return (
    <PaymentStep
      quote={d.quote} form={d.form} patch={d.patch} errors={d.errors} guest={d.guest} currency={d.currency}
      before={slotOf(props, 'before')} after={slotOf(props, 'after')} rootAttrs={styleAttrs}
    />
  );
}

function Review({ props, styleAttrs }: PartViewProps) {
  const d = CheckoutFamily.useData();
  if (d.kind !== 'review') return null;
  return (
    <ReviewStep
      form={d.form} quote={d.quote} method={d.method} combo={d.combo} order={d.order}
      onEdit={(kind: StepKind) => d.goTo(d.order.indexOf(kind))}
      before={slotOf(props, 'before')} after={slotOf(props, 'after')} rootAttrs={styleAttrs}
    />
  );
}

function Coupon({ styleAttrs }: PartViewProps) {
  const d = CheckoutFamily.useData();
  return (
    <div className={stepClasses.section} {...styleAttrs}>
      <CouponField
        applied={d.quote?.coupon ?? null}
        code={d.form.couponCode}
        busy={d.busy}
        error={d.couponError}
        onApply={(code) => d.patch({ couponCode: code })}
        onRemove={() => d.patch({ couponCode: '' })}
      />
    </div>
  );
}

function Notes({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const d = CheckoutFamily.useData();
  return (
    <TextareaField
      label={t('checkout.review.notes')}
      value={d.form.notes}
      onChange={(v) => d.patch({ notes: v })}
      optional
      maxLength={NOTES_MAX}
      placeholder={t('checkout.review.notesPlaceholder')}
      hint={`${d.form.notes.length} / ${NOTES_MAX}`}
      rootAttrs={styleAttrs}
    />
  );
}

function Summary({ styleAttrs }: PartViewProps) {
  const d = CheckoutFamily.useData();
  return (
    <QuoteSummary
      defaultOpen={d.onReview}
      quote={d.quote}
      isFetching={d.busy}
      stale={d.quoteStale}
      method={d.method}
      combo={d.combo}
      rootAttrs={styleAttrs}
    />
  );
}

export const CHECKOUT_VIEWS: FamilyValue<never>['views'] = {
  CheckoutHeading: Heading,
  CheckoutProgress: Progress,
  CheckoutContact: Contact,
  CheckoutAddress: Address,
  CheckoutShipping: Shipping,
  CheckoutPayment: Payment,
  CheckoutReview: Review,
  CheckoutCoupon: Coupon,
  CheckoutNotes: Notes,
  CheckoutSummary: Summary,
};
