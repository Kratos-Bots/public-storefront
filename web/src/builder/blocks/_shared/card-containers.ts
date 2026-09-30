import { group, part, type ContainerSpec } from '@/builder/parts.ts';

/** Spec §5.3: tile `content` [Image, Group(body)[Name, Flags, Group(foot)[Price, Add]]]. */
export const TILE_CONTAINER: ContainerSpec = {
  family: 'card-tile', insertSlot: 'content',
  required: ['CardTileName'],
  unique: ['CardTileImage', 'CardTileName', 'CardTileFlags', 'CardTilePrice', 'CardTileAdd'],
  requires: [['CardTileAdd', 'CardTilePrice']],
  defaultSlots: (_props, { id }) => ({
    content: [part('CardTileImage', id), group('CardTileGroup', id, 'body', [
      part('CardTileName', id), part('CardTileFlags', id), group('CardTileGroup', id, 'foot', [part('CardTilePrice', id), part('CardTileAdd', id)]),
    ])],
  }),
};

/** Row `content` [Group(text)[Name, Meta], Price, Add]. */
export const ROW_CONTAINER: ContainerSpec = {
  family: 'card-row', insertSlot: 'content',
  required: ['CardRowName'],
  unique: ['CardRowName', 'CardRowMeta', 'CardRowPrice', 'CardRowAdd'],
  requires: [['CardRowAdd', 'CardRowPrice']],
  defaultSlots: (_props, { id }) => ({
    content: [group('CardRowGroup', id, 'text', [part('CardRowName', id), part('CardRowMeta', id)]), part('CardRowPrice', id), part('CardRowAdd', id)],
  }),
};
