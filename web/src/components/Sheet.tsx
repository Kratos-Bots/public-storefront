import type { ReactNode } from 'react';
import { Drawer } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import classes from '@/components/Sheet.module.css';

/** Mantine's `md` breakpoint — where a bottom sheet becomes a right-hand panel. */
const DESKTOP = '(min-width: 62em)';

export interface SheetProps {
  opened: boolean;
  onClose: () => void;
  /** Names the dialog for screen readers. */
  label: string;
  /** Pinned above the scrolling body. */
  header?: ReactNode;
  /** Pinned below it — where the sheet's action lives. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * The menu layout's sheet: it rises from the bottom of a phone with a grab handle
 * and slides in from the right from 62em, where a handle would be a lie. Mantine
 * owns the mechanics — focus trap, Escape, scroll lock, overlay — and the header,
 * body and action foot are three rows of one flex column, so the action never
 * scrolls away from the thing it acts on.
 */
export function Sheet({ opened, onClose, label, header, footer, children }: SheetProps) {
  // Read synchronously: a deferred match renders the bottom sheet first and snaps
  // it to the side panel a frame later.
  const desktop = useMediaQuery(DESKTOP, false, { getInitialValueInEffect: false });

  return (
    <Drawer.Root
      opened={opened}
      onClose={onClose}
      position={desktop ? 'right' : 'bottom'}
      size={desktop ? 460 : '88dvh'}
      padding={0}
      // Styled through the Root's styles API, not `className` on `Drawer.Content`:
      // that prop is handed to the positioning wrapper as well as the panel, and a
      // `flex-direction: column` reaching the wrapper re-anchors the whole drawer.
      classNames={{ content: classes.content }}
    >
      <Drawer.Overlay backgroundOpacity={0.62} blur={2} />
      <Drawer.Content aria-label={label}>
        <span className={classes.handle} aria-hidden />
        {header}
        <div className={classes.body}>{children}</div>
        {footer ? <div className={classes.footer}>{footer}</div> : null}
      </Drawer.Content>
    </Drawer.Root>
  );
}
