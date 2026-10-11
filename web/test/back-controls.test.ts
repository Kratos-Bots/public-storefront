import { describe, expect, it } from 'vitest';
import { backControls } from '@/features/webapp/back-controls.ts';

const rule = (supportsSecondary: boolean, pageAction: boolean, modalOpen: boolean, backAvailable: boolean) =>
  backControls({ supportsSecondary, pageAction, modalOpen, backAvailable });

describe('backControls', () => {
  it('shows nothing where there is nowhere to go back to, whatever else is true', () => {
    for (const s of [true, false]) for (const p of [true, false]) for (const m of [true, false]) {
      expect(rule(s, p, m, false)).toEqual({ showHeaderBack: false, showBottomBack: false });
    }
  });

  it('shows nothing under a modal, whatever else is true', () => {
    for (const s of [true, false]) for (const p of [true, false]) {
      expect(rule(s, p, true, true)).toEqual({ showHeaderBack: false, showBottomBack: false });
    }
  });

  it('a client without the SecondaryButton keeps the header arrow only', () => {
    for (const p of [true, false]) expect(rule(false, p, false, true)).toEqual({ showHeaderBack: true, showBottomBack: false });
  });

  it('beside an action a page claimed, Back is in the bottom row and the header arrow stands down', () => {
    expect(rule(true, true, false, true)).toEqual({ showHeaderBack: false, showBottomBack: true });
  });

  it('with no page-claimed action (nothing, the cart default or the running tab), Back is the header arrow alone', () => {
    expect(rule(true, false, false, true)).toEqual({ showHeaderBack: true, showBottomBack: false });
  });

  it('never shows both, and never neither while Back is available outside a modal', () => {
    for (const s of [true, false]) for (const p of [true, false]) {
      const r = rule(s, p, false, true);
      expect(r.showHeaderBack !== r.showBottomBack).toBe(true);
    }
  });
});
