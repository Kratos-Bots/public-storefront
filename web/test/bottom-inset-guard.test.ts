/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A bar fixed or sticky at the foot of a phone has to tell the document its height (--sf-bottom-inset on :root,
// read as html's scroll-padding-bottom), or a focused field is scrolled to under it.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(path.resolve(testDir, '../src', p), 'utf8').replace(/\r\n/g, '\n');

/** The declarations of the first rule whose selector contains `selector`. */
function block(css: string, selector: string): string {
  const at = css.indexOf(selector);
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
}

describe('bottom inset', () => {
  it.each(['layouts/StorefrontShell.module.css', 'layouts/MenuShell.module.css', 'layouts/WebAppShell.module.css'])(
    '%s publishes the inset when its bar shows, matching the padding it reserves',
    (file) => {
      const css = read(file);
      const inset = block(css, ':global(:root):has(.withBar)');
      expect(inset).toMatch(/--sf-bottom-inset:\s*calc\(76px\b/);
      expect(inset).toContain('safe-area-inset-bottom');
      expect(block(css, '\n.withBar {')).toMatch(/padding-bottom:\s*(calc\()?76px/);
    },
  );

  it('the Mini App shell keeps clear of the home indicator inside Telegram, whose buttons are outside the WebView', () => {
    expect(block(read('layouts/WebAppShell.module.css'), ':global(:root):has(.native)')).toMatch(/--sf-bottom-inset:\s*var\(--tg-safe-bottom/);
  });

  it("the checkout's sticky Continue band publishes its height on phones only", () => {
    const css = read('features/checkout/CheckoutPage.module.css');
    expect(css).toMatch(/@media \(max-width: 61\.99em\) \{\s*:global\(:root\):has\(\.nav\) \{\s*--sf-bottom-inset:/);
  });

  it('the document reserves the inset, and fields keep clear of the sticky header and the edge', () => {
    const css = read('styles/global.css');
    expect(css).toMatch(/html\s*\{\s*scroll-padding-bottom:\s*var\(--sf-bottom-inset,\s*0px\)/);
    expect(css).toMatch(/input, select, textarea\s*\{[^}]*scroll-margin-top:[^;}]*var\(--sf-bar-h[^;}]*var\(--sf-pin-h/);
    expect(css).toMatch(/input, select, textarea\s*\{[^}]*scroll-margin-bottom:/);
  });

  it('the checkout step card lands below the sticky header when focusCard scrolls it to the top', () => {
    expect(block(read('features/checkout/CheckoutPage.module.css'), '\n.card {')).toMatch(/scroll-margin-top:[^;]*var\(--sf-bar-h[^;]*var\(--sf-pin-h/);
  });

  it('the fixed bars the shells reserve room for are still fixed to the foot (the PrimaryActionBar composes the cart bar)', () => {
    const bar = block(read('features/cart/MobileCartBar.module.css'), '.bar {');
    expect(bar).toMatch(/position:\s*fixed/);
    expect(bar).toMatch(/bottom:\s*0/);
    expect(read('features/webapp/PrimaryActionBar.module.css')).toMatch(/composes:\s*bar from '\.\.\/cart\/MobileCartBar\.module\.css'/);
  });
});
