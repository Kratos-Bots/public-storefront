import type { PartFamily } from '@/builder/parts.ts';
import { BOX, TEXT, type StyleKey, type StyleTarget } from '@/builder/style/model.ts';

const T = (target: StyleTarget, ...groups: ReadonlyArray<readonly StyleKey[]>) => ({ target, keys: groups.flat() });

/** Password sign-in parts (storefront 0.11.0). Keys may be added later, never removed. */
export const PASSWORD_PARTS: Record<string, { family: PartFamily; style: { target: StyleTarget; keys: readonly StyleKey[] } }> = {
  ResetPasswordHeading: { family: 'reset-password', style: T('root', BOX, TEXT) },
  ResetPasswordForm: { family: 'reset-password', style: T('root', BOX) },
};

export const PASSWORD_CONTAINERS: Record<string, PartFamily> = { ResetPassword: 'reset-password' };
