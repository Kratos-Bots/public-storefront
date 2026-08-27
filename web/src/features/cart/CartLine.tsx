import { useEffect, useState } from 'react';
import { useSettings } from '@/app/settings.ts';
import { formatMoney } from '@/lib/format.ts';
import { ProductImage } from '@/features/catalog/ProductImage.tsx';
import { MinusIcon, PlusIcon } from '@/components/icons.tsx';
import { rowAnim } from '@/lib/motion.ts';
import type { LocalLine } from '@/stores/cart.ts';
import type { ServerCartLine } from '@/types/cart.ts';
import classes from '@/features/cart/CartLine.module.css';

export interface CartLineProps {
  line: LocalLine;
  /** The server's word on this line — flags a repriced, sold-out or withdrawn product. */
  issue?: ServerCartLine;
  onQuantity: (productId: number, quantity: number) => void;
  onRemove: (productId: number) => void;
  /** Position in the docket, for the entrance stagger. */
  index?: number;
}

/**
 * One line of the docket: what it is, what it costs at the quantity on order,
 * and the two controls that change it. The unit price is quoted at the current
 * quantity — cross a bulk break and the base price strikes through beside it,
 * so the saving shows where the decision is made rather than in the total.
 *
 * The field never takes the line below one. Emptying it is how you retype a
 * quantity, not how you delete a line — Remove is the only thing that does that.
 */
export function CartLine({ line, issue, onQuantity, onRemove, index = 0 }: CartLineProps) {
  const { currency } = useSettings();
  const [draft, setDraft] = useState(String(line.quantity));
  useEffect(() => setDraft(String(line.quantity)), [line.quantity]);

  const withdrawn = issue?.inactive ?? false;
  const discounted = line.unitPrice < line.basePrice;
  const total = line.unitPrice * line.quantity;

  const type = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    setDraft(digits);
    const next = parseInt(digits, 10);
    if (Number.isFinite(next) && next >= 1) onQuantity(line.productId, next);
  };

  const removeButton = (
    <button
      type="button"
      className={classes.remove}
      onClick={() => onRemove(line.productId)}
      aria-label={`Remove ${line.displayName}`}
    >
      Remove
    </button>
  );

  return (
    <li
      className={`${classes.line} ${withdrawn ? classes.withdrawn : ''} ${rowAnim(index).className}`}
      style={rowAnim(index).style}
    >
      <ProductImage
        productId={line.imageProductId ?? line.productId}
        variant="thumbnail"
        alt=""
        className={classes.thumb}
      />

      <span className={classes.name}>{line.displayName}</span>

      <span className={classes.total}>{formatMoney(total, currency)}</span>

      <span className={classes.meta}>
        {discounted ? (
          <span className={classes.was}>{formatMoney(line.basePrice, currency)}</span>
        ) : null}
        <span className={classes.unit}>{formatMoney(line.unitPrice, currency)}</span>
        <span className={classes.each}>/ea</span>
        {line.isPreorder ? <span className={classes.preorder}>Pre-order</span> : null}
        {issue?.priceChanged ? <span className={classes.chip}>Price updated</span> : null}
      </span>

      {withdrawn ? null : (
        <>
          <span className={classes.qty}>
            <button
              type="button"
              className={classes.step}
              disabled={line.quantity <= 1}
              onClick={() => onQuantity(line.productId, line.quantity - 1)}
              aria-label={`One fewer ${line.displayName}`}
            >
              <MinusIcon size={15} />
            </button>
            <input
              className={classes.input}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              aria-label={`${line.displayName} quantity`}
              value={draft}
              onChange={(e) => type(e.currentTarget.value)}
              onBlur={() => setDraft(String(line.quantity))}
            />
            <button
              type="button"
              className={classes.step}
              onClick={() => onQuantity(line.productId, line.quantity + 1)}
              aria-label={`One more ${line.displayName}`}
            >
              <PlusIcon size={15} />
            </button>
          </span>

          <span className={classes.removeSlot}>{removeButton}</span>
        </>
      )}

      {issue?.inactive ? (
        <span className={`${classes.note} ${classes.gone}`}>
          <span className={classes.noteText}>No longer available — remove to continue</span>
          {removeButton}
        </span>
      ) : issue?.outOfStock ? (
        <span className={`${classes.note} ${classes.short}`}>
          <span className={classes.noteText}>Out of stock</span>
        </span>
      ) : null}
    </li>
  );
}
