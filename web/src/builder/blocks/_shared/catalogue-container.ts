import { part, type ContainerSpec } from '@/builder/parts.ts';

const PARTS = ['CatalogIntro', 'CatalogSearch', 'CatalogCategories', 'CatalogTitle', 'CatalogResults', 'CatalogEmpty'] as const;
const REQUIRED = ['CatalogTitle', 'CatalogResults', 'CatalogEmpty'] as const;

/** Spec §5.2. CatalogEmpty and CatalogResults never render together: the order reproduces v0.7.0's one conditional. */
export const GRID_CONTAINER: ContainerSpec = {
  family: 'catalogue', required: REQUIRED, unique: PARTS, insertSlot: 'main',
  // The rail is a grid track whose child the grid CSS positions (sticky, align-self: start).
  slotAccepts: { rail: ['CatalogCategories'] },
  defaultSlots: (_props, { id }) => ({
    top: [part('CatalogIntro', id), part('CatalogSearch', id)],
    rail: [part('CatalogCategories', id)],
    main: [part('CatalogTitle', id), part('CatalogEmpty', id), part('CatalogResults', id)],
  }),
};

export const LIST_CONTAINER: ContainerSpec = {
  family: 'catalogue', required: REQUIRED, unique: PARTS, insertSlot: 'content',
  defaultSlots: (_props, { id }) => ({
    content: [part('CatalogTitle', id), part('CatalogIntro', id), part('CatalogEmpty', id), part('CatalogResults', id)],
  }),
};
