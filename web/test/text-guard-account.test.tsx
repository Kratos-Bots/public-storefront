import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { describeAreaGuard } from './helpers/text-area-guard.ts';
import { TextLayerProvider } from '@/text/runtime.tsx';
import { referralShareText } from '@/features/account/referral-share.ts';

describeAreaGuard('account', ['features/account/'], {
  allow: [{ file: 'features/account/LoyaltyPage.tsx', text: 'red', reason: 'Mantine notification colour name, not shopper text' }],
});

afterEach(cleanup);
describe('account wording follows published text', () => {
  it('referralShareText resolves at call time', () => {
    expect(referralShareText('K4M2', 'Northbound Supply')).toBe('Shopping with Northbound Supply? Use my referral code K4M2 on your first order.');
    render(<TextLayerProvider text={{ locale: 'en', formatLocale: '', shared: { 'account.referrals.shareText': 'Try {shop} with code {code}' }, layout: {} }}><span /></TextLayerProvider>);
    expect(referralShareText('K4M2', 'Northbound Supply')).toBe('Try Northbound Supply with code K4M2');
  });
});
