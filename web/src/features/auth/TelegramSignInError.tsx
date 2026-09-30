import { Button } from '@mantine/core';
import { EmptyState } from '@/components/EmptyState.tsx';
import { bootTelegramSession } from '@/app/telegram-session.ts';
import { useTelegramAuthStore } from '@/stores/telegram.ts';
import { useText } from '@/text/runtime.tsx';

/**
 * Inside Telegram there is no other way in — no widget, no WhatsApp code — so a
 * failed exchange says so plainly and offers the only two remedies there are.
 */
export function TelegramSignInError() {
  const error = useTelegramAuthStore((s) => s.error);
  const { t } = useText();
  return (
    <EmptyState
      eyebrow={t('common.contact.telegram')}
      title={t('auth.telegram.errorTitle')}
      description={t('auth.telegram.errorBody', { detail: error ? ` (${error})` : '' })}
      action={
        <Button variant="default" size="sm" onClick={() => void bootTelegramSession()}>
          {t('common.actions.tryAgain')}
        </Button>
      }
    />
  );
}
