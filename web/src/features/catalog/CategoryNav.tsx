import { Link } from 'react-router';
import { useUiStore } from '@/stores/ui.ts';
import type { CategoryNode } from '@/features/catalog/category-tree.ts';
import classes from '@/features/catalog/CategoryNav.module.css';

/** `/c/<slug>`, falling back to the id when the client never set a slug. */
export function categoryPath(node: Pick<CategoryNode, 'id' | 'slug'>): string {
  return `/c/${node.slug ?? node.id}`;
}

/** True when any root has children — the point at which the chip row stops being the whole index. */
export function hasNesting(nodes: CategoryNode[]): boolean {
  return nodes.some((n) => n.children.length > 0);
}

/**
 * True when any category anywhere in the tree carries an emoji. Clients set them
 * on all, some, or none — and a "some" tree needs a glyph column on every row, or
 * the names step in and out and the index loses its straight left edge.
 */
export function treeHasEmoji(nodes: CategoryNode[]): boolean {
  return nodes.some((n) => !!n.emoji || treeHasEmoji(n.children));
}

export interface CategoryTreeProps {
  nodes: CategoryNode[];
  activeId: number | null;
  /** Called after a row is chosen, so the mobile sheet can close itself. */
  onNavigate?: () => void;
  depth?: number;
  /** Reserve the glyph column. Resolved from the whole tree at depth 0. */
  glyphs?: boolean;
}

/** The index: one row per category, count right-aligned, sub-categories indented. */
export function CategoryTree({ nodes, activeId, onNavigate, depth = 0, glyphs }: CategoryTreeProps) {
  const showGlyphs = glyphs ?? treeHasEmoji(nodes);

  return (
    <ul className={classes.list} data-depth={depth}>
      {nodes.map((node) => (
        <li key={node.id}>
          <Link
            to={categoryPath(node)}
            className={classes.row}
            aria-current={node.id === activeId ? 'page' : undefined}
            onClick={onNavigate}
          >
            <span className={classes.rowLabel}>
              {showGlyphs ? (
                <span className={classes.glyph} aria-hidden>
                  {node.emoji ?? ''}
                </span>
              ) : null}
              {node.name}
            </span>
            <span className={classes.count}>{node.productCount}</span>
          </Link>
          {node.children.length > 0 ? (
            <CategoryTree
              nodes={node.children}
              activeId={activeId}
              onNavigate={onNavigate}
              depth={depth + 1}
              glyphs={showGlyphs}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export interface CategoryIndexProps {
  tree: CategoryNode[];
  /** Every product in the catalogue — the count beside "All products". */
  total: number;
  activeId: number | null;
  /** Called after a row is chosen, so a sheet can close itself. */
  onNavigate?: () => void;
}

/**
 * The index itself — the "All products" reset above the tree. Rendered in three
 * places (the desktop rail, and both layouts' filter sheets), so the reset row and
 * the tree can never drift apart. Callers supply the surrounding `<nav>`.
 */
export function CategoryIndex({ tree, total, activeId, onNavigate }: CategoryIndexProps) {
  const glyphs = treeHasEmoji(tree);

  return (
    <>
      <Link
        to="/"
        className={`${classes.row} ${classes.reset}`}
        aria-current={activeId === null ? 'page' : undefined}
        onClick={onNavigate}
      >
        <span className={classes.rowLabel}>
          {glyphs ? <span className={classes.glyph} aria-hidden /> : null}
          All products
        </span>
        <span className={classes.count}>{total}</span>
      </Link>
      <CategoryTree nodes={tree} activeId={activeId} onNavigate={onNavigate} glyphs={glyphs} />
    </>
  );
}

export interface CategoryNavProps {
  tree: CategoryNode[];
  /** Every product in the catalogue — the count beside "All products". */
  total: number;
  activeId: number | null;
}

/**
 * Category navigation in its two shapes: a scrolling chip row on a phone (roots
 * only — the sheet holds the rest) and the full index as a left rail from 62em.
 * Both are always in the DOM; CSS decides which one the viewport gets.
 */
export function CategoryNav({ tree, total, activeId }: CategoryNavProps) {
  const openFilters = useUiStore((s) => s.open);
  if (tree.length === 0) return null;

  return (
    <>
      <nav className={classes.chips} aria-label="Categories">
        <div className={classes.chipRow}>
          <Link to="/" className={classes.chip} aria-current={activeId === null ? 'page' : undefined}>
            All
            <span className={classes.chipCount}>{total}</span>
          </Link>
          {tree.map((node) => (
            <Link
              key={node.id}
              to={categoryPath(node)}
              className={classes.chip}
              aria-current={node.id === activeId ? 'page' : undefined}
            >
              {node.emoji ? <span aria-hidden>{node.emoji}</span> : null}
              {node.name}
              <span className={classes.chipCount}>{node.productCount}</span>
            </Link>
          ))}
          {hasNesting(tree) ? (
            <button type="button" className={classes.more} onClick={() => openFilters('filterOpen')}>
              All categories
            </button>
          ) : null}
        </div>
      </nav>

      <nav className={classes.rail} aria-label="Categories">
        <h2 className={classes.railHead}>Categories</h2>
        <CategoryIndex tree={tree} total={total} activeId={activeId} />
      </nav>
    </>
  );
}
