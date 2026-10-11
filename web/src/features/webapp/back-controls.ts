export interface BackControlsInput {
  /** The client has Telegram's SecondaryButton (Bot API 7.10+). */
  supportsSecondary: boolean;
  /** A page has claimed the primary action (the checkout steps), as opposed to the cart default ("Checkout" on /cart). */
  pageAction: boolean;
  modalOpen: boolean;
  /** There is somewhere to go back to (not the catalogue home). */
  backAvailable: boolean;
}

export interface BackControls {
  /** Telegram's header arrow (BackButton). */
  showHeaderBack: boolean;
  /** Back in the bottom row (SecondaryButton). */
  showBottomBack: boolean;
}

/**
 * Which of Telegram's two back controls to show, decided in one place so the header and the bottom row cannot
 * disagree. Back sits in the bottom row only beside an action a page has claimed for itself (the checkout steps);
 * everywhere else, whether the cart default, the running-tab bar or nothing at all is showing, a lone or stacked
 * bottom Back only eats screen height, so Back is the header arrow alone. Never both, never neither while there is
 * somewhere to go back to (outside a modal).
 */
export function backControls({ supportsSecondary, pageAction, modalOpen, backAvailable }: BackControlsInput): BackControls {
  if (!backAvailable || modalOpen) return { showHeaderBack: false, showBottomBack: false };
  if (supportsSecondary && pageAction) return { showHeaderBack: false, showBottomBack: true };
  return { showHeaderBack: true, showBottomBack: false };
}
