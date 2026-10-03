import { useCallback, useState } from 'react';
import { loginTelegram } from '@/api/auth.ts';
import { useLoginSuccess } from '@/features/auth/useLoginSuccess.ts';
import { errorMessage } from '@/lib/errors.ts';
import { useText } from '@/text/runtime.tsx';
import type { TelegramAuthPayload } from '@/types/auth.ts';

/** The Telegram Login Widget's handler: post its payload as it came, then the shared success path. */
export function useTelegramSignIn() {
  const { t } = useText();
  const onLogin = useLoginSuccess();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const onTelegram = useCallback(
    (user: TelegramAuthPayload) => {
      setBusy(true);
      setError(undefined);
      void (async () => {
        try {
          // Posted exactly as the widget handed it over: the backend rejects a payload with a field added
          // or removed, because either would desync the signature it checks.
          const result = await loginTelegram(user);
          await onLogin(result);
        } catch (err) {
          setError(errorMessage(err, t('auth.telegram.widgetFailed')));
        } finally {
          setBusy(false);
        }
      })();
    },
    [onLogin, t],
  );

  return { onTelegram, busy, error };
}
