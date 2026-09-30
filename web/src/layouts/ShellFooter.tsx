import { useSettings } from '@/app/settings.ts';
import { Slot } from '@/templates/runtime.tsx';

/** The template's Footer slot with what both shells hand it. */
export function ShellFooter() {
  const { brand, supportLinks } = useSettings();
  const hasChat = !!(brand.links.whatsapp || brand.links.telegram);
  return <Slot name="Footer" supportLinks={supportLinks} hasChat={hasChat} />;
}
