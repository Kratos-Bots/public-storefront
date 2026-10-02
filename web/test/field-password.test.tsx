import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Field } from '@/features/checkout/Field.tsx';

afterEach(cleanup);

function Harness({ initial = '', autoComplete = 'current-password' }: { initial?: string; autoComplete?: string }) {
  const [value, setValue] = useState(initial);
  return <Field label="Password" type="password" autoComplete={autoComplete} value={value} onChange={setValue} />;
}

describe('Field type="password"', () => {
  it('renders a password input, labelled, with the autocomplete the caller asked for', () => {
    render(<Harness autoComplete="new-password" />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('new-password');
    expect(input.getAttribute('data-sf-part')).toBe('input');
    expect(input.getAttribute('autocapitalize')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
    expect(input.hasAttribute('maxlength')).toBe(false);
  });

  it('the toggle reveals and hides the SAME input, keeping its value and focus target', () => {
    render(<Harness initial="  p4ss w0rd  " />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    const show = screen.getByRole('button', { name: 'Show password' });
    expect(show.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(show);
    expect(screen.getByLabelText('Password')).toBe(input);
    expect(input.type).toBe('text');
    expect(input.value).toBe('  p4ss w0rd  ');
    const hide = screen.getByRole('button', { name: 'Hide password' });
    expect(hide.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(hide);
    expect(input.type).toBe('password');
  });

  it('the toggle is a plain type="button" with no template part hook and never submits the form', () => {
    const submit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(<form onSubmit={submit}><Harness /></form>);
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle.getAttribute('type')).toBe('button');
    expect(toggle.hasAttribute('data-sf-part')).toBe(false);
    expect(toggle.hasAttribute('data-variant')).toBe(false);
    fireEvent.click(toggle);
    expect(submit).not.toHaveBeenCalled();
  });

  it('the typed value reaches onChange untrimmed', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  spaced  ' } });
    expect(input.value).toBe('  spaced  ');
  });

  it('a text field has no toggle', () => {
    render(<Field label="Email" type="email" value="" onChange={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('an error replaces the hint and is wired with aria-describedby', () => {
    render(<Field label="Password" type="password" value="" onChange={() => {}} error="Use at least 8 characters" hint="Use at least 8 characters." />);
    const input = screen.getByLabelText('Password');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(input.getAttribute('aria-describedby')!)!.textContent).toBe('Use at least 8 characters');
  });
});
