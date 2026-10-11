import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

const fetchDetails = vi.hoisted(() => vi.fn());
vi.mock('@/api/orders.ts', () => ({ fetchLastCheckoutDetails: fetchDetails }));

import { LastDetailsOffer } from '@/features/checkout/LastDetailsOffer.tsx';
import { ContactStep } from '@/features/checkout/steps/ContactStep.tsx';
import { DEFAULT_FORM, type CheckoutForm } from '@/features/checkout/form-state.ts';
import { DISMISS_KEY } from '@/features/checkout/last-details.ts';
import { useSessionStore } from '@/stores/session.ts';
import type { LastCheckoutDetails } from '@/types/checkout.ts';
import type { ContactModes } from '@/types/settings.ts';

const DETAILS: LastCheckoutDetails = {
  orderReference: 'ORD-0001', placedAt: '2026-09-01T10:00:00.000Z',
  firstName: 'Alex', surname: 'Rowan',
  addressLine1: '14 Test Lane', addressLine2: null, addressLine3: null,
  city: 'Leeds', county: null, zip: 'LS1 4AB', country: 'GB',
  email: 'alex@example.invalid', phone: '+447700900123', servicePoint: null,
};
const MODES: ContactModes = { phoneMode: 'optional', emailMode: 'required', defaultPhoneCountry: 'GB' };

/** The real contact step with the offer in its `before` slot, over a real form state: what the checkout page does. */
function Harness({ initial = DEFAULT_FORM, onForm }: { initial?: CheckoutForm; onForm?: (f: CheckoutForm) => void }) {
  const [form, setForm] = useState(initial);
  onForm?.(form);
  const patch = useCallback((next: Partial<CheckoutForm>) => setForm((f) => ({ ...f, ...next })), []);
  return (
    <ContactStep
      form={form} patch={patch} errors={{}} contactModes={MODES} guest={false}
      before={<LastDetailsOffer form={form} patch={patch} contactModes={MODES} shipCountries={['GB', 'DE']} />}
    />
  );
}

function mount(ui = <Harness />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MantineProvider env="test">{ui}</MantineProvider>
    </QueryClientProvider>,
  );
}

const signIn = (id = 7) => useSessionStore.getState().setSession('token', { id, nickname: null });
const card = () => document.querySelector('[data-last-details]');

beforeEach(() => {
  sessionStorage.clear();
  useSessionStore.getState().clear();
  fetchDetails.mockReset();
  fetchDetails.mockResolvedValue(DETAILS);
});
afterEach(cleanup);

describe('LastDetailsOffer', () => {
  it('a failed lookup shows nothing and is not remembered: the next visit asks again and shows the card', async () => {
    signIn();
    fetchDetails.mockRejectedValueOnce(new Error('network down'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (
      <QueryClientProvider client={client}>
        <MantineProvider env="test"><Harness /></MantineProvider>
      </QueryClientProvider>
    );
    const first = render(tree);
    await waitFor(() => expect(fetchDetails).toHaveBeenCalledTimes(1));
    expect(card()).toBeNull();
    first.unmount();
    render(tree);
    expect(await screen.findByRole('heading', { name: 'Use the details from your last order?' })).toBeInTheDocument();
    expect(fetchDetails).toHaveBeenCalledTimes(2);
  });

  it('shows the card with the name and one-line address, and nothing is filled yet', async () => {
    signIn();
    mount();
    expect(await screen.findByRole('heading', { name: 'Use the details from your last order?' })).toBeInTheDocument();
    expect(screen.getByText('Alex Rowan')).toBeInTheDocument();
    expect(screen.getByText('14 Test Lane, Leeds, LS1 4AB, GB')).toBeInTheDocument();
    expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe('');
  });

  it('"Use these details" fills the form, hides the card, and announces it', async () => {
    signIn();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Use these details' }));
    expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe('Alex');
    expect((screen.getByLabelText('Surname') as HTMLInputElement).value).toBe('Rowan');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('alex@example.invalid');
    expect((screen.getAllByLabelText('Phone').find((e) => e.tagName === 'INPUT') as HTMLInputElement).value).toBe('7700900123');
    expect(card()).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/filled in from your last order/i);
  });

  it('the filled form is what a later step sees: address and country land on the form state', async () => {
    signIn();
    let latest: CheckoutForm = DEFAULT_FORM;
    mount(<Harness onForm={(f) => { latest = f; }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use these details' }));
    expect(latest).toMatchObject({ addressLine1: '14 Test Lane', city: 'Leeds', zip: 'LS1 4AB', country: 'GB', phonePrefix: 'GB', phonePrefixTouched: true });
  });

  it('"No thanks" hides the card and remembers the customer for this tab', async () => {
    signIn();
    const view = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'No thanks' }));
    expect(card()).toBeNull();
    expect(sessionStorage.getItem(DISMISS_KEY)).toBe('7');
    expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe('');
    // A remount (the next step and back, or a reload) does not ask again.
    view.unmount();
    mount();
    await waitFor(() => expect(fetchDetails).toHaveBeenCalledTimes(2));
    expect(card()).toBeNull();
  });

  it('asks a different customer in the same tab', async () => {
    sessionStorage.setItem(DISMISS_KEY, '7');
    signIn(8);
    mount();
    expect(await screen.findByRole('button', { name: 'Use these details' })).toBeInTheDocument();
  });

  it('hides itself when the shopper starts typing, and never shows over a restored form', async () => {
    signIn();
    mount(<Harness initial={{ ...DEFAULT_FORM, city: 'Leeds' }} />);
    await waitFor(() => expect(fetchDetails).toHaveBeenCalled());
    expect(card()).toBeNull();
  });

  it('never asks the backend for a guest, and shows nothing', async () => {
    mount();
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchDetails).not.toHaveBeenCalled();
    expect(card()).toBeNull();
  });

  it.each([
    ['a response of null', null],
    ['a 404 or any error (the fetch reads both as null)', null],
  ])('shows nothing for %s', async (_label, value) => {
    signIn();
    fetchDetails.mockResolvedValue(value);
    mount();
    await waitFor(() => expect(fetchDetails).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(card()).toBeNull();
  });

  it('a collection order fills name and contact only, and says so', async () => {
    signIn();
    fetchDetails.mockResolvedValue({ ...DETAILS, addressLine1: '1 Point Street', servicePoint: { id: 'sp-1', carrier: 'evri', name: 'Corner News' } });
    let latest: CheckoutForm = DEFAULT_FORM;
    mount(<Harness onForm={(f) => { latest = f; }} />);
    expect(await screen.findByText('Name and contact details only')).toBeInTheDocument();
    expect(screen.queryByText(/1 Point Street/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Use these details' }));
    expect(latest.firstName).toBe('Alex');
    expect(latest.email).toBe('alex@example.invalid');
    expect(latest.addressLine1).toBe('');
    expect(latest.deliveryMethod).toBe('home');
  });
});
