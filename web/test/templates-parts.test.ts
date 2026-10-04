/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tokenVariables } from '@/templates/tokens.ts';
import { BASE_TOKENS } from '@/templates/define.ts';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(path.resolve(testDir, p), 'utf8');

describe('global.css boot defaults', () => {
  it('declares every modern token on :root so the skeleton paints like modern', () => {
    const globalCss = read('../src/styles/global.css');
    for (const [k, v] of Object.entries(tokenVariables(BASE_TOKENS))) expect(globalCss, k).toContain(`${k}:${v};`);
  });
});

describe('chassis', () => {
  it('drops the gradients only under data-sf-chassis="flat"', () => {
    expect(read('../src/styles/chassis.css')).toMatch(/:root:not\(\[data-sf-chassis="flat"\]\) body\s*\{[^}]*radial-gradient/s);
  });
  it('turns frosted chrome solid under data-sf-glass="off"', () => {
    const css = read('../src/styles/chassis.css');
    expect(css).toMatch(/:root\[data-sf-glass="off"\] \.glass,\s*:root\[data-sf-glass="off"\] \.glass-soft\s*\{[^}]*background: var\(--sf-bg\);[^}]*backdrop-filter: none;/s);
    expect(css).toMatch(/:root\[data-sf-glass="off"\] \.mantine-Overlay-root\s*\{[^}]*backdrop-filter: none;/s);
    // the modern (glass on) rules are untouched
    expect(css).toMatch(/\.glass\s*\{[^}]*backdrop-filter: blur\(12px\)/s);
  });
});

describe('shared button fills', () => {
  const css = read('../src/styles/mantine.css');
  const FILLED = '[data-sf-part="button"][data-variant="filled"]';
  const block = (sel: string) => {
    const i = css.indexOf(`${sel} {`);
    return i < 0 ? null : css.slice(i, css.indexOf('}', i));
  };
  it('outline-glow repaints every filled button, custom ones included', () => {
    const b = block(`:root[data-sf-btn-fill="outline-glow"] ${FILLED}`);
    expect(b).not.toBeNull();
    expect(b).toContain('background: var(--sf-bg);');
    expect(b).toContain('color: var(--sf-primary);');
    expect(b).toContain('border: 1px solid var(--sf-primary);');
  });
  it('ghost repaints every filled button', () => {
    const b = block(`:root[data-sf-btn-fill="ghost"] ${FILLED}`);
    expect(b).toContain('background: transparent;');
    expect(b).toContain('color: var(--sf-primary);');
    expect(b).toContain('border: 1px solid var(--sf-line-strong);');
  });
  it('has hover and disabled states, and no rule for solid (modern stays pixel-identical)', () => {
    expect(css).toMatch(/:root\[data-sf-btn-fill="outline-glow"\] \[data-sf-part="button"\]\[data-variant="filled"\]:hover:not\(:disabled\):not\(\[data-disabled\]\)/);
    expect(css).toMatch(/:root\[data-sf-btn-fill="ghost"\] \[data-sf-part="button"\]\[data-variant="filled"\]:is\(:disabled, \[data-disabled\]\)/);
    expect(css).not.toContain('data-sf-btn-fill="solid"');
  });
});

