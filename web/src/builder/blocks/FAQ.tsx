import { z } from 'zod';
import { defineBlock, richtext } from '@/builder/define.ts';
import { RichHtml } from '@/builder/blocks/_shared/RichHtml.tsx';
import classes from '@/builder/blocks/FAQ.module.css';

type Item = { question: string; answerHtml: string };
type Props = { id: string; title: string; items: Item[] };

export const block = defineBlock<Props>({
  name: 'FAQ', label: 'FAQ', category: 'content', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({
    title: z.string().max(120),
    items: z.array(z.object({ question: z.string().min(1).max(200), answerHtml: richtext() })).max(30),
  }),
  defaultProps: {
    title: 'Questions',
    items: [{ question: 'How fast do you ship?', answerHtml: '<p>Most orders leave the same working day.</p>' }],
  },
  render: ({ title, items }) => (
    <section className={classes.root} data-sf-block="FAQ">
      {title ? <h2 className={classes.title}>{title}</h2> : null}
      {items.map((item, i) => (
        <details key={i} className={classes.item}>
          <summary className={classes.q}>{item.question}</summary>
          <RichHtml value={item.answerHtml} className={classes.a} />
        </details>
      ))}
    </section>
  ),
});
