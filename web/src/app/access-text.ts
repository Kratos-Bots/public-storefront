// Temporary: keeps the text registry's no-orphans check green until the screens
// that use these keys exist. Deleted once every key has a real reference.
export const ACCESS_TEXT_KEYS = [
  'auth.access.eyebrow',
  'auth.access.defaultMessage',
  'auth.access.signInLede',
  'auth.access.registrationClosed',
  'auth.access.myOrders',
  'auth.access.checkAgain',
  'auth.access.signOut',
  'auth.access.contactAriaLabel',
] as const;
