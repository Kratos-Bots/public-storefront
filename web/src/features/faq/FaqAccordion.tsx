import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { linkify } from '@/features/faq/linkify.ts';
import type { FaqSection } from '@/types/faq.ts';
import classes from '@/features/faq/FaqAccordion.module.css';

/**
 * The shop's FAQ as a ruled list of headings that open one at a time (the first starts open). The Help page owns it:
 * the questions and answers are the ones the owner wrote in the admin.
 */
/** Answers are plain text: line breaks are kept by CSS, and bare web addresses become links (never markup). */
function Answer({ body }: { body: string }) {
  return (
    <p className={classes.answer}>
      {linkify(body).map((part, i) =>
        part.kind === 'link'
          ? <a key={i} className={classes.link} href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>
          : part.text,
      )}
    </p>
  );
}

export function FaqAccordion({ sections }: { sections: FaqSection[] }) {
  const base = useId();
  // `undefined` is "nothing chosen yet": the first section is open. `null` is "the shopper closed it".
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  // Nothing chosen yet, or the chosen section has gone (a refetch removed it): the first is open. Only the shopper's own close leaves all shut.
  const openId = chosen === null ? null : chosen !== undefined && sections.some((s) => s.id === chosen) ? chosen : sections[0]?.id ?? null;
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  // Up / Down / Home / End move between the headings; Tab, Enter and Space need nothing extra from a button.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = sections.length - 1;
    const next = event.key === 'ArrowDown' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowUp' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    buttons.current[next]?.focus();
  };

  return (
    <div className={classes.list} data-sf-part="faq-list">
      {sections.map((section, index) => {
        const open = section.id === openId;
        const buttonId = `${base}-q-${section.id}`;
        const panelId = `${base}-a-${section.id}`;
        return (
          <section key={section.id} className={classes.item} data-open={open ? 'true' : 'false'}>
            <h3 className={classes.question}>
              <button
                ref={(el) => { buttons.current[index] = el; }}
                id={buttonId}
                type="button"
                className={classes.trigger}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setChosen(open ? null : section.id)}
                onKeyDown={(e) => onKeyDown(e, index)}
              >
                <span className={classes.text}>{section.title}</span>
                <span className={classes.mark} aria-hidden />
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={buttonId} className={classes.panel} hidden={!open}>
              <Answer body={section.body} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
