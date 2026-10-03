import { useCallback, useState } from 'react';
import { useReportChoice } from '@/features/auth/LoginStep.ts';
import { FADE } from '@/lib/motion.ts';
import { useSettings } from '@/app/settings.ts';
import { loginTelegram } from '@/api/auth.ts';
import { errorMessage } from '@/lib/errors.ts';
import { useText } from '@/text/runtime.tsx';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';
import { AccessNotice } from '@/features/auth/AccessNotice.tsx';
import { AuthNote } from '@/features/auth/AuthNote.tsx';
import { PasswordLogin } from '@/features/auth/PasswordLogin.tsx';
import { TelegramLogin } from '@/features/auth/TelegramLogin.tsx';
import { WhatsappLogin } from '@/features/auth/WhatsappLogin.tsx';
import { useLoginSuccess } from '@/features/auth/useLoginSuccess.ts';
import type { TelegramAuthPayload } from '@/types/auth.ts';
import type { StyleAttrs } from '@/builder/define.ts';
import classes from '@/features/auth/LoginOptions.module.css';

/**
 * Every way into an account, on one calm surface: the quick ways (WhatsApp,
 * Telegram) as big labelled buttons, a quiet "or", then the email-or-phone form.
 * Shared by the page and the modal so a prompt raised from the cart is the same
 * instrument as the page it would otherwise have navigated to.
 *
 * While a WhatsApp code is waiting, the other ways step aside (hidden, not
 * unmounted, so a half-typed email survives the trip) and the code step has the
 * screen to itself.
 */
export function LoginOptions({ rootAttrs }: { rootAttrs?: StyleAttrs } = {}) {
  const settings = useSettings();
  const { t } = useText();
  const { login, brand } = settings;
  const onLogin = useLoginSuccess();
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramError, setTelegramError] = useState<string | undefined>();
  const [waiting, setWaiting] = useState(false);
  const [signInStep, setSignInStep] = useState(true);
  useReportChoice(!waiting && signInStep);

  const onTelegram = useCallback(
    (user: TelegramAuthPayload) => {
      setTelegramBusy(true);
      setTelegramError(undefined);
      void (async () => {
        try {
          // Posted exactly as the widget handed it over — the backend rejects a
          // payload with a field added or removed, because either would desync
          // the signature it checks.
          const result = await loginTelegram(user);
          await onLogin(result);
        } catch (err) {
          setTelegramError(errorMessage(err, t('auth.telegram.widgetFailed')));
        } finally {
          setTelegramBusy(false);
        }
      })();
    },
    [onLogin, t],
  );

  const whatsapp = login.whatsapp.available;
  // A bot with no username can't be embedded, so an "available" Telegram with
  // one missing is the same as no Telegram at all.
  const telegramBot = login.telegram.available ? login.telegram.botUsername : null;
  const password = login.password?.available === true;

  if (!whatsapp && !telegramBot && !password) {
    return (
      <EmptyState
        eyebrow={t('common.actions.signIn')}
        title={t('auth.options.unavailableTitle')}
        description={t('auth.options.unavailableBody', { name: brand.shortName || brand.name })}
        action={
          <>
            <ContactLinks />
            <AccessNotice />
          </>
        }
        rootAttrs={rootAttrs}
      />
    );
  }

  return (
    <div className={`${classes.options} ${FADE}`} {...rootAttrs}>
      <AccessNotice placement="above" />

      {whatsapp || telegramBot ? (
        <div className={classes.quick}>
          {whatsapp ? <WhatsappLogin number={login.whatsapp.number} onWaiting={setWaiting} /> : null}
          {telegramBot ? (
            <div className={classes.telegram} hidden={waiting}>
              <TelegramLogin botUsername={telegramBot} onAuth={onTelegram} oidc={login.telegram.oidc === true} />
              {telegramBusy ? <AuthNote>{t('auth.options.signingIn')}</AuthNote> : null}
              {telegramError ? <div role="alert"><AuthNote tone="danger">{telegramError}</AuthNote></div> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {password ? (
        <div className={classes.password} hidden={waiting}>
          {whatsapp || telegramBot ? (
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
