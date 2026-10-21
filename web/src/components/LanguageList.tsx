import { Menu } from '@mantine/core';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { CheckIcon } from '@/components/icons.tsx';
import { chooseLanguage } from '@/text/preference.ts';
import { nativeName } from '@/components/language-name.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/components/LanguageList.module.css';

/**
 * The shopper's language choices, each in its own language, the current one marked. Shared by the header menu's panel and
 * the HeaderLanguage part's dropdown. Choosing the current language does nothing; any other saves the choice and reloads
 * (never in the page builder, where a reload would tear down the editor's frame).
 */
function choose(tag: string, current: boolean) {
  if (!current && !isBuilderMode()) chooseLanguage(tag);
}

/** The same choices as Menu.Items, for inside a Mantine Menu.Dropdown (menuitem roles, arrow-key navigation). */
export function LanguageMenuItems() {
  const { languages, locale } = useText();
  return (
    <>
      {languages.map((tag) => {
        const current = tag === locale;
        return (
          <Menu.Item
            key={tag}
            lang={tag}
            aria-current={current ? 'true' : undefined}
            rightSection={current ? <CheckIcon size={14} /> : null}
            onClick={() => choose(tag, current)}
          >
            {nativeName(tag)}
          </Menu.Item>
        );
      })}
    </>
  );
}

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
              onClick={() => choose(tag, current)}
            >
              {nativeName(tag)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
