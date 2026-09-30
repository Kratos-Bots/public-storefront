import { z } from 'zod';
import { defineBlock, MEDIA_SRC_RE, mediaSrc } from '@/builder/define.ts';
import { useBuilderMode } from '@/builder/mode.ts';
import classes from '@/builder/blocks/Image.module.css';

type Aspect = 'auto' | '1/1' | '4/3' | '16/9';
type Props = { id: string; src: string; alt: string; caption: string; width: 'narrow' | 'rail' | 'full'; aspect: Aspect };

function ImageView({ src, alt, caption, width, aspect }: Omit<Props, 'id'>) {
  const { editing } = useBuilderMode();
  if (!MEDIA_SRC_RE.test(src) || !alt.trim()) {
    return editing ? <p className={classes.hint} data-sf-block="Image">Upload an image and describe it for screen readers.</p> : null;
  }
  return (
    <figure className={`${classes.figure} ${classes[width]}`} data-sf-block="Image">
      <img className={classes.img} src={src} alt={alt} loading="lazy" decoding="async" style={aspect === 'auto' ? undefined : { aspectRatio: aspect }} />
      {caption ? <figcaption className={classes.caption}>{caption}</figcaption> : null}
    </figure>
  );
}

/** Uploaded images only (spec §13 A3); alt text is required before it shows. */
export const block = defineBlock<Props>({
  name: 'Image', label: 'Image', category: 'content', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ src: mediaSrc(), alt: z.string().max(300), caption: z.string().max(300), width: z.enum(['narrow', 'rail', 'full']), aspect: z.enum(['auto', '1/1', '4/3', '16/9']) }),
  defaultProps: { src: '', alt: '', caption: '', width: 'rail', aspect: 'auto' },
  render: ({ src, alt, caption, width, aspect }) => <ImageView src={src} alt={alt} caption={caption} width={width} aspect={aspect} />,
});
