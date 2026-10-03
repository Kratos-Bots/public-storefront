import { useState } from 'react';
import { useReportChoice } from '@/features/auth/LoginStep.ts';
import { FADE } from '@/lib/motion.ts';
import { useSettings } from '@/app/settings.ts';
import { useText } from '@/text/runtime.tsx';
import { AccessNotice } from '@/features/auth/AccessNotice.tsx';
import { CodeSignIn } from '@/features/auth/CodeSignIn.tsx';
import { PasswordLogin } from '@/features/auth/PasswordLogin.tsx';
import { SignInUnavailable } from '@/features/auth/SignInUnavailable.tsx';
import { TelegramSignInBlock, telegramAvailability } from '@/features/auth/TelegramSignInBlock.tsx';
import { WhatsappLogin } from '@/features/auth/WhatsappLogin.tsx';
import type { StyleAttrs } from '@/builder/define.ts';
import classes from '@/features/auth/LoginOptions.module.css';

/**
 * Every way into an account. A backend that reports `login.phone` or `login.email` signs customers in with a
 * code (`CodeSignIn`); one that reports neither is older than that, and keeps exactly today's sign-in.
 * Shared by the page and the modal so a prompt raised from the cart is the same instrument as the page.
 */
export function LoginOptions({ rootAttrs }: { rootAttrs?: StyleAttrs } = {}) {
  const { login } = useSettings();
  if (login.phone === undefined && login.email === undefined) return <LegacyLoginOptions rootAttrs={rootAttrs} />;
  return <CodeSignIn rootAttrs={rootAttrs} />;
}

/**
 * Today's sign-in, for a backend that predates sign-in by code: the quick ways (WhatsApp, Telegram) as big
 * labelled buttons, a quiet "or", then the email-or-phone form. Its markup is pinned by the stage 4 goldens.
 *
 * While a WhatsApp code is waiting, the other ways step aside (hidden, not unmounted, so a half-typed email
 * survives the trip) and the code step has the screen to itself.
 */
function LegacyLoginOptions({ rootAttrs }: { rootAttrs?: StyleAttrs } = {}) {
  const settings = useSettings();
  const { t } = useText();
  const { login } = settings;
  const [waiting, setWaiting] = useState(false);
  const [signInStep, setSignInStep] = useState(true);
  useReportChoice(!waiting && signInStep);

  const whatsapp = login.whatsapp.available;
  const telegramOn = telegramAvailability(login).on;
  const password = login.password?.available === true;

  if (!whatsapp && !telegramOn && !password) return <SignInUnavailable rootAttrs={rootAttrs} />;

  return (
    <div className={`${classes.options} ${FADE}`} {...rootAttrs}>
      <AccessNotice placement="above" />

      {whatsapp || telegramOn ? (
        <div className={classes.quick}>
          {whatsapp ? <WhatsappLogin number={login.whatsapp.number} onWaiting={setWaiting} /> : null}
          {telegramOn ? <TelegramSignInBlock login={login} hidden={waiting} /> : null}
        </div>
      ) : null}

      {password ? (
        <div className={classes.password} hidden={waiting}>
          {whatsapp || telegramOn ? (
            <div className={classes.or} aria-hidden>
              <span>{t('auth.options.or')}</span>
            </div>
          ) : null}
          <PasswordLogin onSignInStep={setSignInStep} />
        </div>
      ) : null}

      <AccessNotice placement="below" />
    </div>
  );
}
