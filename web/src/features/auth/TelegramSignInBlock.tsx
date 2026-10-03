import { AuthNote } from '@/features/auth/AuthNote.tsx';
import { TelegramLogin } from '@/features/auth/TelegramLogin.tsx';
import { useTelegramSignIn } from '@/features/auth/useTelegramSignIn.ts';
import { useText } from '@/text/runtime.tsx';
import type { StorefrontSettings } from '@/types/settings.ts';
import classes from '@/features/auth/LoginOptions.module.css';

type LoginSettings = StorefrontSettings['login'];

/**
 * Whether Telegram sign-in is usable, and how. OpenID Connect needs no bot username (the redirect flow never
 * embeds the bot), so it stands on its own; the widget can't be embedded without one, so an "available" widget
 * with no username is no Telegram at all.
 */
export function telegramAvailability(login: LoginSettings) {
  const oidc = login.telegram.oidc === true;
  const bot = login.telegram.available ? login.telegram.botUsername : null;
  return { oidc, bot, on: oidc || Boolean(bot) };
}

/** The Telegram button with its "signing in" and error notes; shared by both sign-in layouts. */
export function TelegramSignInBlock({ login, hidden }: { login: LoginSettings; hidden?: boolean }) {
  const { t } = useText();
  const telegram = useTelegramSignIn();
  const { oidc, bot } = telegramAvailability(login);
  return (
    <div className={classes.telegram} hidden={hidden}>
      <TelegramLogin botUsername={bot} onAuth={telegram.onTelegram} oidc={oidc} />
      {telegram.busy ? <AuthNote>{t('auth.options.signingIn')}</AuthNote> : null}
      {telegram.error ? <div role="alert"><AuthNote tone="danger">{telegram.error}</AuthNote></div> : null}
    </div>
  );
}
