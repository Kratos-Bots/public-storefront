import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { CodeInput, digitsOf } from '@/features/auth/CodeInput.tsx';

afterEach(cleanup);

function Harness({ onComplete, disabled }: { onComplete: (c: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState('');
  return <CodeInput value={value} onChange={setValue} onComplete={onComplete} disabled={disabled} />;
}
const box = () => screen.getByRole('textbox', { name: '6-digit code' }) as HTMLInputElement;
const paste = (text: string) => fireEvent.paste(box(), { clipboardData: { getData: () => text } });

describe('digitsOf', () => {
  it('keeps the first six digits and nothing else', () => {
    expect(digitsOf('123 456')).toBe('123456');
    expect(digitsOf('12-34-56-78')).toBe('123456');
    expect(digitsOf('abc')).toBe('');
  });
});

describe('the one-time-code input', () => {
  it('is one numeric input the phone can autofill', () => {
    render(<Harness onComplete={vi.fn()} />);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(box()).toHaveAttribute('autocomplete', 'one-time-code');
    expect(box()).toHaveAttribute('inputmode', 'numeric');
    expect(box()).not.toHaveAttribute('maxlength');
  });

  it('submits once, at the sixth digit, and not before', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    fireEvent.change(box(), { target: { value: '12345' } });
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.change(box(), { target: { value: '123456' } });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('strips letters and spaces as they are typed', () => {
    render(<Harness onComplete={vi.fn()} />);
    fireEvent.change(box(), { target: { value: '1a2 b3' } });
    expect(box().value).toBe('123');
  });

  it('a seventh digit typed into a full box does not submit a second time', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    fireEvent.change(box(), { target: { value: '123456' } });
    fireEvent.change(box(), { target: { value: '1234567' } });
    expect(box().value).toBe('123456');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('an autofill of more digits than fit keeps the first six', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    fireEvent.change(box(), { target: { value: '12345678' } });
    expect(box().value).toBe('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('a paste in any shape fills the box and submits', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    paste('123 456');
    expect(box().value).toBe('123456');
    expect(onComplete).toHaveBeenLastCalledWith('123456');
    cleanup();
    const again = vi.fn();
    render(<Harness onComplete={again} />);
    paste('Your code is 482913.');
    expect(box().value).toBe('482913');
    expect(again).toHaveBeenCalledWith('482913');
  });

  it('a paste replaces a half-typed code instead of being glued onto it', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    fireEvent.change(box(), { target: { value: '12' } });
    paste('987654');
    expect(box().value).toBe('987654');
    expect(onComplete).toHaveBeenCalledWith('987654');
  });

  it('a paste with no digits is left to the browser and submits nothing', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    fireEvent.change(box(), { target: { value: '12' } });
    // fireEvent returns false when a handler called preventDefault.
    const event = createEvent.paste(box(), { clipboardData: { getData: () => 'hello' } });
    const notPrevented = fireEvent(box(), event);
    expect(notPrevented).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(box().value).toBe('12');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('a paste with digits is taken over from the browser', () => {
    render(<Harness onComplete={vi.fn()} />);
    const event = createEvent.paste(box(), { clipboardData: { getData: () => '123456' } });
    fireEvent(box(), event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('can be disabled', () => {
    render(<Harness onComplete={vi.fn()} disabled />);
    expect(box()).toBeDisabled();
  });
});
