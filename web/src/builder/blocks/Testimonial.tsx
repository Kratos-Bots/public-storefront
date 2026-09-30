import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import classes from '@/builder/blocks/Testimonial.module.css';

type Props = { id: string; quote: string; author: string; detail: string };

export const block = defineBlock<Props>({
  name: 'Testimonial', label: 'Testimonial', category: 'content', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ quote: z.string().min(1).max(600), author: z.string().max(80), detail: z.string().max(120) }),
  defaultProps: { quote: 'Arrived the next morning, packed like it mattered.', author: 'A happy customer', detail: '' },
  // An empty quote (a field that failed validation is left blank) renders nothing.
  render: ({ quote, author, detail }) => !quote.trim() ? null : (
    <figure className={classes.card} data-sf-block="Testimonial">
      <blockquote className={classes.quote}><p>{quote}</p></blockquote>
      {author || detail ? (
        <figcaption className={classes.by}>
          {author ? <span className={classes.author}>{author}</span> : null}
          {detail ? <span className={classes.detail}>{detail}</span> : null}
        </figcaption>
      ) : null}
    </figure>
  ),
});
