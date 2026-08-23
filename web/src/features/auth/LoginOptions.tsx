import { useCallback, useState } from 'react';
import { useSettings } from '@/app/settings.ts';
import { loginTelegram } from '@/api/auth.ts';
import { errorMessage } from '@/lib/errors.ts';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';
import { TelegramIcon, WhatsAppIcon } from '@/components/icons.tsx';
import { AuthCard, AuthNote } from '@/features/auth/AuthCard.tsx';
import { TelegramLogin } from '@/features/auth/TelegramLogin.tsx';
import { WhatsappLogin } from '@/features/auth/WhatsappLogin.tsx';
import { useLoginSuccess } from '@/features/auth/useLoginSuccess.ts';
import type { TelegramAuthPayload } from '@/types/auth.ts';
import classes from '@/features/auth/LoginOptions.module.css';

/**
 * The password slot the spec reserves. No backend endpoint exists for it, so the
 * key is read off `login` as an optional one: the day the backend starts sending
 * it, the card appears; until then this reads as `undefined` and nothing renders.
 */
interface PasswordSlot {
  password?: { available?: boolean };
}

/**
 * Every way into an account, in one column. Shared by the page and the modal so
 * a prompt raised from the cart is the same instrument as the page it would
 * otherwise have navigated to.
 */
export function LoginOptions() {
  const settings = useSettings();
  const { login, brand } = settings;
  const onLogin = useLoginSuccess();
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramError, setTelegramError] = useState<string | undefined>();

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
          setTelegramError(errorMessage(err, "We couldn't sign you in with Telegram"));
        } finally {
          setTelegramBusy(false);
        }
      })();
    },
    [onLogin],
  );

  const whatsapp = login.whatsapp.available;
  // A bot with no username can't be embedded, so an "available" Telegram with
  // one missing is the same as no Telegram at all.
  const telegramBot = login.telegram.available ? login.telegram.botUsername : null;
  const password = (login as PasswordSlot).password?.available === true;

  if (!whatsapp && !telegramBot && !password) {
    return (
      <EmptyState
        eyebrow="Sign in"
        title="Sign-in isn’t available right now"
        description={`Message ${brand.shortName || brand.name} and we'll sort it out with you directly.`}
        action={<ContactLinks />}
      />
    );
  }

  return (
    <div className={classes.options}>
      {whatsapp ? (
        <AuthCard name="WhatsApp" icon={<WhatsAppIcon size={15} />}>
          <WhatsappLogin number={login.whatsapp.number} />
        </AuthCard>
      ) : null}

      {telegramBot ? (
        <AuthCard name="Telegram" icon={<TelegramIcon size={15} />}>
          <TelegramLogin botUsername={telegramBot} onAuth={onTelegram} />
          {telegramBusy ? <AuthNote>Signing you in</AuthNote> : null}
          {telegramError ? <AuthNote tone="danger">{telegramError}</AuthNote> : null}
        </AuthCard>
      ) : null}

      {password ? (
        <AuthCard name="Email or phone" dim>
          <p className={classes.soon}>Coming soon.</p>
        </AuthCard>
      ) : null}
    </div>
  );
}
