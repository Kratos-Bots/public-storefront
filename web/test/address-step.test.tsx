import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AddressStep } from '@/features/checkout/steps/AddressStep.tsx';
import type { CountryMode } from '@/features/checkout/collection-mode.ts';
import { DEFAULT_FORM, type CheckoutForm } from '@/features/checkout/form-state.ts';

afterEach(cleanup);

const mount = (form: Partial<CheckoutForm> = {}, patch = vi.fn(), mode?: CountryMode) => {
  render(
    <MantineProvider env="test">
      <AddressStep form={{ ...DEFAULT_FORM, ...form }} patch={patch} errors={{}} countries={['GB', 'IE', 'US', 'FR']} mode={mode} />
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

describe('AddressStep delivery method', () => {
  it('offers no switch for a home-only country', () => {
    mount({ country: 'GB' }, vi.fn(), 'home');
    expect(screen.queryByRole('radiogroup', { name: 'Deliver to' })).toBeNull();
    expect(screen.getByLabelText('Address line 1')).toBeTruthy();
  });

  it('offers the switch when the country allows both, and reports the choice', () => {
    const patch = mount({ country: 'GB' }, vi.fn(), 'choice');
    fireEvent.click(screen.getByRole('radio', { name: 'Collection point' }));
    expect(patch).toHaveBeenCalledWith({ deliveryMethod: 'collection' });
  });

  it('collection replaces the address fields with the point picker, keeping the country', () => {
    mount({ country: 'GB', deliveryMethod: 'collection' }, vi.fn(), 'choice');
    expect(screen.getByLabelText('Country')).toBeTruthy();
    expect(screen.queryByLabelText('Address line 1')).toBeNull();
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();
  });

  it('a collection-only country shows the picker with an explanation and no switch', () => {
    mount({ country: 'GB', deliveryMethod: 'collection' }, vi.fn(), 'collection');
    expect(screen.queryByRole('radiogroup', { name: 'Deliver to' })).toBeNull();
    expect(screen.getByText('Orders to United Kingdom are delivered to a collection point.')).toBeTruthy();
  });

  it('seeds the point search with the home postcode the first time', () => {
    const patch = mount({ country: 'GB', zip: 'LS1 6BY' }, vi.fn(), 'choice');
    fireEvent.click(screen.getByRole('radio', { name: 'Collection point' }));
    expect(patch).toHaveBeenCalledWith({ deliveryMethod: 'collection', pointPostcode: 'LS1 6BY' });
    cleanup();
    mount({ country: 'GB', zip: 'LS1 6BY', deliveryMethod: 'collection' }, vi.fn(), 'choice');
    expect((screen.getByLabelText('Postcode') as HTMLInputElement).value).toBe('LS1 6BY');
  });
});
