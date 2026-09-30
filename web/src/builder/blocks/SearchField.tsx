import { useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { SearchField } from '@/layouts/SearchField.tsx';
import { useShellSearch } from '@/layouts/shell-context.ts';
import { BOX, styleSupport, VIS } from '@/builder/style/model.ts';
import type { StyleAttrs } from '@/builder/define.ts';
import classes from '@/builder/blocks/SearchField.module.css';

function SearchFieldView({ placeholder, styleAttrs }: { placeholder: string; styleAttrs?: StyleAttrs }) {
  // The same state the list blocks filter on (outlet context, else the shell provider).
  const { search, setSearch } = useShellSearch();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onCatalog = pathname === '/' || pathname.startsWith('/c/');
  return (
    <div className={classes.root} data-sf-block="SearchField" {...styleAttrs}>
      <SearchField
        className={classes.field}
        value={search}
        placeholder={placeholder.trim() || undefined}
        onChange={(value) => {
          setSearch(value);
          // The shell keeps the query across the navigation, so the catalogue opens filtered.
          if (!onCatalog) navigate('/');
        }}
      />
    </div>
  );
}

export const block = defineBlock<{ id: string; placeholder: string }>({
  name: 'SearchField', label: 'Search field', category: 'catalogue', layouts: 'all', routeBound: false, slots: [],
  text: ['catalog.search.*'],
  style: styleSupport('root', [...BOX, ...VIS]),
  schema: z.object({ placeholder: z.string().max(60) }), defaultProps: { placeholder: '' },
  textProps: { placeholder: 'catalog.search.placeholder' },
  render: ({ placeholder, puck }) => <SearchFieldView placeholder={placeholder} styleAttrs={puck.style} />,
});
