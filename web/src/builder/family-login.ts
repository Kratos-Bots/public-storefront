import { createFamily } from '@/builder/parts.ts';

/** The sign-in page's parts read nothing from the container: the heading and the methods own their data. */
export type LoginData = Record<string, never>;
export const LoginFamily = createFamily<LoginData>('login');
