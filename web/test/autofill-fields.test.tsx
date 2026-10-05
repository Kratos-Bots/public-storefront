import { StrictMode, useRef, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { ContactStep } from '@/features/checkout/steps/ContactStep.tsx';
import { AddressStep } from '@/features/checkout/steps/AddressStep.tsx';
import { DEFAULT_FORM, type CheckoutForm } from '@/features/checkout/form-state.ts';
import { useAutofillAdvance } from '@/lib/use-autofill-advance.ts';

afterEach(cleanup);

const modes = { emailMode: 'required', phoneMode: 'required', defaultPhoneCountry: 'GB' } as const;

function Harness({ children }: { children: (form: CheckoutForm, patch: (p: Partial<CheckoutForm>) => void) => React.ReactNode }) {
  const [form, setForm] = useState<CheckoutForm>({ ...DEFAULT_FORM, country: 'GB' });
  const ref = useRef<HTMLDivElement>(null);
  useAutofillAdvance(ref);
  return <div ref={ref}>{children(form, (p) => setForm((f) => ({ ...f, ...p })))}</div>;
}

const mount = (ui: Parameters<typeof Harness>[0]['children']) =>
  render(
    <MantineProvider env="test">
      <StrictMode><MemoryRouter><Harness>{ui}</Harness></MemoryRouter></StrictMode>
    </MantineProvider>,
  );

/** What a browser does when it fills a field: sets the value natively, then fires input. */
function systemFill(label: string, value: string) {
  const el = screen.getByLabelText(label) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('checkout autofill hints', () => {
  it('every contact and address control names itself with a standard token', () => {
    mount((form, patch) => (
      <>
        <ContactStep form={form} patch={patch} errors={{}} contactModes={{ ...modes }} guest countries={['GB']} />
        <AddressStep form={form} patch={patch} errors={{}} countries={['GB']} />
      </>
    ));
    const pairs = Array.from(document.querySelectorAll('input:not([type=radio]), select, textarea')).map((el) => [
      el.getAttribute('aria-label'),
      el.getAttribute('name'),
      el.getAttribute('autocomplete'),
    ]);
    expect(pairs).toEqual([
      ['First name', 'given-name', 'given-name'],
      ['Surname', 'family-name', 'family-name'],
      ['Email', 'email', 'email'],
      ['Phone country code', 'tel-country', 'off'],
      ['Phone', 'tel', 'tel'],
      ['Country', 'country', 'country'],
      ['Address line 1', 'address-line1', 'address-line1'],
      ['Address line 2', 'address-line2', 'address-line2'],
      ['Address line 3', 'address-line3', 'address-line3'],
      ['Town / City', 'address-level2', 'address-level2'],
      ['County', 'address-level1', 'address-level1'],
      ['Postcode', 'postal-code', 'postal-code'],
    ]);
  });

  it('marks an optional field so the next-field hop skips it', () => {
    mount((form, patch) => <AddressStep form={form} patch={patch} errors={{}} countries={['GB']} />);
    expect(screen.getByLabelText('Address line 2').getAttribute('data-optional')).toBe('true');
    expect(screen.getByLabelText('Address line 1').getAttribute('data-optional')).toBeNull();
  });

  it('a system fill reaches the form state and focus moves to the next empty required field', async () => {
    mount((form, patch) => <ContactStep form={form} patch={patch} errors={{}} contactModes={{ ...modes }} guest countries={['GB']} />);
    const first = screen.getByLabelText('First name') as HTMLInputElement;
    first.focus();
    act(() => {
      systemFill('First name', 'Ada');
      systemFill('Surname', 'Lovelace');
      systemFill('Email', 'ada@example.com');
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
    expect((screen.getByLabelText('Surname') as HTMLInputElement).value).toBe('Lovelace');
    expect(document.activeElement).toBe(screen.getByLabelText('Phone'));
  });
});
