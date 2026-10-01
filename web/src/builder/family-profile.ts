import { createFamily } from '@/builder/parts.ts';
import type { Profile } from '@/types/profile.ts';

/** The profile tab's state, owned by `ProfilePage` (spec §5.4). */
export interface ProfileData {
  profile: Profile;
  /** Revokes the session, clears the cart and session stores, then navigates away. */
  signOut(): void;
  signingOut: boolean;
  /** `telegram` inside the Mini App (no sign-out there). */
  surface: 'website' | 'webapp' | 'telegram';
  /** The "talk to us" section applies (web app layout with chat links). */
  showContact: boolean;
  /** The classic-bot switch applies (Telegram beta Mini App). */
  showBotSwitch: boolean;
}
export const ProfileFamily = createFamily<ProfileData>('profile');

/** The editor's fixture for the profile preview states (spec §11.3). */
export interface ProfilePreview { surface: 'website' | 'webapp'; profile?: Profile }
