import { expect, test } from '@playwright/test';
import { externalRequestPolicy, installMocks } from './mocks.ts';

const CSS = 'https://fonts.googleapis.com/css2?family=Tektur:wght@400;700&display=swap';
const WOFF = 'https://fonts.gstatic.com/s/tektur/v1/x.woff2';

test.describe('external request policy (E2E_REAL_FONTS)', () => {
  test('default: every external request is aborted, fonts included', () => {
    expect(externalRequestPolicy(CSS, {})).toBe('abort');
    expect(externalRequestPolicy(WOFF, {})).toBe('abort');
    expect(externalRequestPolicy('https://example.com/x.js', {})).toBe('abort');
  });

  test('E2E_REAL_FONTS=1: only the two Google Fonts hosts pass', () => {
    const env = { E2E_REAL_FONTS: '1' };
    expect(externalRequestPolicy(CSS, env)).toBe('continue');
    expect(externalRequestPolicy(WOFF, env)).toBe('continue');
    expect(externalRequestPolicy('https://example.com/x.js', env)).toBe('abort');
    expect(externalRequestPolicy('https://fonts.googleapis.com.evil.example/x.css', env)).toBe('abort');
    expect(externalRequestPolicy('http://fonts.googleapis.com/css2', env)).toBe('abort'); // https only
  });

  test('any other value of the flag keeps fonts blocked', () => {
    expect(externalRequestPolicy(CSS, { E2E_REAL_FONTS: 'true' })).toBe('abort');
    expect(externalRequestPolicy(CSS, { E2E_REAL_FONTS: '0' })).toBe('abort');
  });

  test('default wiring: a page fetch to Google Fonts fails (no network used)', async ({ page }) => {
    test.skip(process.env.E2E_REAL_FONTS === '1', 'checks the default (blocked) wiring only');
    await installMocks(page, { layout: 'storefront' });
    await page.goto('/');
    const failed = await page.evaluate(async (url) => {
      try { await fetch(url, { mode: 'no-cors' }); return false; } catch { return true; }
    }, CSS);
    expect(failed).toBe(true);
  });
});
