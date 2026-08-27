import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { z } from 'zod';
import { verifyProductUnit } from '@/api/verify.ts';
import type { VerificationResult } from '@/api/verify.ts';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { CheckIcon } from '@/components/icons.tsx';
import { FADE } from '@/lib/motion.ts';
import classes from '@/features/verify/VerifyPage.module.css';

const schema = z.object({
  verificationCode: z.string().trim().min(1, 'Required'),
  authCode: z.string().trim().regex(/^\d+$/, 'Digits only'),
});

type Status = 'idle' | 'pending' | 'verified' | 'invalid' | 'error';
type FieldErrors = { verificationCode?: string; authCode?: string };

// Deliberately its own format, not `lib/format.ts`'s `formatDate`: a
// certificate reads as data (2-digit day, short month), not prose, and a
// dash beats an empty cell when a date can't be parsed at all.
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

/**
 * Verify a product unit from the code pair printed on its label — the same
 * form-then-verdict shape as the rest of the shop's lookup pages, but the
 * verdict here is about the *unit*, not an order: genuine and in date,
 * genuine but expired, or a pair that doesn't match anything on file.
 */
export function VerifyPage() {
  const [verificationCode, setVerificationCode] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<VerificationResult | null>(null);

  const codeId = useId();
  const authId = useId();
  const codeErrorId = useId();
  const authErrorId = useId();

  // Editing either field drops a verdict already on screen — a stale
  // "Authentic" or "Not verified" must never survive an edit to the pair it
  // was answering.
  function edit(setter: (v: string) => void, value: string) {
    setter(value);
    if (status !== 'idle' && status !== 'pending') {
      setStatus('idle');
      setResult(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ verificationCode, authCode });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'verificationCode') next.verificationCode = issue.message;
        if (issue.path[0] === 'authCode') next.authCode = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setStatus('pending');
    setResult(null);
    try {
      const outcome = await verifyProductUnit(parsed.data.verificationCode, Number(parsed.data.authCode));
      if (outcome.status === 'verified') {
        setResult(outcome.data);
        setStatus('verified');
      } else {
        setStatus('invalid');
      }
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className={classes.page}>
      <div className={classes.masthead}>
        <p className={classes.eyebrow}>Authenticity</p>
        <h1 className={classes.title}>Verify a product</h1>
        <p className={classes.lead}>Enter the codes printed on your product label to confirm it's genuine.</p>
      </div>

      <form className={classes.form} onSubmit={(e) => void onSubmit(e)}>
        <div className={classes.field}>
          <div className={classes.fieldHead}>
            <label htmlFor={codeId}>Verification code</label>
            {errors.verificationCode ? (
              <span id={codeErrorId} className={classes.fieldError} role="alert">
                {errors.verificationCode}
              </span>
            ) : null}
          </div>
          <input
            id={codeId}
            className={classes.input}
            type="text"
            value={verificationCode}
            onChange={(e) => edit(setVerificationCode, e.target.value)}
            placeholder="AB3D-SKU12"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            aria-invalid={errors.verificationCode ? 'true' : undefined}
            aria-describedby={errors.verificationCode ? codeErrorId : undefined}
          />
        </div>

        <div className={classes.field}>
          <div className={classes.fieldHead}>
            <label htmlFor={authId}>Authentication code</label>
            {errors.authCode ? (
              <span id={authErrorId} className={classes.fieldError} role="alert">
                {errors.authCode}
              </span>
            ) : null}
          </div>
          <input
            id={authId}
            className={classes.input}
            type="text"
            inputMode="numeric"
            value={authCode}
            onChange={(e) => edit(setAuthCode, e.target.value)}
            placeholder="123456"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            aria-invalid={errors.authCode ? 'true' : undefined}
            aria-describedby={errors.authCode ? authErrorId : undefined}
          />
        </div>

        <button className={classes.submit} type="submit" disabled={status === 'pending'}>
          {status === 'pending' ? 'Checking…' : 'Verify product'}
        </button>
      </form>

      {status === 'verified' && result ? <VerifiedCard result={result} /> : null}
      {status === 'invalid' ? <InvalidCard /> : null}
      {status === 'error' ? <ErrorCard /> : null}

      <Link to="/" className={classes.back}>
        ← Back to shop
      </Link>
    </div>
  );
}

function VerifiedCard({ result }: { result: VerificationResult }) {
  const expiry = new Date(result.expiryDate);
  const expired = !Number.isNaN(expiry.getTime()) && expiry.getTime() < Date.now();

  return (
    <div className={`${classes.screen} ${FADE}`} data-tone="success">
      <div className={classes.screenBadge}>
        <span className={classes.ring} aria-hidden>
          <CheckIcon size={11} />
        </span>
        <p className={classes.screenHead} data-tone="success">
          Authentic Product
        </p>
      </div>
      <p className={classes.screenText}>This code matches a genuine unit from our records.</p>
      <dl className={classes.facts}>
        <Row label="Issued" value={formatDate(result.createdAt)} />
        <Row label="Expires" value={formatDate(result.expiryDate)} danger={expired} />
      </dl>
      {expired ? (
        <p className={classes.screenNote} data-tone="danger">
          Note: this unit is past its expiry date.
        </p>
      ) : null}
    </div>
  );
}

function InvalidCard() {
  return (
    <div className={`${classes.screen} ${FADE}`} data-tone="danger">
      <p className={classes.screenHead} data-tone="danger">
        Not Verified
      </p>
      <p className={classes.screenText}>
        We couldn't match this code pair to a genuine unit. Double-check both codes exactly as printed
        on the label.
      </p>
      <p className={classes.screenSub}>
        If they're correct and still don't verify, contact us and our team will check manually.
      </p>
      <div className={classes.screenContact}>
        <ContactLinks />
      </div>
    </div>
  );
}

function ErrorCard() {
  return (
    <div className={`${classes.screen} ${FADE}`} data-tone="warn">
      <p className={classes.screenHead} data-tone="warn">
        Connection Error
      </p>
      <p className={classes.screenText}>
        We couldn't reach the verification service. Try again in a moment, or contact us below.
      </p>
      <div className={classes.screenContact}>
        <ContactLinks />
      </div>
    </div>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={classes.row}>
      <dt className={classes.rowLabel}>{label}</dt>
      <dd className={danger ? `${classes.rowValue} ${classes.rowValueDanger}` : classes.rowValue}>
        {value}
      </dd>
    </div>
  );
}
