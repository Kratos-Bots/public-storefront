import { useMemo, type ReactNode } from 'react';
import { CardDesignBoundary, CardDesignProvider } from '@/builder/card-design.tsx';
import { CardRowFamily, CardTileFamily, type CardData } from '@/builder/families.ts';
import { cardKey, type CardKind, type PageSet } from '@/builder/types.ts';
import { cardStates } from '@/builder/editor/card-states.ts';
import { prepareDoc } from '@/builder/editor/prepare.ts';
import { usePreviewProduct } from '@/builder/editor/preview-product.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { ProductCard, TILE_VIEWS } from '@/features/catalog/ProductCard.tsx';
import { ProductRow, ROW_VIEWS } from '@/features/catalog/ProductRow.tsx';
import gridClasses from '@/features/catalog/ProductGrid.module.css';
import listClasses from '@/features/catalog/ProductList.module.css';
import styles from '@/builder/editor/CardStage.module.css';

const noop = () => {};

// One number per draft object: the copies' design provider is keyed on it (see DraftCopies).
const ids = new WeakMap<object, number>();
let next = 0;
function draftId(doc: object | undefined): number {
  if (!doc) return -1;
  let id = ids.get(doc);
  if (id === undefined) { id = next; next += 1; ids.set(doc, id); }
  return id;
}

/**
 * The copies read the draft through their own design provider, remounted whenever the draft
 * object changes: a design that threw is dropped for the rest of a provider's life (spec §6.2),
 * which on the canvas would pin the copies to the built-in card after the designer fixed it.
 */
function DraftCopies({ kind, children }: { kind: CardKind; children: ReactNode }) {
  const draft = useEditorStore((s) => s.docs[cardKey(kind)]);
  const layout = useEditorStore((s) => s.layout);
  const cards = useMemo<PageSet['cards']>(() => (draft ? { [kind]: prepareDoc(draft) } : undefined), [draft, kind]);
  return (
    <CardDesignProvider key={draftId(draft)} cards={cards} layout={layout}>
      <CardDesignBoundary kind={kind}>{children}</CardDesignBoundary>
    </CardDesignProvider>
  );
}

/**
 * The card designer's canvas (spec §11): the one editable card for the preview product, then
 * compiled, inert copies for derived states, inside the real grid (tiles) or rows list (rows), so
 * the active template's grid rules apply. The copies are ProductCard / ProductRow, so they show the
 * draft design, and fall back to the built-in card exactly as the shop does.
 */
export function CardStage({ kind, children }: { kind: CardKind; children: ReactNode }) {
  const product = usePreviewProduct();
  const states = useMemo(() => cardStates(product), [product]);
  const data = useMemo<CardData>(() => ({ product, index: 0, eager: true, hasSiblingImages: true, onSelect: noop }), [product]);
  const caption = (
    <p className={styles.caption}>
      Edit the first {kind === 'tile' ? 'card' : 'row'}. The others show your design out of stock, on pre-order and without a photo.
    </p>
  );
  if (kind === 'tile') {
    return (
      <div className={styles.stage} data-sf-builder-cards="tile">
        <div className={gridClasses.grid} data-sf-part="product-grid">
          <CardTileFamily.Provider value={{ data, views: TILE_VIEWS }}>{children}</CardTileFamily.Provider>
          <DraftCopies kind="tile">
            {states.map((s, i) => (
              <div key={s.label} inert aria-label={s.label} className={styles.copy}>
                <ProductCard product={s.product} index={i + 1} hasSiblingImages />
              </div>
            ))}
          </DraftCopies>
        </div>
        {caption}
      </div>
    );
  }
  return (
    <div className={styles.stage} data-sf-builder-cards="row">
      <ul className={listClasses.rows}>
        <li><CardRowFamily.Provider value={{ data, views: ROW_VIEWS }}>{children}</CardRowFamily.Provider></li>
        <DraftCopies kind="row">
          {states.map((s) => (
            <li key={s.label} inert aria-label={s.label}><ProductRow product={s.product} onSelect={noop} /></li>
          ))}
        </DraftCopies>
      </ul>
      {caption}
    </div>
  );
}
