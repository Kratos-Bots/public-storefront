import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CodeStep } from '@/features/auth/CodeStep.tsx';
import type { CodeLogin } from '@/features/auth/useCodeLogin.ts';
import type { CodeAttempt } from '@/features/auth/code-attempt.ts';

const NOW = Date.parse('2026-10-03T10:00:00Z');
const ATTEMPT = (o: Partial<CodeAttempt> = {}): CodeAttempt => ({ attemptId: 'att-1', kind: 'phone', channel: 'whatsapp', maskedTo: '+44 •••• 0123', resendAt: NOW + 60_000, ...o });
const form = (o: Partial<CodeLogin> = {}): CodeLogin => ({
  view: 'code', go: vi.fn(), attempt: ATTEMPT(), email: '', failure: null, sent: false, pending: false, verifyAttempts: 0,
  sendPhone: vi.fn(), submitEmail: vi.fn(), emailMeCode: vi.fn(), passwordSignIn: vi.fn(), sendReset: vi.fn(),
  resend: vi.fn(), switchChannel: vi.fn(), sendNewCode: vi.fn(), verify: vi.fn(), ...o,
});
const box = () => screen.getByRole('textbox', { name: '6-digit code' }) as HTMLInputElement;
const WRONG = { kind: 'incorrect', message: 'That code isn’t right. 3 tries left.', attemptsRemaining: 3 } as const;

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('what the screen says', () => {
  it('names where the code went and how', () => {
    render(<CodeStep form={form()} />);
    expect(screen.getByRole('heading', { name: 'Enter your code' })).toBeTruthy();
    expect(screen.getByText('Enter the 6-digit code we sent to +44 •••• 0123 by WhatsApp.')).toBeTruthy();
    cleanup();
    render(<CodeStep form={form({ attempt: ATTEMPT({ channel: 'sms' }) })} />);
    expect(screen.getByText(/by text message\.$/)).toBeTruthy();
    cleanup();
    render(<CodeStep form={form({ attempt: ATTEMPT({ kind: 'email', channel: 'email', maskedTo: 'a***@example.com' }) })} />);
    expect(screen.getByText('Enter the 6-digit code we sent to a***@example.com by email.')).toBeTruthy();
  });

  it('renders nothing without an attempt', () => {
    const { container } = render(<CodeStep form={form({ attempt: null })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('entering the code', () => {
  it('submits automatically at the sixth digit, once', () => {
    const verify = vi.fn();
    render(<CodeStep form={form({ verify })} />);
    fireEvent.change(box(), { target: { value: '12345' } });
    expect(verify).not.toHaveBeenCalled();
    fireEvent.change(box(), { target: { value: '123456' } });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith('123456');
  });

  it('a wrong code clears the box, keeps focus there and reads "N tries left"', () => {
    const view = render(<CodeStep form={form()} />);
    fireEvent.change(box(), { target: { value: '000000' } });
    view.rerender(<CodeStep form={form({ failure: WRONG, verifyAttempts: 1 })} />);
    expect(box().value).toBe('');
    expect(document.activeElement).toBe(box());
    expect(screen.getByRole('alert')).toHaveTextContent('That code isn’t right. 3 tries left.');
    expect(box()).toHaveAttribute('aria-invalid', 'true');
  });

  it('ties the error to the box', () => {
    render(<CodeStep form={form({ failure: WRONG, verifyAttempts: 1 })} />);
    const id = box().getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id as string)).toBe(screen.getByRole('alert'));
    cleanup();
    render(<CodeStep form={form()} />);
    expect(box()).not.toHaveAttribute('aria-describedby');
  });

  it('the same wrong code can be typed again and is sent again', () => {
    const verify = vi.fn();
    const view = render(<CodeStep form={form({ verify })} />);
    fireEvent.change(box(), { target: { value: '000000' } });
    view.rerender(<CodeStep form={form({ verify, failure: WRONG, verifyAttempts: 1 })} />);
    fireEvent.change(box(), { target: { value: '000000' } });
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it('a request that failed or was dropped clears the box too, with no wrong-code message', () => {
    const view = render(<CodeStep form={form()} />);
    fireEvent.change(box(), { target: { value: '123456' } });
    view.rerender(<CodeStep form={form({ failure: { kind: 'other', message: 'Something went wrong.' }, verifyAttempts: 1 })} />);
    expect(box().value).toBe('');
    expect(box()).not.toHaveAttribute('aria-invalid');
  });

  it('after a failed verify the cursor returns once the request is over, not while the box is locked', () => {
    const view = render(<CodeStep form={form({ pending: true })} />);
    view.rerender(<CodeStep form={form({ pending: true, failure: WRONG, verifyAttempts: 1 })} />);
    expect(document.activeElement).not.toBe(box());
    view.rerender(<CodeStep form={form({ pending: false, failure: WRONG, verifyAttempts: 1 })} />);
    expect(document.activeElement).toBe(box());
  });

  it('is disabled while a request is in the air', () => {
    render(<CodeStep form={form({ pending: true })} />);
    expect(box()).toBeDisabled();
  });
});

describe('resend', () => {
  it('is greyed out with a countdown, then live', () => {
    const resend = vi.fn();
    render(<CodeStep form={form({ resend })} />);
    const wait = screen.getByRole('button', { name: 'Resend code in 1:00' });
    expect(wait).toBeDisabled();
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(screen.getByRole('button', { name: 'Resend code in 0:30' })).toBeDisabled();
    act(() => { vi.advanceTimersByTime(30_000); });
    const live = screen.getByRole('button', { name: 'Resend code' });
    expect(live).toBeEnabled();
    fireEvent.click(live);
    expect(resend).toHaveBeenCalledTimes(1);
  });

  it('a phone can switch channel at once (no countdown), an email cannot', () => {
    const switchChannel = vi.fn();
    render(<CodeStep form={form({ switchChannel })} />);
    const sms = screen.getByRole('button', { name: 'Didn’t get it? Send by text message instead' });
    expect(sms).toBeEnabled();
    fireEvent.click(sms);
    expect(switchChannel).toHaveBeenCalledTimes(1);
    cleanup();
    render(<CodeStep form={form({ attempt: ATTEMPT({ channel: 'sms' }) })} />);
    expect(screen.getByRole('button', { name: 'Didn’t get it? Send by WhatsApp instead' })).toBeTruthy();
    cleanup();
    render(<CodeStep form={form({ attempt: ATTEMPT({ kind: 'email', channel: 'email' }) })} />);
    expect(screen.queryByRole('button', { name: /Send by/ })).toBeNull();
  });

  it('says a new code was sent', () => {
    render(<CodeStep form={form({ sent: true })} />);
    expect(screen.getByRole('status')).toHaveTextContent('We sent a new code.');
  });
});

describe('going back and expiry', () => {
  it('"Use a different number" and "Use a different email" go back to their own step', () => {
    const go = vi.fn();
    render(<CodeStep form={form({ go })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use a different number' }));
    expect(go).toHaveBeenLastCalledWith('phone');
    cleanup();
    render(<CodeStep form={form({ go, attempt: ATTEMPT({ kind: 'email', channel: 'email' }) })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(go).toHaveBeenLastCalledWith('email');
  });

  it('an expired code says so and offers a new one in place of the box', () => {
    const sendNewCode = vi.fn();
    render(<CodeStep form={form({ sendNewCode, failure: { kind: 'expired', message: 'That code has expired. We can send a new one' } })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('That code has expired. We can send a new one');
    expect(box()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
    expect(sendNewCode).toHaveBeenCalledTimes(1);
  });

  it('an expired code drops the resend links, so only "Send a new code" is left, and lands the cursor on it', () => {
    const view = render(<CodeStep form={form()} />);
    expect(screen.getByRole('button', { name: /Resend code/ })).toBeTruthy();
    view.rerender(<CodeStep form={form({ failure: { kind: 'expired', message: 'That code has expired. We can send a new one' } })} />);
    expect(screen.queryByRole('button', { name: /Resend code/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Send by/ })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Send a new code' }));
  });

  it('too many tries says so and offers a new code, but leaves the box usable', () => {
    const sendNewCode = vi.fn();
    render(<CodeStep form={form({ sendNewCode, failure: { kind: 'tooMany', message: 'Too many tries. Please wait a few minutes' } })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Too many tries. Please wait a few minutes');
    expect(box()).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
    expect(sendNewCode).toHaveBeenCalledTimes(1);
  });

  it('after a rate-limited resend the code the shopper holds can still be typed and is verified', () => {
    const verify = vi.fn();
    render(<CodeStep form={form({ verify, failure: { kind: 'tooMany', message: 'Too many tries. Please wait a few minutes' } })} />);
    fireEvent.change(box(), { target: { value: '123456' } });
    expect(verify).toHaveBeenCalledWith('123456');
  });
});
