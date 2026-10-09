import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { backControls, type BackControls } from '@/features/webapp/back-controls.ts';
import { isFirstHistoryEntry } from '@/features/webapp/history-entry.ts';
import { useBackActionStore } from '@/stores/back-action.ts';
import { useResolvedPrimaryAction, useWebAppCartBar } from '@/features/webapp/useResolvedPrimaryAction.ts';
import { supportsSecondaryButton } from '@/lib/telegram-webapp.ts';
import { useModalOpen } from '@/lib/use-modal-open.ts';

/**
 * Where "back" goes from this page, or null on the catalogue home, where there is nothing to go back to. A page
 * that has claimed Back (the checkout stepping back through its steps) answers for itself. One rule for every
 * back control: Telegram's header arrow, its bottom SecondaryButton and the in-page bar's button.
 */
export function useResolvedBackAction(): (() => void) | null {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const claimed = useBackActionStore((s) => s.override);
  return useMemo(
    () => claimed ?? (pathname === '/' ? null : () => (isFirstHistoryEntry() ? navigate('/', { replace: true }) : navigate(-1))),
    [claimed, pathname, navigate],
  );
}

/** The back action and which Telegram back controls show for it right now. */
export function useBackControls(): BackControls & { back: (() => void) | null } {
  const back = useResolvedBackAction();
  const hasPrimaryAction = useResolvedPrimaryAction() !== null;
  const cartBar = useWebAppCartBar();
  const modalOpen = useModalOpen();
  const controls = backControls({ supportsSecondary: supportsSecondaryButton(), hasPrimaryAction, modalOpen, backAvailable: back !== null, cartBar });
  return { back, ...controls };
}
