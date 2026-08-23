import classes from '@/components/PageSkeleton.module.css';

export interface PageSkeletonProps {
  /** Drop the header/rail shapes — for a lazy route loading inside a shell that is already painted. */
  inline?: boolean;
}

/** Full-page loading state used before settings resolve, and as the lazy-route fallback. */
export function PageSkeleton({ inline = false }: PageSkeletonProps) {
  return (
    <div className={inline ? classes.inline : classes.root} role="status" aria-label="Loading">
      {inline ? null : (
        <>
          <div className={classes.bar}>
            <span className={classes.block} style={{ width: 120, height: 20 }} />
            <span className={classes.block} style={{ width: 76, height: 20 }} />
          </div>
          <div className={classes.rail} />
        </>
      )}
      <div className={classes.body}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <span key={i} className={`${classes.block} ${classes.card}`} />
        ))}
      </div>
    </div>
  );
}
