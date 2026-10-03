import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { phoneCountryGroups, preferredPhoneCountries } from '@/features/auth/phone-countries.ts';
import { PhoneEntry } from '@/features/auth/PhoneEntry.tsx';
import { prefixOptions } from '@/features/checkout/PhoneField.tsx';

afterEach(cleanup);

describe('phoneCountryGroups', () => {
  it('lists the preferred countries first, alphabetically, and every other country after', () => {
    const { suggested, rest } = phoneCountryGroups(['gb', 'FR']);
    expect(suggested.map((o) => o.iso)).toEqual(['FR', 'GB']);
    expect(rest.some((o) => o.iso === 'GB' || o.iso === 'FR')).toBe(false);
    expect(suggested.length + rest.length).toBe(prefixOptions().length);
  });
  it('ignores codes it does not know, and with none left puts every country in one list', () => {
    const { suggested, rest } = phoneCountryGroups(['ZZ', '']);
    expect(suggested).toEqual([]);
    expect(rest).toHaveLength(prefixOptions().length);
  });
});

describe('preferredPhoneCountries', () => {
  const base = { contactModes: { phoneMode: 'optional', emailMode: 'required', defaultPhoneCountry: 'GB' } };
  it('is the default phone country when the backend list is empty or missing', () => {
    expect(preferredPhoneCountries({ ...base, login: {} } as never)).toEqual(['GB']);
  });
  it('puts the backend list first when it sends one', () => {
    expect(preferredPhoneCountries({ ...base, login: { phone: { available: true, mode: 'verify', channels: [], countries: ['FR', 'DE'] } } } as never)).toEqual(['FR', 'DE', 'GB']);
  });
  it('is empty when there is neither', () => {
    expect(preferredPhoneCountries({ contactModes: { defaultPhoneCountry: null }, login: {} } as never)).toEqual([]);
  });
});

describe('PhoneEntry', () => {
  const props = { prefix: '', phone: '', preferred: ['GB'], onPrefixChange: vi.fn(), onPhoneChange: vi.fn() };

  it('shows a suggested group, then all countries, and a labelled number field', () => {
    render(<PhoneEntry {...props} />);
    const select = screen.getByLabelText('Country') as HTMLSelectElement;
    const groups = Array.from(select.querySelectorAll('optgroup')).map((g) => g.label);
    expect(groups).toEqual(['Suggested', 'All countries']);
    expect(within(select.querySelector('optgroup')!).getByRole('option', { name: 'United Kingdom (+44)' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Phone number' })).toHaveAttribute('type', 'tel');
  });

  it('has no groups when nothing is preferred', () => {
    render(<PhoneEntry {...props} preferred={[]} />);
    expect((screen.getByLabelText('Country') as HTMLSelectElement).querySelectorAll('optgroup')).toHaveLength(0);
  });

  it('reports the picked country and the typed number, and shows field errors', () => {
    const onPrefixChange = vi.fn();
    const onPhoneChange = vi.fn();
    render(<PhoneEntry {...props} onPrefixChange={onPrefixChange} onPhoneChange={onPhoneChange} countryError="Choose your country" phoneError="Enter your phone number with its country code" />);
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'GB' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Phone number' }), { target: { value: '07700 900123' } });
    expect(onPrefixChange).toHaveBeenCalledWith('GB');
    expect(onPhoneChange).toHaveBeenCalledWith('07700 900123');
    expect(screen.getByText('Choose your country')).toBeTruthy();
    expect(screen.getByText('Enter your phone number with its country code')).toBeTruthy();
  });
});
