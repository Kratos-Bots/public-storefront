import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ApiError } from '@/lib/errors.ts';
import { CodeStep } from '@/features/auth/CodeStep.tsx';
import { codeFailure, codeFailureKind } from '@/features/auth/code-errors.ts';
import type { CodeLogin } from '@/features/auth/useCodeLogin.ts';
import type { CodeAttempt } from '@/features/auth/code-attempt.ts';

const NOW = Date.parse('2026-10-03T10:00:00Z');
const ATTEMPT = (o: Partial<CodeAttempt> = {}): CodeAttempt => ({ attemptId: 'att-1', kind: 'phone', channel: 'whatsapp', maskedTo: '+44 •••• 0123', resendAt: NOW - 1000, ...o });
const form = (o: Partial<CodeLogin> = {}): CodeLogin => ({
  view: 'code', go: vi.fn(), attempt: ATTEMPT(), email: '', failure: null, sent: false, pending: false, verifyAttempts: 0,
  sendPhone: vi.fn(), submitEmail: vi.fn(), emailMeCode: vi.fn(), passwordSignIn: vi.fn(), sendReset: vi.fn(),
  resend: vi.fn(), switchChannel: vi.fn(), sendNewCode: vi.fn(), verify: vi.fn(), ...o,
});
const box = () => screen.getByRole('textbox', { name: '6-digit code' }) as HTMLInputElement;
const TRIES_USED = { kind: 'triesUsed', message: 'That code has been tried too many times. We can send you a new one.' } as const;
const WAIT = { kind: 'tooMany', message: 'Too many tries. Please wait a few minutes' } as const;

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('a used-up attempt is not the same as "wait"', () => {
  it('CODE_TOO_MANY_TRIES is its own kind; CODE_RATE_LIMITED and a bare 429 stay "wait"', () => {
    expect(codeFailureKind(new ApiError(400, 'CODE_TOO_MANY_TRIES'))).toBe('triesUsed');
    expect(codeFailureKind(new ApiError(429, 'CODE_RATE_LIMITED'))).toBe('tooMany');
    expect(codeFailureKind(new ApiError(429, 'Too many requests'))).toBe('tooMany');
    expect(codeFailure(new ApiError(400, 'CODE_TOO_MANY_TRIES'))).toEqual(TRIES_USED);
    expect(codeFailure(new ApiError(429, 'CODE_RATE_LIMITED'))).toEqual(WAIT);
  });

  it('locks the box, hides Resend and the channel switch, and lands on "Send a new code"', () => {
    const sendNewCode = vi.fn();
    const view = render(<CodeStep form={form({ sendNewCode })} />);
    expect(screen.getByRole('button', { name: /Resend code/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Send by/ })).toBeTruthy();
    view.rerender(<CodeStep form={form({ sendNewCode, failure: TRIES_USED })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('That code has been tried too many times. We can send you a new one.');
    expect(box()).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Resend code/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Send by/ })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Send a new code' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
    expect(sendNewCode).toHaveBeenCalledTimes(1);
  });

  it('a rate limit keeps the box unlocked and the resend links', () => {
    render(<CodeStep form={form({ failure: WAIT })} />);
    expect(box()).toBeEnabled();
    expect(screen.getByRole('button', { name: /Resend code/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeTruthy();
  });
});

describe('after a failed send, resend or switch, focus goes back to the control that was used', () => {
  const failed = { kind: 'channelUnavailable', message: 'We can’t send the code that way to this number' } as const;

  it.each([
    ['Resend code', /Resend code/],
    ['the channel switch', /Send by/],
  ])('%s', (_name, label) => {
    const view = render(<CodeStep form={form()} />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    view.rerender(<CodeStep form={form({ pending: true })} />);
    (document.activeElement as HTMLElement | null)?.blur();
    view.rerender(<CodeStep form={form({ pending: false, failure: failed })} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: label }));
  });

  it('a failed "Send a new code" keeps focus on that button', () => {
    const view = render(<CodeStep form={form({ failure: TRIES_USED })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
    view.rerender(<CodeStep form={form({ pending: true, failure: null })} />);
    (document.activeElement as HTMLElement | null)?.blur();
    view.rerender(<CodeStep form={form({ failure: { ...TRIES_USED } })} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Send a new code' }));
  });
});
