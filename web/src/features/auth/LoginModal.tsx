import { useEffect } from 'react';
import { Modal } from '@mantine/core';
import { useUiStore } from '@/stores/ui.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { LoginOptions } from '@/features/auth/LoginOptions.tsx';
import classes from '@/features/auth/LoginModal.module.css';

/**
 * The same ways in, raised over whatever the customer was doing — for the
 * moments where sending them to a page would lose their place (a cart about to
 * become a checkout). Whoever opens it parks a `returnTo` first if the customer
 * should land somewhere in particular; otherwise the modal simply stands down
 * once the session exists and leaves them where they were.
 */
export function LoginModal() {
  const opened = useUiStore((s) => s.loginOpen);
  const close = useUiStore((s) => s.close);
  const loggedIn = useSessionStore(selectIsLoggedIn);

  useEffect(() => {
    if (opened && loggedIn) close('loginOpen');
  }, [opened, loggedIn, close]);

  return (
    <Modal
      opened={opened}
      onClose={() => close('loginOpen')}
      title="Sign in"
      centered
      size="sm"
      radius="var(--mantine-radius-default)"
      classNames={{ content: classes.content, header: classes.header, title: classes.title }}
    >
      <p className={classes.lede}>
        There&rsquo;s no password — sign in from a chat app you already use.
      </p>
      <LoginOptions />
    </Modal>
  );
}
