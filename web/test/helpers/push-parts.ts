import type { PartFamily } from '@/builder/parts.ts';
import { BOX, TEXT, VIS, type StyleKey, type StyleTarget } from '@/builder/style/model.ts';

const T = (target: StyleTarget, ...groups: ReadonlyArray<readonly StyleKey[]>) => ({ target, keys: groups.flat() });

/** Web push parts (storefront 0.44.0). Keys may be added later, never removed. */
export const PUSH_PARTS: Record<string, { family: PartFamily; style: { target: StyleTarget; keys: readonly StyleKey[] } }> = {
  ProfileNotifications: { family: 'profile', style: T('root', BOX, TEXT, VIS) },
  PushOptIn: { family: 'payment', style: T('root', BOX, VIS) },
};
