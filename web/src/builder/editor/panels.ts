/**
 * Below this frame width Puck's two sidebars (≈ 250 px each, plus its nav rail) leave the canvas
 * too narrow to read a page (≈ 200 px at 768), so the Blocks panel starts closed — "Add block" in
 * the header still inserts, and the panel toggle brings the list back.
 */
export const WIDE_FRAME_PX = 1024;

/** What the person chose with the panel toggles; survives the canvas remounting on a page switch. */
const chosen: { left?: boolean; right?: boolean } = {};

export function rememberPanels(choice: { left?: boolean; right?: boolean }): void {
  if (choice.left !== undefined) chosen.left = choice.left;
  if (choice.right !== undefined) chosen.right = choice.right;
}

/** Sidebar visibility for a freshly mounted canvas in a frame this wide. */
export function initialPanels(frameWidth: number): { leftSideBarVisible: boolean; rightSideBarVisible: boolean } {
  return {
    leftSideBarVisible: chosen.left ?? frameWidth >= WIDE_FRAME_PX,
    rightSideBarVisible: chosen.right ?? true,
  };
}

/** Test hook. */
export function resetPanelChoice(): void {
  delete chosen.left;
  delete chosen.right;
}
