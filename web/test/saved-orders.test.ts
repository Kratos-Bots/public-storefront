import { beforeEach, describe, expect, it } from 'vitest';
import { listSavedOrders, saveOrder, findSavedOrder } from '@/stores/saved-orders.ts';

describe('saved orders', () => {
  beforeEach(() => localStorage.clear());

  it('lists saved orders newest first', () => {
    saveOrder('REF1', 'key1');
    saveOrder('REF2', 'key2');
    expect(listSavedOrders().map((o) => o.reference)).toEqual(['REF2', 'REF1']);
  });

  it('findSavedOrder finds by reference', () => {
    saveOrder('REF1', 'key1');
    expect(findSavedOrder('REF1')).toMatchObject({ reference: 'REF1', accessKey: 'key1' });
    expect(findSavedOrder('NOPE')).toBeNull();
  });

  it('saving the same reference again dedupes and moves it to the front', () => {
    saveOrder('REF1', 'key1');
    saveOrder('REF2', 'key2');
    saveOrder('REF1', 'key1-updated');
    const list = listSavedOrders();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ reference: 'REF1', accessKey: 'key1-updated' });
  });

  it('returns [] when storage holds corrupt JSON', () => {
    localStorage.setItem('sf-orders-v1', '{not json');
    expect(listSavedOrders()).toEqual([]);
  });
});
