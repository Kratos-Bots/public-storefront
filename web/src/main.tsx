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

// Start fetching the last visit's template chunk while settings are still in flight.
prefetchTemplate(readStoredTemplateId());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
