import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { backControls, type BackControls } from '@/features/webapp/back-controls.ts';
import { isFirstHistoryEntry } from '@/features/webapp/history-entry.ts';
import { useResolvedPrimaryAction } from '@/features/webapp/useResolvedPrimaryAction.ts';
import { supportsSecondaryButton } from '@/lib/telegram-webapp.ts';
import { useModalOpen } from '@/lib/use-modal-open.ts';

/**
 * Where "back" goes from this page, or null on the catalogue home, where there is nothing to go back to. One
 * rule for every back control: Telegram's header arrow, its bottom SecondaryButton and the in-page bar's button.
 */
export function useBackAction(): (() => void) | null {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return useMemo(
    () => (pathname === '/' ? null : () => (isFirstHistoryEntry() ? navigate('/', { replace: true }) : navigate(-1))),
    [pathname, navigate],
  );
}

/** The back action and which Telegram back controls show for it right now. */
export function useBackControls(): BackControls & { back: (() => void) | null } {
  const back = useBackAction();
  const hasPrimaryAction = useResolvedPrimaryAction() !== null;
  const modalOpen = useModalOpen();
  const controls = backControls({ supportsSecondary: supportsSecondaryButton(), hasPrimaryAction, modalOpen, backAvailable: back !== null });
  return { back, ...controls };
}
