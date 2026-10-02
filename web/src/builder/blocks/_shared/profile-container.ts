import { part, type ContainerSpec } from '@/builder/parts.ts';

export const PROFILE_CONTAINER: ContainerSpec = {
  family: 'profile', insertSlot: 'content', required: ['ProfileSignOut'],
  unique: ['ProfileDetails', 'ProfileChannels', 'ProfilePassword', 'ProfileContact', 'ProfileBotSwitch', 'ProfileSignOut'],
  defaultSlots: (_p, { id }) => ({ content: ['ProfileDetails', 'ProfileChannels', 'ProfilePassword', 'ProfileContact', 'ProfileBotSwitch', 'ProfileSignOut'].map((t) => part(t, id)) }),
};
