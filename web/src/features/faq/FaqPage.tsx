import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@mantine/core';
import { useSettings } from '@/app/settings.ts';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { errorMessage } from '@/lib/errors.ts';
import { FADE } from '@/lib/motion.ts';
import { useFaqAvailable } from '@/features/faq/use-faq-available.ts';
import { useFaq } from '@/features/faq/queries.ts';
import { linkify } from '@/features/faq/linkify.ts';
import type { FaqSection } from '@/types/faq.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/faq/FaqPage.module.css';

/**
 * The shop's FAQ: the questions and answers the owner wrote in the admin, as a ruled list of headings that open one at
 * a time (the first starts open). A plain shell page like /reviews and /support, not a page-builder document.
 * When the shop has no FAQ (switched off, or nothing written yet, or an older backend) the page is the empty state
 * rather than a redirect, so a saved link never lands somewhere surprising.
 */
export function FaqPage() {
  const settings = useSettings();
  const { t } = useText();
  const available = useFaqAvailable();
  const query = useFaq(available);

  // The tab says where the shopper is, like a product page's; the shop's own title comes back on the way out.
  const shop = settings.brand.name;
  const brandTitle = settings.brand.title;
  const pageTitle = t('faq.page.title');
  const documentTitle = t('faq.page.documentTitle', { page: pageTitle, shop });
  useEffect(() => {
    document.title = documentTitle;
    return () => { document.title = brandTitle; };
  }, [documentTitle, brandTitle]);

  const empty = (
    <EmptyState as="h1" title={t('faq.page.empty.title')} description={t('faq.page.empty.body')} />
  );
  // Off, the query never starts and `isPending` would stay true forever, so this comes first.
  if (!available) return empty;

  if (query.isPending) {
    return (
      <>
        <h1 className={classes.srOnly}>{pageTitle}</h1>
        <PageSkeleton inline />
      </>
    );
  }
  // A failed background refetch also sets isError; with the list already on screen that is not a failed page.
  if (query.isError && !query.data) {
    return (
      <EmptyState
        as="h1"
        title={t('faq.page.loadFailedTitle')}
        description={errorMessage(query.error, t('faq.page.loadFailedBody'))}
        action={<Button variant="default" size="sm" onClick={() => void query.refetch()}>{t('common.actions.tryAgain')}</Button>}
      />
    );
  }

  const sections = query.data!.sections;
  if (sections.length === 0) return empty;

  return (
    <div className={`${classes.page} ${FADE}`}>
      <header className={classes.masthead}>
        <h1 className={classes.title}>{pageTitle}</h1>
      </header>
      <Accordion sections={sections} />
    </div>
  );
}

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

function Accordion({ sections }: { sections: FaqSection[] }) {
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
            <h2 className={classes.question}>
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
            </h2>
            <div id={panelId} role="region" aria-labelledby={buttonId} className={classes.panel} hidden={!open}>
              <Answer body={section.body} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
