import { describe, expect, it } from 'vitest';
import { shipSource } from '@/features/checkout/ship-source.ts';
import type { Warehouse } from '@/types/warehouses.ts';

const SHOP = { shipping: { countries: ['GB', 'IE'], collectionCountries: ['GB'] } };
const MAIN: Warehouse = { id: 1, name: 'Main', country: null, isDefault: true, shipping: { countries: ['GB', 'IE'], collectionCountries: ['GB'] } };
const NORTH: Warehouse = { id: 2, name: 'North warehouse', country: null, isDefault: false, shipping: { countries: ['FR'], collectionCountries: [] } };
const OLD: Warehouse = { id: 3, name: 'Old backend', country: null, isDefault: false };
const NOWHERE: Warehouse = { id: 4, name: 'Nowhere warehouse', country: null, isDefault: false, shipping: { countries: [], collectionCountries: [] } };

describe('shipSource', () => {
  it('is the settings lists while the warehouse feature is off, even with a warehouse that carries its own', () => {
    expect(shipSource(SHOP, NORTH, false)).toEqual({ lists: SHOP.shipping, none: false });
    expect(shipSource(SHOP, NOWHERE, false)).toEqual({ lists: SHOP.shipping, none: false });
  });
  it('is the settings lists with no warehouse selected', () => {
    expect(shipSource(SHOP, null, true)).toEqual({ lists: SHOP.shipping, none: false });
  });
  it('is the settings lists when the selected warehouse carries no shipping field (older backend): unknown, not none', () => {
    expect(shipSource(SHOP, OLD, true)).toEqual({ lists: SHOP.shipping, none: false });
    expect(shipSource({ shipping: { countries: [] } }, OLD, true)).toEqual({ lists: { countries: [] }, none: false });
  });
  it('is the selected warehouse\'s own lists when it carries them', () => {
    expect(shipSource(SHOP, NORTH, true)).toEqual({ lists: { countries: ['FR'], collectionCountries: [] }, none: false });
  });
  it('is the shop lists at the default warehouse, which repeats them', () => {
    expect(shipSource(SHOP, MAIN, true)).toEqual({ lists: SHOP.shipping, none: false });
  });
  it('is the shop lists at the default warehouse even when its own list is empty', () => {
    const emptyMain: Warehouse = { ...MAIN, shipping: { countries: [], collectionCountries: [] } };
    expect(shipSource({ shipping: { countries: [] } }, emptyMain, true)).toEqual({ lists: { countries: [] }, none: false });
  });
  it('passes an absent settings.shipping through when nothing applies', () => {
    expect(shipSource({}, null, true)).toEqual({ lists: undefined, none: false });
  });
  it('is none for a selected non-default warehouse whose shipping is present with no countries', () => {
    expect(shipSource(SHOP, NOWHERE, true)).toEqual({ lists: { countries: [], collectionCountries: [] }, none: true });
  });
  it('is none when the warehouse\'s countries are all unusable codes', () => {
    const junk: Warehouse = { ...NOWHERE, shipping: { countries: ['', 'xxx'], collectionCountries: [] } };
    expect(shipSource(SHOP, junk, true).none).toBe(true);
  });
});
