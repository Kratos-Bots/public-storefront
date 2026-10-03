import { useSettings } from '@/app/settings.ts';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';
import { AccessNotice } from '@/features/auth/AccessNotice.tsx';
import { useText } from '@/text/runtime.tsx';
import type { StyleAttrs } from '@/builder/define.ts';

/** Shown when the shop has no way of signing in switched on. */
export function SignInUnavailable({ rootAttrs }: { rootAttrs?: StyleAttrs }) {
  const { brand } = useSettings();
  const { t } = useText();
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
