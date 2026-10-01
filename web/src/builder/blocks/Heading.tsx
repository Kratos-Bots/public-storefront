import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { BOX, styleSupport, VIS } from '@/builder/style/model.ts';
import classes from '@/builder/blocks/Heading.module.css';

type Props = { id: string; text: string; eyebrow: string; level: 'h2' | 'h3' | 'h4'; align: 'start' | 'center' };

export const block = defineBlock<Props>({
  name: 'Heading', label: 'Heading', category: 'content', layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, 'fg', 'textSize', ...VIS]),
  schema: z.object({ text: z.string().min(1).max(200), eyebrow: z.string().max(60), level: z.enum(['h2', 'h3', 'h4']), align: z.enum(['start', 'center']) }),
  defaultProps: { text: 'A heading', eyebrow: '', level: 'h2', align: 'start' },
  render: ({ text, eyebrow, level, align, puck }) => {
    if (!text.trim()) return null;
    const Tag = level;
    return (
      <div className={align === 'center' ? `${classes.root} ${classes.center}` : classes.root} data-sf-block="Heading" {...puck.style}>
        {eyebrow ? <p className={classes.eyebrow}>{eyebrow}</p> : null}
        <Tag className={classes[level]}>{text}</Tag>
      </div>
    );
  },
});
