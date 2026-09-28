import { Button } from '@mantine/core';
import { EmptyState } from '@/components/EmptyState.tsx';
import { bootTelegramSession } from '@/app/telegram-session.ts';
import { useTelegramAuthStore } from '@/stores/telegram.ts';

/**
 * Inside Telegram there is no other way in — no widget, no WhatsApp code — so a
 * failed exchange says so plainly and offers the only two remedies there are.
 */
export function TelegramSignInError() {
  const error = useTelegramAuthStore((s) => s.error);
  return (
    <EmptyState
      eyebrow="Telegram"
      title="Couldn’t sign you in through Telegram"
      description={`Close and reopen the shop from the bot.${error ? ` (${error})` : ''}`}
      action={
        <Button variant="default" size="sm" onClick={() => void bootTelegramSession()}>
          Try again
        </Button>
      }
    />
  );
}
