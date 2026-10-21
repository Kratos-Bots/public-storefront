// TODO(translate)
import type errors from '@/text/keys/errors.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "errors.generic": "Something went wrong",
  "errors.rateLimited": "Too many attempts — please wait a moment and try again",
  "errors.unavailable": "The store is temporarily unavailable",
  "errors.requestFailed": "Request failed",
  "errors.timeout": "The request timed out",
  "errors.network": "Network error",
  "errors.loginRequired": "Please sign in to continue.",
  "errors.accessDenied": "Your account doesn’t have access to this shop.",
  "errors.registrationClosed": "This shop isn’t taking new customers right now.",
} satisfies AreaPack<typeof errors>;
