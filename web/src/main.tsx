import '@fontsource-variable/inter/index.css';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@/styles/global.css';
import '@/styles/chassis.css';
import '@/styles/motion.css';
import '@/styles/mantine.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App.tsx';
import { prefetchTemplate } from '@/templates/runtime.tsx';
import { readStoredTemplateId } from '@/app/theme-bridge.ts';
import { bootTelegramSession } from '@/app/telegram-session.ts';
import { loadTelegramSdk } from '@/lib/telegram-webapp.ts';

// Start fetching the last visit's template chunk while settings are still in flight.
prefetchTemplate(readStoredTemplateId());

function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// Inside Telegram the SDK has to be on the page before the first render (the
// shell and the sign-in read it synchronously). Anywhere else this resolves at
// once without touching the network.
void loadTelegramSdk().then(() => {
  // Not awaited: it flips the Telegram status to `pending` synchronously, and the
  // app renders its skeleton until the exchange settles.
  void bootTelegramSession();
  render();
});