describe('parts', () => {
  it.each([
    ['../src/layouts/StorefrontShell.tsx', ['data-sf-part="main"']],
    ['../src/layouts/MenuShell.tsx', ['data-sf-part="main"']],
    ['../src/layouts/Chromeless.tsx', ['data-sf-part="header"', 'data-sf-part="main"']],
    ['../src/layouts/header-parts.tsx', ['data-sf-part="header"', 'data-sf-part="badge"']],
    ['../src/features/catalog/ProductCard.tsx', ['data-sf-part="product-card"', 'data-sf-part="price"']],
    ['../src/features/catalog/ProductRow.tsx', ['data-sf-part="product-row"', 'data-sf-part="price"']],
    ['../src/features/catalog/ProductDetailPage.tsx', ['data-sf-part="page-title"', 'data-sf-part="price"']],
    ['../src/features/catalog/ProductDetailSheet.tsx', ['data-sf-part="price"', 'data-sf-part="sheet-title"']],
    ['../src/features/catalog/ProductGrid.tsx', ['data-sf-part="page-title"']],
    ['../src/features/catalog/ProductList.tsx', ['data-sf-part="page-title"', 'data-sf-part="group-title"']],
    ['../src/features/wholesale/WholesaleCatalogPage.tsx', ['data-sf-part="page-title"']],
    ['../src/features/catalog/AddToCart.tsx', ['data-sf-part="button"', 'data-variant="filled"']],
    ['../src/features/cart/cart-summary-parts.tsx', ['data-sf-part="button"', 'data-sf-cta="main"']],
    ['../src/features/cart/MobileCartBar.tsx', ['data-sf-part="cart-bar"', 'data-sf-part="button"', 'data-sf-cta="main"']],
    ['../src/features/checkout/CheckoutPage.tsx', ['data-sf-cta="main"', 'data-sf-part="button"', 'data-variant="filled"', 'data-variant="default"']],
    ['../src/features/checkout/checkout-parts.tsx', ['data-sf-part="stepper"']],
    ['../src/features/checkout/Field.tsx', ['data-sf-part="input"']],
    ['../src/features/catalog/StockChip.tsx', ['data-sf-part="badge"']],
    ['../src/features/account/StatusPill.tsx', ['data-sf-part="badge"']],
    ['../src/components/Sheet.tsx', ['data-sf-part={part}', "part = 'sheet'"]],
    ['../src/features/cart/CartDrawerPanel.tsx', ['part="drawer"']],
    ['../src/features/notices/NoticeBanners.tsx', ['data-sf-part="notice"']],
    ['../src/features/notices/CutoffBar.tsx', ['data-sf-part="cutoff"']],
    ['../src/features/tracking/ProgressStepper.tsx', ['data-sf-part="stepper"']],
    ['../src/features/account/LoyaltyPage.tsx', ['data-sf-part="button"', 'data-variant="filled"']],
    ['../src/features/account/OrderDetailPage.tsx', ['data-sf-part="button"', 'data-variant="filled"']],
    ['../src/features/auth/WhatsappLogin.tsx', ['data-sf-part="button"', 'data-variant="filled"']],
    ['../src/features/order-status/MethodPicker.tsx', ['data-sf-part="button"', 'data-variant="filled"']],
    ['../src/features/order-status/PaymentSection.tsx', ['data-sf-part="button"', 'data-variant="filled"']],
    ['../src/features/tracking/LookupForm.tsx', ['data-sf-part="button"', 'data-variant="filled"']],
    ['../src/features/verify/VerifyPage.tsx', ['data-sf-part="button"', 'data-variant="filled"']],
    ['../src/features/payment-redirect/payment-parts.tsx', ['data-sf-part="button"', 'data-variant="filled"']],
    ['../src/features/wholesale/WholesaleBar.tsx', ['data-sf-part="button"', 'data-variant="filled"']],
  ])('%s carries its parts', (file, parts) => {
    const src = read(file);
    for (const part of parts) expect(src, part).toContain(part);
  });

  const count = (src: string, needle: string) => src.split(needle).length - 1;

  it.each<[string, number]>([
    ['../src/features/order-status/AddressCard.tsx', 1],
    ['../src/features/order-status/CryptoPaymentCard.tsx', 1],
    ['../src/features/order-status/ItemsCard.tsx', 1],
    ['../src/features/order-status/PaymentSection.tsx', 4],
    ['../src/features/order-status/ShipmentCard.tsx', 1],
    ['../src/features/tracking/ParcelCard.tsx', 1],
    ['../src/features/checkout/CheckoutPage.tsx', 1],
  ])('%s tags exactly its %i card root(s) — ten in all', (file, n) => {
    expect(count(read(file), 'data-sf-part="card"')).toBe(n);
  });

  it('tags every checkout text field (input, select, textarea)', () => {
    expect(count(read('../src/features/checkout/Field.tsx'), 'data-sf-part="input"')).toBe(3);
  });

  it('tags both checkout nav buttons and both main-CTA branches', () => {
    const src = read('../src/features/checkout/CheckoutPage.tsx');
    expect(count(src, 'data-sf-cta="main"')).toBe(2);          // Place order + Continue
    expect(count(src, 'data-sf-part="button"')).toBe(3);        // .back + the two .next buttons
  });

  it.each<[string, number]>([
    ['../src/features/account/LoyaltyPage.tsx', 1],
    ['../src/features/account/OrderDetailPage.tsx', 1],
    ['../src/features/auth/WhatsappLogin.tsx', 3],
    ['../src/features/order-status/MethodPicker.tsx', 1],
    ['../src/features/order-status/PaymentSection.tsx', 1],
    ['../src/features/tracking/LookupForm.tsx', 1],
    ['../src/features/verify/VerifyPage.tsx', 1],
    ['../src/features/payment-redirect/payment-parts.tsx', 5],
    ['../src/features/wholesale/WholesaleBar.tsx', 1],
  ])('%s tags exactly its %i primary-CTA button(s) as shared filled buttons', (file, n) => {
    const src = read(file);
    expect(count(src, 'data-sf-part="button"')).toBe(n);
    expect(count(src, 'data-variant="filled"')).toBe(n);
  });
});

