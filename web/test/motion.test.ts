/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FADE, rowAnim, staggerAnim } from '@/lib/motion.ts';

// `new URL('../foo', import.meta.url)` is intercepted by Vite's asset-import
// transform even inside test files, rewriting it into a fake dev-server URL
// (http://localhost:3000/...) instead of a real file:// path — so plain
// fs.readFileSync on it fails. Resolve the directory via fileURLToPath +
// path.resolve instead, which the transform does not touch.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.resolve(testDir, '../src/styles/motion.css'), 'utf8');

describe('motion.css', () => {
  it('defines the four keyframes', () => {
    for (const name of ['sf-row-enter', 'sf-fade-in', 'sf-scale-in', 'sf-ping']) expect(css).toContain(`@keyframes ${name}`);
  });
  it('uses the ecommerce-menu timings', () => {
    expect(css).toMatch(/\.anim-row\s*\{[^}]*sf-row-enter 0\.4s cubic-bezier\(0\.2, 0\.8, 0\.2, 1\) backwards[^}]*calc\(min\(var\(--i, 0\), 14\) \* 25ms\)/s);
    expect(css).toMatch(/\.anim-fade\s*\{[^}]*sf-fade-in 0\.3s ease backwards/s);
  });
  it('neutralises everything under reduced motion and removes the stagger outright', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/\.anim-fade-stagger\s*\{\s*animation: none;/);
    expect(reduced).toMatch(/\.ping\s*\{\s*display: none;/);
    expect(reduced).toMatch(/\.anim-row, \.anim-fade, \.anim-scale\s*\{[^}]*animation-duration: 0\.01ms/s);
  });
});

describe('motion helpers', () => {
  it('rowAnim sets the class and the index variable', () => {
    expect(rowAnim(3)).toEqual({ className: 'anim-row', style: { '--i': 3 } });
  });
  it('staggerAnim caps the delay at the fifth item', () => {
    expect(staggerAnim(0).style).toEqual({ '--stagger': '0ms' });
    expect(staggerAnim(2).style).toEqual({ '--stagger': '120ms' });
    expect(staggerAnim(9).style).toEqual({ '--stagger': '240ms' });
    expect(staggerAnim(9).className).toBe('anim-fade-stagger');
    expect(FADE).toBe('anim-fade');
  });
});
