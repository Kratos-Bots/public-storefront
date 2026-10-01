import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TextLayerProvider } from '@/text/runtime.tsx';
import { referralShareText } from '@/features/account/referral-share.ts';

afterEach(cleanup);
describe('account wording follows published text', () => {
  it('referralShareText resolves at call time', () => {
    expect(referralShareText('K4M2', 'Northbound Supply')).toBe('Shopping with Northbound Supply? Use my referral code K4M2 on your first order.');
    render(<TextLayerProvider text={{ locale: 'en', formatLocale: '', shared: { 'account.referrals.shareText': 'Try {shop} with code {code}' }, layout: {} }}><span /></TextLayerProvider>);
    expect(referralShareText('K4M2', 'Northbound Supply')).toBe('Try Northbound Supply with code K4M2');
  });
});
