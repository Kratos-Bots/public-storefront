import { block, doc, type DefaultEntry } from '@/builder/defaults/helpers.ts';

// Product-parts §6.1: the built-in card designs, as documents (the editor's starting point).
export const DEFAULTS: DefaultEntry[] = [
  { docKey: 'card:tile', layouts: 'all', doc: doc([block('CardTile')]) },
  { docKey: 'card:row', layouts: 'all', doc: doc([block('CardRow')]) },
];
