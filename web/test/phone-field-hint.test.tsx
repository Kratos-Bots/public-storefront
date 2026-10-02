import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { PhoneField } from '@/features/checkout/PhoneField.tsx';

afterEach(cleanup);

const mount = (hideHint?: boolean) => render(
  <MantineProvider env="test">
    <PhoneField prefix="GB" phone="" optional={false} hideHint={hideHint} onPrefixChange={() => {}} onPhoneChange={() => {}} />
  </MantineProvider>,
);

describe('PhoneField delivery hint', () => {
  it('shows the checkout hint by default (checkout is unchanged)', () => {
    mount();
    expect(screen.getByText('Couriers may use this for delivery.')).toBeTruthy();
  });

  it('hideHint removes it', () => {
    mount(true);
    expect(screen.queryByText('Couriers may use this for delivery.')).toBeNull();
  });
});
