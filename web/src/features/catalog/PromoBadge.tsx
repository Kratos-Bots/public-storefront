import { badgeParts } from '@/lib/promotions.ts';
import { useText } from '@/text/runtime.tsx';
import type { PromotionTag } from '@/types/cart.ts';
import classes from '@/features/catalog/PromoBadge.module.css';

/**
 * The deal a product (or cart line) is part of, as one tag: the first promotion's label and, when
 * there are more, a "+N" behind it — never a wall of chips. Every label is still reachable: they all
 * sit in the tag's title and accessible name. Nothing when there is no promotion.
 */
export function PromoBadge({ promotions }: { promotions: readonly PromotionTag[] | null | undefined }) {
  const { t } = useText();
  const parts = badgeParts(promotions);
  if (!parts) return null;
  const all = parts.all.join(', ');
  return (
    <span className={classes.badge} data-sf-part="badge" title={all} aria-label={all}>
      <span className={classes.label}>{parts.label}</span>
      {parts.extra > 0 ? <span className={classes.more}>{t('common.promo.more', { count: parts.extra })}</span> : null}
    </span>
  );
}
