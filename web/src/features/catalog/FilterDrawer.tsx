import { Drawer } from '@mantine/core';
import { useUiStore } from '@/stores/ui.ts';
import { CategoryIndex } from '@/features/catalog/CategoryNav.tsx';
import type { CategoryNode } from '@/features/catalog/category-tree.ts';
import classes from '@/features/catalog/FilterDrawer.module.css';

export interface FilterDrawerProps {
  tree: CategoryNode[];
  total: number;
  activeId: number | null;
}

/**
 * The full category index as a bottom sheet — the storefront layout's. The chip row
 * on a phone only carries the top level, so this is where sub-categories are
 * reachable; it renders the same `CategoryIndex` as the desktop rail, so the two
 * read as one index in two places.
 */
export function FilterDrawer({ tree, total, activeId }: FilterDrawerProps) {
  const opened = useUiStore((s) => s.filterOpen);
  const close = useUiStore((s) => s.close);
  const dismiss = () => close('filterOpen');

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
      <nav aria-label="Categories">
        <CategoryIndex tree={tree} total={total} activeId={activeId} onNavigate={dismiss} />
      </nav>
    </Drawer>
  );
}
