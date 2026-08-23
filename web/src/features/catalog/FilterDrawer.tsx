import { Drawer } from '@mantine/core';
import { Link } from 'react-router';
import { useUiStore } from '@/stores/ui.ts';
import { CategoryTree, treeHasEmoji } from '@/features/catalog/CategoryNav.tsx';
import type { CategoryNode } from '@/features/catalog/category-tree.ts';
import classes from '@/features/catalog/FilterDrawer.module.css';

export interface FilterDrawerProps {
  tree: CategoryNode[];
  total: number;
  activeId: number | null;
}

/**
 * The full category index as a bottom sheet. The chip row on a phone only carries
 * the top level, so this is where sub-categories are reachable — same rows as the
 * desktop rail, so the two read as one index in two places.
 */
export function FilterDrawer({ tree, total, activeId }: FilterDrawerProps) {
  const opened = useUiStore((s) => s.filterOpen);
  const close = useUiStore((s) => s.close);
  const dismiss = () => close('filterOpen');
  const glyphs = treeHasEmoji(tree);

  return (
    <Drawer
      opened={opened}
      onClose={dismiss}
      position="bottom"
      size="auto"
      title="Categories"
      classNames={{
        content: classes.content,
        header: classes.header,
        title: classes.title,
        body: classes.body,
      }}
    >
      <Link
        to="/"
        className={classes.all}
        aria-current={activeId === null ? 'page' : undefined}
        onClick={dismiss}
      >
        <span className={classes.allLabel}>
          {glyphs ? <span className={classes.glyph} aria-hidden /> : null}
          All products
        </span>
        <span className={classes.count}>{total}</span>
      </Link>
      <CategoryTree nodes={tree} activeId={activeId} onNavigate={dismiss} glyphs={glyphs} />
    </Drawer>
  );
}
