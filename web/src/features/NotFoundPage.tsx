import { Button } from '@mantine/core';
import { Link } from 'react-router';
import { EmptyState } from '@/components/EmptyState.tsx';
import { useText } from '@/text/runtime.tsx';

/** Shown for unknown paths and for routes whose feature the client has turned off. */
export function NotFoundPage() {
  const { t } = useText();
  return (
    <EmptyState
      eyebrow="404"
      title={t('shell.notFound.title')}
      description={t('shell.notFound.description')}
      action={
        <Button component={Link} to="/" variant="default" size="sm">
          {t('shell.notFound.backToShop')}
        </Button>
      }
    />
  );
}
