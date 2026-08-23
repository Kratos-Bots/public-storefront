import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useSettings } from '@/app/settings.ts';
import { mediaUrl } from '@/lib/media-url.ts';
import classes from '@/components/Brand.module.css';

export type BrandSize = 'sm' | 'md' | 'lg';

/** Multiples of the client's `logoHeight` for each slot the mark appears in. */
const SCALE: Record<BrandSize, number> = { sm: 0.72, md: 1, lg: 1.8 };

/** Admin branding logo, served through the Worker's image proxy. */
const ADMIN_LOGO = '/media/settings/branding/logo';

/**
 * The client's mark. Tries the storefront logo, then the admin branding logo,
 * then falls back to the short name as a wordmark — a client with no upload
 * still gets a header that reads as theirs.
 */
export function Brand({ size = 'md' }: { size?: BrandSize }) {
  const { brand } = useSettings();
  const sources = useMemo(
    () => [mediaUrl(brand.logoUrl), ADMIN_LOGO].filter((s): s is string => !!s),
    [brand.logoUrl],
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [brand.logoUrl]);

  const src = sources[attempt];
  const style = { '--brand-h': `calc(var(--sf-logo-h) * ${SCALE[size]})` } as CSSProperties;

  return (
    <span className={classes.root} style={style}>
      {src ? (
        <img
          key={src}
          className={classes.image}
          src={src}
          alt={brand.name}
          draggable={false}
          onError={() => setAttempt((a) => a + 1)}
        />
      ) : (
        <span className={classes.wordmark}>{brand.shortName || brand.name}</span>
      )}
    </span>
  );
}
