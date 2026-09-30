/**
 * Below this frame width Puck's two sidebars (≈ 250 px each, plus its nav rail) leave the canvas
 * too narrow to read a page (≈ 200 px at 768), so the Blocks panel starts closed — "Add block" in
 * the header still inserts, and the panel toggle brings the list back.
 */
export const WIDE_FRAME_PX = 1024;
export const WIDE_FRAME_QUERY = `(min-width: ${WIDE_FRAME_PX}px)`;

type Side = 'left' | 'right';

/** What the person chose with the panel toggles; survives the canvas remounting on a page switch. */
const chosen: Partial<Record<Side, boolean>> = {};

/** Record a click on one toggle. Only the side the person clicked: a side closed as a knock-on effect was not their choice. */
export function rememberPanel(side: Side, visible: boolean): void {
  chosen[side] = visible;
}

/** The person's own choice for a side, if they made one. */
export function panelChoice(side: Side): boolean | undefined {
  return chosen[side];
}

/** Sidebar visibility for a freshly mounted canvas in a frame this wide. */
export function initialPanels(frameWidth: number): { leftSideBarVisible: boolean; rightSideBarVisible: boolean } {
  return {
    leftSideBarVisible: chosen.left ?? frameWidth >= WIDE_FRAME_PX,
    rightSideBarVisible: chosen.right ?? true,
  };
}

/**
 * The frame narrowed below WIDE_FRAME_PX while editing (the admin resized its panel): close the
 * Blocks panel, unless the person opened it themselves.
 */
export function shouldAutoCloseBlocks(wide: boolean): boolean {
  return !wide && chosen.left !== true;
}

/** Test hook. */
export function resetPanelChoice(): void {
  delete chosen.left;
  delete chosen.right;
}
