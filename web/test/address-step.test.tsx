import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AddressStep } from '@/features/checkout/steps/AddressStep.tsx';
import { DEFAULT_FORM, type CheckoutForm } from '@/features/checkout/form-state.ts';

afterEach(cleanup);

const mount = (form: Partial<CheckoutForm> = {}, patch = vi.fn()) => {
  render(
    <MantineProvider env="test">
      <AddressStep form={{ ...DEFAULT_FORM, ...form }} patch={patch} errors={{}} countries={['GB', 'IE', 'US', 'FR']} />
    </MantineProvider>,
  );
  return patch;
};
/** Accessible names of the step's controls, in DOM order. */
const controlNames = () =>
  Array.from(document.querySelectorAll('select, input')).map((el) => el.getAttribute('aria-label'));

describe('AddressStep', () => {
  it('orders the fields country first, then lines 1 to 3, city, county, postcode', () => {
    mount({ country: 'GB' });
    expect(controlNames()).toEqual([
      'Country', 'Address line 1', 'Address line 2', 'Address line 3', 'Town / City', 'County', 'Postcode',
    ]);
  });

  it.each([
    ['GB', ['Town / City', 'County', 'Postcode']],
    ['IE', ['Town / City', 'County', 'Eircode']],
    ['US', ['City', 'State', 'ZIP code']],
    ['FR', ['City', 'State / Region', 'Postal code']],
    ['', ['City', 'State / Region', 'Postal code']],
  ])('country %s labels the last three fields %j', (country, labels) => {
    mount({ country });
    expect(controlNames().slice(4)).toEqual(labels);
  });

  it('address line 3 is optional and edits the form', () => {
    const patch = mount({ country: 'GB' });
    fireEvent.change(screen.getByLabelText('Address line 3'), { target: { value: 'Flat 2' } });
    expect(patch).toHaveBeenCalledWith({ addressLine3: 'Flat 2' });
    expect(screen.getByLabelText('Address line 3').getAttribute('autocomplete')).toBe('address-line3');
  });

  it('choosing a country still carries the phone prefix when the shopper has not set one', () => {
    const patch = mount({ country: '' });
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'IE' } });
    expect(patch).toHaveBeenCalledWith({ country: 'IE', phonePrefix: 'IE' });
  });
});
