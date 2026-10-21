import { chooseLanguage } from '@/text/preference.ts';
import { nativeName } from '@/components/language-name.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/components/LanguageList.module.css';

/**
 * The shopper's language choices, each in its own language, the current one marked. Shared by the header menu's panel and
 * the HeaderLanguage part's dropdown. Choosing the current language does nothing; any other saves the choice and reloads.
 */
export function LanguageList({ className }: { className?: string }) {
  const { languages, locale } = useText();
  return (
    <ul className={className ? `${classes.list} ${className}` : classes.list} data-sf-part="language-list">
      {languages.map((tag) => {
        const current = tag === locale;
        return (
          <li key={tag}>
            <button
              type="button"
              className={classes.item}
              lang={tag}
              aria-current={current ? 'true' : undefined}
              onClick={() => { if (!current) chooseLanguage(tag); }}
            >
              {nativeName(tag)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
