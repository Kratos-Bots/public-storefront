import { Button } from '@mantine/core';
import { Link } from 'react-router';
import { EmptyState } from '@/components/EmptyState.tsx';

/** Shown for unknown paths and for routes whose feature the client has turned off. */
export function NotFoundPage() {
  return (
    <EmptyState
      eyebrow="404"
      title="This page isn't here"
      description="The link may be out of date, or this part of the shop is switched off."
      action={
        <Button component={Link} to="/" variant="default" size="sm">
          Back to the shop
        </Button>
      }
    />
  );
}
