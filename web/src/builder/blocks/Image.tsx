import { z } from 'zod';
import { defineBlock, MEDIA_SRC_RE, mediaSrc } from '@/builder/define.ts';
import type { StyleAttrs } from '@/builder/define.ts';
import { BOX, styleSupport, VIS } from '@/builder/style/model.ts';
import { useBuilderMode } from '@/builder/mode.ts';
import classes from '@/builder/blocks/Image.module.css';

type Aspect = 'auto' | '1/1' | '4/3' | '16/9';
type Props = { id: string; src: string; alt: string; caption: string; width: 'narrow' | 'rail' | 'full'; aspect: Aspect };

function ImageView({ src, alt, caption, width, aspect, styleAttrs }: Omit<Props, 'id'> & { styleAttrs?: StyleAttrs }) {
  const { editing } = useBuilderMode();
  if (!MEDIA_SRC_RE.test(src) || !alt.trim()) {
    return editing ? <p className={classes.hint} data-sf-block="Image" {...styleAttrs}>Upload an image and describe it for screen readers.</p> : null;
  }
  return (
    <figure className={`${classes.figure} ${classes[width]}`} data-sf-block="Image" {...styleAttrs}>
      <img className={classes.img} src={src} alt={alt} loading="lazy" decoding="async" style={aspect === 'auto' ? undefined : { aspectRatio: aspect }} />
      {caption ? <figcaption className={classes.caption}>{caption}</figcaption> : null}
    </figure>
  );
}

/** Uploaded images only (spec §13 A3); alt text is required before it shows. */
export const block = defineBlock<Props>({
  name: 'Image', label: 'Image', category: 'content', layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...VIS], ['maxWidth']),
  schema: z.object({ src: mediaSrc(), alt: z.string().max(300), caption: z.string().max(300), width: z.enum(['narrow', 'rail', 'full']), aspect: z.enum(['auto', '1/1', '4/3', '16/9']) }),
  defaultProps: { src: '', alt: '', caption: '', width: 'rail', aspect: 'auto' },
  render: ({ src, alt, caption, width, aspect, puck }) => <ImageView src={src} alt={alt} caption={caption} width={width} aspect={aspect} styleAttrs={puck.style} />,
});
