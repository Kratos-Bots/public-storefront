import { useUiStore } from '@/stores/ui.ts';
import { Sheet } from '@/components/Sheet.tsx';
import { CategoryIndex } from '@/features/catalog/CategoryNav.tsx';
import { CloseIcon } from '@/components/icons.tsx';
import type { CategoryNode } from '@/features/catalog/category-tree.ts';
import classes from '@/features/catalog/FilterSheet.module.css';

export interface FilterSheetProps {
  tree: CategoryNode[];
  /** Every product in the catalogue — the count beside "All products". */
  total: number;
  activeId: number | null;
}

/**
 * The menu layout's category index, in the same sheet the product opens in. The
 * compact bar has no room for chips, so this is the only way through the tree —
 * which is why the reset row and the counts both have to be here.
 */
export function FilterSheet({ tree, total, activeId }: FilterSheetProps) {
  const opened = useUiStore((s) => s.filterOpen);
  const close = useUiStore((s) => s.close);
  const dismiss = () => close('filterOpen');

  return (
    <Sheet
      opened={opened}
      onClose={dismiss}
      label="Categories"
      header={
        <div className={classes.head}>
          <div>
            <h2 className={classes.title}>Categories</h2>
            <p className={classes.sub}>Jump to a section of the list</p>
          </div>
          <button type="button" className={classes.close} onClick={dismiss} aria-label="Close">
            <CloseIcon size={16} />
          </button>
        </div>
      }
    >
      <nav className={classes.index} aria-label="Categories">
        <CategoryIndex tree={tree} total={total} activeId={activeId} onNavigate={dismiss} />
      </nav>
    </Sheet>
  );
}
