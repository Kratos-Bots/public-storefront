import { useState, type ReactNode, type Ref } from 'react';
import { Drawer } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import classes from '@/components/Sheet.module.css';
import { useSheetSwipe, type SheetZone } from '@/components/useSheetSwipe.ts';

/**
 * Who owns a touch. The handle and the pinned header are the grab zone; the body hands its touches
 * over only when it is scrolled to the very top (the hook checks that); the action foot is left alone.
 */
function zoneOf(target: Element, panel: HTMLElement): SheetZone {
  if (target.closest(`.${classes.footer}`)) return 'none';
  if (target.closest(`.${classes.body}`)) return 'body';
  return panel.contains(target) ? 'grab' : 'none';
}

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
  /** `drawer` for the cart's own sheet (`CartDrawer`); every other sheet is `sheet`. */
  part?: 'sheet' | 'drawer';
  /** The drawer's root element, once it is in the document (it exists while the sheet is closed). */
  rootRef?: Ref<HTMLDivElement>;
}

/**
 * The menu layout's sheet: it rises from the bottom of a phone with a grab handle
 * and slides in from the right from 62em, where a handle would be a lie. Mantine
 * owns the mechanics — focus trap, Escape, scroll lock, overlay — and the header,
 * body and action foot are three rows of one flex column, so the action never
 * scrolls away from the thing it acts on.
 */
export function Sheet({ opened, onClose, label, header, footer, children, part = 'sheet', rootRef }: SheetProps) {
  // Read synchronously: a deferred match renders the bottom sheet first and snaps
  // it to the side panel a frame later.
  const desktop = useMediaQuery(DESKTOP, false, { getInitialValueInEffect: false });

  // The panel mounts with the open transition, so it is tracked as state, not a plain ref.
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  useSheetSwipe({ panel, enabled: opened && !desktop, onClose, zoneOf });

  return (
    <Drawer.Root
      ref={rootRef}
      opened={opened}
      onClose={onClose}
      position={desktop ? 'right' : 'bottom'}
      size={desktop ? 460 : '88dvh'}
      padding={0}
      // Styled through the Root's styles API, not `className` on `Drawer.Content`:
      // that prop is handed to the positioning wrapper as well as the panel, and a
      // `flex-direction: column` reaching the wrapper re-anchors the whole drawer.
      classNames={{ content: classes.content }}
      // The theme's `components.Drawer.defaultProps` only reaches the all-in-one
      // `<Drawer>`: compound `Drawer.Root`/`Drawer.Overlay` look themselves up
      // under theme.components.DrawerRoot/DrawerOverlay (Mantine's useProps takes
      // the exact factory name), which this theme never sets — so both the timing
      // and the overlay have to be repeated explicitly here.
      transitionProps={{ duration: 300, timingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
    >
      <Drawer.Overlay backgroundOpacity={0.7} blur={2} />
      <Drawer.Content ref={setPanel} aria-label={label} data-sf-part={part}>
        <span className={classes.handle} aria-hidden />
        {header}
        <div className={classes.body}>{children}</div>
        {footer ? <div className={classes.footer}>{footer}</div> : null}
      </Drawer.Content>
    </Drawer.Root>
  );
}
