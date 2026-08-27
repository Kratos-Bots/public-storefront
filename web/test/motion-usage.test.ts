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
const src = (p: string) => readFileSync(path.resolve(testDir, `../src/${p}`), 'utf8');

describe('motion is applied', () => {
  it.each([
    'features/catalog/ProductRow.tsx', 'features/cart/CartLine.tsx', 'features/account/OrdersPage.tsx',
    'features/catalog/Upsells.tsx', 'features/tracking/ParcelTimeline.tsx', 'features/checkout/QuoteSummary.tsx',
    'features/wholesale/WholesaleRow.tsx',
  ])('%s animates its rows', (file) => expect(src(file)).toContain('rowAnim('));

  it('tracking parcel cards stagger', () => expect(src('features/tracking/ParcelCard.tsx')).toContain('staggerAnim('));

  it.each([
    'features/order-status/StatusHero.tsx', 'features/order-status/ItemsCard.tsx', 'features/order-status/AddressCard.tsx',
    'features/order-status/ShipmentCard.tsx', 'features/order-status/CryptoPaymentCard.tsx', 'features/order-status/PaymentSection.tsx',
    'features/catalog/ProductList.tsx', 'features/catalog/ProductGrid.tsx', 'features/catalog/ProductDetailPage.tsx',
    'features/catalog/ProductDetailSheet.tsx', 'features/checkout/CheckoutPage.tsx', 'features/tracking/OrderHero.tsx',
    'features/tracking/LookupForm.tsx', 'features/verify/VerifyPage.tsx', 'features/payment-redirect/PaymentSuccessPage.tsx',
    'features/payment-redirect/PaymentCancelPage.tsx', 'features/payment-redirect/OrderPlacedPage.tsx',
    'features/account/AccountLayout.tsx', 'features/auth/AuthCard.tsx', 'components/EmptyState.tsx',
  ])('%s fades in', (file) => expect(src(file)).toMatch(/\bFADE\b/));

  it('the current route node pings', () => {
    expect(src('features/order-status/StatusHero.tsx')).toContain('className="ping"');
    expect(src('features/order-status/OrderStatus.module.css')).toMatch(/\.node\s*\{[^}]*position: relative/s);
  });
});
