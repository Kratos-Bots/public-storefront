import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { CloseButton } from '@mantine/core';
import { useSettings } from '@/app/settings.ts';
import type { Notice } from '@/types/settings.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/notices/NoticeBanners.module.css';

const STORAGE_KEY = 'sf-dismissed-notices-v1';

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeDismissed(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* private mode — dismissal is then session-only */
  }
}

/** A notice shows when the admin marked it active and we are inside its scheduled window. */
export function isLive(notice: Notice, now: number): boolean {
  if (!notice.active) return false;
  const from = notice.startsAt ? Date.parse(notice.startsAt) : null;
  const until = notice.endsAt ? Date.parse(notice.endsAt) : null;
  if (from !== null && !Number.isNaN(from) && now < from) return false;
  if (until !== null && !Number.isNaN(until) && now > until) return false;
  return true;
}

/** Absent on notices saved before the option existed — those were always dismissible. */
export const isDismissible = (notice: Notice): boolean => notice.dismissible !== false;

/**
 * Publishes the pinned stack's height as `--sf-pin-h` on the root, so everything that sticks
 * under the header (`top: var(--sf-bar-h)`) comes to rest under the notices too.
 */
function usePublishedHeight(ref: RefObject<HTMLElement | null>, active: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!active || !el) return;
    const publish = () => root.style.setProperty('--sf-pin-h', `${el.offsetHeight}px`);
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty('--sf-pin-h');
    };
  }, [ref, active]);
}

export interface NoticeBannersProps {
  /** The pinned notices, rendered inside the sticky header, instead of the ones under it. */
  pinned?: boolean;
}

/**
 * Store-wide announcements. Each shell mounts this twice: `pinned` inside its sticky header, so
 * those notices stay at the top of the screen while the page scrolls, and plain under the header,
 * where the rest scroll away with the page. A dismissible notice is remembered as closed per id
 * across visits; one the store made non-dismissible always shows while it is live.
 */
export function NoticeBanners({ pinned = false }: NoticeBannersProps) {
  const { notices } = useSettings();
  const { t } = useText();
  const [dismissed, setDismissed] = useState(readDismissed);
  const ref = useRef<HTMLElement>(null);

  // Evaluated per render rather than on a timer: a notice's window is re-checked
  // whenever settings refetch (every 30s at most), which is close enough for a banner.
  const now = Date.now();
  const visible = notices.filter(
    (n) => (n.pinned === true) === pinned && isLive(n, now) && !(isDismissible(n) && dismissed.includes(n.id)),
  );
  usePublishedHeight(ref, pinned && visible.length > 0);

  if (visible.length === 0) return null;

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    writeDismissed(next);
  };

  return (
    <aside
      ref={ref}
      aria-label={pinned ? t('notices.banners.pinnedLabel') : t('notices.banners.label')}
      data-sf-part={pinned ? 'pinned-notices' : undefined}
    >
      {visible.map((notice) => (
        <div
          key={notice.id}
          className={`${classes.notice} ${classes[notice.style] ?? classes.info}`}
          data-sf-part="notice"
        >
          <div className={classes.inner}>
            <div className={classes.text}>
              {notice.title ? <p className={classes.title}>{notice.title}</p> : null}
              <p className={classes.body}>{notice.body}</p>
            </div>
            {isDismissible(notice) ? (
              <CloseButton
                size="sm"
                variant="subtle"
                classNames={{ root: classes.close }}
                aria-label={notice.title ? t('notices.banners.dismissTitled', { title: notice.title }) : t('notices.banners.dismiss')}
                onClick={() => dismiss(notice.id)}
              />
            ) : null}
          </div>
        </div>
      ))}
    </aside>
  );
}
