import { useState } from 'react';
import { CloseButton } from '@mantine/core';
import { useSettings } from '@/app/settings.ts';
import type { Notice } from '@/types/settings.ts';
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

/** Store-wide announcements, dismissible per notice id and remembered across visits. */
export function NoticeBanners() {
  const { notices } = useSettings();
  const [dismissed, setDismissed] = useState(readDismissed);

  // Evaluated per render rather than on a timer: a notice's window is re-checked
  // whenever settings refetch (every 30s at most), which is close enough for a banner.
  const now = Date.now();
  const visible = notices.filter((n) => isLive(n, now) && !dismissed.includes(n.id));

  if (visible.length === 0) return null;

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    writeDismissed(next);
  };

  return (
    <aside aria-label="Store notices">
      {visible.map((notice) => (
        <div key={notice.id} className={`${classes.notice} ${classes[notice.style] ?? classes.info}`}>
          <div className={classes.inner}>
            <div className={classes.text}>
              {notice.title ? <p className={classes.title}>{notice.title}</p> : null}
              <p className={classes.body}>{notice.body}</p>
            </div>
            <CloseButton
              size="sm"
              variant="subtle"
              classNames={{ root: classes.close }}
              aria-label={notice.title ? `Dismiss: ${notice.title}` : 'Dismiss notice'}
              onClick={() => dismiss(notice.id)}
            />
          </div>
        </div>
      ))}
    </aside>
  );
}
