import type { CSSProperties } from 'react';

/** Class + inline var for a list row: `min(index, 14) × 25ms` delay, handled in CSS. */
export function rowAnim(index: number): { className: string; style: CSSProperties } {
  return { className: 'anim-row', style: { '--i': index } as CSSProperties };
}

/** Class + inline var for cards arriving in sequence: `min(index, 4) × 60ms`. */
export function staggerAnim(index: number): { className: string; style: CSSProperties } {
  return { className: 'anim-fade-stagger', style: { '--stagger': `${Math.min(index, 4) * 60}ms` } as CSSProperties };
}

/** Plain section fade. */
export const FADE = 'anim-fade';
