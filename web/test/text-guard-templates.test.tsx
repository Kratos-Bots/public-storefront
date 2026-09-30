import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { TEXT_ENTRIES } from '@/text/registry.ts';
import { readoutLines } from '@/templates/cyber-brutalism/slots/readout.ts';
import * as contract from '@/templates/contract.ts';

afterEach(cleanup);
describe('template copy', () => {
  it('the contract exports useText for external templates', () => {
    expect(typeof contract.useText).toBe('function');
  });
  it('keys are per template id (the default slots use templates.default.*)', () => {
    expect(TEXT_ENTRIES['templates.default.footer.support']?.en).toBe('Support');
    expect(TEXT_ENTRIES['templates.bento.footer.support']?.en).toBe('Support');
  });
  it("readout lines keep today's wording", () => {
    expect(readoutLines({ productCount: 12, cutoff: null, accepting: true })).toEqual(['ITEMS 12', 'ORDERING ONLINE']);
  });
});
