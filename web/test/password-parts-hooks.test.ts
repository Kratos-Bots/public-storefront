/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(path.resolve(testDir, `../src/${p}`), 'utf8');

const VISUAL = [
  'features/auth/PasswordLogin', 'features/auth/ResetPasswordPage', 'features/auth/VerifyEmailPage', 'features/account/PasswordSection',
] as const;

describe('password sign-in surfaces carry the template hooks', () => {
  it.each(VISUAL)('%s tags its primary actions as shared filled buttons', (file) => {
    const code = src(`${file}.tsx`);
    expect(code).toContain('data-sf-part="button"');
    expect(code).toContain('data-variant="filled"');
  });

  // PasswordLogin is the body of the sign-in AuthCard, which carries the fade itself.
  it.each(VISUAL.filter((f) => f !== 'features/auth/PasswordLogin'))('%s fades in', (file) => expect(src(`${file}.tsx`)).toMatch(/\bFADE\b/));

  it.each(VISUAL)('%s.module.css uses tokens only: no hex or rgb colour literal', (file) => {
    const css = src(`${file}.module.css`).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
  });

  it.each(['features/auth/ResetPasswordPage', 'features/auth/VerifyEmailPage', 'features/account/PasswordSection'])(
    '%s.module.css reads the block text variables',
    (file) => {
      const css = src(`${file}.module.css`);
      expect(css).toContain('var(--sf-block-fg,');
      expect(css).toContain('var(--sf-text-scale, 1)');
    },
  );
});
