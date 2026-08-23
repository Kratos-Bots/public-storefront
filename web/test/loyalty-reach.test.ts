import { describe, expect, it } from 'vitest';
import { reachRatio } from '@/features/account/LoyaltyPage.tsx';

describe('reachRatio', () => {
  it('is the share of the cost the balance covers', () => {
    expect(reachRatio(250, 1000)).toBe(0.25);
  });

  it('fills once the balance covers the cost, and never overfills', () => {
    expect(reachRatio(1000, 1000)).toBe(1);
    expect(reachRatio(4000, 1000)).toBe(1);
  });

  it('is empty at nothing saved, and never negative', () => {
    expect(reachRatio(0, 500)).toBe(0);
    expect(reachRatio(-10, 500)).toBe(0);
  });

  it('reads a free option as reached rather than dividing by zero', () => {
    expect(reachRatio(0, 0)).toBe(1);
  });
});
