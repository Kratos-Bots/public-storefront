import { afterEach, describe, expect, it } from 'vitest';
import {
  initialPanels, panelChoice, rememberPanel, resetPanelChoice, shouldAutoCloseBlocks, WIDE_FRAME_PX,
} from '@/builder/editor/panels.ts';

afterEach(() => resetPanelChoice());

describe('initial sidebar visibility', () => {
  it('starts with the Blocks panel closed in a narrow frame, open in a wide one', () => {
    expect(initialPanels(768)).toEqual({ leftSideBarVisible: false, rightSideBarVisible: true });
    expect(initialPanels(WIDE_FRAME_PX - 1).leftSideBarVisible).toBe(false);
    expect(initialPanels(WIDE_FRAME_PX)).toEqual({ leftSideBarVisible: true, rightSideBarVisible: true });
    expect(initialPanels(1280).leftSideBarVisible).toBe(true);
  });

  it('keeps what the person chose with the toggles across remounts', () => {
    rememberPanel('left', true);
    expect(initialPanels(768).leftSideBarVisible).toBe(true);
    rememberPanel('right', false);
    expect(initialPanels(1280)).toEqual({ leftSideBarVisible: true, rightSideBarVisible: false });
    rememberPanel('left', false);
    expect(initialPanels(1440).leftSideBarVisible).toBe(false);
  });

  it('records only the side that was clicked', () => {
    rememberPanel('right', true);
    expect(panelChoice('right')).toBe(true);
    expect(panelChoice('left')).toBeUndefined();
  });
});

describe('the frame narrowing while editing', () => {
  it('closes the Blocks panel unless the person opened it', () => {
    expect(shouldAutoCloseBlocks(true)).toBe(false);
    expect(shouldAutoCloseBlocks(false)).toBe(true);
    rememberPanel('left', false);
    expect(shouldAutoCloseBlocks(false)).toBe(true);
    rememberPanel('left', true);
    expect(shouldAutoCloseBlocks(false)).toBe(false);
  });
});
