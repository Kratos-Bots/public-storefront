import type { KeyboardEvent } from 'react';

/** Roving tabindex for a single-select radio group: the checked radio (or the first) is the one tab stop. */
export function radioTabIndex(index: number, checkedIndex: number): 0 | -1 {
  return index === (checkedIndex < 0 ? 0 : checkedIndex) ? 0 : -1;
}

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * WAI-ARIA radio group keys: arrows move and select (wrapping), Home/End jump to the ends. Focus
 * follows to the newly selected radio inside `e.currentTarget` (the element with role="radiogroup").
 */
export function onRadioGroupKeyDown(e: KeyboardEvent<HTMLElement>, count: number, checkedIndex: number, select: (index: number) => void): void {
  if (count === 0) return;
  const from = checkedIndex < 0 ? 0 : checkedIndex;
  let next: number;
  if (e.key in STEP) next = (from + STEP[e.key]! + count) % count;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = count - 1;
  else return;
  e.preventDefault();
  select(next);
  e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
}
