export interface BackControlsInput {
  /** The client has Telegram's SecondaryButton (Bot API 7.10+). */
  supportsSecondary: boolean;
  /** The MainButton is showing, so the bottom row exists whatever Back does. */
  hasPrimaryAction: boolean;
  modalOpen: boolean;
  /** There is somewhere to go back to (not the catalogue home). */
  backAvailable: boolean;
  /** The in-page running-tab bar is showing instead of the MainButton (see useWebAppCartBar). */
  cartBar?: boolean;
}

export interface BackControls {
  /** Telegram's header arrow (BackButton). */
  showHeaderBack: boolean;
  /** Back in the bottom row (SecondaryButton). */
  showBottomBack: boolean;
}

/**
 * Which of Telegram's two back controls to show, decided in one place so the header and the bottom row cannot
 * disagree. With a primary action the bottom row carries Back and the header arrow stands down; with none, Back is
 * the SecondaryButton alone, and the header arrow stays beside it as a safety net, so that no client that fails to
 * draw a lone SecondaryButton leaves a page with no way back. The safety net (the `!hasPrimaryAction` branch of
 * showHeaderBack) can go once Back alone has been seen working on a real device.
 */
export function backControls({ supportsSecondary, hasPrimaryAction, modalOpen, backAvailable, cartBar = false }: BackControlsInput): BackControls {
  if (!backAvailable || modalOpen) return { showHeaderBack: false, showBottomBack: false };
  if (!supportsSecondary) return { showHeaderBack: true, showBottomBack: false };
  // The running-tab bar is in the page, so a lone SecondaryButton would stack a second, native bar under it: Back
  // rides in the header instead, as it does on a client without the SecondaryButton.
  if (cartBar) return { showHeaderBack: true, showBottomBack: false };
  return { showHeaderBack: !hasPrimaryAction, showBottomBack: true };
}
