/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tokenVariables } from '@/templates/tokens.ts';
import { BASE_TOKENS } from '@/templates/define.ts';

// `new URL('../foo', import.meta.url)` is intercepted by Vite's asset-import
// transform even inside test files, rewriting it into a fake dev-server URL
// (http://localhost:3000/...) instead of a real file:// path — so plain
// fs.readFileSync on it fails. Resolve the directory via fileURLToPath +
// path.resolve instead, which the transform does not touch.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(path.resolve(testDir, p), 'utf8');
const css = read('../src/styles/mantine.css');

describe('mantine.css', () => {
  it('gives buttons the mono voice and press feedback', () => {
    expect(css).toMatch(/\.sf-button\s*\{[^}]*font-family: var\(--sf-btn-font\)[^}]*text-transform: var\(--sf-btn-transform\)[^}]*font-weight: var\(--sf-btn-weight\)[^}]*letter-spacing: var\(--sf-btn-tracking-md\)/s);
    expect(css).toMatch(/\.sf-button:active:not\(\[data-disabled\]\)\s*\{\s*transform: scale\(0\.98\);/);
    expect(css).toMatch(/\.sf-icon-button:active:not\(\[data-disabled\]\)\s*\{\s*transform: scale\(0\.97\);/);
    // The variant/size colour and font-size variables are no longer set in CSS — Mantine's
    // Button injects its own --button-* variables as an inline style, which always beats a
    // class rule. They're set via theme.components.Button.vars in theme-bridge.ts instead;
    // see test/theme-bridge.test.ts for coverage of that resolver.
  });
  it('underlines inputs', () => {
    expect(css).toMatch(/\.sf-input\s*\{[^}]*border-bottom: 1px solid var\(--sf-line-strong\)[^}]*border-radius: 0/s);
    expect(css).toMatch(/textarea\.sf-input\s*\{[^}]*border: 1px solid var\(--sf-line-strong\)/s);
  });
});

describe('mantine.css reads the button/input tokens', () => {
  it('button voice comes from tokens whose modern values are the old literals', () => {
    expect(css).toMatch(/\.sf-button\s*\{[^}]*font-family: var\(--sf-btn-font\)[^}]*text-transform: var\(--sf-btn-transform\)[^}]*font-weight: var\(--sf-btn-weight\)[^}]*letter-spacing: var\(--sf-btn-tracking-md\)/s);
    const v = tokenVariables(BASE_TOKENS);
    expect(v['--sf-btn-font']).toBe('var(--sf-font-mono)');
    expect(v['--sf-btn-tracking-md']).toBe('0.2em');
  });
  it('has a box input variant behind the root attribute', () => {
    expect(css).toMatch(/:root\[data-sf-input="box"\] \.sf-input\s*\{/);
  });
});

describe('cards', () => {
  it.each([
    ['../src/features/order-status/OrderStatus.module.css'],
    ['../src/features/tracking/Tracking.module.css'],
  ])('%s uses the hairline + 40%% surface recipe with no shadow', (file) => {
    const block = read(file).match(/\.card\s*\{[^}]*\}/s)?.[0] ?? '';
    expect(block).toContain('background: color-mix(in srgb, var(--sf-surface) 40%, transparent)');
    expect(block).toMatch(/box-shadow: var\(--sf-card-shadow\)/);
    expect(block).toContain('border-radius: var(--sf-card-radius)');
  });
  it('checkout fields are underlined', () => {
    const block = read('../src/features/checkout/Fields.module.css').match(/\.input\s*\{[^}]*\}/s)?.[0] ?? '';
    expect(block).toContain('border-bottom: 1px solid var(--sf-line-strong)');
    expect(block).toContain('background: transparent');
  });
});
