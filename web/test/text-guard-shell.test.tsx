import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { describeAreaGuard } from './helpers/text-area-guard.ts';
import { TextLayerProvider, textSnapshot } from '@/text/runtime.tsx';
import { ApiError, errorMessage } from '@/lib/errors.ts';
import { checkValue } from '@/text/resolve.ts';
import { TEXT_ENTRIES } from '@/text/registry.ts';

describeAreaGuard('shell + system', ['layouts/StorefrontShell.tsx', 'layouts/MenuShell.tsx', 'layouts/WebAppShell.tsx', 'layouts/ShellFooter.tsx', 'layouts/Chromeless.tsx', 'components/', 'features/NotFoundPage.tsx', 'features/closed/', 'app/App.tsx', 'lib/errors.ts', 'api/client.ts', 'builder/blocks/NavLinks.tsx', 'builder/blocks/Video.tsx'], {
  allow: [{ file: 'builder/blocks/NavLinks.tsx', text: 'shell.nav.ariaLabel', reason: 'a textProps entry naming the registry key, not text' }],
});

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
