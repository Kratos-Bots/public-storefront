import { useSettings } from '@/app/settings.ts';
import type { ReviewSettings } from '@/types/reviews.ts';

const OFF: ReviewSettings = { enabled: false, maxLength: 0 };

/** The shop's review switch; an older backend sends none, which reads as off. */
export function reviewSettingsOf(settings: { reviews?: ReviewSettings } | undefined | null): ReviewSettings {
  const r = settings?.reviews;
  return r && r.enabled ? r : OFF;
}

export function useReviewSettings(): ReviewSettings {
  return reviewSettingsOf(useSettings());
}
