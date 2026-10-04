import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { PhoneField, prefixOptions } from '@/features/checkout/PhoneField.tsx';

afterEach(cleanup);

const mount = (over: Partial<Parameters<typeof PhoneField>[0]> = {}) => {
  const props = { prefix: 'GB', phone: '', optional: false, onPrefixChange: vi.fn(), onPhoneChange: vi.fn(), ...over };
  render(<MantineProvider env="test"><PhoneField {...props} /></MantineProvider>);
  return props;
};
const picker = () => screen.getByLabelText('Phone country code') as HTMLSelectElement;

describe('PhoneField', () => {
  it('shows only the prefix when closed', () => {
    mount();
    expect(screen.getByText('+44')).toBeTruthy();
    expect(screen.queryByText('United Kingdom +44')).toBeNull();
  });

  it('shows the placeholder wording when no prefix is chosen', () => {
    mount({ prefix: '' });
    expect(screen.getByText('Code', { selector: '[data-phone-code]' })).toBeTruthy();
  });

  it('options read prefix then country', () => {
    mount();
    const gb = Array.from(picker().options).find((o) => o.value === 'GB');
    expect(gb?.textContent).toBe('+44\u00a0\u00a0United Kingdom');
  });

  it('is one field: one visible label, and the number input is named Phone', () => {
    mount();
    expect(document.querySelectorAll('label')).toHaveLength(1);
    expect(screen.getByLabelText('Phone').getAttribute('type')).toBe('tel');
  });

  it('with suggestions, groups them first and lists each country once', () => {
    mount({ suggested: ['IE', 'GB'] });
    const groups = picker().querySelectorAll('optgroup');
    expect(groups).toHaveLength(2);
    expect(Array.from(groups[0]!.querySelectorAll('option')).map((o) => o.value)).toEqual(['IE', 'GB']);
    expect(Array.from(groups[1]!.querySelectorAll('option')).some((o) => o.value === 'GB')).toBe(false);
  });

  it('renders no empty second group when the suggestions cover every country', () => {
    mount({ suggested: prefixOptions().map((o) => o.iso) });
    expect(picker().querySelectorAll('optgroup')).toHaveLength(1);
  });

  it('without suggestions the list is flat', () => {
    mount();
    expect(picker().querySelectorAll('optgroup')).toHaveLength(0);
  });

  it('reports prefix and number changes', () => {
    const props = mount();
    fireEvent.change(picker(), { target: { value: 'FR' } });
    expect(props.onPrefixChange).toHaveBeenCalledWith('FR');
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '07801 123456' } });
    expect(props.onPhoneChange).toHaveBeenCalledWith('07801 123456');
  });

  it('shows the error in place of the hint and marks the input invalid', () => {
    mount({ error: 'Required' });
    expect(screen.getByText('Required')).toBeTruthy();
    expect(screen.queryByText('Couriers may use this for delivery.')).toBeNull();
    expect(screen.getByLabelText('Phone').getAttribute('aria-invalid')).toBe('true');
  });
});
