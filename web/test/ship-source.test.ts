import { describe, expect, it } from 'vitest';
import { shipSource } from '@/features/checkout/ship-source.ts';
import type { Warehouse } from '@/types/warehouses.ts';

const SHOP = { shipping: { countries: ['GB', 'IE'], collectionCountries: ['GB'] } };
const MAIN: Warehouse = { id: 1, name: 'Main', country: null, isDefault: true, shipping: { countries: ['GB', 'IE'], collectionCountries: ['GB'] } };
const NORTH: Warehouse = { id: 2, name: 'North warehouse', country: null, isDefault: false, shipping: { countries: ['FR'], collectionCountries: [] } };
const OLD: Warehouse = { id: 3, name: 'Old backend', country: null, isDefault: false };

describe('shipSource', () => {
  it('is the settings lists while the warehouse feature is off, even with a warehouse that carries its own', () => {
    expect(shipSource(SHOP, NORTH, false)).toBe(SHOP.shipping);
  });
  it('is the settings lists with no warehouse selected', () => {
    expect(shipSource(SHOP, null, true)).toBe(SHOP.shipping);
  });
  it('is the settings lists when the selected warehouse carries no shipping field (older backend)', () => {
    expect(shipSource(SHOP, OLD, true)).toBe(SHOP.shipping);
  });
  it('is the selected warehouse\'s own lists when it carries them', () => {
    expect(shipSource(SHOP, NORTH, true)).toEqual({ countries: ['FR'], collectionCountries: [] });
  });
  it('is the settings lists at the default warehouse', () => {
    expect(shipSource(SHOP, MAIN, true)).toBe(SHOP.shipping);
  });
  it('passes an absent settings.shipping through when nothing applies', () => {
    expect(shipSource({}, null, true)).toBeUndefined();
  });
});