describe('custom button radius', () => {
  const block = (css: string, sel: string) => css.match(new RegExp(`\\${sel}\\s*\\{[^}]*\\}`, 's'))?.[0] ?? '';
  it.each([
    ['../src/features/catalog/AddToCart.module.css', '.button'],
    ['../src/features/cart/CartSummary.module.css', '.checkout'],
    ['../src/features/cart/MobileCartBar.module.css', '.checkout'],
    ['../src/features/checkout/CheckoutPage.module.css', '.next'],
    ['../src/features/checkout/CheckoutPage.module.css', '.back'],
    ['../src/features/account/Account.module.css', '.cta'],
    ['../src/features/auth/AuthButtons.module.css', '.primary'],
    ['../src/features/order-status/OrderStatus.module.css', '.cta'],
    ['../src/features/tracking/Tracking.module.css', '.submit'],
    ['../src/features/verify/VerifyPage.module.css', '.submit'],
    ['../src/features/payment-redirect/PaymentRedirect.module.css', '.cta'],
    ['../src/features/wholesale/WholesaleBar.module.css', '.cta'],
  ])('%s %s follows the button radius token, not the card one', (file, sel) => {
    const b = block(read(file), sel);
    expect(b).toContain('border-radius: var(--sf-btn-radius)');
    expect(b).not.toContain('--sf-card-radius');
  });
});

describe('box mode preserves invalid state and select caret spacing', () => {
  it('restores the select caret gutter in box mode (Fields.module.css)', () => {
    const css = read('../src/features/checkout/Fields.module.css');
    expect(css).toMatch(/:global\(:root\[data-sf-input="box"\]\) \.select\s*\{[^}]*padding-right: 2rem;/s);
  });
  it('keeps the invalid border colour in box mode (Fields.module.css)', () => {
    const css = read('../src/features/checkout/Fields.module.css');
    expect(css).toMatch(/:global\(:root\[data-sf-input="box"\]\) \.input\[aria-invalid='true'\]\s*\{[^}]*border-color: var\(--sf-danger\);/s);
  });
  it('keeps the invalid border colour in box mode (mantine.css)', () => {
    const css = read('../src/styles/mantine.css');
    expect(css).toMatch(/:root\[data-sf-input="box"\] \.sf-input\[data-error\]\s*\{[^}]*border-color: var\(--sf-danger\);/s);
  });
});
