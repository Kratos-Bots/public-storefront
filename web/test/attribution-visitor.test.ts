import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getVisitorId, resetVisitorIdForTests, VISITOR_KEY } from '@/features/attribution/visitor.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeEach(() => {
  localStorage.clear();
  resetVisitorIdForTests();
});
afterEach(() => vi.restoreAllMocks());

describe('getVisitorId', () => {
  it('creates a UUID once and keeps it', () => {
    const id = getVisitorId();
    expect(id).toMatch(UUID);
    expect(localStorage.getItem(VISITOR_KEY)).toBe(id);
    resetVisitorIdForTests();
    expect(getVisitorId()).toBe(id);
  });

  it('replaces a stored value that is not a UUID', () => {
    localStorage.setItem(VISITOR_KEY, 'tampered');
    expect(getVisitorId()).toMatch(UUID);
  });

  it('still works, stable for the page, when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const id = getVisitorId();
    expect(id).toMatch(UUID);
    expect(getVisitorId()).toBe(id);
  });
});
