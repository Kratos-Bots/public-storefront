import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { CountrySelect } from '@/features/checkout/CountrySelect.tsx';

afterEach(cleanup);

const mount = (allowed?: readonly string[], value = '') => render(
  <MantineProvider env="test">
    <CountrySelect value={value} onChange={() => {}} allowed={allowed} />
  </MantineProvider>,
);
const optionValues = () =>
  Array.from((screen.getByLabelText('Country') as HTMLSelectElement).options).map((o) => o.value).filter(Boolean);

describe('CountrySelect', () => {
  it('lists only the allowed countries, sorted by name', () => {
    mount(['IE', 'GB', 'FR']);
    expect(optionValues()).toEqual(['FR', 'IE', 'GB']); // France, Ireland, United Kingdom
  });
  it('lists every country when the allowed list is missing or empty', () => {
    mount(undefined);
    const all = optionValues().length;
    expect(all).toBeGreaterThan(100);
    cleanup();
    mount([]);
    expect(optionValues().length).toBe(all);
  });
  it('names an allowed country even when it has no dial-code entry', () => {
    mount(['GB', 'AQ']);
    expect(optionValues()).toContain('AQ');
  });
});
