/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// `new URL('../foo', import.meta.url)` is intercepted by Vite's asset-import
// transform even inside test files, rewriting it into a fake dev-server URL
// (http://localhost:3000/...) instead of a real file:// path — so plain
// fs.readFileSync on it fails. Resolve the directory via fileURLToPath +
// path.resolve instead, which the transform does not touch.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath: string) => readFileSync(path.resolve(testDir, relativePath), 'utf8');

const css = read('../src/styles/chassis.css');
const shells = ['StorefrontShell', 'MenuShell', 'Chromeless'].map((n) =>
  read(`../src/layouts/${n}.module.css`),
);

// The seven modules that dress a bar or a foot in the chassis' one glass recipe,
// rather than inlining the four (or three, for the softer mix) lines themselves.
const glassModules: Array<[string, 'glass' | 'glass-soft']> = [
  ['../src/layouts/StorefrontShell.module.css', 'glass'],
  ['../src/layouts/MenuShell.module.css', 'glass'],
  ['../src/components/ContactLinks.module.css', 'glass'],
  ['../src/features/cart/MobileCartBar.module.css', 'glass'],
  ['../src/features/wholesale/WholesaleBar.module.css', 'glass'],
  ['../src/components/Sheet.module.css', 'glass-soft'],
  ['../src/features/checkout/CheckoutPage.module.css', 'glass-soft'],
];

describe('chassis.css', () => {
  it('paints the two-layer gradient ground, fixed', () => {
    expect(css).toMatch(/radial-gradient\(ellipse 80% 60% at 50% 0%, color-mix\(in srgb, var\(--sf-surface-3\) 35%, transparent\), transparent 65%\)/);
    expect(css).toMatch(/radial-gradient\(ellipse 60% 40% at 50% 100%, color-mix\(in srgb, var\(--sf-bg-deep\) 50%, transparent\), transparent 70%\)/);
    expect(css).toContain('background-attachment: fixed');
  });
  it('defines the glass utilities', () => {
    expect(css).toMatch(/\.glass\s*\{[^}]*color-mix\(in srgb, var\(--sf-bg\) 85%, transparent\)[^}]*backdrop-filter: blur\(12px\)/s);
    expect(css).toMatch(/\.glass-soft\s*\{[^}]*80%[^}]*blur\(8px\)/s);
  });
  it('lets the gradient show through every shell', () => {
    for (const shell of shells) expect(shell).not.toMatch(/\.shell\s*\{[^}]*background: var\(--sf-bg\);/s);
  });
  it('draws every glass bar/foot from the one chassis recipe, not an inlined copy', () => {
    for (const [file, recipe] of glassModules) {
      expect(read(file), file).toContain(`composes: ${recipe} from global`);
    }
  });
});
