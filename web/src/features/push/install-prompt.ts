// The browser's automatic "install this app" prompt is only wanted when the shop has push on (the install
// is what lets iPhone shoppers receive notifications). Everywhere else it stays out of the way.
// The manifest, icons and meta tags are served to every shop; only the prompt is held back.

let pushEnabled = false;

/** Called with the live `settings.push?.enabled === true` once settings are known. */
export function setInstallPromptAllowed(allowed: boolean): void {
  pushEnabled = allowed;
}

/**
 * Registers the `beforeinstallprompt` listener. Call once, before the first render, because the event can
 * fire before settings arrive (that case is suppressed too: no settings means push is not known to be on).
 * The deferred prompt is deliberately not kept or used.
 */
export function guardInstallPrompt(target: Pick<Window, 'addEventListener'> = window): void {
  target.addEventListener('beforeinstallprompt', (e: Event) => {
    if (!pushEnabled) e.preventDefault();
  });
}
