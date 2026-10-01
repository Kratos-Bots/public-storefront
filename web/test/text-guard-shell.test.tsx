import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TextLayerProvider, textSnapshot } from '@/text/runtime.tsx';
import { ApiError, errorMessage } from '@/lib/errors.ts';
import { checkValue } from '@/text/resolve.ts';
import { TEXT_ENTRIES } from '@/text/registry.ts';

afterEach(cleanup);
describe('system wording', () => {
  it('errorMessage fallbacks resolve at call time', () => {
    expect(errorMessage(new Error('x'))).toBe('Something went wrong');
    expect(errorMessage(new ApiError(429, 'x'))).toBe('Too many attempts — please wait a moment and try again');
    render(<TextLayerProvider text={{ locale: 'en', formatLocale: '', shared: { 'errors.generic': 'Oops' }, layout: {} }}><span /></TextLayerProvider>);
    expect(errorMessage(new Error('x'))).toBe('Oops');
    expect(errorMessage(new ApiError(400, 'Backend says no'))).toBe('Backend says no');
  });
  it('closed.* and boot.* are fixed and never take a stored value', () => {
    const fixed = Object.keys(TEXT_ENTRIES).filter((k) => k.startsWith('closed.') || k.startsWith('boot.'));
    expect(fixed.length).toBeGreaterThan(3);
    for (const k of fixed) {
      expect(TEXT_ENTRIES[k]!.fixed, k).toBe(true);
      expect(checkValue(k, 'x')).toMatchObject({ ok: false, rule: 'fixed' });
    }
    expect(textSnapshot()).toBeDefined();
  });
});
