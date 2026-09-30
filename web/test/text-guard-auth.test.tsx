import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { describeAreaGuard } from './helpers/text-area-guard.ts';
import { TextLayerProvider } from '@/text/runtime.tsx';
import { defaultPrimaryAction } from '@/features/webapp/default-action.ts';

describeAreaGuard('auth + webapp + notices', ['features/auth/', 'features/webapp/', 'features/notices/', 'app/telegram-session.ts'], {
  allow: [{ file: 'features/auth/useLoginSuccess.ts', text: 'red', reason: 'Mantine colour name of the toast, not shopper text' }],
});

afterEach(cleanup);
const base = { pathname: '/', count: 2, subtotalLabel: '£24.00', checkoutTo: '/checkout', ordering: true, blocked: false };
describe('Telegram MainButton labels follow published text', () => {
  it('default-action resolves at call time', () => {
    expect(defaultPrimaryAction(base)?.label).toBe('View cart · £24.00');
    render(<TextLayerProvider text={{ locale: 'en', formatLocale: '', shared: { 'webapp.action.viewCart': 'Basket ({subtotal})' }, layout: {} }}><span /></TextLayerProvider>);
    expect(defaultPrimaryAction(base)?.label).toBe('Basket (£24.00)');
  });
});
