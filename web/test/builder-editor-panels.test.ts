import { afterEach, describe, expect, it } from 'vitest';
import { initialPanels, rememberPanels, resetPanelChoice, WIDE_FRAME_PX } from '@/builder/editor/panels.ts';

afterEach(() => resetPanelChoice());

describe('initial sidebar visibility', () => {
  it('starts with the Blocks panel closed in a narrow frame, open in a wide one', () => {
    expect(initialPanels(768)).toEqual({ leftSideBarVisible: false, rightSideBarVisible: true });
    expect(initialPanels(WIDE_FRAME_PX - 1).leftSideBarVisible).toBe(false);
    expect(initialPanels(WIDE_FRAME_PX)).toEqual({ leftSideBarVisible: true, rightSideBarVisible: true });
    expect(initialPanels(1280).leftSideBarVisible).toBe(true);
  });

  it('keeps what the person chose with the toggles across remounts', () => {
    rememberPanels({ left: true });
    expect(initialPanels(768).leftSideBarVisible).toBe(true);
    rememberPanels({ right: false });
    expect(initialPanels(1280)).toEqual({ leftSideBarVisible: true, rightSideBarVisible: false });
    rememberPanels({ left: false });
    expect(initialPanels(1440).leftSideBarVisible).toBe(false);
  });
});
